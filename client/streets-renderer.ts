import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import earcut, { deviation as triangulationDeviation } from "earcut";
import {
  drapeTriangles,
  type GroundPoint,
  type TerrainMeshData,
} from "../shared/terrain";
import {
  STREET_SURFACES,
  STREETS,
  STREET_SURFACE_Y,
  LAMP_PLACEMENTS,
  CROSSING_MARKINGS,
  streetPolygonContains,
  type StreetPolygon,
  type StreetMaterial,
} from "../shared/streets";
import rawMap from "../shared/data/map.json";
import { surfaceTexturePlan } from "./surface-pack";
import { chunkStaticMesh } from "./static-submesh-chunks";
import {
  runWorldBuildStagesSync,
  type WorldBuildStep,
} from "./world-build-stages";
const buildingMasks = rawMap.buildings.map((building) => ({
  outer: building.points as GroundPoint[],
  holes: [],
  area: 0,
  minX: Math.min(...building.points.map((p) => p[0])),
  maxX: Math.max(...building.points.map((p) => p[0])),
  minZ: Math.min(...building.points.map((p) => p[1])),
  maxZ: Math.max(...building.points.map((p) => p[1])),
}));
type BuildingMask = (typeof buildingMasks)[number];

export type StreetBuildContext = {
  scene: Scene;
  mat?: (hex: string) => StandardMaterial;
  lights: PointLight[];
};

type StreetSurfaceGroup = {
  material: StreetMaterial;
  polygons: StreetPolygon[];
};
export type StreetTransitionSegment = {
  a: GroundPoint;
  b: GroundPoint;
  materials: [StreetMaterial, StreetMaterial];
};

/** A flush visual joint, not a surveyed or raised kerb. Derive it exclusively
 * from a shared edge between two differently surfaced, source-backed polygons.
 * A local spatial index bounds startup work; this never runs in the frame loop. */
export function streetTransitionSegments(
  surfaces: StreetSurfaceGroup[] = STREET_SURFACES,
) {
  return runWorldBuildStagesSync(streetTransitionSegmentSteps(surfaces));
}

