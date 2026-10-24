// Diagnostický derivát buildu. Původní snapshot a jeho dist se nikdy nemění.
// Žádná browser automatizace; nejde o produkční nebo FPS přijímací build.
import { readFile, writeFile, mkdir, readdir, copyFile, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { constants } from 'node:fs';

const root = process.cwd();
const source = resolve(root, '.cache/performance-snapshot/webgpu-completion-20261021-baseline/dist');
const target = resolve(root, '.cache/webgpu-completion-20261021/validation/presentation-translucent');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(join(target, 'dist/assets'), { recursive: true });
const files = {};
for (const entry of await readdir(join(source, 'assets'), { withFileTypes: true })) {
  if (!entry.isFile()) throw new Error('Očekáván pouze soubor produkčního bundle.');
  const file = 'assets/' + entry.name;
  const bytes = await readFile(join(source, file));
  let output = bytes;
  if (entry.name.endsWith('.css')) {
    const text = bytes.toString('utf8');
    const marker = '.loading{z-index:20;background:#eff3e6;';
    if (text.split(marker).length !== 2) throw new Error('Drift přesného loading CSS markeru.');
    output = Buffer.from(text.replace(marker, '.loading{z-index:20;background:rgba(239,243,230,.96);'));
  }
  await writeFile(join(target, 'dist', file), output, { flag: 'wx' });
  files[file] = { before: sha(bytes), after: sha(output), changed: !bytes.equals(output) };
}
await copyFile(join(source, 'index.html'), join(target, 'dist/index.html'), constants.COPYFILE_EXCL);
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== 'assets')
    await symlink(join(source, entry.name), join(target, 'dist', entry.name), 'junction');
}
const index = await readFile(join(source, 'index.html'));
files['index.html'] = { before: sha(index), after: sha(index), changed: false };
if (Object.values(files).filter(file => file.changed).length !== 1)
  throw new Error('Experiment smí změnit právě jeden CSS bundle.');
const receipt = {
  schemaVersion: 1,
  purpose: 'Pouze diagnostické A/B neprůhledné loading vrstvy; bez změny scheduleru, timeoutů, rendereru, světel, readiness nebo shaderů.',
  sourceSnapshotId: 'bc38843693a9ccf591e500657d9e506d7d64e4a1788ccb4a6f9571eefa78a8bd',
  buildKind: 'postbuild-css-only-diagnostic',
  variant: 'loading-alpha-0.96',
  createdAtUTC: new Date().toISOString(),
  source: relative(root, source).replaceAll('\\', '/'),
  output: relative(root, target).replaceAll('\\', '/'),
  helperSha256: sha(await readFile(new URL(import.meta.url))),
  files,
  publicAssets: 'Read-only junctions to the exact unchanged baseline dist directories; no regeneration.',
};
await writeFile(join(target, 'identity.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: target, variant: receipt.variant, changed: Object.keys(files).filter(file => files[file].changed) }));
