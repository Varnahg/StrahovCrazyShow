import fs from 'node:fs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url)), mode = process.env.OWNER_MODE;
assert.ok(mode === 'owner' || mode === 'reference');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const changes = JSON.parse(fs.readFileSync(join(root, 'runtime-changes.json'))).changes, targets = new Map(), loaded = [];
for (const change of changes.filter(change => change.path.endsWith('.js'))) {
  const physical = fs.realpathSync(join(root, 'fixture/node_modules', change.path));
  assert.equal(sha(fs.readFileSync(physical)), change.sha256);
  const source = fs.readFileSync(mode === 'owner' ? physical : join(root, 'preimages', change.path.slice('@babylonjs/core/'.length)), 'utf8');
  assert.equal(sha(source), mode === 'owner' ? change.sha256 : change.before);
  targets.set(pathToFileURL(physical).href, { change, source });
}
registerHooks({ load(url, context, next) {
  const target = targets.get(url); if (!target) return next(url, context);
  assert.equal(sha(fs.readFileSync(fileURLToPath(url))), target.change.sha256);
  loaded.push({ url, path: target.change.path, physicalSha256: target.change.sha256, loadedSha256: sha(target.source) });
  return { format: 'module', source: target.source, shortCircuit: true };
} });
process.on('exit', () => {
  if (process.env.OWNER_RECEIPT) fs.writeFileSync(join(root, process.env.OWNER_RECEIPT), JSON.stringify({ mode, loaded,
    scope: 'Same actual physical package identity. Owner loads exact merged physical JS; reference substitutes exactly three current preimage JS modules at those same URLs. No timed benchmark.' }, null, 2) + '\n', { flag: 'wx' });
});
