import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import { currentRoomCallbacks } from "../client/room-callbacks";
import { DoorConnection } from "../client/door-connection";
import { placeCadDoorDefinition } from "../shared/cad-doors";
import { MotionDecoder, MotionEncoder } from "../shared/motion-codec";
import { PROTOCOL_VERSION, FIXED_DT, canonicalInput } from "../shared/netcode";
import { movementFromKeys } from "../shared/controls";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FrameInputBuffer } from "../client/network-input-buffer";
import {
  AuthorityBuffer,
  type ReceivedAuthority,
} from "../client/authority-buffer";
import { NetworkProbe } from "../client/network-probe";
import { NetworkTimeline } from "../client/network-timeline";
import { readWebGpuMainPassTiming } from "../client/gpu-diagnostics";
import { snapshotAcceptedAuthorityDiagnostics } from "../client/game-diagnostics";

const fixtureDoor = placeCadDoorDefinition({id:"fixture-door",buildingId:"b06",floor:"N01",sourceDoorId:"fixture-source",
  renderPartIds:["fixture-leaf"],collisionPartIds:[],hingeModel:{x:0,y:1,z:0},
  closedPose:{position:{x:.5,y:1,z:0},rotationY:0},collider:{halfExtents:{x:.5,y:1,z:.02}},
  openAngle:Math.PI/2,handleModel:{x:.9,y:1,z:0},defaultOpen:false},
  {translation:{x:0,y:0,z:0},yaw:0});
const doorIdentity={worldEpoch:"fixture-room",definitionHash:"a".repeat(64)};

// Execute the actual UI subscriptions, without booting React/WebGL. This catches
// a missing guard on any handler, not only the helper's isolated behavior.
const ui = ts.createSourceFile(
  "ui.tsx",
  readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const app = ui.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "App",
)!;
const declarations = app.body!.statements.flatMap((node) =>
  ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [],
);
const callbackNames = [
  "resetConnectionDiagnostics",
  "disconnectRoom",
  "applyReceivedAuthority",
  "drainAuthorities",
  "syncNetworkStage",
  "bind",
  "connect",
  "reconnect",
  "enter",
  "leave",
];
const callbackSource = callbackNames.map((name) => {
  const declaration = declarations.find(
    (node) => ts.isIdentifier(node.name) && node.name.text === name,
  );
  assert.ok(declaration?.initializer, `App must define ${name}`);
  return `const ${name} = ${declaration.initializer.getText(ui)};`;
});
const startupEffects = app.body!.statements.filter(
  (node): node is ts.ExpressionStatement =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(ui) === "useEffect" &&
    Boolean(
      node.expression.arguments[0]?.getText(ui).includes("await g.start()"),
    ),
);
assert.equal(startupEffects.length, 1, "one actual Game lifecycle effect");
const startupEffect = (startupEffects[0].expression as ts.CallExpression)
  .arguments[0];
const hookNames = ["onInput", "onInputFrame", "onBeforeInputFrame", "onNetworkDiagnostics"];
const hookAssignments: ts.ExpressionStatement[] = [];
function findHookAssignments(node: ts.Node) {
  if (
    ts.isExpressionStatement(node) &&
    ts.isBinaryExpression(node.expression) &&
    node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.expression.left) &&
    node.expression.left.expression.getText(ui) === "g" &&
    hookNames.includes(node.expression.left.name.text)
  )
    hookAssignments.push(node);
  ts.forEachChild(node, findHookAssignments);
}
findHookAssignments(startupEffect);
assert.deepEqual(
  hookAssignments
    .map(
      (node) =>
        (
          (node.expression as ts.BinaryExpression)
            .left as ts.PropertyAccessExpression
        ).name.text,
    )
    .sort(),
  [...hookNames].sort(),
  "each tested hook must be assigned exactly once by the real lifecycle",
);
function compileScript(source: string) {
  return new Script(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
      transformers: {
        before: [
          (context) => (source) => {
            const visit: ts.Visitor = (node) => {
              if (
                ts.isCallExpression(node) &&
                node.expression.kind === ts.SyntaxKind.ImportKeyword &&
                node.arguments[0] &&
                ts.isStringLiteral(node.arguments[0])
              ) {
                const loader =
                  node.arguments[0].text === "./game"
                    ? "testLoadGame"
                    : node.arguments[0].text === "./render-engine"
                      ? "testLoadRenderEngine"
                      : undefined;
                if (loader)
                  return ts.factory.createCallExpression(
                    ts.factory.createIdentifier(loader),
                    undefined,
                    [],
                  );
              }
              return ts.isMetaProperty(node) &&
                node.keywordToken === ts.SyntaxKind.ImportKeyword
                ? ts.factory.createIdentifier("testImportMeta")
                : ts.visitEachChild(node, visit, context);
            };
            return ts.visitNode(source, visit) as ts.SourceFile;
          },
        ],
      },
    }).outputText,
  );
}
const callbacksScript = compileScript(
  [
    ...callbackSource,
    `const installFrameHooks = (g) => { ${hookAssignments.map((node) => node.getText(ui)).join("\n")} };`,
    `({ ${callbackNames.join(",")}, installFrameHooks });`,
  ].join("\n"),
);
const startupScript = compileScript(`(${startupEffect.getText(ui)})()`);
const timingEffect = app.body!.statements.find(
  (node): node is ts.ExpressionStatement => ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) && node.expression.expression.getText(ui) === "useEffect" &&
    Boolean(node.expression.arguments[0]?.getText(ui).includes("const probeTimer")),
)!;
const timingScript = compileScript(`(${(timingEffect.expression as ts.CallExpression).arguments[0].getText(ui)})()`);

