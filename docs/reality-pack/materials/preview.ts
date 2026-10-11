import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { buildArchitectureReality } from "../../../client/architecture-reality";
import { applyArtLighting } from "../../../client/art-lighting";
import { CinematicAtmosphere } from "../../../client/cinematic";
import { SurfacePack } from "../../../client/surface-pack";
import { VegetationController } from "../../../client/vegetation";
import { BUILDINGS, buildingArchitecture } from "../../../shared/world";
import {
  sunState,
  moonState,
  windVector,
  type Weather,
} from "../../../shared/weather";

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
let mode = "actual",
  quality = "medium";
const player = { x: -22, y: 0, z: -55 };
const status = document.querySelector<HTMLElement>("#status")!;
const diagnostics = document.querySelector<HTMLElement>("#diagnostics")!;
const scenes: ReturnType<typeof create>[] = [];
function create(id: string, enhanced: boolean) {
  const canvas = document.querySelector<HTMLCanvasElement>("#" + id)!;
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.fogMode = Scene.FOGMODE_EXP2;
  const camera = new FreeCamera(
    "comparison",
    new Vector3(-29, 4.6, -44),
    scene,
  );
  camera.setTarget(new Vector3(2, 6.3, -63));
  camera.fov = 0.9;
  camera.minZ = 0.1;
  camera.maxZ = 500;
  const sun = new DirectionalLight("sun", new Vector3(-0.3, -0.7, 0.4), scene);
  const ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
  const lamps = new StandardMaterial("comparison-lamp", scene);
  const architecture = buildArchitectureReality({
    scene,
    buildings: BUILDINGS.filter((b) => buildingArchitecture(b)?.block === 6),
    baseElevation: () => 0,
  });
  const ground = MeshBuilder.CreateGround(
    "comparison asphalt",
    { width: 110, height: 140 },
    scene,
  );
  ground.position.set(5, 0, -55);
  const pavement = MeshBuilder.CreateGround(
    "comparison paving",
    { width: 8, height: 110 },
    scene,
  );
  pavement.position.set(-11, 0.004, -55);
  const lawn = MeshBuilder.CreateGround(
    "comparison grass",
    { width: 15, height: 110 },
    scene,
  );
  lawn.position.set(-23, 0.006, -55);
  for (const [mesh, kind, color] of [
    [ground, "asphalt", "#666b68"],
    [pavement, "concrete", "#b3b1a7"],
    [lawn, "grass", "#788268"],
  ] as const) {
    const mat = new StandardMaterial(kind, scene);
    mat.diffuseColor = Color3.FromHexString(color);
    mat.specularColor.setAll(0.015);
    mat.metadata = { surfaceKind: kind, uvMetresPerRepeat: 4 };
    mesh.material = mat;
    mesh.metadata = { depthCaster: false };
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const uv: number[] = [];
    for (let i = 0; i < positions.length; i += 3)
      uv.push(positions[i] / 4, positions[i + 2] / 4);
    mesh.setVerticesData(VertexBuffer.UVKind, uv);
  }
  const surfaces = enhanced ? new SurfacePack(scene) : undefined;
  const cinematic = enhanced
    ? new CinematicAtmosphere(scene, camera, sun)
    : undefined;
  // Shared instanced trees exercise alpha/deformed shadow code. The independent
  // vegetation module keeps all placements and terrain anchors from source data.
  const vegetation = new VegetationController(scene);
  void vegetation.loadTrees().then(() => {
    // Only this diagnostic preview is flat. The game uses shared DMR anchors.
    for (const mesh of scene.meshes)
      if (mesh.metadata?.vegetation === "tree") {
        mesh.unfreezeWorldMatrix();
        mesh.position.y = 0;
        mesh.freezeWorldMatrix();
      }
  });
  let shadowPasses = 0;
  let observedShadowMap: ReturnType<
    NonNullable<ReturnType<typeof sun.getShadowGenerator>>["getShadowMap"]
  > = null;
  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now(),
      dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const date = new Date();
    if (mode === "day") date.setUTCHours(12, 0, 0, 0);
    if (mode === "night") date.setUTCHours(22, 0, 0, 0);
    const instant = date.getTime(),
      sunPosition = sunState(instant),
      moon = moonState(instant);
    applyArtLighting(
      { scene, sun, ambient, lamps, lights: [], clouds: [], quality },
      { sun: sunPosition, moon, weather, player, dt, instant },
    );
    architecture.update(player);
    const wind = windVector(weather.wind, weather.windDirection);
    vegetation.update({
      dt,
      time: now / 1000,
      wind: { ...wind, speed: weather.wind },
      daylight: sunPosition.daylight,
      player,
      quality,
    });
    for (const mesh of scene.meshes)
      if (mesh.metadata?.vegetation === "grass") mesh.setEnabled(false);
    surfaces?.update(dt, quality, weather.rain);
    cinematic?.update({
      dt,
      player,
      quality,
      cloud: weather.cloud,
      daylight: sunPosition.daylight,
    });
    const shadowMap = sun.getShadowGenerator()?.getShadowMap();
    if (shadowMap && shadowMap !== observedShadowMap) {
      observedShadowMap = shadowMap;
      shadowMap.onAfterRenderObservable.add(() => shadowPasses++);
    }
    scene.render();
  });
  return {
    engine,
    scene,
    camera,
    sun,
    cinematic,
    surfaces,
    vegetation,
    architecture,
    get shadowPasses() {
      return shadowPasses;
    },
  };
}
scenes.push(create("before", false), create("after", true));
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(
  (button) =>
    (button.onclick = () => {
      const view = button.dataset.view;
      Object.assign(
        player,
        view === "shadows"
          ? { x: 20, y: 0, z: -90 }
          : view === "surface"
            ? { x: -16, y: 0, z: -62 }
            : { x: -22, y: 0, z: -55 },
      );
      for (const s of scenes) {
        if (view === "grass") {
          Object.assign(player, { x: -23, y: 0, z: -60 });
          s.camera.position.set(-23, 1.65, -62);
          s.camera.setTarget(new Vector3(-22, 0, -58));
        } else if (view === "surface") {
          s.camera.position.set(-16, 1.65, -62);
          s.camera.setTarget(new Vector3(-10, 0, -57));
        } else if (view === "shadows") {
          s.camera.position.set(37, 9, -110);
          s.camera.setTarget(new Vector3(8, 1, -84));
        } else {
          s.camera.position.set(-29, 4.6, -44);
          s.camera.setTarget(new Vector3(2, 6.3, -63));
        }
      }
      document
        .querySelectorAll("[data-view]")
        .forEach((other) =>
          other.setAttribute("aria-pressed", String(other === button)),
        );
    }),
);
const resize = () => scenes.forEach((s) => s.engine.resize());
addEventListener("resize", resize);
document.querySelectorAll<HTMLButtonElement>("[data-time]").forEach(
  (button) =>
    (button.onclick = () => {
      mode = button.dataset.time!;
      document
        .querySelectorAll("[data-time]")
        .forEach((other) =>
          other.setAttribute("aria-pressed", String(other === button)),
        );
    }),
);
document.querySelector<HTMLSelectElement>("#quality")!.onchange = (event) =>
  (quality = (event.target as HTMLSelectElement).value);
