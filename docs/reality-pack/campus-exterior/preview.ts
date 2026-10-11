import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { buildTerrain } from "../../../client/terrain-renderer";
import { createCampusExterior } from "../../../client/campus-exterior";
import { buildArchitectureReality } from "../../../client/architecture-reality";
import { buildingBaseHeight } from "../../../shared/terrain";
import map from "../../../shared/data/map.json";
import type { Building } from "../../../shared/types";
import { SurfacePack } from "../../../client/surface-pack";
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!,
  engine = new Engine(canvas, true, { powerPreference: "high-performance" }),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.64, 0.72, 0.75, 1);
new HemisphericLight("hemisphere", new Vector3(0, 1, 0), scene).intensity =
  0.85;
const sun = new DirectionalLight("sun", new Vector3(-0.6, -1, 0.35), scene);
sun.intensity = 2.1;
sun.diffuse = new Color3(1, 0.96, 0.88);
const camera = new ArcRotateCamera(
  "source-inspection",
  Math.PI / 2,
  0.62,
  150,
  new Vector3(20, -1, 0),
  scene,
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 5;
camera.upperRadiusLimit = 300;
camera.minZ = 0.1;
buildTerrain({
  scene,
  rects: [{ x: 40, z: -20, w: 230, d: 190 }],
  bounds: { minX: -75, maxX: 155, minZ: -115, maxZ: 75 },
});
const surfaces = new SurfacePack(scene);
const buildings = (map.buildings as unknown as Building[]).filter(
  (b) => b.id === "7645350",
);
buildArchitectureReality({
  scene,
  buildings,
  baseElevation: (_x, _z, b) => buildingBaseHeight(b.points),
});
const controller = createCampusExterior(scene);
surfaces.update(1, "high", 0);
controller.update(0, 12, "high");
let detail = true;
const update = () =>
  (document.querySelector("#status")!.textContent =
    `${controller.stats.meshes} meshů · ${detail ? controller.stats.nearTriangles : controller.stats.farTriangles} trojúhelníků · 5 skutečných hřišť`);
update();
document.querySelector("#overview")!.addEventListener("click", () => {
  camera.setTarget(new Vector3(25, -1, 0));
  camera.alpha = Math.PI / 2;
  camera.beta = 0.3;
  camera.radius = 160;
});
document.querySelector("#courts")!.addEventListener("click", () => {
  camera.setTarget(new Vector3(5, -0.6, 8));
  camera.alpha = Math.PI / 2 + 0.35;
  camera.beta = 1.55;
  camera.radius = 58;
});
document.querySelector("#market")!.addEventListener("click", () => {
  camera.setTarget(new Vector3(114, 0, -63));
  camera.alpha = 0.2;
  camera.beta = 1.12;
  camera.radius = 48;
});
document.querySelector("#lod")!.addEventListener("click", () => {
  detail = !detail;
  controller.update(detail ? 0 : 440, detail ? 12 : 340, "low");
  update();
});
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
