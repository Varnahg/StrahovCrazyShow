import source from "./data/outdoor-artifacts.json";
import { groundHeight } from "./terrain";
import landcover from "./data/landcover.json";
import { STREET_FEATURES } from "./streets";

export type OutdoorArtifactMaterial =
  | "outdoor-wood"
  | "outdoor-dark-metal"
  | "outdoor-galvanized"
  | "outdoor-green"
  | "outdoor-black"
  | "outdoor-board"
  | "outdoor-paper"
  | "outdoor-concrete"
  | "outdoor-pink"
  | "outdoor-pink-dark"
  | "outdoor-ivory"
  | "outdoor-glass";
export type OutdoorArtifactPart = {
  positions: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
  material: OutdoorArtifactMaterial;
  artifactId: string;
  lod?: "both" | "near";
};
export type OutdoorArtifactCollider = {
  artifactId: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
};
export type OutdoorArtifact = {
  id: string;
  kind: string;
  name: string;
  source: string;
  x: number;
  z: number;
  yaw: number;
  points: number[][];
  tags: Record<string, string>;
  osmId: string;
  osmType: string;
  positionEvidence: string;
  orientationEvidence: string;
  dimensionsEvidence: string;
  nearbyTreeOsmIds: string[];
  nodeIds?: string[];
};
export type OutdoorArtifactPlan = {
  parts: OutdoorArtifactPart[];
  colliders: OutdoorArtifactCollider[];
  artifacts: readonly OutdoorArtifact[];
  stats: {
    artifactCount: number;
    triangleCount: number;
    colliderCount: number;
    byKind: Record<string, number>;
  };
  audit: { artifactId: string; reason: string; omittedMetres?: number }[];
};
/** Importing the inventory does not allocate meshes, colliders or terrain samples. */
export const OUTDOOR_ARTIFACTS =
  source.artifacts as unknown as readonly OutdoorArtifact[];
export const OUTDOOR_ARTIFACT_SOURCE = source.source;
export const OUTDOOR_ARTIFACT_BOUNDS = source.bounds;
/** Identified map candidates awaiting photo/shape evidence; never rendered as
 * made-up generic sculptures. The tractor records its existing model owner. */
export const OUTDOOR_ARTIFACT_CANDIDATES = source.deferredCandidates;

type Point = readonly number[];
const distanceToSegment = (x: number, z: number, a: Point, b: Point) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length2 = dx * dx + dz * dz;
  const t = length2
    ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2))
    : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
};
const taggedDimension = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = value === undefined ? NaN : Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
};
/** Only these five courts already own fence meshes/colliders. The northern
 * tennis court intentionally has no guessed fence in campus-exterior.ts. */
const existingCourtIds = new Set([
  "41833989",
  "41833990",
  "108568385",
  "108568430",
  "293949918",
]);
const courtEdges = landcover.areas
  .filter((area) => existingCourtIds.has(area.osmId))
  .flatMap((area) => area.points.slice(1).map((b, i) => [area.points[i], b]));
const withinBounds = (x: number, z: number, margin = 0) =>
  x >= source.bounds.minX + margin &&
  x <= source.bounds.maxX - margin &&
  z >= source.bounds.minZ + margin &&
  z <= source.bounds.maxZ - margin;

/** Source-aligned box mesh. The same box is passed to physics; no renderer
 * recomputes placement or scales a second copy of the dimensions. */
export function appendOutdoorArtifactBox(
  parts: OutdoorArtifactPart[],
  colliders: OutdoorArtifactCollider[],
  box: OutdoorArtifactCollider,
  material: OutdoorArtifactMaterial,
  collision = true,
  lod: "both" | "near" = "both",
) {
  const part: OutdoorArtifactPart = {
    artifactId: box.artifactId,
    material,
    lod,
    positions: [],
    normals: [],
    indices: [],
    uvs: [],
  };
  const c = Math.cos(box.yaw),
    s = Math.sin(box.yaw),
    x = box.w / 2,
    y = box.h / 2,
    z = box.d / 2;
  const faces = [
    [
      [-x, -y, z],
      [x, -y, z],
      [x, y, z],
      [-x, y, z],
    ],
    [
      [x, -y, -z],
      [-x, -y, -z],
      [-x, y, -z],
      [x, y, -z],
    ],
    [
      [x, -y, z],
      [x, -y, -z],
      [x, y, -z],
      [x, y, z],
    ],
    [
      [-x, -y, -z],
      [-x, -y, z],
      [-x, y, z],
      [-x, y, -z],
    ],
    [
      [-x, y, z],
      [x, y, z],
      [x, y, -z],
      [-x, y, -z],
    ],
    [
      [-x, -y, -z],
      [x, -y, -z],
      [x, -y, z],
      [-x, -y, z],
    ],
  ];
  const normals = [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ];
  for (let face = 0; face < faces.length; face++) {
    const normal = normals[face];
    for (const vertex of faces[face]) {
      part.positions.push(
        box.x + vertex[0] * c + vertex[2] * s,
        box.y + vertex[1],
        box.z - vertex[0] * s + vertex[2] * c,
      );
      part.normals.push(
        normal[0] * c + normal[2] * s,
        normal[1],
        -normal[0] * s + normal[2] * c,
      );
    }
    const offset = face * 4;
    part.indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset,
      offset + 2,
      offset + 3,
    );
    part.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  }
  parts.push(part);
  if (collision) colliders.push(box);
}

