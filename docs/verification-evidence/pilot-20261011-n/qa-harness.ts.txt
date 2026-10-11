import RAPIER from "@dimforge/rapier3d-compat";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Game } from "../../client/game";
import { DEFAULT_PROFILE, DEFAULT_AVATAR } from "../../shared/types";
import { applyAvatarPreset } from "../../client/avatar-presets";
import { CAR_SPAWN, HUNT_POINTS } from "../../shared/world";
import {
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
} from "../../shared/simulation";
import { rotateVehicleVector } from "../../shared/vehicle";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const output = document.querySelector<HTMLOutputElement>("#metrics")!;
const startButton = document.querySelector<HTMLButtonElement>("#start")!;
const stopButton = document.querySelector<HTMLButtonElement>("#stop")!;
const reloadButton = document.querySelector<HTMLButtonElement>("#reload")!;
const quality = document.querySelector<HTMLSelectElement>("#quality")!;
const light = document.querySelector<HTMLSelectElement>("#light")!;
const mirrorInput = document.querySelector<HTMLInputElement>("#mirror")!;
const mirrorNote =
  document.querySelector<HTMLParagraphElement>("#mirror-note")!;
const MATRIX_EPSILON = 0.0002,
  BOUNDS_EPSILON = 0.002,
  MAX_PATH_METRES = 5;
const phases = [
  {
    name: "Pěší příprava a ustálení",
    ticks: 36,
    keys: [],
    vehicle: false,
    after: "enter",
  },
  { name: "Nastoupení", ticks: 18, keys: [], vehicle: true },
  { name: "W dopředu", ticks: 18, keys: ["KeyW"], vehicle: true },
  { name: "W+A", ticks: 18, keys: ["KeyW", "KeyA"], vehicle: true },
  { name: "W+D", ticks: 18, keys: ["KeyW", "KeyD"], vehicle: true },
  {
    name: "Space brzda",
    ticks: 48,
    keys: ["Space"],
    vehicle: true,
    stopped: true,
  },
  { name: "S zpátečka", ticks: 24, keys: ["KeyS"], vehicle: true },
  {
    name: "Space před vystoupením",
    ticks: 48,
    keys: ["Space"],
    vehicle: true,
    stopped: true,
    after: "exit",
  },
  { name: "Vystoupení", ticks: 24, keys: [], vehicle: false, after: "enter" },
  { name: "Opětovné nastoupení", ticks: 18, keys: [], vehicle: true },
] as const;
type Scratch = {
  local: Matrix;
  world: Matrix;
  rotation: Quaternion;
  scale: Vector3;
};
type MirrorTarget = {
  root: TransformNode;
  originalX: number;
  entityId: string;
};
let game: Game | undefined, afterRender: Observer<Scene> | undefined;
let generation = 0,
  pageClosed = false,
  loading = false,
  running = false,
  prepared = false;
let phaseIndex = 0,
  phaseTicks = 0,
  ticks = 0,
  phaseStarted = 0,
  runStarted = 0;
let pathMetres = 0,
  maxRadius = 0,
  initialCar = Vector3.Zero(),
  previousCar = Vector3.Zero();
let state = "loading",
  failure: string | null = null,
  notice = "";
let reportTimer: ReturnType<typeof setTimeout> | undefined,
  bootTimer: ReturnType<typeof setTimeout> | undefined;
let lastReport = -Infinity,
  latest: Record<string, unknown> = {};
let framesChecked = 0,
  matrixSamples = 0,
  boundsSamples = 0,
  maxMatrixError = 0,
  maxBoundsError = 0;
let lastParts = 0,
  minParts = Infinity,
  maxSpeed = 0,
  reverseSpeed = 0,
  leftSteering = 0,
  rightSteering = 0;
let mirror: MirrorTarget | undefined,
  mirrorCandidate: MirrorTarget | undefined,
  mirrorActivePaint = 0;
const observedWheels = new Set<number>(),
  unsupported = new Set<string>();
const observedWheelModes = new Set<string>();
let zeroDisplayedFrames = 0,
  lastAuditedRootId: string | null = null,
  lastAuditRenderId: number | null = null;
const mismatches: Record<string, unknown>[] = [],
  records: Record<string, unknown>[] = [];
const bounds = new Map<AbstractMesh, BoundingInfo>(),
  scratch = new Map<TransformNode, Scratch>(),
  computed = new Set<TransformNode>();
