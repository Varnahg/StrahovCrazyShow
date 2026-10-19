import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{dirname,join}from'node:path';import{fileURLToPath}from'node:url';const root=dirname(fileURLToPath(import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const first=fs.readFileSync(join(root,'variants/F1/Materials/materialDefines.js'),'utf8');assert.equal(sha(first),'e4f6ef0b87f24c9c482705ed1dab46b4853ededb3eb97e040e66c7dab258c3e0');let after=first;
function once(a,b){assert.equal(after.split(a).length,2,a);after=after.replace(a,b);}
once('var defineSchemaReady = false;','var defineSchemaReady = false;\n'+fs.readFileSync(join(root,'shared-runtime.txt'),'utf8'));
once('        const schema = cacheable && defineSchemaReady ?', '        let schema = cacheable && defineSchemaReady ?');
once('        if (matches && count !== schema.names.length) matches = false;',`        if (matches && count !== schema.names.length) matches = false;
        let sharedPointer = false;
        if (cacheable && defineSchemaReady && !matches && count <= SCHEMA_MAX_NAMES) {
            const shared = findInternedDefineSchema(count, names, schema?.names);
            if (shared) { schema = shared; matches = true; sharedPointer = true; }
        }`);
once('            return result;\n        }\n        let raw = "";', '            if (sharedPointer) defineSchemas.set(this, schema);\n            return result;\n        }\n        let raw = "";');
once('        const result = canonicalResult(raw);','        const result = canonicalResult(raw);\n        if (sharedPointer) defineSchemas.set(this, schema);');
once('defineSchemas.set(this, Object.freeze({ names: Object.freeze(observed), order: Object.freeze(order), validNames: true }));','defineSchemas.set(this, internDefineSchema(observed, order, units));');
assert.equal(after.slice(after.indexOf('function canonicalResult(')),first.slice(first.indexOf('function canonicalResult(')));
fs.mkdirSync(join(root,'candidate/Materials'),{recursive:true});fs.writeFileSync(join(root,'candidate/Materials/materialDefines.js'),after,{flag:'wx'});
fs.writeFileSync(join(root,'f2-input.json'),JSON.stringify({beforeSha256:sha(first),afterSha256:sha(after),canonicalizerUnchanged:true,scope:'One copied F2 module over frozenF1; immutable full observed names shared metadata only, no constructor/key reads added.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({before:sha(first),after:sha(after)}));