/** Thin infill has no appreciable side silhouette. Two faces retain correct
 * lighting from either side using four triangles instead of a twelve-triangle
 * cuboid. The structural rails/posts remain solid geometry. */
function appendFenceInfill(
  parts: OutdoorArtifactPart[],
  box: OutdoorArtifactCollider,
) {
  const part: OutdoorArtifactPart = {
    artifactId: box.artifactId,
    material: "outdoor-dark-metal",
    lod: "near",
    positions: [],
    normals: [],
    indices: [],
    uvs: [],
  };
  const c = Math.cos(box.yaw),
    s = Math.sin(box.yaw);
  for (const side of [1, -1]) {
    const offset = part.positions.length / 3;
    for (const [x, y] of [
      [-box.w / 2, -box.h / 2],
      [box.w / 2, -box.h / 2],
      [box.w / 2, box.h / 2],
      [-box.w / 2, box.h / 2],
    ]) {
      part.positions.push(box.x + x * c, box.y + y, box.z - x * s);
      part.normals.push(side * s, 0, side * c);
    }
    part.indices.push(
      ...(side === 1
        ? [offset, offset + 1, offset + 2, offset, offset + 2, offset + 3]
        : [offset, offset + 2, offset + 1, offset, offset + 3, offset + 2]),
    );
    part.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  }
  parts.push(part);
}

/** Merge the tiny authored primitives once, by asset/material/detail. The
 * immutable cached plan is shared by renderer and Simulation initializations. */
function mergeParts(parts: OutdoorArtifactPart[]) {
  const merged = new Map<string, OutdoorArtifactPart>();
  for (const part of parts) {
    const key = `${part.artifactId}:${part.material}:${part.lod ?? "both"}`;
    let target = merged.get(key);
    if (!target) {
      target = { ...part, positions: [], normals: [], indices: [], uvs: [] };
      merged.set(key, target);
    }
    const offset = target.positions.length / 3;
    target.positions.push(...part.positions);
    target.normals.push(...part.normals);
    target.uvs.push(...part.uvs);
    for (const index of part.indices) target.indices.push(index + offset);
  }
  return [...merged.values()];
}

