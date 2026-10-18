import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),qa=resolve(root,'../inactive-light-defines-qa-20261018'),candidate=resolve(root,'candidate');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const input=JSON.parse(readFileSync(resolve(root,'source-manifest.json'))),transfer=JSON.parse(readFileSync(resolve(root,'transfer.json')));
assert.equal(hash(input.dependencyManifest),input.dependencyManifestSha);const qaManifest=JSON.parse(readFileSync(input.dependencyManifest));
for(const[path,sha]of Object.entries(input.sources)){assert.equal(hash(resolve(wt,path)),sha);assert.equal(hash(resolve(candidate,path)),sha);}
for(const path of ['patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml'])assert.equal(hash(resolve(wt,path)),qaManifest.sources[path].sha256);
const helper=resolve(input.dependencyRoot,'@babylonjs/core/Materials/materialHelper.functions.js');assert.equal(hash(helper),qaManifest.patch.helperAfterSha);
const require=createRequire(resolve(candidate,'package.json')),ts=require('typescript');
function assertions(path,excludeQa=false){const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true),out=[];
 const shape=n=>{if(ts.isParenthesizedExpression(n))return shape(n.expression);const children=[];ts.forEachChild(n,c=>{children.push(shape(c));});return[ts.SyntaxKind[n.kind],ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNumericLiteral(n)?n.text:null,children];};
 function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(source)==='assert'){const raw=n.getText(source);if(!(excludeQa&&raw.includes('core.includes(')))out.push(shape(n));}ts.forEachChild(n,visit);}visit(source);return out;}
const assertionCounts={};for(const file of ['inactive-light-defines-helper.test.ts','inactive-light-defines-history.test.ts']){const old=assertions(resolve(qa,'candidate/tests',file),true),current=assertions(resolve(wt,'tests',file));assert.deepEqual(current,old,'preserved assertion AST '+file);assertionCounts[file]=current.length;}
const changedFiles=transfer.scope.map(path=>({path,inputSha256:transfer.before[path],sha256:hash(resolve(wt,path)),bytes:readFileSync(resolve(wt,path)).length}));
const tracked=spawnSync('git',['diff','--','patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml'],{cwd:wt,encoding:'utf8'});assert.equal(tracked.status,0);let diff=tracked.stdout;
for(const path of transfer.scope.filter(p=>p.startsWith('tests/'))){const lines=readFileSync(resolve(wt,path),'utf8').trimEnd().split(/\r?\n/);diff+=`diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';}writeFileSync(resolve(root,'owned.diff'),diff);
const artifacts=Object.fromEntries(readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile()&&e.name!=='manifest.json').map(e=>[e.name,hash(resolve(root,e.name))]));
const handoff=resolve(wt,'docs/agents/handoffs/webgpu-inactive-light-defines-20261018.md');
const result={schemaVersion:1,frozenAt:new Date().toISOString(),task:'webgpu-inactive-light-defines-20261018',owner:'webgpu-inactive-light-native-01a14497',qaManifest:{path:input.dependencyManifest,sha256:input.dependencyManifestSha},dependencyRoot:input.dependencyRoot,helperSha256:hash(helper),sources:input.sources,changedFiles,assertionCounts,validation:{targeted:{tests:16,pass:16,fail:0,log:'targeted-tests.log'},scopedTypes:{files:3134,errors:0,log:'scoped-types.log'},gpu:false,fullSuite:false,build:false},artifacts,handoff:{path:handoff,sha256:hash(handoff)},limitations:['Native installed node_modules intentionally unchanged; validation uses frozen QA dependency root','Full native snapshot/tests/build/integration are coordinator-owned','Existing frozen draw/fallback/explicit Node limits retained; no whole migration acceptance claimed']};
writeFileSync(resolve(root,'manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({manifestSha:hash(resolve(root,'manifest.json')),changedFiles,assertionCounts,handoffSha:result.handoff.sha256},null,2));
