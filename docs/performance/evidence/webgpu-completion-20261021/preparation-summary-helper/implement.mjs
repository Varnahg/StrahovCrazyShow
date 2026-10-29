/** Apply only the declared v10 anchors; original immutable helper stays read-only. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const target = join(root, '.cache/webgpu-completion-20261021/preparation-summary/helper/v10');
const original = join(root, '.cache/webgpu-completion-20261021/validation/helper-runtimes/v9');
const { helperIdentity, sha256 } = await import(pathToFileURL(join(original, 'common.mjs')));
if ((await helperIdentity(original)).sha256 !== '9dc789c8041c6e17526a467ea328f81228e628c54a8822ae4fbfc7132d834773') throw Error('Original v9 drift');
const observer = await readFile(join(original, 'startup-observer.mjs'));
const appended = Buffer.concat([observer, Buffer.from(await readFile(join(directory, 'summary-addition.mjs')))]);
// The first attempt stopped at an LF/CRLF anchor mismatch before overlay writes.
// Permit only that exact documented own append, never a foreign partial edit.
for (const [file, expected] of Object.entries((await helperIdentity(original)).files)) {
  const actual = sha256(await readFile(join(target, file)));
  if (actual !== expected && !(file === 'startup-observer.mjs' && actual === sha256(appended))) throw Error('Own copy drift: ' + file);
}
const replacement = (source, from, to) => {
  if (source.split(from).length !== 2) throw Error('Exact-once source anchor drift: ' + from);
  return source.replace(from, to);
};
await writeFile(join(target, 'startup-observer.mjs'), appended);
let overlay = await readFile(join(original, 'qa-overlay.mjs'), 'utf8');
overlay = replacement(overlay, 'import { observeOperation }', 'import { observeOperation, observePreparationResult }');
overlay = replacement(overlay, 'clockOwner, latencyOwner, attributionWindow', 'clockOwner, latencyOwner, preparationOwner, attributionWindow');
overlay = replacement(overlay, "    lifecycleOwner?.dispose();", "    lifecycleOwner?.dispose(); preparationOwner?.dispose();");
overlay = replacement(overlay, '    clockOwner = owner;\n    return start();',
  '    clockOwner = owner;\n    preparationOwner = observePreparationResult(game, { signal: clockAbort.signal, startupSignal: game.startupAbort?.signal,\n      isCurrent: () => !disposed && gameRef === game, onObserverError: noteError });\n    return start();');
overlay = replacement(overlay, '      latencyOwner?.dispose();\n      if(outcome', '      latencyOwner?.dispose(); preparationOwner?.dispose();\n      if(outcome');
overlay = replacement(overlay, 'startupLatency: latencyOwner?.snapshot() ?? null, shaderAttribution: null,',
  'startupLatency: latencyOwner?.snapshot() ?? null, shaderAttribution: null,\n        preparationSummary: preparationOwner?.snapshot() ?? { available: false, reason: \'not-installed\' },');
await writeFile(join(target, 'qa-overlay.mjs'), overlay);
let common = await readFile(join(original, 'common.mjs'), 'utf8');
common = replacement(common, "'depth-inputs.test.mjs', 'README.md'", "'depth-inputs.test.mjs', 'preparation-summary.test.mjs', 'README.md'");
await writeFile(join(target, 'common.mjs'), common);
const readme = await readFile(join(original, 'README.md'));
const addition = '# QA v10: bounded original preparation result\n\nThis immutable helper observes only this Game instance\'s original prepareLighting result, with one native Promise.then side reaction per original call. It returns exactly the original Promise/value/receiver/args/throw; no extra await, timer, render, readiness, GPU call or product state. Projection runs once on original fulfilment before Game.start terminal, and only the tiny preparationSummary is attached once to startup raw. Existing periodic snapshots and benchmark paths are unchanged.\n\nOwn data descriptors whitelist real status/times/failureStep and stages.length, max16 quality scalar rows with true qualityCount/truncation/invalid flags. No stage entry, shader/resource/user data is read or retained. Missing/invalid data stays explicitly unavailable/null. Original rejection remains original and yields no fabricated timing.\n\nThe instance method is restored before terminal/stop/abort, only if it is still the owned descriptor; owner/renderer/generation/scene/engine/startup abort guards reject late evidence. Raw results, Game and Promise are not retained after projection/retirement. Diagnostic errors cannot replace the original outcome. This adds startup observation overhead and is not an FPS/GPU performance claim. Full research and leaf proof: public preparation-summary-helper evidence. Root alone builds and verifies an actual capture. Original v9/source10/native remain read-only.\n\n';
await writeFile(join(target, 'README.md'), Buffer.concat([Buffer.from(addition), readme]));
console.log('Applied only v10 observer/overlay/common/README anchors; new test follows.');