const gameSource = ts.createSourceFile(
  "game.ts",
  readFileSync(new URL("../client/game.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const gameClass = gameSource.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === "Game",
)!;
function gameMethod(name: string) {
  const method = gameClass.members.find(
    (node): node is ts.MethodDeclaration =>
      ts.isMethodDeclaration(node) && node.name.getText(gameSource) === name,
  );
  assert.ok(method?.body, `Game must define ${name}`);
  return method;
}
const gamePrinter = ts.createPrinter();
function executableGameMethod(name: string) {
  const method = gameMethod(name);
  // Object-literal harnesses have no TypeScript access modifiers. Preserve the
  // actual parameters/body; only remove private syntax from the source AST.
  return gamePrinter.printNode(
    ts.EmitHint.Unspecified,
    ts.factory.updateMethodDeclaration(
      method,
      method.modifiers?.filter(
        (modifier) => modifier.kind !== ts.SyntaxKind.PrivateKeyword,
      ),
      method.asteriskToken,
      method.name,
      method.questionToken,
      method.typeParameters,
      method.parameters,
      method.type,
      method.body,
    ),
    gameSource,
  );
}
const frame = gameMethod("frame");
const simulationIndex = frame.body!.statements.findIndex(
  (statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    statement.expression.expression.getText(gameSource) ===
      "this.advanceSimulation",
);
assert.ok(simulationIndex >= 0);
// Retain the actual contiguous frame prefix and whole simulation method. Only
// the unrelated render tail is omitted; callback ordering is not reconstructed.
const gameMethodsScript = compileScript(`({
  ${executableGameMethod("capturePreviousCarPose")},
  ${executableGameMethod("updateNetworkPresentation")},
  ${executableGameMethod("advanceSimulation")},
  frame() { ${frame
    .body!.statements.slice(0, simulationIndex + 1)
    .map((node) => node.getText(gameSource))
    .join("\n")} }
})`);

const poseMethodsScript = compileScript(`({
  ${executableGameMethod("capturePreviousCarPose")},
  ${executableGameMethod("pruneDoorPrediction")},
  ${executableGameMethod("reconcile")},
  ${executableGameMethod("advanceSimulation")}
})`);

for (const path of ["simulation", "reconcile"] as const) {
  test(`actual Game ${path} captures one detached fresh car pose at the original boundary`, () => {
    const events: string[] = [];
    const rawPose = {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
    };
    const context = createContext({
      Vector3, Quaternion, FIXED_DT, canonicalInput, movementFromKeys,
      snapshotAcceptedAuthorityDiagnostics,
      sessionDiagnostics: { event() {} },
      performance: { now: () => 1000 },
    });
    const game: any = {
      ...poseMethodsScript.runInContext(context),
      ready: true, disposed: false, network: false, respawnPending: false,
      accumulator: 0, seq: 0, yaw: 0, keys: new Set(),
      localId: "self", lastAuthorityTick: -1,
      previousPosition: new Vector3(90, 80, 70),
      visualOffset: Vector3.Zero(), carSnapshots: [],
      diagnosticNetwork: { authorityPackets: 0, corrections: 0, resyncs: 0 },
      prediction: { states: new Map(), inputs: [], acknowledge() {} },
      predictionDoorRevisions: new Map(),
      snapshots: { remove() {} },
      networkTimeline: { acceptAuthority: () => ({ accepted: true, replay: [], rebase: false }) },
      resetPredictionHistory() {},
      trafficInstant: () => 1234,
      onInputFrame: () => events.push("input-frame"),
    };
    const assertPose = () => {
      const captured = game.previousCarPose;
      assert.ok(captured.position instanceof Vector3);
      assert.ok(captured.rotation instanceof Quaternion);
      assert.notEqual(captured, rawPose);
      assert.notEqual(captured.position, rawPose.position);
      assert.notEqual(captured.rotation, rawPose.rotation);
      assert.deepEqual(captured.position.asArray(), Object.values(rawPose.position));
      assert.deepEqual(captured.rotation.asArray(), Object.values(rawPose.rotation));
    };
    game.actor = {
      position: { x: 10, y: 20, z: 30 }, vehicle: true,
      step() {
        events.push("step");
        assertPose();
        rawPose.position.x += 50;
        rawPose.rotation.w += 0.1;
      },
      restore(state: { position: { x: number; y: number; z: number } }) {
        events.push("restore");
        this.position = { ...state.position };
        rawPose.position.x = state.position.x + 1;
        rawPose.rotation.w = state.position.y + 2;
      },
    };
    game.sim = {
      car: { getVisualPose() {
        events.push("pose");
        assert.deepEqual(game.previousPosition.asArray(), Object.values(game.actor.position));
        return rawPose;
      } },
      tick: () => events.push("tick"),
    };
    let previous: any;
    for (const tick of [1, 2]) {
      events.length = 0;
      if (path === "simulation") game.advanceSimulation(FIXED_DT, 1000);
      else {
        assert.equal(game.reconcile({
          tick, ack: tick, time: 1000, resync: true,
          state: { position: { x: tick * 10, y: 20, z: 30 }, vehicle: true },
        }, 1000), true);
        assertPose();
      }
      assert.deepEqual(events, path === "simulation"
        ? ["pose", "step", "tick", "input-frame"] : ["restore", "pose"]);
      const captured = game.previousCarPose;
      if (previous) {
        assert.notEqual(captured, previous);
        assert.notEqual(captured.position, previous.position);
        assert.notEqual(captured.rotation, previous.rotation);
      }
      const position = captured.position.asArray(), rotation = captured.rotation.asArray();
      rawPose.position.y += 100;
      rawPose.rotation.z += 0.25;
      assert.deepEqual(captured.position.asArray(), position);
      assert.deepEqual(captured.rotation.asArray(), rotation);
      previous = captured;
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function pendingFetch() {
  const response = deferred<any>(),
    body = deferred<any>();
  return {
    response,
    body,
    jsonCalls: 0,
    respond(ok = true) {
      response.resolve({
        ok,
        json: () => {
          this.jsonCalls++;
          return body.promise;
        },
      });
    },
  };
}

class FakeRoom {
  messages = new Map<string, (data: any) => void>();
  leaveListeners: ((code: number) => void)[] = [];
  errorListeners: ((code: number, message?: string) => void)[] = [];
  sent: [string, unknown][] = [];
  leaveRequests: boolean[] = [];
  leaveError?: Error;
  duringLeave?: () => void;
  resolveLeave?: (code: number) => void;

  onMessage(type: string, callback: (data: any) => void) {
    assert.equal(this.messages.has(type), false, `duplicate ${type} listener`);
    this.messages.set(type, callback);
  }
  onLeave(callback: (code: number) => void) {
    this.leaveListeners.push(callback);
  }
  onError(callback: (code: number, message?: string) => void) {
    this.errorListeners.push(callback);
  }
  send(type: string, data?: unknown) {
    this.sent.push([type, data]);
  }
  message(type: string, data: unknown) {
    assert.ok(this.messages.has(type), `missing ${type} listener`);
    this.messages.get(type)!(data);
  }
  error() {
    this.errorListeners.forEach((callback) => callback(4000, "socket error"));
  }
  leave(consented = true) {
    this.leaveRequests.push(consented);
    // Like SDK LEAVE_ROOM: sending does not remove the retained listeners.
    this.duringLeave?.();
    if (this.leaveError) return Promise.reject(this.leaveError);
    return new Promise<number>((resolve) => (this.resolveLeave = resolve));
  }
  close() {
    this.leaveListeners.forEach((callback) => callback(1000));
    this.resolveLeave?.(1000);
  }
}

function fixture() {
  let clockNow = 2000;
  const effects: string[] = [];
  const diagnostics: { kind: string; data: unknown }[] = [];
  const state: Record<string, any> = { messages: [] };
  const refs = {
    room: { current: null as FakeRoom | null },
    connectionAttempt: { current: 0 },
    connectedRef: { current: false },
    networkProbeRef: {
      current: new NetworkProbe({
        now: () => clockNow,
        send: () => {},
        longTasks: () => null,
      }),
    },
    inputBuffer: {
      current: new FrameInputBuffer({
        now: () => 2000,
        canSend: () => true,
        send: () => {},
      }),
    },
    authorityBufferRef: { current: new AuthorityBuffer() },
    bootstrapAuthorityRef: { current: null as ReceivedAuthority | null },
    doorConnectionRef: { current: null as DoorConnection | null },
    playersRef: { current: [] },
    playersById: { current: new Map<string, any>() },
    carState: { current: null },
    idRef: { current: "guest" },
    modeRef: { current: "multi" },
    profileRef: { current: {} },
  };
  const fetches: ReturnType<typeof pendingFetch>[] = [];
  const joins: {
    worldId: string;
    options: unknown;
    result: ReturnType<typeof deferred<FakeRoom>>;
  }[] = [];
  const storage = new Map<string, string>([
    ["strahov.session", "prior-session-token"],
  ]);
  const game: Record<string, any> = {
    ready: true,
    network: true,
    canvas: { dataset: {} },
    localPlayer: { id: "self" },
    networkTimeline: {
      setRtt: (value: number, measuredAt?: number) => {
        state.rttMs = value;
        state.rttMeasuredAt = measuredAt;
      },
      resetRttSelection: () => { state.rttSelectionResets = (state.rttSelectionResets ?? 0) + 1; },
    },
  };
  for (const method of [
    "setLocalId",
    "resetDiagnosticContext",
    "updatePlayers",
    "syncMotion",
    "reconcile",
    "setFound",
    "setCar",
    "setEmote",
    "cancelRespawn",
    "selectTarget",
    "attachDoorTimeline",
  ])
    game[method] = (...args: unknown[]) => {
      if (method === "setLocalId") game.localId = args[0];
      effects.push(`game.${method}`);
      state[`game.${method}`] = args;
      return true;
    };
  const environment: Record<string, any> = {
    exports: {},
    ...refs,
    game: { current: game },
    currentRoomCallbacks,
    DoorConnection,
    CAD_DOOR_DEFINITIONS: [fixtureDoor],
    CAD_DOOR_DEFINITION_HASH: doorIdentity.definitionHash,
    sessionDiagnostics: {
      event: (kind: string, data: unknown = {}) =>
        diagnostics.push({ kind, data: structuredClone(data) }),
    },
    MotionDecoder,
    PROTOCOL_VERSION,
    testImportMeta: { env: {} },
    location: { origin: "http://test.invalid" },
    localizeNotice: (text: string) => text,
    makeDemoEvents: () => [{ id: "guest-demo" }],
    initialActivity: { hunt: [] },
    sessionStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => {
        effects.push("sessionStorage.setItem");
        storage.set(key, value);
      },
    },
    fetch: () => {
      const request = pendingFetch();
      fetches.push(request);
      return request.response.promise;
    },
    Client: class {
      joinById(worldId: string, options: unknown) {
        const result = deferred<FakeRoom>();
        joins.push({ worldId, options, result });
        return result.promise;
      }
    },
    performance: { now: () => clockNow },
    t: (text: string) => text,
    notice: (message: string) => {
      effects.push("notice");
      state.notice = message;
    },
    reward: (name: string) => {
      effects.push("reward");
      state.reward = name;
    },
  };
  for (const name of [
    "Connected",
    "SelfId",
    "Players",
    "Events",
    "Activity",
    "Social",
    "Messages",
    "WorldSelection",
    "Mode",
    "Ready",
    "JournalOpen",
    "EmotesOpen",
    "Busy",
    "Error",
  ]) {
    const key = name[0].toLowerCase() + name.slice(1);
    environment[`set${name}`] = (value: any) => {
      effects.push(`set${name}`);
      state[key] = typeof value === "function" ? value(state[key]) : value;
    };
  }
  const context = createContext(environment);
  const callbacks = callbacksScript.runInContext(context) as {
    resetConnectionDiagnostics: () => void;
    installFrameHooks: (game: Record<string, any>) => void;
    syncNetworkStage: (game: {
      network: boolean;
      canvas: { dataset: Record<string, string> };
    }) => void;
    bind: (room: FakeRoom) => void;
    drainAuthorities: () => void;
    leave: () => void;
    connect: () => Promise<boolean>;
    reconnect: () => Promise<void>;
    enter: (mode: "guest" | "multi") => Promise<void>;
  };
  return {
    ...callbacks,
    ...refs,
    game,
    context,
    environment,
    setClock: (now: number) => {
      clockNow = now;
    },
    beginProbe: () => {
      clockNow = 1970;
      refs.networkProbeRef.current.poll({ enabled: true, ready: true });
      clockNow = 2000;
    },
    state,
    effects,
    diagnostics,
    fetches,
    joins,
    storage,
    snapshot: () =>
      JSON.stringify({
        state,
        effects,
        diagnostics,
        refs: { ...refs, room: undefined },
        players: [...refs.playersById.current],
        canvas: game.canvas,
        stored: [...storage],
      }),
  };
}

function payloads(id = "self") {
  const player = { id, x: 1, y: 2, z: 3, emote: "" };
  return {
    doorSnapshot: {...doorIdentity,revision:0,tick:0,states:[{id:fixtureDoor.id,open:false,revision:0,changedAtTick:0}]},
    doorDelta: {...doorIdentity,revision:1,tick:1,door:{id:fixtureDoor.id,open:true,revision:1,changedAtTick:1}},
    doorResult: {...doorIdentity,status:"rejected",reason:"occupied",requestId:1,revision:1},
    welcome: { id, players: [player], events: [], activity: { hunt: [] } },
    presence: [player],
    motion: new MotionEncoder().encode({
      time: 1000,
      tick: 1,
      rows: [[id, 5, 2, 3, 0.1, 1, 0, 0, "outside", true]],
    }),
    authoritative: {
      ack: 1,
      tick: 1,
      inputEpoch: 1,
      inputTickBase: 0,
      receivedSeq: 1,
      time: 1000,
      state: { position: { x: 5, y: 2, z: 3 } },
    },
    events: [{ id: "private-event" }],
    social: { contacts: ["friend"], requests: [], blocked: [], attendance: [] },
    activity: { hunt: ["found-marker"] },
    notice: "multiplayer notice",
    reward: "multiplayer reward",
    car: { id: "campus-car" },
    chat: { id: "message", text: "multiplayer chat" },
    emote: { id, emote: "wave" },
    networkProbe: { nonce: 1, serverTick: 120, serverTimeMs: 1000 },
  };
}

function dispatchMessages(room: FakeRoom) {
  const messages = payloads();
  messages.motion.s = 100;
  assert.deepEqual(
    [...room.messages.keys()].sort(),
    Object.keys(messages).sort(),
  );
  for (const [type, data] of Object.entries(messages)) room.message(type, data);
  // A sequence gap must not request recovery through an obsolete socket.
  room.message("motion", { v: 1, s: 102, t: 1100, n: 3, p: 1, r: [] });
}

test("every current room UI subscription still applies its message", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  ui.beginProbe();
  for (const [type, data] of Object.entries(payloads())) {
    ui.effects.length = 0;
    room.message(type, data);
    if (type === "networkProbe")
      assert.equal(
        ui.networkProbeRef.current.snapshot().predictionRoundTripMs,
        30,
      );
    else
      assert.ok(
        ui.effects.length > 0,
        `${type} must reach the current UI/Game`,
      );
  }
  assert.equal(ui.playersById.current.get("self").x, 5);
  assert.equal(ui.playersById.current.get("self").emote, "wave");
  room.error();
  assert.equal(ui.state.notice, "socket error");
  room.message("motion", { v: 1, s: 3, t: 1100, n: 3, p: 1, r: [] });
  assert.deepEqual(room.sent, [["motionResync", undefined]]);
  assert.deepEqual(
    ui.diagnostics,
    [
      { kind: "network-connected", data: {} },
      {
        kind: "network-round-trip",
        data: {
          nonce: 1,
          roundTripMs: 30,
          rawRoundTripMs: 30,
          measuredAt: 2000,
          contaminated: false,
          blockedOverlapMs: 0,
          overlappingLongTasks: 0,
          longTaskCoverage: "unavailable",
          acceptedForPrediction: true,
          predictionRoundTripMs: 30,
          serverTick: 120,
          serverTimeMs: 1000,
          scope:
            "raw includes scheduling; only uncontaminated samples feed prediction",
        },
      },
      { kind: "network-error", data: { code: 4000, message: "socket error" } },
      { kind: "network-keyframe-request", data: {} },
    ],
    "diagnostics contain technical events without message or presence payloads",
  );
});

test("a game installed after welcome inherits the live connection and a guest stays offline", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  room.message("welcome", payloads().welcome);
  const laterGame = {
    network: true,
    canvas: { dataset: {} as Record<string, string> },
  };
  ui.syncNetworkStage(laterGame);
  assert.equal(laterGame.canvas.dataset.networkStage, "connected");
  const guest = {
    network: false,
    canvas: { dataset: {} as Record<string, string> },
  };
  ui.syncNetworkStage(guest);
  assert.equal(guest.canvas.dataset.networkStage, "offline");
  ui.connectedRef.current = false;
  ui.syncNetworkStage(laterGame);
  assert.equal(laterGame.canvas.dataset.networkStage, "connecting");
});

test("leave invalidates before the handshake and all retained callbacks remain inert in menu/guest", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  room.message("welcome", payloads().welcome);
  room.duringLeave = () => {
    assert.equal(ui.room.current, null);
    assert.equal(ui.connectedRef.current, false);
    const before = ui.snapshot();
    dispatchMessages(room);
    room.error();
    room.close();
    assert.equal(
      ui.snapshot(),
      before,
      "even synchronous leave callbacks must be ignored",
    );
  };
  ui.leave();
  assert.equal(ui.state.mode, "menu");
  assert.equal(ui.state.messages.length, 0);
  assert.equal(ui.state.social.contacts.length, 0);
  assert.equal(room.messages.size, 16, "transport still retains all old and door listeners");
  for (const mode of ["menu", "guest"]) {
    ui.modeRef.current = mode;
    const before = ui.snapshot();
    dispatchMessages(room);
    room.error();
    room.close();
    assert.equal(
      ui.snapshot(),
      before,
      `late callbacks must not affect ${mode}`,
    );
    assert.equal(ui.room.current, null);
  }
  assert.equal(room.sent.length, 0);
});

test("replaced room cannot alter the current session, emit notices/rewards, or request motion recovery", () => {
  const ui = fixture(),
    oldRoom = new FakeRoom(),
    newRoom = new FakeRoom();
  ui.bind(oldRoom);
  dispatchMessages(oldRoom);
  ui.bind(newRoom);
  newRoom.message("welcome", payloads("new-self").welcome);
  const before = ui.snapshot(),
    oldSent = oldRoom.sent.length;
  dispatchMessages(oldRoom);
  oldRoom.error();
  oldRoom.close();
  assert.equal(ui.snapshot(), before);
  assert.equal(ui.room.current, newRoom);
  assert.equal(ui.connectedRef.current, true);
  assert.equal(oldRoom.sent.length, oldSent);
  // A new socket accepts sequence 1 even after the old one reached sequence 100.
  newRoom.message("motion", payloads("new-self").motion);
  assert.equal(ui.playersById.current.get("new-self").x, 5);
  newRoom.message("chat", { text: "new session" });
  assert.equal(ui.state.messages.at(-1).text, "new session");
  newRoom.error();
  assert.equal(ui.state.notice, "socket error");
});

test("current onLeave disconnects once and ignores subsequent retained messages and errors", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  dispatchMessages(room);
  room.close();
  assert.equal(ui.room.current, null);
  assert.equal(ui.connectedRef.current, false);
  assert.equal(ui.inputBuffer.current.snapshot().queued, 0);
  assert.equal(ui.playersRef.current.length, 0);
  assert.equal(ui.playersById.current.size, 0);
  assert.equal(ui.bootstrapAuthorityRef.current, null);
  assert.equal(ui.authorityBufferRef.current.snapshot().pending, false);
  assert.ok(ui.effects.includes("game.cancelRespawn"));
  const before = ui.snapshot();
  dispatchMessages(room);
  room.error();
  room.close();
  assert.equal(ui.snapshot(), before);
});

async function advanceToJoin(
  ui: ReturnType<typeof fixture>,
  request = 0,
  id = "joined-self",
) {
  ui.fetches[request].respond();
  ui.fetches[request].body.resolve({
    id,
    token: `token-${id}`,
    worldId: "shared-world",
  });
  await setImmediate();
  assert.equal(ui.joins.length, request + 1);
}

test("a current multiplayer entry commits identity and token only after its join succeeds", async () => {
  const ui = fixture(),
    room = new FakeRoom();
  const entering = ui.enter("multi");
  await advanceToJoin(ui);
  assert.equal(ui.idRef.current, "guest");
  assert.equal(ui.storage.get("strahov.session"), "prior-session-token");
  assert.equal(ui.effects.includes("game.setLocalId"), false);
  ui.joins[0].result.resolve(room);
  await entering;
  assert.equal(ui.room.current, room);
  assert.equal(ui.idRef.current, "joined-self");
  assert.equal(ui.storage.get("strahov.session"), "token-joined-self");
  assert.equal(ui.state.mode, "multi");
  assert.equal(ui.state.busy, false);
  assert.equal(room.messages.size, 16);
});

test("leave then guest cancels a pending session fetch without reading its body or joining", async () => {
  const ui = fixture();
  const pending = ui.reconnect();
  ui.leave();
  await ui.enter("guest");
  const before = ui.snapshot();
  ui.fetches[0].respond();
  await pending;
  assert.equal(ui.snapshot(), before);
  assert.equal(ui.fetches[0].jsonCalls, 0);
  assert.equal(ui.joins.length, 0);
  assert.equal(ui.room.current, null);
  assert.equal(ui.state.mode, "guest");
});

test("direct guest entry cancels an in-flight session body before identity or join mutation", async () => {
  const ui = fixture();
  const pending = ui.enter("multi");
  ui.fetches[0].respond();
  await setImmediate();
  assert.equal(ui.fetches[0].jsonCalls, 1);
  await ui.enter("guest");
  const before = ui.snapshot();
  ui.fetches[0].body.resolve({
    id: "late",
    token: "late-token",
    worldId: "shared-world",
  });
  await pending;
  assert.equal(ui.snapshot(), before);
  assert.equal(ui.joins.length, 0);
  assert.equal(ui.state.mode, "guest");
});

test("a join resolving after leave and guest entry closes its room without rebinding or effects", async () => {
  const ui = fixture(),
    lateRoom = new FakeRoom();
  const pending = ui.enter("multi");
  await advanceToJoin(ui);
  ui.leave();
  await ui.enter("guest");
  const before = ui.snapshot();
  ui.joins[0].result.resolve(lateRoom);
  await pending;
  assert.equal(ui.snapshot(), before);
  assert.deepEqual(lateRoom.leaveRequests, [false]);
  assert.equal(lateRoom.messages.size, 0);
  assert.equal(ui.room.current, null);
  assert.equal(ui.state.mode, "guest");
});

test("the newest overlapping connection wins and a late older join cannot replace it", async () => {
  const ui = fixture(),
    oldRoom = new FakeRoom(),
    newRoom = new FakeRoom();
  const first = ui.connect();
  await advanceToJoin(ui, 0, "old-self");
  const second = ui.connect();
  await advanceToJoin(ui, 1, "new-self");
  ui.joins[1].result.resolve(newRoom);
  assert.equal(await second, true);
  const before = ui.snapshot();
  ui.joins[0].result.resolve(oldRoom);
  assert.equal(await first, false);
  assert.equal(ui.snapshot(), before);
  assert.equal(ui.room.current, newRoom);
  assert.equal(ui.idRef.current, "new-self");
  assert.equal(ui.storage.get("strahov.session"), "token-new-self");
  assert.deepEqual(oldRoom.leaveRequests, [false]);
  assert.equal(oldRoom.messages.size, 0);
  newRoom.message("notice", "current session still works");
  assert.equal(ui.state.notice, "current session still works");
});

test("an accepted replacement invalidates old callbacks before closing the previous live room", async () => {
  const ui = fixture(),
    oldRoom = new FakeRoom(),
    newRoom = new FakeRoom();
  ui.bind(oldRoom);
  dispatchMessages(oldRoom);
  oldRoom.duringLeave = () => {
    assert.equal(ui.room.current, newRoom);
    const before = ui.snapshot();
    dispatchMessages(oldRoom);
    oldRoom.error();
    oldRoom.close();
    assert.equal(ui.snapshot(), before);
  };
  const pending = ui.reconnect();
  await advanceToJoin(ui, 0, "replacement");
  ui.joins[0].result.resolve(newRoom);
  await pending;
  assert.equal(ui.room.current, newRoom);
  assert.equal(ui.connectedRef.current, true);
  assert.deepEqual(oldRoom.leaveRequests, [false]);
  assert.deepEqual(newRoom.leaveRequests, []);
});

test("enter cannot restore multiplayer when leave/guest runs between connect and enter continuations", async () => {
  const ui = fixture(),
    room = new FakeRoom();
  let afterGuest = "",
    scheduled = false;
  const subscribe = room.onMessage.bind(room);
  room.onMessage = (type, callback) => {
    subscribe(type, callback);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      ui.leave();
      void ui.enter("guest");
      afterGuest = ui.snapshot();
    });
  };
  const entering = ui.enter("multi");
  await advanceToJoin(ui);
  ui.joins[0].result.resolve(room);
  await entering;
  assert.notEqual(afterGuest, "");
  assert.equal(ui.snapshot(), afterGuest);
  assert.equal(ui.state.mode, "guest");
  assert.equal(ui.room.current, null);
});

