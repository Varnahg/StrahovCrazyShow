/** Pure geometry used by R5 authoring. No Blender, image writes, or runtime state. */
export const area = polygon => Math.abs(polygon.reduce((sum, p, i) => {
  const q = polygon[(i + 1) % polygon.length];
  return sum + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;

export function contains(polygon, point, tolerance = 1e-10) {
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= -tolerance;
  });
}

export function supportingPolygon(hull, degrees) {
  if (hull.length < 3 || hull.some(p => p.length !== 2 || !p.every(Number.isFinite))) throw Error('Invalid hull');
  const lo = [0, 1].map(i => Math.min(...hull.map(p => p[i])));
  const hi = [0, 1].map(i => Math.max(...hull.map(p => p[i])));
  let polygon = [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]];
  for (const degreesValue of degrees) {
    const radians = degreesValue * Math.PI / 180, n = [Math.cos(radians), Math.sin(radians)];
    const dot = p => p[0] * n[0] + p[1] * n[1];
    const support = Math.max(...hull.map(dot)), clipped = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = dot(a) - support, db = dot(b) - support;
      if (da <= 1e-12) clipped.push(a);
      if ((da < -1e-12 && db > 1e-12) || (da > 1e-12 && db < -1e-12)) {
        const t = da / (da - db);
        clipped.push(a.map((value, axis) => value + t * (b[axis] - value)));
      }
    }
    polygon = clipped;
  }
  return polygon.filter((p, i) => Math.hypot(...p.map((v, j) => v - polygon[(i + 1) % polygon.length][j])) > 1e-10);
}

export function fanTriangles(polygon) {
  if (polygon.length < 3 || area(polygon) <= 1e-12) throw Error('Degenerate polygon');
  return Array.from({ length: polygon.length - 2 }, (_, i) => [0, i + 1, i + 2]);
}

export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const length = a => Math.sqrt(dot(a, a));
export const unit = a => { const n = length(a); if (n < 1e-12) throw Error('Zero vector'); return a.map(v => v / n); };
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function sample(branch, t) {
  const u = Math.max(0, Math.min(1, t)) * (branch.points.length - 1);
  const i = Math.min(Math.floor(u), branch.points.length - 2), f = u - i;
  return { point: branch.points[i].map((v, axis) => v * (1 - f) + branch.points[i + 1][axis] * f),
    radius: branch.radii[i] * (1 - f) + branch.radii[i + 1] * f };
}

/** Near-only candidate: keep all branches and actual child joints. The deviation
 * bound is additionally limited to half the thinnest supporting radius. */
export function nearWood(branches, { distance = 2, deviationPixels = .45, maximumSides = 24, terminalRadiusCap = .5, higherOrderSides = null } = {}) {
  const focal = 720 / (2 * Math.tan(.85 / 2)), projectionBudget = deviationPixels * distance / focal;
  const knots = new Map(branches.map(b => [b.id, new Set([0, 1])]));
  for (const b of branches) if (b.parent !== null) {
    if (!knots.has(b.parent)) throw Error('Missing branch parent');
    knots.get(b.parent).add(b.attachmentT);
  }
  let maximumAcceptedError = 0, maximumRadialError = 0, triangleCount = 0;
  const result = branches.map(branch => {
    const ts = [...new Set([...knots.get(branch.id), ...branch.points.map((_, i) => i / (branch.points.length - 1))])].sort((a, b) => a - b);
    const values = ts.map(t => sample(branch, t));
    const required = ts.map((t, i) => knots.get(branch.id).has(t) ? i : -1).filter(i => i >= 0);
    const selected = new Set(required), epsilon = terminalRadiusCap === null ? projectionBudget : Math.min(projectionBudget, Math.min(...branch.radii) * terminalRadiusCap);
    function simplify(a, c) {
      if (c - a < 2) return;
      const line = sub(values[c].point, values[a].point), denominator = dot(line, line);
      let worst = 0, chosen = -1;
      for (let i = a + 1; i < c; i++) {
        const u = denominator ? Math.max(0, Math.min(1, dot(sub(values[i].point, values[a].point), line) / denominator)) : 0;
        const delta = sub(values[i].point, values[a].point).map((v, axis) => v - u * line[axis]);
        const error = length(delta) + Math.abs(values[i].radius - (values[a].radius * (1 - u) + values[c].radius * u));
        if (error > worst) { worst = error; chosen = i; }
      }
      if (worst > epsilon) { selected.add(chosen); simplify(a, chosen); simplify(chosen, c); }
      else maximumAcceptedError = Math.max(maximumAcceptedError, worst);
    }
    for (let i = 1; i < required.length; i++) simplify(required[i - 1], required[i]);
    const indices = [...selected].sort((a, b) => a - b), radius = Math.max(...branch.radii);
    const sideLimit = higherOrderSides !== null && branch.depth >= 3 ? higherOrderSides : maximumSides;
    const sides = Math.max(3, Math.min(sideLimit, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - projectionBudget / radius)))));
    maximumRadialError = Math.max(maximumRadialError, radius * (1 - Math.cos(Math.PI / sides)));
    triangleCount += 2 * sides * (indices.length - 1) + 2 * (sides - 2);
    return { ...branch, points: indices.map(i => values[i].point), radii: indices.map(i => values[i].radius), sides,
      sourceParameters: indices.map(i => ts[i]), maximumCurveError: epsilon };
  });
  return { branches: result, audit: { sourceBranches: branches.length, retainedBranches: result.length, triangleCount,
    distance, deviationPixels, projectionBudget, maximumAcceptedError, maximumRadialError,
    maximumRadialErrorPixels: maximumRadialError * focal / distance, maximumSides, higherOrderSides, diameterCull: false,
    allJunctionsPreserved: true, terminalRadiusErrorCap: terminalRadiusCap } };
}

