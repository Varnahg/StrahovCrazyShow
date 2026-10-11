import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
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
import { B1_OSM_ID } from "../../../shared/landmark-reality";
const canvas = document.querySelector<HTMLCanvasElement>("#preview")!,
  engine = new Engine(canvas, true),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.47, 0.66, 0.83, 1);
scene.fogColor = new Color3(0.65, 0.73, 0.77);
const camera = new ArcRotateCamera(
  "stadium photo inspection",
  0,
  1.3,
  80,
  Vector3.Zero(),
  scene,
);
camera.minZ = 0.08;
camera.maxZ = 1800;
camera.fov = 0.95;
camera.attachControl(canvas, true);
const sun = new DirectionalLight("sun", new Vector3(-0.6, -0.8, 0.25), scene);
sun.intensity = 1.15;
const sky = new HemisphericLight("sky", Vector3.Up(), scene);
sky.intensity = 0.72;
sky.groundColor = new Color3(0.24, 0.27, 0.22);
buildTerrain({ scene, rects: GROUND_RECTS, bounds: TERRAIN_COVERAGE });
buildLandcover(scene);
buildStreets({ scene, lights: [] });
const architecture = buildArchitectureReality({
    scene,
    buildings: BUILDINGS.filter((b) => b.id !== B1_OSM_ID),
    baseElevation: (_x, _z, b) => buildingBaseHeight(b.points),
  }),
  landmarks = buildLandmarkReality({ scene, buildings: BUILDINGS }),
  surfaces = new SurfacePack(scene),
  cinematic = new CinematicAtmosphere(scene, camera, sun);
const base = landmarks.plan.stadium.east.baseY;
const views: Record<
  string,
  { eye: [number, number, number]; target: [number, number, number] }
> = {
  north: {
    eye: [-127, groundHeight(-127, -34) + 1.7, -34],
    target: [-138, base + 8.5, 24],
  },
  south: {
    eye: [-126.5, groundHeight(-126.5, 49) + 1.7, 49],
    target: [-138.5, base + 8, 8],
  },
  portal: {
    eye: [-128, groundHeight(-128, 17.5) + 1.7, 17.5],
    target: [-151, base + 1.8, 17.8],
  },
  campus: {
    eye: [-132, groundHeight(-132, 12) + 1.7, 12],
    target: [18, 10, -48],
  },
  aerial: { eye: [-30, base + 230, 440], target: [-287, base + 7, 15] },
};
function view(key: string) {
  const v = views[key] ?? views.south;
  camera.setTarget(Vector3.FromArray(v.target));
  camera.setPosition(Vector3.FromArray(v.eye));
}
const select = document.querySelector<HTMLSelectElement>("#view")!;
select.addEventListener("change", () => view(select.value));
const initial = new URLSearchParams(location.search).get("view") ?? "south";
select.value = initial;
view(initial);
document.querySelector<HTMLOutputElement>("#metrics")!.textContent =
  JSON.stringify(
    {
      webGL: engine.webGLVersion,
      renderer: engine.getGlInfo().renderer,
      component: landmarks.metrics,
      stadiumMeshBatches: landmarks.meshes.filter(
        (m) => m.metadata.landmark === "stadium",
      ).length,
    },
    null,
    2,
  );
engine.runRenderLoop(() => {
  const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
  architecture.update(camera.position, "high");
  landmarks.update(camera.position, "high");
  surfaces.update(dt, "high", 0);
  cinematic.update({
    dt,
    player: camera.position,
    quality: "high",
    cloud: 0.15,
    daylight: 1,
  });
  scene.render();
});
window.addEventListener("resize", () => engine.resize());
