import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(root,'../webgpu-hitch-validation-20261017/authored-native-v3'),out=path.join(root,'case'),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'source-manifest.json'),'utf8'));assert.equal(manifest.snapshotId,'777a1bbb3552b800947cf62adcf6db141c72d3d72600fbfcbeeca42d287e05f6');assert.equal(fs.existsSync(out),false);fs.mkdirSync(out);
for(const name of ['client','shared','package.json','tsconfig.json'])fs.cpSync(path.join(base,name),path.join(out,name),{recursive:true,force:false,errorOnExist:true});
fs.symlinkSync(path.join(base,'node_modules'),path.join(out,'node_modules'),'junction');fs.mkdirSync(path.join(out,'tests'));
const source=fs.readFileSync(path.join(base,'tests/game-authored-light-preparation.test.ts'),'utf8');let test=source;
const replace=(from,to)=>{assert.equal(test.split(from).length,2,from);test=test.replace(from,to);};
replace('import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";','import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";\nimport {ImageProcessingConfiguration} from "@babylonjs/core/Materials/imageProcessingConfiguration";');
const old='  const cinematic=new CinematicAtmosphere(scene,camera,sun),stable=new StableLightState(scene),beam=new VehicleLighting(scene),torch=new PlayerFlashlight(scene);\n  const pos=Object.freeze({x:(f.low.x+f.high.x)/2,y:(f.low.y+f.high.y)/2-.6,z:f.low.z-20});';
replace(old,`  const pos=Object.freeze({x:(f.low.x+f.high.x)/2,y:(f.low.y+f.high.y)/2-.6,z:f.low.z-20});
  // Native assets are actually drawn before Cinematic exists. Preserve that
  // history, rather than starting every material with disabled processing.
  f.architecture.update(pos,initialQuality);f.outdoor.update(pos.x,pos.z,initialQuality);
  const originals=f.names.map(name=>f.target.find(m=>m.material?.name===name&&m.isEnabled())!);
  assert.ok(originals.every(Boolean));
  const cold=originals.map(mesh=>{const clone=(mesh as Mesh).clone("cold inactive "+mesh.name,null,true)!;clone.setEnabled(false);assert.equal(clone.material,mesh.material);assert.equal(clone.geometry,(mesh as Mesh).geometry);return clone;});
  const preloadDraws=new Set<number>();for(const mesh of originals){assert.ok(mesh instanceof Mesh);mesh.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId===camera.renderPassId)preloadDraws.add(mesh.uniqueId);});}
  const preloadDeadline=performance.now()+4000;
  do{budget.prepareFrame();preloadDraws.clear();engine.beginFrame();scene.render();engine.endFrame();await turn();}
  while((!originals.every(mesh=>preloadDraws.has(mesh.uniqueId))||!arePreparationEffectsReady(engine))&&performance.now()<preloadDeadline);
  assert.ok(originals.every(mesh=>preloadDraws.has(mesh.uniqueId)));assert.ok(arePreparationEffectsReady(engine));
  assert.equal(scene.imageProcessingConfiguration.isEnabled,true);
  row.nativePreload=originals.map(mesh=>{const effect=mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)!.effect!;assert.match(effect.defines,/^#define VIGNETTEBLENDMODEMULTIPLY$/m);return{name:mesh.material?.name,effectId:effect.uniqueId,defines:effect.defines};});
  const cinematic=new CinematicAtmosphere(scene,camera,sun),stable=new StableLightState(scene),beam=new VehicleLighting(scene),torch=new PlayerFlashlight(scene);`);
replace('  const vehicleReferences=[stageReferences.get("low/vehicle-0")!,stageReferences.get("low/vehicle-1")!];','  const vehicleReferences=[stageReferences.get("low/vehicle-0")!,stageReferences.get("low/vehicle-1")!];\n  for(const mesh of cold){assert.equal(mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)?.effect,undefined);assert.equal(mesh.subMeshes[0].materialDefines,undefined);}\n  for(const mesh of f.target)mesh.setEnabled(false);\n  f.target.splice(0,f.target.length,...cold);\n  for(const mesh of cold){mesh.setEnabled(true);mesh.alwaysSelectAsActiveMesh=true;mesh.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId===camera.renderPassId)drawn.add(mesh.uniqueId);});}');
replace('    assert.equal(programs-before,0,"two vehicle stages must prevent every target replay compilation");','    row.expected=Array.from(vehicleReferences[count],([name,value])=>({name,effectId:value.effect.uniqueId,defines:value.defines}));\n    assert.equal(programs-before,0,"fresh inactive receivers must reuse the native preloaded then disabled variants");');
fs.writeFileSync(path.join(out,'tests/history.test.ts'),test,{flag:'wx'});
fs.writeFileSync(path.join(root,'history-original.test.ts.txt'),source,{flag:'wx'});
const core=path.join(base,'node_modules/@babylonjs/core');
const names=['Materials/imageProcessingConfiguration.pure.js','Materials/imageProcessingConfiguration.defines.js','Materials/imageProcessingConfiguration.functions.js','Shaders/ShadersInclude/imageProcessingFunctions.js','ShadersWGSL/ShadersInclude/imageProcessingFunctions.js'];
fs.writeFileSync(path.join(root,'inputs.json'),JSON.stringify({base,baseSnapshot:manifest.snapshotId,historySourceSha256:hash(source),core:fs.realpathSync(core),pinned:names.map(name=>({path:name,sha256:hash(fs.readFileSync(path.join(core,name)))}))},null,2)+'\n',{flag:'wx'});
console.log(out);