export function tubeTriangles(branch) {
  const vertices = [], triangles = [], sides = branch.sides;
  for (let i = 0; i < branch.points.length; i++) {
    const direction = unit(sub(branch.points[Math.min(i + 1, branch.points.length - 1)], branch.points[Math.max(0, i - 1)]));
    const side = unit(cross(direction, Math.abs(direction[1]) < .95 ? [0, 1, 0] : [1, 0, 0]));
    const up = cross(direction, side);
    for (let j = 0; j < sides; j++) {
      const angle = j * 2 * Math.PI / sides;
      vertices.push(branch.points[i].map((value, axis) => value + branch.radii[i] * (side[axis] * Math.cos(angle) + up[axis] * Math.sin(angle))));
      if (i) {
        const a = (i - 1) * sides + j, b = (i - 1) * sides + (j + 1) % sides, c = i * sides + (j + 1) % sides, d = i * sides + j;
        triangles.push([a, b, c], [a, c, d]);
      }
    }
  }
  for (let j = 1; j < sides - 1; j++) {
    triangles.push([0, j + 1, j]);
    const end = (branch.points.length - 1) * sides;
    triangles.push([end, end + j, end + j + 1]);
  }
  return triangles.map(face => face.map(i => vertices[i]));
}

export function triangleDistance(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return length(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return length(bp);
  const edge = (start, direction, t) => length(sub(p, start).map((v, i) => v - direction[i] * t));
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return edge(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return length(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return edge(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return edge(b, sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6));
  const denominator = va + vb + vc;
  if (Math.abs(denominator) < 1e-24) return Math.min(length(ap), length(bp), length(cp));
  const v = vb / denominator, w = vc / denominator;
  return length(ap.map((value, i) => value - ab[i] * v - ac[i] * w));
}

export function attachmentAudit(branches, parts) {
  const surfaces = new Map(branches.map(b => [b.id, tubeTriangles(b)]));
  let maximumDistance = 0, failed = 0, maximumThresholdRatio = 0;
  for (const part of parts) {
    const triangles = surfaces.get(part.branchId);
    if (!triangles) throw Error('Foliage supporting branch removed');
    let distance = Infinity;
    for (const triangle of triangles) distance = Math.min(distance, triangleDistance(part.anchor, ...triangle));
    if (!Number.isFinite(distance)) throw Error('Nonfinite attachment distance');
    const threshold = Math.max(.008, part.supportRadius + .005);
    maximumDistance = Math.max(maximumDistance, distance);
    maximumThresholdRatio = Math.max(maximumThresholdRatio, distance / threshold);
    if (distance > threshold) failed++;
  }
  return { testedSourceAnchors: parts.length, maximumDistance, maximumThresholdRatio, failed,
    method: 'point-to-triangle distance to actual candidate supporting-branch tube, including caps; all source anchors' };
}

/** Stable projection frame remains in source coordinates, never recentres source geometry. */
export function shootFrame(positions, anchor, direction) {
  const up = unit(direction), fallback = Math.abs(up[2]) < .9 ? [0, 0, 1] : [0, 1, 0];
  const right = unit(cross(up, fallback)), normal = unit(cross(right, up));
  const projected = positions.map(p => [dot(sub(p, anchor), right), dot(sub(p, anchor), up), dot(sub(p, anchor), normal)]);
  const lo = [0, 1, 2].map(i => Math.min(...projected.map(p => p[i])));
  const hi = [0, 1, 2].map(i => Math.max(...projected.map(p => p[i])));
  const pad = Math.max(hi[0] - lo[0], hi[1] - lo[1]) * .025;
  const bounds = [[lo[0] - pad, lo[1] - pad], [hi[0] + pad, hi[1] + pad]];
  return { anchor, right, up, normal, bounds, depthRange: [lo[2], hi[2]], paddingMetres: pad };
}