test("a rejected close remains harmless after explicit leave or a cancelled join", async () => {
  const ui = fixture(),
    current = new FakeRoom(),
    stale = new FakeRoom();
  current.leaveError = new Error("already closed");
  stale.leaveError = new Error("already closed stale join");
  ui.bind(current);
  ui.leave();
  const pending = ui.connect();
  await advanceToJoin(ui);
  ui.leave();
  const before = ui.snapshot();
  ui.joins[0].result.resolve(stale);
  assert.equal(await pending, false);
  await setImmediate();
  assert.equal(ui.snapshot(), before);
  assert.equal(ui.room.current, null);
});

test("cancelled fetch/json/join rejections cannot display an entry error or reconnect notice", async () => {
  for (const action of ["enter", "reconnect"] as const) {
    for (const stage of ["fetch", "json", "join"] as const) {
      const ui = fixture();
      const pending = action === "enter" ? ui.enter("multi") : ui.reconnect();
      if (stage === "json") {
        ui.fetches[0].respond();
        await setImmediate();
      } else if (stage === "join") await advanceToJoin(ui);
      ui.leave();
      await ui.enter("guest");
      const before = ui.snapshot();
      const rejected =
        stage === "fetch"
          ? ui.fetches[0].response
          : stage === "json"
            ? ui.fetches[0].body
            : ui.joins[0].result;
      rejected.reject(new Error(`cancelled ${stage}`));
      await pending;
      assert.equal(ui.snapshot(), before, `${action}/${stage} must be inert`);
    }
  }
});

