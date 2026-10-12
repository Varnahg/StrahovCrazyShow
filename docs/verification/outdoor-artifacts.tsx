import { createRoot } from "react-dom/client";
import { MapView } from "../../client/minimap";
import { Game } from "../../client/game";
import { setLocale } from "../../client/i18n";
import { DEFAULT_AVATAR } from "../../shared/types";
import { groundHeight } from "../../shared/terrain";
import { buildOutdoorWorldPlan } from "../../shared/outdoor-world";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";

setLocale("cs");
const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const select = document.querySelector<HTMLSelectElement>("#artifact")!;
const metrics = document.querySelector<HTMLOutputElement>("#metrics")!;
const quality = document.querySelector<HTMLSelectElement>("#quality")!;
const plan = buildOutdoorWorldPlan();
const game = new Game(canvas, {
  nickname: "Kontrola mobiliáře",
  avatar: DEFAULT_AVATAR,
  interests: [],
  social: false,
  firstTime: false,
});
game.timeOverride = Date.parse("2026-10-12T10:00:00Z");
const artifacts = [...plan.artifacts].sort((a, b) =>
  a.kind.includes("tractor")
    ? -1
    : b.kind.includes("tractor")
      ? 1
      : a.kind.localeCompare(b.kind),
);
for (const a of artifacts) {
  const option = document.createElement("option");
  option.value = a.id;
  option.textContent = `${a.kind} · ${a.name} · ${a.id}`;
  select.append(option);
}
let reverse = false,
  stopAt = 0,
  lastReport = 0;
let movement:
  | {
      key: string;
      start: number[];
      finish?: number[];
      screenDelta?: number;
      projection: Matrix;
      width: number;
      height: number;
    }
  | undefined;
function view() {
  const a = plan.artifacts.find((a) => a.id === select.value)!;
  const tower = a.kind === "tower";
  const pos = {
    x: a.x + (tower ? 0 : reverse ? 6 : -6),
    z: a.z + (tower ? 100 : reverse ? -6 : 6),
    y: 0,
  };
  pos.y = groundHeight(pos.x, pos.z) + 0.85;
  game.keys.clear();
  stopAt = 0;
  movement = undefined;
  game.actor.setPosition(pos);
  game.previousPosition.copyFromFloats(pos.x, pos.y, pos.z);
  game.visualOffset.setAll(0);
  game.yaw = Math.atan2(a.x - pos.x, a.z - pos.z);
  game.pitch = tower ? -0.24 : 0.02;
  game.distance = 6;
  game.firstPerson = true;
  game.setUiModal(false);
}
document.querySelector("#view")!.addEventListener("click", view);
document.querySelector("#orbit")!.addEventListener("click", () => {
  reverse = !reverse;
  view();
});
quality.addEventListener("change", () => game.setQuality(quality.value));
for (const [id, key, ms] of [
  ["walk", "KeyW", 2000],
  ["left", "KeyA", 1000],
  ["right", "KeyD", 1000],
] as const)
  document.querySelector(`#${id}`)!.addEventListener("click", () => {
    game.keys.clear();
    game.keys.add(key);
    game.setUiModal(false);
    stopAt = performance.now() + ms;
    const pos = game.actor.position;
    movement = {
      key,
      start: [pos.x, pos.y, pos.z],
      projection: game.scene.getTransformMatrix().clone(),
      width: game.engine.getRenderWidth(),
      height: game.engine.getRenderHeight(),
    };
  });
document.querySelector("#stop")!.addEventListener("click", () => {
  game.keys.clear();
  stopAt = 0;
});
const map = document.querySelector<HTMLDivElement>("#map")!;
const mapRoot = createRoot(map);
mapRoot.render(<MapView big />);
document.querySelector("#map-toggle")!.addEventListener("click", () => {
  map.hidden = !map.hidden;
});
game.engine.onEndFrameObservable.add(() => {
  const now = performance.now();
  if (!game.ready) return;
  if (stopAt && now >= stopAt) {
    game.keys.clear();
    stopAt = 0;
    if (movement) {
      const p = game.actor.position;
      movement.finish = [p.x, p.y, p.z];
      const viewport = game.camera.viewport.toGlobal(
        movement.width,
        movement.height,
      );
      const project = (v: number[]) =>
        Vector3.Project(
          Vector3.FromArray(v),
          Matrix.Identity(),
          movement!.projection,
          viewport,
        );
      movement.screenDelta =
        project(movement.finish).x - project(movement.start).x;
    }
  }
  if (now - lastReport < 500) return;
  lastReport = now;
  const controller = game.worldControllers?.outdoorArtifacts;
  const a = plan.artifacts.find((a) => a.id === select.value)!;
  const meshes =
    controller?.meshes.filter((m) => m.metadata?.artifactId === a.id) ?? [];
  metrics.textContent = JSON.stringify(
    {
      ready: game.ready,
      artifact: { id: a.id, kind: a.kind, x: a.x, z: a.z, source: a.source },
      renderer: game.engine.getGlInfo().renderer,
      css: [canvas.clientWidth, canvas.clientHeight],
      internal: [game.engine.getRenderWidth(), game.engine.getRenderHeight()],
      quality: game.quality,
      renderErrors: game.renderErrorCount,
      assetErrors: game.assetLoadErrorCount,
      position: game.actor.position,
      selectedMeshes: meshes.length,
      selectedEnabled: meshes.filter((m) => m.isEnabled()).length,
      stats: controller?.stats,
      movement: movement
        ? {
            key: movement.key,
            start: movement.start,
            finish: movement.finish,
            screenDelta: movement.screenDelta,
          }
        : null,
    },
    null,
    2,
  );
});
game.setQuality("medium");
await game.start();
document.querySelector<HTMLButtonElement>("#view")!.disabled = false;
view();
window.addEventListener(
  "pagehide",
  () => {
    mapRoot.unmount();
    game.dispose();
  },
  { once: true },
);
