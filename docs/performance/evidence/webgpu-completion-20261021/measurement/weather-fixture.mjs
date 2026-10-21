import { open, lstat, realpath } from 'node:fs/promises';
import { resolve, isAbsolute, join, extname } from 'node:path';
import { inside, sha256 } from './common.mjs';

export const MAX_WEATHER_BYTES = 64 * 1024;
export const WEATHER_LABELS = Object.freeze({ status: 'fallback',
  source: 'Řízené testovací počasí · uložený záznam',
  cloudSource: 'Řízený meteorologický model · benchmark',
  cloudWindSource: 'Řízené modelové proudění · benchmark' });
const required = ['temperature', 'wind', 'windDirection', 'rain', 'cloud', 'observedAt', 'fetchedAt', 'source', 'cloudSource', 'stale', 'status'];
const allowed = [...required, 'sourceKind', 'cloudObservedAt', 'cloudStale', 'cloudLayers', 'cloudWinds', 'cloudWindSource',
  'windGust', 'humidity', 'visibility', 'snowfall', 'liquidPrecipitation', 'precipitationType', 'fieldSources'];
const supplements = ['humidity', 'windGust', 'visibility', 'snowfall', 'liquidPrecipitation', 'precipitationType'];
const record = value => value && Object.getPrototypeOf(value) === Object.prototype;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' && value.length <= 2048;
function shape(value, keys, requiredKeys = keys) {
  if (!record(value) || Object.keys(value).some(key => !keys.includes(key)) || requiredKeys.some(key => !Object.hasOwn(value, key)))
    throw new Error('Invalid weather object shape');
}
function number(value, minimum = 0, maximum = Infinity) {
  if (!finite(value) || value < minimum || value > maximum) throw new Error('Invalid finite weather value');
}
export function validateWeather(value) {
  shape(value, allowed, required);
  if (value.temperature !== null) number(value.temperature, -Infinity);
  for (const key of ['wind', 'rain']) number(value[key]);
  number(value.windDirection, 0, 360); number(value.cloud, 0, 1);
  if (value.observedAt !== null) number(value.observedAt);
  number(value.fetchedAt);
  if (!text(value.source) || !text(value.cloudSource) || typeof value.stale !== 'boolean' ||
      !['live', 'fallback', 'unavailable'].includes(value.status)) throw new Error('Invalid weather provenance/status');
  if (value.sourceKind !== undefined && !['station', 'model'].includes(value.sourceKind)) throw new Error('Invalid sourceKind');
  if (value.cloudObservedAt !== undefined && value.cloudObservedAt !== null) number(value.cloudObservedAt);
  if (value.cloudStale !== undefined && typeof value.cloudStale !== 'boolean') throw new Error('Invalid cloudStale');
  if (value.cloudWindSource !== undefined && !text(value.cloudWindSource)) throw new Error('Invalid cloud wind provenance');
  for (const key of ['windGust', 'visibility', 'snowfall', 'liquidPrecipitation']) if (value[key] !== undefined) number(value[key]);
  if (value.humidity !== undefined) number(value.humidity, 0, 100);
  if (value.precipitationType !== undefined && !['none', 'rain', 'snow', 'mixed', 'freezing-rain', 'hail', 'unknown'].includes(value.precipitationType))
    throw new Error('Invalid precipitation type');
  if (value.cloudLayers !== undefined) {
    shape(value.cloudLayers, ['low', 'mid', 'high']);
    for (const level of ['low', 'mid', 'high']) number(value.cloudLayers[level], 0, 1);
  }
  if (value.cloudWinds !== undefined) {
    shape(value.cloudWinds, ['low', 'mid', 'high']);
    for (const level of ['low', 'mid', 'high']) {
      shape(value.cloudWinds[level], ['speed', 'direction']);
      number(value.cloudWinds[level].speed); number(value.cloudWinds[level].direction, 0, 360);
    }
  }
  if (value.fieldSources !== undefined) {
    shape(value.fieldSources, supplements, []);
    for (const source of Object.values(value.fieldSources)) {
      shape(source, ['kind', 'source', 'observedAt', 'stale']);
      if (!['station', 'model'].includes(source.kind) || !text(source.source) || typeof source.stale !== 'boolean')
        throw new Error('Invalid supplement source');
      number(source.observedAt);
    }
  }
  return value;
}
export function weatherFixture(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_WEATHER_BYTES) throw new Error('Weather byte bound');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Invalid UTF-8 weather JSON'); }
  const source = validateWeather(parsed);
  // Identical metadata-only policy to scripts/performance-preview.mjs. Every
  // other field, including null/missing/nested numeric data, stays unchanged.
  const emitted = Buffer.from(JSON.stringify({ ...source, ...WEATHER_LABELS }), 'utf8');
  const parsedEmitted = JSON.parse(emitted.toString('utf8'));
  const preserve = (before, after) => {
    if ((typeof before === 'number' || before === null) && !Object.is(before, after))
      throw new Error('Weather numeric/null value cannot round-trip unchanged');
    if (before && typeof before === 'object') for (const key of Object.keys(before)) preserve(before[key], after[key]);
  };
  preserve(source, parsedEmitted);
  return { sourceBytes: Buffer.from(bytes), emittedBytes: emitted,
    specification: Object.freeze({ schemaVersion: 1, sourceSha256: sha256(bytes), emittedSha256: sha256(emitted),
      sourceBytes: bytes.length, emittedBytes: emitted.length,
      provenance: Object.freeze({ mechanism: 'scripts/performance-preview.mjs recorded-audit-weather',
        numericPolicy: 'All supplied Weather numeric/null/nested values preserved exactly; no clamping or workload reduction',
        labelPolicy: 'Only status/source/cloudSource/cloudWindSource replaced with explicit recorded QA fallback labels' }) }) };
}
async function boundedFile(file, allowedDirectory) {
  if (!isAbsolute(file)) throw new Error('Weather fixture path must be absolute');
  if (extname(file).toLowerCase() !== '.json') throw new Error('Weather fixture must be an explicit JSON file');
  const canonicalRoot = await realpath(allowedDirectory), path = inside(allowedDirectory, resolve(file));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Weather input must be a regular file');
  inside(canonicalRoot, await realpath(path));
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_WEATHER_BYTES) throw new Error('Weather byte bound');
    const buffer = Buffer.alloc(MAX_WEATHER_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length === 0 || length > MAX_WEATHER_BYTES) throw new Error('Weather byte bound');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}
export async function loadWeatherInput(file, allowedDirectory) {
  return weatherFixture(await boundedFile(file, allowedDirectory));
}
export async function verifyBuiltWeather(directory, specification) {
  if (!specification) return undefined;
  const raw = await boundedFile(join(directory, 'weather-source.json'), directory);
  const emitted = await boundedFile(join(directory, 'weather-emitted.json'), directory);
  const fixture = weatherFixture(raw);
  if (JSON.stringify(fixture.specification) !== JSON.stringify(specification) || !fixture.emittedBytes.equals(emitted))
    throw new Error('Weather source/emitted bytes or provenance differ from build identity');
  return fixture;
}
export function serveWeatherFixture(req, res, emittedBytes) {
  if (!emittedBytes || req.url !== '/api/weather') return false;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); res.end(emittedBytes); return true;
}
