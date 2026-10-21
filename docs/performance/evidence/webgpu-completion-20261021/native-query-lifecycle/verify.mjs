/** Targeted CPU validation only. No install/full-suite/build/server/GPU. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,'../../../../..'),cache=join(root,'.cache/webgpu-completion-native-query-lifecycle-20261021');
const hash=x=>createHash('sha256').update(x).digest('hex'),baseline=JSON.parse(await readFile(join(cache,'baseline.json'),'utf8'));
const installed=dirname(fileURLToPath(import.meta.resolve('@babylonjs/core/package.json')));
const substitutions={};for(const file of Object.keys(baseline.native).filter(f=>f.endsWith('.js'))){assert.equal(hash(await readFile(join(installed,file))),baseline.native[file],`unchanged original ${file}`);substitutions[pathToFileURL(join(installed,file)).href]=await readFile(join(cache,'candidate',file),'utf8');}
const loader=join(cache,'candidate-import.mjs');
await writeFile(loader,`import {registerHooks} from 'node:module';\nconst sources=${JSON.stringify(substitutions)};\nregisterHooks({load(url,context,next){if(Object.hasOwn(sources,url))return {format:'module',source:sources[url],shortCircuit:true};return next(url,context);}});\n`);
const run=(label,args)=>{const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:12*1024*1024}),log=r.stdout+(r.stderr?'\nSTDERR\n'+r.stderr:'');return {label,args,exit:r.status,log};};
const summary=r=>({command:[process.execPath,...r.args].join(' '),exit:r.exit,tests:Number(/^# tests (\d+)$/m.exec(r.log)?.[1]),pass:Number(/^# pass (\d+)$/m.exec(r.log)?.[1]),fail:Number(/^# fail (\d+)$/m.exec(r.log)?.[1]),logSha256:hash(r.log)});
if(process.argv.includes('--red')){
  const inline=run('original causal witness',[join(directory,'inline-red-repro.mjs')]);await writeFile(join(directory,'inline-red.log'),inline.log);assert.equal(inline.exit,0,inline.log);
  const witness=JSON.parse(inline.log.split('\n').find(line=>line.startsWith('{"chain":')));assert.equal(witness.outcomes[0].unhandled,1);assert.equal(witness.outcomes[1].unhandled,1);assert.deepEqual(witness.outcomes[2].samples,[[8,0]]);
  const red=run('portable unchanged installed red',['--import','tsx','--test','--test-reporter=tap','tests/webgpu-query-lifecycle.test.ts']);await writeFile(join(directory,'red.tap'),red.log);assert.equal(red.exit,1);
  console.log(JSON.stringify({inline:summary(inline),witness,red:summary(red)}));
}else{
  const tests=['tests/webgpu-query-lifecycle.test.ts','tests/webgpu-validation.test.ts','tests/render-health.test.ts','tests/render-startup.test.ts','tests/startup-preparation-loop.test.ts'];
  const green=run('isolated native candidate and actual client health',['--import',pathToFileURL(loader).href,'--import','tsx','--test','--test-reporter=tap',...tests]);await writeFile(join(directory,'green.tap'),green.log);assert.equal(green.exit,0,green.log.slice(-14000));
  console.log(JSON.stringify({green:summary(green)}));
  await writeFile(join(cache,'green-summary.json'),JSON.stringify(summary(green),null,2)+'\n');
}
