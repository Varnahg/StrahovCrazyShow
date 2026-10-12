import { Game } from "../../client/game";
import { DEFAULT_AVATAR } from "../../shared/types";
import { sunState, moonState, type Weather } from "../../shared/weather";
import { selectLightingPreview } from "../../client/lighting-preview";
import { groundHeight } from "../../shared/terrain";
const scenario = document.querySelector<HTMLSelectElement>("#scenario")!;
const quality = document.querySelector<HTMLSelectElement>("#quality")!;
const output = document.querySelector<HTMLPreElement>("#metrics")!;
const game = new Game(document.querySelector<HTMLCanvasElement>("#game")!, {
  nickname: "Atmosféra QA",
  avatar: DEFAULT_AVATAR,
  interests: [],
  social: false,
  firstTime: false,
});
const base = Date.parse("2026-10-12T10:00:00Z");
function apply() {
  const mode = scenario.value;
  game.timeOverride =
    mode === "golden"
      ? selectLightingPreview("golden-hour", base).instant
      : mode === "blue"
        ? selectLightingPreview("blue-hour", base).instant
        : mode === "new"
          ? Date.parse("2026-10-11T00:00:00Z")
          : mode === "quarter"
            ? Date.parse("2026-10-18T18:00:00Z")
            : mode === "full"
              ? Date.parse("2026-10-26T00:00:00Z")
              : base;
  const cloud =
    mode === "overcast" || mode === "rain" || mode === "snow"
      ? 1
      : mode === "broken"
        ? 0.5
        : mode === "golden"
          ? 0.32
          : mode === "blue"
            ? 0.25
            : 0;
  const weather: Weather = {
    temperature: mode === "snow" ? -1 : 12,
    wind: 4,
    windDirection: 270,
    rain: mode === "rain" ? 5 : mode === "snow" ? 1 : 0,
    cloud,
    snowfall: mode === "snow" ? 0.6 : 0,
    precipitationType:
      mode === "snow" ? "snow" : mode === "rain" ? "rain" : "none",
    visibility: mode === "fog" ? 250 : mode === "rain" ? 4000 : 40000,
    cloudLayers: { low: cloud, mid: cloud * 0.45, high: cloud * 0.5 },
    cloudWinds: {
      low: { speed: 8, direction: 250 },
      mid: { speed: 16, direction: 285 },
      high: { speed: 25, direction: 300 },
    },
    source: "Řízené testovací počasí · simulace",
    sourceKind: "model",
    cloudSource: "Řízená oblačnost · simulace",
    observedAt: base,
    fetchedAt: base,
    status: "fallback",
    stale: false,
  };
  game.setWeather(weather);
}
function view(yaw: number, pitch: number, firstPerson = true) {
  game.yaw = yaw;
  game.pitch = pitch;
  game.firstPerson = firstPerson;
  game.distance = 7;
  game.setUiModal(false);
}
scenario.addEventListener("change", apply);
quality.addEventListener("change", () => game.setQuality(quality.value));
document
  .querySelector("#west")!
  .addEventListener("click", () => view(-Math.PI / 2, -0.2));
document
  .querySelector("#south")!
  .addEventListener("click", () => view(0, -0.2));
for (const name of ["moon", "sun"] as const)
  document.querySelector("#" + name)!.addEventListener("click", () => {
    const body = (name === "moon" ? moonState : sunState)(game.timeOverride!);
    view(Math.atan2(body.x, body.z), -Math.tan(body.altitude));
  });
document
  .querySelector("#ground")!
  .addEventListener("click", () => view(-Math.PI / 2, 0.06, false));
apply();
game.setQuality(quality.value);
await game.start();
const position = { x: 110, y: groundHeight(110, 12) + 0.9, z: 12 };
game.actor.setPosition(position);
game.previousPosition.copyFromFloats(position.x, position.y, position.z);
game.visualOffset.setAll(0);
view(-Math.PI / 2, -0.2);
let previous = 0;
game.engine.onEndFrameObservable.add(() => {
  const now = performance.now();
  if (now - previous < 500) return;
  previous = now;
  output.textContent = JSON.stringify(
    {
      ready: game.ready,
      scenario: scenario.value,
      utc: new Date(game.timeOverride!).toISOString(),
      quality: game.quality,
      renderer: game.engine.getGlInfo(),
      css: [innerWidth, innerHeight],
      render: [game.engine.getRenderWidth(), game.engine.getRenderHeight()],
      renderErrors: game.renderErrorCount,
      assetErrors: game.assetLoadErrorCount,
      sun: sunState(game.timeOverride!),
      moon: moonState(game.timeOverride!),
      key: {
        intensity: game.sun.intensity,
        direction: game.sun.direction.asArray(),
      },
      ambient: game.ambient.intensity,
      fog: game.scene.fogDensity,
      shadows: game.cinematic?.stats,
    },
    null,
    2,
  );
});
window.addEventListener("pagehide", () => game.dispose(), { once: true });
