import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import { currentRoomCallbacks } from "../client/room-callbacks";
import { MotionDecoder, MotionEncoder } from "../shared/motion-codec";

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
const callbackNames = ["bind", "connect", "reconnect", "enter", "leave"];
const callbackSource = callbackNames.map((name) => {
  const declaration = declarations.find(
    (node) => ts.isIdentifier(node.name) && node.name.text === name,
  );
  assert.ok(declaration?.initializer, `App must define ${name}`);
  return `const ${name} = ${declaration.initializer.getText(ui)};`;
});
const callbacksScript = new Script(
  ts.transpileModule(
    [...callbackSource, `({ ${callbackNames.join(",")} });`].join("\n"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
      transformers: {
        before: [
          (context) => (source) => {
            const visit: ts.Visitor = (node) =>
              ts.isMetaProperty(node) &&
              node.keywordToken === ts.SyntaxKind.ImportKeyword
                ? ts.factory.createIdentifier("testImportMeta")
                : ts.visitEachChild(node, visit, context);
            return ts.visitNode(source, visit) as ts.SourceFile;
          },
        ],
      },
    },
  ).outputText,
);

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
  const effects: string[] = [];
  const state: Record<string, any> = { messages: [] };
  const refs = {
    room: { current: null as FakeRoom | null },
    connectionAttempt: { current: 0 },
    connectedRef: { current: false },
    inputBuffer: { current: ["pending input"] as unknown[] },
    authorityRef: { current: null },
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
    canvas: { dataset: {} },
    localPlayer: { id: "self" },
  };
  for (const method of [
    "setLocalId",
    "updatePlayers",
    "syncMotion",
    "reconcile",
    "setFound",
    "setCar",
    "setEmote",
    "cancelRespawn",
    "selectTarget",
  ])
    game[method] = (...args: unknown[]) => {
      if (method === "setLocalId") game.localId = args[0];
      effects.push(`game.${method}`);
      state[`game.${method}`] = args;
    };
  const environment: Record<string, any> = {
    exports: {},
    ...refs,
    game: { current: game },
    currentRoomCallbacks,
    MotionDecoder,
    PROTOCOL_VERSION: 8,
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
    performance: { now: () => 2000 },
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
  const callbacks = callbacksScript.runInNewContext(environment) as {
    bind: (room: FakeRoom) => void;
    leave: () => void;
    connect: () => Promise<boolean>;
    reconnect: () => Promise<void>;
    enter: (mode: "guest" | "multi") => Promise<void>;
  };
  return {
    ...callbacks,
    ...refs,
    state,
    effects,
    fetches,
    joins,
    storage,
    snapshot: () =>
      JSON.stringify({
        state,
        effects,
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
    welcome: { id, players: [player], events: [], activity: { hunt: [] } },
    presence: [player],
    motion: new MotionEncoder().encode({
      time: 1000,
      tick: 1,
      rows: [[id, 5, 2, 3, 0.1, 1, 0, 0, "outside", true]],
    }),
    authoritative: { ack: 1, x: 5, y: 2, z: 3 },
    events: [{ id: "private-event" }],
    social: { contacts: ["friend"], requests: [], blocked: [], attendance: [] },
    activity: { hunt: ["found-marker"] },
    notice: "multiplayer notice",
    reward: "multiplayer reward",
    car: { id: "campus-car" },
    chat: { id: "message", text: "multiplayer chat" },
    emote: { id, emote: "wave" },
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
  for (const [type, data] of Object.entries(payloads())) {
    ui.effects.length = 0;
    room.message(type, data);
    assert.ok(ui.effects.length > 0, `${type} must reach the current UI/Game`);
  }
  assert.equal(ui.playersById.current.get("self").x, 5);
  assert.equal(ui.playersById.current.get("self").emote, "wave");
  room.error();
  assert.equal(ui.state.notice, "socket error");
  room.message("motion", { v: 1, s: 3, t: 1100, n: 3, p: 1, r: [] });
  assert.deepEqual(room.sent, [["motionResync", undefined]]);
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
  assert.equal(room.messages.size, 12, "transport still retains its listeners");
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
  assert.equal(ui.inputBuffer.current.length, 0);
  assert.equal(ui.playersRef.current.length, 0);
  assert.equal(ui.playersById.current.size, 0);
  assert.equal(ui.authorityRef.current, null);
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
  assert.equal(room.messages.size, 12);
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
