/** Pure, deterministic rigid source-group fitting. No IO or invented leaves. */
const finite3 = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
export const transformPoint = (matrix, p) => [0, 1, 2].map(i => matrix[i * 3] * p[0] + matrix[i * 3 + 1] * p[1] + matrix[i * 3 + 2] * p[2]);
const subtract = (a, b) => a.map((v, i) => v - b[i]);

// Jacobi diagonalization of Horn's real symmetric 4x4 matrix. It handles exact
// 180-degree rotations and repeated eigenvalues without a power-iteration seed.
function largestEigenvector(input) {
  const a = input.map(row => [...row]), vectors = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => +(i === j)));
  for (let iteration = 0; iteration < 64; iteration++) {
    let p = 0, q = 1;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p = i; q = j; }
    if (Math.abs(a[p][q]) < 1e-14) break;
    const angle = .5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(angle), s = Math.sin(angle);
    const pp = a[p][p], qq = a[q][q], pq = a[p][q];
    for (let k = 0; k < 4; k++) if (k !== p && k !== q) {
      const kp = a[k][p], kq = a[k][q];
      a[k][p] = a[p][k] = c * kp - s * kq; a[k][q] = a[q][k] = s * kp + c * kq;
    }
    a[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    a[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq; a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 4; k++) { const kp = vectors[k][p], kq = vectors[k][q]; vectors[k][p] = c * kp - s * kq; vectors[k][q] = s * kp + c * kq; }
  }
  let largest = 0; for (let i = 1; i < 4; i++) if (a[i][i] > a[largest][largest]) largest = i;
  const result = vectors.map(row => row[largest]), sign = (result.find(n => Math.abs(n) > 1e-12) ?? 1) < 0 ? -1 : 1;
  return result.map(n => n * sign);
}

/** Anchors are fixed group pivots (mean of the original attachment points).
 * Only a proper rotation is fitted; no translation drift, scale or reflection. */
export function rigidFit(source, target) {
  if (!Array.isArray(source) || source.length < 3 || source.length !== target?.length || !source.every(finite3) || !target.every(finite3)) throw Error('Invalid rigid point correspondence');
  const h = new Float64Array(9);
  for (let k = 0; k < source.length; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) h[i * 3 + j] += source[k][i] * target[k][j];
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = h;
  const [w, x, y, z] = largestEigenvector([[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]]);
  const matrix = [1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w), 2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w), 2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)];
  let maximum = 0, squared = 0;
  for (let i = 0; i < source.length; i++) { const error = Math.hypot(...subtract(transformPoint(matrix, source[i]), target[i])); maximum = Math.max(maximum, error); squared += error * error; }
  return { matrix, quaternionWxyz: [w, x, y, z], maximum, rms: Math.sqrt(squared / source.length) };
}

/** Each medoid is an actual original group. Correspondence requires the same
 * photographed part sequence; exceeding a geometric bound retains exact MID. */
