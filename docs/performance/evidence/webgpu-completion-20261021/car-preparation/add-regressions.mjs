import fs from 'node:fs';
const cache='.cache/webgpu-completion-car-preparation-20261023/';
function update(file,edit){let text=fs.readFileSync(file,'utf8'),eol=text.includes('\r\n')?'\r\n':'\n';const once=(from,to)=>{from=from.replaceAll('\n',eol);to=to.replaceAll('\n',eol);if(text.split(from).length!==2)throw Error(file+' anchor count '+from.slice(0,90));text=text.replace(from,to);};edit(once,(value)=>{text+=eol+value.replace(/\r?\n/g,eol);});fs.writeFileSync(file,text);}
update('tests/game-low-vehicle-preparation.test.ts',(once,append)=>{
 once('import { Light } from "@babylonjs/core/Lights/light";','import { Light } from "@babylonjs/core/Lights/light";\nimport type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";');
 once('import { MANUAL_HARDWARE_SCALING } from "../shared/render-quality";','import { AdaptiveQualityController } from "../client/adaptive-quality";\nimport { MANUAL_HARDWARE_SCALING, isRenderQualityMode } from "../shared/render-quality";');
 once('      "prepareLighting",','      "setQuality",\n      "applyAdaptiveQuality",\n      "prepareLighting",');once('assert.equal(methods.length, 8);','assert.equal(methods.length, 10);');
 once('MANUAL_HARDWARE_SCALING,arePreparationEffectsReady','MANUAL_HARDWARE_SCALING,isRenderQualityMode,arePreparationEffectsReady');
 once('  withGrass = false,\n) {','  withGrass = false,\n  previewAnchor = anchor,\n) {\n  const selectAt = (mode: Parameters<typeof selectLightingPreview>[0]) => selectLightingPreview(mode, previewAnchor);');
 once('      shadow: boolean;','      shadow: boolean;\n      shadowMapSize?: number;\n      nonStreet: number;');
 once('    MANUAL_HARDWARE_SCALING,\n    arePreparationEffectsReady:','    MANUAL_HARDWARE_SCALING,\n    isRenderQualityMode,\n    arePreparationEffectsReady:');once('    selectLightingPreview: select,','    selectLightingPreview: selectAt,');once('    timeOverride: select("night").instant,','    timeOverride: selectAt("night").instant,');
 once('        shadow: beam.light.shadowEnabled,','        shadow: beam.light.shadowEnabled,\n        shadowMapSize: (beam.light.getShadowGenerator() as ShadowGenerator | null)?.mapSize,\n        nonStreet: scene.lights.filter(light => light.isEnabled() && !streets.includes(light as PointLight)).length,');
 const reference=fs.readFileSync(cache+'reference/tests/game-low-vehicle-preparation.test.ts','utf8');const start=reference.indexOf('for (const quality of ["medium", "high"] as const)\n')>=0?reference.indexOf('for (const quality of ["medium", "high"] as const)\n'):reference.indexOf('for (const quality of ["medium", "high"] as const)\r\n');if(start<0)throw Error('new actual tests anchor');append(reference.slice(start));
});
update('tests/render-quality-preparation.test.ts',(_once,append)=>{const reference=fs.readFileSync(cache+'reference/tests/render-quality-preparation.test.ts','utf8'),start=reference.indexOf('test("a late requested quality'),end=reference.indexOf('function result(');if(start<0||end<start)throw Error('tail test anchors');append(reference.slice(start,end));});
console.log('Added current Game/VehicleLighting and late-request regressions; production unchanged.');
