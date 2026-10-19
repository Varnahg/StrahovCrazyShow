import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const path=resolve(import.meta.dirname,'../../docs/agents/tasks/webgpu-medium-vehicle-helper-20261019.json'),task=JSON.parse(readFileSync(path));
assert.equal(task.id,'webgpu-medium-vehicle-helper-20261019');assert.ok(task.acceptance[1].includes('client/light-preparation.ts a'));
task.acceptance[1]=task.acceptance[1].replace('client/light-preparation.ts a','client/light-preparation.ts,client/render-quality-preparation.ts a');
task.verification.push('Koordinátor po actual public Game.setQuality RED před zápisem autorizuje třetí copied helper render-quality-preparation a relevantní render-quality/game-quality testy. Ostatní omezení se nemění.');
task.notes.push('Schváleno po actualGame.setQuality/applyAdaptiveQuality RED: optional requestedQuality callback v existujícím render-quality-preparation; po complete finalattempt při jiné latest quality přidat tailpass s původním started/paused/90s total a min(30s,remaining), bez resetu/timerů/cache. Stable3passes/48stages se nemění. Přesně toto je rozšíření původního copiedscope, nikoli převzetí root/main WIP.');
writeFileSync(path,JSON.stringify(task,null,2)+'\n');