function* streetTransitionSegmentSteps(
  surfaces: StreetSurfaceGroup[],
): Generator<WorldBuildStep, StreetTransitionSegment[]> {
  const order: Record<StreetMaterial, number> = {
    asphalt: 0,
    sett: 1,
    paving: 2,
    gravel: 3,
  };
  type Edge = {
    a: GroundPoint;
    b: GroundPoint;
    ux: number;
    uz: number;
    length: number;
    material: StreetMaterial;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  const edges: Edge[] = [],
    grid = new Map<string, number[]>(),
    cellSize = 16;
  const cells = (minX: number, minZ: number, maxX: number, maxZ: number) => {
    const keys: string[] = [];
    for (
      let x = Math.floor(minX / cellSize);
      x <= Math.floor(maxX / cellSize);
      x++
    )
      for (
        let z = Math.floor(minZ / cellSize);
        z <= Math.floor(maxZ / cellSize);
        z++
      )
        keys.push(x + ":" + z);
    return keys;
  };
  // Index boundary segments rather than repeatedly scanning large polygons for
  // metre-spaced samples. The expanded 380-feature map must stay quick to start.
  for (const surface of surfaces)
    for (const [polygonIndex, polygon] of surface.polygons.entries()) {
      yield {
        phase: "streets-transition-index",
        operation: `${surface.material}:${polygonIndex}`,
        run: () => {
          for (const ring of [polygon.outer, ...polygon.holes])
            for (let i = 0; i < ring.length; i++) {
              const a = ring[i],
                b = ring[(i + 1) % ring.length],
                dx = b[0] - a[0],
                dz = b[1] - a[1],
                length = Math.hypot(dx, dz);
              if (length < 0.06) continue;
              const edge: Edge = {
                a,
                b,
                ux: dx / length,
                uz: dz / length,
                length,
                material: surface.material,
                minX: Math.min(a[0], b[0]) - 0.025,
                maxX: Math.max(a[0], b[0]) + 0.025,
                minZ: Math.min(a[1], b[1]) - 0.025,
                maxZ: Math.max(a[1], b[1]) + 0.025,
              };
              const index = edges.length;
              edges.push(edge);
              for (const key of cells(
                edge.minX,
                edge.minZ,
                edge.maxX,
                edge.maxZ,
              )) {
                const bucket = grid.get(key) ?? [];
                bucket.push(index);
                grid.set(key, bucket);
              }
            }
        },
      };
    }
  const result: StreetTransitionSegment[] = [],
    seen = new Set<string>();
  for (const [edgeIndex, edge] of edges.entries()) {
    yield {
      phase: "streets-transition-pairs",
      operation: String(edgeIndex),
      run: () => {
        const candidates = new Set<number>();
        for (const key of cells(edge.minX, edge.minZ, edge.maxX, edge.maxZ))
          for (const index of grid.get(key) ?? []) candidates.add(index);
        const intervals: {
          start: number;
          end: number;
          offset: number;
          other: StreetMaterial;
        }[] = [];
        for (const index of candidates) {
          const other = edges[index];
          if (
            order[other.material] <= order[edge.material] ||
            edge.maxX < other.minX ||
            edge.minX > other.maxX ||
            edge.maxZ < other.minZ ||
            edge.minZ > other.maxZ
          )
            continue;
          if (Math.abs(edge.ux * other.uz - edge.uz * other.ux) > 0.015)
            continue;
          const ax = other.a[0] - edge.a[0],
            az = other.a[1] - edge.a[1],
            bx = other.b[0] - edge.a[0],
            bz = other.b[1] - edge.a[1];
          const da = -edge.uz * ax + edge.ux * az,
            db = -edge.uz * bx + edge.ux * bz;
          // Geometry is rounded to millimetres and simplified by 12 mm offline.
          // This is a numerical tolerance, not permission to bridge a grass verge.
          if (Math.abs(da) > 0.02 || Math.abs(db) > 0.02) continue;
          const pa = ax * edge.ux + az * edge.uz,
            pb = bx * edge.ux + bz * edge.uz;
          const start = Math.max(0, Math.min(pa, pb)),
            end = Math.min(edge.length, Math.max(pa, pb));
          if (end - start < 0.08) continue;
          intervals.push({
            start,
            end,
            offset: (da + db) / 4,
            other: other.material,
          });
        }
        intervals.sort(
          (a, b) =>
            order[a.other] - order[b.other] ||
            a.start - b.start ||
            a.end - b.end,
        );
        const merged: typeof intervals = [];
        for (const interval of intervals) {
          const last = merged[merged.length - 1];
          if (
            last &&
            last.other === interval.other &&
            interval.start <= last.end + 0.002 &&
            Math.abs(last.offset - interval.offset) < 0.003
          )
            last.end = Math.max(last.end, interval.end);
          else merged.push({ ...interval });
        }
        for (const interval of merged) {
          const a: GroundPoint = [
            edge.a[0] + edge.ux * interval.start - edge.uz * interval.offset,
            edge.a[1] + edge.uz * interval.start + edge.ux * interval.offset,
          ];
          const b: GroundPoint = [
            edge.a[0] + edge.ux * interval.end - edge.uz * interval.offset,
            edge.a[1] + edge.uz * interval.end + edge.ux * interval.offset,
          ];
          const key = [
            a.map((v) => Math.round(v * 1000)).join(","),
            b.map((v) => Math.round(v * 1000)).join(","),
          ]
            .sort()
            .join(":");
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({ a, b, materials: [edge.material, interval.other] });
        }
      },
    };
  }
  // A short coincident edge can also belong to a thin discarded GIS sliver.
  // Confirm both actual materials before adding a visible line. Ordinary ray
  // containment is sufficient for probes 65 mm away from the edge and avoids
  // the expensive numerical-boundary-distance work needed by public picking.
  const polygonGrid = new Map<
    string,
    {
      material: StreetMaterial;
      polygon: StreetPolygon;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }[]
  >();
  for (const surface of surfaces)
    for (const [polygonIndex, polygon] of surface.polygons.entries()) {
      yield {
        phase: "streets-transition-surfaces",
        operation: `${surface.material}:${polygonIndex}`,
        run: () => {
          const entry = {
            material: surface.material,
            polygon,
            minX: Infinity,
            maxX: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity,
          };
          for (const [x, z] of polygon.outer) {
            entry.minX = Math.min(entry.minX, x);
            entry.maxX = Math.max(entry.maxX, x);
            entry.minZ = Math.min(entry.minZ, z);
            entry.maxZ = Math.max(entry.maxZ, z);
          }
          for (const key of cells(
            entry.minX,
            entry.minZ,
            entry.maxX,
            entry.maxZ,
          )) {
            const bucket = polygonGrid.get(key) ?? [];
            bucket.push(entry);
            polygonGrid.set(key, bucket);
          }
        },
      };
    }
  const inRing = (ring: GroundPoint[], x: number, z: number) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > z !== b[1] > z &&
        x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  };
  const at = (x: number, z: number) => {
    for (const entry of polygonGrid.get(
      Math.floor(x / cellSize) + ":" + Math.floor(z / cellSize),
    ) ?? []) {
      if (x < entry.minX || x > entry.maxX || z < entry.minZ || z > entry.maxZ)
        continue;
      if (
        inRing(entry.polygon.outer, x, z) &&
        !entry.polygon.holes.some((ring) => inRing(ring, x, z))
      )
        return entry.material;
    }
    return undefined;
  };
  const filtered: StreetTransitionSegment[] = [];
  for (const [segmentIndex, segment] of result.entries()) {
    yield {
      phase: "streets-transition-filter",
      operation: String(segmentIndex),
      run: () => {
        const dx = segment.b[0] - segment.a[0],
          dz = segment.b[1] - segment.a[1],
          length = Math.hypot(dx, dz),
          nx = (-dz / length) * 0.065,
          nz = (dx / length) * 0.065;
        const accepted = [0.25, 0.5, 0.75].every((t) => {
          const x = segment.a[0] + dx * t,
            z = segment.a[1] + dz * t,
            left = at(x + nx, z + nz),
            right = at(x - nx, z - nz);
          return (
            left !== right &&
            !!left &&
            !!right &&
            segment.materials.includes(left) &&
            segment.materials.includes(right)
          );
        });
        if (accepted) filtered.push(segment);
      },
    };
  }
  return filtered;
}

