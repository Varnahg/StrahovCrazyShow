/** Deterministic derived-only ear clearance. Original CC0 input, head, UV atlas
 * and authored vertices are preserved; clipped edges interpolate original UVs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../../..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const runtimePath = path.join(root, "client/data/student-hair.json");
const beforePath = path.join(directory, "short04-before-ear-contour.json");
const originalRuntimeSha =
  "a34cf7a9f04f6f7d0c132ab8172725872e222fef10f3a74b5ab29f681bd1365e";
const runtime = read(runtimePath),
  source = read(path.join(directory, "source.json"));
if (!fs.existsSync(beforePath)) {
  if (hash(fs.readFileSync(runtimePath)) !== originalRuntimeSha)
    throw Error("unexpected pre-repair runtime");
  write(beforePath, runtime.styles.short04);
}
const before = read(beforePath),
  earSourcePath = path.join(directory, "ear-source-audit.json"),
  earSource = read(earSourcePath);
const scale = [0.184, 0.235, 0.195],
  margin = 0.0025;
function hull(points) {
  const unique = [
    ...new Map(points.map((point) => [point.join(","), point])).values(),
  ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [],
    upper = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0)
      lower.pop();
    lower.push(point);
  }
  for (const point of unique.toReversed()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0)
      upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
const volumes = earSource.ears.map(
  ({ side, faceSet, pointsHeadLocalMetres }) => {
    const outline = hull(
      pointsHeadLocalMetres.map((point) => [point[1], point[2]]),
    );
    const planes = [[side, 0, 0, -0.055]];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length],
        dy = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dy, dz),
        ny = -dz / length,
        nz = dy / length;
      planes.push([0, ny, nz, -ny * a[0] - nz * a[1] + margin]);
    }
    return {
      side,
      faceSet,
      referenceVertices: pointsHeadLocalMetres.length,
      marginMetres: margin,
      outlineYZ: outline,
      planes,
    };
  },
);
const mix = (a, b, t) =>
  a.map((value, index) => value + (b[index] - value) * t);
function clip(polygon, plane, inside) {
  const result = [],
    distance = (v) =>
      plane[0] * v.p[0] + plane[1] * v.p[1] + plane[2] * v.p[2] + plane[3];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    let da = distance(a),
      db = distance(b);
    if (Math.abs(da) < 1e-10) da = 0;
    if (Math.abs(db) < 1e-10) db = 0;
    const ina = inside ? da >= 0 : da <= 0,
      inb = inside ? db >= 0 : db <= 0;
    if (ina) result.push(a);
    if (ina !== inb) {
      const t = Math.max(0, Math.min(1, da / (da - db)));
      result.push({
        p: mix(a.p, b.p, t),
        uv: mix(a.uv, b.uv, t),
        n: mix(a.n, b.n, t),
      });
    }
  }
  return result.filter(
    (v, i) =>
      i === 0 ||
      Math.hypot(...v.p.map((p, j) => p - result[i - 1].p[j])) > 1e-12,
  );
}
function area(polygon) {
  let result = 0;
  for (let i = 1; i + 1 < polygon.length; i++) {
    const a = polygon[i].p.map((p, j) => p - polygon[0].p[j]),
      b = polygon[i + 1].p.map((p, j) => p - polygon[0].p[j]);
    result +=
      Math.hypot(
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ) / 2;
  }
  return result;
}
function subtract(polygon, volume) {
  let intersection = polygon;
  for (const plane of volume.planes) {
    intersection = clip(intersection, plane, true);
    if (intersection.length < 3) return [polygon];
  }
  if (area(intersection) < 1e-12) return [polygon];
  const outside = [];
  let remaining = polygon;
  for (const plane of volume.planes) {
    const part = clip(remaining, plane, false);
    if (area(part) > 1e-12) outside.push(part);
    remaining = clip(remaining, plane, true);
    if (remaining.length < 3) break;
  }
  return outside;
}
const changes = {};
for (const fit of ["plain", "glasses"]) {
  const original = before[fit].near;
  if (JSON.stringify(original) !== JSON.stringify(before[fit].medium))
    throw Error("unexpected different short04 LOD");
  const output = {
    positions: [...original.positions],
    normals: [...original.normals],
    uvs: [...original.uvs],
    indices: [],
  };
  const vertices = Array.from(
    { length: original.positions.length / 3 },
    (_, id) => ({
      id,
      p: original.positions
        .slice(id * 3, id * 3 + 3)
        .map((v, i) => v * scale[i]),
      n: original.normals.slice(id * 3, id * 3 + 3),
      uv: original.uvs.slice(id * 2, id * 2 + 2),
    }),
  );
  const added = new Map(),
    lineage = [],
    affected = [];
  let beforeArea = 0,
    afterArea = 0;
  const index = (vertex) => {
    if (vertex.id !== undefined) return vertex.id;
    const key = [...vertex.p, ...vertex.uv, ...vertex.n]
      .map((v) => v.toPrecision(14))
      .join(",");
    if (added.has(key)) return added.get(key);
    const id = output.positions.length / 3,
      length = Math.hypot(...vertex.n);
    output.positions.push(...vertex.p.map((v, i) => v / scale[i]));
    output.uvs.push(...vertex.uv);
    output.normals.push(...vertex.n.map((v) => v / length));
    added.set(key, id);
    return id;
  };
  for (let i = 0; i < original.indices.length; i += 3) {
    const triangle = original.indices.slice(i, i + 3).map((id) => vertices[id]);
    let pieces = [triangle];
    const initialArea = area(triangle);
    beforeArea += initialArea;
    for (const volume of volumes)
      pieces = pieces.flatMap((piece) => subtract(piece, volume));
    const remaining = pieces.reduce((sum, piece) => sum + area(piece), 0);
    afterArea += remaining;
    if (initialArea - remaining > 1e-12) affected.push(i / 3);
    if (pieces.length === 1 && pieces[0] === triangle) {
      output.indices.push(...original.indices.slice(i, i + 3));
      lineage.push(i / 3);
      continue;
    }
    for (const polygon of pieces)
      for (let j = 1; j + 1 < polygon.length; j++) {
        if (area([polygon[0], polygon[j], polygon[j + 1]]) <= 1e-12) continue;
        output.indices.push(
          index(polygon[0]),
          index(polygon[j]),
          index(polygon[j + 1]),
        );
        lineage.push(i / 3);
      }
  }
  runtime.styles.short04[fit] = { near: output, medium: output };
  changes[fit] = {
    beforeTriangles: original.indices.length / 3,
    afterTriangles: output.indices.length / 3,
    affectedOriginalTriangles: affected,
    originalVertices: original.positions.length / 3,
    addedVertices: output.positions.length / 3 - original.positions.length / 3,
    beforeAreaMetres2: beforeArea,
    afterAreaMetres2: afterArea,
    removedAreaMetres2: beforeArea - afterArea,
    outputTriangleOriginalIds: lineage,
  };
}
write(runtimePath, runtime);
const repair = {
  date: "2026-10-11",
  method:
    "Subtract only the complete original male sculpt ear face-set YZ hulls, keeping previous 2.5mm clearance and x>=55mm depth plane; interpolate original UV and normals on original triangle planes",
  sourceEarAuditSha256: hash(fs.readFileSync(earSourcePath)),
  beforeRuntimeSha256: originalRuntimeSha,
  beforeShort04Sha256: hash(fs.readFileSync(beforePath)),
  afterRuntimeSha256: hash(fs.readFileSync(runtimePath)),
  volumes,
  changes,
};
write(path.join(directory, "short04-ear-repair.json"), repair);
source.runtimeGeometrySha256 = repair.afterRuntimeSha256;
source.short04EarRepair = {
  beforeRuntimeSha256: originalRuntimeSha,
  sourceEarAuditSha256: repair.sourceEarAuditSha256,
  repairManifest: "short04-ear-repair.json",
};
for (const [style, fits] of Object.entries(runtime.styles))
  for (const [fit, levels] of Object.entries(fits))
    for (const [level, geometry] of Object.entries(levels))
      source.geometryVariants[`${style}:${fit}:${level}`] = hash(
        JSON.stringify(geometry),
      );
write(path.join(directory, "source.json"), source);
console.log(
  JSON.stringify(
    {
      runtimeSha: repair.afterRuntimeSha256,
      changes: Object.fromEntries(
        Object.entries(changes).map(([key, value]) => [
          key,
          {
            ...value,
            affectedOriginalTriangles: value.affectedOriginalTriangles.length,
            outputTriangleOriginalIds: undefined,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
