import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Read-only static audit of game inputs. Writes only the adjacent audit JSON.
// No browser, renderer, Blender, image conversion, or texture mutation is used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ground-audit.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = relative => fs.readFileSync(path.join(root, relative));
const json = relative => JSON.parse(read(relative));

function dimensions(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'PNG' };
  }
  if (bytes.readUInt16BE(0) !== 0xffd8) throw Error('Unsupported image signature');
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw Error('Unexpected JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if (sof.has(marker)) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3), format: 'JPEG' };
    if (length < 2) throw Error('Invalid JPEG segment length');
    offset += length;
  }
  throw Error('JPEG dimensions not found');
}

function rgba8MipBytes(width, height) {
  let bytes = 0;
  for (;;) {
    bytes += width * height * 4;
    if (width === 1 && height === 1) return bytes;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
}

function imageInfo(relative) {
  const bytes = read(relative), size = dimensions(bytes);
  return {
    path: relative, bytes: bytes.length, sha256: hash(bytes), ...size,
    theoreticalRgba8FullMipBytes: rgba8MipBytes(size.width, size.height),
  };
}

const manifestPath = 'shared/data/assets/surfaces-manifest.json';
const manifest = json(manifestPath);
const surfaces = manifest.assets.map(asset => {
  const channels = Object.entries(asset.channels).map(([channel, expected]) => {
    const actual = imageInfo('public' + expected.url);
    return { channel, ...actual, matchesManifest: actual.bytes === expected.byteLength && actual.sha256 === expected.sha256 };
  });
  if (channels.some(c => !c.matchesManifest)) throw Error('Surface source differs from manifest: ' + asset.id);
  return {
    kind: asset.kind, id: asset.id, source: asset.source, importedAt: asset.importedAt,
    metresPerRepeat: [asset.metresPerRepeat, asset.metresPerRepeatV ?? asset.metresPerRepeat],
    scaleProvenance: asset.scaleProvenance, technique: asset.technique,
    channels,
    fileBytes: channels.reduce((sum, c) => sum + c.bytes, 0),
    theoreticalRgba8FullMipBytes: channels.reduce((sum, c) => sum + c.theoreticalRgba8FullMipBytes, 0),
  };
});
const geometryPath = 'public/models/vegetation/grass/geometry.json';
const materialPath = 'public/models/vegetation/grass/material.json';
const geometry = json(geometryPath), material = json(materialPath);
const grassTextures = Object.entries(geometry.textures.files).map(([channel, expected]) => {
  const actual = imageInfo('public/textures/vegetation/grass/' + expected.file);
  return { channel, ...actual, matchesManifest: actual.bytes === expected.bytes && actual.sha256 === expected.sha256 };
});
if (grassTextures.some(c => !c.matchesManifest)) throw Error('Grass atlas differs from manifest');
const levels = Object.entries(geometry.levels).map(([level, g]) => {
  const bounds = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (let i = 0; i < g.positions.length; i++) {
    const b = bounds[i % 3]; b[0] = Math.min(b[0], g.positions[i]); b[1] = Math.max(b[1], g.positions[i]);
  }
  const triangles = g.indices.length / 3;
  if (triangles !== g.triangles) throw Error('Grass geometry count mismatch');
  return { level, vertices: g.positions.length / 3, triangles, leaves: g.leafCount, materialChannel: g.materialChannel, boundsMetresXYZ: bounds };
});
const budgetPath = 'client/photo-grass-budget.ts';
const budgetSource = read(budgetPath).toString('utf8');
const qualities = ['low', 'medium', 'high'].map(quality => {
  const block = budgetSource.match(new RegExp(quality + ': \\{([^}]+)\\}'))?.[1];
  if (!block) throw Error('Cannot parse grass quality block');
  const value = name => Number(block.match(new RegExp(name + ': ([0-9.]+)'))?.[1]);
  const triangles = value('triangles');
  return {
    quality, triangleCap: triangles, declaredDrawLimit: value('draws'), rangeMetres: value('range'), fadeStartMetres: value('fadeStart'),
    actualBatchUpperBound: levels.length,
    hypotheticalHomogeneousRootCapacity: Object.fromEntries(levels.map(l => [l.level, Math.floor(triangles / l.triangles)])),
  };
});
const inputPaths = [manifestPath, geometryPath, materialPath, budgetPath,
  'client/cinematic-art.ts', 'client/surface-pack.ts', 'client/terrain-renderer.ts',
  'client/streets-renderer.ts', 'client/vegetation.ts', 'client/photographic-grass.ts',
  'client/photo-grass-placement.ts', 'client/photo-grass-resources.ts', 'client/photo-grass-source-material.ts',
  'client/photo-grass-wind.ts', 'client/photo-grass-transition.ts', 'client/photo-grass-batch.ts',
  'shared/vegetation.ts', 'shared/data/landcover.json', 'shared/data/reality-ground.json'];
const inputs = inputPaths.sort().map(relative => { const bytes = read(relative); return { path: relative, bytes: bytes.length, sha256: hash(bytes) }; });
const result = {
  schemaVersion: 1, capturedAt: new Date().toISOString(),
  scope: 'Read-only source/asset inspection. Static counts and hypothetical texture memory, not a GPU benchmark or visual acceptance.',
  command: 'node docs/vegetation/realism-audit-20261012/ground-audit.mjs',
  checks: { allSourceManifestHashesMatch: true, encodedPixelDimensionsParsed: true, geometryCountsMatch: true, testsRun: false, buildRun: false, integrationRun: false },
  limitations: [
    'Image dimensions are actual JPEG SOF/PNG IHDR dimensions, not inferred from filenames. A separate read-only System.Drawing.Image.FromFile inspection returned the same surface dimensions.',
    'RGBA8 with a full mip chain is an explicit theoretical allocation assumption, not measured VRAM; actual browser formats, residency, sharing, and driver overhead are not observed.',
    'Draw limits in configuration are legacy maxima; current renderer creates three LOD batches. Counts exclude other scene draws and passes.',
    'No tests were run or fabricated for this documentation-only research. Existing historical verification is separately dated and is not a new result.',
    'No FPS, GPU timings, p95, or p99 were measured. Existing U1 screenshot/review evidence is historical and the grass runtime hashes were compared separately.',
  ],
  inputManifestSha256: hash(Buffer.from(JSON.stringify(inputs))), inputs,
  surfaceProvenance: { provider: manifest.provider, license: manifest.license, usage: manifest.usage }, surfaces,
  grass: {
    source: 'https://polyhaven.com/a/grass_medium_01', sourceLicense: 'CC0-1.0',
    sourceDescription: 'Generic photographic source by Rico Cilliers and Rob Tuytel. Runtime is an authored short lawn derivative, not a local Strahov survey or unchanged source plant model.',
    sourceGeometrySha256: geometry.sourceGeometrySha256, runtimeGeometryId: geometry.runtimeGeometryId,
    textures: grassTextures, fileBytes: grassTextures.reduce((sum, c) => sum + c.bytes, 0),
    theoreticalRgba8FullMipBytes: grassTextures.reduce((sum, c) => sum + c.theoreticalRgba8FullMipBytes, 0),
    levels, qualities, translucency: material.translucency, sourceNormalStrength: material.normalStrength,
    placement: { source: 'client/photo-grass-placement.ts:24', candidatesPerSquareMetre: 169, maximumRetainedRootsPerSquareMetre: 160, deterministicJitteredGridSide: 13, footprintCheckHalfExtentMetres: 0.08, cacheTiles: 256 },
  },
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ output: path.relative(root, output).replaceAll('\\', '/'), inputManifestSha256: result.inputManifestSha256, surfaceFamilies: surfaces.length, sourceChecksPassed: true, grassTriangles: Object.fromEntries(levels.map(l => [l.level, l.triangles])) }) + '\n');