test("current connection failures still reach entry and reconnect feedback", async () => {
  const entry = fixture();
  const entering = entry.enter("multi");
  entry.fetches[0].response.reject(new Error("current entry failure"));
  await entering;
  assert.ok(entry.state.error.includes("Multiplayer se nepřipojil"));
  assert.equal(entry.state.busy, false);
  const reconnect = fixture();
  const connecting = reconnect.reconnect();
  reconnect.fetches[0].response.reject(new Error("current reconnect failure"));
  await connecting;
  assert.equal(reconnect.state.notice, "Error: current reconnect failure");
});

test("authority callback rejects stale epoch before acknowledging queued inputs and retains arrival time", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  const data = {
    ...payloads().authoritative,
    inputEpoch: 2,
    inputTickBase: 40,
    tick: 50,
    ack: 10,
  };
  room.message("authoritative", data);
  assert.equal(ui.state["game.reconcile"][1], 2000);
  assert.equal(ui.inputBuffer.current.snapshot().lastAck, 10);
  const before = JSON.stringify(ui.state["game.reconcile"]);
  room.message("authoritative", { ...data, inputEpoch: 1, tick: 60, ack: 20 });
  room.message("authoritative", { ...data, inputTickBase: 41 });
  room.message("authoritative", data);
  assert.equal(
    JSON.stringify(ui.state["game.reconcile"]),
    before,
    "old epoch, invalid frontier and duplicate authority are inert before transport acknowledgement",
  );
  assert.equal(ui.inputBuffer.current.snapshot().lastAck, 10);
  assert.equal(ui.authorityBufferRef.current.snapshot().rejected, 3);
});

