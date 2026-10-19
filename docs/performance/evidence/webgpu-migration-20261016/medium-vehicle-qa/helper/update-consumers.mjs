import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';
const own=path.dirname(fileURLToPath(import.meta.url)),out=path.join(own,'candidate');
function update(n,fn){const file=path.join(out,n),before=fs.readFileSync(file,'utf8'),after=fn(before);if(before===after)throw Error('no changes '+n);fs.writeFileSync(file,after);}
update('tests/game-low-vehicle-preparation.test.ts',s=>s
 .replace('import { MANUAL_HARDWARE_SCALING }','import { AdaptiveQualityController } from "../client/adaptive-quality";\nimport { MANUAL_HARDWARE_SCALING, isRenderQualityMode }')
 .replace('      "prepareLighting",','      "setQuality",\n      "applyAdaptiveQuality",\n      "prepareLighting",').replace('assert.equal(methods.length, 4);','assert.equal(methods.length, 6);')
 .replace('MANUAL_HARDWARE_SCALING,arePreparationEffectsReady','MANUAL_HARDWARE_SCALING,isRenderQualityMode,arePreparationEffectsReady')
 .replace('    MANUAL_HARDWARE_SCALING,\n    arePreparationEffectsReady','    MANUAL_HARDWARE_SCALING,\n    isRenderQualityMode,\n    arePreparationEffectsReady')
 .replace('prepares two car variants before original13','prepares three bounded car requests before original13')
 .replace('["vehicle-0", "vehicle-1", ...originalStages]','["vehicle-0", "vehicle-1", "vehicle-2", ...originalStages]')
 .replace('test("medium WebGPU and low WebGL retain original13/9 without leasing vehicle roots"','test("WebGL retains original9 without leasing vehicle roots"')
 .replace('    ["medium", true, 13],\n','')
 .replace('    19,\n    "19 named','    20,\n    "20 named')
 .replaceAll('all41','all48').replace('result.stages.length,41','result.stages.length,48')
 .replace('[["low",15],["high",13],["medium",13]]','[["low",16],["high",16],["medium",16]]')
 .replace('assert.ok(result.stages[0].restartReasons.grassResources>=1)','assert.ok(result.stages.find((stage:any)=>stage.stage==="current-off")!.restartReasons.grassResources>=1)')
 .replace('const f = fixture(t, "medium"); let changed = false;','const f = fixture(t, "medium"); let changed = false;\n  f.game.adaptive = new AdaptiveQualityController({ mode: "medium" });')
 .replace('changed = true; f.requested.quality = "high";','changed = true;\n      assert.equal(f.game.preparingRenderQuality, true);\n      f.game.setQuality("high");\n      assert.equal(f.game.adaptive.state.quality, "high");\n      assert.equal(f.game.quality, "medium", "request is deferred during temporary quality pass");'));
update('tests/game-light-preparation.test.ts',s=>s
 .replace('import { PlayerFlashlight }','import { TransformNode } from "@babylonjs/core/Meshes/transformNode";\nimport { VehicleLighting } from "../client/vehicle-lighting";\nimport { PlayerFlashlight }')
 .replace('  const game = Object.assign(new Game(), {','  const car = new TransformNode("preparation car", scene), parkedCar = new TransformNode("preparation parked", scene);\n  car.setEnabled(false);\n  const vehicleLighting = new VehicleLighting(scene);\n  const game = Object.assign(new Game(), {\n    car, parkedCar, vehicleLighting,')
 .replace('    game.flashlight?.dispose();','    game.flashlight?.dispose();\n    vehicleLighting.dispose();')
 .replace('assert.equal(result.stages.length, 13);','assert.equal(result.stages.length, 16);'));
update('tests/game-authored-light-preparation.test.ts',s=>s
 .replaceAll('row.preparation.stages.length,41','row.preparation.stages.length,48')
 .replaceAll('row.stages.length,41','row.stages.length,48')
 .replace('s.quality==="low"&&s.label.startsWith("vehicle-")','s.label.startsWith("vehicle-")')
 .replace('result.stages.length,webgpu?15:9','result.stages.length,webgpu?16:9'));
console.log('existing consumers updated for bounded native matrix and valid visual roots');
