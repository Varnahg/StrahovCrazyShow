import {moduleAt} from './loader.mjs';
export const {WebGPUQuerySet} = await moduleAt('Engines/WebGPU/webgpuQuerySet.js');
export const {WebGPUTimestampQuery,WebGPUDurationMeasure} = await moduleAt('Engines/WebGPU/webgpuTimestampQuery.js');
export const {WebGPUOcclusionQuery} = await moduleAt('Engines/WebGPU/webgpuOcclusionQuery.js');
export const {WebGPUEngine} = await moduleAt('Engines/webgpuEngine.pure.js');
const {WebGPUBufferManager} = await moduleAt('Engines/WebGPU/webgpuBufferManager.js');
export const {Observable} = await moduleAt('Misc/observable.js');
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
export async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
export const turn=()=>new Promise(resolve=>setImmediate(resolve));
/** All query/consumer/manager code is native. Only terminal device/encoder/buffer IO is fake. */
export function rig(options={}){
  const loss=deferred(), buffers=[], queries=[], maps=[], releases=[], calls=[];
  let fault=options.fault, lossReactions=0;
  const check=stage=>{calls.push(stage);if(fault?.stage===stage)throw fault.error;};
  const device=Object.assign(new EventTarget(),{
    lost:{then(yes,no){lossReactions++;return loss.promise.then(yes,no);}},
    createQuerySet(descriptor){check('createQuerySet');const q={...descriptor,destroys:0,destroy(){this.destroys++;check('queryDestroy');}};queries.push(q);return q;},
    createBuffer(descriptor){check('createBuffer'+(buffers.length+1));const map=deferred();
      const b={...descriptor,unmaps:0,destroys:0,mapCalls:0,map,
        mapAsync(mode){check('map');this.mapCalls++;maps.push(this);return map.promise;},
        getMappedRange(){check('range');return this.range??=new BigUint64Array(options.values??[20n,30n,40n,50n]).buffer;},
        unmap(){this.unmaps++;check('unmap');},destroy(){this.destroys++;check('bufferDestroy');}};
      buffers.push(b);return b;},
    createCommandEncoder(){check('encoder');return {resolveQuerySet(...args){check('resolve');calls.push(['resolveArgs',args[1],args[2]]);},copyBufferToBuffer(...args){check('copy');calls.push(['copyBytes',args[4]]);},finish(){check('finish');return {};}};},
    queue:{submit(){check('submit');}}, destroy(){check('deviceDestroy');},
  });
  const engine=new WebGPUEngine({width:1,height:1,addEventListener(){},removeEventListener(){}},{doNotHandleContextLost:true});
  engine._device=device;engine.uniqueId=31;engine._isWebGPU=true;engine._frameId=8;
  const manager=new WebGPUBufferManager(engine,device),release=manager.releaseBuffer;
  manager.releaseBuffer=function(buffer){releases.push(buffer);check('release');return release.call(this,buffer);};
  engine._bufferManager=manager;
  return {engine,device,manager,loss,buffers,queries,maps,releases,calls,
    fault(value){fault=value;}, lossReactions:()=>lossReactions,
    query(multiple=true){return new WebGPUQuerySet(engine,4,'timestamp',device,manager,multiple,'CPU query');},
    timestamp(){const t=new WebGPUTimestampQuery(engine,device,manager);t.enable=true;return t;},
    occlusion(){return new WebGPUOcclusionQuery(engine,device,manager,2,2);},
  };
}
