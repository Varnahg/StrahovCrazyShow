import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const primary='C:/Users/rezac/Documents/GitHub/StrahovCrazyShow';
const git=(...args)=>execFileSync('git',args,{cwd:primary,maxBuffer:32*1024*1024});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const head=git('rev-parse','HEAD').toString().trim();
if(head!=='b758c0ab490363eb86a058d0ac7590ea8eb69078')throw Error('Unexpected primary base');
if(git('diff','--cached','--name-only').toString().trim())throw Error('Occupied index');
const c1=JSON.parse(readFileSync(join(import.meta.dirname,'combined-v1/source-manifest.json'),'utf8'));
const c3=JSON.parse(readFileSync(join(import.meta.dirname,'combined-v3/source-manifest.json'),'utf8'));
if(c1.snapshotId!=='dd074bd451e1fa6557f4a6e767976a701c450dc5fc1096c304f256a6eb571ce8'||c3.snapshotId!=='31d0f02303b9cd3ff0721a830f130ee4647df615ffc9a2a47726a4b04c2adbe9')throw Error('Unexpected combined checkpoint');
for(const [p,sha]of Object.entries(c1.files))if(/^(client|server|shared|scripts|tests)\//.test(p)&&hash(readFileSync(join(primary,p)))!==sha)throw Error('Prior validated working composition changed '+p);
const previousBaseline=JSON.parse(readFileSync(join(import.meta.dirname,'40ced3c-main-before.json'),'utf8'));
const expected={...previousBaseline.files};
for(const unit of ['preview','game','fresnel','companions','fixtures']){
 const r=JSON.parse(readFileSync(join(import.meta.dirname,unit+'-overlay-main-integration.json'),'utf8'));
 if(r.source!=='dacb5ddf0a0b584e54807315e6619fdb080211d7'||r.combinedSnapshot!==c1.snapshotId)throw Error('Prior receipt provenance mismatch');
 git('merge-base','--is-ancestor',r.afterHead,head);Object.assign(expected,r.workingHashes);
}
for(const [p,sha]of Object.entries(expected))if(hash(readFileSync(join(primary,p)))!==sha)throw Error('Prior approved working bytes changed '+p);
const dirty=[...new Set([...git('diff','--name-only','-z').toString().split('\0'),...git('ls-files','--others','--exclude-standard','-z').toString().split('\0')].filter(Boolean))];
const output=join(import.meta.dirname,'frame-integration-baseline.json');
if(existsSync(output))throw Error('Baseline already frozen');
writeFileSync(output,JSON.stringify({atUTC:new Date().toISOString(),head,source:'verified combined-v1 physical tree and all five prior integration receipts',files:Object.fromEntries(dirty.map(p=>[p,hash(readFileSync(join(primary,p)))])),priorReceiptExpected:expected,statusSha256:hash(git('status','--porcelain=v1','-z')),diffSha256:hash(git('diff','--binary'))},null,2)+'\n');
console.log(JSON.stringify({head,dirtyFiles:dirty.length,approvedPreviousPaths:Object.keys(expected).length}));
