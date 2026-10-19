import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const own=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(own,'../webgpu-garment-init-qa-20261019/snapshot'),out=path.join(own,'candidate'),changes={};
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const file of ['client/game.ts','client/light-preparation.ts']){
 const before=fs.readFileSync(path.join(base,file),'utf8');let after=before.replaceAll('includeLowVehicleVariants','includeVehicleVariants');
 if(file.endsWith('/game.ts'))after=after.replace('const includeVehicleVariants = this.engine.isWebGPU && this.quality === "low";','const includeVehicleVariants = this.engine.isWebGPU;');
 else after=after.replace('`vehicle-${0 | 1}`','`vehicle-${0 | 1 | 2}`').replace('/** Real low-quality vehicle SPOT, without its shadow, before player variants. */','/** Real vehicle SPOT and quality-specific shadow, with up to two mapped POINTs. */').replace('["vehicle-0", "vehicle-1", ...playerStages]','["vehicle-0", "vehicle-1", "vehicle-2", ...playerStages]');
 fs.mkdirSync(path.join(own,'preimages'),{recursive:true});fs.writeFileSync(path.join(own,'preimages',path.basename(file)),before);fs.writeFileSync(path.join(out,file),after);changes[file]={before:sha(before),after:sha(after)};
}
fs.writeFileSync(path.join(own,'initial-runtime.json'),JSON.stringify(changes,null,2));console.log(JSON.stringify(changes));
