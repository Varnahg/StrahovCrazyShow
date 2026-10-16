import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),target=join(import.meta.dirname,'combined-v3');
const before=join(import.meta.dirname,'native-v9'),previous=join(import.meta.dirname,'combined-v2'),next=join(import.meta.dirname,'native-v10');
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=dir=>JSON.parse(readFileSync(join(dir,'source-manifest.json'),'utf8'));
const oldNative=manifest(before),oldCombined=manifest(previous),newNative=manifest(next);
if(oldCombined.snapshotId!=='2bcde7501b39bc1dbd5ba21fb7f949f00dbb549d235ac9739675c2b662ccc65e'||newNative.snapshotId!=='79d55c7b29685b41f5d02afc6afe8be6d0f0dfe15adbf88fa3fad56480b5fbe7')throw Error('Unexpected source checkpoints');
if(existsSync(join(target,'source-manifest.json'))||existsSync(join(target,'source-composition.json')))throw Error('Preserve frozen composition');
const sourcePath=p=>['client/','server/','shared/','scripts/','tests/','patches/'].some(prefix=>p.startsWith(prefix));
for(const [p,sha]of Object.entries(newNative.files).filter(([p])=>sourcePath(p)))if(hash(readFileSync(join(target,p)))!==sha)throw Error('Expanded native base mismatch '+p);
const overlays=[];
// Compute all results before publishing any working overlays.
for(const [p,sha]of Object.entries(oldCombined.files).filter(([p,sha])=>sourcePath(p)&&sha!==oldNative.files[p])){
  const oldBytes=readFileSync(join(previous,p));
  if(hash(oldBytes)!==sha)throw Error('Frozen working input drift '+p);
  let bytes=oldBytes,method='unchanged-working-overlay';
  if(newNative.files[p]!==oldNative.files[p]){
    if(!oldNative.files[p]||!newNative.files[p])throw Error('Add/delete collision requires explicit review '+p);
    if(hash(readFileSync(join(before,p)))!==oldNative.files[p]||hash(readFileSync(join(next,p)))!==newNative.files[p])throw Error('Native merge input drift '+p);
    try{bytes=execFileSync('git',['merge-file','-p',join(previous,p),join(before,p),join(next,p)],{cwd:root,maxBuffer:32*1024*1024});}
    catch(error){if(error.stdout)writeFileSync(join(import.meta.dirname,'combined-v3-'+p.replaceAll('/','_')+'.conflict'),error.stdout);throw Error('Three-way conflict saved for '+p);}
    method='three-way-own-native-delta-over-reviewed-working-overlay';
  }
  overlays.push({path:p,previous:sha,nativeBefore:oldNative.files[p]??null,nativeAfter:newNative.files[p]??null,result:hash(bytes),method,bytes});
}
for(const entry of overlays){mkdirSync(dirname(join(target,entry.path)),{recursive:true});writeFileSync(join(target,entry.path),entry.bytes);delete entry.bytes;}
for(const name of ['public','assets','docs'])symlinkSync(join(root,name),join(target,name),'junction');
symlinkSync(join(import.meta.dirname,'dependencies-v5/node_modules'),join(target,'node_modules'),'junction');
writeFileSync(join(target,'source-commit.txt'),newNative.sourceCommit+'\n');
writeFileSync(join(target,'source-composition.json'),JSON.stringify({atUTC:new Date().toISOString(),kind:'combined-working-validation-not-clean-commit',nativeBaseCommit:newNative.sourceCommit,nativeBaseSnapshot:newNative.snapshotId,previousNativeSnapshot:oldNative.snapshotId,previousCombinedSnapshot:oldCombined.snapshotId,overlays,scope:'Fresh complete native-v10 base plus all reviewed prior working overlays; changed native files merge against exact native-v9 base. Frozen sources never edited.'},null,2)+'\n');
console.log(JSON.stringify({target,overlays:overlays.length,merged:overlays.filter(x=>x.method.startsWith('three-way')).map(x=>x.path)}));
