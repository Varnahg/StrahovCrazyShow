import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Game } from "../../client/game";
import { CAR_PACK_MANIFEST } from "../../client/car-pack";
import { DEFAULT_PROFILE } from "../../shared/types";
import { BUILDINGS, CAR_SPAWN, SPAWN } from "../../shared/world";
import { buildingBaseHeight, groundHeight } from "../../shared/terrain";
import { buildingRoofGeometry } from "../../shared/building-roofs";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const output = document.querySelector<HTMLOutputElement>("#metrics")!;
const start = document.querySelector<HTMLButtonElement>("#start")!;
const back = document.querySelector<HTMLButtonElement>("#return")!;
const stop = document.querySelector<HTMLButtonElement>("#stop")!;
const building = BUILDINGS.find(b => b.id === "53921692")!;
const roof = buildingRoofGeometry(building, buildingBaseHeight(building.points))!;
const incident = { x: 154.1723175, z: -125.2249374 };
const requestedInputs = 90, recoveryRenderFrames = 6;
const configuredId = import.meta.env.VITE_SOURCE_SNAPSHOT_ID;
const sourceSnapshotId = /^[a-f0-9]{64}$/.test(configuredId ?? "") ? configuredId : null;
type Sample = { input: number; position: { x: number; y: number; z: number }; velocityY: number; wheelContact: boolean[] };
let game: Game | undefined, observer: Observer<Scene> | undefined;
let phase = "loading", failure: string | null = null, notice = "";
let closed = false, disposed = false, inputs = 0, extraInputs = 0, rendered = 0;
let recoveringFrames = 0, minOriginY = Infinity, began = 0, lastReport = -Infinity;
let timer: ReturnType<typeof setTimeout> | undefined, bootTimer: ReturnType<typeof setTimeout> | undefined;
let latest: Record<string, unknown> = {}, tick90: ReturnType<Game["sim"]["car"]["capture"]> | null = null;
let dropResult: Record<string, unknown> | null = null, recoveryResult: Record<string, unknown> | null = null;
const trace: Sample[] = [];

