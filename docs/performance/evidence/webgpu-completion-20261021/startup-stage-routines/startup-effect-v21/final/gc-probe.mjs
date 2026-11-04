import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {PBRBaseMaterial} from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import * as probe from '../helper/v21/startup-stage-effects.mjs';
for(const keep of['none','owner','engineWrapper','prototypeWrapper','token']){
 function allocate(){const engine=new NullEngine(),scene=new Scene(engine),game={engine,scene,renderHealth:{rendererId:1,generation:1,errorCount:0},startupAbort:new AbortController(),quality:'medium'};
  const owner=probe.createStartupStageEffects(game,{target:'first-medium-vehicle-0'}),o={};probe.registerStartupOptions(game,o);probe.startupPassStarted(o,1);probe.startupStageStarted(o,0,'vehicle-0',2);const token=probe.startupRenderBegin(o,3);
  const strong=({owner,engineWrapper:engine.createEffect,prototypeWrapper:PBRBaseMaterial.prototype._prepareEffect,token})[keep];
  const weak={game:new WeakRef(game),scene:new WeakRef(scene),engine:new WeakRef(engine)};owner.dispose();scene.dispose();engine.dispose();return{strong,weak};
 }
 const result=allocate();await new Promise(setImmediate);for(let i=0;i<16;i++){global.gc();await new Promise(resolve=>setTimeout(resolve,0));}
 const alive=Object.fromEntries(Object.entries(result.weak).map(([key,ref])=>[key,!!ref.deref()]));console.log(keep,alive,typeof result.strong);
 if(Object.values(alive).some(Boolean))throw Error('Retained resource through '+keep);
}
