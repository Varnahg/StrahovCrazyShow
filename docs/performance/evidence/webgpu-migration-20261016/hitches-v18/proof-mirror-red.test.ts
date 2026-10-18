import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {setImmediate} from 'node:timers/promises';
import ts from 'typescript';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Vector3,Matrix} from '@babylonjs/core/Maths/math.vector';
import {Color4} from '@babylonjs/core/Maths/math.color';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {MaterialDefines} from '@babylonjs/core/Materials/materialDefines';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage';
import {WebGPUShaderProcessorWGSL} from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL';
import {WebGPUShaderProcessingContext} from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext';
import {PointLight} from '@babylonjs/core/Lights/pointLight';
import {SpotLight} from '@babylonjs/core/Lights/spotLight';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {Light} from '@babylonjs/core/Lights/light';
import {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer';
import {StableLightState} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/stable-light-state';
import {GltfLightBudget} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/gltf-light-budget';
import {CampusSurfaceArtPlugin,campusSurfaceArt} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/cinematic-art';
import {PhotogrammetryNightPlugin,PHOTOGRAMMETRY_WINDOW_FACADES} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/photogrammetry-lighting';
import {TreeWindPlugin} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/tree-wind';
import {installCarPaintInstances,CAR_PAINT_COLOR_BUFFER} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/car-paint-instances';
import {PhotoGrassWind,createPhotoGrassWindState} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/photo-grass-wind';
import {GrassWindPlugin} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/grass-material';
import {StudentHairTintPlugin} from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/avatar-hair';
import {canonicalResult,MAX_CHARS,MAX_DEFINES,withCanonicalResult} from './canonical-result';

const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const base=new URL('../../webgpu-hitch-validation-20261017/inactive-light-v4/',import.meta.url);
const inputs:Record<string,string>={};
function read(file:string){const bytes=readFileSync(new URL(file,base));inputs[file]=sha(bytes);return bytes;}
const manifest=JSON.parse(read('source-manifest.json').toString());
assert.equal(manifest.snapshotId,'bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0');
const engineSource=read('tests/wgsl-surface-materials.test.ts').toString();
assert.equal(sha(engineSource),manifest.files['tests/wgsl-surface-materials.test.ts']);
const ast=ts.createSourceFile('wgsl-surface-materials.test.ts',engineSource,ts.ScriptTarget.Latest,true);
const declaration=ast.statements.find((n):n is ts.ClassDeclaration=>ts.isClassDeclaration(n)&&n.name?.text==='NativeProcessingEngine')!;
assert.ok(declaration);
const code=ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const NativeProcessingEngine:any=new Script(`(function(NullEngine,WebGPUShaderProcessorWGSL,WebGPUShaderProcessingContext){${code};return NativeProcessingEngine})`).runInThisContext()(NullEngine,WebGPUShaderProcessorWGSL,WebGPUShaderProcessingContext);
for(const file of ['client/cinematic-art.ts','client/photogrammetry-lighting.ts','client/tree-wind.ts','client/gltf-light-budget.ts','client/stable-light-state.ts','client/car-paint-instances.ts','client/photo-grass-wind.ts','client/grass-material.ts','client/avatar-hair.ts','tests/wgsl-avatar-car.test.ts','tests/wgsl-vegetation.test.ts'])assert.equal(sha(read(file)),manifest.files[file]);
for(const file of ['Materials/materialDefines.js','Materials/materialHelper.functions.js','Materials/PBR/pbrBaseMaterial.pure.js','Materials/standardMaterial.pure.js','Materials/materialPluginManager.pure.js','Engines/Processors/shaderProcessor.js','Engines/WebGPU/webgpuShaderProcessorsWGSL.pure.js','Engines/WebGPU/webgpuShaderProcessingContext.js','Engines/webgpuEngine.pure.js','Engines/thinEngine.pure.js']){
  const relative=`node_modules/@babylonjs/core/${file}`,url=new URL(relative,import.meta.url);
  inputs[`dependency/${file}`]=sha(readFileSync(url));assert.equal(realpathSync(url),realpathSync(new URL(relative,base)));
}
assert.equal(inputs['dependency/Materials/materialHelper.functions.js'],'a6d21d15070f52d3a94ec7fd40eb22356a76a723165ce05afa67dbeded0e88ac');
const oldManifest=new URL('../b6-exit-variant-proof-20261018/manifest.json',import.meta.url);
inputs['accepted-b6-exit/manifest.json']=sha(readFileSync(oldManifest));assert.equal(inputs['accepted-b6-exit/manifest.json'],'97fd7099d849864d67429a9cc082276458b594dadbed34ace91815c469bdd17f');
const oldReport=JSON.parse(readFileSync(new URL('../b6-exit-variant-proof-20261018/report.json',import.meta.url),'utf8'));
const report:any={snapshot:manifest.snapshotId,startedAt:new Date().toISOString(),inputs,guard:{maxChars:MAX_CHARS,maxDefines:MAX_DEFINES,flatBlock:true},scenarios:[],microbench:null};
const originalDescriptor=Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString')!;
const copy=(object:any)=>JSON.parse(JSON.stringify(object));
const values=(defines:any)=>Object.fromEntries(Object.entries(defines).filter(([name])=>!name.startsWith('_')).sort(([a],[b])=>a.localeCompare(b)));
class CapturingEngine extends NativeProcessingEngine {
  readonly prefixes=new Map<any,string[]>();
  readonly hookCalls:any[]=[];
  orderSensitive=false;
  // Same NullEngine GPU-only teardown boundary as wgsl-avatar-car.test.ts.
  // Actual instance selection, buffers, binding and draw dispatch stay native.
  unbindInstanceAttributes() {}
  override _getShaderProcessor(language:ShaderLanguage){
    const processor:any=super._getShaderProcessor(language),original=processor._convertDefinesToConst;
    const prefixes=this.prefixes;
    processor._convertDefinesToConst=function(...args:any[]){const result=Reflect.apply(original,this,args);const context=this._webgpuProcessingContext;const list=prefixes.get(context)??[];list.push(result);prefixes.set(context,list);return result;};
    if(this.orderSensitive)processor.preProcessor=(source:string,defines:string[])=>{
      const slot=defines.indexOf('#define LIGHT3'),count=defines.findIndex(line=>line.startsWith('#define LIGHTCOUNT '));
      this.hookCalls.push({slot,count,value:slot<count?1:2});
      return `const syntheticOrderWitness = ${slot<count?1:2};\n`+source;
    };
    return processor;
  }
}
function withoutGeneratedPrefix(source:string,prefix:string){
  const first=source.indexOf(prefix);assert.ok(first>=0,'actual generated block present');assert.equal(source.indexOf(prefix,first+prefix.length),-1,'unique provenance block');
  return source.slice(0,first)+source.slice(first+prefix.length);
}
const kinds=['pbr','standard','surface','photo','wind','car','car-fallback','photo-grass','photo-grass-thin','grass-thin','hair'] as const;
type Kind=typeof kinds[number];
async function scenario(kind:Kind,canonical:boolean,orderSensitive=false){
  const engine:any=new CapturingEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  engine.orderSensitive=orderSensitive;
  const instanced=kind==='car'||kind.endsWith('-thin');
  if(instanced||kind==='car-fallback')engine.getCaps().instancedArrays=true;
  const camera=new FreeCamera('same camera',new Vector3(0,0,-5),scene);camera.setTarget(Vector3.Zero());scene.activeCamera=camera;
  const point=new PointLight('B6 point',new Vector3(2,2,2),scene);point.falloffType=Light.FALLOFF_STANDARD;point.setEnabled(false);
  const sun=new DirectionalLight('sun',new Vector3(0,-1,0),scene),hemi=new HemisphericLight('sky',Vector3.Up(),scene);
  const torch=new SpotLight('torch',new Vector3(0,1,-3),new Vector3(0,-.1,1),.72,64,scene);torch.falloffType=Light.FALLOFF_STANDARD;torch.renderPriority=10;
  const budget=new GltfLightBudget(scene),stable=new StableLightState(scene),observers:any[]=[];
  const result:any={kind,canonical,orderSensitive,states:[],cleanup:null};report.scenarios.push(result);
  const plugins:any[]=[];
  try {
    const texture=new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB5kAAAAASUVORK5CYII=',scene);texture.hasAlpha=kind==='photo'||kind==='hair';
    const materials=[0,1].map(i=>{
      const material:any=kind==='standard'?new StandardMaterial('same Standard '+i,scene):new PBRMaterial('same PBR '+i,scene);
      if(kind==='standard')material.diffuseTexture=texture;
      else{material.metallic=0;material.roughness=.6;material.alphaCutOff=.5;material.albedoTexture=texture;}
      if(kind==='surface')plugins.push(new CampusSurfaceArtPlugin(material,campusSurfaceArt('asphalt')!));
      if(kind==='photo'){material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;plugins.push(new PhotogrammetryNightPlugin(material,[PHOTOGRAMMETRY_WINDOW_FACADES[0]],{night:1,activity:.6,disposed:false}));}
      if(kind==='wind')plugins.push(new TreeWindPlugin(material,{time:0,x:1,z:0}));
      if(kind.startsWith('photo-grass'))plugins.push(new PhotoGrassWind(material,createPhotoGrassWindState()));
      if(kind==='grass-thin')plugins.push(new GrassWindPlugin(material,{time:0,windX:1,windZ:0,playerX:0,playerY:0,playerZ:0,range:12}));
      if(kind==='hair'){material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;plugins.push(new StudentHairTintPlugin(material));}
      assert.equal(material.shaderLanguage,ShaderLanguage.WGSL);return material;
    });
    const meshes=[0,1].map(i=>{const mesh=MeshBuilder.CreateBox('same geometry '+i,{},scene);mesh.material=materials[i];mesh.receiveShadows=false;mesh.setEnabled(i===0);return mesh;});
    let activeTargets:any[]=meshes;
    if(kind.startsWith('car')){
      installCarPaintInstances(meshes);plugins.push(...materials.map(m=>m.pluginManager.getPlugin('CarPaintFallback')));
      activeTargets=meshes.map((mesh,i)=>{mesh.setEnabled(true);mesh.isVisible=false;const instance=mesh.createInstance('actual paint instance '+i);instance.instancedBuffers[CAR_PAINT_COLOR_BUFFER]=new Color4(.2,.3,.4,1);if(kind==='car-fallback')instance.scaling.x=-1;instance.setEnabled(i===0);return instance;});
    }
    if(kind.endsWith('-thin'))for(const mesh of meshes){mesh.thinInstanceSetBuffer('matrix',new Float32Array(Matrix.Identity().asArray()),16,true);if(kind==='photo-grass-thin')mesh.thinInstanceSetBuffer('photoGrassFade',new Float32Array([0,1,0,0]),4,true);}
    assert.deepEqual(meshes[0].getVerticesDataKinds(),meshes[1].getVerticesDataKinds());
    for(const kind of meshes[0].getVerticesDataKinds())assert.deepEqual(meshes[0].getVertexBuffer(kind)?.getData(),meshes[1].getVertexBuffer(kind)?.getData());
    let draws=0;
    for(const mesh of meshes)observers.push([mesh.onAfterRenderObservable,mesh.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId===camera.renderPassId)draws++})]);
    const drawSubmesh=(index:number)=>(kind==='car-fallback'?activeTargets[index]:meshes[index]).subMeshes[0];
    const sample=(label:string,index:number)=>{
      const wrapper:any=drawSubmesh(index)._getDrawWrapper(camera.renderPassId),effect:any=wrapper.effect,context=effect._processingContext;
      const prefixes=engine.prefixes.get(context);assert.equal(prefixes.length,2);
      const vertex=effect.vertexSourceCode,fragment=effect.fragmentSourceCode;
      const metadata=copy(context);assert.equal(metadata.shaderLanguage,ShaderLanguage.WGSL);
      const original=Reflect.apply(originalDescriptor.value,wrapper.defines,[]);
      const row={label,index,draws,language:materials[index].shaderLanguage,cap:materials[index].maxSimultaneousLights,lights:meshes[index].lightSources.map(l=>({name:l.name,type:l.getTypeID(),falloff:l.falloffType})),activeTarget:activeTargets[index].name,activeTargetLights:activeTargets[index].lightSources.map((l:any)=>l.name),lightsDirty:wrapper.defines._areLightsDirty,effect:effect.uniqueId,key:effect._key,defines:effect.defines,original,values:values(wrapper.defines),keys:wrapper.defines._keys.slice(),vertex,fragment,prefixes:prefixes.slice(),body:{vertex:withoutGeneratedPrefix(vertex,prefixes[0]),fragment:withoutGeneratedPrefix(fragment,prefixes[1])},metadata};
      result.states.push(row);return row;
    };
    const render=async(label:string,index:number)=>{
      for(let attempt=0;attempt<16;attempt++){
        draws=0;budget.prepareFrame();stable.update();scene.render();await setImmediate();
        const wrapper:any=drawSubmesh(index)._getDrawWrapper(camera.renderPassId),effect=wrapper?.effect;
        const expectedCount=materials[index].disableLighting?0:Math.min(materials[index].maxSimultaneousLights,meshes[index].lightSources.length);
        // A drawn ready hot-swap fallback is not the requested new variant.
        if(draws&&effect?.isReady()&&wrapper.defines?.LIGHTCOUNT===expectedCount&&Object.values(engine._compiledEffects).every((e:any)=>e.isReady())){
          assert.equal(effect.isDisposed,false);return sample(label,index);
        }
      }
      result.unresolved={label,attemptedFrames:16,last:sample(label+' UNRESOLVED',index)};
      throw Error('Actual draw did not settle: '+kind+'/'+label);
    };
    await render('A three lights',0);point.setEnabled(true);const a=await render('A four after three',0);
    activeTargets[0].setEnabled(false);activeTargets[1].setEnabled(true);const b=await render('B fresh four',1);
    assert.deepEqual(a.values,b.values);assert.deepEqual(a.lights,b.lights);assert.equal(a.cap,4);assert.equal(b.cap,4);
    assert.notEqual(a.original,b.original);assert.equal(canonicalResult(a.original),canonicalResult(b.original));
    if(canonical){assert.equal(a.effect,b.effect);assert.equal(a.key,b.key);assert.equal(a.defines,b.defines)}
    else{assert.notEqual(a.effect,b.effect);assert.notEqual(a.key,b.key);assert.notEqual(a.defines,b.defines)}
    assert.deepEqual(a.metadata,b.metadata);
    if(orderSensitive&&!canonical)assert.notDeepEqual(a.body,b.body,'unsupported custom preProcessor observes define order');
    else assert.deepEqual(a.body,b.body);
    const canonicalFunction=a.defines===canonicalResult(a.original);assert.equal(canonicalFunction,canonical);
    if(kind!=='standard'){assert.equal(a.values.NUM_SAMPLES,'0');assert.equal(a.values.ALPHATESTVALUE,'0.5')}
    assert.equal(a.values.INSTANCES,instanced);
    if(kind==='car'){assert.equal(a.values.INSTANCESCOLOR,true);assert.ok(a.metadata.orderedAttributes.includes('instanceColor'));assert.match(a.vertex,/instanceColor/)}
    if(kind==='car-fallback'){assert.equal(a.values.INSTANCESCOLOR,false);assert.match(a.fragment,/surfaceAlbedo \*= uniforms\.carPaintFallback/)}
    if(kind.endsWith('-thin'))assert.equal(a.values.THIN_INSTANCES,true);
    if(kind==='photo-grass-thin'){assert.ok(a.metadata.orderedAttributes.includes('photoGrassFade'));assert.match(a.vertex,/vertexInputs\.photoGrassFade/)}
    if(kind==='photo-grass'){assert.ok(!a.metadata.orderedAttributes.includes('photoGrassFade'));assert.doesNotMatch(a.vertex,/vertexInputs\.photoGrassFade/)}
    if(kind==='hair')assert.match(a.fragment,/studentHairSource/);
    const before=Object.keys(engine._compiledEffects).length;await render('B repeat four',1);assert.equal(Object.keys(engine._compiledEffects).length,before);
    if(kind==='standard')materials[1].disableLighting=true;else materials[1].alphaCutOff=.25;
    const changed=await render('B genuine value change',1);assert.notEqual(changed.effect,b.effect);assert.notEqual(changed.key,b.key);
    if(kind==='standard')assert.equal(changed.values.LIGHTCOUNT,0);else assert.equal(changed.values.ALPHATESTVALUE,'0.25');
    if(plugins.length){
      const buffer=new UniformBuffer(engine),ubo=plugins[0].getUniforms(ShaderLanguage.WGSL).ubo??[];
      try{for(const uniform of ubo)buffer.addUniform(uniform.name,uniform.size);if(ubo.length){buffer.create();plugins[0].bindForSubMesh(buffer,scene,engine,drawSubmesh(0));plugins[0].hardBindForSubMesh(buffer,scene,engine,drawSubmesh(0));result.pluginUniforms=Array.from(buffer.getData())}else result.pluginUniforms=[];}finally{buffer.dispose()}
    }
    result.programs=engine.sources.length;result.effectCount=Object.keys(engine._compiledEffects).length;result.layoutEqual=true;result.bodyExact=!orderSensitive||canonical;
  } finally {
    for(const [observable,observer]of observers)observable.remove(observer);observers.length=0;stable.dispose();budget.dispose();scene.dispose();
    const effects:any[]=Object.values(engine._compiledEffects);for(const effect of effects)effect.dispose(true);engine.dispose();await setImmediate();
    result.hookCalls=engine.hookCalls.slice();
    result.cleanup={scene:scene.isDisposed,engine:engine.isDisposed,effects:effects.every(e=>e.isDisposed),observers:observers.length};assert.deepEqual(result.cleanup,{scene:true,engine:true,effects:true,observers:0});engine.prefixes.clear();engine.sources.length=0;engine.hookCalls.length=0;
  }
  return result;
}

