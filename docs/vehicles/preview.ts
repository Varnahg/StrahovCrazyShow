import "../../client/render-shaders";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";
import { CinematicAtmosphere } from "../../client/cinematic";
import { applyArtLighting } from "../../client/art-lighting";
import { sunState, moonState } from "../../shared/weather";
import { VEHICLE_WHEELS } from "../../shared/vehicle";

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const engine = new Engine(canvas, true, {
    powerPreference: "high-performance",
  }),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
const errors: string[] = [];
scene.onNewMaterialAddedObservable.add((material) => {
  material.onError = (_effect, error) => errors.push(error);
});
const camera = new ArcRotateCamera(
  "inspect actual car",
  -0.75,
  1.1,
  6.2,
  new Vector3(0, 0.7, 0),
  scene,
);
camera.minZ = 0.03;
camera.maxZ = 150;
camera.lowerRadiusLimit = 0.6;
camera.upperRadiusLimit = 15;
camera.attachControl(canvas, true);
const sun = new DirectionalLight("astronomical key", Vector3.Down(), scene),
  ambient = new HemisphericLight("sky fill", Vector3.Up(), scene);
const fixtures = new StandardMaterial("simulated practical fixtures", scene),
  cinematic = new CinematicAtmosphere(scene, camera, sun);
const ground = MeshBuilder.CreateGround(
    "studio support plane",
    { width: 20, height: 20 },
    scene,
  ),
  groundMat = new PBRMaterial("neutral support plane", scene);
groundMat.albedoColor.set(0.15, 0.17, 0.18);
groundMat.roughness = 0.85;
groundMat.metallic = 0;
ground.material = groundMat;
ground.metadata = { depthCaster: false };
let container: AssetContainer | undefined,
  wheels: TransformNode[] = [],
  moving = false,
  paint: PBRMaterial | undefined,
  colour = 0,
  instant = Date.parse("2026-10-11T10:00:00Z"),
  last = performance.now(),
  diagnostic = 0;
const carRoot = new TransformNode("one independent car entity", scene);
carRoot.position.y = -0.0112;
let model = "near",
  sourceTriangles = 0;
async function load() {
  container?.dispose();
  wheels.forEach((w) => w.dispose(false, false));
  wheels = [];
  errors.length = 0;
  container = await LoadAssetContainerAsync(
    "/models/vehicles/campus-hatchback-" + model + ".glb",
    scene,
  );
  container.addAllToScene();
  sourceTriangles = container.meshes.reduce(
    (sum, m) => sum + m.getTotalIndices() / 3,
    0,
  );
  for (const root of container.rootNodes) root.parent = carRoot;
  for (let i = 0; i < 4; i++) {
    const w = new TransformNode("actual wheel pivot " + i, scene);
    w.parent = carRoot;
    w.position.set(VEHICLE_WHEELS[i].x, 0.36, VEHICLE_WHEELS[i].z);
    wheels.push(w);
  }
  for (const mesh of container.meshes) {
    const id = /^Wheel([0-3]):/.exec(mesh.name);
    if (id) mesh.setParent(wheels[Number(id[1])]);
    mesh.isPickable = false;
  }
  for (const material of container.materials)
    if (material instanceof PBRMaterial && material.name === "Campus enamel")
      paint = material;
}
document.querySelector<HTMLSelectElement>("#model")!.onchange = () => {
  model = document.querySelector<HTMLSelectElement>("#model")!.value;
  void load().catch((e) => errors.push(String(e)));
};
for (const [id, p] of Object.entries({
  front: [4, 2.5, 5],
  rear: [-4, 2.2, -5],
  side: [5, 1.8, 0],
  seams: [2, 1.7, 2.5],
  under: [3, -1.5, 4],
}))
  document
    .querySelector("#" + id)!
    .addEventListener("click", () => camera.setPosition(Vector3.FromArray(p)));
document.querySelector("#wheels")!.addEventListener("click", () => {
  moving = !moving;
});
document.querySelector("#colour")!.addEventListener("click", () => {
  const colours = ["#6f2c25", "#d9dddb", "#242d37", "#aeaa96", "#335b6a"];
  paint?.albedoColor.copyFrom(
    Color3.FromHexString(colours[colour++ % colours.length]).toLinearSpace(),
  );
});
document
  .querySelector("#day")!
  .addEventListener(
    "click",
    () => (instant = Date.parse("2026-10-11T10:00:00Z")),
  );
document
  .querySelector("#night")!
  .addEventListener(
    "click",
    () => (instant = Date.parse("2026-10-11T00:00:00Z")),
  );
engine.runRenderLoop(() => {
  const now = performance.now(),
    dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const solar = sunState(instant),
    moon = moonState(instant);
  applyArtLighting(
    {
      scene,
      sun,
      ambient,
      lamps: fixtures,
      lights: [],
      clouds: [],
      quality: "high",
    },
    {
      sun: solar,
      moon,
      instant,
      dt,
      player: carRoot.position,
      weather: { cloud: 0.2, rain: 0, wind: 0 },
    },
  );
  if (moving)
    wheels.forEach((w, i) => {
      w.rotationQuaternion = Quaternion.RotationAxis(
        Vector3.Up(),
        i < 2 ? Math.sin(now / 1300) * 0.35 : 0,
      ).multiply(Quaternion.RotationAxis(Vector3.Right(), now / 300));
      w.position.y = 0.36 + Math.sin(now / 850 + i) * 0.025;
    });
  cinematic.update({
    dt,
    player: carRoot.position,
    quality: "high",
    cloud: 0.2,
    daylight: solar.daylight,
  });
  scene.render();
  if (now - diagnostic > 500) {
    diagnostic = now;
    const meshes = container?.meshes.filter((m) => m.getTotalVertices()) ?? [];
    document.querySelector("#stats")!.textContent = JSON.stringify(
      {
        model,
        triangles: sourceTriangles,
        meshParts: meshes.length,
        wheelPivots: wheels.map((w) => ({
          position: w.position.asArray(),
          rotation: w.rotationQuaternion?.asArray(),
        })),
        moving,
        ready: meshes.length > 0 && meshes.every((m) => m.isReady(true)),
        errors,
        renderer: engine.getGlInfo().renderer,
        measuredGameFps: false,
      },
      null,
      2,
    );
  }
});
void load().catch((e) => errors.push(String(e)));
addEventListener("resize", () => engine.resize());
addEventListener(
  "pagehide",
  () => {
    cinematic.dispose();
    container?.dispose();
    scene.dispose();
    engine.dispose();
  },
  { once: true },
);