test("ordinary authority backlog is applied once per frame using original arrival time, while barriers stay immediate", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  const first = {
    ...payloads().authoritative,
    tick: 100,
    inputTickBase: 100,
    ack: 0,
  };
  room.message("authoritative", first);
  for (let ack = 1; ack <= 80; ack++) {
    ui.setClock(2000 + ack * 50);
    room.message("authoritative", { ...first, tick: 100 + ack, ack });
  }
  assert.equal(
    ui.effects.filter((effect) => effect === "game.reconcile").length,
    1,
  );
  ui.setClock(6500);
  ui.drainAuthorities();
  assert.equal(
    ui.effects.filter((effect) => effect === "game.reconcile").length,
    2,
  );
  assert.equal(ui.state["game.reconcile"][0].ack, 80);
  assert.equal(
    ui.state["game.reconcile"][1],
    6000,
    "frame execution cannot refresh a packet's arrival timestamp",
  );
  assert.equal(ui.inputBuffer.current.snapshot().lastAck, 80);
  assert.equal(ui.authorityBufferRef.current.snapshot().superseded, 79);
  room.message("authoritative", { ...first, tick: 181, ack: 81 });
  room.message("authoritative", {
    ...first,
    inputEpoch: 2,
    inputTickBase: 181,
    tick: 181,
    ack: 0,
    resync: true,
    respawn: true,
  });
  assert.equal(ui.state["game.reconcile"][0].respawn, true);
  const applied = ui.effects.filter(
    (effect) => effect === "game.reconcile",
  ).length;
  ui.drainAuthorities();
  assert.equal(
    ui.effects.filter((effect) => effect === "game.reconcile").length,
    applied,
    "superseded ordinary state cannot follow a forced barrier",
  );
});

test("bootstrap authority is retained until physics is ready and multiplayer state never drains into a guest", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  ui.game.ready = false;
  const first = { ...payloads().authoritative, resync: true };
  room.message("authoritative", first);
  room.message("authoritative", { ...first, resync: false, tick: 2, ack: 2 });
  ui.drainAuthorities();
  assert.equal(ui.effects.filter((e) => e === "game.reconcile").length, 0);
  assert.ok(ui.bootstrapAuthorityRef.current);
  ui.game.ready = true;
  ui.drainAuthorities();
  assert.equal(ui.effects.filter((e) => e === "game.reconcile").length, 2);
  room.message("authoritative", { ...first, resync: false, tick: 3, ack: 3 });
  ui.leave();
  ui.modeRef.current = "guest";
  ui.game.network = false;
  const before = JSON.stringify(ui.state["game.reconcile"]);
  ui.drainAuthorities();
  assert.equal(JSON.stringify(ui.state["game.reconcile"]), before);
  assert.equal(ui.bootstrapAuthorityRef.current, null);
  assert.equal(ui.authorityBufferRef.current.snapshot().pending, false);
});

test("the actual probe callback logs main-thread contamination without feeding it into prediction", () => {
  const ui = fixture(),
    room = new FakeRoom();
  ui.bind(room);
  let now = 1970;
  const tasks: { startTime: number; duration: number }[] = [];
  ui.networkProbeRef.current = new NetworkProbe({
    now: () => now,
    send: () => {},
    longTasks: () => ({ takeRecords: () => tasks.splice(0), disconnect() {} }),
  });
  ui.networkProbeRef.current.poll({ enabled: true, ready: true });
  now = 2000;
  room.message("networkProbe", payloads().networkProbe);
  assert.equal(ui.state.rttMs, 30);
  assert.equal(ui.state.rttMeasuredAt, 2000);
  now = 4000;
  ui.networkProbeRef.current.poll({ enabled: true, ready: true });
  tasks.push({ startTime: 4010, duration: 990 });
  now = 5000;
  room.message("networkProbe", { ...payloads().networkProbe, nonce: 2 });
  assert.equal(ui.state.rttMs, 30);
  assert.equal(ui.state.rttMeasuredAt, 2000, "contamination cannot refresh planner confidence");
  const event = ui.diagnostics
    .filter((e) => e.kind === "network-round-trip")
    .at(-1)!.data as any;
  assert.equal(event.roundTripMs, 1000);
  assert.equal(event.blockedOverlapMs, 990);
  assert.equal(event.acceptedForPrediction, false);
});

