import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const primary='C:/Users/rezac/Documents/GitHub/StrahovCrazyShow';
const git=(...args)=>execFileSync('git',args,{cwd:primary,maxBuffer:32*1024*1024});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const head=git('rev-parse','HEAD').toString().trim();
if(head!=='8eb183dd0af7bbfd3262d541ed108e0f0c7187b6')throw Error('Unexpected primary base');
if(git('diff','--cached','--name-only').toString().trim())throw Error('Occupied index');
if(git('diff','--name-only','ad2b39c67a5b1db3930c1ab1579a96207d0b2458',head,'--','client','server','shared','scripts','tests','patches','package.json','pnpm-lock.yaml','public','assets').toString().trim())throw Error('Clean native runtime base changed');
const prior=JSON.parse(readFileSync(join(import.meta.dirname,'combined-v3/source-manifest.json'),'utf8'));
if(prior.snapshotId!=='31d0f02303b9cd3ff0721a830f130ee4647df615ffc9a2a47726a4b04c2adbe9')throw Error('Unexpected prior combined');
for(const [p,sha]of Object.entries(prior.files))if(/^(client|server|shared|scripts|tests)\//.test(p)&&hash(readFileSync(join(primary,p)))!==sha)throw Error('Prior validated working composition changed '+p);
const previousBaseline=JSON.parse(readFileSync(join(import.meta.dirname,'frame-integration-baseline.json'),'utf8'));
const expected={...previousBaseline.priorReceiptExpected,...previousBaseline.files};
for(const unit of ['frameLifecycle','startupExit']){
 const r=JSON.parse(readFileSync(join(import.meta.dirname,unit+'-overlay-main-integration.json'),'utf8'));
 if(r.source!=='ad2b39c67a5b1db3930c1ab1579a96207d0b2458'||r.combinedSnapshot!==prior.snapshotId)throw Error('Prior receipt provenance mismatch');
 git('merge-base','--is-ancestor',r.afterHead,head);Object.assign(expected,r.workingHashes);
}
for(const [p,sha]of Object.entries(expected))if(hash(readFileSync(join(primary,p)))!==sha)throw Error('Prior approved working bytes changed '+p);
const dirty=[...new Set([...git('diff','--name-only','-z').toString().split('\0'),...git('ls-files','--others','--exclude-standard','-z').toString().split('\0')].filter(Boolean))];
const output=join(import.meta.dirname,'readiness-integration-baseline.json');
if(existsSync(output))throw Error('Baseline already frozen');
writeFileSync(output,JSON.stringify({atUTC:new Date().toISOString(),head,source:'verified combined-v3 physical tree, native-v10 clean Git tree and both frame integration receipts',files:Object.fromEntries(dirty.map(p=>[p,hash(readFileSync(join(primary,p)))])),priorReceiptExpected:expected,statusSha256:hash(git('status','--porcelain=v1','-z')),diffSha256:hash(git('diff','--binary'))},null,2)+'\n');
console.log(JSON.stringify({head,dirtyFiles:dirty.length,approvedPreviousPaths:Object.keys(expected).length}));
