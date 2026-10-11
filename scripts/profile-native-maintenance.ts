import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { buildStreets } from "../client/streets-renderer";
import { buildTerrain, buildRealityGround } from "../client/terrain-renderer";
import "@babylonjs/loaders/glTF";
import { loadCar } from "../client/assets";
import { SurfacePack } from "../client/surface-pack";
import { CinematicAtmosphere, shadowCasterKind } from "../client/cinematic";
import { captureRenderCostInventory } from "../client/render-cost";
import { treeDetailLevel } from "../shared/vegetation";
import { groundHeight } from "../shared/terrain";
import { SPAWN, TREES, GROUND_RECTS, TERRAIN_COVERAGE } from "../shared/world";
import { sunState } from "../shared/weather";

// Explicit CPU-only resource stand-in: NullEngine has no raw cube uploader.
// No GPU time, rendered-frame time or FPS is obtained from this script.
class CpuSceneEngine extends NullEngine {
  override createRawCubeTexture(
    ...args: Parameters<NullEngine["createRawCubeTexture"]>
  ) {
    const texture = new InternalTexture(this, InternalTextureSource.CubeRaw);
    texture.isCube = true;
    texture.width =
      texture.height =
      texture.baseWidth =
      texture.baseHeight =
        args[1];
    texture.isReady = true;
    return texture;
  }
}
const hash = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const treePath =
  "public/models/vegetation/realistic/strahov-individual-trees.glb";
const sourceFiles = [
  treePath,
  "public/models/strahov-compact.glb",
  "client/cinematic.ts",
  "client/surface-pack.ts",
  "client/labels.ts",
  "client/render-cost.ts",
  "shared/vegetation.ts",
  "shared/data/landcover.json",
  "scripts/profile-native-maintenance.ts",
  "client/streets-renderer.ts",
  "client/terrain-renderer.ts",
  "shared/terrain.ts",
  "shared/streets.ts",
  "shared/world.ts",
];
const sourceHashes = Object.fromEntries(
  sourceFiles.map((file) => [file, hash(file)]),
);
const treeBytes = readFileSync(treePath);
const gltf = JSON.parse(
  treeBytes.subarray(20, 20 + treeBytes.readUInt32LE(12)).toString(),
);
const engine = new CpuSceneEngine(),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.useDelayedTextureLoading = true;
const camera = new UniversalCamera(
  "CPU inventory camera",
  new Vector3(SPAWN.x, 4, SPAWN.z - 5),
  scene,
);
camera.setTarget(new Vector3(SPAWN.x, 1, SPAWN.z));
scene.activeCamera = camera;
const start = performance.now();
buildTerrain({ scene, rects: GROUND_RECTS, bounds: TERRAIN_COVERAGE });
buildRealityGround({ scene });
buildStreets({ scene, lights: [] });
const treeContainer = await LoadAssetContainerAsync(
  new Uint8Array(treeBytes),
  scene,
  {
    pluginExtension: ".glb",
    // Actual untouched binary geometry; texture decoding is excluded explicitly.
    pluginOptions: { gltf: { skipMaterials: true } },
  },
);
treeContainer.addAllToScene();
const treeGeometryMaterial = new StandardMaterial(
  "CPU-only untextured tree geometry surrogate",
  scene,
);
const roots = new Map(
  TREES.map((tree) => {
    const root = new TransformNode("source tree " + tree.osmId, scene);
    root.position.set(tree.x, groundHeight(tree.x, tree.z), tree.z);
    root.metadata = { sourceTreeId: tree.osmId };
    return [tree.osmId, root];
  }),
);
for (const mesh of treeContainer.meshes) {
  if (!(mesh instanceof Mesh)) continue;
  const match = /^tree__(.+)__lod([012])__(bark|leaves)$/.exec(mesh.name);
  const tree = match && TREES.find((tree) => tree.osmId === match[1]);
  if (!match || !tree) {
    mesh.setEnabled(false);
    continue;
  }
  mesh.parent = roots.get(tree.osmId)!;
  mesh.material = treeGeometryMaterial;
  mesh.rotationQuaternion = Quaternion.Identity();
  mesh.rotation.setAll(0);
  mesh.scaling.setAll(1);
  mesh.position.setAll(0);
  mesh.metadata = {
    vegetation: "tree",
    detailLevel: Number(match[2]),
    windDeformed: match[3] === "leaves",
    depthCaster: match[3] === "leaves" ? false : "opaque",
  };
  // Leaves are not solar casters on low in the real game either. Their material
  // alpha testing cannot be tested here because texture loading is excluded.
  mesh.setEnabled(
    Number(match[2]) ===
      treeDetailLevel(Math.hypot(tree.x - SPAWN.x, tree.z - SPAWN.z), "low"),
  );
  mesh.computeWorldMatrix(true);
}
const cars = await loadCar(scene, {
  assetSource: new Uint8Array(
    readFileSync("public/models/strahov-compact.glb"),
  ),
});
const constructionCpuMs = performance.now() - start;
const pack = new SurfacePack(scene);
await new Promise((resolve) => setTimeout(resolve, 10));
pack.update(1, "low", 0);
const maintenanceStart = { ...pack.stats };
for (let i = 0; i < 600; i++) pack.update(1 / 60, "low", 0);
const maintenanceDelta = Object.fromEntries(
  Object.keys(pack.stats).map((key) => [
    key,
    pack.stats[key as keyof typeof pack.stats] -
      maintenanceStart[key as keyof typeof pack.stats],
  ]),
);
const diagnostic = JSON.parse(
  readFileSync(
    "docs/model-review/evidence/native-scene-diagnostic.json",
    "utf8",
  ),
);
const sunPosition = sunState(diagnostic.sceneView.lightingInstant);
const sun = new DirectionalLight(
  "CPU shadow inventory",
  new Vector3(-sunPosition.x, -sunPosition.y, -sunPosition.z),
  scene,
);
sun.intensity = 1;
const atmosphere = new CinematicAtmosphere(scene, camera, sun);
atmosphere.update({
  dt: 0,
  player: { ...SPAWN, y: groundHeight(SPAWN.x, SPAWN.z) + 0.82 },
  quality: "low",
  cloud: 0.4,
  daylight: sunPosition.daylight,
});
const map = sun.getShadowGenerator()!.getShadowMap()!;
const legacyActive = map.renderList!.filter((mesh) => shadowCasterKind(mesh));
scene.incrementRenderId();
const filtered = map.getCustomRenderList!(
  0,
  map.renderList!,
  map.renderList!.length,
)!;
const triangles = (meshes: typeof filtered) =>
  meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0);
