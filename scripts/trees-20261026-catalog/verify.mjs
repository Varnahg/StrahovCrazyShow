/** Small explicit audit of the two pinned axes and extreme source dimensions.
 * Does not export models or generate the complete catalogue's geometry. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createAxisFit, fitAxes } from './fit.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
export function verifyPreparedCatalog(plan) {
  const loaded = new Map();
  for (const [id, source] of Object.entries(plan.axisSources)) {
    const bytes = fs.readFileSync(source.path);
    if (bytes.length !== source.bytes || sha(bytes) !== source.sha256) throw Error('Axis source changed');
    loaded.set(id, JSON.parse(bytes));
  }
  const broad = plan.placements.filter(p => p.family === 'deciduous-broadleaf');
  const examples = [
    ...Object.values(plan.axisSources).map(s => plan.placements.find(p => p.sourceTreeId === s.sourceTreeId)),
    ...[...broad].sort((a,b) => a.dimensions.height-b.dimensions.height).filter((_,i) => i===0 || i===broad.length-1),
    ...plan.placements.filter(p => p.family === 'evergreen-conifer' && p.sourceTreeId !== 'ipr-b6-north-conifer'),
  ];
  const seen = new Set(), cases = [];
  for (const target of examples) {
    if (seen.has(target.sourceTreeId)) continue; seen.add(target.sourceTreeId);
    const source = loaded.get(target.authoringSource), fit = createAxisFit(plan.axisSources[target.authoringSource].referenceDimensions, target.dimensions);
    const { axes, audit } = fitAxes(source.axes, fit);
    if (fit.identity && JSON.stringify(axes) !== JSON.stringify(source.axes)) throw Error('Identity fit altered accepted axes');
    cases.push({ sourceTreeId: target.sourceTreeId, prototype: target.authoringSource, identity: fit.identity, audit });
  }
  return { operation: 'bounded axis audit, no model export', cases,
    limitation: 'Centreline connectivity and radii only. Exported wood surfaces, new leaf-to-tube support, alpha coverage and GPU appearance still require downstream verification.' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--audit') throw Error('Use verify.mjs --audit');
  const plan = JSON.parse(fs.readFileSync('.cache/trees-catalog-20261026/source-plan.json'));
  const result = verifyPreparedCatalog(plan), bytes = Buffer.from(JSON.stringify(result, null, 2)+'\n');
  const output = '.cache/trees-catalog-20261026/axis-audit.json'; fs.writeFileSync(output, bytes, {flag:'wx'});
  console.log(JSON.stringify({path:output,bytes:bytes.length,sha256:sha(bytes),cases:result.cases.map(c=>({id:c.sourceTreeId,identity:c.identity,branches:c.audit.fitted.branches,maxGap:c.audit.fitted.maxAttachmentGap,radius:c.audit.fitted.rootRadius}))}));
}
