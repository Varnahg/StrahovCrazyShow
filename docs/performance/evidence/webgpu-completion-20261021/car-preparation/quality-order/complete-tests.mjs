import fs from 'node:fs';
function edit(file, change) {
  const original=fs.readFileSync(file,'utf8'),newline=original.includes('\r\n')?'\r\n':'\n';
  let text=original.replaceAll('\r\n','\n');
  const once=(before,after)=>{if(text.split(before).length!==2)throw Error('Ambiguous/missing '+file+': '+before);text=text.replace(before,after);};
  const all=(before,after)=>{if(!text.includes(before))throw Error('Missing '+file+': '+before);text=text.replaceAll(before,after);};
  change(once,all);fs.writeFileSync(file,text.replaceAll('\n',newline));
}
edit('tests/game-low-vehicle-preparation.test.ts',(once,all)=>{
  once('  const requested = { quality, revision: 17, hardwareScaling: 1 };','  const requested = { quality, revision: 17, hardwareScaling: 1 };\n  const qualityPasses: { quality: string; final: boolean }[] = [];');
  once('  const grassPack = withGrass ?', '  const originalPrepare = game.prepareLightingVariants;\n  game.prepareLightingVariants = function (...args: any[]) {\n    qualityPasses.push({ quality: this.quality, final: typeof args[2]?.restoreQuality === "function" });\n    return Reflect.apply(originalPrepare, this, args);\n  };\n  const grassPack = withGrass ?');
  once('    requested,\n    invariant,','    requested,\n    qualityPasses,\n    invariant,');
  once('all57 stages and all3 quality passes','all76 stages and all4 quality passes');
  once('assert.equal(result.stages.length,57);','assert.equal(result.stages.length,76);');
  once('assert.deepEqual(result.qualities.map((q:any)=>[q.quality,q.stageCount]),[["low",19],["high",19],["medium",19]]);','assert.deepEqual(result.qualities.map((q:any)=>[q.quality,q.stageCount]),[["low",19],["medium",19],["high",19],["medium",19]]);');
  once('assert.equal(result.stages.length, 57);','assert.equal(result.stages.length, requested === "high" ? 57 : 76);');
  once('requested === "medium" ? [["low",19],["high",19],["medium",19]]','requested === "medium" ? [["low",19],["medium",19],["high",19],["medium",19]]');
  once('if (!changed && f.game.quality === "medium" && f.stage() === "current-off")','if (!changed && f.game.quality === "medium" && f.stage() === "current-off" && f.qualityPasses.at(-1)?.final)');
  once('  assert.equal(result.stages.length, 76);','  assert.equal(result.stages.length, 95);');
  once('["low", "high", "medium", "high"]','["low", "medium", "high", "medium", "high"]');
  once('[false, false, true, true]','[false, false, false, true, true]');
  once('  assert.equal(result.status, "complete"); assert.equal(changed, true);','  assert.equal(result.status, "complete"); assert.equal(changed, true);\n  assert.deepEqual(f.qualityPasses.slice(0, 4), [\n    {quality:"low",final:false},{quality:"medium",final:false},{quality:"high",final:false},{quality:"medium",final:true},\n  ], "late request occurred in the second Medium, after progressive High");');
});
edit('tests/game-authored-light-preparation.test.ts',(once,all)=>{
  once('row.preparation.stages.length,57','row.preparation.stages.length,76');
  once('initialQuality==="low"?["medium","high","low"]:["low","high","medium"]','["low","medium","high",initialQuality]');
  once('assert.equal(row.stages.length,57);','assert.equal(row.stages.length,57,"Map is a unique quality/stage projection; actual preparation reports76 passes/stages above");');
});
console.log('Meaningful progressive/final-pass assertions updated; runtime not edited.');
