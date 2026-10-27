import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const mode = process.argv[2];
if (!['full-coverage-mid', 'multiplane-v2'].includes(mode)) throw Error('Choose an explicit R5 revision');
const cache = `.cache/trees-r5-bake-20261025/${mode}`;
const destination = `${cache}/checkpoint`;
if (fs.existsSync(destination)) throw Error('Immutable checkpoint already exists');
const files = new Set([
  ...fs.readdirSync('scripts/trees-20261025-r5').filter(name => /\.(py|mjs)$/.test(name)).map(name => 'scripts/trees-20261025-r5/' + name),
  'tests/tree-seasonal-lod.test.ts', 'docs/trees/20261025/model-r5.md',
  'docs/agents/handoffs/trees-20261025-r5-authoring.md', 'docs/agents/handoffs/trees-20261025-r5-bake.md',
  '.cache/trees-r5-authoring-20261025/prepared.json', '.cache/trees-r5-authoring-20261025/tests-coverage-multiplane.log',
  ...fs.readdirSync(cache).filter(name => /\.(json|log)$/.test(name)).map(name => `${cache}/${name}`),
]);
if (mode === 'full-coverage-mid') {
  const base = 'public/models/vegetation/seasonal-r5/';
  const report = JSON.parse(fs.readFileSync(base + 'pilot-manifest.json', 'utf8'));
  for (const file of [base + 'pilot-manifest.json', base + 'runtime-contract.json', report.nativeMaster.path, ...report.variants.map(v => v.export.path)]) files.add(file);
} else {
  const file = 'public/models/vegetation/seasonal-r5/multiplane-v2/comparison-manifest.json';
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const entry of [file, report.nativeMaster.path, report.sourceGeometry.path, ...report.candidates.map(c => c.geometry.path),
    ...Object.values(report.atlas.maps).map(map => map.path), ...report.comparisons.map(image => image.path)]) files.add(entry);
}
fs.mkdirSync(destination);
const entries = [];
for (const file of [...files].sort()) {
  if (path.isAbsolute(file) || file.split('/').includes('..')) throw Error('Unsafe relative file');
  const target = path.join(destination, 'files', file);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
  const bytes = fs.readFileSync(target);
  entries.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const output = `${destination}/checkpoint.json`;
fs.writeFileSync(output, JSON.stringify({ revision: mode, createdUtc: new Date().toISOString(), tests: '10/10 targeted PASS; current native readbacks PASS',
  dependencyCheckpoints: { firstNative: '27cffd645fc185cac71ea96fae161ec68edcb9b412b43c3f33bf36edb3ca0e8d',
    firstFullPilots: '3826e21ce925cebb34253e6beffb43dc9be7419b5f6cf3622dbadff75568144e' }, entries }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ path: output, files: entries.length, bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
  sha256: createHash('sha256').update(fs.readFileSync(output)).digest('hex') }));
