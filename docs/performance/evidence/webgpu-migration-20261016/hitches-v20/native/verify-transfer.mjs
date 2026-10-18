import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from '../define-order-qa-20261018/dependencies/node_modules/typescript/lib/typescript.js';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),qa=resolve(root,'../define-order-qa-20261018'),transfer=JSON.parse(fs.readFileSync(resolve(root,'transfer.json'))),hash=b=>createHash('sha256').update(b).digest('hex');
const blob=fs.readFileSync(resolve(wt,transfer.baseline.path)),raw=gunzipSync(blob,{maxOutputLength:transfer.baseline.uncompressedBytes});assert.equal(raw.length,transfer.baseline.uncompressedBytes);assert.equal(hash(raw),transfer.baseline.uncompressedSha256);assert.ok(raw.equals(fs.readFileSync(resolve(qa,transfer.baseline.sourceQaPath))));assert.throws(()=>gunzipSync(blob,{maxOutputLength:raw.length-1}),{code:'ERR_BUFFER_TOO_LARGE'});
function assertions(text){const file=ts.createSourceFile('test.ts',text,ts.ScriptTarget.Latest,true),result=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(file).startsWith('assert.'))result.push(n.getText(file));ts.forEachChild(n,visit);}visit(file);return result;}
const tests={};for(const p of ['tests/material-defines-serialization.test.ts','tests/material-defines-wgsl-order.test.ts']){const before=assertions(fs.readFileSync(resolve(qa,'candidate',p),'utf8')),after=assertions(fs.readFileSync(resolve(wt,p),'utf8'));let at=0;for(const assertion of after)if(assertion===before[at])at++;assert.equal(at,before.length,'all original assertions preserved '+p);assert.equal(after.length-before.length,p.includes('wgsl-order')?2:0);tests[p]={originalAssertions:before.length,nativeAssertions:after.length,allOriginalPreserved:true};}
const scenario='tests/fixtures/material-defines-order/scenario.ts';assert.equal(hash(fs.readFileSync(resolve(wt,scenario))),hash(fs.readFileSync(resolve(qa,'candidate',scenario))));
for(const[p,s]of Object.entries(transfer.files))assert.equal(hash(fs.readFileSync(resolve(wt,p))),s.sha256);
for(const[p,s]of Object.entries(transfer.protectedFiles))assert.equal(fs.existsSync(resolve(wt,p))?hash(fs.readFileSync(resolve(wt,p))):null,s);
const result={passed:true,baseline:{...transfer.baseline,roundtripExact:true,outputLimitRejects:true},tests,scenarioByteIdentical:true,protectedFilesUnchanged:true};fs.writeFileSync(resolve(root,'transfer-integrity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
