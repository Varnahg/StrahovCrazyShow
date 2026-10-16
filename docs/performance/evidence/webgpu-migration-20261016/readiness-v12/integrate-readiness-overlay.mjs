import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,copyFileSync,constants,renameSync,unlinkSync,fstatSync,statSync,ftruncateSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
const primary='C:/Users/rezac/Documents/GitHub/StrahovCrazyShow';
const source='dc293902fd47072fc784fa4e7c9f04e816e2ec00';
const combined=join(import.meta.dirname,'combined-v4');
const units={
  readinessTracking:{message:'refactor(render): distinguish shader validation from preparation readiness',paths:['client/render-health.ts','client/webgpu-compilation-profile.ts','tests/render-health.test.ts','tests/webgpu-compilation-profile.test.ts','tests/render-startup.test.ts','docs/agents/handoffs/webgpu-validation-overlap-20261016.md'],working:[]},
  requestedEffects:{message:'fix(render): check pending requested WebGPU effects behind material hot swaps',paths:['client/strict-material-preparation.ts','tests/strict-material-preparation.test.ts','docs/agents/handoffs/webgpu-strict-material-preparation-20261016.md'],working:[]},
  preparationWiring:{message:'perf(render): overlap shader diagnostics while retaining strict final readiness',paths:['client/game.ts','tests/game-light-preparation.test.ts','tests/game-webgpu-startup.test.ts'],working:['client/game.ts','tests/game-light-preparation.test.ts','tests/game-webgpu-startup.test.ts']},
};
const unit=process.argv[2];
if(!Object.hasOwn(units,unit))throw Error('Unknown reserved unit');
const {paths,working,message}=units[unit];
const canonicalGit=(...args)=>execFileSync('git',args,{cwd:primary,maxBuffer:32*1024*1024});
let gitOptions={cwd:primary,maxBuffer:32*1024*1024};
const git=(...args)=>execFileSync('git',args,gitOptions);
const hash=b=>createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(readFileSync(new URL('readiness-integration-baseline.json',import.meta.url),'utf8'));
const manifestBytes=readFileSync(join(combined,'source-manifest.json'));
const manifest=JSON.parse(manifestBytes);
if(manifest.snapshotId!=='1383fc9296d70d256ead4c6df0ac87892cdcd522426272bc8e7288613266f277')throw Error('Unexpected combined snapshot');
if(hash(JSON.stringify(manifest.files))!==manifest.snapshotId)throw Error('Combined manifest content hash mismatch');
const validation=JSON.parse(readFileSync(new URL('validated-readiness-checkpoints.json',import.meta.url),'utf8'));
if(validation.native.sourceCommit!==source||validation.combined.snapshotId!==manifest.snapshotId||!validation.native.complete||!validation.combined.complete)throw Error('Complete pipeline evidence required');
const nativeManifest=JSON.parse(readFileSync(new URL('native-v12/source-manifest.json',import.meta.url),'utf8'));
if(nativeManifest.sourceCommit!==source||nativeManifest.snapshotId!==validation.native.snapshotId||hash(JSON.stringify(nativeManifest.files))!==nativeManifest.snapshotId)throw Error('Native validation manifest mismatch');
for(const checkpoint of [validation.native,validation.combined])for(const log of Object.values(checkpoint.logs))
  if(log.exitCode!==0||hash(readFileSync(resolve(import.meta.dirname,'../..',log.path)))!==log.sha256)throw Error('Validation log drift');
const indexPath=canonicalGit('rev-parse','--path-format=absolute','--git-path','index').toString().trim();
if(resolve(indexPath)!==resolve(primary,'.git/index'))throw Error('Unexpected canonical index path');
const branch=canonicalGit('symbolic-ref','HEAD').toString().trim();
if(branch!=='refs/heads/main')throw Error('Primary is not main');
const initialHead=canonicalGit('rev-parse','HEAD').toString().trim();
if(baseline.head!=='8eb183dd0af7bbfd3262d541ed108e0f0c7187b6')throw Error('Unexpected baseline HEAD');
canonicalGit('merge-base','--is-ancestor',baseline.head,initialHead);
for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REBASE_HEAD'])
  if(existsSync(join(primary,'.git',name)))throw Error('Another Git operation is in progress');
for(const name of ['pre-commit','prepare-commit-msg','commit-msg'])
  if(existsSync(join(primary,'.git/hooks',name)))throw Error('Review active commit hook before integration: '+name);
