import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,realpathSync,readdirSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=import.meta.dirname,cwd=join(root,'native-day13-v1'),hash=b=>createHash('sha256').update(b).digest('hex'),[expectedSnapshot]=process.argv.slice(2);
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

verify();const before=sharedState(),results=[];

for(const [phase,args]of [['build','build --configLoader native']]){
 const log=join(root,'native-day13-v1-'+phase+'.log');assert.ok(!existsSync(log),'Preserve previous phase log');
 const startedAt=new Date().toISOString();console.log(JSON.stringify({phase,startedAt,snapshotId}));
 const portGuard=phase==='integration'?"if (Get-NetTCPConnection -LocalPort 2568 -State Listen -ErrorAction SilentlyContinue) { throw 'Reserved integration port is occupied' }; ":'';
 const command=portGuard+"& 'C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --config.verify-deps-before-run=false "+args+"; exit $LASTEXITCODE";
 const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{cwd,env:{...process.env,VITE_SOURCE_SNAPSHOT_ID:snapshotId,TSX_DISABLE_CACHE:'1',GIT_CEILING_DIRECTORIES:dirname(cwd)},encoding:'utf8',maxBuffer:64*1024*1024});
 writeFileSync(log,(result.stdout??'')+(result.stderr??''));results.push({phase,startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,command:'pnpm --config.verify-deps-before-run=false '+args,log,sha256:hash(readFileSync(log))});
 verify();const record={snapshotId,results,sharedMetadataUnchanged:JSON.stringify(before)===JSON.stringify(sharedState()),scope:'Isolated native day13 candidate: production build/full TypeScript only before GPU pilot. Full test and integration acceptance pending. Frozen source and dependencies preserved.'};
 writeFileSync(join(root,'native-day13-v1-validation.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(results.at(-1)));
 if(result.status!==0||!record.sharedMetadataUnchanged){console.log((result.stdout??'').slice(-7000)+(result.stderr??'').slice(-2000));process.exit(result.status||1);}
}
console.log(JSON.stringify({complete:true,snapshotId,sharedMetadataUnchanged:true}));
