import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,symlinkSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),input=resolve(root,'../avatar-day-view-proof-20261018/probe.ts');
const bytes=readFileSync(input),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(bytes),'47ed4c49be5617edb76f34bc705aa7423af94636ae8729e8ef286b773ef8f900');
let code=bytes.toString('utf8');
const first=code.indexOf('  function fitFarOnly('),last=code.indexOf('  function projectionCoverage()',first);assert.ok(first>0&&last>first);
code=code.slice(0,first)+`  const actualFarScope = new AvatarPreparationFarPlane(camera);
  function fitFarOnly(saved:ReturnType<typeof cameraState>){
    actualFarScope.apply(game.avatars.values());
    return{mode:'far-only',far:camera.maxZ,originalFar:saved.maxZ,fov:saved.fov,originalFov:saved.fov,near:saved.minZ,position:saved.position.asArray(),originalTarget:saved.target.asArray(),derivation:'actual candidate AvatarPreparationFarPlane'};
  }
`+code.slice(last);
const before="if(mode==='far-only'){camera.maxZ=saved.maxZ;camera.getProjectionMatrix(true);}else restoreCamera(saved);";
assert.equal(code.split(before).length,2);code=code.replace(before,"if(mode==='far-only'){actualFarScope.restore();camera.getProjectionMatrix(true);}else restoreCamera(saved);");
code='import { AvatarPreparationFarPlane } from "./candidate/client/avatar-preparation-far-plane";\n'+code;
writeFileSync(resolve(root,'probe-avatar.ts'),code);
writeFileSync(resolve(root,'package.json'),'{"type":"module"}\n');
if(!existsSync(resolve(root,'node_modules')))symlinkSync(resolve(root,'../inactive-light-defines-qa-20261018/dependencies/node_modules'),resolve(root,'node_modules'),'junction');
writeFileSync(resolve(root,'probe-adaptation.json'),JSON.stringify({input,sourceSha256:hash(bytes),output:'probe-avatar.ts',outputSha256:hash(code),changes:['replace only far-only fit with actual candidate helper','restore actual helper scope in far-only finally','import helper; original projection/restore/Effect comparisons remain']},null,2)+'\n');
