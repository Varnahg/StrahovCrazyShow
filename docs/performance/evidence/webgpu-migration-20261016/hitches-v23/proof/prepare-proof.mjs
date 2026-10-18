import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),deps=resolve(root,'../define-order-qa-20261018/dependencies/node_modules'),warm=resolve(root,'../material-switch-cost-proof-20261018');
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=fs.readFileSync(resolve(deps,'@babylonjs/core/Materials/materialDefines.js'),'utf8');
assert.equal(hash(original),'43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4');
assert.equal(hash(fs.readFileSync(resolve(warm,'manifest-v2.json'))),'7a25099dad279c07ef5cf203004802438fe657db392bb209a7dc1a91ec1dda23');
const replace=(source,from,to)=>{assert.equal(source.split(from).length,2,from);return source.replace(from,()=>to);};
let lines=replace(original,'    const records = [];\n','');
lines=replace(lines,'        records.push({ name, line });\n','');
lines=replace(lines,'    records.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);\n    return records.map(record => record.line).join(\'\\n\') + \'\\n\';','    return lines.sort().join(\'\\n\') + \'\\n\';');
let indexed=replace(lines,'        const match = linePattern.exec(line);\n        if (!match)\n            return text;\n        const [, name, value] = match;',`        if (!linePattern.test(line))
            return text;
        const valueAt = line.indexOf(' ', 8);
        const name = valueAt === -1 ? line.slice(8) : line.slice(8, valueAt);
        const value = valueAt === -1 ? undefined : line.slice(valueAt + 1);`);
const variants={records:original,lines,indexed};
fs.mkdirSync(resolve(root,'variants'),{recursive:true});
const records={};
for(const [name,source] of Object.entries(variants)){
  const classEnd=source.indexOf('// Project QA:'); assert.equal(source.slice(0,classEnd),original.slice(0,original.indexOf('// Project QA:')),'class/read loop unchanged');
  fs.writeFileSync(resolve(root,'variants',name+'.js'),source,{flag:'wx'});
  const raw=replace(source,'return canonicalResult(result);','return result;');
  const rawClass=raw.slice(0,raw.indexOf('// Project QA:')).replace('export class MaterialDefines','class RawMaterialDefines');
  fs.writeFileSync(resolve(root,'variants',name+'-harness.mjs'),source+'\n'+rawClass+'\nexport { canonicalResult, RawMaterialDefines };\n',{flag:'wx'});
  records[name]={runtimeSha256:hash(source),harnessSha256:hash(source+'\n'+rawClass+'\nexport { canonicalResult, RawMaterialDefines };\n')};
}
const report=JSON.parse(fs.readFileSync(resolve(warm,'report-run-07.json'))),blocks=[];
for(const row of report.cases.filter(row=>!row.fail))for(const state of ['off','on','changed'])blocks.push({kind:row.kind,state,values:row.variantSnapshots[state].values,expected:row.variantSnapshots[state].defines});
fs.writeFileSync(resolve(root,'actual-blocks.json'),JSON.stringify({source:resolve(warm,'report-run-07.json'),sourceSha256:hash(fs.readFileSync(resolve(warm,'report-run-07.json'))),blocks},null,2)+'\n',{flag:'wx'});
fs.writeFileSync(resolve(root,'package.json'),'{"type":"module"}\n',{flag:'wx'});
fs.symlinkSync(deps,resolve(root,'node_modules'),'junction');
fs.writeFileSync(resolve(root,'proof-inputs.json'),JSON.stringify({createdAt:new Date().toISOString(),deps,originalSha256:hash(original),variants:records,blocks:blocks.length,warmManifestSha256:hash(fs.readFileSync(resolve(warm,'manifest-v2.json')))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({variants:records,blocks:blocks.length}));