fetch("/api/weather")
  .then((r) => r.json())
  .then((data) => {
    weather = data;
    status.textContent = `Počasí: ${weather.source} (${weather.status}${weather.stale ? ", zastaralá data" : ""}); oblačnost: ${weather.cloudSource}. Pozorování: ${weather.observedAt ? new Date(weather.observedAt).toLocaleString("cs-CZ") : "nedostupné"}.`;
  })
  .catch(
    () =>
      (status.textContent =
        "Meteorologický server nedostupný; obě strany používají stejný výslovně výchozí náhled."),
  );
const diagnosticTimer = setInterval(() => {
  const scene = scenes[1];
  diagnostics.textContent = JSON.stringify(
    {
      instant: new Date().toISOString(),
      mode,
      quality,
      weather: {
        source: weather.source,
        status: weather.status,
        cloud: weather.cloud,
        rain: weather.rain,
      },
      gpu: scene.engine.getGlInfo(),
      resolution: {
        css: [
          scene.engine.getRenderingCanvas()!.clientWidth,
          scene.engine.getRenderingCanvas()!.clientHeight,
        ],
        internal: [
          scene.engine.getRenderWidth(),
          scene.engine.getRenderHeight(),
        ],
      },
      materials: scene.scene.materials.length,
      windows: scene.scene.materials
        .filter((m) => m.metadata?.nightWindows)
        .map((m) => ({
          name: m.name,
          mask: (m as StandardMaterial).emissiveTexture?.name,
          level: (m as StandardMaterial).emissiveTexture?.level,
          illumination: (m as StandardMaterial).useEmissiveAsIllumination,
          alpha: m.alpha,
          visibleMeshes: scene.scene.meshes.filter(
            (mesh) => mesh.material === m && mesh.isEnabled() && mesh.isVisible,
          ).length,
        })),
      shadowPasses: scene.shadowPasses,
      shadowEnabled: scene.sun.shadowEnabled,
      sunDirection: scene.sun.direction.asArray(),
      sunIntensity: scene.sun.intensity,
      surfaceChannels: scene.scene.materials
        .filter((m) => m.metadata?.physicallyBased)
        .map((m) => ({
          name: m.name,
          family: m.metadata.materialFamily,
          textures: m.getActiveTextures().map((t) => ({
            url: t.name,
            ready: t.isReady(),
            size: t.getSize(),
            gamma: t.gammaSpace,
          })),
        })),
      diagnosticOnly: true,
      ...scene.cinematic?.stats,
    },
    null,
    2,
  );
}, 1000);
const dispose = () => {
  clearInterval(diagnosticTimer);
  removeEventListener("resize", resize);
  for (const s of scenes) {
    s.engine.stopRenderLoop();
    s.vegetation.dispose();
    s.architecture.dispose();
    s.cinematic?.dispose();
    s.surfaces?.dispose();
    s.scene.dispose();
    s.engine.dispose();
  }
};
import.meta.hot?.dispose(dispose);
addEventListener("beforeunload", dispose, { once: true });
