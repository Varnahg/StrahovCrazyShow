import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";

test("full Compose orders database bootstrap and confines secrets to their consumers", t => {
  const docker = spawnSync("docker", ["compose", "version"], { encoding: "utf8", windowsHide: true });
  if (docker.status !== 0) { t.skip("Docker Compose CLI is unavailable"); return; }
  const base = resolve(".cache/docker-rag-packaging-20261029"); mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, "config-"));
  t.after(() => rmSync(dir, { recursive: true }));
  const envFile = join(dir, "fixture.env"), secretFile = join(dir, "key.txt");
  writeFileSync(secretFile, "fixture-not-a-real-api-key");
  writeFileSync(envFile, "OPENAI_SECRET_FILE=" + secretFile.replaceAll("\\", "/") + "\n");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(OPENAI_|RAG_|CRAZY_TYPKA_|LINEAR_|FEEDBACK_|COMPOSE_)/.test(key)));
  const result = spawnSync("docker", ["compose", "--env-file", envFile, "-f", "compose.full.yaml", "config", "--format", "json"], { encoding: "utf8", windowsHide: true, env });
  assert.equal(result.status, 0, "Compose configuration must validate");
  const config = JSON.parse(result.stdout), { game, "rag-db": db, "rag-bootstrap": bootstrap, "rag-secrets": secrets } = config.services;
  assert.equal(game.depends_on["rag-bootstrap"].condition, "service_completed_successfully");
  assert.equal(bootstrap.depends_on["rag-db"].condition, "service_healthy");
  assert.equal(db.depends_on["rag-secrets"].condition, "service_completed_successfully");
  assert.equal(bootstrap.restart, "no"); assert.equal(secrets.restart, "no");
  assert.equal(db.ports, undefined, "DB stays inside the Compose network");
  assert.equal(game.environment.OPENAI_API_KEY, undefined);
  assert.equal(game.environment.RAG_DATABASE_URL, undefined, "reader credentials are constructed at runtime");
  assert.equal(game.environment.OPENAI_API_KEY_FILE, "/run/secrets/openai_api_key");
  assert.ok(!game.volumes.some((v: { target: string }) => v.target === "/run/rag-owner"));
  assert.ok(game.volumes.some((v: { target: string; read_only: boolean }) => v.target === "/run/rag-reader" && v.read_only));
  assert.equal(db.secrets, undefined, "database does not receive the OpenAI key");
  assert.equal(secrets.secrets, undefined);
  assert.equal(config.secrets.openai_api_key.file, secretFile.replaceAll("\\", "/"));
  assert.doesNotMatch(result.stdout, /fixture-not-a-real-api-key/);
});

test("credentials are excluded from Git and the Docker build context", () => {
  assert.match(readFileSync(".gitignore", "utf8"), /^secrets\/$/m);
  const ignore = readFileSync(".dockerignore", "utf8");
  assert.match(ignore, /^\*\*$/m);
  assert.doesNotMatch(ignore, /^!secrets(?:\/|$)/m);
  assert.match(ignore, /^\*\*\/\.env\.\*$/m);
  assert.doesNotMatch(readFileSync("Dockerfile", "utf8"), /^\s*(?:ARG|ENV)\s+OPENAI_API_KEY\b/m);
});
