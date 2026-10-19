import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
const root=process.cwd(),out=path.join(root,'.cache/webgpu-schema-native-20261019');
const require=createRequire(path.join(root,'.cache/webgpu-serializer-schema-qa-20261019/candidate-v3/package.json'));
const cli=require.resolve('tsx/cli'),tsc=require.resolve('typescript/bin/tsc');
const files=['tests/material-defines-schema.test.ts','tests/material-defines-schema-shared.test.ts',...fs.readdirSync(path.join(root,'tests/fixtures/serializer-schema')).map(n=>'tests/fixtures/serializer-schema/'+n)];
const reports=[];
for(const [name,reference]of [['old','reference'],['new','candidate-v3']]){
 const cwd=path.join(out,name);fs.mkdirSync(cwd,{recursive:true});fs.writeFileSync(path.join(cwd,'package.json'),'{"type":"module"}\n');
 for(const file of files){const dest=path.join(cwd,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest);}
 const link=path.join(cwd,'node_modules');if(!fs.existsSync(link))fs.symlinkSync(path.join(root,'.cache/webgpu-serializer-schema-qa-20261019',reference,'node_modules'),link,'junction');
 for(const kind of ['test',...(name==='new'?['types']:[])]){
  const args=kind==='test'?[cli,'--test','tests/material-defines-schema.test.ts','tests/material-defines-schema-shared.test.ts']:[tsc,'--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','ESNext','--moduleResolution','Bundler','--allowImportingTsExtensions','--types','node','tests/material-defines-schema.test.ts','tests/material-defines-schema-shared.test.ts','tests/fixtures/serializer-schema/installed.ts'];
  const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',env:{...process.env,TSX_DISABLE_CACHE:'1'}});fs.writeFileSync(path.join(out,`${name}-${kind}.log`),r.stdout+r.stderr);
  reports.push({name,kind,exitCode:r.status,passed:Number(r.stdout.match(/ℹ pass (\d+)/)?.[1]??r.stdout.match(/# pass (\d+)/)?.[1]??0),failed:Number(r.stdout.match(/ℹ fail (\d+)/)?.[1]??r.stdout.match(/# fail (\d+)/)?.[1]??0)});
 }
}
fs.writeFileSync(path.join(out,'light-results.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
if(reports.find(r=>r.name==='new'&&r.exitCode!==0)||reports.find(r=>r.name==='old'&&r.exitCode===0))process.exitCode=1;
