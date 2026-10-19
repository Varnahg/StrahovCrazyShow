import fs from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';
const own=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(own,'../webgpu-garment-init-qa-20261019/snapshot'),out=path.join(own,'candidate');
const n='tests/game-low-vehicle-preparation.test.ts';let text=fs.readFileSync(path.join(base,n),'utf8');
function edit(a,b){if(text.split(a).length!==2)throw Error('test fixture boundary '+a);text=text.replace(a,b);}
edit('  withGrass = false,\n)','  withGrass = false,\n  previewAnchor = anchor,\n)');
edit('  const engine = new NullEngine();','  const selectAt = (mode: Parameters<typeof selectLightingPreview>[0]) => selectLightingPreview(mode, previewAnchor);\n  const engine = new NullEngine();');
edit('      shadow: boolean;','      shadow: boolean;\n      shadowMapSize?: number;\n      nonStreet: number;');
edit('    selectLightingPreview: select,','    selectLightingPreview: selectAt,');
edit('    timeOverride: select("night").instant,','    timeOverride: selectAt("night").instant,');
edit('        shadow: beam.light.shadowEnabled,','        shadow: beam.light.shadowEnabled,\n        shadowMapSize: beam.light.getShadowGenerator()?.mapSize,\n        nonStreet: scene.lights.filter(light => light.isEnabled() && !streets.includes(light as PointLight)).length,');
text+=fs.readFileSync(path.join(own,'vehicle-tests.txt'),'utf8');fs.writeFileSync(path.join(out,n),text);console.log('new actual vehicle quality regressions installed over baseline');
