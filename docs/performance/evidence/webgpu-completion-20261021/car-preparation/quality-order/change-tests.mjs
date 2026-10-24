import fs from 'node:fs';
function edit(file, change) {
  const original=fs.readFileSync(file,'utf8'),newline=original.includes('\r\n')?'\r\n':'\n';
  let text=original.replaceAll('\r\n','\n');
  const once=(before,after)=>{if(text.split(before).length!==2)throw Error('Ambiguous/missing '+file+': '+before);text=text.replace(before,after);};
  const all=(before,after)=>{if(!text.includes(before))throw Error('Missing '+file+': '+before);text=text.replaceAll(before,after);};
  change(once,all);fs.writeFileSync(file,text.replaceAll('\n',newline));
}
edit('tests/render-quality-preparation.test.ts',(once,all)=>{
  once('three qualities run once with initial ${initial} last and one final-pass flag','progressive three qualities precede requested ${initial} restoration with one final-pass flag');
  once('    const expected = (["low", "medium", "high"] as const)\n      .filter((q) => q !== initial)\n      .concat(initial);','    const expected: RenderQuality[] = ["low", "medium", "high"];\n    if (initial !== "high") expected.push(initial);');
  once('      [false, false, true],','      expected.map((_, index) => index === expected.length - 1),');
  once('      [29995, 29995, 29995],','      expected.map(() => 29995),');
  once('    assert.equal(outcome.elapsedMs, 322);','    assert.equal(outcome.elapsedMs, expected.length * 105 + 7);');
  once('    assert.equal(outcome.activeElapsedMs, 322);','    assert.equal(outcome.activeElapsedMs, expected.length * 105 + 7);');
  once('      [105, 105, 112],','      expected.map((_, index) => index === expected.length - 1 ? 112 : 105),');
  once('    [1, 1, 1],','    [1, 1, 1, 1],');
  once('outcome.elapsedMs, 180322','outcome.elapsedMs, 240427');
  once('outcome.pausedMs, 180000','outcome.pausedMs, 240000');
  once('outcome.activeElapsedMs, 322','outcome.activeElapsedMs, 427');
  once('    [105, 105, 112],','    [105, 105, 105, 112],');
  once('    [29995, 29995, 29995],','    [29995, 29995, 29995, 29995],');
  once('outcome.pausedMs, 300','outcome.pausedMs, 400');
  once('outcome.activeElapsedMs, 22','outcome.activeElapsedMs, 27');
  once('r.activeElapsedMs, 322','r.activeElapsedMs, 427');
  once('test("the total budget includes time between passes and reduces the next timeout"','test("the total budget includes time between passes and also bounds the requested-final pass"');
  once('  assert.equal(outcome.activeElapsedMs, 80022);','  assert.equal(outcome.activeElapsedMs, 90027);');
  once('  assert.equal(f.passes[2].timeoutMs, 19985);','  assert.equal(f.passes[2].timeoutMs, 19985);\n  assert.equal(f.passes[3].timeoutMs, 9980);\n  assert.equal(outcome.qualities.at(-1)!.status, "timeout");');
  // Retain the exact original50000ms gap; the new fourth pass is now over90s.
  once('  assert.equal(outcome.status, "complete");\n  assert.equal(outcome.activeElapsedMs, 90027);','  assert.equal(outcome.status, "timeout");\n  assert.equal(outcome.activeElapsedMs, 90027);');
  once('test("restoration cost can turn apparent completion into timeout", async () => {\n  const f = fixture({','test("restoration cost can turn apparent completion into timeout", async () => {\n  const f = fixture({\n    initialQuality: "high",');
  once('  assert.equal(f.applied.length, 3);','  assert.equal(f.applied.length, 4);');
  once('at === "before" ? 0 : at === "restore" ? 3 : 1','at === "before" ? 0 : at === "restore" ? 4 : 1');
  all('["low", "high", "medium", "high", "medium"]','["low", "medium", "high", "medium", "high"]');
  all('["low", "high", "medium", "high"]','["low", "medium", "high", "medium", "high"]');
  all('["low", "high", "medium"]','["low", "medium", "high", "medium"]');
  all('[false, false, true, true]','[false, false, false, true, true]');
  all('[false, false, true]','[false, false, false, true]');
  once('actual light helper completes all39 attributed stages','actual light helper completes all52 attributed stages');
  once('outcome.stages.length, 39','outcome.stages.length, 52');
  once('renders, 117','renders, 156');once('detachCount, 3','detachCount, 4');
  once('outcome.elapsedMs, 427','outcome.elapsedMs, 532');
  once('if (f.applied.length === 4) f.dispose();','if (f.applied.length === 5) f.dispose();');
  once('assert.equal(f.applied.length, 4);\n  assert.equal(f.passes.length, 3);','assert.equal(f.applied.length, 5);\n  assert.equal(f.passes.length, 4);');
  once('if (f.passes.length === 4) throw original;','if (f.passes.length === 5) throw original;');
  once('  assert.equal(f.passes.length, 4);\n});\n\ntest("invalid untyped latest','  assert.equal(f.passes.length, 5);\n});\n\ntest("invalid untyped latest');
  once('assert.equal(f.passes.length, 3);\n});','assert.equal(f.passes.length, 4);\n});');
});
edit('tests/game-quality-preparation.test.ts',(once,all)=>{
  once('actual Game prepares three render qualities','actual Game prepares progressive qualities then the requested final quality');
  once('["low", "high", "medium"]','["low", "medium", "high", "medium"]');
  once('[false, false, true]','[false, false, false, true]');
  once('assert.equal(f.passes.length, 3);','assert.equal(f.passes.length, mode === "high" ? 3 : 4);');
  once('assert.equal(f.passes.length, 4);','assert.equal(f.passes.length, 5);');
});
edit('tests/game-low-vehicle-preparation.test.ts',(once,all)=>{
  once('  const requested = { quality, revision: 17, hardwareScaling: 1 };','  const requested = { quality, revision: 17, hardwareScaling: 1 };\n  const qualityPasses: { quality: string; final: boolean }[] = [];');
  once('  const grassPack = withGrass ?', '  const originalPrepare = game.prepareLightingVariants;\n  game.prepareLightingVariants = function (...args: any[]) {\n    qualityPasses.push({ quality: this.quality, final: typeof args[2]?.restoreQuality === "function" });\n    return Reflect.apply(originalPrepare, this, args);\n  };\n  const grassPack = withGrass ?');
  once('    requested,\n    invariant,','    requested,\n    qualityPasses,\n    invariant,');
  once('all57 stages and all3 quality passes','all76 stages and all4 quality passes');
  once('assert.equal(result.stages.length,57);','assert.equal(result.stages.length,76);');
  once('[["low",19],["high",19],["medium",19]]','[["low",19],["medium",19],["high",19],["medium",19]]');
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