test('guard accepts exact literal blocks, preserves spelling, bounds, idempotence and value distinctions',()=>{
  const text='#define Z\n#define NUM_SAMPLES 0\n#define ALPHATESTVALUE 0.5\n#define INDEX -1\n#define EXP 1.25e+2\n';
  const canonical=canonicalResult(text);assert.notEqual(canonical,text);assert.equal(canonicalResult(canonical),canonical);assert.deepEqual(canonical.split('\n').sort(),text.split('\n').sort());assert.notEqual(canonicalResult(text.replace('0.5','0.4')),canonical);
  assert.equal(canonicalResult(''),'');
  const atLimit=Array.from({length:MAX_DEFINES},(_,i)=>`#define M${MAX_DEFINES-i}\n`).join('');assert.notEqual(canonicalResult(atLimit),atLimit);const over=atLimit+'#define EXTRA\n';assert.equal(canonicalResult(over),over);
  const huge='#define Z\n#define '+ 'A'.repeat(MAX_CHARS)+'\n';assert.equal(canonicalResult(huge),huge);
});
test('unknown syntax and reserved macros fall back atomically with exact bytes',()=>{
  const invalid=['#define A 1+2\n','#define A B\n','#define A 0x10\n','#define A 1u\n','#define A 01\n','#define A Infinity\n','#define A NaN\n','#define A 1e999\n','#define A(x) x\n','#define A 1 // comment\n','#define A /*x*/1\n','#define A\r\n','#define A\u2028#define B\n','#define A\u2028\n','#define A\u2029\n','#define A\u0085\n','#define A\u000c\n','#define Ä 1\n','#define A 1\\\n','#define A\n#define A\n','#if A\n#define B\n#endif\n','#undef A\n','#define __LINE__ 1\n','#define GL_TEST 1\n','#define a__b\n','#define constructor 1\n','#define WEBGPU 1\n','#define defined 1\n','#define A 1\t\n','#define A\n\n','#define A'];
  for(const bad of invalid){const input='#define Z\n'+bad;assert.equal(canonicalResult(input),input,JSON.stringify(bad))}
});
test('wrapper preserves receiver/arguments, getter read order, throw, later values and original descriptor',async()=>{
  const reads:string[]=[];const defines:any=new MaterialDefines();let current:any='0.5';
  Object.defineProperty(defines,'Z',{enumerable:true,get(){reads.push('Z');return true}});Object.defineProperty(defines,'A',{enumerable:true,get(){reads.push('A');if(current==='throw')throw Error('getter sentinel');return current}});defines.rebuild();
  const keys=defines._keys.slice();const before=defines.toString();const order=reads.splice(0);
  await withCanonicalResult(MaterialDefines.prototype,async()=>{assert.equal(defines.toString(),canonicalResult(before));assert.deepEqual(reads.splice(0),order);assert.deepEqual(defines._keys,keys);current='expression(1)';assert.equal(defines.toString(),Reflect.apply(originalDescriptor.value,defines,[]));reads.length=0;current='throw';assert.throws(()=>defines.toString(),/getter sentinel/);assert.deepEqual(reads,order);});
  assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString'),originalDescriptor);
  const prototype={toString(this:any,...args:any[]){assert.equal(this.marker,1);assert.deepEqual(args,[2,3]);return '#define Z\n#define A\n'}};
  await assert.rejects(withCanonicalResult(prototype,async()=>{assert.equal(prototype.toString.call({marker:1},2,3),'#define A\n#define Z\n');throw Error('callback sentinel')}),/callback sentinel/);
  assert.equal(prototype.toString.call({marker:1},2,3),'#define Z\n#define A\n');
  // A completed flat block cannot reveal whether its two lines came from one property.
  const multiline:any=new MaterialDefines();multiline.Z='1\n#define A 2';multiline.rebuild();assert.equal(canonicalResult(multiline.toString()),'#define A 2\n#define Z 1\n');
});
for(const kind of kinds)test('same-engine '+kind+' native WGSL baseline and bounded counterfactual',async()=>{
  const baseline=await scenario(kind,false);
  const candidate=await withCanonicalResult(MaterialDefines.prototype,()=>scenario(kind,true));
  assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString'),originalDescriptor);
  for(const index of [1,2]){assert.deepEqual(candidate.states[index].metadata,baseline.states[index].metadata);assert.deepEqual(candidate.states[index].body,baseline.states[index].body);assert.deepEqual(candidate.states[index].values,baseline.states[index].values);for(const stage of [0,1])assert.deepEqual(candidate.states[index].prefixes[stage].split('\n').sort(),baseline.states[index].prefixes[stage].split('\n').sort());}
  assert.deepEqual(candidate.pluginUniforms,baseline.pluginUniforms);assert.equal(candidate.programs,baseline.programs-1);
});
test('syntactically safe literals cannot guarantee arbitrary custom preProcessor equivalence',async()=>{
  const baseline=await scenario('pbr',false,true),candidate=await withCanonicalResult(MaterialDefines.prototype,()=>scenario('pbr',true,true));
  assert.match(baseline.states[1].body.vertex,/const syntheticOrderWitness = 2;/);
  assert.match(candidate.states[1].body.vertex,/const syntheticOrderWitness = 1;/);
  assert.notDeepEqual(baseline.states[1].body,candidate.states[1].body);
  report.customHookCounterexample='Actual pinned preProcessor sees define array order and emits a different constant. Flat syntax guard alone cannot support arbitrary extensions.';
});
test('bounded local transform microbench; no startup/driver-performance inference',()=>{
  const texts=[oldReport.rows[1].rows[0].effect.defines,oldReport.rows[2].rows[2].effect.defines];
  const iterations=2000;let length=0;for(let i=0;i<100;i++)canonicalResult(texts[i%2]);const start=performance.now();for(let i=0;i<iterations;i++)length+=canonicalResult(texts[i%2]).length;const elapsed=performance.now()-start;assert.ok(length>0);report.microbench={iterations,elapsedMs:elapsed,meanMicroseconds:elapsed*1000/iterations,chars:texts.map(t=>t.length),note:'Node CPU allocation/sort cost only; no startup/FPS/GPU conclusion'};
});
after(()=>{assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString'),originalDescriptor);report.finishedAt=new Date().toISOString();writeFileSync(new URL('report-mirror-red.json',import.meta.url),JSON.stringify(report,null,2)+'\n')});
