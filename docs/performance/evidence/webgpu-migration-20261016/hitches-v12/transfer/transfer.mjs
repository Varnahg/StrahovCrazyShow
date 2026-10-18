import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),qa=resolve(root,'../inactive-light-defines-qa-20261018');
const hash=data=>createHash('sha256').update(data).digest('hex');
const manifestPath=resolve(qa,'manifest.json');assert.equal(hash(readFileSync(manifestPath)),'1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac');
const manifest=JSON.parse(readFileSync(manifestPath));const before={};
for(const entry of manifest.changedFiles){const path=resolve(wt,entry.path);if(entry.inputSha256){assert.equal(hash(readFileSync(path)),entry.inputSha256);before[entry.path]=entry.inputSha256;}else{assert.equal(existsSync(path),false);before[entry.path]=null;}const data=readFileSync(resolve(qa,'candidate',entry.path));assert.equal(hash(data),entry.sha256);writeFileSync(path,data);}
const history=resolve(wt,'tests/inactive-light-defines-history.test.ts');let text=readFileSync(history,'utf8');
function remove(pattern){assert.ok(text.includes(pattern),pattern);text=text.replace(pattern,'');}
remove("import {writeFileSync} from 'node:fs';\n");remove("import {createHash} from 'node:crypto';\n");remove("import {GetSupportedSimultaneousLights} from '@babylonjs/core/Materials/materialHelper.functions';\n");
remove("const sha=(text:string)=>createHash('sha256').update(text).digest('hex');\n");
text=text.replace(/^const limitations=.*\n/m,'// Actual main-pass CPU regression; NullEngine textures/PCF fallback do not prove GPU image parity.\n');
text=text.replace('rows:any[]=[],cleaned:any[]=[],subjects:any[]=[],','rows:any[]=[],subjects:any[]=[],');
remove('  const originalMethods: [any,any][]=[];\n');remove("  let stage='construction';\n");
text=text.replace('stage=label;sun.setEnabled(day);','sun.setEnabled(day);').replace('subMeshIdentityPreserved:true,','').replace(',sha:sha(effect.defines)','').replace('return {rows,cleaned,pass:camera.renderPassId,requestedShadowFilter:\'PCF\',actualShadowFilter:shadow.filter};','return {rows};').replace('for(const[m,original]of originalMethods)m.isReadyForSubMesh=original;','');
text=text.replace("const hemi=new HemisphericLight('hemi',Vector3.Up(),scene),sun=new DirectionalLight", "new HemisphericLight('hemi',Vector3.Up(),scene);\n  const sun=new DirectionalLight");
writeFileSync(history,text);
const helper=resolve(wt,'tests/inactive-light-defines-helper.test.ts');text=readFileSync(helper,'utf8');const qaChecks="assert.ok(core.includes('inactive-light-defines-qa-20261018'));assert.ok(!core.includes('dependencies-v5'));";assert.ok(text.includes(qaChecks));text=text.replace(qaChecks,'').replace('real tiny GLB loader resolves one physical QA core class identity','real tiny GLB loader resolves the same core class identity');writeFileSync(helper,text);
writeFileSync(resolve(root,'transfer.json'),JSON.stringify({qaManifestSha:'1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac',before,scope:manifest.changedFiles.map(e=>e.path)},null,2)+'\n');console.log('Transferred exact patch/lock and refactored only new regression tests.');
