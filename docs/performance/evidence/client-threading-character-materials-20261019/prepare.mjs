import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,realpathSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';

const root=import.meta.dirname, repository=resolve(root,'../..');
const donor=resolve(repository,'.cache/client-threading-lab-20261019/snapshot');
const original=JSON.parse(readFileSync(join(donor,'source-manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(original.snapshotId,'65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60');
const main=execFileSync('git',['rev-parse','main'],{cwd:repository,encoding:'utf8'}).trim();
const roots=['.gitattributes','.github','.gitignore','AGENTS.md','README.cs.md','README.md','client','index.html','package.json','patches','pnpm-lock.yaml','pnpm-workspace.yaml','scripts','server','shared','tests','tsconfig.json','vite.config.ts'];
const overlays=['client/character-materials.ts','tests/character-material-init.test.ts'];
const result={createdUTC:new Date().toISOString(),main,combinedBase:original.snapshotId,overlays:{},snapshots:{}};
for(const p of overlays) result.overlays[p]=hash(readFileSync(join(repository,p)));
for(const kind of ['clean','combined']) {
  const destination=join(root,kind);assert(!existsSync(destination),'Preserve '+destination);mkdirSync(destination,{recursive:true});
  if(kind==='clean') {
    const archive=join(root,'clean-source.tar');
    execFileSync('git',['archive','--format=tar','--output='+archive,main,...roots],{cwd:repository});
    execFileSync('tar',['-xf',archive,'-C',destination]);
  } else {
    for(const [p,expected] of Object.entries(original.files)) {
      const bytes=readFileSync(join(donor,p));assert.equal(hash(bytes),expected,p);
      mkdirSync(dirname(join(destination,p)),{recursive:true});writeFileSync(join(destination,p),bytes);
    }
  }
  for(const p of overlays) {const bytes=readFileSync(join(repository,p));assert.equal(hash(bytes),result.overlays[p]);mkdirSync(dirname(join(destination,p)),{recursive:true});writeFileSync(join(destination,p),bytes);}
  const files={};
  const walk=(folder,relative='')=>{for(const entry of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const p=relative?relative+'/'+entry.name:entry.name;if(entry.isDirectory())walk(join(folder,entry.name),p);else files[p]=hash(readFileSync(join(folder,entry.name)));}};
  walk(destination);
  const sorted=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0));
  const snapshotId=hash(JSON.stringify(sorted));
  writeFileSync(join(destination,'source-manifest.json'),JSON.stringify({snapshotId,base:kind==='clean'?main:original.snapshotId,files:sorted},null,2)+'\n');
  for(const folder of ['assets','public','docs','node_modules']) {assert(!existsSync(join(destination,folder)));symlinkSync(realpathSync(join(donor,folder)),join(destination,folder),'junction');}
  // dist deliberately does NOT link to the played build: Vite owns a new output.
  result.snapshots[kind]={path:destination,source:snapshotId,sourceFiles:Object.keys(sorted).length,readonlyDependencies:realpathSync(join(destination,'node_modules'))};
}
mkdirSync(join(root,'logs'),{recursive:true});mkdirSync(join(root,'tmp'),{recursive:true});
writeFileSync(join(root,'validation-manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