for (const transition of ["rebind", "close", "leave"] as const) {
  test(`actual UI ${transition} discards same-identity timing confidence without replacing the timeline`, () => {
    const ui = fixture(), room = new FakeRoom(), timeline = new NetworkTimeline();
    ui.game.networkTimeline = timeline;
    ui.bind(room);
    ui.beginProbe();
    room.message("networkProbe", payloads().networkProbe);
    assert.equal(timeline.snapshot().rttMeasuredAtMs, 2000);
    timeline.acceptAuthority({ inputEpoch: 1, inputTickBase: 0, tick: 0, ack: 0, time: 0 }, 2000, { vehicle: false, yaw: 0 });
    ui.setClock(3050);
    ui.networkProbeRef.current.poll({ enabled: true, ready: true });
    ui.setClock(3550);
    room.message("networkProbe", { ...payloads().networkProbe, nonce: 2 });
    assert.equal(timeline.snapshot().rttMs, 30);
    assert.equal(timeline.snapshot().pendingRttMs, 500);
    const before = timeline.snapshot();
    const diagnosticResets = ui.effects.filter((effect) => effect === "game.resetDiagnosticContext").length;
    if (transition === "rebind") ui.bind(new FakeRoom());
    else if (transition === "close") room.close();
    else ui.leave();
    assert.equal(ui.effects.filter((effect) => effect === "game.resetDiagnosticContext").length, diagnosticResets + 1);
    assert.equal(ui.game.networkTimeline, timeline);
    assert.equal(timeline.snapshot().inputEpoch, before.inputEpoch);
    assert.equal(timeline.snapshot().clockSeqAtAnchor, before.clockSeqAtAnchor);
    assert.equal(timeline.snapshot().rttMs, 500);
    assert.equal(timeline.snapshot().pendingRttMs, null);
    assert.equal(timeline.snapshot().supportedRttMeasuredAtMs, null);
    const after = timeline.snapshot();
    room.message("networkProbe", { ...payloads().networkProbe, nonce: 2 });
    assert.equal(ui.effects.filter((effect) => effect === "game.resetDiagnosticContext").length, diagnosticResets + 1, "stale room cannot mutate diagnostic lifecycle");
    assert.deepEqual(timeline.snapshot(), after, "obsolete room callback cannot restore confidence");
    assert.equal(timeline.setRtt(500, 3600), true);
    assert.equal(timeline.snapshot().pendingRttMs, null, "new connection starts conservatively");
  });
}

test("actual UI transport diagnostics require the current connected multiplayer room", () => {
  const ui = fixture();
  ui.installFrameHooks(ui.game);
  assert.equal(ui.game.onNetworkDiagnostics(), null);
  const room = new FakeRoom();
  ui.bind(room);
  assert.ok(ui.game.onNetworkDiagnostics().sender);
  ui.modeRef.current = "guest";
  assert.equal(ui.game.onNetworkDiagnostics(), null);
  ui.modeRef.current = "multi";
  ui.connectedRef.current = false;
  assert.equal(ui.game.onNetworkDiagnostics(), null);
  ui.connectedRef.current = true;
  ui.leave();
  assert.equal(ui.game.onNetworkDiagnostics(), null);
  assert.equal(ui.diagnostics.at(-1)?.kind, "network-left");
});

test("actual UI connection timer cleanup resets diagnostic context without replacing prediction", () => {
  const ui = fixture();
  const timeline = ui.game.networkTimeline;
  let nextTimer = 0;
  const cleared: number[] = [];
  Object.assign(ui.environment, { connected: true, setInterval: () => ++nextTimer, clearInterval: (id: number) => cleared.push(id) });
  const cleanup = timingScript.runInContext(ui.context) as () => void;
  cleanup();
  assert.deepEqual(cleared, [1, 2]);
  assert.equal(ui.game.networkTimeline, timeline);
  assert.equal(ui.effects.filter((effect) => effect === "game.resetDiagnosticContext").length, 1);
});

for (const boundary of ["bind", "room-close", "leave", "identity-change", "timer-cleanup"] as const) {
  test(`actual UI ${boundary} resets probe, timing confidence and frame context in order`, async () => {
    const ui = fixture(), room = new FakeRoom();
    ui.bind(room);
    const order: string[] = [];
    const probe = ui.networkProbeRef.current;
    const resetProbe = probe.reset;
    probe.reset = function () { order.push("probe"); resetProbe.call(this); };
    ui.game.networkTimeline.resetRttSelection = () => order.push("timeline");
    ui.game.resetDiagnosticContext = () => order.push("context");
    if (boundary === "bind") ui.bind(new FakeRoom());
    else if (boundary === "room-close") room.close();
    else if (boundary === "leave") ui.leave();
    else if (boundary === "timer-cleanup") {
      Object.assign(ui.environment, { connected: true, setInterval: () => 1, clearInterval() {} });
      const cleanup = timingScript.runInContext(ui.context) as () => void;
      cleanup();
    } else {
      const connecting = ui.connect();
      await advanceToJoin(ui);
      ui.joins[0].result.resolve(new FakeRoom());
      assert.equal(await connecting, true);
    }
    const expected = ["probe", "timeline", "context"];
    assert.deepEqual(order, boundary === "identity-change" ? [...expected, ...expected] : expected);
  });
}

test("actual UI diagnostic reset resolves each current owner without retaining previous refs", () => {
  const ui = fixture();
  const order: string[] = [];
  const finalOwner = {
    resetDiagnosticContext: () => order.push("current context"),
  };
  const nextOwner = {
    networkTimeline: { resetRttSelection() {
      order.push("current timeline");
      ui.environment.game.current = finalOwner;
    } },
  };
  ui.environment.game.current = {
    networkTimeline: { resetRttSelection: () => assert.fail("stale timeline") },
    resetDiagnosticContext: () => assert.fail("stale context"),
  };
  ui.networkProbeRef.current = { reset() {
    order.push("current probe");
    ui.environment.game.current = nextOwner;
  } } as NetworkProbe;
  ui.resetConnectionDiagnostics();
  assert.deepEqual(order, ["current probe", "current timeline", "current context"]);
  ui.networkProbeRef.current = null as unknown as NetworkProbe;
  ui.environment.game.current = null;
  assert.doesNotThrow(() => ui.resetConnectionDiagnostics());
  assert.equal(order.length, 3);
});

test("actual UI hook assignments drain authority before Game simulation and flush its generated input afterward", (t) => {
  const f = fixture();
  const room = new FakeRoom();
  f.bind(room);
  const authority = payloads().authoritative;
  room.message("authoritative", {
    ...authority,
    ack: 0,
    tick: 0,
    receivedSeq: 0,
  });
  room.message("authoritative", { ...authority, time: 1000 + FIXED_DT * 1000 });
  assert.equal(f.authorityBufferRef.current.snapshot().pending, true);
  Object.assign(f.environment, {
    // This legacy frame-order fixture has no CAD colliders; actual populated
    // door prediction is exercised separately in cad-game-doors.test.ts.
    CAD_DOOR_DEFINITIONS: [],
    Vector3,
    Quaternion,
    FIXED_DT,
    canonicalInput,
    movementFromKeys,
    document: { hidden: false },
    vehicleCameraCanFollow: () => false,
    readWebGpuMainPassTiming,
  });
  Object.assign(f.game, gameMethodsScript.runInContext(f.context), {
    ready: true,
    disposed: false,
    respawnPending: false,
    accumulator: 0,
    keys: new Set(["KeyW"]),
    yaw: 0,
    seq: 1,
    previousPosition: Vector3.Zero(),
    engine: { getDeltaTime: () => FIXED_DT * 1000 },
    engineInstrumentation: { captureGPUFrameTime: false },
    adaptive: { update: () => ({}) },
    applyAdaptiveQuality() {},
    actor: {
      position: { x: 0, y: 0, z: 0 },
      vehicle: false,
      speed: 0,
      step: () => f.effects.push("actor.step"),
      capture: () => ({}),
    },
    sim: {
      car: {
        getVisualPose: () => ({
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        }),
      },
      tick: () => f.effects.push("sim.tick"),
    },
    prediction: { push() {} },
    networkTimeline: {
      advance(
        _now: number,
        make: (seq: number) => object,
        apply: (step: object) => void,
      ) {
        apply({
          input: { ...make(2), inputEpoch: 1 },
          source: "input",
          time: 1000,
        });
        return {
          status: "advanced",
          steps: 1,
          targetSeq: 2,
          remaining: 0,
          presentation: { inputEpoch: 1, currentSeq: 2, alpha: 0 },
        };
      },
    },
  });
  f.installFrameHooks(f.game);
  const sender = f.inputBuffer.current;
  const flush = sender.flush.bind(sender);
  t.mock.method(
    sender,
    "flush",
    (source: Parameters<FrameInputBuffer["flush"]>[0]) => {
      f.effects.push(`sender.flush:${source}`);
      return flush(source);
    },
  );
  f.effects.length = 0;
  f.game.frame();
  assert.deepEqual(f.effects, [
    "game.reconcile",
    "actor.step",
    "sim.tick",
    "sender.flush:frame",
  ]);
  assert.equal(f.state["game.reconcile"][0].ack, 1);
  assert.equal(sender.snapshot().sentInputs, 1);
  assert.equal(sender.snapshot().queued, 0);
});

