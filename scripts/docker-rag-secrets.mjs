import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, link, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAG_ROLES = Object.freeze({ owner: 'scs_rag_owner', ingester: 'scs_rag_ingester', reader: 'scs_rag_reader' });
export function credentialPaths(env = process.env) {
  const owner = env.RAG_OWNER_DIR || '/run/rag-owner', reader = env.RAG_READER_DIR || '/run/rag-reader';
  return { owner: join(owner, 'credentials.json'), reader: join(reader, 'credentials.json'), postgres: join(owner, 'postgres-password') };
}
export async function readPrivateText(path, maximum = 4096) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw Error('invalid-secret-file');
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text) > maximum || text.includes('\0')) throw Error('invalid-secret-file');
  return text.trim();
}
export async function readCredentials(path, names) {
  const value = JSON.parse(await readPrivateText(path));
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...names].sort().join(',') || names.some(name => typeof value[name] !== 'string' || !/^[a-f0-9]{64}$/.test(value[name]))) throw Error('invalid-db-credentials');
  return value;
}
async function createOnce(path, bytes) {
  await mkdir(dirname(path), { recursive: true, mode: 0o755 });
  const temporary = path + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o444);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await link(temporary, path); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { await unlink(temporary); }
}
export async function ensureRagSecrets(env = process.env) {
  const paths = credentialPaths(env);
  for (const [path, names] of [[paths.owner, ['owner', 'ingester']], [paths.reader, ['reader']]]) {
    try { await readCredentials(path, names); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await createOnce(path, JSON.stringify(Object.fromEntries(names.map(name => [name, randomBytes(32).toString('hex')]))) + '\n');
      await readCredentials(path, names);
    }
  }
  const owner = await readCredentials(paths.owner, ['owner', 'ingester']);
  await createOnce(paths.postgres, owner.owner + '\n');
  if (await readPrivateText(paths.postgres) !== owner.owner) throw Error('postgres-password-mismatch');
  return { ready: true };
}
export function ragConnection(role, password, env = process.env) {
  const host = env.RAG_DB_HOST || 'rag-db', database = env.RAG_DB_NAME || 'strahov_rag', port = env.RAG_DB_PORT || '5432';
  if (!Object.values(RAG_ROLES).includes(role) || !/^[a-f0-9]{64}$/.test(password) || !/^[a-zA-Z0-9.-]+$/.test(host) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database) || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('invalid-db-configuration');
  return `postgresql://${role}:${password}@${host}:${port}/${database}`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureRagSecrets().then(() => console.log('RAG credentials ready'), () => { console.error('RAG credentials initialization failed'); process.exitCode = 1; });
}