const emptyStreetData = (): TerrainMeshData => ({
  positions: [],
  normals: [],
  uvs: [],
  indices: [],
});
function streetData(data: TerrainMeshData) {
  const result = new VertexData();
  Object.assign(result, data);
  return result;
}

/** Keep unused vertices too: this preserves the original buffers and indices. */
function appendStreetData(
  target: TerrainMeshData,
  data: TerrainMeshData,
  masks: BuildingMask[],
  polygon?: StreetPolygon,
  containmentFallback = false,
) {
  const offset = target.positions.length / 3;
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  // Build a conservative mask broad phase from the actual draped output while
  // copying it. Final centroid/boundary containment remains exactly unchanged.
  for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i],
      z = data.positions[i + 2];
    target.positions.push(x, data.positions[i + 1], z);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  // A sum/divide centroid can round just outside the vertex extrema. Cover that
  // floating-point error in the broad phase only, never in the exact mask test.
  const rounding =
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(minX),
      Math.abs(maxX),
      Math.abs(minZ),
      Math.abs(maxZ),
    ) *
    4;
  minX -= rounding;
  maxX += rounding;
  minZ -= rounding;
  maxZ += rounding;
  masks.length = 0;
  for (const mask of buildingMasks)
    if (
      mask.maxX >= minX &&
      mask.minX <= maxX &&
      mask.maxZ >= minZ &&
      mask.minZ <= maxZ
    )
      masks.push(mask);
  for (const value of data.normals) target.normals.push(value);
  for (const value of data.uvs) target.uvs.push(value);
  for (let i = 0; i < data.indices.length; i += 3) {
    const a = data.indices[i] * 3,
      b = data.indices[i + 1] * 3,
      c = data.indices[i + 2] * 3;
    const x = (data.positions[a] + data.positions[b] + data.positions[c]) / 3;
    const z =
      (data.positions[a + 2] + data.positions[b + 2] + data.positions[c + 2]) /
      3;
    if (containmentFallback && polygon && !streetPolygonContains(polygon, x, z))
      continue;
    let blocked = false;
    for (const mask of masks) {
      if (
        x >= mask.minX &&
        x <= mask.maxX &&
        z >= mask.minZ &&
        z <= mask.maxZ &&
        streetPolygonContains(mask, x, z)
      ) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    target.indices.push(
      offset + data.indices[i],
      offset + data.indices[i + 1],
      offset + data.indices[i + 2],
    );
  }
}

