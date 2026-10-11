import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  buildStreets,
  streetTransitionSegments,
} from "../../../client/streets-renderer";
import { buildTerrain } from "../../../client/terrain-renderer";
import { buildLandcover } from "../../../client/vegetation";
import { SurfacePack } from "../../../client/surface-pack";
import { CinematicAtmosphere } from "../../../client/cinematic";
import { applyArtLighting } from "../../../client/art-lighting";
import { BOUNDS } from "../../../shared/world";
import { groundHeight } from "../../../shared/terrain";
import { STREETS, nearestStreet } from "../../../shared/streets";
import { sunState, moonState, type Weather } from "../../../shared/weather";

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.fogMode = Scene.FOGMODE_EXP2;
const camera = new FreeCamera("street eye", new Vector3(0, 2, 0), scene);
camera.minZ = 0.08;
camera.maxZ = 300;
camera.fov = 0.85;
const sun = new DirectionalLight("sun", new Vector3(-0.3, -0.8, 0.4), scene),
  ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
const lamps = new StandardMaterial("street-preview-lamps", scene);
const terrain = buildTerrain({
  scene,
  rects: [
    {
      x: (BOUNDS.minX + BOUNDS.maxX) / 2,
      z: (BOUNDS.minZ + BOUNDS.maxZ) / 2,
      w: BOUNDS.maxX - BOUNDS.minX,
      d: BOUNDS.maxZ - BOUNDS.minZ,
    },
  ],
  bounds: BOUNDS,
});
buildLandcover(scene);
const lights: import("@babylonjs/core/Lights/pointLight").PointLight[] = [];
const started = performance.now(),
  streets = buildStreets({ scene, lights }),
  streetBuildMs = performance.now() - started;
const surfaces = new SurfacePack(scene),
  atmosphere = new CinematicAtmosphere(scene, camera, sun);
let weather: Weather = {
  temperature: null,
  wind: 0,
  windDirection: 0,
  rain: 0,
  cloud: 0.4,
  observedAt: null,
  fetchedAt: Date.now(),
  source: "Nedostupný zdroj",
  cloudSource: "Výchozí náhled",
  stale: true,
  status: "unavailable",
};
let mode = "day",
  wet = false;
const player = { x: 0, y: 0, z: 0 };
const transitions = streetTransitionSegments().filter(
  (segment) =>
    Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]) > 1.5,
);
const views = new Map<string, (typeof transitions)[number]>();
for (const segment of transitions) {
  const pair = segment.materials.join(" / "),
    x = (segment.a[0] + segment.b[0]) / 2,
    z = (segment.a[1] + segment.b[1]) / 2;
  const previous = views.get(pair);
  const distance = Math.hypot(x + 8, z + 73),
    oldDistance = previous
      ? Math.hypot(
          (previous.a[0] + previous.b[0]) / 2 + 8,
          (previous.a[1] + previous.b[1]) / 2 + 73,
        )
      : Infinity;
  if (distance < oldDistance) views.set(pair, segment);
}
const select = document.querySelector<HTMLSelectElement>("#view")!;
for (const [key] of views) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = key;
  select.append(option);
}
function selectView() {
  const segment = views.get(select.value);
  if (!segment) return;
  const x = (segment.a[0] + segment.b[0]) / 2,
    z = (segment.a[1] + segment.b[1]) / 2,
    dx = segment.b[0] - segment.a[0],
    dz = segment.b[1] - segment.a[1],
    length = Math.hypot(dx, dz),
    ux = dx / length,
    uz = dz / length,
    nx = -uz,
    nz = ux;
  player.x = x;
  player.z = z;
  player.y = groundHeight(x, z);
  const cx = x + nx * 2.7 - ux * 1.6,
    cz = z + nz * 2.7 - uz * 1.6;
  camera.position.set(cx, groundHeight(cx, cz) + 1.65, cz);
  camera.setTarget(new Vector3(x + ux, player.y + 0.03, z + uz));
  const street = nearestStreet(x, z);
  const location = document.querySelector<HTMLElement>("#location")!;
  location.replaceChildren(
    document.createTextNode(
      `Souřadnice x ${x.toFixed(2)}, z ${z.toFixed(2)} m. `,
    ),
  );
  if (street) {
    const link = document.createElement("a");
    link.href = street.feature.source;
    link.target = "_blank";
    link.textContent =
      street.feature.tags.name ?? `OSM úsek ${street.feature.id}`;
    location.append(link);
    location.append(
      document.createTextNode(` · povrch ${street.feature.surfaceProvenance}.`),
    );
  }
}
select.onchange = selectView;
selectView();
document.querySelectorAll<HTMLButtonElement>("#day,#actual").forEach(
  (button) =>
    (button.onclick = () => {
      mode = button.id;
      document
        .querySelectorAll("#day,#actual")
        .forEach((other) =>
          other.setAttribute("aria-pressed", String(other === button)),
        );
    }),
);
document.querySelector<HTMLButtonElement>("#wet")!.onclick = (event) => {
  wet = !wet;
  (event.currentTarget as HTMLButtonElement).setAttribute(
    "aria-pressed",
    String(wet),
  );
};
fetch("/api/weather")
  .then((r) => r.json())
  .then((data) => {
    weather = data;
    document.querySelector<HTMLElement>("#weather")!.textContent =
      `${weather.source} · ${weather.status}${weather.stale ? ", zastaralá data" : ""}; oblačnost: ${weather.cloudSource}. Denní režim výslovně používá dnešních 12:00 UTC.`;
  })
  .catch(
    () =>
      (document.querySelector<HTMLElement>("#weather")!.textContent =
        "Počasí není dostupné; výchozí náhled je označený."),
  );
