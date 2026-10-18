import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(root, '../../webgpu-hitch-validation-20261017/b6-coverage-v2');
const candidate = path.join(root, 'candidate');
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'source-manifest.json'), 'utf8'));
if (manifest.snapshotId !== '36431c878f1c0c151af4bc259918a108dee60b15d1d294ecb7e6e40ee12ad42b') throw Error('Unexpected base');
if (fs.existsSync(candidate)) throw Error('Preserve existing candidate');
const copied = {};
function copy(relative) {
  const input = path.join(base, relative), stat = fs.lstatSync(input);
  if (stat.isSymbolicLink()) throw Error('Unexpected input link ' + relative);
  if (stat.isDirectory()) { for (const name of fs.readdirSync(input)) copy(relative + '/' + name); return; }
  const bytes = fs.readFileSync(input), hash = createHash('sha256').update(bytes).digest('hex');
  if (manifest.files[relative] !== hash) throw Error('Base hash mismatch ' + relative);
  const output = path.join(candidate, relative); fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes); copied[relative] = hash;
}
for (const dir of ['client', 'shared', 'tests']) copy(dir);
for (const file of ['package.json', 'tsconfig.json']) copy(file);
fs.symlinkSync(path.resolve(root, '../../webgpu-migration/dependencies-v5/node_modules'), path.join(candidate, 'node_modules'), 'junction');
fs.writeFileSync(path.join(root, 'input-manifest.json'), JSON.stringify({ snapshotId: manifest.snapshotId, base, candidate, files: copied }, null, 2) + '\n');
console.log(JSON.stringify({ candidate, files: Object.keys(copied).length, snapshotId: manifest.snapshotId }));