let hookConfig='';
try {hookConfig=execFileSync('git',['config','--get-regexp','^core\.hooksPath$'],{cwd:primary,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
catch(error){if(error.status!==1)throw error;}
if(hookConfig)throw Error('Review configured hooks path before integration');
const indexLock=indexPath+'.lock';
let lockFd=openSync(indexLock,'wx');
const lockIdentity=fstatSync(lockFd);
let mutated=false,published=false,committedHead;
const privateIndex=new URL(unit+'-private-index',import.meta.url);
try {
if(canonicalGit('symbolic-ref','HEAD').toString().trim()!==branch||canonicalGit('rev-parse','HEAD').toString().trim()!==initialHead)throw Error('Branch or HEAD changed before lock acquisition');
const originalIndex=readFileSync(indexPath), originalIndexSha=hash(originalIndex);
copyFileSync(indexPath,privateIndex,constants.COPYFILE_EXCL);
gitOptions={cwd:primary,maxBuffer:32*1024*1024,env:{...process.env,GIT_INDEX_FILE:privateIndex.pathname.replace(/^\/([A-Za-z]:)/,'$1')}};
if(git('diff','--cached','--name-only').toString().trim())throw Error('Primary index occupied');
const output=new URL(unit+'-overlay-main-integration.json',import.meta.url);
if(existsSync(output))throw Error('Preserve existing integration evidence');
const touched=[...new Set([...paths,...working])];
const status=git('status','--porcelain=v1','-z'),diff=git('diff','--binary');
const existingDirty=[...new Set([...git('diff','--name-only','-z').toString().split('\0'),...git('ls-files','--others','--exclude-standard','-z').toString().split('\0')].filter(Boolean))];
const expectedForeign={...baseline.priorReceiptExpected,...baseline.files};
const approvedHeads=new Set([baseline.head]);
for(const previousUnit of Object.keys(units)){
  const receipt=new URL(previousUnit+'-overlay-main-integration.json',import.meta.url);
  if(!existsSync(receipt))continue;
  const previous=JSON.parse(readFileSync(receipt,'utf8'));
  if(previous.source!==source||previous.combinedSnapshot!==manifest.snapshotId)throw Error('Incompatible prior receipt '+previousUnit);
  git('merge-base','--is-ancestor',previous.afterHead,initialHead);
  Object.assign(expectedForeign,previous.workingHashes);
  approvedHeads.add(previous.afterHead);
}
if(!approvedHeads.has(initialHead))throw Error('Unreviewed primary HEAD outside this integration chain');
for(const [path,expected]of Object.entries(expectedForeign))
  if(hash(readFileSync(join(primary,path)))!==expected)throw Error('Frozen foreign input drift '+path);
// Capture immutable approved preimages. Later reads cannot approve fresh edits.
const approvedPreimages=new Map();
for(const path of touched) {
  const target=join(primary,path);
  const bytes=existsSync(target)?readFileSync(target):null;
  if(baseline.files[path]) {
    if(bytes===null||hash(bytes)!==baseline.files[path])throw Error('Original foreign input drift '+path);
  } else if(existingDirty.includes(path))throw Error('Unexpected destination WIP '+path);
  else {
    const entry=git('ls-tree',initialHead,'--',path).toString();
    if(entry){if(bytes===null||!bytes.equals(git('show',initialHead+':'+path)))throw Error('Clean destination changed during preflight '+path);}
    else if(bytes!==null)throw Error('Unexpected existing destination '+path);
  }
  approvedPreimages.set(path,bytes);
}
const incoming=paths.map(path=>({path,blob:git('rev-parse',source+':'+path).toString().trim(),bytes:git('show',source+':'+path)}));
for(const {path}of incoming)if(!git('ls-tree',source,'--',path).toString().startsWith('100644 blob '))throw Error('Unexpected source file mode '+path);
for(const {path,bytes}of incoming)if(!path.startsWith('docs/')&&hash(bytes)!==nativeManifest.files[path])throw Error('Native source differs from tested checkpoint '+path);
const physical=new Map(incoming.map(({path,bytes})=>[path,bytes]));
for(const path of working){
  const bytes=readFileSync(join(combined,path));
  if(!manifest.files[path]||hash(bytes)!==manifest.files[path])throw Error('Combined working blob drift '+path);
  physical.set(path,bytes);
}
const beforeHead=initialHead;
const preserved=Object.fromEntries(existingDirty.filter(path=>!touched.includes(path)).map(path=>[path,hash(readFileSync(join(primary,path)))]));
const backup=new URL(unit+'-overlay-backup/',import.meta.url);
if(existsSync(backup))throw Error('Existing backup indicates interrupted integration; inspect before recovery');
mkdirSync(backup);
const previous={};
for(const path of touched){
  const target=join(primary,path);
  const bytes=approvedPreimages.get(path);
  if(bytes===null){if(existsSync(target))throw Error('New target appeared before backup '+path);previous[path]=null;continue;}
  if(!existsSync(target)||!readFileSync(target).equals(bytes))throw Error('Working preimage changed before backup '+path);
  previous[path]=hash(bytes);
  const dest=new URL(path,backup);mkdirSync(dirname(dest.pathname.replace(/^\/([A-Za-z]:)/,'$1')),{recursive:true});writeFileSync(dest,bytes);
}
const evidence={unit,source,beforeHead,branch,indexPath,originalIndexSha,privateIndex:privateIndex.href,combinedSnapshot:manifest.snapshotId,combinedManifestSha256:hash(manifestBytes),validationRecordSha256:hash(readFileSync(new URL('validated-readiness-checkpoints.json',import.meta.url))),paths,working,previous,preserved,statusBeforeSha:hash(status),diffBeforeSha:hash(diff),cleanBlobs:Object.fromEntries(incoming.map(({path,blob})=>[path,blob])),workingHashes:Object.fromEntries([...physical].map(([path,bytes])=>[path,hash(bytes)])),scope:'Only clean native blobs are committed through an isolated index while holding the canonical index lock. Reviewed foreign-preserving composition is written solely to the working tree; additional combined tests stay untracked.'};
writeFileSync(new URL(unit+'-overlay-main-before.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
// Stage exact reviewed native Git objects, never the foreign working contents.
for(const {path,blob}of incoming)git('update-index','--add','--cacheinfo','100644',blob,path);
const staged=git('diff','--cached','--name-only').toString().trim().split('\n').filter(Boolean);
if(staged.some(path=>!paths.includes(path)))throw Error('Unexpected staged path');
for(const {path,bytes}of incoming)if(!git('show',':'+path).equals(bytes))throw Error('Index differs from native blob '+path);
const expectedTree=git('write-tree').toString().trim();
const expectedChangedPaths=git('diff-tree','--no-commit-id','--name-only','-r',beforeHead,expectedTree).toString();
for(const [path,bytes]of physical){
  const target=join(primary,path);
  if(previous[path]===null?existsSync(target):!existsSync(target)||hash(readFileSync(target))!==previous[path])throw Error('Working preimage changed before write '+path);
  mutated=true;mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
}
if(git('rev-parse','HEAD').toString().trim()!==beforeHead||git('symbolic-ref','HEAD').toString().trim()!==branch)throw Error('HEAD moved before commit');
if(hash(readFileSync(indexPath))!==originalIndexSha)throw Error('Canonical index changed while locked');
if(git('write-tree').toString().trim()!==expectedTree)throw Error('Private index changed before commit');
for(const [path,sha]of Object.entries(preserved))if(hash(readFileSync(join(primary,path)))!==sha)throw Error('Unrelated WIP changed before commit '+path);
git('commit','-m',message);
const afterHead=git('rev-parse','HEAD').toString().trim();
committedHead=afterHead;
if(git('rev-list','--parents','-n','1',afterHead).toString().trim()!==afterHead+' '+beforeHead)throw Error('Unexpected commit parent');
if(git('rev-parse',afterHead+'^{tree}').toString().trim()!==expectedTree)throw Error('Unexpected committed tree');
if(git('diff-tree','--no-commit-id','--name-only','-r',beforeHead,afterHead).toString()!==expectedChangedPaths)throw Error('Unexpected committed paths');
for(const {path,bytes}of incoming)if(!git('show','HEAD:'+path).equals(bytes))throw Error('Committed foreign content '+path);
for(const [path,bytes]of physical)if(!readFileSync(join(primary,path)).equals(bytes))throw Error('Working output mismatch '+path);
for(const [path,sha]of Object.entries(preserved))if(hash(readFileSync(join(primary,path)))!==sha)throw Error('Unrelated WIP changed '+path);
if(git('diff','--cached','--name-only').toString().trim())throw Error('Index not clean after commit');
if(git('rev-parse','HEAD').toString().trim()!==afterHead||git('symbolic-ref','HEAD').toString().trim()!==branch||hash(readFileSync(indexPath))!==originalIndexSha)throw Error('Repository state changed before index publication');
const currentLock=statSync(indexLock);
if(currentLock.ino!==lockIdentity.ino||currentLock.dev!==lockIdentity.dev)throw Error('Canonical lock ownership changed');
ftruncateSync(lockFd,0);writeFileSync(lockFd,readFileSync(privateIndex));closeSync(lockFd);lockFd=undefined;
renameSync(indexLock,indexPath);published=true;
if(canonicalGit('diff','--cached','--name-only').toString().trim())throw Error('Published index is not clean');
const result={...evidence,afterHead,expectedTree,expectedChangedPaths:expectedChangedPaths.trim().split('\n').filter(Boolean),atUTC:new Date().toISOString(),unrelatedDirtyFilesUnchanged:Object.keys(preserved).length,workingStatusAfter:canonicalGit('status','--porcelain=v1').toString()};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({unit,beforeHead,afterHead,cleanPaths:paths.length,workingOverlayPaths:working.length,unrelatedDirtyFilesUnchanged:result.unrelatedDirtyFilesUnchanged}));
} catch(error) {
  writeFileSync(new URL(unit+'-overlay-recovery.json',import.meta.url),JSON.stringify({atUTC:new Date().toISOString(),unit,mutated,published,committedHead,indexPath,indexLock,privateIndex:privateIndex.href,error:String(error)},null,2)+'\n');
  throw error;
} finally {
  if(lockFd!==undefined)closeSync(lockFd);
  if(!published&&!mutated&&existsSync(indexLock)){
    const current=statSync(indexLock);
    if(current.ino===lockIdentity.ino&&current.dev===lockIdentity.dev)unlinkSync(indexLock);
  }
}
