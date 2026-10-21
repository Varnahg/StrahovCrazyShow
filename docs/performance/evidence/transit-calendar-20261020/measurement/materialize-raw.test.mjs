import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,copyFile,link,lstat,access,rm,mkdir,realpath} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {dirname,resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=dirname(fileURLToPath(import.meta.url));
const cache=resolve(source,'../../../../../.cache/performance-transit-measure-20261020');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('Raw extraction survives interrupted staging/publication and preserves unrelated existing files',async t=>{
 await mkdir(cache,{recursive:true});
 const fixture=await mkdtemp(join(cache,'materializer-check-'));
 t.after(async()=>{
  const actual=await realpath(fixture),suffix=relative(await realpath(cache),actual);
  assert.ok(suffix && !suffix.startsWith('..') && !isAbsolute(suffix) && !suffix.includes('/') && !suffix.includes('\\'));
  await rm(actual,{recursive:true});
 });
 for(const name of ['materialize-raw.mjs','raw-archives.json','external-acceptance.json','baseline.json.gz','candidate.json.gz'])
  await copyFile(join(source,name),join(fixture,name));
 const entries=JSON.parse(await readFile(join(source,'raw-archives.json'),'utf8')).files;
 const a=entries.find(e=>e.name==='baseline'),b=entries.find(e=>e.name==='candidate');
 const stage=name=>join(fixture,'.raw-stage-'+name.name+'-'+name.rawSha256.slice(0,12)+'-'+randomUUID()+'.tmp');
 const aStage=stage(a),orphan=stage(b),target=join(fixture,'baseline.json');
 await writeFile(aStage,gunzipSync(await readFile(join(fixture,'baseline.json.gz'))),{flag:'wx'});
 await link(aStage,target); // Simulates exit after exclusive publish, before unlink.
 await writeFile(orphan,'partial own staging bytes',{flag:'wx'}); // Exit before publish.
 const run=()=>spawnSync(process.execPath,[join(fixture,'materialize-raw.mjs')],{encoding:'utf8',windowsHide:true});
 await t.test('A complete linked publish recovers; abandoned partial staging does not block retry',async()=>{
  const result=run();assert.equal(result.status,0,result.stderr);
  await assert.rejects(access(aStage),{code:'ENOENT'});
  assert.equal(await readFile(orphan,'utf8'),'partial own staging bytes');
  for(const entry of entries){const file=join(fixture,entry.name+'.json');assert.equal((await lstat(file)).nlink,1);assert.equal(sha(await readFile(file)),entry.rawSha256);}
 });
 await t.test('Repeated extraction does not rewrite verified outputs',async()=>{
  const before=(await lstat(target,{bigint:true})).mtimeNs;
  const result=run();assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout).materialized,[]);
  assert.equal((await lstat(target,{bigint:true})).mtimeNs,before);
 });
 await t.test('A foreign alias or differing final file is preserved',async()=>{
  const alias=join(fixture,'user-retained-alias.json');await link(target,alias);
  let result=run();assert.notEqual(result.status,0);assert.equal((await lstat(alias)).nlink,2);
  await rm(alias);
  await writeFile(target,'existing user data');
  result=run();assert.notEqual(result.status,0);assert.equal(await readFile(target,'utf8'),'existing user data');
 });
});
