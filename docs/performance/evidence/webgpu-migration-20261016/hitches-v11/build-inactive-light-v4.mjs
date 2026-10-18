import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,realpathSync,readdirSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=import.meta.dirname,cwd=join(root,'inactive-light-v4'),hash=b=>createHash('sha256').update(b).digest('hex'),[expectedSnapshot]=process.argv.slice(2);
assert.match(expectedSnapshot??'',/^[a-f0-9]{64}$/);
const manifest=JSON.parse(readFileSync(join(cwd,'source-manifest.json'))),snapshotId=manifest.snapshotId;
assert.equal(snapshotId,expectedSnapshot);assert.equal(hash(JSON.stringify(manifest.files)),snapshotId);
const input=JSON.parse(readFileSync(join(cwd,'qa-provenance/dependency-input.json'))),output=JSON.parse(readFileSync(join(cwd,'qa-provenance/dependency-output.json')));
const v5=realpathSync(join(root,'../webgpu-migration/dependencies-v5/node_modules')),metadata=JSON.parse(readFileSync(join(root,'metadata-before-native-build.json')));
const sharedState=()=>({files:Object.fromEntries(Object.keys(metadata.files).map(p=>[p,hash(readFileSync(join(v5,p)))])),entries:readdirSync(v5).sort(),viteTempMtime:statSync(join(v5,'.vite-temp')).mtimeMs});
function verify(){
 for(const [path,expected]of Object.entries(manifest.files))if(!['assets','public','docs'].some(top=>path.startsWith(top+'/')))assert.equal(hash(readFileSync(join(cwd,path))),expected,'Frozen source drift '+path);
 for(const [key,expected]of Object.entries(output.files)){const at=key.indexOf('/'),name=key.slice(0,at),path=key.slice(at+1);assert.equal(hash(readFileSync(join(cwd,'node_modules/@babylonjs',name,path))),expected,'QA dependency drift '+key);assert.equal(hash(readFileSync(join(input.packageRoots[name].from,path))),input.inputs[key],'V5 dependency drift '+key);}
 for(const [name,expected]of Object.entries(output.shimHashes))assert.equal(hash(readFileSync(join(cwd,'node_modules/.bin',name+'.cmd'))),expected,'Tool shim drift');
}
verify();const before=sharedState(),log=join(root,'inactive-light-v4-build.log');assert.ok(!existsSync(log),'Preserve previous build');
const startedAt=new Date().toISOString(),command="& 'C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --config.verify-deps-before-run=false build --configLoader native; exit $LASTEXITCODE";
console.log(JSON.stringify({startedAt,snapshotId,scope:'Full TypeScript + production build; own tool output root and frozen QA core/loaders'}));
const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{cwd,env:{...process.env,VITE_SOURCE_SNAPSHOT_ID:snapshotId,TSX_DISABLE_CACHE:'1',GIT_CEILING_DIRECTORIES:dirname(cwd)},encoding:'utf8',maxBuffer:32*1024*1024});
writeFileSync(log,(result.stdout??'')+(result.stderr??''));
const record={snapshotId,startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,command:'pnpm --config.verify-deps-before-run=false build --configLoader native',log,sha256:hash(readFileSync(log)),sharedMetadataUnchanged:JSON.stringify(before)===JSON.stringify(sharedState()),scope:'Full TypeScript and production build; GPU, full suite and integration acceptance pending.'};
verify();writeFileSync(join(root,'inactive-light-v4-build.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
if(result.status!==0||!record.sharedMetadataUnchanged){console.log((result.stdout??'').slice(-6000)+(result.stderr??'').slice(-2000));process.exit(result.status||1);}