/** 35 mm joint lies on the same shared terrain; it adds no collision or step. */
export function streetTransitionVertexData(
  segments: StreetTransitionSegment[],
  width = 0.035,
) {
  return runWorldBuildStagesSync(
    streetTransitionVertexDataSteps(segments, width),
  );
}

export function* streetTransitionVertexDataSteps(
  segments: StreetTransitionSegment[],
  width = 0.035,
): Generator<WorldBuildStep, VertexData> {
  const target = emptyStreetData();
  const masks: BuildingMask[] = [];
  for (const [index, { a, b }] of segments.entries()) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-5) continue;
    yield {
      phase: "streets-transition-drape",
      operation: String(index),
      run: () => {
        const nx = ((-(b[1] - a[1]) / length) * width) / 2,
          nz = (((b[0] - a[0]) / length) * width) / 2;
        const points: GroundPoint[] = [
          [a[0] + nx, a[1] + nz],
          [b[0] + nx, b[1] + nz],
          [b[0] - nx, b[1] - nz],
          [a[0] - nx, a[1] - nz],
        ];
        const data = drapeTriangles(
          points,
          [0, 1, 3, 3, 1, 2],
          STREET_SURFACE_Y + 0.001,
        );
        appendStreetData(target, data, masks);
      },
    };
  }
  return streetData(target);
}
let cachedMaterialTransitions: StreetTransitionSegment[] | undefined;

/** Upward normals and holes survive triangulation. Babylon's native ground
 * uses clockwise indices with +Y normals; match it on the RH game scene.
 */
export function streetVertexData(
  polygons: StreetPolygon[],
  height = STREET_SURFACE_Y,
) {
  return runWorldBuildStagesSync(streetVertexDataSteps(polygons, height));
}

/** drapeTriangles processes each input triangle independently. Batching its
 * input preserves every floating-point operation and output order; a polygon
 * with thousands of triangles no longer occupies one uninterruptible task. */
export function* streetVertexDataSteps(
  polygons: StreetPolygon[],
  height = STREET_SURFACE_Y,
  material = "surface",
): Generator<WorldBuildStep, VertexData> {
  const target = emptyStreetData();
  const masks: BuildingMask[] = [];
  const batch: number[] = [];
  const phase = `streets-surface-${material}`;
  for (const [polygonIndex, polygon] of polygons.entries()) {
    let points: GroundPoint[] = [],
      triangles: number[] = [],
      containmentFallback = false;
    yield {
      phase,
      operation: `triangulate:${polygonIndex}`,
      run: () => {
        points = [...polygon.outer];
        const holes: number[] = [];
        for (const ring of polygon.holes) {
          holes.push(points.length);
          points.push(...ring);
        }
        const flat = points.flat();
        triangles = earcut(flat, holes, 2);
        // Valid GIS polygons + Earcut + convex DMR clipping already keep triangles
        // inside the input surface. Re-scanning a multi-thousand-edge polygon for
        // each of its 100k draped triangles made startup take seconds. Retain the
        // conservative containment fallback only when triangulation area disagrees.
        const deviation = triangulationDeviation(flat, holes, 2, triangles);
        containmentFallback = !Number.isFinite(deviation) || deviation > 1e-7;
      },
    };
    for (let start = 0; start < triangles.length; start += 24) {
      yield {
        phase,
        operation: `drape:${polygonIndex}:${start / 3}`,
        run: () => {
          batch.length = Math.min(24, triangles.length - start);
          for (let i = 0; i < batch.length; i++)
            batch[i] = triangles[start + i];
          const data = drapeTriangles(points, batch, height);
          // The same source-precision trim is applied after each independent batch.
          appendStreetData(target, data, masks, polygon, containmentFallback);
        },
      };
    }
  }
  return streetData(target);
}

const COLORS: Record<StreetMaterial, string> = {
  asphalt: "#666b68",
  sett: "#92918b",
  paving: "#b3b1a7",
  gravel: "#a29b86",
};