let cachedPlan: OutdoorArtifactPlan | undefined;
export function buildOutdoorArtifactPlan(): OutdoorArtifactPlan {
  if (cachedPlan) return cachedPlan;
  const parts: OutdoorArtifactPart[] = [],
    colliders: OutdoorArtifactCollider[] = [];
  const audit: OutdoorArtifactPlan["audit"] = [];
  const gates = OUTDOOR_ARTIFACTS.filter(
    (artifact) => artifact.kind === "gate",
  );
  const paths = STREET_FEATURES.filter((feature) => !feature.isArea).flatMap(
    (feature) =>
      feature.points
        .slice(1)
        .map((b, i) => ({ a: feature.points[i], b, width: feature.width })),
  );
  const gateWidth = (gate: OutdoorArtifact) =>
    taggedDimension(
      gate.tags["maxwidth:physical"] ?? gate.tags.width,
      3.2,
      0.9,
      12,
    );
  const fenceBlocked = (x: number, z: number) => {
    if (!withinBounds(x, z, 0.3)) return "outside-walk-bounds";
    if (courtEdges.some(([a, b]) => distanceToSegment(x, z, a, b) < 1.3))
      return "existing-campus-court-fence-owner";
    if (
      gates.some(
        (gate) =>
          Math.hypot(x - gate.x, z - gate.z) < gateWidth(gate) / 2 + 0.3,
      )
    )
      return "mapped-gate-opening";
    if (
      paths.some(
        (path) =>
          x >= Math.min(path.a[0], path.b[0]) - path.width &&
          x <= Math.max(path.a[0], path.b[0]) + path.width &&
          z >= Math.min(path.a[1], path.b[1]) - path.width &&
          z <= Math.max(path.a[1], path.b[1]) + path.width &&
          distanceToSegment(x, z, path.a, path.b) < path.width / 2 + 0.65,
      )
    )
      return "mapped-access-clearance-game-adaptation";
    return null;
  };
  for (const artifact of OUTDOOR_ARTIFACTS) {
    const base = groundHeight(artifact.x, artifact.z),
      c = Math.cos(artifact.yaw),
      s = Math.sin(artifact.yaw);
    const box = (
      material: OutdoorArtifactMaterial,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      collision = true,
      lod: "both" | "near" = "both",
    ) => {
      appendOutdoorArtifactBox(
        parts,
        colliders,
        {
          artifactId: artifact.id,
          x: artifact.x + x * c + z * s,
          y: base + y,
          z: artifact.z - x * s + z * c,
          w,
          h,
          d,
          yaw: artifact.yaw,
        },
        material,
        collision,
        lod,
      );
    };
    // Shared ground-rooted furniture support for benches and picnic tables.
    // Keep the top level while feet follow the same terrain as the world.
    const support = (
      x: number,
      z: number,
      w: number,
      d: number,
      top: number,
    ) => {
      const worldX = artifact.x + x * c + z * s,
        worldZ = artifact.z - x * s + z * c;
      const bottom = groundHeight(worldX, worldZ) - base - 0.025,
        height = Math.max(0.16, top - bottom);
      box("outdoor-dark-metal", x, bottom + height / 2, z, w, height, d);
    };
    if (artifact.kind === "bench") {
      const width = taggedDimension(artifact.tags.length, 1.8, 0.8, 4);
      // A level, continuous seat supports standing; small grooves are visual.
      box("outdoor-wood", 0, 0.465, 0, width, 0.09, 0.48);
      for (const x of [-width * 0.36, width * 0.36])
        support(x, 0, 0.09, 0.42, 0.42);
      for (const z of [-0.12, 0, 0.12])
        box(
          "outdoor-dark-metal",
          0,
          0.511,
          z,
          width - 0.04,
          0.002,
          0.013,
          false,
          "near",
        );
      if (artifact.tags.backrest !== "no") {
        for (const y of [0.65, 0.81, 0.97])
          box("outdoor-wood", 0, y, -0.235, width, 0.125, 0.06);
        for (const x of [-width * 0.36, width * 0.36])
          box("outdoor-dark-metal", x, 0.74, -0.27, 0.055, 0.62, 0.05, false);
      }
    } else if (artifact.kind === "picnic-table") {
      const width = taggedDimension(artifact.tags.length, 1.9, 1.2, 3.5);
      // The source proves a picnic table, not a particular manufacturer. The
      // two integrated seats and tabletop are generic, explicitly estimated
      // dimensions; every solid authored box is also the actual physics box.
      box("outdoor-wood", 0, 0.785, 0, width, 0.07, 0.76);
      for (const z of [-0.68, 0.68])
        box("outdoor-wood", 0, 0.475, z, width, 0.075, 0.3);
      for (const x of [-width * 0.35, width * 0.35]) {
        support(x, 0, 0.1, 0.68, 0.75);
        for (const z of [-0.68, 0.68]) support(x, z, 0.1, 0.28, 0.4375);
        box("outdoor-dark-metal", x, 0.3, 0, 0.1, 0.075, 1.6);
      }
      for (const z of [-0.19, 0, 0.19])
        box(
          "outdoor-dark-metal",
          0,
          0.821,
          z,
          width - 0.04,
          0.002,
          0.012,
          false,
          "near",
        );
    } else if (artifact.kind === "waste-basket") {
      box("outdoor-dark-metal", 0, 0.43, 0, 0.44, 0.7, 0.4);
      box("outdoor-black", 0, 0.785, 0, 0.36, 0.015, 0.32, false);
      box("outdoor-galvanized", 0, 0.09, 0, 0.15, 0.18, 0.15);
      box("outdoor-galvanized", 0, 0.79, -0.2, 0.48, 0.045, 0.06, false);
    } else if (artifact.kind === "dumpster" || artifact.kind === "recycling") {
      const clothes = artifact.tags["recycling:clothes"] === "yes",
        batteries = artifact.tags["recycling:batteries"] === "yes";
      const w = batteries ? 0.38 : clothes ? 1.1 : 1.36,
        h = batteries ? 0.65 : clothes ? 1.8 : 1.12,
        d = batteries ? 0.3 : 0.93;
      // One mapped node is represented by one collection fixture. Accepted
      // fractions never become an invented row of three or more containers.
      box(
        clothes ? "outdoor-ivory" : "outdoor-green",
        0,
        h / 2 + 0.12,
        0,
        w,
        h,
        d,
      );
      box("outdoor-black", 0, h + 0.16, 0, w + 0.05, 0.08, d + 0.04);
      box(
        "outdoor-paper",
        0,
        h * 0.7,
        d / 2 + 0.005,
        w * 0.45,
        h * 0.25,
        0.012,
        false,
      );
      for (const x of [-w * 0.34, w * 0.34])
        for (const z of [-d * 0.32, d * 0.32])
          box("outdoor-black", x, 0.1, z, 0.13, 0.2, 0.13, false, "near");
      if (clothes)
        box(
          "outdoor-dark-metal",
          0,
          1.47,
          d / 2 + 0.018,
          0.68,
          0.19,
          0.04,
          false,
        );
    } else if (artifact.kind === "information-board") {
      for (const x of [-0.58, 0.58])
        box("outdoor-dark-metal", x, 1.02, 0, 0.075, 2.04, 0.075);
      box("outdoor-board", 0, 1.52, 0, 1.35, 0.9, 0.085);
      // Neutral paper is original geometry, not invented/illegible local text.
      for (const z of [-0.05, 0.05])
        box("outdoor-paper", 0, 1.52, z, 1.2, 0.76, 0.009, false);
      box("outdoor-green", 0, 1.83, 0.057, 1.12, 0.1, 0.008, false, "near");
    } else if (artifact.kind === "bollard") {
      // An OSM bollard way is a row. Only the mapped vertices are used; no
      // inferred extra bollards are inserted between source nodes.
      for (const point of artifact.points)
        if (withinBounds(point[0], point[1], 0.1))
          appendOutdoorArtifactBox(
            parts,
            colliders,
            {
              artifactId: artifact.id,
              x: point[0],
              y: groundHeight(point[0], point[1]) + 0.43,
              z: point[1],
              w: 0.13,
              h: 0.86,
              d: 0.13,
              yaw: 0,
            },
            "outdoor-dark-metal",
          );
    } else if (artifact.kind === "bicycle-rack") {
      const stands = Math.max(
        1,
        Math.min(
          12,
          Math.ceil(taggedDimension(artifact.tags.capacity, 6, 1, 24) / 2),
        ),
      );
      for (let i = 0; i < stands; i++) {
        const x = (i - (stands - 1) / 2) * 0.7;
        for (const z of [-0.36, 0.36])
          box("outdoor-galvanized", x, 0.38, z, 0.055, 0.76, 0.055);
        box("outdoor-galvanized", x, 0.76, 0, 0.055, 0.055, 0.78);
      }
      if (artifact.tags.covered === "yes") {
        const width = stands * 0.7 + 0.5;
        for (const x of [-width / 2 + 0.1, width / 2 - 0.1])
          box("outdoor-galvanized", x, 1.13, -0.72, 0.075, 2.26, 0.075);
        box("outdoor-dark-metal", 0, 2.28, 0, width, 0.07, 1.8);
      }
    } else if (artifact.kind === "gate") {
      const width = gateWidth(artifact);
      // Unknown/accessible gate states are open in this demo. Posts keep the
      // true mapped opening; locked/private gates get a visibly closed leaf.
      for (const x of [-width / 2, width / 2])
        box("outdoor-dark-metal", x, 0.82, 0, 0.11, 1.64, 0.11);
      const closed =
        artifact.tags.locked === "yes" ||
        artifact.tags.foot === "no" ||
        artifact.tags.foot === "private" ||
        (artifact.tags.access === "private" && artifact.tags.foot !== "yes");
      if (closed) {
        box("outdoor-dark-metal", 0, 0.87, 0, width - 0.11, 0.07, 0.075, false);
        box("outdoor-dark-metal", 0, 1.5, 0, width - 0.11, 0.065, 0.075, false);
        for (let x = -width / 2 + 0.24; x < width / 2; x += 0.22)
          box(
            "outdoor-dark-metal",
            x,
            0.89,
            0,
            0.024,
            1.24,
            0.024,
            false,
            "near",
          );
        colliders.push({
          artifactId: artifact.id,
          x: artifact.x,
          y: base + 0.87,
          z: artifact.z,
          w: width - 0.11,
          h: 1.37,
          d: 0.075,
          yaw: artifact.yaw,
        });
      } else
        audit.push({
          artifactId: artifact.id,
          reason: "open-gate-game-state-not-live-status",
        });
    } else if (artifact.kind === "fence" || artifact.kind === "railing") {
      const height = taggedDimension(
        artifact.tags.height,
        artifact.kind === "railing" ? 1.1 : 1.8,
        0.45,
        5,
      );
      const reasons = new Map<string, number>();
      for (let index = 1; index < artifact.points.length; index++) {
        const a = artifact.points[index - 1],
          b = artifact.points[index],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 0.05) continue;
        const count = Math.ceil(length / 0.4),
          step = length / count,
          dx = (b[0] - a[0]) / length,
          dz = (b[1] - a[1]) / length;
        let start = -1;
        const emit = (end: number) => {
          if (start < 0 || end <= start) return;
          const spanLength = end - start,
            panels = Math.ceil(spanLength / 2.7);
          for (let panel = 0; panel < panels; panel++) {
            const lo = start + (panel * spanLength) / panels,
              hi = start + ((panel + 1) * spanLength) / panels;
            const x = a[0] + ((lo + hi) / 2) * dx,
              z = a[1] + ((lo + hi) / 2) * dz,
              w = hi - lo;
            const y = Math.min(
              groundHeight(a[0] + lo * dx, a[1] + lo * dz),
              groundHeight(a[0] + hi * dx, a[1] + hi * dz),
            );
            const h =
              height +
              Math.abs(
                groundHeight(a[0] + lo * dx, a[1] + lo * dz) -
                  groundHeight(a[0] + hi * dx, a[1] + hi * dz),
              );
            const yaw = -Math.atan2(dz, dx),
              fenceBox = {
                artifactId: artifact.id,
                x,
                y: y + h / 2,
                z,
                w,
                h,
                d: 0.065,
                yaw,
              };
            colliders.push(fenceBox);
            for (const level of [0.2, h - 0.06])
              appendOutdoorArtifactBox(
                parts,
                colliders,
                { ...fenceBox, y: y + level, h: 0.045 },
                "outdoor-dark-metal",
                false,
              );
            for (const t of [lo, hi])
              appendOutdoorArtifactBox(
                parts,
                colliders,
                {
                  artifactId: artifact.id,
                  x: a[0] + t * dx,
                  y: y + h / 2,
                  z: a[1] + t * dz,
                  w: 0.075,
                  h,
                  d: 0.075,
                  yaw,
                },
                "outdoor-dark-metal",
                false,
              );
            // Thin rods provide a readable fence, while distant rendering keeps
            // the structural rails. Source does not establish a wire mesh weave.
            const bars = Math.max(1, Math.ceil(w / 0.32));
            for (let bar = 1; bar < bars; bar++) {
              const t = lo + (bar * w) / bars;
              appendFenceInfill(parts, {
                artifactId: artifact.id,
                x: a[0] + t * dx,
                y: y + h / 2,
                z: a[1] + t * dz,
                w: 0.018,
                h: h - 0.18,
                d: 0.018,
                yaw,
              });
            }
          }
        };
        for (let sample = 0; sample < count; sample++) {
          const t = (sample + 0.5) * step,
            reason = fenceBlocked(a[0] + t * dx, a[1] + t * dz);
          if (reason) {
            if (start >= 0) emit(sample * step);
            start = -1;
            reasons.set(reason, (reasons.get(reason) ?? 0) + step);
          } else if (start < 0) start = sample * step;
        }
        if (start >= 0) emit(length);
      }
      for (const [reason, omittedMetres] of reasons)
        audit.push({
          artifactId: artifact.id,
          reason,
          omittedMetres: +omittedMetres.toFixed(2),
        });
    }
  }
  const merged = mergeParts(parts),
    included = new Set(merged.map((part) => part.artifactId));
  const artifacts = OUTDOOR_ARTIFACTS.filter((artifact) =>
    included.has(artifact.id),
  );
  const byKind: Record<string, number> = {};
  for (const artifact of artifacts)
    byKind[artifact.kind] = (byKind[artifact.kind] ?? 0) + 1;
  cachedPlan = {
    parts: merged,
    colliders,
    artifacts,
    audit,
    stats: {
      artifactCount: artifacts.length,
      triangleCount: merged.reduce(
        (sum, part) => sum + part.indices.length / 3,
        0,
      ),
      colliderCount: colliders.length,
      byKind,
    },
  };
  return cachedPlan;
}
