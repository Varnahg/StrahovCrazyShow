import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,symlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base='C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-hitch-validation-20261017/light-switch-profile-v1';
const helper=join(root,'../webgpu-cpu-helper-20261019'),out=join(root,'candidate-v2'),hash=b=>createHash('sha256').update(b).digest('hex');
const bm=JSON.parse(readFileSync(join(base,'source-manifest.json'))),hm=JSON.parse(readFileSync(join(helper,'manifest.json')));
assert.equal(bm.snapshotId,'26878bbf37f9ad983272081a7466c6a9309cff7405c9e3e3bde1ba6cd1b523fb');assert.equal(hash(JSON.stringify(bm.files)),bm.snapshotId);assert.ok(!existsSync(out));
assert.equal(hm.tests.failed,0);assert.equal(hm.tests.exitCode,0);
mkdirSync(out);const files={},patches=[];
function write(p,b){mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);files[p]=hash(b);}
for(const[p,sha]of Object.entries(bm.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha,p);write(p,b);}
for(const p of ['assets','public','docs','node_modules'])symlinkSync(realpathSync(join(base,p)),join(out,p),'junction');
for(const p of ['client/qa-cpu-profile.ts','tests/qa-cpu-profile.test.ts']){const b=readFileSync(join(helper,p));assert.equal(hash(b),hm.files[p]);write(p,b);}
function patchFile(path,changes){
 const original=readFileSync(join(base,path)),crlf=original.includes(Buffer.from('\r\n'));let text=original.toString().replaceAll('\r\n','\n');
 for(const[before,after]of changes){assert.equal(text.split(before).length,2,path+' unique patch');text=text.replace(before,after);patches.push({path,before,after});}
 const bytes=Buffer.from(crlf?text.replaceAll('\n','\r\n'):text);write(path,bytes);
 for(const[before,after]of [...changes].reverse()){assert.equal(text.split(after).length,2,path+' inverse');text=text.replace(after,before);}
 assert.equal(hash(Buffer.from(crlf?text.replaceAll('\n','\r\n'):text)),hash(original),path+' byte inverse');
}
patchFile('client/game.ts',[
 ['import { snapshotBenchmarkDiagnostics }','import { beginQaCpuProfile } from "./qa-cpu-profile";\nimport { snapshotBenchmarkDiagnostics }'],
 ['    lightSwitch?: {\n      meshDraw?: MeshDrawProfile;','    lightSwitch?: {\n      cpuStop?: (reason: string) => void;\n      meshDraw?: MeshDrawProfile;'],
 ['    this.benchmark = {\n      start: performance.now(),','    const cpuStop = sessionDiagnostics.isRecording && this.engine.isWebGPU ? beginQaCpuProfile() : undefined;\n    try {\n    this.benchmark = {\n      start: performance.now(),'],
 ['        lastVehicle: this.actor.vehicle, lastRevision: this.stableLights.stats.revisions,','        cpuStop, lastVehicle: this.actor.vehicle, lastRevision: this.stableLights.stats.revisions,'],
 ['    return true;\n  }\n  private stopLightSwitchProfile(','    return true;\n    } catch (error) { cpuStop?.("benchmark-start-error"); throw error; }\n  }\n  private stopLightSwitchProfile('],
 ['    if (!state || state.closed) return;\n    state.closed = true;','    if (reason !== "benchmark-end") {\n      const cpuStop = state?.cpuStop;\n      if (state) state.cpuStop = undefined;\n      cpuStop?.(reason);\n    }\n    if (!state || state.closed) return;\n    state.closed = true;'],
 ['        this.benchmark = undefined;\n        this.stopLightSwitchProfile(b.lightSwitch, "benchmark-end");','        this.benchmark = undefined;\n        const cpuStop = b.lightSwitch?.cpuStop;\n        if (b.lightSwitch) b.lightSwitch.cpuStop = undefined;\n        let result: Benchmark;\n        let cpuStopReason = "benchmark-end";\n        try {\n        this.stopLightSwitchProfile(b.lightSwitch, "benchmark-end");'],
 ['        this.onBenchmark?.({','        result = {'],
 ['          weatherAtEnd: this.weather ? structuredClone(this.weather) : null,\n        });','          weatherAtEnd: this.weather ? structuredClone(this.weather) : null,\n        };\n        } catch (error) { cpuStopReason = "benchmark-completion-error"; throw error; }\n        finally { cpuStop?.(cpuStopReason); }\n        this.onBenchmark?.(result);']
]);
patchFile('tests/game-light-switch-profile.test.ts',[
 ['  const noop=()=>{},disposable=()=>({dispose:noop});','  const cpuCaptures:{stops:string[]}[]=[];\n  const noop=()=>{},disposable=()=>({dispose:noop});'],
 ['  const globals={performance:', '  const globals={beginQaCpuProfile:()=>{const capture={stops:[] as string[]};cpuCaptures.push(capture);return(reason:string)=>{capture.stops.push(reason);order.push("cpu-stop");};},performance:'],
 ['captureModelReview:()=>({}),captureRenderCostInventory:', 'captureModelReview:()=>{order.push("metrics");return{};},captureRenderCostInventory:'],
 ['  return {game,scene,mesh,material,point,profiles,events,order,baseline,','  return {game,scene,mesh,material,point,profiles,events,order,baseline,cpuCaptures,']
]);
const extra=`\n\ntest("actual CPU capture ends after metrics and before reentrant benchmark callback",t=>{\n const x=fixture(t);x.game.startBenchmark();x.game.onBenchmark=(value:any)=>{x.order.push("callback");assert.equal(value.frames,1);assert.deepEqual(x.cpuCaptures[0].stops,["benchmark-end"]);x.game.startBenchmark();};x.finish();\n assert.ok(x.order.indexOf("metrics")<x.order.indexOf("cpu-stop"));assert.ok(x.order.indexOf("cpu-stop")<x.order.indexOf("callback"));assert.equal(x.cpuCaptures.length,2);assert.deepEqual(x.cpuCaptures[1].stops,[]);\n});\ntest("actual CPU ownership is tied to old benchmark state, with recording/fault/dispose cleanup",t=>{\n const x=fixture(t);x.game.startBenchmark();const old=x.game.benchmark.lightSwitch;x.game.startBenchmark();assert.deepEqual(x.cpuCaptures[0].stops,["restart"]);x.game.stopLightSwitchProfile(old,"stale");assert.deepEqual(x.cpuCaptures[1].stops,[]);\n x.record(false);x.draw();assert.deepEqual(x.cpuCaptures[1].stops,["recording-ended"]);x.record(true);x.game.startBenchmark();x.game.handleRendererFailure("fault");assert.deepEqual(x.cpuCaptures[2].stops,["renderer-failure"]);x.game.dispose();assert.equal(x.cpuCaptures[2].stops.length,1);\n});\ntest("CPU capture is absent for nonlocal/WebGL and cleans up original startup failure",t=>{\n const x=fixture(t);x.record(false);x.game.startBenchmark();x.record(true);x.game.engine.isWebGPU=false;x.game.startBenchmark();assert.equal(x.cpuCaptures.length,0);\n x.game.engine.isWebGPU=true;const error=new Error("original metric failure");x.game.renderHealth.snapshot=()=>{throw error;};assert.throws(()=>x.game.startBenchmark(),e=>e===error);assert.deepEqual(x.cpuCaptures[0].stops,["benchmark-start-error"]);\n});\n`;
const tp='tests/game-light-switch-profile.test.ts';write(tp,Buffer.concat([readFileSync(join(out,tp)),Buffer.from(extra),readFileSync(join(root,'completion-regression.txt'))]));
write('qa-provenance/cpu-profile/patches.json',JSON.stringify(patches,null,2)+'\n');
write('qa-provenance/cpu-profile/helper-manifest.json',readFileSync(join(helper,'manifest.json')));
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({...bm,snapshotId,createdAt:new Date().toISOString(),files},null,2)+'\n');
writeFileSync(join(root,'assembly-v2.json'),JSON.stringify({snapshotId,base:bm.snapshotId,sourceFiles:Object.keys(files).length,gameBefore:bm.files['client/game.ts'],gameAfter:files['client/game.ts'],inverse:true,helperManifestSha:hash(readFileSync(join(helper,'manifest.json')))},null,2)+'\n');
console.log(JSON.stringify({snapshotId,files:Object.keys(files).length,out}));
