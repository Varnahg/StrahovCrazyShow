import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { buildLandmarkReality } from "../../../client/landmark-reality";
import { buildArchitectureReality } from "../../../client/architecture-reality";
import { buildTerrain } from "../../../client/terrain-renderer";
import { buildStreets } from "../../../client/streets-renderer";
import { buildLandcover } from "../../../client/vegetation";
import { SurfacePack } from "../../../client/surface-pack";
import { CinematicAtmosphere } from "../../../client/cinematic";
import {
  BUILDINGS,
  GROUND_RECTS,
  TERRAIN_COVERAGE,
} from "../../../shared/world";
import { buildingBaseHeight, groundHeight } from "../../../shared/terrain";
import { B1_OSM_ID, LANDMARK_SOURCE } from "../../../shared/landmark-reality";

const canvas = document.querySelector<HTMLCanvasElement>("#preview")!,
  engine = new Engine(canvas, true),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.58, 0.69, 0.73, 1);
const camera = new ArcRotateCamera(
  "inspection",
  0,
  1.2,
  60,
  Vector3.Zero(),
  scene,
);
camera.minZ = 0.1;
camera.maxZ = 1800;
camera.attachControl(canvas, true);
const sun = new DirectionalLight(
  "sun",
  new Vector3(-0.55, -0.75, -0.25),
  scene,
);
sun.intensity = 1.2;
const sky = new HemisphericLight("sky", Vector3.Up(), scene);
sky.intensity = 0.72;
sky.groundColor = new Color3(0.27, 0.31, 0.25);
buildTerrain({ scene, rects: GROUND_RECTS, bounds: TERRAIN_COVERAGE });
buildLandcover(scene);
buildStreets({ scene, lights: [] });
const architecture = buildArchitectureReality({
  scene,
  buildings: BUILDINGS.filter((b) => b.id !== B1_OSM_ID),
  baseElevation: (_x, _z, b) => buildingBaseHeight(b.points),
});
const landmarks = buildLandmarkReality({ scene, buildings: BUILDINGS });
const surfaces = new SurfacePack(scene);
const cinematic = new CinematicAtmosphere(scene, camera, sun);
const human = MeshBuilder.CreateCapsule(
    "1.75 m scale reference",
    { height: 1.75, radius: 0.25 },
    scene,
  ),
  hm = new StandardMaterial("scale reference coat", scene);
hm.diffuseColor = Color3.FromHexString("#7b3c2c");
human.material = hm;
const views: Record<
  string,
  {
    eye: [number, number, number];
    target: [number, number, number];
    reference: string;
  }
> = {
  b1: {
    eye: [-105, groundHeight(-105, 20) + 6, 18],
    target: [
      -83,
      buildingBaseHeight(BUILDINGS.find((b) => b.id === B1_OSM_ID)!.points) +
        4.2,
      50,
    ],
    reference: LANDMARK_SOURCE.b1Photo,
  },
  entry: {
    eye: [-31, groundHeight(-31, 44) + 2.7, 44],
    target: [-28.3, groundHeight(-28.3, 55.8) + 2.5, 55.8],
    reference: LANDMARK_SOURCE.entrancePhoto,
  },
  "stadium-east": {
    eye: [-93, groundHeight(-93, 15) + 5, 15],
    target: [-145, landmarks.plan.stadium.baseY + 11, 10],
    reference: LANDMARK_SOURCE.stadiumPhoto,
  },
  "stadium-south": {
    eye: [-279, groundHeight(-279, 274) + 5, 274],
    target: [-278, landmarks.plan.stadium.baseY + 11, 211],
    reference: LANDMARK_SOURCE.stadiumConstruction,
  },
  "stadium-aerial": {
    eye: [-40, landmarks.plan.stadium.baseY + 230, 440],
    target: [-287, landmarks.plan.stadium.baseY + 6, 15],
    reference: LANDMARK_SOURCE.stadiumPhoto,
  },
};
function view(key: string) {
  const v = views[key];
  camera.setTarget(Vector3.FromArray(v.target));
  camera.setPosition(Vector3.FromArray(v.eye));
  document.querySelector<HTMLAnchorElement>("#reference")!.href = v.reference;
  human.position.set(
    key === "entry" ? -36 : -80,
    groundHeight(key === "entry" ? -36 : -80, key === "entry" ? 62.5 : 35) +
      0.875,
    key === "entry" ? 62.5 : 35,
  );
}
document
  .querySelector<HTMLSelectElement>("#view")!
  .addEventListener("change", (e) =>
    view((e.target as HTMLSelectElement).value),
  );
view("b1");
document.querySelector<HTMLOutputElement>("#metrics")!.textContent =
  JSON.stringify(landmarks.metrics, null, 2);
engine.runRenderLoop(() => {
  const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
  architecture.update(camera.position, "high");
  landmarks.update(camera.position, "high");
  surfaces.update(dt, "high", 0);
  cinematic.update({
    dt,
    player: camera.position,
    quality: "high",
    cloud: 20,
    daylight: 1,
  });
  scene.render();
});
window.addEventListener("resize", () => engine.resize());
