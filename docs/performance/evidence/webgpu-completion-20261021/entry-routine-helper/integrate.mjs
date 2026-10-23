import{readFile,writeFile}from'node:fs/promises';import{dirname,resolve,join}from'node:path';import{fileURLToPath}from'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../..'),old=join(root,'.cache/webgpu-completion-20261021/entry-render/helper/v12'),out=join(root,'.cache/webgpu-completion-20261021/entry-render/helper/v13');
const replace=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Exact-once anchor drift:'+a);return s.replace(a,b);};
let overlay=await readFile(join(old,'qa-overlay.mjs'),'utf8');
overlay=replace(overlay,"import { captureEntryRenderCost } from 'virtual:webgpu-completion-entry-render';","import { captureEntryRenderCost } from 'virtual:webgpu-completion-entry-render';\nimport { captureEntryRoutineCost } from 'virtual:webgpu-completion-entry-routine';");
overlay=replace(overlay,'routineOwner, entryOwner,bufferOwner','routineOwner, entryOwner, entryRoutineOwner,bufferOwner');
overlay=replace(overlay,"entryOwner?.dispose('owner-stopped');bufferOwner","entryOwner?.dispose('owner-stopped'); entryRoutineOwner?.dispose('owner-stopped');bufferOwner");
const block=`  if (identity.routineCost) {
    const routineExpected = { classes: { Game, Scene, GltfLightBudget, StableLightState }, methods: {
      prepareFrame: GltfLightBudget.prototype.prepareFrame, render: Scene.prototype.render } };
    action('Diagnostic · první vstup do auta /8 framů /8 CPU rutin', async () => {
      controls.open = false;
      const raw = { ...envelope('routine-cost'), completed: false, before: snapshot(), after: null, routineProfile: null, entryTrigger: null, validationErrors: [],
        scope: 'Restore one prepare waiter at first observed accepted vehicle transition, then original8 routine capture. Coldness requires fresh Game/session. Diagnostic wall costs, never FPS/GPU.' };
      try {
        entryRoutineOwner = captureEntryRoutineCost(gameRef, { enabled: identity.routineCost, expected: routineExpected,
          startCapture: captureRoutineCost, signal: clockAbort.signal, isCurrent: () => !disposed && gameRef === game });
        const result = await entryRoutineOwner.done;
        raw.entryTrigger = result.entryTrigger; raw.routineProfile = result.routineProfile; raw.completed = result.entryTrigger.complete;
        if (!raw.completed) raw.validationErrors.push('Entry routine incomplete: ' + result.entryTrigger.reason);
      } catch (error) { raw.failure = errorText(error); raw.validationErrors.push(raw.failure.message); }
      finally {
        entryRoutineOwner?.dispose(); const result = entryRoutineOwner?.snapshot();
        raw.entryTrigger ??= result?.entryTrigger ?? null; raw.routineProfile ??= result?.routineProfile ?? null; entryRoutineOwner = undefined;
        raw.after = snapshot(); raw.observerErrors = [...observerErrors];
      }
      await persist(raw);
    });
  }
`;
overlay=replace(overlay,"  if (identity.clock?.config.benchmarkAtUTC !== undefined) action(",block+"  if (identity.clock?.config.benchmarkAtUTC !== undefined) action(");await writeFile(join(out,'qa-overlay.mjs'),overlay);
let harness=await readFile(join(old,'harness.mjs'),'utf8');
harness=replace(harness,"    const entryRender = await readFile(join(helperDirectory, 'entry-render-cost.mjs'), 'utf8');","    const entryRoutine = await readFile(join(helperDirectory, 'entry-routine-cost.mjs'), 'utf8');\n    const entryRender = await readFile(join(helperDirectory, 'entry-render-cost.mjs'), 'utf8');");
harness=replace(harness,"          if (id === 'virtual:webgpu-completion-entry-render')", "          if (id === 'virtual:webgpu-completion-entry-routine') return '\\0virtual:webgpu-completion-entry-routine';\n          if (id === 'virtual:webgpu-completion-entry-render')");
harness=replace(harness,"          if (id === '\\0virtual:webgpu-completion-entry-render')", "          if (id === '\\0virtual:webgpu-completion-entry-routine') return entryRoutine;\n          if (id === '\\0virtual:webgpu-completion-entry-render')");await writeFile(join(out,'harness.mjs'),harness);
let receipt=await readFile(join(old,'receipt.mjs'),'utf8');receipt=replace(receipt,"import { validateEntryRenderProfile } from './entry-render-cost.mjs';","import { validateEntryRenderProfile } from './entry-render-cost.mjs';\nimport { validateEntryTrigger } from './entry-routine-cost.mjs';");
receipt=replace(receipt,"  if (value.lifecycleControl !== undefined) {","  if (value.entryTrigger !== undefined && value.kind !== 'routine-cost') throw new Error('Entry trigger kind mismatch');\n  if (value.lifecycleControl !== undefined) {");
receipt=replace(receipt,"    if (value.completed && value.routineProfile?.complete !== true) throw new Error('Routine completion missing');", "    if (value.completed && value.routineProfile?.complete !== true) throw new Error('Routine completion missing');\n    if (value.entryTrigger !== undefined) {\n      if (value.entryTrigger === null) {\n        if (value.completed || !value.failure || !value.validationErrors.length) throw new Error('Entry trigger refusal missing');\n      } else {\n        validateEntryTrigger(value.entryTrigger, value.routineProfile);\n        if (value.completed !== value.entryTrigger.complete) throw new Error('Entry trigger completion differs');\n      }\n    }");await writeFile(join(out,'receipt.mjs'),receipt);
let common=await readFile(join(old,'common.mjs'),'utf8');common=replace(common,"'entry-render-cost.test.mjs', 'README.md'","'entry-render-cost.test.mjs', 'entry-routine-cost.mjs', 'entry-routine-cost.test.mjs', 'README.md'");await writeFile(join(out,'common.mjs'),common);
await writeFile(join(out,'README.md'),'# V13 accepted-entry original8 routine diagnostic\n\nSeparate button under existing --routine-cost installs one own Gltf.prepareFrame waiter. At accepted Actor false-to-true it restores the exact waiter descriptor before synchronously starting the original captureRoutineCost, then calls original prepare once. One arm-time30s deadline covers standby+8 frames including a post-done synchronous check. Original3scope and8routine modules/buttons are byte-exact; they are never generally layered. New optional scalar entryTrigger in existing routine-cost receipt records arm/deadline/trigger/install/terminal times and SceneID correlation; install time is not Scene start. Original routineProfile remains truthful even when its eight frames complete after the outer deadline. Invalid/refused/aborted/foreign/error attempts remain evidence. Coldness needs fresh Game/original session, and profiling includes observer/JIT overhead, not FPS/GPU execution. Existing lifecycle-controls behavior is unchanged. New entry-routine-helper evidence contains primary research, hashes, tests and handoff; root alone builds/runs actual capture.\n\n'+await readFile(join(old,'README.md'),'utf8'));
console.log('Only five original-file anchors changed; two new pure module/test inputs complete v13.');
