import assert from 'node:assert/strict';import{moduleAt}from'./loader.mjs';
const{NullEngine}=await moduleAt('Engines/nullEngine.js'),{WebGPUEngine}=await moduleAt('Engines/webgpuEngine.pure.js'),{Scene}=await moduleAt('scene.js');
const{ShaderMaterial}=await moduleAt('Materials/shaderMaterial.js'),{MeshBuilder}=await moduleAt('Meshes/meshBuilder.js'),{ShadowDepthWrapper}=await moduleAt('Materials/shadowDepthWrapper.js');
const{WebGPUDrawContext}=await moduleAt('Engines/WebGPU/webgpuDrawContext.js'),{WebGPUMaterialContext}=await moduleAt('Engines/WebGPU/webgpuMaterialContext.js');
await moduleAt('Shaders/shadowMap.vertex.js');await moduleAt('Shaders/shadowMap.fragment.js');
await moduleAt('Shaders/ShadersInclude/shadowMapFragmentSoftTransparentShadow.js');
export const vertex='attribute vec3 position;void main(void){gl_Position=vec4(position,1.);}',fragment='void main(void){gl_FragColor=vec4(1.);}';
export async function ready(effect){for(let i=0;i<100&&!effect.isReady()&&!effect.getCompilationError();i++)await new Promise(r=>setTimeout(r,1));assert.equal(effect.getCompilationError(),'');assert.equal(effect.isReady(),true);return effect;}
export async function fixture({gpu=true,options={doNotInjectCode:true}}={}){
 const engine=new NullEngine(),scene=new Scene(engine);Object.defineProperty(engine,'isWebGPU',{value:gpu,configurable:true});
 const contexts=[];engine.createDrawContext=()=>{const c=new WebGPUDrawContext({});let releases=0;const dispose=c.dispose.bind(c);c.dispose=()=>{releases++;dispose();};contexts.push({context:c,releases:()=>releases});return c;};
 engine.createMaterialContext=()=>new WebGPUMaterialContext();
 const creates=[];let serial=0;const create=gpu?WebGPUEngine.prototype.createEffect:engine.createEffect;
 engine.createEffect=function(base,opts,...rest){creates.push({base:{...base},options:{...opts,attributes:[...opts.attributes],uniformsNames:[...opts.uniformsNames],uniformBuffersNames:[...(opts.uniformBuffersNames||[])],samplers:[...opts.samplers]}});return Reflect.apply(create,this,[base,opts,...rest]);};
 if(gpu)engine._releaseEffect=WebGPUEngine.prototype._releaseEffect;
 async function base(overrides={}){return ready(engine.createEffect({vertexSource:vertex,fragmentSource:fragment,vertexToken:'base-'+serial,fragmentToken:'base-'+serial++},{attributes:['position'],uniformsNames:['world'],uniformBuffersNames:['Scene'],samplers:[],defines:'#define SHADOWS\n#define SHADOW0\n',indexParameters:{count:1},shaderLanguage:0,...overrides},engine));}
 const original=await base(),material=new ShaderMaterial('owned base',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position'],uniforms:['world']});
 const wrappers=[];function wrapper(opts=options){const w=new ShadowDepthWrapper(material,scene,opts);wrappers.push(w);return w;}
 const meshes=[];function mesh(effect=original){const m=MeshBuilder.CreateBox('receiver-'+meshes.length,{},scene);m.material=material;meshes.push(m);const sub=m.subMeshes[0];material.onEffectCreatedObservable.notifyObservers({effect,subMesh:sub});return{mesh:m,sub};}
 function notify(sub,effect,pass=engine.currentRenderPassId){const previous=engine.currentRenderPassId;try{engine.currentRenderPassId=pass;material.onEffectCreatedObservable.notifyObservers({effect,subMesh:sub});}finally{engine.currentRenderPassId=previous;}}
 const generator={label:'opaque generator identity'},depth=['#define SM_LIGHTTYPE_SPOTLIGHT'];
 function dispose(){for(const w of wrappers)w.dispose();for(const m of meshes)m.dispose();for(const e of new Set(Object.values(engine._compiledEffects)))e.dispose(true);scene.dispose();engine.dispose();}
 return{engine,scene,material,original,wrapper,mesh,notify,base,generator,depth,creates,contexts,dispose};
}