let last = performance.now(),
  diagnosticAt = 0;
engine.runRenderLoop(() => {
  const now = performance.now(),
    dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const date = new Date();
  if (mode === "day") date.setUTCHours(12, 0, 0, 0);
  const instant = date.getTime(),
    solar = sunState(instant),
    moon = moonState(instant),
    rain = wet ? 2 : weather.rain;
  applyArtLighting(
    { scene, sun, ambient, lamps, lights, clouds: [], quality: "low" },
    { sun: solar, moon, weather: { ...weather, rain }, player, dt, instant },
  );
  surfaces.update(dt, "low", rain);
  atmosphere.update({
    dt,
    player,
    quality: "low",
    cloud: weather.cloud,
    daylight: solar.daylight,
  });
  scene.render();
  if (now - diagnosticAt > 1000) {
    diagnosticAt = now;
    const mappedMaterials = scene.materials.filter(
      (material) =>
        material.metadata?.mappedStreetSurface &&
        material.metadata?.physicallyBased,
    );
    const channels = mappedMaterials.flatMap((material) =>
      material
        .getActiveTextures()
        .map((texture) => ({
          material: material.name,
          family: material.metadata.materialFamily,
          url: texture.name,
          ready: texture.isReady(),
          size: texture.getSize(),
          gamma: texture.gammaSpace,
        })),
    );
    document.querySelector<HTMLElement>("#loading")!.textContent =
      channels.length && channels.every((channel) => channel.ready)
        ? "Všechny kanály materiálů komunikací načtené."
        : "Načítání původních CC0 textur…";
    document.querySelector<HTMLElement>("#diagnostics")!.textContent =
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          astronomicalInstant: date.toISOString(),
          mode,
          wetPreview: wet,
          source: STREETS.source,
          sourceSha256: STREETS.sourceSha256,
          bounds: BOUNDS,
          point: player,
          selected: select.value,
          quality: "low",
          gpu: engine.getGlInfo(),
          resolution: {
            css: [canvas.clientWidth, canvas.clientHeight],
            internal: [engine.getRenderWidth(), engine.getRenderHeight()],
          },
          streetBuildMs,
          transitions: streets.transitions,
          terrainTiles: terrain.tiles.length,
          channels,
          performanceMeasured: false,
          cinematic: atmosphere.stats,
        },
        null,
        2,
      );
  }
});
addEventListener("resize", () => engine.resize());
