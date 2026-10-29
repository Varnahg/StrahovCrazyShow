import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialPaths, readCredentials, readPrivateText, ragConnection, RAG_ROLES } from './docker-rag-secrets.mjs';

export async function gameEnvironment(env = process.env) {
  const { reader } = await readCredentials(credentialPaths(env).reader, ['reader']);
  const key = await readPrivateText(env.OPENAI_API_KEY_FILE || '/run/secrets/openai_api_key');
  if (!key) throw Error('openai-key-required');
  return { ...env, RAG_DATABASE_URL: ragConnection(RAG_ROLES.reader, reader, env), OPENAI_API_KEY: key,
    CRAZY_TYPKA_ENABLED: env.CRAZY_TYPKA_ENABLED || '1', OPENAI_MODEL: env.OPENAI_MODEL || 'gpt-6-luna', OPENAI_REASONING_EFFORT: env.OPENAI_REASONING_EFFORT || 'none' };
}
export async function runGame(env = process.env, spawnChild = spawn, parent = process) {
  const configured = await gameEnvironment(env);
  return new Promise((resolve, reject) => {
    const child = spawnChild(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: configured, stdio: 'inherit' });
    const term = () => child.kill('SIGTERM'), interrupt = () => child.kill('SIGINT');
    const cleanup = () => { parent.off('SIGTERM', term); parent.off('SIGINT', interrupt); };
    parent.on('SIGTERM', term); parent.on('SIGINT', interrupt);
    child.once('error', () => { cleanup(); reject(Error('game-start-failed')); });
    child.once('exit', (code, signal) => { cleanup(); resolve(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)); });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGame().then(code => { process.exitCode = code; }, () => { console.error('Game configuration or startup failed'); process.exitCode = 1; });
}
