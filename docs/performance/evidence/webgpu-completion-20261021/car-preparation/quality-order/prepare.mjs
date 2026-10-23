import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../../../..');
const cache = path.join(root, '.cache/webgpu-completion-car-preparation-20261023/quality-order');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(root, name));
const files = ['client/render-quality-preparation.ts', 'tests/render-quality-preparation.test.ts',
  'tests/game-quality-preparation.test.ts', 'tests/game-low-vehicle-preparation.test.ts', 'tests/game-authored-light-preparation.test.ts'];
const oldDirectory = 'docs/performance/evidence/webgpu-completion-20261021/car-preparation';
const old = JSON.parse(read(oldDirectory + '/owned-files.json'));
const historical = Object.fromEntries(old.files.filter(row => row.path.startsWith('docs/')).map(row => [row.path, row.sha256]));
historical[oldDirectory + '/owned-files.json'] = hash(read(oldDirectory + '/owned-files.json'));
const oldProof = JSON.parse(read(oldDirectory + '/verification.json'));
const protectedPaths = [...Object.keys(oldProof.after.protected), 'client/game.ts', 'client/light-preparation.ts',
  'tests/game-light-preparation.test.ts', 'tests/startup-preparation-loop.test.ts'];
const core = path.join(root, '.cache/performance-snapshot/webgpu-completion-20261023-candidate-9/node_modules/@babylonjs/core');
const rootCore = path.dirname(fileURLToPath(import.meta.resolve('@babylonjs/core/package.json')));
const nativeFiles = Object.keys(oldProof.after.freshNative);
const digests = (names, prefix = root) => Object.fromEntries(names.map(name => [name, hash(fs.readFileSync(path.join(prefix, name)))]));
if (fs.existsSync(path.join(cache, 'baseline.json'))) throw Error('Baseline already exists; never overwrite');
fs.mkdirSync(cache, { recursive: true });
for (const name of files) {
  const target = path.join(cache, 'before', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, read(name));
}
const baseline = { root, cache, files, protectedPaths, core, rootCore,
  original: digests(files), protected: digests(protectedPaths), historical,
  native: digests(nativeFiles, core), installed: digests(nativeFiles, rootCore) };
fs.writeFileSync(path.join(cache, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n');
const loader = `import { registerHooks } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const rootCore=${JSON.stringify(rootCore)}, fresh=${JSON.stringify(core)}, original=${JSON.stringify(pathToFileURL(rootCore + path.sep).href)}, output=${JSON.stringify(cache)};
const label=new URL(import.meta.url).searchParams.get('run');
if(!/^[a-z0-9-]{1,48}$/.test(label??''))throw Error('Invalid own proof label');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'), loaded=new Map();
registerHooks({load(url,context,next){if(url.startsWith(original)&&url.endsWith('.js')){
 const name=path.relative(rootCore,fileURLToPath(url)), bytes=fs.readFileSync(path.join(fresh,name));
 if(!loaded.has(name))loaded.set(name,hash(bytes));
 return {format:'module',source:bytes.toString(),shortCircuit:true};}return next(url,context);}});
process.on('exit',()=>{const before=Object.fromEntries([...loaded].sort()),after=Object.fromEntries(Object.keys(before).map(name=>[name,hash(fs.readFileSync(path.join(fresh,name)))]));
 fs.writeFileSync(path.join(output,'native-'+label+'-'+process.pid+'.json'),JSON.stringify({before,after,stable:JSON.stringify(before)===JSON.stringify(after)},null,2)+'\\n');});
`;
fs.writeFileSync(path.join(cache, 'native-loader.mjs'), loader);
console.log(JSON.stringify({ files: files.length, protected: protectedPaths.length, historical: Object.keys(historical).length, core, rootCore }));
