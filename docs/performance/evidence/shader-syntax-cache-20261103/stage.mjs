import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
export const cacheRoot = join(root, '.cache/shader-syntax-cache-20261103');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const patchPath = join(root, 'patches/@babylonjs__core@9.30.0.patch');
const prefixBytes = 30176, prefixHash = '965f9774f8fd436bcd699d6f54c0a1b64a318f554bb261a85aa9189828f55c49';
const preimages = { js: '44287130f5bfd1b25918e7f1e747cd0094a3f9dd279167cd1761011d46f36bc7',
  'd.ts': 'a1f64b114622999838d1071f9d21b98e9167dbd0881ce1b66be542e57e6095cc' };
export function ownedPath(path) {
  const full = resolve(path);
  assert.ok(full.startsWith(cacheRoot + '/') || full.startsWith(cacheRoot + '\\'), 'only reserved cache output');
  return full;
}
export function applySection(source, section, reverse = false) {
  assert.ok(!source.includes('\r'), 'pinned processor uses LF');
  let newline = source.endsWith('\n'); const lines = source.split('\n'); if (newline) lines.pop();
  const patch = section.split('\n'), result = []; let cursor = 0, hunks = 0;
  for (let i = 0; i < patch.length; i++) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(patch[i]);
    if (!header) continue;
    hunks++;
    const start = Number(header[reverse ? 3 : 1]) - 1;
    assert.ok(start >= cursor && start <= lines.length, 'hunk order');
    result.push(...lines.slice(cursor, start)); cursor = start;
    let consumed = 0, produced = 0, previousKind, outputNoNewline = false;
    for (i++; i < patch.length && !patch[i].startsWith('@@ '); i++) {
      const row = patch[i]; if (!row) continue;
      if (row.startsWith('\\ No newline')) {
        if (previousKind !== '-') outputNoNewline = true;
        continue;
      }
      let kind = row[0]; if (reverse) kind = kind === '+' ? '-' : kind === '-' ? '+' : kind;
      assert.ok([' ', '+', '-'].includes(kind), 'unexpected patch row');
      const text = row.slice(1);
      if (kind !== '+') { assert.equal(lines[cursor++], text, 'exact patch preimage, no fuzz'); consumed++; }
      if (kind !== '-') { result.push(text); produced++; outputNoNewline = false; }
      previousKind = kind;
    }
    i--;
    assert.equal(consumed, Number(header[reverse ? 4 : 2] ?? 1));
    assert.equal(produced, Number(header[reverse ? 2 : 4] ?? 1));
    if (cursor === lines.length) newline = !outputNoNewline;
  }
  assert.ok(hunks > 0); result.push(...lines.slice(cursor)); return result.join('\n') + (newline ? '\n' : '');
}
export async function sources() {
  const patch = await readFile(patchPath);
  assert.equal(hash(patch.subarray(0, prefixBytes)), prefixHash, 'all existing patch bytes preserved');
  const sections = patch.toString('utf8').split(/(?=^diff --git )/m), files = {};
  for (const ext of ['js', 'd.ts']) {
    const name = 'Engines/Processors/shaderProcessor.' + ext;
    const matches = sections.filter(section => section.startsWith('diff --git a/' + name + ' b/' + name + '\n'));
    assert.equal(matches.length, 1, 'one canonical added section: ' + name);
    const path = join(root, 'node_modules/@babylonjs/core', name), installed = await readFile(path, 'utf8');
    const captured = process.env.STRAHOV_SHADER_SYNTAX_PREIMAGE_DIR;
    const original = captured ? await readFile(join(ownedPath(captured), 'original.' + ext), 'utf8')
      : hash(installed) === preimages[ext] ? installed : applySection(installed, matches[0], true);
    assert.equal(hash(original), preimages[ext], 'original pinned processor preimage');
    const candidate = applySection(original, matches[0]);
    if (!captured && installed !== original) assert.equal(candidate, installed, 'installed patch must match canonical diff');
    files[ext] = { original, candidate, path, originalSha256: hash(original), candidateSha256: hash(candidate) };
  }
  return { files, patchSha256: hash(patch), prefixBytes, prefixHash,
    sourceMode: process.env.STRAHOV_SHADER_SYNTAX_PREIMAGE_DIR ? 'explicit-captured-preimage' : 'installed-package' };
}
export function importable(source, originalPath) {
  const url = pathToFileURL(originalPath);
  return source.replace(/from "(\.[^"]+)"/g, (_match, name) => 'from ' + JSON.stringify(new URL(name, url).href));
}
export async function baselineModule() {
  const { files } = await sources();
  return import('data:text/javascript;base64,' + Buffer.from(importable(files.js.original, files.js.path)).toString('base64'));
}
export async function stage(directory) {
  directory = ownedPath(directory); await mkdir(directory);
  const info = await sources();
  for (const variant of ['original', 'candidate']) {
    await writeFile(join(directory, 'shaderProcessor.' + variant + '.mjs'), importable(info.files.js[variant], info.files.js.path), { flag: 'wx' });
    await writeFile(join(directory, 'shaderProcessor.' + variant + '.d.ts'), info.files['d.ts'][variant], { flag: 'wx' });
  }
  const manifest = { patchSha256: info.patchSha256, prefixBytes, prefixHash, sourceMode: info.sourceMode,
    files: Object.fromEntries(Object.entries(info.files).map(([ext, value]) => [ext, {
      originalSha256: value.originalSha256, candidateSha256: value.candidateSha256 }])),
    candidateModule: join(directory, 'shaderProcessor.candidate.mjs'), baselineModule: join(directory, 'shaderProcessor.original.mjs') };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(manifest)); return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stage(process.argv[2]);
