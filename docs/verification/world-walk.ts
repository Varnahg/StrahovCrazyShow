import { Game } from "../../client/game";
import { DEFAULT_AVATAR } from "../../shared/types";
import { B6_LAYOUT } from "../../shared/b6-interior";
import { groundHeight } from "../../shared/terrain";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const game = new Game(canvas, {
  nickname: "Kontrola B6",
  avatar: { ...DEFAULT_AVATAR, shirt: "#58666f" },
  interests: [],
  social: false,
  firstTime: false,
});
const quality = document.querySelector<HTMLSelectElement>("#quality")!;
const light = document.querySelector<HTMLSelectElement>("#light")!;
const start = document.querySelector<HTMLButtonElement>("#start")!;
const next = document.querySelector<HTMLButtonElement>("#next")!;
const stop = document.querySelector<HTMLButtonElement>("#stop")!;
const metrics = document.querySelector<HTMLOutputElement>("#metrics")!;
const inward: [number, number][] = [
  [-4.85, -100],
  [-4.85, -90],
  [-4.85, -85],
  [-4.85, -82.1],
  [-4.85, -77.35],
  [-4.85, -73],
  [-3.5, -73],
  [-1, -71.95],
  [3, -71.95],
];
const route = [
  ...inward,
  ...inward.slice(0, -1).reverse(),
  [-4.85, -110] as [number, number],
];
let index = 0,
  walking = false,
  prepared = false,
  ticks = 0;
const visits: {
  index: number;
  position: { x: number; y: number; z: number };
  visibleEntry: number;
  visibleEnvelope: number;
}[] = [];
function lighting() {
  game.timeOverride = Date.parse(
    light.value === "day" ? "2026-10-11T10:00:00Z" : "2026-10-11T00:00:00Z",
  );
}
function status() {
  const entry = game.scene.meshes.filter(
    (m) => m.metadata?.visibilityGroup === "exterior-entry",
  );
  const envelope = game.scene.meshes.filter(
    (m) => m.metadata?.visibilityGroup === "opaque-envelope",
  );
  return {
    ready: game.ready,
    renderErrorCount: game.renderErrorCount,
    assetLoadErrorCount: game.assetLoadErrorCount,
    renderer: game.engine.getGlInfo().renderer,
    quality: game.quality,
    routeIndex: index,
    routeLength: route.length,
    walking,
    physicsTicks: ticks,
    position: { ...game.actor.position },
    vehicle: game.actor.vehicle,
    vehicleSpeed: game.sim.car.speed,
    headlight: game.vehicleLighting
      ? {
          enabled: game.vehicleLighting.light.isEnabled(),
          intensity: game.vehicleLighting.light.intensity,
          position: game.vehicleLighting.light.position.asArray(),
          direction: game.vehicleLighting.light.direction.asArray(),
          shadows: game.vehicleLighting.light.shadowEnabled,
        }
      : null,
    visibleEntry: entry.filter((m) => m.isEnabled()).length,
    totalEntry: entry.length,
    visibleEnvelope: envelope.filter((m) => m.isEnabled()).length,
    totalEnvelope: envelope.length,
    visits,
  };
}
function report() {
  metrics.textContent = JSON.stringify(status(), null, 2);
}
quality.addEventListener("change", () => game.setQuality(quality.value));
light.addEventListener("change", lighting);
start.addEventListener("click", () => {
  game.keys.clear();
  walking = false;
  prepared = true;
  index = 0;
  ticks = 0;
  visits.length = 0;
  const position = {
    x: B6_LAYOUT.entry.x,
    y: groundHeight(B6_LAYOUT.entry.x, -110) + 0.9,
    z: -110,
  };
  game.actor.setPosition(position);
  game.previousPosition.copyFromFloats(position.x, position.y, position.z);
  game.visualOffset.setAll(0);
  game.yaw = 0;
  game.pitch = 0.1;
  game.distance = 6;
  game.firstPerson = false;
  game.setUiModal(false);
  next.disabled = false;
  stop.disabled = true;
  report();
});
next.addEventListener("click", () => {
  if (prepared && index < route.length) {
    walking = true;
    next.disabled = true;
    stop.disabled = false;
    game.setUiModal(false);
  }
});
stop.addEventListener("click", () => {
  walking = false;
  game.keys.clear();
  next.disabled = index >= route.length;
  stop.disabled = true;
  report();
});
game.onInput = () => {
  if (walking) ticks++;
};
game.engine.onBeginFrameObservable.add(() => {
  if (!game.ready) return;
  if (prepared && walking) {
    const target = route[index],
      pos = game.actor.position,
      dx = target[0] - pos.x,
      dz = target[1] - pos.z;
    if (Math.hypot(dx, dz) < 0.16) {
      walking = false;
      game.keys.clear();
      const state = status();
      visits.push({
        index,
        position: state.position,
        visibleEntry: state.visibleEntry,
        visibleEnvelope: state.visibleEnvelope,
      });
      index++;
      next.disabled = index >= route.length;
      stop.disabled = true;
    } else {
      game.yaw = Math.atan2(dx, dz);
      game.keys.add("KeyW");
    }
  }
  report();
});
game.setQuality(quality.value);
lighting();
await game.start();
start.disabled = false;
report();
window.addEventListener("pagehide", () => game.dispose(), { once: true });