const corner = Vector3.Zero();
const visiblePaint = (mesh: AbstractMesh) =>
  mesh.isVisible &&
  mesh.isEnabled() &&
  mesh.material?.metadata?.vehiclePaint === true;

function requestReport() {
  if (pageClosed || reportTimer !== undefined) return;
  const wait = Math.max(0, 200 - (performance.now() - lastReport));
  // One coalesced UI flush; no simulation interval or additional render loop.
  reportTimer = setTimeout(() => {
    reportTimer = undefined;
    if (pageClosed) return;
    output.textContent = JSON.stringify(latest, null, 2);
    mirrorInput.disabled =
      running || !game?.ready || (!mirror && !mirrorCandidate);
    mirrorNote.textContent = mirror
      ? `QA pouze: ${mirror.entityId}, scale.x ${mirror.root.scaling.x}; aktivní lakované části po zrcadlení: ${mirrorActivePaint}. Kolize se nemění; pixelový výsledek musí posoudit člověk.`
      : mirrorCandidate
        ? `Dostupný viditelný parking-bay: ${mirrorCandidate.entityId}. Jde pouze o vizuální test záporného determinantu mimo jízdní trasu.`
        : "Nedostupné: v aktuálních active meshes není viditelná lakovaná část parking-bay. Nejde o důkaz fallbacku.";
    lastReport = performance.now();
  }, wait);
}
function inspectMirror(scene: Scene) {
  mirrorCandidate = undefined;
  mirrorActivePaint = 0;
  const active = scene.getActiveMeshes();
  for (let i = 0; i < active.length; i++) {
    const mesh = active.data[i];
    if (!visiblePaint(mesh)) continue;
    let node = mesh.parent;
    while (node) {
      if (
        node instanceof TransformNode &&
        node.metadata?.representation === "parking-bay"
      ) {
        if (mirror?.root === node) mirrorActivePaint++;
        mirrorCandidate ??= {
          root: node,
          originalX: node.scaling.x,
          entityId: String(node.metadata.entityId ?? node.id),
        };
        break;
      }
      node = node.parent;
    }
  }
}
function restoreMirror() {
  if (mirror && !mirror.root.isDisposed())
    mirror.root.scaling.x = mirror.originalX;
  mirror = undefined;
  mirrorInput.checked = false;
  mirrorActivePaint = 0;
}
function expectedWorld(node: TransformNode): Matrix | undefined {
  if (computed.has(node)) return scratch.get(node)?.world;
  if (
    node.billboardMode !== 0 ||
    node.infiniteDistance ||
    node.isUsingPivotMatrix() ||
    (node.reIntegrateRotationIntoRotationQuaternion &&
      node.rotation.lengthSquared() > 0)
  ) {
    unsupported.add(node.name);
    return undefined;
  }
  let entry = scratch.get(node);
  if (!entry) {
    entry = {
      local: Matrix.Identity(),
      world: Matrix.Identity(),
      rotation: Quaternion.Identity(),
      scale: Vector3.One(),
    };
    scratch.set(node, entry);
  }
  entry.scale.set(
    node.scaling.x * node.scalingDeterminant,
    node.scaling.y * node.scalingDeterminant,
    node.scaling.z * node.scalingDeterminant,
  );
  if (node.rotationQuaternion) entry.rotation.copyFrom(node.rotationQuaternion);
  else
    Quaternion.RotationYawPitchRollToRef(
      node.rotation.y,
      node.rotation.x,
      node.rotation.z,
      entry.rotation,
    );
  Matrix.ComposeToRef(entry.scale, entry.rotation, node.position, entry.local);
  if (node.parent) {
    if (!(node.parent instanceof TransformNode)) {
      unsupported.add(node.name + ": parent");
      return undefined;
    }
    const parent = expectedWorld(node.parent);
    if (!parent) return undefined;
    entry.local.multiplyToRef(parent, entry.world);
  } else entry.world.copyFrom(entry.local);
  computed.add(node);
  return entry.world;
}
function mismatch(kind: string, node: string, error: number) {
  if (mismatches.length < 16)
    mismatches.push({
      kind,
      node,
      error: Number.isFinite(error) ? error : "non-finite",
      tick: ticks,
      phase: phases[phaseIndex]?.name,
    });
}
function checkNode(node: TransformNode) {
  const expected = expectedWorld(node);
  if (!expected) return undefined;
  // getWorldMatrix() may compute! This public accessor only returns its cache.
  const cached = node.worldMatrixFromCache;
  let error = 0;
  for (let i = 0; i < 16; i++)
    error = Math.max(error, Math.abs(expected.m[i] - cached.m[i]));
  matrixSamples++;
  maxMatrixError = Math.max(maxMatrixError, error);
  if (!Number.isFinite(error) || error > MATRIX_EPSILON)
    mismatch("world-matrix", node.name, error);
  return expected;
}
function auditDisplayedRig(current: Game) {
  const root = current.actor.vehicle ? current.car : current.parkedCar;
  lastAuditedRootId = root.id;
  lastAuditRenderId = current.scene.getRenderId();
  if (!root.isEnabled()) {
    unsupported.add("expected enabled vehicle root");
    return;
  }
  const active = current.scene.getActiveMeshes(),
    parents = new Set<TransformNode>();
  computed.clear();
  lastParts = 0;
  for (let i = 0; i < active.length; i++) {
    const mesh = active.data[i];
    if (
      mesh.metadata?.kind !== "vehicle-part" ||
      !mesh.isVisible ||
      !mesh.isEnabled() ||
      !mesh.isDescendantOf(root)
    )
      continue;
    lastParts++;
    const expected = checkNode(mesh);
    if (!expected) continue;
    let node = mesh.parent;
    while (node instanceof TransformNode) {
      parents.add(node);
      if (node === root) break;
      node = node.parent;
    }
    const wheel = mesh.metadata.wheelIndex;
    if (Number.isInteger(wheel)) {
      observedWheels.add(wheel);
      observedWheelModes.add(
        `${current.actor.vehicle ? "driving" : "parked"}:${wheel}`,
      );
    }
    // References captured once before controls begin; no bounding getter here.
    const cached = bounds.get(mesh);
    if (!cached) {
      unsupported.add(mesh.name + ": uncaptured bounds");
      continue;
    }
    const box = cached.boundingBox;
    let error = 0;
    for (let vertex = 0; vertex < box.vectors.length; vertex++) {
      Vector3.TransformCoordinatesToRef(box.vectors[vertex], expected, corner);
      error = Math.max(
        error,
        Vector3.Distance(corner, box.vectorsWorld[vertex]),
      );
    }
    boundsSamples++;
    maxBoundsError = Math.max(maxBoundsError, error);
    if (!Number.isFinite(error) || error > BOUNDS_EPSILON)
      mismatch("world-bounds", mesh.name, error);
  }
  if (lastParts) {
    for (const node of parents) checkNode(node);
    framesChecked++;
    minParts = Math.min(minParts, lastParts);
  } else zeroDisplayedFrames++;
  // Disabled alternate rig intentionally is not audited: it need not be refreshed.
}
function snapshot(current: Game) {
  const car = current.sim.car.capture(),
    css = canvas.getBoundingClientRect();
  return {
    state,
    failure,
    notice,
    ready: current.ready,
    noFpsClaim: true,
    sourceSnapshotId: import.meta.env.VITE_SOURCE_SNAPSHOT_ID || null,
    renderer: current.engine.getGlInfo().renderer,
    resolution: {
      cssWidth: css.width,
      cssHeight: css.height,
      internalWidth: current.engine.getRenderWidth(),
      internalHeight: current.engine.getRenderHeight(),
      devicePixelRatio,
      hardwareScaling: current.engine.getHardwareScalingLevel(),
    },
    quality: current.quality,
    utc: new Date(current.timeOverride!).toISOString(),
    renderErrors: current.renderErrorCount,
    assetErrors: current.assetLoadErrorCount,
    carAssetStage: current.canvas.dataset.carStage,
    physicsStage: current.canvas.dataset.physicsStage,
    recordedSpawn: CAR_SPAWN,
    preparedOnce: prepared,
    harnessPositionPreparations: prepared ? 1 : 0,
    physicsTicks: ticks,
    phase: phases[phaseIndex]?.name ?? "completed",
    phaseTicks,
    actor: {
      position: { ...current.actor.position },
      vehicle: current.actor.vehicle,
      speed: current.actor.speed,
    },
    car: {
      position: car.position,
      rotation: car.rotation,
      speed: current.sim.car.speed,
      steering: car.steering,
      wheelSpin: car.wheelSpin,
      suspension: car.wheelSuspension,
      contact: car.wheelContact,
      parked: car.parked,
    },
    pathMetres,
    maximumRadiusMetres: maxRadius,
    limitMetres: MAX_PATH_METRES,
    matrixAudit: {
      framesChecked,
      matrixSamples,
      boundsSamples,
      currentDisplayedParts: lastParts,
      minimumDisplayedParts: Number.isFinite(minParts) ? minParts : null,
      observedWheels: [...observedWheels].sort(),
      observedWheelModes: [...observedWheelModes].sort(),
      zeroDisplayedFrames,
      auditedRootId: lastAuditedRootId,
      auditedRenderId: lastAuditRenderId,
      maxMatrixError,
      maxBoundsError,
      tolerances: { matrix: MATRIX_EPSILON, boundsMetres: BOUNDS_EPSILON },
      unsupported: [...unsupported],
      mismatches: mismatches.slice(),
      reads:
        "worldMatrixFromCache + previously captured BoundingInfo; never compute/refresh",
    },
    witnesses: {
      maximumForwardSpeed: maxSpeed,
      minimumReverseSpeed: reverseSpeed,
      leftSteering,
      rightSteering,
    },
    mirrorProbe: {
      availableEntityId: mirrorCandidate?.entityId ?? null,
      enabled: !!mirror,
      entityId: mirror?.entityId ?? null,
      originalScaleX: mirror?.originalX ?? null,
      scaleX: mirror?.root.scaling.x ?? null,
      activePaintParts: mirrorActivePaint,
      diagnosticVisualOnly: true,
      collisionsChanged: false,
      pixelProof: false,
    },
    phases: records.slice(),
  };
}
function keysForPhase(current: Game) {
  current.keys.clear();
  for (const key of phases[phaseIndex]?.keys ?? []) current.keys.add(key);
}
function stop(reason: string, error?: string) {
  const current = game;
  state = reason;
  failure ??= error ?? null;
  running = false;
  if (bootTimer !== undefined) {
    clearTimeout(bootTimer);
    bootTimer = undefined;
  }
  if (reportTimer !== undefined) {
    clearTimeout(reportTimer);
    reportTimer = undefined;
  }
  restoreMirror();
  mirrorCandidate = undefined;
  if (current) {
    current.keys.clear();
    current.onInput = undefined;
    current.onNotice = undefined;
    if (afterRender) current.scene.onAfterRenderObservable.remove(afterRender);
    afterRender = undefined;
    if (current.ready) latest = snapshot(current);
    else latest = { state, failure, ready: false, noFpsClaim: true };
    game = undefined;
    // This may be called from onAfterRender while Game.frame still has work.
    // Dispose after that synchronous frame unwinds, before another frame starts.
    queueMicrotask(() => current.dispose());
  }
  bounds.clear();
  scratch.clear();
  computed.clear();
  loading = false;
  startButton.disabled = true;
  reloadButton.disabled = pageClosed;
  quality.disabled = light.disabled = false;
  mirrorInput.disabled = true;
  // Only this final coalesced DOM flush may remain (<=200ms); it owns no Game.
  if (!pageClosed) requestReport();
}
function afterFrame(current: Game) {
  if (game !== current || !current.ready) return;
  inspectMirror(current.scene);
  if (running) {
    auditDisplayedRig(current);
    if (current.renderErrorCount || current.assetLoadErrorCount) {
      stop("failed", "Renderer nebo asset hlásí chybu.");
      return;
    }
    if (mismatches.length) {
      stop("failed", "Po dokončeném renderu zůstala stale matice nebo bounds.");
      return;
    }
    if (pathMetres > MAX_PATH_METRES || maxRadius > MAX_PATH_METRES) {
      stop("failed", "Překročen konzervativní 5m limit; běh byl ukončen.");
      return;
    }
    if (
      performance.now() - phaseStarted > 12000 ||
      performance.now() - runStarted > 60000
    ) {
      stop("incomplete", "Ticková sekvence se nedokončila v časovém limitu.");
      return;
    }
    const phase = phases[phaseIndex];
    if (phaseTicks >= phase.ticks) {
      const car = current.sim.car.capture();
      records.push({
        phase: phase.name,
        requestedTicks: phase.ticks,
        actualTicks: phaseTicks,
        tick: ticks,
        actorVehicle: current.actor.vehicle,
        position: car.position,
        speed: current.sim.car.speed,
        steering: car.steering,
        wheelSpin: car.wheelSpin,
        displayedParts: lastParts,
        matrixErrorMaximum: maxMatrixError,
        boundsErrorMaximum: maxBoundsError,
      });
      if (current.actor.vehicle !== phase.vehicle) {
        stop("failed", "Nesouhlasí očekávaný stav pěší/řidič.");
        return;
      }
      if ("stopped" in phase && Math.abs(current.sim.car.speed) > 0.35) {
        stop("incomplete", "Brzdicí úsek nezastavil vůz pod 0,35 m/s.");
        return;
      }
      current.keys.clear();
      if ("after" in phase) {
        current.interact();
        if (current.actor.vehicle !== (phase.after === "enter")) {
          stop(
            "incomplete",
            "Skutečné game.interact() nedokončilo změnu režimu: " + notice,
          );
          return;
        }
      }
      phaseIndex++;
      phaseTicks = 0;
      phaseStarted = performance.now();
      if (phaseIndex === phases.length) {
        const complete =
          framesChecked > 30 &&
          observedWheels.size === 4 &&
          observedWheelModes.size === 8 &&
          zeroDisplayedFrames === 0 &&
          maxSpeed > 0.1 &&
          reverseSpeed < -0.05 &&
          leftSteering * rightSteering < 0 &&
          unsupported.size === 0 &&
          boundsSamples > 0;
        stop(
          complete ? "completed-observation" : "incomplete",
          complete
            ? undefined
            : "Chybí aktivované části, pohyb, oba směry řízení nebo podporovaná transformace.",
        );
        return;
      }
      keysForPhase(current);
    }
  }
  if (performance.now() - lastReport >= 200) {
    latest = snapshot(current);
    requestReport();
  }
}
function prepareAndStart() {
  const current = game;
  if (!current?.ready || running || prepared) return;
  restoreMirror();
  if (current.actor.vehicle) {
    stop("incomplete", "Počáteční postava musí být pěší.");
    return;
  }
  const car = current.sim.car.capture();
  if (
    Math.hypot(car.position.x - CAR_SPAWN.x, car.position.z - CAR_SPAWN.z) > 1
  ) {
    stop(
      "incomplete",
      "Vůz už není v doloženém spawn parkovišti; založ nový běh.",
    );
    return;
  }
  const candidates = [-2.7, 2.7].map((x) => {
    const offset = rotateVehicleVector(car.rotation, { x, y: 0, z: 0 });
    const point = {
      x: car.position.x + offset.x,
      y: 0,
      z: car.position.z + offset.z,
    };
    point.y =
      current.sim.surfaceHeight(point.x, point.z) +
      CHARACTER_HALF_HEIGHT +
      CHARACTER_RADIUS +
      0.12;
    return point;
  });
  const point = candidates.find(
    (candidate) =>
      HUNT_POINTS.every(
        (h) => Math.hypot(h.x - candidate.x, h.z - candidate.z) >= 4.1,
      ) &&
      !current.sim.world.intersectionWithShape(
        candidate,
        { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
        undefined,
        undefined,
        current.actor.collider,
        current.actor.body,
      ),
  );
  if (!point) {
    stop(
      "incomplete",
      "Vedle skutečného auta není volné výchozí místo bez jiné interakce.",
    );
    return;
  }
  current.keys.clear();
  current.actor.setPosition(point); // The sole explicit harness placement.
  current.previousPosition.copyFromFloats(point.x, point.y, point.z);
  current.visualOffset.setAll(0);
  current.yaw = CAR_SPAWN.yaw;
  current.pitch = 0.28;
  current.distance = 7;
  current.firstPerson = false;
  current.setUiModal(false);
  // Capture once outside the post-render audit; getters can refresh dirty bounds.
  for (const root of [current.car, current.parkedCar])
    for (const mesh of root.getChildMeshes())
      if (mesh.metadata?.kind === "vehicle-part" && mesh.hasBoundingInfo)
        bounds.set(mesh, mesh.getBoundingInfo());
  initialCar.set(car.position.x, car.position.y, car.position.z);
  previousCar.copyFrom(initialCar);
  prepared = running = true;
  state = "running";
  phaseStarted = runStarted = performance.now();
  records.push({
    phase: "Explicitní jednorázová příprava",
    position: point,
    actualCarPosition: car.position,
    boundsReferences: bounds.size,
  });
  current.onInput = () => {
    if (!running || game !== current) return;
    ticks++;
    phaseTicks++;
    const p = current.sim.car.position,
      step = Math.hypot(p.x - previousCar.x, p.z - previousCar.z);
    pathMetres += step;
    previousCar.set(p.x, p.y, p.z);
    maxRadius = Math.max(
      maxRadius,
      Math.hypot(p.x - initialCar.x, p.z - initialCar.z),
    );
    const speed = current.sim.car.speed;
    maxSpeed = Math.max(maxSpeed, speed);
    reverseSpeed = Math.min(reverseSpeed, speed);
    if (phases[phaseIndex].name === "W+A")
      leftSteering = current.sim.car.steering;
    if (phases[phaseIndex].name === "W+D")
      rightSteering = current.sim.car.steering;
    // Game samples forward/side once per frame. A boundary may include up to
    // its bounded catch-up batch; actual ticks are recorded, never relabelled.
    if (phaseTicks >= phases[phaseIndex].ticks) current.keys.clear();
  };
  startButton.disabled = true;
  quality.disabled = light.disabled = true;
  mirrorInput.disabled = true;
  keysForPhase(current);
}
async function loadScene() {
  if (loading || pageClosed) return;
  if (game) stop("replaced");
  const epoch = ++generation;
  loading = true;
  state = "loading";
  failure = null;
  prepared = running = false;
  phaseIndex =
    phaseTicks =
    ticks =
    framesChecked =
    matrixSamples =
    boundsSamples =
    lastParts =
      0;
  pathMetres =
    maxRadius =
    maxMatrixError =
    maxBoundsError =
    maxSpeed =
    reverseSpeed =
    leftSteering =
    rightSteering =
      0;
  minParts = Infinity;
  records.length = mismatches.length = 0;
  observedWheels.clear();
  observedWheelModes.clear();
  zeroDisplayedFrames = 0;
  lastAuditedRootId = null;
  lastAuditRenderId = null;
  unsupported.clear();
  startButton.disabled = reloadButton.disabled = true;
  const current = new Game(canvas, {
    ...DEFAULT_PROFILE,
    nickname: "QA auta",
    avatar: applyAvatarPreset(0, DEFAULT_AVATAR),
  });
  game = current;
  current.setQuality(quality.value);
  current.timeOverride = Date.parse(
    light.value === "day" ? "2026-10-11T10:00:00Z" : "2026-10-11T00:00:00Z",
  );
  current.onNotice = (text) => {
    notice = text;
  };
  afterRender =
    current.scene.onAfterRenderObservable.add(() => afterFrame(current)) ??
    undefined;
  bootTimer = setTimeout(() => {
    if (game === current)
      stop("incomplete", "Načítání hry překročilo 120 sekund.");
  }, 120000);
  try {
    await current.start();
    if (game !== current || epoch !== generation || pageClosed) return;
    clearTimeout(bootTimer);
    bootTimer = undefined;
    loading = false;
    state = "ready";
    startButton.disabled = false;
    latest = snapshot(current);
    requestReport();
  } catch (error) {
    if (game === current) stop("failed", String(error));
  }
}
startButton.addEventListener("click", prepareAndStart);
stopButton.addEventListener("click", () => stop("stopped"));
reloadButton.addEventListener("click", () => void loadScene());
quality.addEventListener("change", () => {
  if (game && !running) game.setQuality(quality.value);
});
light.addEventListener("change", () => {
  if (game && !running)
    game.timeOverride = Date.parse(
      light.value === "day" ? "2026-10-11T10:00:00Z" : "2026-10-11T00:00:00Z",
    );
});
mirrorInput.addEventListener("change", () => {
  if (!game?.ready || running || !mirrorInput.checked) {
    restoreMirror();
    return;
  }
  inspectMirror(game.scene);
  if (!mirrorCandidate) {
    mirrorInput.checked = false;
    return;
  }
  mirror = mirrorCandidate;
  mirror.root.scaling.x = -mirror.originalX;
  // Active paint evidence is sampled only after the following completed frame.
  mirrorActivePaint = 0;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && running)
    stop("incomplete", "Běh přerušen skrytím karty.");
});
window.addEventListener(
  "pagehide",
  () => {
    pageClosed = true;
    generation++;
    stop("disposed");
    if (reportTimer !== undefined) {
      clearTimeout(reportTimer);
      reportTimer = undefined;
    }
  },
  { once: true },
);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
void loadScene();