for (const outcome of [
  "success",
  "failure",
  "cancel-success",
  "cancel-failure",
] as const) {
  test(`actual Game lifecycle emits game-ready only after successful uncancelled start: ${outcome}`, async () => {
    const f = fixture();
    const starting = deferred<void>();
    const game = f.game;
    let starts = 0;
    let engineDisposals = 0;
    let initializationSignal: AbortSignal | undefined;
    const engine = {
      isWebGPU: false,
      dispose() {
        engineDisposals++;
      },
    };
    Object.assign(game, {
      ready: false,
      renderHealth: { snapshot: () => ({ valid: game.ready, firstErrors: [] }) },
      // Game constructs its Scene before start; UI may inspect its inventory.
      scene: { meshes: [], materials: [] },
      setQuality() {},
      setTargetFps() {},
      start: async () => {
        starts++;
        await starting.promise;
        game.ready = true;
      },
      dispose: () => {
        if (game.disposed) return;
        game.disposed = true;
        engine.dispose();
      },
    });
    Object.assign(f.environment, {
      AbortController,
      testLoadGame: async () => ({
        Game: class {
          constructor(canvas: unknown, _profile: unknown, prepared: unknown) {
            assert.equal(canvas, game.canvas);
            assert.equal(prepared, engine);
            return game;
          }
        },
      }),
      testLoadRenderEngine: async () => ({
        createGameEngine: async (
          canvas: unknown,
          { signal }: { signal: AbortSignal },
        ) => {
          assert.equal(canvas, game.canvas);
          assert.equal(signal.aborted, false);
          initializationSignal = signal;
          return engine;
        },
      }),
      getRendererInfo: (candidate: unknown) => {
        assert.equal(candidate, engine);
        return { renderer: "fixture", vendor: "fixture", version: "fixture" };
      },
      mode: "multi",
      canvas: { current: game.canvas },
      lightingPreviewRef: { current: { instant: null } },
      weatherRef: { current: null },
      userBenchmark: { current: false },
      quality: "medium",
      targetFps: 60,
      activity: { hunt: [] },
      setStats() {},
    });
    const cleanup = startupScript.runInContext(f.context) as () => void;
    const readyEvents = () =>
      f.diagnostics.filter((event) => event.kind === "game-ready");
    await setImmediate();
    assert.equal(starts, 1, "actual lifecycle must reach the pending start");
    assert.ok(initializationSignal);
    assert.equal(engineDisposals, 0, "Game owns the initialized engine while starting");
    assert.equal(readyEvents().length, 0);
    assert.notEqual(f.state.ready, true);
    if (outcome.startsWith("cancel-")) cleanup();
    if (outcome.endsWith("failure")) starting.reject(new Error("start failed"));
    else starting.resolve();
    await setImmediate();
    const successful = outcome === "success";
    assert.equal(readyEvents().length, successful ? 1 : 0);
    assert.equal(f.state.ready === true, successful);
    if (!outcome.startsWith("cancel-")) cleanup();
    assert.equal(game.disposed, true);
    assert.equal(initializationSignal.aborted, true);
    assert.equal(engineDisposals, 1, "startup failure or cleanup releases the engine once");
  });
}

function startOwnedGame(ui: ReturnType<typeof fixture>, options: { mode?: "multi" | "guest"; factoryError?: Error; pendingFactory?: Promise<void> } = {}) {
  const starting = deferred<void>(), game = ui.game;
  let starts = 0, gameDisposals = 0, engineDisposals = 0;
  const engine = { isWebGPU: false, dispose() { engineDisposals++; } };
  Object.assign(game, {
    ready: false, disposed: false, scene: { meshes: [], materials: [] },
    renderHealth: { snapshot: () => ({ valid: game.ready, firstErrors: [] }) },
    setQuality() {}, setTargetFps() {},
    async start() { starts++; await starting.promise; game.ready = true; },
    dispose() { if (game.disposed) return; game.disposed = true; gameDisposals++; engine.dispose(); },
  });
  ui.environment.game.current = null;
  Object.assign(ui.environment, {
    AbortController,
    testLoadGame: async () => ({ Game: class {
      constructor(canvas: unknown, _profile: unknown, prepared: unknown) {
        assert.equal(canvas, game.canvas); assert.equal(prepared, engine); return game;
      }
    } }),
    testLoadRenderEngine: async () => ({ createGameEngine: async () => {
      await options.pendingFactory;
      if (options.factoryError) throw options.factoryError;
      return engine;
    } }),
    getRendererInfo: () => ({ renderer: "fixture", vendor: "fixture", version: "fixture" }),
    mode: options.mode ?? "multi", canvas: { current: game.canvas },
    lightingPreviewRef: { current: { instant: null } }, weatherRef: { current: null },
    userBenchmark: { current: false }, quality: "medium", targetFps: 60, activity: { hunt: [] }, setStats() {},
    t: (text: string, values?: Record<string, unknown>) => text.replace(/\{(\w+)\}/g, (match, key) => String(values?.[key] ?? match)),
  });
  const cleanup = startupScript.runInContext(ui.context) as () => void;
  return { starting, cleanup, game, counts: () => ({ starts, gameDisposals, engineDisposals }) };
}

for (const stage of ["factory", "start"] as const)
  test(`terminal startup ${stage} failure releases its joined Room without replacing the original error`, async () => {
    const ui = fixture(), room = new FakeRoom(), failure = new Error(`original ${stage} failure`);
    ui.bind(room);
    const startup = startOwnedGame(ui, stage === "factory" ? { factoryError: failure } : {});
    await setImmediate();
    if (stage === "start") { startup.starting.reject(failure); await setImmediate(); }
    assert.deepEqual(room.leaveRequests, [true]);
    assert.equal(ui.room.current, null);
    assert.equal(ui.connectedRef.current, false);
    assert.equal(ui.state.connected, false);
    assert.match(ui.state.error, new RegExp(failure.message));
    assert.equal(ui.modeRef.current, "multi", "the original startup error screen stays in place");
    assert.equal(ui.state.mode, undefined, "network retirement must not navigate to menu");
    startup.cleanup();
    assert.deepEqual(room.leaveRequests, [true], "effect cleanup cannot close the Room twice");
    room.close();
  });

