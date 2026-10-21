// Causal witness: unchanged installed native timestamp→duration→query chain.
// The observer only records this standalone witness process, never application filtering.
import {rig,turn} from '../../../../../tests/fixtures/webgpu-query-lifecycle/fixture.mjs';
const unhandled=[],listener=error=>unhandled.push(error);process.on('unhandledRejection',listener);
const outcomes=[];
try{
  for(const mode of ['active','query-dispose-only','engine-disposed']){
    const r=rig(),t=r.timestamp(),samples=[],error=new Error('original terminal map abort');
    t.endPass(0,{_addDuration:(...args)=>samples.push(args)});
    if(mode==='query-dispose-only')t._measureDuration._querySet.dispose();
    if(mode==='engine-disposed')r.engine._isDisposed=true;
    const before=unhandled.length;r.maps[0].map.reject(error);await turn();
    outcomes.push({mode,unhandled:unhandled.length-before,sameOriginalError:unhandled.at(-1)===error,samples});
  }
}finally{process.off('unhandledRejection',listener);}
console.log(JSON.stringify({chain:'native endPass→DurationMeasure.stopPass→QuerySet.readTwoValuesAndSubtract',terminalIO:'fake map rejection only',outcomes}));
