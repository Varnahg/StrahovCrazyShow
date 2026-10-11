import "../../client/render-shaders";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { SurfacePack } from "../../client/surface-pack";
import { CinematicAtmosphere } from "../../client/cinematic";
import { applyArtLighting } from "../../client/art-lighting";
import { sunState, moonState } from "../../shared/weather";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const engine = new Engine(canvas, true, {
  powerPreference: "high-performance",
});
const scene = new Scene(engine);
const shaderErrors: string[] = [];
scene.onNewMaterialAddedObservable.add((material) => {
  material.onError = (_effect, error) => shaderErrors.push(error);
});
scene.useRightHandedSystem = true;
scene.clearColor.set(0.37, 0.48, 0.57, 1);
scene.fogColor.set(0.68, 0.73, 0.74);
const camera = new ArcRotateCamera(
  "study",
  -Math.PI / 2,
  0.78,
  55,
  new Vector3(0, 0, 3),
  scene,
);
camera.attachControl(canvas, true);
camera.minZ = 0.2;
const sun = new DirectionalLight("sun", new Vector3(0.35, -0.8, 0.4), scene);
sun.diffuse.set(1, 0.96, 0.88);
sun.intensity = 1;
const ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
ambient.diffuse.set(0.73, 0.82, 0.89);
ambient.groundColor.set(0.2, 0.22, 0.19);
ambient.intensity = 0.6;
const kinds = [
  "asphalt",
  "paving",
  "concrete",
  "grass",
  "sett",
  "gravel",
  "plaster",
];
for (const [index, kind] of kinds.entries()) {
  const ground = MeshBuilder.CreateGround(
    kind,
    { width: 10, height: 25 },
    scene,
  );
  ground.position.x = (index - 3) * 10;
  ground.position.z = 3;
  const uv = ground
    .getVerticesData("uv")!
    .map((value: number, i: number) => (value * (i % 2 === 0 ? 10 : 25)) / 4);
  ground.setVerticesData("uv", uv);
  ground.metadata = { depthCaster: false };
  const material = new StandardMaterial(kind, scene);
  material.diffuseColor = Color3.White();
  material.metadata = { surfaceKind: kind, uvMetresPerRepeat: 4 };
  material.onError = (_effect, error) =>
    (document.querySelector("#stats")!.textContent = error);
  ground.material = material;
  if (kind === "concrete" || kind === "plaster") {
    const box = MeshBuilder.CreateBox(
      kind + " wall",
      { width: 8, height: 5, depth: 0.35 },
      scene,
    );
    box.position.set(ground.position.x, 2.5, 13);
    box.material = material;
  }
}
const prop = MeshBuilder.CreateBox(
  "neutral gray prop",
  { width: 2, height: 2, depth: 3 },
  scene,
);
prop.position.set(-29, 1, 0);
const propMat = new StandardMaterial("prop", scene);
propMat.diffuseColor.set(0.42, 0.45, 0.46);
prop.material = propMat;
const pack = new SurfacePack(scene),
  cinematic = new CinematicAtmosphere(scene, camera, sun);
const fixture = new StandardMaterial("study practical fixtures", scene);
const lamp = new PointLight(
  "simulated study lamp, not a mapped location",
  new Vector3(-29, 4, 2),
  scene,
);
lamp.diffuse.set(1, 0.76, 0.45);
lamp.range = 18;
lamp.falloffType = Light.FALLOFF_STANDARD;
lamp.setEnabled(false);
const lampBulb = MeshBuilder.CreateSphere(
  "study lamp bulb",
  { diameter: 0.2 },
  scene,
);
lampBulb.position.copyFrom(lamp.position);
lampBulb.material = fixture;
const windowMaterial = new StandardMaterial(
  "study simulated room lights",
  scene,
);
windowMaterial.metadata = { nightWindows: true };
windowMaterial.emissiveTexture = RawTexture.CreateRGBATexture(
  new Uint8Array([245, 172, 86, 255]),
  1,
  1,
  scene,
);
for (const x of [-11.5, -8.5]) {
  const window = MeshBuilder.CreateBox(
    "simulated study window",
    { width: 1.3, height: 1.5, depth: 0.04 },
    scene,
  );
  window.position.set(x, 3.1, 12.8);
  window.material = windowMaterial;
}
let quality = "high",
  daylight = 1,
  instant = Date.parse("2026-10-11T10:00:00Z"),
  cloud = 0,
  frames = 0,
  errors: string[] = [];
document.querySelector("#day")!.addEventListener("click", () => {
  daylight = 1;
  instant = Date.parse("2026-10-11T10:00:00Z");
});
document.querySelector("#night")!.addEventListener("click", () => {
  daylight = 0;
  instant = Date.parse("2026-10-11T00:00:00Z");
});
for (const [id, value] of [
  ["clear", 0],
  ["overcast", 1],
] as const)
  document
    .querySelector("#" + id)!
    .addEventListener("click", () => (cloud = value));
for (const value of ["low", "high"])
  document
    .querySelector("#" + value)!
    .addEventListener("click", () => (quality = value));
engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000;
  const solar = sunState(instant),
    moon = moonState(instant);
  daylight = solar.daylight;
  const lighting = applyArtLighting(
    {
      scene,
      sun,
      ambient,
      lamps: fixture,
      lights: [lamp],
      clouds: [],
      quality,
    },
    {
      sun: solar,
      moon,
      instant,
      dt,
      player: { x: -27, y: 1, z: 2 },
      weather: { cloud, rain: 0, wind: 0 },
    },
  );
  pack.update(dt, quality, 0);
  cinematic.update({
    dt,
    player: { x: 0, y: 0, z: 0 },
    quality,
    cloud,
    daylight,
  });
  scene.render();
  if (++frames % 30 === 0) {
    const artMeshes = scene.meshes.filter(
      (m) => m.material?.metadata?.campusArtDirection,
    );
    const effects = artMeshes.flatMap((mesh) =>
      (mesh.subMeshes ?? []).map((sub) => sub.effect),
    );
    const ready =
      effects.length === 9 && effects.every((effect) => effect?.isReady());
    const compiledMacroShaders = effects.filter((effect) =>
      effect?.fragmentSourceCode.includes("campusArtVariation"),
    ).length;
    errors = effects
      .map((effect) => effect?.getCompilationError() ?? "")
      .filter(Boolean);
    document.querySelector("#stats")!.textContent = JSON.stringify({
      quality,
      daylight,
      instantUtc: new Date(instant).toISOString(),
      localPrague: new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Prague",
        dateStyle: "short",
        timeStyle: "short",
      }).format(instant),
      cloud,
      solarAltitudeDegrees: (solar.altitude * 180) / Math.PI,
      moonAltitudeDegrees: (moon.altitude * 180) / Math.PI,
      moonFraction: moon.fraction,
      lighting: {
        ambient: ambient.intensity,
        celestialKey: sun.intensity,
        cloudEmission: lighting.cloudEmission,
        surfaceIllumination: lighting.surfaceIllumination,
        exposure: scene.imageProcessingConfiguration.exposure,
        environment: scene.environmentIntensity,
        activePracticalLights: lamp.isEnabled() ? 1 : 0,
        practicalFalloff: lamp.falloffType,
        practicalRangeMetres: lamp.range,
      },
      frames,
      ready,
      compiledMacroShaders,
      errors: [...new Set([...errors, ...shaderErrors])],
      measuredGameFps: false,
      renderer: engine.getGlInfo().renderer,
    });
  }
});
addEventListener("resize", () => engine.resize());
