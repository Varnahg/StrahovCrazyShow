import { readFile, readdir, mkdir, realpath } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inside, writeNewJSON, sha256, validateResult } from './common.mjs';

export const slots = ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'];
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
export async function createCampaign(cache, id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid explicit campaign ID');
  const directory = inside(cache, join(cache, 'campaigns', id));
  await mkdir(dirname(directory), {recursive: true});
  await mkdir(directory);
  await mkdir(join(directory, 'starts'));
  const file = join(directory, 'campaign.json');
  await writeNewJSON(file, {schemaVersion: 1, campaignId: id, slots, modes: ['profile', 'plain'],
    repetitions: 3, createdAt: new Date().toISOString(), method: 'Exactly three separate A and B server starts; A1/B1/A2/B2/A3/B3 in each mode, all failed attempts retained'});
  return file;
}
export async function readCampaign(file, cache) {
  const full = resolve(file);
  if (cache) inside(join(cache, 'campaigns'), full);
  const manifest = await json(full);
  if (manifest.schemaVersion !== 1 || JSON.stringify(manifest.slots) !== JSON.stringify(slots) ||
      JSON.stringify(manifest.modes) !== JSON.stringify(['profile', 'plain']) || manifest.repetitions !== 3)
    throw new Error('Unsupported campaign method');
  return {file: full, directory: dirname(full), manifest};
}
export async function startCampaignRun(campaign, slot, identityFile, identity) {
  if (!slots.includes(slot)) throw new Error('Start slot must be A1/B1/A2/B2/A3/B3');
  const startId = slot + '-' + randomUUID(), directory = join(campaign.directory, 'starts', startId);
  await mkdir(directory);
  await mkdir(join(directory, 'attempts'));
  const start = {schemaVersion: 1, campaignId: campaign.manifest.campaignId, slot, variant: slot[0], startId,
    startedAt: new Date().toISOString(), buildIdentityFile: resolve(identityFile),
    sourceSnapshotId: identity.sourceSnapshotId, harnessSha256: identity.harnessSha256};
  await writeNewJSON(join(directory, 'start.json'), start);
  return {directory, start};
}
export async function beginAttempt(run, attemptId, mode) {
  if (!uuid(attemptId) || !['plain', 'profile'].includes(mode)) throw new Error('Invalid attempt identity/mode');
  const directory = join(run.directory, 'attempts', attemptId);
  await mkdir(directory);
  const begin = {...run.start, attemptId, mode, begunAt: new Date().toISOString()};
  await writeNewJSON(join(directory, 'begin.json'), begin);
  return begin;
}
export async function recordAttempt(run, raw, identity, sdkPeers) {
  if (!uuid(raw.attemptId)) throw new Error('Unknown attempt ID; client retains export');
  const directory = join(run.directory, 'attempts', raw.attemptId), begin = await json(join(directory, 'begin.json'));
  const file = join(directory, 'received.json'), rawSha256 = sha256(JSON.stringify(raw));
  try {
    const existing = await json(file);
    if (existing.rawSha256 !== rawSha256) throw new Error('Attempt ID reused with different raw bytes');
    return {file, ...existing.verdict, persisted: true, replay: true};
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const reasons = [];
  if (raw.failure) reasons.push('Client failure: ' + raw.failure);
  if (raw.campaignId !== run.start.campaignId || raw.startId !== run.start.startId || raw.slot !== run.start.slot || raw.mode !== begin.mode)
    reasons.push('Campaign/start/mode identity mismatch');
  try { validateResult(raw, identity); } catch (error) { reasons.push(String(error)); }
  if (sdkPeers.length !== 2 || sdkPeers.some(peer => !peer.connected)) reasons.push('Actual SDK peers disconnected at submission');
  const verdict = {accepted: reasons.length === 0, reasons};
  // An invalid result is still durably received raw evidence. No validation
  // exception can bypass this write, and wx protects the first received value.
  await writeNewJSON(file, {schemaVersion: 1, rawSha256, receivedAt: new Date().toISOString(),
    begin, raw, sdkPeers: structuredClone(sdkPeers), verdict});
  return {file, ...verdict, persisted: true, replay: false};
}
export async function readInventory(campaign) {
  const records = [], starts = [], files = [], paths = new Set(), ids = new Set(), startFailures = [];
  let incompleteStarts = 0;
  async function tracked(file, parse = true) {
    const canonical = (await realpath(file)).toLowerCase();
    if (paths.has(canonical)) throw new Error('Duplicate inventory path: ' + file);
    paths.add(canonical);
    const bytes = await readFile(file);
    files.push({path: relative(campaign.directory, file).replaceAll('\\', '/'), sha256: sha256(bytes)});
    return parse ? JSON.parse(bytes) : undefined;
  }
  const rootNames = await readdir(campaign.directory);
  if (rootNames.some(name => !['campaign.json', 'starts'].includes(name))) throw new Error('Uninventoried campaign root entry');
  await tracked(campaign.file);
  const entries = await readdir(join(campaign.directory, 'starts'), {withFileTypes: true});
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) throw new Error('Unexpected campaign start entry: ' + entry.name);
    const directory = join(campaign.directory, 'starts', entry.name), start = await tracked(join(directory, 'start.json'));
    if (start.campaignId !== campaign.manifest.campaignId || !slots.includes(start.slot) || start.startId !== entry.name)
      throw new Error('Campaign start metadata mismatch');
    starts.push(start);
    const startNames = await readdir(directory);
    for (const name of startNames)
      if (!['start.json', 'attempts', 'cleanup.json', 'processes.json', 'server.log'].includes(name)) throw new Error('Uninventoried start entry: ' + name);
    for (const name of ['processes.json', 'server.log'])
      if (startNames.includes(name)) await tracked(join(directory, name), name.endsWith('.json'));
    const cleanup = startNames.includes('cleanup.json') ? await tracked(join(directory, 'cleanup.json')) : null;
    if (!cleanup || cleanup.apiExited !== true || cleanup.previewClosed !== true) {
      incompleteStarts++;
      startFailures.push({startId: start.startId, reasons: ['Owned process cleanup not confirmed'], cleanup});
    }
    const attempts = await readdir(join(directory, 'attempts'), {withFileTypes: true});
    if (!attempts.length) startFailures.push({startId: start.startId, reasons: ['Server start completed no registered measurement attempt']});
    for (const attempt of attempts.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!attempt.isDirectory() || !uuid(attempt.name)) throw new Error('Unexpected attempt entry');
      if (ids.has(attempt.name)) throw new Error('Duplicate attempt across starts');
      ids.add(attempt.name);
      const attemptDirectory = join(directory, 'attempts', attempt.name);
      const names = await readdir(attemptDirectory);
      if (names.some(name => !['begin.json', 'received.json'].includes(name))) throw new Error('Uninventoried attempt file');
      const begin = await tracked(join(attemptDirectory, 'begin.json'));
      if (begin.attemptId !== attempt.name || begin.startId !== start.startId) throw new Error('Attempt registration mismatch');
      const receipt = names.includes('received.json') ? await tracked(join(attemptDirectory, 'received.json')) : null;
      if (receipt && (receipt.raw.attemptId !== begin.attemptId || receipt.rawSha256 !== sha256(JSON.stringify(receipt.raw))))
        throw new Error('Raw receipt identity/hash mismatch');
      if (receipt && JSON.stringify(receipt.begin) !== JSON.stringify(begin)) throw new Error('Receipt registration differs from inventory');
      if (receipt?.verdict.accepted && (receipt.raw.campaignId !== start.campaignId || receipt.raw.startId !== start.startId ||
          receipt.raw.slot !== start.slot || receipt.raw.mode !== begin.mode)) throw new Error('Accepted receipt belongs to another campaign/start/mode');
      records.push({file: join(attemptDirectory, 'received.json'), begin, receipt,
        accepted: receipt?.verdict.accepted === true,
        reasons: receipt?.verdict.reasons ?? ['Registered attempt has no received raw record; recover browser export before acceptance']});
    }
  }
  return {campaign: campaign.manifest, directory: campaign.directory, starts, files, records, startFailures, incompleteStarts,
    inventorySha256: sha256(JSON.stringify(files)), missingReceipts: records.filter(record => !record.receipt).length};
}
export async function recoverExport(campaign, startId, exportFile) {
  if (!/^[AB][1-3]-[a-f0-9-]{36}$/.test(startId)) throw new Error('Invalid explicit start ID');
  const directory = inside(campaign.directory, join(campaign.directory, 'starts', startId));
  const start = await json(join(directory, 'start.json')), exported = await json(exportFile), recovered = [];
  if (!Array.isArray(exported.attempts)) throw new Error('Expected complete browser raw export');
  for (const raw of exported.attempts) {
    if (raw.campaignId !== campaign.manifest.campaignId || raw.startId !== start.startId) throw new Error('Export belongs to another campaign/start');
    if (!uuid(raw.attemptId)) throw new Error('Invalid exported attempt ID');
    const attemptDirectory = join(directory, 'attempts', raw.attemptId), begin = await json(join(attemptDirectory, 'begin.json'));
    const file = join(attemptDirectory, 'received.json'), rawSha256 = sha256(JSON.stringify(raw));
    try {
      const prior = await json(file);
      if (prior.rawSha256 !== rawSha256) throw new Error('Export differs from first stored raw');
      continue;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeNewJSON(file, {schemaVersion: 1, rawSha256, receivedAt: new Date().toISOString(), begin, raw,
      sdkPeers: [], recoveredFrom: {file: resolve(exportFile), sha256: sha256(await readFile(exportFile))},
      verdict: {accepted: false, reasons: ['Transport failure recovered from browser; contemporaneous server acceptance unavailable']}});
    recovered.push(file);
  }
  return recovered;
}
export function assessInterleaving(records) {
  const errors = [], byMode = {}, ids = new Set();
  for (const record of records) {
    if (ids.has(record.begin.attemptId)) errors.push('Duplicate attempt ID');
    ids.add(record.begin.attemptId);
  }
  for (const mode of ['profile', 'plain']) {
    const accepted = records.filter(record => record.accepted && record.begin.mode === mode)
      .sort((a, b) => a.begin.begunAt.localeCompare(b.begin.begunAt));
    byMode[mode] = accepted.map(record => ({slot: record.begin.slot, startId: record.begin.startId, attemptId: record.begin.attemptId}));
    if (JSON.stringify(accepted.map(record => record.begin.slot)) !== JSON.stringify(slots)) errors.push(mode + ': require exact A1/B1/A2/B2/A3/B3');
    if (new Set(accepted.map(record => record.begin.startId)).size !== 6) errors.push(mode + ': require six distinct server starts');
  }
  for (const slot of slots) {
    const profile = byMode.profile.find(record => record.slot === slot), plain = byMode.plain.find(record => record.slot === slot);
    if (!profile || !plain || profile.startId !== plain.startId) errors.push(slot + ': modes must share the same accepted server start');
  }
  return {valid: errors.length === 0, errors, byMode};
}
