import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,out=join(root,'candidate-v1'),helper=join(root,'../webgpu-receiver-lease-helper-20261019'),hash=b=>createHash('sha256').update(b).digest('hex');
const hb=readFileSync(join(helper,'manifest.json')),hm=JSON.parse(hb),seed=JSON.parse(readFileSync(join(root,'seed-manifest.json'))),patches=[];
// Frozen helper payloads and its current test fixture must be identified by SHA.
function verifiedCopy(p){const b=readFileSync(join(helper,p));const sha=hm.files?.[p]??hm.artifacts?.[p];assert.ok(sha,'Missing frozen payload '+p);assert.equal(hash(b),typeof sha==='string'?sha:sha.sha256,p);mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);}
for(const p of ['client/qa-receiver-lease.ts','client/qa-stable-light-state.ts','tests/fixture.ts','tests/qa-receiver-lease.test.ts'])verifiedCopy(p);
function patch(p,before,after){const b=readFileSync(join(out,p));let t=b.toString();const newline=t.includes('\r\n')?'\r\n':'\n';t=t.replaceAll('\r\n','\n');assert.equal(t.split(before).length,2,p+' unique');const changed=t.replace(before,after);assert.equal(hash(Buffer.from(t.replaceAll('\n',newline))),hash(b),p+' original newline');assert.equal(changed.split(after).length,2);assert.equal(changed.replace(after,before),t,p+' exact inverse');writeFileSync(join(out,p),changed.replaceAll('\n',newline));patches.push({path:p,before,after});}
for(const p of ['client/game.ts','client/vehicle-lighting.ts'])assert.equal(hash(readFileSync(join(out,p))),seed.files[p],p+' exact accepted native');
patch('client/vehicle-lighting.ts','import { SpotLight }','import { CarReceiverLeaseLight } from "./qa-receiver-lease";\nimport { SpotLight }');
patch('client/vehicle-lighting.ts','    this.light = new SpotLight(','    const BeamLight = kind === "vehicle" && scene.getEngine().isWebGPU ? CarReceiverLeaseLight : SpotLight;\n    this.light = new BeamLight(');
patch('client/vehicle-lighting.ts','      localFlashlight: kind === "player",\n    };','      localFlashlight: kind === "player",\n    };\n    if (this.light instanceof CarReceiverLeaseLight) {\n      this.light.configureStockVehicleLease({ kind: "vehicle", range: 32, movementReserveMetres: 8 });\n    }');
patch('client/game.ts','import { AuthoredLightPreparation }','import { ReceiverLeaseInputs } from "./qa-receiver-lease-inputs";\nimport { AuthoredLightPreparation }');
patch('client/game.ts','  private readonly stableLights: StableLightState;','  private readonly stableLights: StableLightState;\n  private receiverLeaseInputs?: ReceiverLeaseInputs;');
patch('client/game.ts','    this.canvas.dataset.renderHealth = "ready";','    // Copied QA: retain the complete original preparation, then build static\n    // bounds before announcing ready. No range policy ran during prewarm.\n    this.receiverLeaseInputs = ReceiverLeaseInputs.create(this.scene, this.vehicleLighting?.light, this.gltfLightBudget);\n    this.receiverLeaseInputs?.prepareFrame(this.quality);\n    this.canvas.dataset.renderHealth = "ready";');
patch('client/game.ts','    this.gltfLightBudget.prepareFrame();\n    this.stableLights.update();\n    this.scene.render();','    this.gltfLightBudget.prepareFrame();\n    this.stableLights.markMeshesDirty(this.receiverLeaseInputs?.prepareFrame(this.quality, this.preparingRenderQuality) ?? []);\n    this.stableLights.update();\n    this.scene.render();');
patch('client/game.ts','        const healthAtEnd = this.renderHealth.snapshot();','        // One bounded existing-recorder event answers whether the production\n        // candidate actually reduced membership work; no per-frame log layer.\n        if (this.receiverLeaseInputs) sessionDiagnostics.event("receiver-lease-summary", this.receiverLeaseInputs.snapshot());\n        const healthAtEnd = this.renderHealth.snapshot();');
patch('client/game.ts','    this.vehicleLighting?.dispose();','    this.receiverLeaseInputs?.dispose();\n    this.receiverLeaseInputs = undefined;\n    this.vehicleLighting?.dispose();');
patch('tests/game-webgpu-startup.test.ts','import { RenderHealth }','import { ReceiverLeaseInputs } from "../client/qa-receiver-lease-inputs";\nimport { RenderHealth }');
patch('tests/game-webgpu-startup.test.ts','arePreparationEffectsReady } = env;','arePreparationEffectsReady, ReceiverLeaseInputs } = env;');
patch('tests/game-webgpu-startup.test.ts','    arePreparationEffectsReady,\n    exports: {},','    arePreparationEffectsReady,\n    ReceiverLeaseInputs,\n    exports: {},');
const startupTest='tests/game-webgpu-startup.test.ts';
writeFileSync(join(out,startupTest),Buffer.concat([readFileSync(join(out,startupTest)),Buffer.from(`\n\ntest("actual Game initializes receiver policy only after full preparation and submitted-frame gate", async t => {
  const f=fixture(t), original=ReceiverLeaseInputs.create;let calls=0;
  t.mock.method(ReceiverLeaseInputs,"create",(...args:Parameters<typeof ReceiverLeaseInputs.create>)=>{
    calls++;assert.equal(f.game.ready,false);assert.equal(f.stats().gateCalls,1);
    assert.equal(f.pipelineScopes[0].disposed,1);return original(...args);
  });
  const start=f.game.start();await settle();assert.equal(calls,0);
  f.gate.resolve();await start;assert.equal(calls,1);assert.equal(f.game.ready,true);
});\n`)]));
mkdirSync(join(out,'qa-provenance/receiver-lease'),{recursive:true});writeFileSync(join(out,'qa-provenance/receiver-lease/helper-manifest.json'),hb);writeFileSync(join(out,'qa-provenance/receiver-lease/integration-patches.json'),JSON.stringify(patches,null,2)+'\n');
const files={...seed.files};
for(const p of ['client/game.ts','client/vehicle-lighting.ts','client/stable-light-state.ts','client/qa-receiver-lease.ts','client/qa-stable-light-state.ts','client/qa-receiver-lease-inputs.ts','tests/stable-light-state.test.ts','tests/fixture.ts','tests/qa-receiver-lease.test.ts','tests/qa-receiver-lease-inputs.test.ts','tests/game-webgpu-startup.test.ts','qa-provenance/receiver-lease/ordering.json','qa-provenance/receiver-lease/helper-manifest.json','qa-provenance/receiver-lease/integration-patches.json'])files[p]=hash(readFileSync(join(out,p)));
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({...seed,snapshotId,createdAt:new Date().toISOString(),files},null,2)+'\n');writeFileSync(join(root,'assembly.json'),JSON.stringify({snapshotId,base:seed.snapshotId,files:Object.keys(files).length,helperManifestSha256:hash(hb),scope:'Private current native QA; car only, policy after full original prewarm, explicit material/light/loader/cap inputs. No memo or production patch/lock mutation.'},null,2)+'\n');console.log(JSON.stringify({snapshotId,files:Object.keys(files).length}));
