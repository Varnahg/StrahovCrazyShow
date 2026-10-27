/** Freeze only R5-owned files and evidence; never replace an earlier checkpoint. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = process.cwd();
const destination = path.resolve(root, '.cache/trees-r5-bake-20261025/native-checkpoint');
if (fs.existsSync(destination)) throw Error('Immutable R5 checkpoint already exists');
const reportPath = 'shared/data/assets/tree-r5-materials-manifest.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const files = new Set([
  ...fs.readdirSync('scripts/trees-20261025-r5').filter(name => /\.(mjs|py)$/.test(name)).map(name => 'scripts/trees-20261025-r5/' + name),
  'tests/tree-seasonal-lod.test.ts', 'docs/trees/20261025/model-r5.md',
  'docs/agents/handoffs/trees-20261025-r5-authoring.md', 'docs/agents/handoffs/trees-20261025-r5-bake.md', reportPath,
  report.nativeMaster.path, report.woodComparison.nativeMaster.path,
  report.sourceGeometry.path, report.cardGeometry.path,
  ...report.fir.map(part => part.geometry.path), ...Object.values(report.maps).map(map => map.path),
  ...report.previews.map(image => image.path), ...report.woodComparison.renders.map(image => image.path),
  '.cache/trees-r5-authoring-20261025/prepared.json', '.cache/trees-r5-authoring-20261025/preparation-summary.json',
  '.cache/trees-r5-authoring-20261025/prepare.log', '.cache/trees-r5-authoring-20261025/tests-final.log',
  ...['bake-attempt1.log', 'wood-attempt1.log', 'native-readback.log', 'native-readback-final.log',
    'bake-report.json', 'wood-report.json', 'native-readback.json'].map(name => '.cache/trees-r5-bake-20261025/' + name),
]);
const allowed = ['scripts/trees-20261025-r5/', 'tests/tree-seasonal-lod.test.ts', 'docs/trees/20261025/model-r5.md',
  'docs/agents/handoffs/trees-20261025-r5-', 'shared/data/assets/tree-r5-materials-manifest.json',
  'assets/blender/vegetation/seasonal-r5/', 'public/models/vegetation/seasonal-r5/', 'public/textures/trees/20261025-r5/',
  '.cache/trees-r5-authoring-20261025/', '.cache/trees-r5-bake-20261025/'];
for (const file of files) {
  if (!allowed.some(prefix => file.startsWith(prefix)) || path.isAbsolute(file) || file.split('/').includes('..')) throw Error(`Out of scope ${file}`);
  if (!fs.statSync(file).isFile()) throw Error(`Not a file ${file}`);
}
fs.mkdirSync(destination);
const entries = [];
for (const file of [...files].sort()) {
  const target = path.join(destination, 'files', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
  const bytes = fs.readFileSync(target);
  entries.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const checkpoint = { version: 1, phase: 'native R5 comparison; not runtime accepted', sourceBaseline: '8516c7b1877ec66c37120d9088264d44c52882f1',
  sourceR4Checkpoint: report.sourceCheckpoint, tests: '7/7 targeted CPU PASS; both native masters reopened; no new full-game GPU proof', entries };
const file = path.join(destination, 'checkpoint.json');
fs.writeFileSync(file, JSON.stringify(checkpoint, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ path: path.relative(root, file).replaceAll('\\', '/'), files: entries.length,
  bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