test("terminal startup clears owned buffers and send gates before synchronous or retained Room callbacks", async () => {
  const ui = fixture(), room = new FakeRoom();
  ui.bind(room);
  const startup = startOwnedGame(ui);
  ui.inputBuffer.current.enqueue({ seq: 1, x: 1, z: 0, yaw: 0, jump: false, run: false, vehicle: false });
  room.message("authoritative", { ...payloads().authoritative, resync: true });
  room.message("authoritative", { ...payloads().authoritative, resync: false, ack: 2, tick: 2 });
  room.message("presence", payloads().presence);
  room.message("car", payloads().car);
  assert.equal(ui.inputBuffer.current.snapshot().queued, 1);
  assert.ok(ui.bootstrapAuthorityRef.current);
  assert.equal(ui.authorityBufferRef.current.snapshot().pending, true);
  room.duringLeave = () => {
    assert.equal(ui.room.current, null);
    assert.equal(ui.connectedRef.current, false);
    assert.equal(ui.inputBuffer.current.snapshot().queued, 0);
    const before = ui.snapshot();
    dispatchMessages(room); room.error(); room.close();
    assert.equal(ui.snapshot(), before, "no callback runs while sending consented leave");
  };
  await setImmediate();
  const oldInput = startup.game.onInput, oldAction = startup.game.onAction;
  startup.starting.reject(new Error("owned startup failed"));
  await setImmediate();
  assert.equal(ui.inputBuffer.current.snapshot().queued, 0);
  assert.equal(ui.bootstrapAuthorityRef.current, null);
  assert.equal(ui.authorityBufferRef.current.snapshot().pending, false);
  assert.equal(ui.playersRef.current.length, 0);
  assert.equal(ui.playersById.current.size, 0);
  assert.equal(ui.carState.current, null);
  assert.equal(ui.state.players.length, 0);
  assert.equal(ui.state.messages.length, 0);
  assert.equal(ui.state.social.contacts.length, 0);
  oldInput({ seq: 2, x: 1, z: 0, yaw: 0, jump: false, run: false, vehicle: false });
  assert.equal(oldAction("vehicle"), false);
  assert.equal(ui.inputBuffer.current.flush("timer"), 0);
  assert.equal(room.sent.length, 0);
  startup.cleanup();
  assert.deepEqual(room.leaveRequests, [true]);
});

test("deferred consented leave from a failed startup cannot disconnect or send through the rejoined Room", async () => {
  const ui = fixture(), oldRoom = new FakeRoom(), nextRoom = new FakeRoom();
  ui.bind(oldRoom);
  const startup = startOwnedGame(ui);
  await setImmediate();
  const oldAction = startup.game.onAction;
  startup.starting.reject(new Error("first start failed"));
  await setImmediate();
  assert.deepEqual(oldRoom.leaveRequests, [true]);
  assert.ok(oldRoom.resolveLeave, "handshake is still pending");
  const connecting = ui.connect();
  await advanceToJoin(ui);
  ui.joins[0].result.resolve(nextRoom);
  assert.equal(await connecting, true);
  const nextGame = { ...startup.game, ready: true, disposed: false };
  ui.environment.game.current = nextGame;
  const before = ui.snapshot();
  oldRoom.close(); oldRoom.error(); dispatchMessages(oldRoom);
  await setImmediate();
  assert.equal(ui.snapshot(), before);
  assert.equal(ui.room.current, nextRoom);
  assert.equal(ui.connectedRef.current, true);
  assert.equal(oldAction("vehicle"), false);
  assert.equal(nextRoom.sent.length, 0);
  startup.cleanup();
  assert.equal(ui.environment.game.current, nextGame);
  assert.deepEqual(nextRoom.leaveRequests, []);
  ui.leave(); nextRoom.close();
});

test("a stale Game failure and cleanup cannot dispose the replacement Game or retire its Room", async () => {
  const ui = fixture(), oldRoom = new FakeRoom(), nextRoom = new FakeRoom();
  ui.bind(oldRoom);
  const startup = startOwnedGame(ui);
  await setImmediate();
  const connecting = ui.connect();
  await advanceToJoin(ui);
  ui.joins[0].result.resolve(nextRoom);
  assert.equal(await connecting, true);
  let replacementDisposals = 0;
  const replacement = { ...startup.game, ready: true, disposed: false, dispose() { replacementDisposals++; } };
  ui.environment.game.current = replacement;
  const before = ui.snapshot();
  startup.starting.reject(new Error("stale Game failed"));
  await setImmediate();
  assert.equal(ui.snapshot(), before);
  assert.equal(startup.counts().gameDisposals, 1, "only the obsolete Game is released");
  assert.equal(ui.environment.game.current, replacement);
  assert.equal(replacementDisposals, 0);
  assert.equal(ui.room.current, nextRoom);
  assert.deepEqual(oldRoom.leaveRequests, [false], "connect already retired the previous transport");
  assert.deepEqual(nextRoom.leaveRequests, []);
  startup.cleanup();
  assert.equal(replacementDisposals, 0);
  ui.leave(); oldRoom.close(); nextRoom.close();
});

test("startup failure retires its old Room while a newer pending join keeps its own generation", async () => {
  const ui = fixture(), oldRoom = new FakeRoom(), nextRoom = new FakeRoom();
  ui.bind(oldRoom);
  const startup = startOwnedGame(ui);
  await setImmediate();
  const connecting = ui.connect(), nextAttempt = ui.connectionAttempt.current;
  startup.starting.reject(new Error("old startup failed during replacement join"));
  await setImmediate();
  assert.equal(ui.connectionAttempt.current, nextAttempt);
  assert.equal(ui.room.current, null);
  assert.deepEqual(oldRoom.leaveRequests, [true]);
  await advanceToJoin(ui);
  ui.joins[0].result.resolve(nextRoom);
  assert.equal(await connecting, true);
  oldRoom.close(); await setImmediate();
  assert.equal(ui.room.current, nextRoom);
  assert.equal(ui.connectedRef.current, true);
  assert.deepEqual(nextRoom.leaveRequests, []);
  startup.cleanup(); ui.leave(); nextRoom.close();
});

for (const failureMode of ["reject", "throw"] as const)
  test(`Room leave ${failureMode} cannot replace a terminal startup error`, async () => {
    const ui = fixture(), room = new FakeRoom();
    ui.bind(room);
    if (failureMode === "reject") room.leaveError = new Error("leave rejected");
    else room.leave = (consented = true) => { room.leaveRequests.push(consented); throw new Error("leave threw"); };
    const startup = startOwnedGame(ui);
    await setImmediate();
    startup.starting.reject(new Error("original startup reason"));
    await setImmediate();
    assert.match(ui.state.error, /original startup reason/);
    assert.equal(ui.room.current, null);
    assert.equal(ui.connectedRef.current, false);
    assert.equal(startup.counts().gameDisposals, 1);
    assert.deepEqual(room.leaveRequests, [true]);
    startup.cleanup(); room.close();
  });

test("a Guest startup failure cannot retire an unrelated multiplayer Room", async () => {
  const ui = fixture(), room = new FakeRoom();
  ui.bind(room);
  const attempt = ui.connectionAttempt.current;
  const startup = startOwnedGame(ui, { mode: "guest" });
  await setImmediate();
  startup.starting.reject(new Error("Guest renderer failed"));
  await setImmediate();
  assert.equal(ui.room.current, room);
  assert.equal(ui.connectedRef.current, true);
  assert.equal(ui.connectionAttempt.current, attempt);
  assert.deepEqual(room.leaveRequests, []);
  assert.match(ui.state.error, /Guest renderer failed/);
  startup.cleanup(); ui.leave(); room.close();
});

test("a late factory rejection cannot publish an error into a replacement Game or disconnect its Room", async () => {
  const ui = fixture(), oldRoom = new FakeRoom(), nextRoom = new FakeRoom(), factory = deferred<void>();
  ui.bind(oldRoom);
  const startup = startOwnedGame(ui, { factoryError: new Error("retired factory rejected"), pendingFactory: factory.promise });
  await setImmediate();
  assert.equal(startup.counts().starts, 0);
  const connecting = ui.connect();
  await advanceToJoin(ui);
  ui.joins[0].result.resolve(nextRoom);
  assert.equal(await connecting, true);
  let replacementDisposals = 0;
  const replacement = { ...startup.game, ready: true, disposed: false, dispose() { replacementDisposals++; } };
  ui.environment.game.current = replacement;
  const before = ui.snapshot();
  factory.resolve(); await setImmediate();
  assert.equal(ui.snapshot(), before);
  assert.equal(ui.environment.game.current, replacement);
  assert.equal(ui.room.current, nextRoom);
  assert.equal(ui.connectedRef.current, true);
  assert.deepEqual(nextRoom.leaveRequests, []);
  startup.cleanup();
  assert.equal(replacementDisposals, 0);
  assert.equal(startup.counts().gameDisposals, 0);
  ui.leave(); oldRoom.close(); nextRoom.close();
});
