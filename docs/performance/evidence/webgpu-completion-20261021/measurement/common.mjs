import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const START_MARKER = '        await g.start();';
export const UI_IMPORT = 'import { observeStartup } from "virtual:webgpu-completion-qa";\n';
export function transformUI(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  if (normalized.includes('virtual:webgpu-completion-qa') || normalized.split(START_MARKER).length !== 2)
    throw new Error('Expected exactly one original Game.start injection point');
  return UI_IMPORT + normalized.replace(START_MARKER,
    '        await observeStartup(g, startupCanvas, () => g.start());');
}
export function transformLoading(source, variant = 'original') {
  if (!['original', 'translucent'].includes(variant)) throw new Error('Unknown loading variant');
  const blocks = [...source.matchAll(/(^|[\r\n])\.loading \{[^}]*\}/g)];
  if (blocks.length !== 1) throw new Error('Expected exactly one loading CSS block');
  const block = blocks[0][0], declaration = '  background: #eff3e6;';
  if (block.split(declaration).length !== 2) throw new Error('Loading background drift');
  if (variant === 'original') return source;
  const index = blocks[0].index + block.indexOf(declaration);
  return source.slice(0, index) + '  background: rgba(239,243,230,.96);' + source.slice(index + declaration.length);
}
export function inside(directory, path) {
  const root = resolve(directory), full = resolve(path), suffix = relative(root, full);
  if (!suffix || suffix.startsWith('..') || isAbsolute(suffix)) throw new Error('Expected strict child of owned directory');
  return full;
}
export async function verifySnapshot(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'source-manifest.json'), 'utf8'));
  if (sha256(JSON.stringify(manifest.files)) !== manifest.snapshotId) throw new Error('Snapshot manifest identity mismatch');
  for (const [file, entry] of Object.entries(manifest.files)) {
    const expected = typeof entry === 'string' ? entry : entry.sha256;
    if (sha256(await readFile(inside(directory, resolve(directory, file)))) !== expected)
      throw new Error('Frozen source differs: ' + file);
  }
  return manifest;
}
export async function directoryHashes(directory) {
  const files = {};
  async function walk(path, prefix = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const key = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), key + '/');
      else if (entry.isFile()) files[key] = sha256(await readFile(join(path, entry.name)));
      else throw new Error('Unexpected link in owned build: ' + key);
    }
  }
  await walk(directory);
  return files;
}
export const sourceFiles = ['common.mjs', 'startup-observer.mjs', 'attempt-queue.mjs', 'receipt.mjs', 'harness.mjs', 'qa-overlay.mjs', 'helper.test.mjs', 'README.md'];
export function previewPort(value = '4211') {
  if (typeof value !== 'string' || !/^[1-9]\d{3,4}$/.test(value) || Number(value) < 1024 || Number(value) > 65535 || Number(value) === 2596)
    throw new Error('Expected explicit preview port1024..65535 distinct from API2596');
  return Number(value);
}
export async function helperIdentity(directory) {
  const files = {};
  for (const file of sourceFiles) files[file] = sha256(await readFile(join(directory, file)));
  return { sha256: sha256(JSON.stringify(files)), files };
}
