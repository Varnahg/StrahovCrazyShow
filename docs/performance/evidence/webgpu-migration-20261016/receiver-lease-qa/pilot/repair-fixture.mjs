import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,out=join(root,'candidate-v1'),path='tests/game-light-lifecycle.test.ts',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(join(out,'source-manifest.json'))),bytes=readFileSync(join(out,path));assert.equal(hash(bytes),manifest.files[path]);
writeFileSync(join(root,'source-manifest-before-fixture.json'),JSON.stringify(manifest,null,2)+'\n');
let text=bytes.toString(),newline=text.includes('\r\n')?'\r\n':'\n';text=text.replaceAll('\r\n','\n');
const changes=[
 ['  for (const call of calls) {','  let receiverGates = 0;\n  for (const call of calls) {'],
 ['    const budget = siblings[siblings.indexOf(statement) - 2];','    let budget = siblings[siblings.indexOf(statement) - 2];\n    let receiverGate: ts.Statement | undefined;\n    if (budget?.getText(source).startsWith("this.stableLights.markMeshesDirty(")) {\n      receiverGate = budget; receiverGates++;\n      assert.equal(receiverGate.getText(source), "this.stableLights.markMeshesDirty(this.receiverLeaseInputs?.prepareFrame(this.quality, this.preparingRenderQuality) ?? []);");\n      budget = siblings[siblings.indexOf(statement) - 3];\n    }'],
 ['`${budget.getText(source)}\\n${before.getText(source)}\\n${statement.getText(source)}`','`${budget.getText(source)}\\n${receiverGate?.getText(source) ?? ""}\\n${before.getText(source)}\\n${statement.getText(source)}`'],
 ['  assert.equal(ambient.intensity, 1);','  assert.equal(receiverGates, 1, "only interactive draw adds receiver gate; original global prewarm remains unchanged");\n  assert.equal(ambient.intensity, 1);']
];
for(const[before,after]of changes){assert.equal(text.split(before).length,2);text=text.replace(before,after);}
writeFileSync(join(out,path),text.replaceAll('\n',newline));
for(const[p,sha]of Object.entries(manifest.files))if(p!==path)assert.equal(hash(readFileSync(join(out,p))),sha,p);
manifest.files[path]=hash(readFileSync(join(out,path)));const before=manifest.snapshotId;manifest.snapshotId=hash(JSON.stringify(manifest.files));manifest.createdAt=new Date().toISOString();writeFileSync(join(out,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(root,'fixture-repair.json'),JSON.stringify({before,after:manifest.snapshotId,path,changes,reason:'Retain both exact production callsite checks and execute budget→receiver gate→stable→draw for the interactive site; the preload site retains budget→stable→draw. One original adjacent-statement assertion failed after intentional insertion; no runtime behavior was changed.'},null,2)+'\n');console.log(JSON.stringify({before,after:manifest.snapshotId}));
