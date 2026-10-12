/** Archive the exact highest authored runtime geometry per source building.
 * NullEngine is used only to read geometry, never as GPU/performance evidence. */
import { mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { buildArchitectureReality } from "../client/architecture-reality";
import { buildLandmarkReality } from "../client/landmark-reality";
import { createCampusExterior } from "../client/campus-exterior";
import {
  getWorldAssetRoot,
  attachWorldAssetNode,
} from "../client/world-asset-identity";
import {
  applyTerrainData,
  buildingFoundationData,
} from "../client/terrain-renderer";
import { surfaceTexturePlan } from "../client/surface-pack";
import { BUILDINGS, B6_BOXES, blockNumber } from "../shared/world";
import { B6_LAYOUT, B6_ROOM_AREAS } from "../shared/b6-interior";
import {
  B6_STAIR_MESHES,
  B6_STAIR_CORES,
  B6_STAIR_DIMENSIONS,
  type B6StairMaterial,
} from "../shared/b6-stairs";
import { B6_STAIR_MATERIALS } from "../shared/b6-stair-materials";
import {
  createB6BoxFaceParts,
  createB6StairMeshes,
} from "../client/b6-reality";
import { buildingBaseHeight } from "../shared/terrain";
import {
  LANDMARK_BUILDING_REPLACEMENTS,
  LANDMARK_SOURCE,
} from "../shared/landmark-reality";
import { CAMPUS_EXTERIOR_SOURCE } from "../shared/campus-exterior";
import { createB6ExteriorConcreteMaterial } from "../client/b6-exterior-concrete";
import { osmAssetIdentity } from "../shared/world-asset-identity";
import facade from "../shared/data/facade-reality.json";
import type { Building } from "../shared/types";
import {
  ARCHIVE_COORDINATE_STEP,
  bakeBuildingArchiveGeometry,
  writeBuildingArchive,
} from "./building-archive-transfer";

const onlyIndex = process.argv.indexOf("--only");
const onlyId = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
if (onlyIndex >= 0 && onlyId !== "53929071")
  throw new Error(
    "Partial export currently supports only B6 source ID 53929071",
  );
const selectedBuildings = onlyId
  ? BUILDINGS.filter((building) => building.id === onlyId)
  : BUILDINGS;
const engine = new NullEngine(),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
const base = (b: Building) =>
  blockNumber(b.name) === 6
    ? B6_LAYOUT.foundationOffset
    : buildingBaseHeight(b.points);
buildArchitectureReality({
  scene,
  authoredDetail: "highest",
  authoredWindowKit: JSON.parse(
    readFileSync(
      "assets/blender/building-window-kit/highest-geometry.json",
      "utf8",
    ),
  ),
  authoredMarketKit: JSON.parse(
    readFileSync(
      "assets/blender/market-detail-kit/highest-geometry.json",
      "utf8",
    ),
  ),
  authoredB4PanelKit: JSON.parse(
    readFileSync("assets/blender/b4-panel-kit/highest-geometry.json", "utf8"),
  ),
  buildings: selectedBuildings.filter(
    (b) => !LANDMARK_BUILDING_REPLACEMENTS.has(b.id),
  ),
  baseElevation: (_x, _z, b) => base(b),
});
if (!onlyId) {
  buildLandmarkReality({ scene, buildings: BUILDINGS, baseElevation: base });
  createCampusExterior(scene);
}
const foundation = new StandardMaterial("building foundation", scene);
foundation.diffuseColor.set(0.475, 0.486, 0.459);
foundation.metadata = { surfaceKind: "concrete", uvMetresPerRepeat: 4 };
for (const b of selectedBuildings) {
  const root = getWorldAssetRoot(
    scene,
    osmAssetIdentity("building", "way", b.id),
    { x: 0, y: base(b), z: 0 },
  );
  const mesh = new Mesh(`building foundation ${b.id}`, scene);
  applyTerrainData(mesh, buildingFoundationData(b.points, base(b)));
  mesh.material = foundation;
  mesh.metadata = { lod: "both", sourcePack: "terrain-foundation" };
  attachWorldAssetNode(mesh, root);
}
const b6Root = scene.getTransformNodeByName(
  "world-asset:building:osm:way:53929071",
)!;
const stairMaterials = new Map<B6StairMaterial, PBRMaterial>();
for (const [key, style] of Object.entries(B6_STAIR_MATERIALS)) {
  const material = new PBRMaterial("b6 stair:" + key, scene);
  material.albedoColor = Color3.FromHexString(style.color);
  material.roughness = style.roughness;
  material.metallic = style.metallic;
  if (key === "entry-glass") {
    material.alpha = 0.28;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.backFaceCulling = false;
  }
  // NullEngine does not load images. The archive links these exact runtime PNG
  // assets after geometry extraction, rather than issuing browser image requests.
  material.metadata = {
    b6StairMaterial: key,
    authoredB6Texture: style.texture,
    portableEntryGlass: key === "entry-glass",
  };
  stairMaterials.set(key as B6StairMaterial, material);
}
const b6Materials = new Map<string, StandardMaterial>(),
  b6Meshes = new Map<string, Mesh[]>();
const b6ExteriorConcrete = createB6ExteriorConcreteMaterial(scene, false);
for (const [boxIndex, b] of B6_BOXES.entries()) {
  if (b.kind === "glass" && b.role !== "exterior-entry") continue;
  let material: StandardMaterial | PBRMaterial | undefined = b.material
    ? stairMaterials.get(b.material)
    : b.kind === "stair"
      ? b6ExteriorConcrete
      : b6Materials.get(b.kind);
  if (!material) {
    material = new StandardMaterial(`B6 structural ${b.kind}`, scene);
    material.diffuseColor.set(b.kind === "floor" ? 0.7 : 0.75, 0.69, 0.65);
    b6Materials.set(b.kind, material);
  }
  for (const part of createB6BoxFaceParts(b)) {
    const faceMaterial =
      b.kind === "floor" && part.surface !== "top"
        ? stairMaterials.get("painted-concrete")!
        : material;
    const key = faceMaterial.name + ":" + part.surface;
    const mesh = new Mesh(`B6 ${b.role} ${part.surface}`, scene);
    const data = new VertexData();
    Object.assign(data, part.data);
    data.applyToMesh(mesh);
    mesh.material = faceMaterial;
    mesh.metadata = {
      canonicalBoxIndex: boxIndex,
      canonicalBoxSurface: part.surface,
    };
    const batch = b6Meshes.get(key) ?? [];
    batch.push(mesh);
    b6Meshes.set(key, batch);
  }
}
for (const [kind, meshes] of b6Meshes) {
  const material = meshes[0].material;
  const sourceFaces = meshes.map((mesh) => ({
    boxIndex: mesh.metadata.canonicalBoxIndex,
    surface: mesh.metadata.canonicalBoxSurface,
  }));
  const mesh = Mesh.MergeMeshes(meshes, true, true, undefined, false, false)!;
  mesh.material = material;
  mesh.name = `B6 authored structural ${kind}`;
  mesh.metadata = {
    lod: "both",
    sourcePack: "b6-interior-schematic",
    sourceDetail: { canonicalBoxFaces: true, sourceFaces },
  };
  attachWorldAssetNode(mesh, b6Root);
}

for (const mesh of createB6StairMeshes(
  scene,
  B6_LAYOUT.foundationOffset,
  stairMaterials,
)) {
  mesh.metadata = {
    ...mesh.metadata,
    lod: "both",
    sourcePack: "b6-photo-stairs",
    sourceDetail: {
      stairIds: mesh.metadata.sourceIds,
      level: mesh.metadata.level,
      material: mesh.material!.metadata.b6StairMaterial,
      coordinates:
        "B6 foundation-relative source; common foundation offset applied once",
    },
  };
  attachWorldAssetNode(mesh, b6Root);
}
const updatedModels = scene.transformNodes
  .filter((r) => r.metadata?.worldAsset && r.metadata.kind === "building")
  .map((root) => {
    const origin = {
      x: root.position.x,
      y: root.position.y,
      z: root.position.z,
    };
    const parts = root
      .getChildMeshes()
      .filter((m) => m.metadata?.lod !== "far" && m.getTotalVertices() > 0)
      .map((mesh) => {
        mesh.computeWorldMatrix(true);
        const geometry = bakeBuildingArchiveGeometry(
          {
            positions: mesh.getVerticesData("position")!,
            normals: mesh.getVerticesData("normal")!,
            indices: mesh.getIndices()!,
            uvs: mesh.getVerticesData("uv") ?? [],
            colors: mesh.getVerticesData("color") ?? [],
          },
          mesh.getWorldMatrix(),
          origin,
        );
        const m = mesh.material!;
        const surface = surfaceTexturePlan(m.metadata);
        // Browser-only texture construction must not silently become a flat
        // fallback colour in a headless archive. SurfacePack overrides win.
        const architectureTexture = !surface
          ? m.metadata?.authoredArchitectureTexture
          : undefined;
        const standard = m instanceof StandardMaterial ? m : undefined,
          pbr = m instanceof PBRMaterial ? m : undefined;
        return {
          name: mesh.name,
          sourcePack: mesh.metadata?.sourcePack ?? "authored",
          sourceMetadata: mesh.metadata?.sourceDetail,
          ...geometry,
          material: {
            name: m.name,
            color: architectureTexture
              ? [1, 1, 1]
              : ((standard?.diffuseColor ?? pbr?.albedoColor)?.asArray() ?? [
                  0.6, 0.6, 0.6,
                ]),
            alpha: m.alpha,
            doubleSided: !m.backFaceCulling,
            portableEntryGlass: m.metadata?.portableEntryGlass === true,
            metallic: pbr?.metallic ?? 0,
            roughness:
              pbr?.roughness ?? (m.name.includes("glass") ? 0.23 : 0.83),
            authoredTexture:
              architectureTexture ?? m.metadata?.authoredB6Texture ?? null,
            authoredNormalTexture: architectureTexture
              ? m.metadata.authoredArchitectureNormal
              : null,
            authoredNormalStrength: architectureTexture
              ? m.metadata.authoredArchitectureNormalStrength
              : null,
            authoredTextureProvenance: architectureTexture
              ? "Original project-authored periodic facade textures; photo interpretation, not scanned source pixels."
              : "Original project-authored B6 texture interpreted from B3 typology; B6 finishes are not measured.",
            surface: surface
              ? {
                  channels: surface.family.channels,
                  uScale: surface.uScale,
                  vScale: surface.vScale,
                  source: surface.family.source,
                  ...(m.metadata?.preserveSurfaceTint
                    ? {
                        preserveLinearTint: true,
                        normalStrength: m.metadata.surfaceNormalStrength,
                        sourceRecipe: m.metadata.sourceRecipe,
                      }
                    : {}),
                }
              : null,
            note: "Runtime dynamic window reflections and simulated night occupancy remain shader recipes, not measured photo textures.",
          },
        };
      });
    return {
      b6Layout:
        root.metadata.sourceId === "53929071"
          ? {
              floorLevels: B6_LAYOUT.floorLevels,
              modelRoomCountsByLevel: Object.fromEntries(
                B6_LAYOUT.floorLevels.map((level) => [
                  level,
                  B6_ROOM_AREAS.filter(
                    (area) => area.level === level && area.kind === "bedroom",
                  ).length,
                ]),
              ),
              roomCountStatus: B6_LAYOUT.roomCountStatus,
              stairStatus: B6_LAYOUT.stairStatus,
              stairCores: B6_STAIR_CORES,
              stairDimensions: B6_STAIR_DIMENSIONS,
              provenance:
                "B3 photo establishes stair material typology only; B6 SH plan establishes topology. Metric values and shell alignment are interpreted estimates, not an as-built survey.",
            }
          : undefined,
      identity: root.metadata,
      authoredDetail: "highest",
      origin,
      parts,
      triangles: parts.reduce((s, p) => s + p.indices.length / 3, 0),
    };
  });
const sourceFiles = [
  "shared/data/map.json",
  "shared/data/facade-reality.json",
  "shared/landmark-reality.ts",
  "shared/campus-exterior.ts",
  "client/architecture-reality.ts",
  "client/architecture-depth.ts",
  "client/building-window-model.ts",
  "client/b4-panel-material.ts",
  "shared/b4-facade-plan.ts",
  "shared/data/b4-facade-plan.json",
  "shared/data/building-window-kit.json",
  "shared/data/market-detail-kit.json",
  "shared/data/b4-panel-kit.json",
  "assets/blender/building-window-kit/highest-geometry.json",
  "assets/blender/building-window-kit/building-window-kit.blend",
  "assets/blender/market-detail-kit/highest-geometry.json",
  "assets/blender/market-detail-kit/market-flue-highest.blend",
  "assets/blender/b4-panel-kit/highest-geometry.json",
  "assets/blender/b4-panel-kit/b4-facade-panels.blend",
  "scripts/export-building-assets.ts",
  "scripts/building-archive-transfer.ts",
  "scripts/create-building-assets.py",
  "scripts/create-building-window-kit.py",
  "scripts/create-market-detail-kit.py",
  "scripts/create-b4-facade-panels.py",
  "scripts/export-b4-facade-plan.ts",
  "client/terrain-renderer.ts",
  "shared/b6-interior.ts",
  "shared/b6-stairs.ts",
  "shared/b6-entry.ts",
  "shared/b6-facade-plan.ts",
  "shared/b6-stair-materials.ts",
  "client/b6-reality.ts",
  "client/b6-exterior-concrete.ts",
  "shared/data/assets/surfaces-manifest.json",
];
for (const texture of new Set(
  updatedModels.flatMap((model) =>
    model.parts.flatMap((part) =>
      [
        part.material.authoredTexture,
        part.material.authoredNormalTexture,
      ].filter((url): url is string => typeof url === "string"),
    ),
  ),
))
  sourceFiles.push("public" + texture);
const out = "assets/blender/buildings/source-plan.json";
mkdirSync("assets/blender/buildings", { recursive: true });
const previousSource = onlyId
  ? JSON.parse(readFileSync(out, "utf8"))
  : undefined;
const modelGeometryHash = (model: unknown) =>
  createHash("sha256").update(JSON.stringify(model)).digest("hex");
const retainedModelGeometryHashes: Record<string, string> = {};
const models = previousSource
  ? previousSource.models.map(
      (model: { identity: { sourceId: string; key: string } }) => {
        const updated = updatedModels.find(
          (value) => value.identity.key === model.identity.key,
        );
        if (updated) return updated;
        retainedModelGeometryHashes[model.identity.key] =
          modelGeometryHash(model);
        return model;
      },
    )
  : updatedModels;
if (onlyId && updatedModels.length !== 1)
  throw new Error("Partial B6 export generated other buildings");
if (
  onlyId &&
  Object.keys(retainedModelGeometryHashes).length !==
    previousSource.models.length - 1
)
  throw new Error("Partial B6 export must preserve every unselected building");
const writtenArchive = writeBuildingArchive(
  out,
  {
    schemaVersion: 2,
    authoredDetail: "highest",
    coordinateStepMetres: ARCHIVE_COORDINATE_STEP,
    coordinateRoundingMaximumPerAxisMetres: ARCHIVE_COORDINATE_STEP / 2,
    normalTransfer:
      "inverse-transpose world transform; normalized full-precision source normals retained in Blender POINT attribute and restored as portable GLB NORMAL; native Blender shading quantization audited separately",
    partialUpdate: onlyId
      ? { sourceId: onlyId, retainedModelGeometryHashes }
      : undefined,
    coordinates:
      "Metres: x east, y up, z south; per-building local positions + source origin recreate world coordinates.",
    sources: {
      facade: facade.sources,
      landmarks: LANDMARK_SOURCE,
      campus: CAMPUS_EXTERIOR_SOURCE,
      b6: B6_LAYOUT.sources,
    },
    sourceHashes: Object.fromEntries(
      sourceFiles.map((file) => [
        file,
        createHash("sha256").update(readFileSync(file)).digest("hex"),
      ]),
    ),
    limitations:
      "Clean source-authored models interpreted from maps/photos. No raw photogrammetry mesh. Heights/details remain documented estimates; B6 interior is schematic. CC0 generic surface channels are linked from installed original assets. Photographs are references only.",
  },
  models,
);
console.log(
  JSON.stringify({
    output: out,
    models: models.length,
    triangles: models.reduce(
      (s: number, m: { triangles: number }) => s + m.triangles,
      0,
    ),
    bytes: writtenArchive.bytes,
  }),
);
scene.dispose();
engine.dispose();
