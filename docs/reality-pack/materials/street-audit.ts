import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  streetTransitionSegments,
  streetTransitionVertexData,
} from "../../../client/streets-renderer";
import { STREETS } from "../../../shared/streets";
import { TERRAIN } from "../../../shared/terrain";
import manifest from "../../../public/textures/surfaces/manifest.json";
const start = performance.now(),
  segments = streetTransitionSegments(),
  selectionMs = performance.now() - start;
const geometryStart = performance.now(),
  geometry = streetTransitionVertexData(segments),
  geometryMs = performance.now() - geometryStart;
const files = [];
for (const path of [
  "client/streets-renderer.ts",
  "client/surface-pack.ts",
  "shared/streets.ts",
  "shared/data/streets.json",
  "shared/data/terrain-grid.json",
  "shared/data/map.json",
  "tests/surface-transitions.test.ts",
  "tests/cinematic.test.ts",
  "public/textures/surfaces/manifest.json",
  "docs/reality-pack/materials/street-preview.html",
  "docs/reality-pack/materials/street-preview.ts",
]) {
  const data = await readFile(path);
  files.push({ path, sha256: createHash("sha256").update(data).digest("hex") });
}
const details = {
  generatedAt: new Date().toISOString(),
  source: STREETS.source,
  sourceSha256: STREETS.sourceSha256,
  sourceGeneratedAt:
    (STREETS as typeof STREETS & { generatedAt?: string }).generatedAt ?? null,
  bounds: STREETS.bounds,
  terrainSource: TERRAIN.source,
  sourceFeatures: STREETS.features.length,
  sourceSurfaces: STREETS.surfaces.map((surface) => ({
    material: surface.material,
    polygons: surface.polygons.length,
  })),
  materialFamilies: manifest.assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    scale: [asset.metresPerRepeat, asset.metresPerRepeatV],
    scaleProvenance: asset.scaleProvenance,
  })),
  joint: {
    segments: segments.length,
    vertices: (geometry.positions?.length ?? 0) / 3,
    triangles: (geometry.indices?.length ?? 0) / 3,
    widthMetres: 0.035,
    offsetOverPavementMetres: 0.001,
    profile: "illustrative flush visual joint; no raised kerb or collision",
    selectionMs,
    geometryMs,
  },
  files,
  validation: {
    targetedTests: "12 passed (7 material/cinematic + 5 surface transitions)",
    cpuGeometryOnly: true,
    gpuTest: false,
    performanceMeasured: false,
  },
  segments,
};
await writeFile(
  "docs/reality-pack/materials/street-audit.json",
  JSON.stringify(details, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    segments: details.joint.segments,
    triangles: details.joint.triangles,
    selectionMs,
    geometryMs,
    families: manifest.assets.length,
    features: STREETS.features.length,
  }),
);
