/** Read-only source12 JS overlay at installed module identities, CPU tests only. */
import {registerHooks} from 'node:module';import fs from 'node:fs';import {dirname,resolve,relative,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../..'),fresh=join(root,'.cache/performance-snapshot/webgpu-completion-20261023-candidate-12/node_modules/@babylonjs/core');
const core=dirname(fileURLToPath(import.meta.resolve('@babylonjs/core/scene.js'))),prefix=pathToFileURL(core+'/').href,label=new URL(import.meta.url).searchParams.get('label');
if(!/^[a-z0-9-]{1,32}$/.test(label??''))throw Error('Expected proof label');
const sha=b=>createHash('sha256').update(b).digest('hex'),loaded=new Map();
if(JSON.parse(fs.readFileSync(join(fresh,'package.json'))).version!=='9.30.0')throw Error('Unexpected pin');
registerHooks({load(url,context,next){if(url.startsWith(prefix)&&url.endsWith('.js')){const name=relative(core,fileURLToPath(url)),bytes=fs.readFileSync(join(fresh,name));if(!loaded.has(name))loaded.set(name,sha(bytes));return{format:'module',source:bytes.toString(),shortCircuit:true};}return next(url,context);}});
process.on('exit',()=>{const before=Object.fromEntries([...loaded].sort()),after=Object.fromEntries(Object.keys(before).map(f=>[f,sha(fs.readFileSync(join(fresh,f)))]));fs.writeFileSync(join(dir,'native-'+label+'-'+process.pid+'.json'),JSON.stringify({source:fresh,before,after,stable:JSON.stringify(before)===JSON.stringify(after)},null,2)+'\n');});
