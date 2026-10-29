import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const base='.cache/webgpu-completion-20261021/startup-stage-routines',cache=base+'/helper/v19',own=base+'/review-fix-v19',pub='docs/performance/evidence/webgpu-completion-20261021/startup-stage-routines/review-fix-v19';
const {helperIdentity,sha256}=await import(pathToFileURL(resolve(cache,'common.mjs')));
const before=JSON.parse(await readFile(pub+'/before.json')),after={},drift=[];
for(const[p,e]of Object.entries(before.guard)){const b=await readFile(p);after[p]={sha256:sha256(b),bytes:b.length};if(after[p].sha256!==e.sha256||b.length!==e.bytes)drift.push(p);}
const donor=await helperIdentity(before.donor),helper=await helperIdentity(cache);assert.equal(donor.sha256,before.donorIdentity.sha256);assert.equal(Object.keys(helper.files).length,38);
const changed=Object.keys(helper.files).filter(f=>helper.files[f]!==donor.files[f]);assert.deepEqual([...changed].sort(),['qa-overlay.mjs','receipt.mjs','startup-stage-routines.mjs','startup-stage-routines.test.mjs'].sort());
const syntax=[],diff=[];for(const file of changed){const check=spawnSync(process.execPath,['--check',resolve(cache,file)],{encoding:'utf8',windowsHide:true});syntax.push({file,status:check.status,stderr:check.stderr});assert.equal(check.status,0,file);
  const result=spawnSync('git',['diff','--no-index','--',join(before.donor,file),join(cache,file)],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});assert.equal(result.status,1);diff.push(result.stdout);}
const logs={};for(const file of(await readdir(own)).filter(f=>f.endsWith('.tap'))){const b=await readFile(own+'/'+file),s=b.toString();logs[file]={sha256:sha256(b),bytes:b.length,pass:Number(s.match(/^# pass (\d+)$/m)?.[1]),fail:Number(s.match(/^# fail (\d+)$/m)?.[1]),skip:Number(s.match(/^# skipped (\d+)$/m)?.[1]),durationMs:Number(s.match(/^# duration_ms ([\d.]+)$/m)?.[1])};}
assert.equal(logs['red.tap'].pass,17);assert.equal(logs['red.tap'].fail,4);assert.equal(logs['green-final.tap'].pass,21);assert.equal(logs['green-final.tap'].fail,0);assert.equal(logs['green-final.tap'].skip,0);
const primaryReads={};for(const p of['client/game.ts','client/light-preparation.ts','node_modules/@babylonjs/core/Misc/observable.pure.js','node_modules/@babylonjs/core/Rendering/objectRenderer.js']){const b=await readFile(p);primaryReads[p]={sha256:sha256(b),bytes:b.length};}
const red=JSON.parse(await readFile(own+'/red-inputs.json'));for(const f of changed){const b=await readFile(own+'/red-inputs/'+f);assert.equal(sha256(b),red.files[f]);}
await writeFile(pub+'/helper.patch',diff.join('\n'));await writeFile(pub+'/verification.json',JSON.stringify({atUTC:new Date().toISOString(),scope:'Jen čtyři review opravy, dotčený cílený test; žádný širší corpus/build/GPU',helper,donor,changed,unchanged:38-changed.length,syntax,logs,protectedAfter:after,drift,primaryReads,redInputs:red,
command:'node --import tsx --test --test-concurrency=1 --test-reporter=tap '+cache+'/startup-stage-routines.test.mjs',
limits:['RED test má původní okamžitý orphan assertion; GREEN používá active observer count i fyzické native deferred odstranění.','Po prvním GREEN20/21 byla jen doplněna camera/trafficInstant v nové pre-owner fixture; runtime se tím neměnil.','Skutečný Game options literal a injekce se vykonají; callback/host/constructor seams nejsou celý produkční svět ani WGSL/GPU důkaz.','Širší ověření provede root; pouze jeden dotčený testový soubor byl spouštěn.']},null,2)+'\n');
assert.deepEqual(drift,[]);console.log(JSON.stringify({helper:helper.sha256,changed,unchanged:34,protected:Object.keys(after).length,drift,syntax,final:logs['green-final.tap']}));