export function buildMedoidBank(input, { maxPerPattern = 8, maximumError = .06, rmsError = .025, selectionMaximumError = maximumError, selectionRmsError = rmsError } = {}) {
  if (!Array.isArray(input) || !input.length || !Number.isSafeInteger(maxPerPattern) || maxPerPattern < 1 || maxPerPattern > 8 || ![maximumError,rmsError,selectionMaximumError,selectionRmsError].every(n=>Number.isFinite(n)&&n>=0)) throw Error('Invalid source bank configuration');
  const ranks = new Set(), sourceParts = new Set(), patterns = new Map();
  for (const group of [...input].sort((a, b) => a.rank - b.rank)) {
    if (!Number.isSafeInteger(group.rank) || group.rank < 1 || group.rank > 65534 || ranks.has(group.rank) || !finite3(group.anchor) || !Array.isArray(group.parts) || group.parts.length < 1 || group.parts.length > 6 || group.parts.some(p => typeof p.partId !== 'string' || !Number.isSafeInteger(p.sourcePartIndex) || p.sourcePartIndex < 0) || !Array.isArray(group.points) || group.points.length !== group.parts.length * 4 || !group.points.every(finite3)) throw Error('Invalid source rank group');
    ranks.add(group.rank);
    for (const p of group.parts) { if (sourceParts.has(p.sourcePartIndex)) throw Error('Duplicate source photographic part'); sourceParts.add(p.sourcePartIndex); }
    const pattern = group.parts.map(p => p.partId).join('|'), item = { ...group, relative: group.points.map(p => subtract(p, group.anchor)) };
    if (!patterns.has(pattern)) patterns.set(pattern, []); patterns.get(pattern).push(item);
  }
  const medoids = [], placements = [];
  for (const [pattern, groups] of [...patterns].sort((a, b) => a[0].localeCompare(b[0]))) {
    const fits = new Map(), selected = new Set(), patternIds = [], groupByRank = new Map(groups.map(g => [g.rank, g])); let next = groups[Math.floor(groups.length / 2)];
    const describe = (id, group) => ({ id, sourceRank: group.rank, pattern, sourcePartIndices: group.parts.map(p => p.sourcePartIndex), anchor: [...group.anchor] });
    const consider = (id, source) => { for (const target of groups) {
      const fit = rigidFit(source.relative, target.relative), old = fits.get(target.rank);
      if (!old || fit.rms < old.rms - 1e-12 || (Math.abs(fit.rms - old.rms) < 1e-12 && fit.maximum < old.maximum)) fits.set(target.rank, { ...fit, prototype: id });
    } };
    for (let pass = 0; pass < Math.min(maxPerPattern, groups.length); pass++) {
      const id = medoids.length; medoids.push(describe(id,next)); patternIds.push(id); selected.add(next.rank); consider(id,next);
      const failed = groups.filter(g => !selected.has(g.rank) && (fits.get(g.rank).maximum > selectionMaximumError || fits.get(g.rank).rms > selectionRmsError));
      if (!failed.length) break;
      failed.sort((a, b) => fits.get(b.rank).maximum - fits.get(a.rank).maximum || a.rank - b.rank); next = failed[0];
    }
    // Two bounded Lloyd-style medoid refinements. The mean is only a scoring
    // aid: emitted prototypes remain actual source groups at original scale.
    // Align each member back into its current medoid frame before averaging.
    for (let iteration = 0; iteration < 2; iteration++) {
      let changed = false;
      for (const id of patternIds) {
        const members = groups.filter(g => fits.get(g.rank).prototype === id); if (!members.length) continue;
        const average = members[0].relative.map(() => [0,0,0]);
        for (const member of members) { const r = fits.get(member.rank).matrix, inverse = [r[0],r[3],r[6],r[1],r[4],r[7],r[2],r[5],r[8]];
          member.relative.forEach((p,i) => transformPoint(inverse,p).forEach((n,k) => { average[i][k] += n / members.length; })); }
        let best = groupByRank.get(medoids[id].sourceRank), error = rigidFit(best.relative,average).rms;
        for (const member of members) { const score = rigidFit(member.relative,average).rms; if (score < error - 1e-12) { best = member; error = score; } }
        if (best.rank !== medoids[id].sourceRank) { medoids[id] = describe(id,best); changed = true; }
      }
      if (!changed) break;
      fits.clear(); for (const id of patternIds) consider(id,groupByRank.get(medoids[id].sourceRank));
    }
    for (const group of groups) {
      const fit = fits.get(group.rank), exact = fit.maximum > maximumError || fit.rms > rmsError;
      placements.push({ rank: group.rank, sourcePartIndices: group.parts.map(p => p.sourcePartIndex), anchor: [...group.anchor], prototype: exact ? null : fit.prototype, fittedPrototype: fit.prototype, matrix: fit.matrix, quaternionWxyz: fit.quaternionWxyz, maximumError: fit.maximum, rmsError: fit.rms, exact });
    }
  }
  placements.sort((a, b) => a.rank - b.rank);
  return { version: 1, configuration: { maxPerPattern, maximumError, rmsError, selectionMaximumError, selectionRmsError, scale: 1, pivot: 'mean of exact source leaf attachment anchors' }, medoids, placements,
    counts: { groups: input.length, parts: sourceParts.size, patterns: patterns.size, medoids: medoids.length, exactGroups: placements.filter(p => p.exact).length, exactParts: placements.filter(p => p.exact).reduce((n, p) => n + p.sourcePartIndices.length, 0) } };
}
