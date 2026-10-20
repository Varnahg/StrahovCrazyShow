import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { assertScene, assertStableScene } from './conditions.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const marker = '        setReady(true);\n        // Read-only debug/benchmark entry points, local development only.';
export function transformUI(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  if (normalized.split(marker).length !== 2) throw new Error('Expected one exact game-ready injection point');
  return 'import { installTransitQA } from "virtual:transit-qa";\n' + normalized.replace(marker,
    marker.replace('        // Read-only', '        installTransitQA(g);\n        // Read-only'));
}
export function inside(directory, path) {
  const root = resolve(directory), full = resolve(path), suffix = relative(root, full);
  if (!suffix || suffix.startsWith('..') || isAbsolute(suffix)) throw new Error('Expected strict child of owned directory');
  return full;
}
export async function writeNewJSON(file, data) {
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
}
export async function verifySnapshot(root) {
  const manifest = JSON.parse(await readFile(resolve(root, 'source-manifest.json'), 'utf8'));
  if (sha256(JSON.stringify(manifest.files)) !== manifest.snapshotId) throw new Error('Snapshot manifest identity mismatch');
  let cursor = 0;
  const files = Object.entries(manifest.files);
  await Promise.all(Array.from({length: 4}, async () => {
    while (cursor < files.length) {
      const [file, expected] = files[cursor++];
      if (sha256(await readFile(inside(root, resolve(root, file)))) !== expected)
        throw new Error('Frozen source differs: ' + file);
    }
  }));
  return manifest;
}
export const sourceFiles = ['scenario.json', 'common.mjs', 'harness.mjs', 'qa-overlay.mjs', 'conditions.mjs', 'attempt-delivery.mjs', 'campaign.mjs', 'lifecycle.mjs'];
export async function harnessIdentity(directory) {
  const files = {};
  for (const file of sourceFiles) files[file] = sha256(await readFile(resolve(directory, file)));
  return { sha256: sha256(JSON.stringify(files)), files };
}
export function validateResult(result, identity) {
  if (result?.schemaVersion !== 1 || result.sourceSnapshotId !== identity.sourceSnapshotId ||
      result.harnessSha256 !== identity.harnessSha256 || !['plain', 'profile'].includes(result.mode))
    throw new Error('Result identity/mode mismatch');
  if (!Array.isArray(result.intervals) || result.intervals.length !== 3)
    throw new Error('Exactly three raw intervals required');
  for (const interval of result.intervals) {
    if (!Array.isArray(interval.rawFrameMs) || interval.rawFrameMs.length < 10 ||
        interval.rawFrameMs.some(value => !Number.isFinite(value) || value < 0))
      throw new Error('Invalid raw frame series');
    if (result.mode === 'plain' && interval.profile !== null) throw new Error('Plain FPS contains profiler');
    if (!Array.isArray(interval.validationErrors) || interval.validationErrors.length || !interval.benchmark || !interval.semanticHash)
      throw new Error('Missing or failed interval evidence');
    assertScene(interval.before, result.scenario);
    assertScene(interval.after, result.scenario);
    assertStableScene(interval.before, interval.after);
    if (interval.benchmark.frames !== interval.rawFrameMs.length || interval.benchmark.avatars < 3 ||
        interval.benchmark.renderHealth?.valid !== true || interval.benchmark.renderErrorCount !== 0 || interval.benchmark.assetLoadErrorCount !== 0)
      throw new Error('Standard benchmark evidence missing or inconsistent');
    if (result.mode === 'profile' && (!interval.profile || !Array.isArray(interval.profile.updateMs) ||
        !Array.isArray(interval.profile.pruneMs) || interval.profile.updates !== interval.profile.updateMs.length ||
        interval.profile.prunes !== interval.profile.pruneMs.length || interval.profile.updates < 1 ||
        [...interval.profile.updateMs, ...interval.profile.pruneMs].some(v => !Number.isFinite(v) || v < 0)))
      throw new Error('Invalid CPU profile evidence');
  }
  return result;
}
