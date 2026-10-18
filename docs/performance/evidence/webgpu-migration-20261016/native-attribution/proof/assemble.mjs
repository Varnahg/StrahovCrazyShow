import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),wt=path.resolve(root,'../..');
const base=path.join(wt,'.cache/webgpu-hitch-validation-20261017/authored-native-v3');
const reviewed=path.join(wt,'.cache/webgpu-hitch-validation-20261017/authored-lod-attribution-v1');
const hash=b=>createHash('sha256').update(b).digest('hex');
const bm=JSON.parse(fs.readFileSync(path.join(base,'source-manifest.json'),'utf8'));
assert.equal(bm.snapshotId,'777a1bbb3552b800947cf62adcf6db141c72d3d72600fbfcbeeca42d287e05f6');
const pins={
 'client/webgpu-compilation-profile.ts':'eb0f98345e0d0f8857bfe0695d290407ac560c835f8280c4c1fd8755f9ed7d3c',
 'client/render-incident-profile.ts':'e766f54dee241be837ae3e5d319714a9d92b48b74adc308d71b1fe834ef7d83e',
 'tests/webgpu-compilation-profile.test.ts':'01a1c82457ad7a7c8a67b94326cb28eb497272253899f6a6e9585df5c3f6aef7',
 'tests/render-incident-profile.test.ts':'bcbb7b0f04f8a11fdf17b14c8b668630e2ee5d0690b04b248efe20f7aa0c0aae',
 'tests/webgpu-program-attribution.test.ts':'9d589a5de0f6fe2fda69cb2ec91aa6c1c22ec160486f18d78f714e7f0faf95a4',
};
for(const [name,expected]of Object.entries(pins))assert.equal(hash(fs.readFileSync(path.join(reviewed,name))),expected,name);
const candidate=path.join(root,'candidate');assert.equal(fs.existsSync(candidate),false);fs.mkdirSync(candidate);fs.mkdirSync(path.join(root,'preimages'));
const inputFiles=[];
function copyTree(relative){fs.mkdirSync(path.join(candidate,relative),{recursive:true});for(const e of fs.readdirSync(path.join(base,relative),{withFileTypes:true})){
 const name=path.posix.join(relative,e.name);assert.equal(e.isSymbolicLink(),false,name);
 if(e.isDirectory()){copyTree(name);continue;}
 const bytes=fs.readFileSync(path.join(base,name));assert.equal(hash(bytes),bm.files[name],name);
 fs.writeFileSync(path.join(candidate,name),bytes,{flag:'wx'});inputFiles.push({path:name,sha256:hash(bytes)});
}}
for(const dir of ['client','shared','tests'])copyTree(dir);
for(const name of ['package.json','tsconfig.json'])fs.copyFileSync(path.join(base,name),path.join(candidate,name));
fs.symlinkSync(path.join(base,'node_modules'),path.join(candidate,'node_modules'),'junction');
const changes=[];
for(const name of Object.keys(pins)){
 const original=fs.existsSync(path.join(candidate,name))?fs.readFileSync(path.join(candidate,name)):null;
 if(original)fs.writeFileSync(path.join(root,'preimages',name.replaceAll('/','__')),original,{flag:'wx'});
 const next=fs.readFileSync(path.join(reviewed,name));fs.writeFileSync(path.join(candidate,name),next);
 changes.push({path:name,originalSha256:original?hash(original):null,sha256:hash(next)});
}
const gamePath=path.join(candidate,'client/game.ts'),before=fs.readFileSync(gamePath,'utf8');
fs.writeFileSync(path.join(root,'preimages/client__game.ts'),before,{flag:'wx'});
let game=before;const edits=[];
const edit=(from,to)=>{assert.equal(game.split(from).length,2,from);game=game.replace(from,to);edits.push({from,to});};
edit('import { prepareLightVariants } from "./light-preparation";','import { prepareLightVariants } from "./light-preparation";\nimport { RenderIncidentProfile } from "./render-incident-profile";');
edit('  private readonly compilationProfile: WebGpuCompilationProfile;','  private readonly compilationProfile: WebGpuCompilationProfile;\n  private stopProgramAttribution?: () => void;');
edit('    this.compilationProfile = new WebGpuCompilationProfile(this.engine, {','    this.compilationProfile = new WebGpuCompilationProfile(this.engine, {\n      onProgramAttribution: (record) => sessionDiagnostics.event("webgpu-program-attribution", {\n        ...record, rendererId: this.renderHealth.rendererId,\n      }),');
edit('    this.benchmark?.profile.dispose();\n    sessionDiagnostics.event("benchmark-start", {',`    this.benchmark?.profile.dispose();
    this.stopProgramAttribution?.();
    // Copied diagnostic only: ordinary startup stays unchanged. The existing
    // recorder already restricts recording to local hosts; an explicit
    // benchmark owns this observer window independently of profileEnvironment.
    if (sessionDiagnostics.isRecording && this.engine.isWebGPU) {
      const incident = new RenderIncidentProfile(this.scene);
      let detach: (() => void) | undefined;
      const stop = () => {
        if (this.stopProgramAttribution !== stop) return;
        this.stopProgramAttribution = undefined;
        try { detach?.(); }
        finally {
          try { this.compilationProfile.endProgramAttribution(); }
          finally { incident.dispose(); }
        }
      };
      this.stopProgramAttribution = stop;
      try {
        this.compilationProfile.beginProgramAttribution();
        detach = incident.observeProgramUsers((effect, user) =>
          this.compilationProfile.observeProgramUser(effect, user));
      } catch (error) {
        try { stop(); } finally { throw error; }
      }
    }
    sessionDiagnostics.event("benchmark-start", {`);
edit('    attempt("benchmark", () => benchmark?.profile.dispose());','    attempt("benchmark", () => benchmark?.profile.dispose());\n    attempt("program-attribution", () => this.stopProgramAttribution?.());');
edit('        b.profile.dispose();\n        const durationSeconds', '        b.profile.dispose();\n        this.stopProgramAttribution?.();\n        const durationSeconds');
edit('    sessionDiagnostics.event("game-dispose", {});','    this.stopProgramAttribution?.();\n    sessionDiagnostics.event("game-dispose", {});');
let inverse=game;for(const {from,to}of [...edits].reverse()){assert.equal(inverse.split(to).length,2);inverse=inverse.replace(to,from);}assert.equal(inverse,before);
fs.writeFileSync(gamePath,game);changes.push({path:'client/game.ts',originalSha256:hash(before),sha256:hash(game)});
fs.writeFileSync(path.join(root,'game-edits.json'),JSON.stringify({edits,inverseSha256:hash(inverse),before:hash(before),after:hash(game)},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(root,'inputs.json'),JSON.stringify({base,baseSnapshot:bm.snapshotId,reviewed,reviewedPins:pins,inputFiles,changes,dependencies:fs.realpathSync(path.join(base,'node_modules'))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({candidate,changes}));
