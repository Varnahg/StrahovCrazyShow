import {readFileSync,writeFileSync,existsSync,realpathSync,readdirSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=import.meta.dirname,cwd=join(root,'b6-coverage-v2'),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(join(cwd,'source-manifest.json'))),snapshotId=manifest.snapshotId;
if(snapshotId!=='36431c878f1c0c151af4bc259918a108dee60b15d1d294ecb7e6e40ee12ad42b'||hash(JSON.stringify(manifest.files))!==snapshotId)throw Error('Unexpected candidate');
const deps=realpathSync(join(cwd,'node_modules')),metadata=JSON.parse(readFileSync(join(root,'metadata-before-native-build.json')));
const depState=()=>({files:Object.fromEntries(Object.keys(metadata.files).map(p=>[p,hash(readFileSync(join(deps,p)))])),entries:readdirSync(deps).sort(),viteTempMtime:statSync(join(deps,'.vite-temp')).mtimeMs});
const before=depState(),log=join(root,'b6-coverage-v2-build.log');if(existsSync(log))throw Error('Preserve log');
const startedAt=new Date().toISOString(),command="& 'C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' --config.verify-deps-before-run=false build --configLoader native; exit $LASTEXITCODE";
const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{cwd,env:{...process.env,VITE_SOURCE_SNAPSHOT_ID:snapshotId,TSX_DISABLE_CACHE:'1',GIT_CEILING_DIRECTORIES:dirname(cwd)},encoding:'utf8',maxBuffer:32*1024*1024});
writeFileSync(log,(result.stdout??'')+(result.stderr??''));
const record={snapshotId,startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,command:'pnpm --config.verify-deps-before-run=false build --configLoader native',log,sha256:hash(readFileSync(log)),sharedMetadataUnchanged:JSON.stringify(before)===JSON.stringify(depState()),scope:'Full TypeScript and production build for unaccepted coverage QA pilot; full suite/integration not run here.'};
writeFileSync(join(root,'b6-coverage-v2-build.json'),JSON.stringify(record,null,2)+'\n');
for(const[path,expected]of Object.entries(manifest.files))if(!['assets','public','docs'].some(top=>path.startsWith(top+'/'))&&hash(readFileSync(join(cwd,path)))!==expected)throw Error('Frozen candidate drift '+path);
console.log(JSON.stringify(record));if(result.status!==0||!record.sharedMetadataUnchanged){console.log((result.stdout??'').slice(-5000)+(result.stderr??'').slice(-1500));process.exit(result.status||1);}