function surfaceMaterial(context: StreetBuildContext, kind: StreetMaterial) {
  // Pavement textures/UVs are not shared with unrelated objects of the same
  // palette colour. Their eventual PBR maps still reuse the shared texture cache.
  const material = new StandardMaterial(`street:${kind}`, context.scene);
  material.diffuseColor = Color3.FromHexString(COLORS[kind]);
  material.specularColor.setAll(kind === "asphalt" ? 0.035 : 0.015);
  // Roads follow the SAME source terrain triangles; depth bias avoids coplanar
  // layers fighting on integrated GPUs without introducing blocking curbs.
  material.zOffset = -2;
  material.zOffsetUnits = -2;
  material.metadata = {
    ...material.metadata,
    mappedStreetSurface: true,
    surface: kind,
    surfaceKind: kind,
    uvMetresPerRepeat: 4,
    surfaceEvidence:
      "OSM surface tags or explicitly recorded class estimates; see STREETS.features",
    sourceSha256: STREETS.sourceSha256,
  };
  if (typeof document === "undefined") return material;
  const plan = surfaceTexturePlan(material.metadata);
  if (!plan) return material;
  const texture = new Texture(
    plan.family.channels.color.url,
    context.scene,
    false,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.gammaSpace = true;
  texture.uScale = plan.uScale;
  texture.vScale = plan.vScale;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.White();
  return material;
}

function poolMaterial(scene: Scene) {
  const material = new StandardMaterial("art:lamp-pool", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.FromHexString("#ffd6a0");
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alpha = 0;
  material.zOffset = -3;
  material.zOffsetUnits = -3;
  if (typeof document !== "undefined") {
    const texture = new DynamicTexture(
      "mapped-lamp-falloff",
      { width: 128, height: 128 },
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,220,164,.43)");
    gradient.addColorStop(0.48, "rgba(255,220,164,.16)");
    gradient.addColorStop(1, "rgba(255,220,164,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    texture.hasAlpha = true;
    texture.update(false);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
  }
  return material;
}

/** Replace the legacy segment-box road loop AND regularly spaced lamp loop.
 * Ground/landcover and buildings are built by the caller. The 18 mm offset is
 * solely a depth separation above the common DMR5G terrain surface.
 */
export function buildStreets(context: StreetBuildContext) {
  return runWorldBuildStagesSync(streetBuildSteps(context));
}

/** Shared operation stream; the host world job owns scheduling and cancellation. */
export function* streetBuildSteps(context: StreetBuildContext): Generator<
  WorldBuildStep,
  {
    meshes: Mesh[];
    lamps: number;
    crossings: number;
    transitions: number;
  }
> {
  const meshes: Mesh[] = [];
  for (const surface of STREET_SURFACES) {
    if (!surface.polygons.length) continue;
    const phase = `streets-surface-${surface.material}`;
    let mesh!: Mesh;
    yield {
      phase,
      operation: "create-mesh",
      run: () => {
        mesh = new Mesh(`mapped-surfaces:${surface.material}`, context.scene);
      },
    };
    const data = yield* streetVertexDataSteps(
      surface.polygons,
      STREET_SURFACE_Y,
      surface.material,
    );
    yield {
      phase,
      operation: "upload-material",
      run: () => {
        data.applyToMesh(mesh);
        mesh.material = surfaceMaterial(context, surface.material);
        mesh.metadata = {
          source: "OpenStreetMap",
          kind: "joined-pavement",
          material: surface.material,
          terrainDraped: true,
          depthCaster: false,
          shadowCaster: false,
          sourceSha256: STREETS.sourceSha256,
        };
        mesh.isPickable = false;
        mesh.freezeWorldMatrix();
      },
    };
    yield {
      phase,
      operation: "exact-static-chunks",
      run: () => {
        chunkStaticMesh(mesh);
        meshes.push(mesh);
      },
    };
  }
  // Publish only a completed cache. Cancelling midway must not retain a prefix.
  const transitions =
    cachedMaterialTransitions ??
    (yield* streetTransitionSegmentSteps(STREET_SURFACES));
  cachedMaterialTransitions ??= transitions;
  if (transitions.length) {
    const data = yield* streetTransitionVertexDataSteps(transitions);
    if (data.indices?.length) {
      yield {
        phase: "streets-transition-upload",
        operation: "mesh-and-material",
        run: () => {
          const mesh = new Mesh("mapped-flush-material-joints", context.scene),
            material = new StandardMaterial(
              "street:flush material joints",
              context.scene,
            );
          data.applyToMesh(mesh);
          material.diffuseColor = Color3.FromHexString("#494a46");
          material.specularColor.setAll(0.015);
          material.zOffset = -2;
          material.zOffsetUnits = -2;
          mesh.material = material;
          mesh.isPickable = false;
          mesh.freezeWorldMatrix();
          mesh.metadata = {
            source: "derived from shared OSM material boundaries",
            sourceSha256: STREETS.sourceSha256,
            transitionSegments: transitions.length,
            profileProvenance:
              "35mm illustrative flush joint, not a measured kerb",
            terrainDraped: true,
            depthCaster: false,
            shadowCaster: false,
          };
          meshes.push(mesh);
        },
      };
    }
  }
  let metal!: StandardMaterial,
    glow!: StandardMaterial,
    pool!: StandardMaterial,
    whitePole!: StandardMaterial;
  let fixtureBodyMaterial!: StandardMaterial;
  yield {
    phase: "streets-lamps",
    operation: "materials",
    run: () => {
      metal =
        context.mat?.("#555f5f") ??
        new StandardMaterial("street:metal", context.scene);
      if (!context.mat) metal.diffuseColor = Color3.FromHexString("#555f5f");
      glow =
        context.mat?.("#f7d590") ??
        new StandardMaterial("street:glow", context.scene);
      if (!context.mat) {
        glow.diffuseColor = Color3.FromHexString("#f7d590");
        glow.emissiveColor.setAll(0);
      }
      pool = poolMaterial(context.scene);
      whitePole = new StandardMaterial(
        "street:photo white parking poles",
        context.scene,
      );
      whitePole.diffuseColor = Color3.FromHexString("#d1d5cf");
      whitePole.specularColor.setAll(0.03);
      fixtureBodyMaterial = metal;
    },
  };
  const fixtureParts: Mesh[] = [],
    lightParts: Mesh[] = [],
    pools: Mesh[] = [];
  const fixture = (
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    yaw = 0,
    light = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width, height, depth },
      context.scene,
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.material = light ? glow : fixtureBodyMaterial;
    mesh.isPickable = false;
    (light ? lightParts : fixtureParts).push(mesh);
    return mesh;
  };
  for (const lamp of LAMP_PLACEMENTS) {
    yield {
      phase: "streets-lamps",
      operation: String(lamp.id),
      run: () => {
        fixtureBodyMaterial =
          lamp.modelStyle === "white-parking-pole" ? whitePole : metal;
        const dx = Math.sin(lamp.yaw),
          dz = Math.cos(lamp.yaw);
        fixture(
          `mapped-lamp:${lamp.id}:pole`,
          lamp.x,
          lamp.groundY + lamp.height / 2,
          lamp.z,
          0.16,
          lamp.height,
          0.16,
        );
        fixture(
          `mapped-lamp:${lamp.id}:base`,
          lamp.x,
          lamp.groundY + 0.09,
          lamp.z,
          0.28,
          0.18,
          0.28,
        );
        fixture(
          "lamp arm",
          lamp.x + dx * 0.4,
          lamp.groundY + lamp.height - 0.08,
          lamp.z + dz * 0.4,
          0.1,
          0.1,
          0.8,
          lamp.yaw,
        );
        fixture(
          "lamp housing",
          lamp.x + dx * 0.8,
          lamp.groundY + lamp.height - 0.08,
          lamp.z + dz * 0.8,
          0.35,
          0.17,
          0.72,
          lamp.yaw,
        );
        fixture(
          "lamp lens",
          lamp.x + dx * 0.8,
          lamp.groundY + lamp.height - 0.175,
          lamp.z + dz * 0.8,
          0.29,
          0.025,
          0.63,
          lamp.yaw,
          true,
        );
        const area = new Mesh("mapped-lamp-pool", context.scene);
        const cx = lamp.x + dx * 0.8,
          cz = lamp.z + dz * 0.8;
        const points: GroundPoint[] = [
          [cx - 5.5, cz - 5.5],
          [cx + 5.5, cz - 5.5],
          [cx + 5.5, cz + 5.5],
          [cx - 5.5, cz + 5.5],
        ];
        const poolData = drapeTriangles(
          points,
          [0, 1, 3, 3, 1, 2],
          STREET_SURFACE_Y + 0.014,
        );
        poolData.uvs = [];
        for (let i = 0; i < poolData.positions.length; i += 3)
          poolData.uvs.push(
            (poolData.positions[i] - cx) / 11 + 0.5,
            (poolData.positions[i + 2] - cz) / 11 + 0.5,
          );
        const vd = new VertexData();
        Object.assign(vd, poolData);
        vd.applyToMesh(area);
        area.material = pool;
        area.isPickable = false;
        pools.push(area);
        const light = new PointLight(
          `mapped-lamp:${lamp.id}`,
          new Vector3(
            lamp.x + dx * 0.8,
            lamp.groundY + lamp.height - 0.3,
            lamp.z + dz * 0.8,
          ),
          context.scene,
        );
        light.diffuse = Color3.FromHexString("#ffd6a0");
        light.range = lamp.lightRangeMetres;
        // PBR defaults to inverse-square attenuation; the former 0.7 art intensity
        // effectively vanished on converted roads while Standard props stayed lit.
        // Use one bounded artistic falloff consistently, without claiming measured
        // lumens or increasing global nighttime ambient illumination.
        light.falloffType = Light.FALLOFF_STANDARD;
        light.intensity = 0;
        light.setEnabled(false);
        light.metadata = {
          artLamp: true,
          source: lamp.source,
          heightProvenance: lamp.heightProvenance,
          placementProvenance: lamp.provenance,
          lightingProvenance: lamp.lightingProvenance,
        };
        context.lights.push(light);
      },
    };
  }
  for (const [groupIndex, group] of [
    fixtureParts,
    lightParts,
    pools,
  ].entries()) {
    if (!group.length) continue;
    yield {
      phase: "streets-lamp-merge",
      operation: String(groupIndex),
      run: () => {
        const mesh = Mesh.MergeMeshes(
          group,
          true,
          true,
          undefined,
          false,
          true,
        );
        if (mesh) {
          mesh.name =
            group === pools
              ? "mapped-lamp-pools"
              : group === lightParts
                ? "mapped-lamp-lenses"
                : "mapped-lamp-fixtures";
          mesh.isPickable = false;
          mesh.metadata = {
            terrainAnchored: true,
            shadowCaster: group === fixtureParts,
            depthCaster: group === fixtureParts ? "opaque" : false,
          };
          mesh.freezeWorldMatrix();
          meshes.push(mesh);
        }
      },
    };
  }
  const stripes: Mesh[] = [];
  let stripeMaterial!: StandardMaterial;
  yield {
    phase: "streets-crossings",
    operation: "material",
    run: () => {
      stripeMaterial =
        context.mat?.("#d8d6cb") ??
        new StandardMaterial("street:markings", context.scene);
      if (!context.mat)
        stripeMaterial.diffuseColor = Color3.FromHexString("#d8d6cb");
      stripeMaterial.zOffset = -3;
      stripeMaterial.zOffsetUnits = -3;
    },
  };
  for (const [crossingIndex, crossing] of CROSSING_MARKINGS.entries()) {
    const normalX = -crossing.dz,
      normalZ = crossing.dx;
    for (
      let offset = -crossing.roadWidth / 2 + 0.6;
      offset < crossing.roadWidth / 2 - 0.2;
      offset += 1
    ) {
      yield {
        phase: "streets-crossings",
        operation: `${crossingIndex}:${offset}`,
        run: () => {
          const stripe = new Mesh("mapped crossing stripe", context.scene);
          const cx = crossing.x + normalX * offset,
            cz = crossing.z + normalZ * offset;
          const points: GroundPoint[] = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([a, b]) => [
            cx + crossing.dx * a * 1.35 + normalX * b * 0.23,
            cz + crossing.dz * a * 1.35 + normalZ * b * 0.23,
          ]);
          const vd = new VertexData();
          Object.assign(
            vd,
            drapeTriangles(
              points,
              [0, 1, 3, 3, 1, 2],
              STREET_SURFACE_Y + 0.005,
            ),
          );
          vd.applyToMesh(stripe);
          stripe.material = stripeMaterial;
          stripe.isPickable = false;
          stripes.push(stripe);
        },
      };
    }
  }
  if (stripes.length) {
    yield {
      phase: "streets-crossings",
      operation: "merge",
      run: () => {
        const merged = Mesh.MergeMeshes(stripes, true, true);
        if (merged) {
          merged.name = "mapped-crossing-markings";
          merged.isPickable = false;
          merged.freezeWorldMatrix();
          meshes.push(merged);
        }
      },
    };
  }
  return {
    meshes,
    lamps: LAMP_PLACEMENTS.length,
    crossings: CROSSING_MARKINGS.length,
    transitions: transitions.length,
  };
}
