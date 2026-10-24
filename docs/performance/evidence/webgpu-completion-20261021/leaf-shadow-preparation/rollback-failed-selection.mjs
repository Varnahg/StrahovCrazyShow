import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const path = 'client/authored-light-preparation.ts';
const prefix = 'docs/performance/evidence/webgpu-completion-20261021/leaf-shadow-preparation/';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const candidate = readFileSync(path);
if (hash(candidate) !== '949e04a04d07489469b49b6fb308521679d8bd422fdd4760123214bc6b6e6d1d') throw Error('WIP no longer equals transferred failed candidate');
const baseline = readFileSync('.cache/webgpu-leaf-shadow-preparation-20261023/before/client/authored-light-preparation.ts');
const head = execFileSync('git', ['show', `HEAD:${path}`]);
if (!baseline.equals(head)) throw Error('Transferred original differs from current committed baseline');
writeFileSync(`${prefix}failed-authored-selection.ts`, candidate, { flag: 'wx' });
writeFileSync(`${prefix}failed-authored-selection.patch`, execFileSync('git', ['diff', '--', path]), { flag: 'wx' });
writeFileSync(path, baseline);
writeFileSync(`${prefix}rollback.json`, `${JSON.stringify({
  reason: 'Whole-chain native cache reuse failed; selection-only candidate rejected. Exact failed bytes and original logs remain retained.',
  originalOwner: 'webgpu-completion-01a15a3e-leaf-shadow-renderer-audit-v1',
  acceptingOwner: 'webgpu-completion-01a15a3e-leaf-shadow-root-rollback',
  path, failedSha256: hash(candidate), restoredCommittedSha256: hash(baseline),
  tests: 'Both new test inputs retained as uncommitted WIP for the follow-up; no assertion or historical log rewritten.',
  timeUtc: new Date().toISOString()
}, null, 2)}\n`, { flag: 'wx' });
console.log('Failed selection preserved; production helper equals original committed bytes.');
