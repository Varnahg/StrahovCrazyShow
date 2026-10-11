/** Change only public test-session profile input, never frozen game/runtime code. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname, extname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const ownPath = import.meta.filename;
const snapshot = resolve(process.argv[2]);
const args = process.argv.slice(3);
if (args.length < 5) throw new Error('Usage: node --import tsx performance-diverse.mjs SNAPSHOT ENDPOINT COUNT SECONDS LAYOUT OUTPUT [WARMUP] [TOTAL_POPULATION] [STOP_FILE]');
if (new URL(args[0]).port === '2567') throw new Error('Use an isolated server.');
const source = JSON.parse(await readFile(join(snapshot, 'source-manifest.json'), 'utf8'));
const externalHarness = process.env.STRAHOV_PERF_HARNESS_SOURCE;
if (externalHarness && !isAbsolute(externalHarness)) throw new Error('STRAHOV_PERF_HARNESS_SOURCE must be an absolute path to the external network harness.');
const harnessPath = externalHarness || join(snapshot, 'scripts/performance-network.ts');
const hash = (body) => createHash('sha256').update(body).digest('hex');
const verifiedGameImports = [];
async function verifyGameFile(actualPath, relativePath, binding, importer) {
  const expected = source.files[relativePath];
  if (!expected) throw new Error('Snapshot manifest does not identify ' + relativePath);
  const actualSha256 = hash(await readFile(actualPath));
  const snapshotSha256 = hash(await readFile(join(snapshot, relativePath)));
  if (actualSha256 !== expected || snapshotSha256 !== expected) throw new Error('Actual game import differs from the selected snapshot: ' + binding + ' (' + actualPath + ')');
  verifiedGameImports.push({binding, importer, actualPath, snapshotPath: relativePath, actualSha256, snapshotSha256, matchesSnapshot: true});
}
async function verifyImportedBinding(importer, localName, relativePath) {
  const file = ts.createSourceFile(importer, await readFile(importer, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const binding = bindings.elements.find((element) => element.name.text === localName);
    if (!binding) continue;
    if ((binding.propertyName?.text || binding.name.text) !== localName) throw new Error('Unexpected aliased game import: ' + localName);
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith('.')) throw new Error('Game imports must resolve to a verifiable local source file: ' + specifier);
    const target = resolve(dirname(importer), specifier);
    return verifyGameFile(extname(target) ? target : target + '.ts', relativePath, localName, importer);
  }
  throw new Error('Cannot identify the actual game import: ' + localName + ' in ' + importer);
}
await verifyImportedBinding(harnessPath, 'DEFAULT_PROFILE', 'shared/types.ts');
await verifyImportedBinding(harnessPath, 'canonicalInput', 'shared/netcode.ts');
await verifyImportedBinding(harnessPath, 'PROTOCOL_VERSION', 'shared/netcode.ts');
await verifyGameFile(join(snapshot, 'client/avatar-presets.ts'), 'client/avatar-presets.ts', 'applyAvatarPreset', ownPath);
await verifyGameFile(join(snapshot, 'shared/types.ts'), 'shared/types.ts', 'DEFAULT_AVATAR', ownPath);
await verifyImportedBinding(join(snapshot, 'client/avatar-presets.ts'), 'AvatarConfig', 'shared/types.ts');
const harnessProvenance = {
  sourceSnapshotId: source.snapshotId,
  harnessPath,
  harnessSha256: hash(await readFile(harnessPath)),
  wrapperPath: ownPath,
  wrapperSha256: hash(await readFile(ownPath)),
  externalHarness: Boolean(externalHarness),
  verifiedGameImports,
};
const { applyAvatarPreset } = await import(pathToFileURL(join(snapshot, 'client/avatar-presets.ts')).href);
const { DEFAULT_AVATAR } = await import(pathToFileURL(join(snapshot, 'shared/types.ts')).href);
const capturePath = resolve(snapshot, args[4] + '.profiles.json');
const count = Number(args[1]);
const capture = {
  capturedAt: new Date().toISOString(), sourceSnapshotId: source.snapshotId,
  extraHarnessSha256: harnessProvenance.wrapperSha256,
  harnessProvenance,
  presetSourceSha256: source.files['client/avatar-presets.ts'],
  method: 'The game snapshot is unchanged. The separately hashed network harness and wrapper supply actual complete fictional preset profiles through normal POST /api/session input; their actual game imports match the selected snapshot. Server sanitization/authentication and input limits remain active.',
  expectedBotCount: count, issuedProfiles: [],
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) !== args[0] + '/api/session' || init?.method !== 'POST') return nativeFetch(input, init);
  const body = JSON.parse(init.body);
  const index = capture.issuedProfiles.length;
  body.profile.avatar = applyAvatarPreset(index % 6, DEFAULT_AVATAR);
  const response = await nativeFetch(input, { ...init, body: JSON.stringify(body) });
  if (response.ok) {
    const session = await response.clone().json();
    capture.issuedProfiles.push({ id: session.id, nickname: body.profile.nickname, avatar: body.profile.avatar });
    if (capture.issuedProfiles.length === count) await writeFile(capturePath, JSON.stringify(capture, null, 2) + '\n');
  }
  return response;
};
process.chdir(snapshot);
process.argv = [process.argv[0], harnessPath, ...args];
const previousMetadata = process.env.STRAHOV_PERF_HARNESS_METADATA;
process.env.STRAHOV_PERF_HARNESS_METADATA = JSON.stringify(harnessProvenance);
try {
  await import(pathToFileURL(harnessPath).href);
} finally {
  globalThis.fetch = nativeFetch;
  if (previousMetadata === undefined) delete process.env.STRAHOV_PERF_HARNESS_METADATA;
  else process.env.STRAHOV_PERF_HARNESS_METADATA = previousMetadata;
  await writeFile(capturePath, JSON.stringify(capture, null, 2) + '\n');
}
