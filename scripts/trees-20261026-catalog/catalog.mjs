/** Pure source catalogue adapter. No file, Blender, renderer or cache IO. */
const appearances = Object.freeze({ broadleaf: 'deciduous-broadleaf', conifer: 'evergreen-conifer', bare: 'reference-bare' });
export function number(value, label, min = -1e6, max = 1e6) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`Invalid ${label}`);
  return value;
}
export function vector(value, label, count = 3) {
  if (!Array.isArray(value) || value.length !== count) throw Error(`Invalid ${label}`);
  return value.map(n => number(n, label));
}
export function dimensions(value) {
  const result = { height: number(value.height, 'height', .1, 100), crownDiameter: number(value.crownDiameter, 'crown diameter', .1, 100),
    trunkRadius: number(value.trunkRadius, 'trunk radius', .01, 5), crownMinorRatio: number(value.crownMinorRatio, 'crown minor ratio', .1, 1),
    crownAzimuth: number(value.crownAzimuth, 'crown azimuth', -Math.PI * 2, Math.PI * 2), crownOffset: vector(value.crownOffset, 'crown offset', 2) };
  if (result.trunkRadius * 2 >= result.crownDiameter || Math.hypot(...result.crownOffset) > result.crownDiameter) throw Error('Implausible crown/trunk dimensions');
  return result;
}
/** Callers supply the actual shared collision and terrain results, not a second
 * implementation of those rules. Sorted output is independent of input order. */
export function buildTreeCatalog(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 2048) throw Error('Invalid source population');
  const ids = new Set();
  const placements = rows.map(({ tree, collision, rootY }) => {
    const id = tree?.osmId, source = tree?.reconstruction;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || ids.has(id)) throw Error('Invalid or duplicate source identity');
    ids.add(id);
    if (!source || source.id !== id || !appearances[source.appearance]) throw Error('Missing source reconstruction/appearance');
    const shape = dimensions(source);
    const root = [number(tree.x, 'root x'), number(tree.z, 'root z')];
    if (collision?.x !== root[0] || collision?.z !== root[1] || collision?.radius !== shape.trunkRadius) throw Error('Shared collision/source mismatch');
    number(collision.height, 'collision height', .1, 100);
    const uncertainty = tree.positionUncertaintyMetres ?? source.reference?.positionUncertaintyMetres;
    if (uncertainty === undefined) throw Error('Missing position uncertainty');
    if (source.botanicalSpecies !== null && typeof source.botanicalSpecies !== 'string') throw Error('Invalid botanical provenance');
    return { sourceTreeId: id, sourceRootXZ: root, rootWorldY: number(rootY, 'terrain root height'),
      placementSource: tree.placementSource ?? null, provenance: tree.provenance,
      positionUncertaintyMetres: number(uncertainty, 'position uncertainty', 0, 100),
      family: appearances[source.appearance], botanicalSpecies: source.botanicalSpecies,
      dimensions: shape, collision: { ...collision }, seed: number(source.seed, 'seed', 0, 0xffffffff),
      authoringSource: source.appearance === 'bare' ? 'existing-source-bare-wood' : source.appearance === 'conifer' ? 'own-conifer-r5' : 'own-broadleaf-r6',
      foliage: source.appearance !== 'bare',
      reference: structuredClone(source.reference),
      referenceRadialOutline: [...source.radialOutline].map(n => number(n, 'radial reference', 0, 10)) };
  }).sort((a, b) => a.sourceTreeId.localeCompare(b.sourceTreeId, 'en'));
  return { version: 1, usage: 'offline source plan; not a runtime asset manifest', units: 'metres',
    coordinateSpace: 'world X east/Y up/Z south; axes and leaf geometry use root-local Blender Z-up',
    count: placements.length, countsByFamily: Object.fromEntries(Object.values(appearances).map(f => [f, placements.filter(p => p.family === f).length])),
    dimensionBasis: 'Reference estimates, not surveyed branch topology. Accepted prototype proportions are adjusted relative to their source estimates.', placements };
}
