import fs from "node:fs";
import crypto from "node:crypto";
const oldPath =
  "docs/reality-pack/building-window-kit-20261012/study-three-segment/highest-geometry.json";
const highPath = "assets/blender/building-window-kit/highest-geometry.json";
const nearPath = "shared/data/building-window-kit.json";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const old = read(oldPath),
  highest = read(highPath),
  near = read(nearPath);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
const add = (a, b, t) => a.map((v, i) => v + b[i] * t);
const point = (p, i) => p.slice(i * 3, i * 3 + 3);
// Ericson closest point on triangle, in world metres; no rasterisation or shader.
function closest(p, a, b, c) {
  const ab = sub(b, a),
    ac = sub(c, a),
    ap = sub(p, a),
    d1 = dot(ab, ap),
    d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b),
    d3 = dot(ab, bp),
    d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c),
    d5 = dot(ab, cp),
    d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return add(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return add(add(a, ab, vb * denom), ac, vc * denom);
}
function triangles(p) {
  const t = [];
  for (let i = 0; i < p.indices.length; i += 3)
    t.push(p.indices.slice(i, i + 3).map((id) => point(p.positions, id)));
  return t;
}
function samples(p) {
  const s = new Map();
  const keep = (a) => s.set(a.map((v) => v.toFixed(8)).join(","), a);
  for (let i = 0; i < p.positions.length / 3; i++) keep(point(p.positions, i));
  for (const t of triangles(p)) {
    keep(t[0].map((v, i) => (v + t[1][i] + t[2][i]) / 3));
    for (let i = 0; i < 3; i++)
      keep(t[i].map((v, j) => (v + t[(i + 1) % 3][j]) / 2));
  }
  return [...s.values()];
}
function directed(a, b) {
  const target = triangles(b),
    s = samples(a);
  let max = 0,
    worst = null;
  for (const p of s) {
    let best = Infinity;
    for (const t of target) {
      const q = closest(p, ...t),
        d = Math.hypot(...sub(p, q));
      if (d < best) best = d;
    }
    if (best > max) {
      max = best;
      worst = p;
    }
  }
  return { samples: s.length, maxDistanceMetres: max, worstPoint: worst };
}
function section(part, axis, coordinate) {
  const segments = [];
  for (const triangle of triangles(part)) {
    const points = [];
    for (let i = 0; i < 3; i++) {
      const a = triangle[i],
        b = triangle[(i + 1) % 3],
        da = a[axis] - coordinate,
        db = b[axis] - coordinate;
      if (Math.abs(da) < 1e-9) points.push(a);
      if (da * db < 0) points.push(add(a, sub(b, a), da / (da - db)));
    }
    const unique = [
      ...new Map(
        points.map((p) => [p.map((v) => v.toFixed(8)).join(","), p]),
      ).values(),
    ];
    if (unique.length === 2) segments.push(unique);
  }
  return segments;
}
function sectionDistance(a, b) {
  let max = 0;
  let samples = 0;
  for (const segment of a)
    for (const p of [
      segment[0],
      segment[1],
      add(segment[0], sub(segment[1], segment[0]), 0.5),
    ]) {
      samples++;
      let best = Infinity;
      for (const [start, end] of b) {
        const edge = sub(end, start),
          den = dot(edge, edge);
        const t = den
          ? Math.min(1, Math.max(0, dot(sub(p, start), edge) / den))
          : 0;
        best = Math.min(best, Math.hypot(...sub(p, add(start, edge, t))));
      }
      max = Math.max(max, best);
    }
  return { samples, maxDistanceMetres: max };
}
const report = {
  scope:
    "Sampled bidirectional 3D surface distance: vertices, edge midpoints and triangle centroids. Not a mathematical continuous Hausdorff proof or a GPU performance result.",
  limitMetres: 0.0007,
  files: [oldPath, highPath, nearPath].map((path) => ({
    path,
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(path))
      .digest("hex"),
  })),
  primitives: {},
};
for (const id of Object.keys(highest.primitives)) {
  report.primitives[id] = {
    studyToFinal: directed(old.primitives[id], highest.primitives[id]),
    finalToStudy: directed(highest.primitives[id], old.primitives[id]),
    highestToNear: directed(highest.primitives[id], near.primitives[id]),
    nearToHighest: directed(near.primitives[id], highest.primitives[id]),
  };
}
report.crossSections = {};
for (const id of ["outerFrame", "sash", "gasket", "reveal", "sill"]) {
  const p = highest.primitives[id],
    axis = id === "sill" ? 0 : 1,
    coordinate = (axis === 0 ? p.nominalWidth : p.nominalHeight) / 2;
  const a = section(old.primitives[id], axis, coordinate),
    b = section(p, axis, coordinate),
    c = section(near.primitives[id], axis, coordinate);
  report.crossSections[id] = {
    axis,
    coordinate,
    studySegments: a.length,
    highestSegments: b.length,
    nearSegments: c.length,
    studyToHighest: sectionDistance(a, b),
    highestToStudy: sectionDistance(b, a),
    highestToNear: sectionDistance(b, c),
    nearToHighest: sectionDistance(c, b),
  };
}
report.maxDistanceMetres = Math.max(
  ...Object.values(report.primitives).flatMap((p) =>
    Object.values(p).map((d) => d.maxDistanceMetres),
  ),
  ...Object.values(report.crossSections).flatMap((p) =>
    Object.values(p)
      .filter((d) => typeof d === "object")
      .map((d) => d.maxDistanceMetres),
  ),
);
report.pass = report.maxDistanceMetres <= report.limitMetres + 1e-7;
fs.writeFileSync(
  "docs/reality-pack/building-window-kit-20261012/profile-distance-audit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      pass: report.pass,
      maxDistanceMetres: report.maxDistanceMetres,
      limitMetres: report.limitMetres,
      perPrimitive: Object.fromEntries(
        Object.entries(report.primitives).map(([k, v]) => [
          k,
          Math.max(...Object.values(v).map((d) => d.maxDistanceMetres)),
        ]),
      ),
    },
    null,
    2,
  ),
);
if (!report.pass) process.exitCode = 1;
