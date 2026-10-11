import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { loadVegetation } from "../../client/vegetation";
import { buildTerrain } from "../../client/terrain-renderer";
import { TREES, BOUNDS } from "../../shared/world";
import { groundHeight } from "../../shared/terrain";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const engine = new Engine(canvas, true, {
  powerPreference: "high-performance",
});
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.47, 0.65, 0.78, 1);
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType =
  ImageProcessingConfiguration.TONEMAPPING_ACES;
const camera = new ArcRotateCamera(
  "tree inspection",
  -0.8,
  1.2,
  28,
  Vector3.Zero(),
  scene,
);
camera.attachControl(canvas, true);
camera.minZ = 0.1;
camera.lowerRadiusLimit = 3;
camera.upperRadiusLimit = 90;
new HemisphericLight("sky", new Vector3(0, 1, 0), scene).intensity = 0.75;
const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.25), scene);
sun.intensity = 2.3;
sun.position.set(0, 40, 0);
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
terrain.mesh.receiveShadows = true;
(terrain.mesh.material as StandardMaterial).diffuseColor =
  Color3.FromHexString("#64764d");
const shadow = new ShadowGenerator(1024, sun);
shadow.usePercentageCloserFiltering = true;
shadow.bias = 0.0002;
shadow.normalBias = 0.025;
const vegetation = await loadVegetation(scene);
let selected = TREES.find((t) => t.osmId === "ipr-crown-031")!,
  time = 0,
  wind = 0;
function select(id: string) {
  selected = TREES.find((t) => t.osmId === id)!;
  const y = groundHeight(selected.x, selected.z);
  camera.setTarget(
    new Vector3(
      selected.x,
      y + (selected.reconstruction?.height ?? 12) * 0.47,
      selected.z,
    ),
  );
  camera.radius = Math.max(20, (selected.reconstruction?.height ?? 12) * 1.9);
  sun.position.set(selected.x + 15, y + 35, selected.z - 12);
  document.querySelector("#state")!.textContent =
    selected.osmId + " · " + selected.reconstruction?.appearance;
}
document
  .querySelectorAll<HTMLButtonElement>("[data-tree]")
  .forEach((b) => (b.onclick = () => select(b.dataset.tree!)));
document.querySelector<HTMLButtonElement>("#wind")!.onclick = () => {
  wind = wind ? 0 : 10;
  document.querySelector("#wind")!.textContent = `Vítr ${wind} m/s`;
};
select(selected.osmId);
let lastAudit = 0;
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  time += dt;
  vegetation.update({
    dt,
    time,
    wind: { x: 1, z: 0.2, speed: wind },
    daylight: 0.8,
    player: {
      x:
        selected.x +
        Number(
          document.querySelector<HTMLSelectElement>("#lod-distance")!.value,
        ),
      y: groundHeight(selected.x, selected.z),
      z: selected.z,
    },
    quality: document.querySelector<HTMLSelectElement>("#quality")!.value,
  });
  if (time - lastAudit > 1) {
    lastAudit = time;
    const meshes = scene.meshes.filter(
      (m) => m.metadata?.sourceTreeModel === selected.osmId,
    );
    shadow.getShadowMap()!.renderList = meshes.filter((m) => m.isEnabled());
    document.querySelector("#audit")!.textContent = JSON.stringify(
      {
        selectedId: selected.osmId,
        stats: vegetation.stats,
        materials: scene.materials
          .filter((m) => m instanceof PBRMaterial)
          .map((m) => ({
            name: m.name,
            type: m.getClassName(),
            alphaTest: m.needAlphaTesting(),
            colorGamma: (m as PBRMaterial).albedoTexture?.gammaSpace,
            colorHardwareSRGB: (
              m as PBRMaterial
            ).albedoTexture?.getInternalTexture()?._useSRGBBuffer,
            normalGamma: (m as PBRMaterial).bumpTexture?.gammaSpace,
          })),
        nativeGround: groundHeight(selected.x, selected.z),
        rootHeight: meshes[0]?.parent?.position.y,
        activeLODs: [
          ...new Set(
            meshes
              .filter((m) => m.isEnabled())
              .map((m) => m.metadata.detailLevel),
          ),
        ],
      },
      null,
      2,
    );
  }
  scene.render();
});
window.addEventListener("resize", () => engine.resize());