function report() {
  if (closed || timer !== undefined) return;
  timer = setTimeout(() => {
    timer = undefined;
    if (!closed) { output.textContent = JSON.stringify(latest, null, 2); lastReport = performance.now(); }
  }, Math.max(0, 200 - (performance.now() - lastReport)));
}
function snapshot(current: Game) {
  return {
    phase, failure, notice, noFpsClaim: true, sourceSnapshotId,
    sourceScope: sourceSnapshotId ? "Runtime ID injected by QA build; docs harness is separate" : "Working-tree QA; no frozen runtime source ID supplied",
    ready: current.ready, quality: current.quality, gpu: current.engine.getGlInfo(),
    cssViewport: { width: innerWidth, height: innerHeight },
    cssCanvas: { width: canvas.clientWidth, height: canvas.clientHeight },
    internal: { width: current.engine.getRenderWidth(), height: current.engine.getRenderHeight() },
    renderErrors: current.renderErrorCount, assetErrors: current.assetLoadErrorCount,
    setup: { explicitlyDiagnostic: true, buildingId: building.id, roofY: roof.y,
      position: { ...incident, y: roof.y + 2 }, velocity: { x: 0, y: -8, z: 0 },
      note: "One car placement and local actor vehicle entry; no further harness physics steps or teleports" },
    requestedInputs, recordedInputs: inputs, catchUpExtraInputs: extraInputs, renderedFrames: rendered,
    minimumOriginY: Number.isFinite(minOriginY) ? minOriginY : null,
    minimumOriginRelativeToRoof: Number.isFinite(minOriginY) ? minOriginY - roof.y : null,
    atInput90: tick90, dropResult, recoveryResult,
    current: current.ready ? { actor: current.actor.capture(), car: current.sim.car.capture(),
      recoveryStage: canvas.dataset.recoveryStage ?? null } : null,
    trace,
  };
}
function dispose(reason: string) {
  if (disposed) return;
  disposed = true; phase = reason;
  clearTimeout(bootTimer); clearTimeout(timer); timer = bootTimer = undefined;
  const current = game;
  if (current) {
    current.keys.clear(); current.onInput = undefined; current.onNotice = undefined;
    if (observer) current.scene.onAfterRenderObservable.remove(observer);
    observer = undefined;
    latest = snapshot(current);
    game = undefined;
    // Let the current Game.frame finish before disposing its physics/render resources.
    queueMicrotask(() => current.dispose());
  } else latest = { ...latest, phase, failure, noFpsClaim: true };
  start.disabled = back.disabled = stop.disabled = true;
  report(); // Coalesced final data owns no Game; pagehide cancels it.
}
function afterRender(current: Game) {
  if (game !== current || !current.ready || disposed) return;
  let changed = false;
  rendered++;
  if (phase === "drop-await-render") {
    const final = current.sim.car.capture();
    dropResult = { completed: true, inputsAtRenderedCompletion: inputs + extraInputs,
      final, originRelativeToRoof: final.position.y - roof.y,
      at90WithinExistingOriginThreshold: !!tick90 && tick90.position.y > roof.y - .1,
      thresholdScope: "Same car-origin roofY - 0.1 m threshold as the focused roof regression; inspect full trace and GPU image separately" };
    phase = "drop-complete";
    changed = true;
  } else if (phase === "recovering" && ++recoveringFrames >= recoveryRenderFrames) {
    const actor = current.actor.capture(), car = current.sim.car.capture();
    const expectedCarY = groundHeight(CAR_SPAWN.x, CAR_SPAWN.z) + CAR_PACK_MANIFEST.groundOriginOffset;
    recoveryResult = { completedRenderFrames: recoveringFrames, actor, car,
      recoveryStage: canvas.dataset.recoveryStage ?? null,
      footAtSpawn: !actor.vehicle && Math.hypot(actor.position.x-SPAWN.x, actor.position.z-SPAWN.z)<1e-4 && Math.abs(actor.position.y-SPAWN.y)<.35,
      spawnYNote: "Allow natural capsule settling after six rendered frames; X/Z are tested separately",
      carCanonical: car.parked && car.driverId === null && Math.hypot(car.position.x-CAR_SPAWN.x, car.position.y-expectedCarY, car.position.z-CAR_SPAWN.z)<.01,
      cameraFinite: current.camera.position.asArray().every(Number.isFinite) };
    phase = "recovery-complete";
    changed = true;
  }
  if ((phase === "dropping" || phase === "recovering") && performance.now()-began>20000) {
    failure = "QA nedokončila požadované physics inputs / render frames do 20 s.";
    phase = "incomplete";
    changed = true;
  }
  if (performance.now()-lastReport>=200 || changed) {
    latest = snapshot(current); report();
  }
}
function prepareDrop() {
  const current = game;
  if (!current?.ready || phase !== "ready") return;
  if (!roof || !current.sim.buildingRoofColliders.has(building.id)) {
    failure = "Chybí sdílený roof collider 53921692; nejde o platnou opravenou scénu.";
    latest = snapshot(current); report(); return;
  }
  try {
    current.keys.clear(); current.setUiModal(false);
    current.actor.setVehicle(true);
    current.sim.car.reset({ ...incident, y: roof.y + 2 }, 0); // Explicit QA setup only.
    current.sim.car.body.setLinvel({ x: 0, y: -8, z: 0 }, true);
    current.accumulator = 0; current.previousCarPose = undefined; current.visualOffset.setAll(0);
    const p = current.actor.position;
    current.previousPosition.copyFromFloats(p.x,p.y,p.z);
    current.yaw = 0; current.pitch = .28; current.distance = 9; current.firstPerson = false;
    current.camera.position.set(p.x,p.y+5,p.z-10);
    current.camera.setTarget(new Vector3(p.x,p.y,p.z));
    rendered = 0; minOriginY = current.sim.car.position.y;
    phase = "dropping"; began = performance.now(); start.disabled = true; back.disabled = false;
    current.onInput = (input) => {
      if (phase === "drop-await-render") { extraInputs++; return; }
      if (phase !== "dropping") return;
      const car = current.sim.car.capture();
      if (input.x || input.z || input.jump || input.run ||
        ![car.position.x,car.position.y,car.position.z,car.linvel.y].every(Number.isFinite)) {
        failure = "Sonda přerušena: nenulový ruční vstup nebo nekonečný fyzikální stav.";
        phase = "incomplete"; latest = snapshot(current); report(); return;
      }
      inputs++; minOriginY = Math.min(minOriginY,car.position.y);
      trace.push({ input: inputs, position: { ...car.position }, velocityY: car.linvel.y, wheelContact: [...car.wheelContact] });
      if (inputs === requestedInputs) { tick90 = car; phase = "drop-await-render"; }
    };
    latest = snapshot(current); report();
  } catch(error) { failure = String(error); phase = "incomplete"; latest = snapshot(current); report(); }
}
function returnToStart() {
  const current = game;
  if (!current?.ready || disposed) return;
  if (phase === "dropping" || phase === "drop-await-render")
    dropResult = { completed: false, interruptedByRecoveryAtInput: inputs };
  current.onInput = undefined;
  try {
    if (!current.requestRespawn()) throw new Error("Game.requestRespawn návrat odmítl.");
  } catch(error) { failure = String(error); phase = "recovery-failed"; latest = snapshot(current); report(); return; }
  recoveringFrames = 0; began = performance.now(); phase = "recovering"; back.disabled = true;
  latest = snapshot(current); report();
}
start.addEventListener("click",prepareDrop);
back.addEventListener("click",returnToStart);
stop.addEventListener("click",()=>dispose("stopped"));
window.addEventListener("pagehide",()=>{ closed = true; dispose("pagehide"); clearTimeout(timer); timer = undefined; },{once:true});

async function boot() {
  try {
    const current = new Game(canvas,{ ...DEFAULT_PROFILE,nickname:"QA roof/recovery" });
    game = current; current.setQuality("medium"); current.timeOverride = Date.parse("2026-10-11T10:00:00Z");
    current.onNotice = text => { notice = text; };
    observer = current.scene.onAfterRenderObservable.add(()=>afterRender(current));
    bootTimer = setTimeout(()=>{ failure = "Načítání přesáhlo 120 s."; dispose("incomplete"); },120000);
    await current.start();
    if (game !== current || disposed || closed) return;
    clearTimeout(bootTimer); bootTimer = undefined;
    if (current.renderErrorCount || current.assetLoadErrorCount) {
      failure = "Skutečný Game má chybu shaderu nebo assetu; nelze zahájit platnou QA.";
      dispose("incomplete"); return;
    }
    phase = "ready"; start.disabled = false;
    latest = snapshot(current); report();
  } catch(error) { failure = String(error); dispose("failed"); }
}
void boot();
