import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..');
const require=createRequire(resolve(wt,'.cache/webgpu-migration/dependencies-v5/package.json')),ts=require('typescript');
const old=readFileSync(resolve(root,'../light-define-history-proof-20261018/probe.ts'),'utf8');
const ast=ts.createSourceFile('probe.ts',old,ts.ScriptTarget.Latest,true);let removal;
function visit(node){if(ts.isIfStatement(node)&&node.expression.getText(ast)==='cleanInactive')removal=[node.getStart(ast),node.end];ts.forEachChild(node,visit)}visit(ast);assert.ok(removal);
let code=(old.slice(0,removal[0])+old.slice(removal[1])).split('const startedAt=')[0];
code=code.replaceAll('../../webgpu-hitch-validation-20261017/day-zero-v3/client/','../client/').replace('async function run(cleanInactive:boolean)','async function run(falloff:number, globalMode: "physical" | "gltf" | "standard")').replaceAll('p.falloffType=Light.FALLOFF_STANDARD','p.falloffType=falloff').replace('b6.falloffType=Light.FALLOFF_STANDARD','b6.falloffType=falloff').replace('return {cleanInactive,rows,cleaned,','return {rows,cleaned,').replace('material.maxSimultaneousLights=4;','material.maxSimultaneousLights=4; if(kind==="PBR"){material.usePhysicalLightFalloff=globalMode==="physical";material.useGLTFLightFalloff=globalMode==="gltf";}');
code='import test from "node:test";\n'+code+`
for(const [mode,falloff]of [["standard",Light.FALLOFF_STANDARD],["physical",Light.FALLOFF_PHYSICAL],["gltf",Light.FALLOFF_GLTF]] as const)
for(const globalMode of ["physical","gltf","standard"] as const)
test("native helper history reuse for "+mode+" light / "+globalMode+" PBR mode",async()=>{
 const result=await run(falloff,globalMode);
 for(const subject of [...new Set(result.rows.map(r=>r.subject))]){
  const first=result.rows.find(r=>r.subject===subject&&r.stage==="day0OFF-first")!,last=result.rows.find(r=>r.subject===subject&&r.stage==="runtimeDayOFF")!;
  assert.equal(first.effect.defines,last.effect.defines);assert.equal(first.effect.id,last.effect.id);
  assert.deepEqual(first.ordered,last.ordered);assert.deepEqual(first.texture,last.texture);
  for(const key of ["materialId","meshId","subMeshId","pass","instances","receiveShadows","cap","alpha"] as const)assert.equal(first[key],last[key]);
  for(const row of result.rows.filter(r=>r.subject===subject)){
   assert.equal(row.effect.defines.includes("#define INSTANCES\\n"),row.instances);
   assert.equal(row.effect.defines.includes("#define ALPHATEST\\n"),row.instances);
   if(subject.startsWith("PBR")){
    assert.equal(row.flags.USEPHYSICALLIGHTFALLOFF,undefined); // Global flags are checked from the complete Effect string.
    assert.equal(row.effect.defines.includes("#define USEPHYSICALLIGHTFALLOFF\\n"),globalMode==="physical");
    assert.equal(row.effect.defines.includes("#define USEGLTFLIGHTFALLOFF\\n"),globalMode==="gltf");
   }
   for(let i=row.ordered.length;i<row.cap;i++)for(const prefix of falloffs)assert.equal(!!row.flags[prefix+i],false);
  }
 }
});
`;
mkdirSync(resolve(root,'candidate/tests'),{recursive:true});writeFileSync(resolve(root,'candidate/tests/inactive-light-defines-history.test.ts'),code);
