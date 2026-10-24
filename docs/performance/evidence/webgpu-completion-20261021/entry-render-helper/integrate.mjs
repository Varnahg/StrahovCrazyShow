import {readFile,writeFile} from 'node:fs/promises';import {dirname,join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../..'),old=join(root,'.cache/webgpu-completion-20261021/preparation-summary/helper/v10'),out=join(root,'.cache/webgpu-completion-20261021/entry-render/helper/v11');
const replace=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Exact anchor drift: '+a);return s.replace(a,b);};
let overlay=await readFile(join(old,'qa-overlay.mjs'),'utf8');
overlay=replace(overlay,"import { captureRoutineCost } from 'virtual:webgpu-completion-routine-cost';", "import { captureRoutineCost } from 'virtual:webgpu-completion-routine-cost';\nimport { captureEntryRenderCost } from 'virtual:webgpu-completion-entry-render';\nimport { Game, Scene, GltfLightBudget, StableLightState } from 'virtual:webgpu-completion-entry-classes';");
overlay=replace(overlay,'routineOwner,bufferOwner, planned','routineOwner, entryOwner,bufferOwner, planned');
overlay=replace(overlay,"routineOwner?.dispose('owner-stopped');bufferOwner", "routineOwner?.dispose('owner-stopped'); entryOwner?.dispose('owner-stopped');bufferOwner");
const action=`  if (identity.routineCost) {
    const expected = { classes: { Game, Scene, GltfLightBudget, StableLightState }, methods: {
      prepareFrame: GltfLightBudget.prototype.prepareFrame, update: StableLightState.prototype.update, render: Scene.prototype.render } };
    action('Diagnostic · první vstup do auta /8 framů /3 render fáze', async () => {
      controls.open = false;
      const raw = { ...envelope('vehicle-entry-cost'), completed: false, before: snapshot(), after: null, entryProfile: null, validationErrors: [],
        scope: 'First observed foot-to-vehicle after explicit arm; coldness requires fresh Game/session evidence. Original prelude/Scene CPU only, never GPU/submission/FPS.' };
      try {
        entryOwner = captureEntryRenderCost(gameRef, { enabled: identity.routineCost, expected, signal: clockAbort.signal,
          isCurrent: () => !disposed && gameRef === game });
        raw.entryProfile = await entryOwner.done;
        raw.completed = raw.entryProfile.complete;
        if (!raw.completed) raw.validationErrors.push('Entry diagnostic incomplete: ' + raw.entryProfile.reason);
      } catch (error) { raw.failure = errorText(error); raw.validationErrors.push(raw.failure.message); }
      finally {
        entryOwner?.dispose(); raw.entryProfile ??= entryOwner?.snapshot() ?? null; entryOwner = undefined;
        raw.after = snapshot(); raw.observerErrors = [...observerErrors];
      }
      await persist(raw);
    });
  }
`;
overlay=replace(overlay,"  if (identity.clock?.config.benchmarkAtUTC !== undefined) action(",action+"  if (identity.clock?.config.benchmarkAtUTC !== undefined) action(");
await writeFile(join(out,'qa-overlay.mjs'),overlay);
let harness=await readFile(join(old,'harness.mjs'),'utf8');
harness=replace(harness,"    const routineCore = await readFile(join(helperDirectory, 'routine-cost-core.mjs'), 'utf8');", "    const entryRender = await readFile(join(helperDirectory, 'entry-render-cost.mjs'), 'utf8');\n    const entryClasses = 'export { Game } from ' + JSON.stringify(join(snapshot, 'client/game.ts').replaceAll(String.fromCharCode(92), '/')) + ';export { Scene } from \"@babylonjs/core/scene.js\";export { GltfLightBudget } from ' + JSON.stringify(join(snapshot, 'client/gltf-light-budget.ts').replaceAll(String.fromCharCode(92), '/')) + ';export { StableLightState } from ' + JSON.stringify(join(snapshot, 'client/stable-light-state.ts').replaceAll(String.fromCharCode(92), '/')) + ';';\n    const routineCore = await readFile(join(helperDirectory, 'routine-cost-core.mjs'), 'utf8');");
harness=replace(harness,"          if (id === 'virtual:webgpu-completion-qa') return virtual;", "          if (id === 'virtual:webgpu-completion-entry-render') return '\\0virtual:webgpu-completion-entry-render';\n          if (id === 'virtual:webgpu-completion-entry-classes') return '\\0virtual:webgpu-completion-entry-classes';\n          if (id === 'virtual:webgpu-completion-qa') return virtual;");
// Locate the original load body rather than changing UI or production config.
const loadMarker='        load(id) {';
harness=replace(harness,loadMarker,loadMarker+"\n          if (id === '\\0virtual:webgpu-completion-entry-render') return entryRender;\n          if (id === '\\0virtual:webgpu-completion-entry-classes') return entryClasses;");
await writeFile(join(out,'harness.mjs'),harness);
let receipt=await readFile(join(old,'receipt.mjs'),'utf8');
receipt=replace(receipt,"import { validateRoutineProfile } from './routine-cost-core.mjs';", "import { validateRoutineProfile } from './routine-cost-core.mjs';\nimport { validateEntryRenderProfile } from './entry-render-cost.mjs';");
receipt=replace(receipt,"'routine-cost','buffer-lifecycle'", "'routine-cost','buffer-lifecycle','vehicle-entry-cost'");
receipt=replace(receipt,"  if (value.kind === 'routine-cost') {", "  if (value.kind === 'vehicle-entry-cost') {\n    if (identity.routineCost !== true || value.routineCost !== true || value.mode !== 'diagnostic' || !value.before || !value.after ||\n        !Array.isArray(value.validationErrors) || value.validationErrors.length > 16 || typeof value.completed !== 'boolean') throw new Error('Entry diagnostic identity/evidence missing');\n    if (value.entryProfile) validateEntryRenderProfile(value.entryProfile);\n    if (value.completed && value.entryProfile?.complete !== true) throw new Error('Entry completion missing');\n  }\n  if (value.kind === 'routine-cost') {");
await writeFile(join(out,'receipt.mjs'),receipt);
let common=await readFile(join(old,'common.mjs'),'utf8');
common=replace(common,"'preparation-summary.test.mjs', 'README.md'", "'preparation-summary.test.mjs', 'entry-render-cost.mjs', 'entry-render-cost.test.mjs', 'README.md'");
await writeFile(join(out,'common.mjs'),common);
await writeFile(join(out,'README.md'),'# V11 entry/prelude diagnostic\n\nExisting --routine-cost additionally offers a separate first-observed-entry button. It waits for the original accepted Actor false→true at outer prepareFrame and captures8 original prepare→stable→Scene chains under one30s deadline. First/cold is a fresh-session claim, never inferred from this observer alone. Original eight-routine button/modules are unchanged. New vehicle-entry-cost receipt records per-frame wall timestamps, engine and scene IDs, vehicle flags, three outer scopes, overlapping nested work and explicit failure/restoration evidence. glTF direct refresh inside Scene is included in Scene only. Engine ID stays unchanged inside render; Scene progresses1. No product/GPU/readiness/input/network calls are added. Exact snapshot singleton classes/methods, lifecycle and foreign-descriptor guards; defaultoff no hooks or Game reads. Only one installed attempt per Game.\n\nUse a fresh immutable helper build. Root alone runs actual first-entry capture. CPU fixtures are not GPU image, submission, performance or cold-entry acceptance. Public entry-render-helper evidence records research/variants, all source/protected hashes and exact verification.\n\n'+await readFile(join(old,'README.md'),'utf8'));
console.log('Integrated only five v11 source anchors; pure module/test are separate owned inputs.');
