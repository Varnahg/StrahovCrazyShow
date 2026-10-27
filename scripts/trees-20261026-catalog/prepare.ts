import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TREES } from '../../shared/world';
import { treeTrunkCollision } from '../../shared/vegetation';
import { groundHeight } from '../../shared/terrain';
// @ts-expect-error Pure authoring module, also tested without project cache.
import { buildTreeCatalog } from './catalog.mjs';
// @ts-expect-error Pure authoring module.
import { createAxisFit, validateAxes } from './fit.mjs';

export const AXIS_PINS = Object.freeze({
  'own-broadleaf-r6': { path: '.cache/trees-r6-crown-20261026/updated-axes.json', bytes: 2506322, sha256: '8ddb2dd5d5e6aee513727d85b5eeee16ea520ae3d4d595b7ef0e83f78e32555c' },
  'own-conifer-r5': { path: '.cache/trees-pilot-20261025/own-conifer-axes.json', bytes: 2473502, sha256: 'ca7d415c6ebd73f0741c37d247be07535289992cdb360b1825fd2bbdca31a80a' },
});
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function prepareCatalog() {
  const catalog = buildTreeCatalog(TREES.map(tree => ({ tree, collision: treeTrunkCollision(tree), rootY: groundHeight(tree.x, tree.z) })));
  if (catalog.count !== 110 || JSON.stringify(catalog.countsByFamily) !== JSON.stringify({ 'deciduous-broadleaf': 107, 'evergreen-conifer': 2, 'reference-bare': 1 })) throw Error('Runtime inventory changed; review the new source population');
  const sources: Record<string, any> = {};
  for (const [id, pin] of Object.entries(AXIS_PINS)) {
    const bytes = readFileSync(pin.path); if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) throw Error('Pinned axis source changed: ' + pin.path);
    const source = JSON.parse(bytes.toString()), placement = catalog.placements.find((p: any) => p.sourceTreeId === source.sourceTreeId);
    if (!placement || JSON.stringify(source.sourceRootXZ) !== JSON.stringify(placement.sourceRootXZ) || source.nominalHeight !== placement.dimensions.height || source.nominalCrownDiameter !== placement.dimensions.crownDiameter || source.trunkRadius !== placement.dimensions.trunkRadius) throw Error('Axis/catalogue source mismatch');
    const audit = validateAxes(source.axes);
    if (Math.abs(audit.rootRadius - source.trunkRadius) > 1e-8) throw Error('Axis source radius mismatch');
    sources[id] = { ...pin, sourceTreeId: source.sourceTreeId, referenceDimensions: placement.dimensions, audit };
  }
  const sourcePaths = ['shared/world.ts', 'shared/vegetation.ts', 'shared/terrain.ts', 'shared/data/tree-reconstruction.json', 'shared/data/surveyed-trees.json', 'shared/data/landcover.json', 'shared/data/cad-buildings/b06-tree-placement.json'];
  return { ...catalog, axisSources: sources, sourceFiles: sourcePaths.map(path => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) }; }),
    placements: catalog.placements.map((p: any) => ({ ...p, axisFit: p.foliage ? createAxisFit(sources[p.authoringSource].referenceDimensions, p.dimensions) : null,
      exportRequirement: p.foliage ? 'Fit axes; regenerate tube geometry and metric leaf attachments; one shared rank assignment for all LOD; validate source support before export.' : 'Reuse/audit this source own wood-only geometry; no borrowed broadleaf crown or foliage.' })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--plan') throw Error('Use explicit small-plan operation: prepare.ts --plan');
  const plan = prepareCatalog(), bytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
  if (bytes.length > 1024 * 1024) throw Error('Source plan exceeded one MiB');
  mkdirSync('.cache/trees-catalog-20261026', { recursive: true });
  const path = '.cache/trees-catalog-20261026/source-plan.json'; writeFileSync(path, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ path, bytes: bytes.length, sha256: sha(bytes), count: plan.count, families: plan.countsByFamily }));
}
