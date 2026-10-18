import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(fs.readFileSync(path.join(root, 'input-manifest.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const changes = [];
function walk(relative) {
  const full = path.join(input.candidate, relative), stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) { for (const name of fs.readdirSync(full)) walk(relative + '/' + name); return; }
  const bytes = fs.readFileSync(full), sha256 = hash(bytes), originalSha256 = input.files[relative] ?? null;
  if (sha256 === originalSha256) return;
  changes.push({ path: relative, bytes: bytes.length, originalSha256, sha256 });
  if (originalSha256) {
    let diff;
    try { diff = execFileSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff', '--', path.join(input.base, relative), full]); }
    catch (error) { if (error.status !== 1) throw error; diff = error.stdout; }
    fs.writeFileSync(path.join(root, relative.replaceAll('/', '_') + '.diff'), diff);
  }
}
for (const dir of ['client', 'shared', 'tests']) walk(dir);
const evidence = ['assemble.mjs', 'create-parity-fixture.mjs', 'freeze.mjs', 'input-manifest.json',
  'targeted-01.log', 'targeted-02.log', 'inventory-01.log', 'inventory-02.log'].filter(p => fs.existsSync(path.join(root, p)))
  .map(p => ({ path: p, sha256: hash(fs.readFileSync(path.join(root, p))) }));
const record = { baseSnapshotId: input.snapshotId, changes, evidence,
  changedSourceDigest: hash(JSON.stringify(changes)), frozenAt: new Date().toISOString() };
fs.writeFileSync(path.join(root, 'overlay-record.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ files: changes.length, digest: record.changedSourceDigest, overlayRecordSha256: hash(fs.readFileSync(path.join(root, 'overlay-record.json'))) }));
