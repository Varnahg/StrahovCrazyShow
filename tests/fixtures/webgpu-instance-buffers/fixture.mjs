import {moduleAt} from './loader.mjs';
const [{NullEngine},{Scene},{Mesh},{VertexData},{Material},{MaterialDefines},{DrawWrapper},{WebGPUEngine},{WebGPUBufferManager},{WebGPUCacheRenderPipelineTree},{WebGPUCacheBindGroups},{WebGPUBundleList}]=await Promise.all([
  'Engines/nullEngine.js','scene.js','Meshes/mesh.js','Meshes/mesh.vertexData.js','Materials/material.js','Materials/materialDefines.js','Materials/drawWrapper.js','Engines/webgpuEngine.js','Engines/WebGPU/webgpuBufferManager.js','Engines/WebGPU/webgpuCacheRenderPipelineTree.js','Engines/WebGPU/webgpuCacheBindGroups.js','Engines/WebGPU/webgpuBundleList.js',
].map(moduleAt));
await moduleAt('Meshes/instancedMesh.js');
let effectID=987100;
/** Actual Mesh.render/material preBind/Geometry/instances/cache/draw algorithms.
 * Only ready Effect metadata and terminal GPU/raster IO are supplied. Native
 * base Material is covered; this is not Standard/PBR or whole-Game GPU proof. */