const report = {
  date: new Date().toISOString(),
  scope:
    "CPU-only actual native terrain/street/tree/car geometry construction; trees use one explicit untextured surrogate material. Excludes real tree materials/textures, architecture, B6, avatars, grass, HUD and GPU",
  sourceHashes,
  sourceHashesStable: sourceFiles.every(
    (file) => sourceHashes[file] === hash(file),
  ),
  referenceWholeGameDiagnostic: {
    path: "docs/model-review/evidence/native-scene-diagnostic.json",
    sha256: hash("docs/model-review/evidence/native-scene-diagnostic.json"),
    provisional: true,
    fps: diagnostic.averageFps,
    cpuMs: diagnostic.frameWork.cpuMs,
    gpuMs: diagnostic.frameWork.gpuMs,
    meshes: diagnostic.modelReview.length,
    drawCalls: diagnostic.drawCalls,
    renderer: diagnostic.renderer,
  },
  treeAsset: {
    bytes: treeBytes.length,
    meshPrimitives: gltf.meshes.length,
    materials: gltf.materials.map((m: { name: string }) => m.name),
    textures: gltf.textures.length,
    trianglesByLod: [0, 1, 2].map((lod) =>
      gltf.meshes
        .filter((m: { name: string }) => m.name.includes("__lod" + lod))
        .reduce(
          (sum: number, m: { primitives: Array<{ indices: number }> }) =>
            sum +
            m.primitives.reduce(
              (n, p) => n + gltf.accessors[p.indices].count / 3,
              0,
            ),
          0,
        ),
    ),
  },
  constructionCpuMs,
  inventory: captureRenderCostInventory(scene),
  tenSimulatedSecondsSurfaceWork: maintenanceDelta,
  convertedSurfaceMaterials: maintenanceStart.materialUpdates,
  shadow: {
    instant: diagnostic.sceneView.lightingInstant,
    sun: sunPosition,
    potentialCandidates: map.renderList!.length,
    priorEnabledCandidates: legacyActive.length,
    frustumSubmitted: filtered.length,
    priorPotentialDrawTriangles: triangles(legacyActive),
    submittedPotentialDrawTriangles: triangles(filtered),
    stats: { ...atmosphere.stats },
  },
  limits: [
    "No GPU FPS claim or whole-game performance claim.",
    "Texture/material loading excluded from headless geometry construction; source GLB material/texture counts reported separately.",
    "Reference browser diagnostic predates these changes and was not source-frozen.",
    "Only exact shadow-frustum non-contributors removed; no mesh simplification or LOD boundary change.",
  ],
};
const out = "docs/model-review/evidence/native-maintenance-counters.json";
mkdirSync("docs/model-review/evidence", { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      out,
      ...report.inventory,
      surfaceWork: maintenanceDelta,
      shadow: report.shadow,
      constructionCpuMs,
    },
    null,
    2,
  ),
);
atmosphere.dispose();
pack.dispose();
cars.dispose();
treeContainer.dispose();
for (const root of roots.values()) root.dispose();
scene.dispose();
engine.dispose();
if (!report.sourceHashesStable) process.exitCode = 1;