export function fixture(options={}){
  const mode=options.mode??'ncm',terminal={bundles:[],passCalls:[],writes:0,destroys:0,createCalls:0};
  const fakeEncoder=()=>{const resources=[];return{
    setPipeline(){},setIndexBuffer(raw){resources.push(raw);},setVertexBuffer(slot,raw){resources.push(raw);},setBindGroup(){},
    drawIndexed(){if(Object.hasOwn(options,'drawThrows'))throw options.drawThrows;},draw(){if(Object.hasOwn(options,'drawThrows'))throw options.drawThrows;},
    drawIndexedIndirect(raw){resources.push(raw);if(Object.hasOwn(options,'drawThrows'))throw options.drawThrows;},drawIndirect(raw){resources.push(raw);if(Object.hasOwn(options,'drawThrows'))throw options.drawThrows;},
    finish(){const bundle={resources:[...resources],sequence:terminal.bundles.length+1};terminal.bundles.push(bundle);return bundle;},resources,
  };};
  const pass=fakeEncoder(),device={limits:{maxVertexAttributes:16,maxVertexBufferArrayStride:2048},
    createBuffer(descriptor){terminal.createCalls++;if(Object.hasOwn(options,'createThrows'))throw options.createThrows;return{...descriptor,destroy(){this.destroyed=true;terminal.destroys++;}};},
    queue:{writeBuffer(){terminal.writes++;}},createBindGroupLayout:()=>({}),createPipelineLayout:()=>({}),createRenderPipeline:()=>({}),createBindGroup:()=>({}),createRenderBundleEncoder:fakeEncoder};
  const engine=new NullEngine();engine._caps.instancedArrays=true;engine._caps.vertexArrayObject=false;engine.currentRenderPassId=7;
  if(mode!=='webgl'){
    engine._isWebGPU=true;engine.uniqueId=1;Object.defineProperty(engine,'isWebGPU',{value:true});Object.defineProperty(engine,'compatibilityMode',{value:mode==='cm'});
    engine._device=device;engine._bufferManager=new WebGPUBufferManager(engine,device);
    for(const key of ['createVertexBuffer','createDynamicVertexBuffer','createIndexBuffer','updateDynamicVertexBuffer','_releaseBuffer','bindBuffers','bindUniformBufferBase','createDrawContext','createMaterialContext','enableEffect','_draw','drawArraysType','drawElementsType'])engine[key]=WebGPUEngine.prototype[key];
    engine._cacheRenderPipeline=new WebGPUCacheRenderPipelineTree(device);engine._cacheBindGroups=new WebGPUCacheBindGroups(device,{},engine);engine._bundleList=new WebGPUBundleList(device);
    engine._snapshotRendering={play:false,record:false};engine._counters={numEnableEffects:0,numEnableDrawWrapper:0,numBundleReuseNonCompatMode:0,numBundleCreationNonCompatMode:0};
    engine._getCurrentRenderPass=()=>pass;engine.applyStates=()=>{};engine._applyRenderPassChanges=()=>{};engine._reportDrawCall=()=>{};engine._ubDontInvertY=engine._bufferManager.createBuffer(8,72);Object.defineProperty(engine,'currentSampleCount',{value:1});
  }
  const scene=new Scene(engine),mesh=new Mesh('world matrix source',scene),data=new VertexData();data.positions=[0,0,0,1,0,0,0,1,0];data.indices=[0,1,2];data.applyToMesh(mesh);
  const material=new Material('native base material',scene);mesh.material=material;material._storeEffectOnSubMeshes=true;material.useVertexPulling=options.pulling===true;
  const names=['position','world0','world1','world2','world3',...(options.previous===false?[]:['previousWorld0','previousWorld1','previousWorld2','previousWorld3'])];
  const pipeline={shaderProcessingContext:{bufferNames:options.pulling?['world0']:[],samplerNames:[],textureNames:[],bindGroupLayoutEntries:[],bindGroupEntries:[],bindGroupLayoutEntryInfo:[],attributeNamesFromEffect:names,attributeLocationsFromEffect:names.map((_,i)=>i)},bindGroupLayouts:{},stages:{vertexStage:{module:{},entryPoint:'main'},fragmentStage:{module:{},entryPoint:'main'}}};
  const effect={uniqueId:++effectID,_pipelineContext:pipeline,getEngine:()=>engine,getPipelineContext:()=>pipeline,getAttributesNames:()=>names,_attributes:names.map((_,i)=>i),dispose(){},_checkNonFloatVertexBuffers(){}};
  const sub=mesh.subMeshes[0],defines=()=>new MaterialDefines(),extraWrappers=[];
  const prepare=()=>{if(!sub.effect)sub.setEffect(effect,defines(),material._materialContext);const ready=sub._drawWrapper;ready._wasPreviouslyReady=true;ready._wasPreviouslyUsingInstances=true;return ready;};prepare();
  const instances=Array.from({length:40},(_,index)=>mesh.createInstance('world instance'+index));scene.needsPreviousWorldMatrices=options.previous!==false;
  const register=count=>{scene.incrementRenderId();for(const instance of instances.slice(0,count))mesh._registerInstanceForRenderId(instance,scene.getRenderId());};
  const draw=(count=1,{passID=engine.currentRenderPassId,override}={})=>{
    engine.currentRenderPassId=passID;if(override)sub._setMainDrawWrapperOverride(override);
    try{prepare();register(count);const result=mesh.render(sub,false);if(result!==mesh)throw new Error('Native render return changed');return mesh._getInstanceDataStorage();}finally{if(override)sub._setMainDrawWrapperOverride(null);}
  };
  const wrapper=()=>{const value=new DrawWrapper(engine,false);value.materialContext=material._materialContext;value.setEffect(effect,defines());extraWrappers.push(value);return value;};
  return{engine,scene,mesh,sub,material,effect,terminal,pass,device,draw,register,prepare,wrapper,options,
    storage:()=>mesh._getInstanceDataStorage(),context:()=>engine._currentDrawContext,
    sweep:()=>engine._bufferManager?.destroyDeferredBuffers(),
    dispose(){delete options.drawThrows;delete options.createThrows;for(const value of extraWrappers)value.dispose(true);mesh.dispose();material.dispose();scene.dispose();engine._bufferManager?.destroyDeferredBuffers();engine.dispose();},
  };
}
export const current=storage=>storage.instancesBuffer.getBuffer();
export const previous=storage=>storage.instancesPreviousBuffer.getBuffer();
export const hasRaw=(bundle,buffer)=>bundle.resources.includes(buffer.underlyingResource);
export const trackedFields=context=>Object.keys(context??{}).filter(name=>name.startsWith('_regularInstance'));
