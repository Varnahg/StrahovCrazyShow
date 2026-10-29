import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir,mkdtemp,readFile,unlink,writeFile,rm } from "node:fs/promises";
import { join,resolve,sep } from "node:path";
// @ts-ignore Plain Node deployment helper.
import { ensureRagSecrets,credentialPaths,readCredentials } from "../scripts/docker-rag-secrets.mjs";
// @ts-ignore Plain Node deployment helper.
import { gameEnvironment,runGame } from "../scripts/docker-game-entrypoint.mjs";
async function fixture(t:import("node:test").TestContext){
  const base=resolve(".cache/docker-rag-bootstrap-20261029");await mkdir(base,{recursive:true});
  const root=await mkdtemp(join(base,"test-"));
  t.after(async()=>{assert.ok(root.startsWith(base+sep));await rm(root,{recursive:true,force:true});});
  const env={RAG_OWNER_DIR:join(root,"owner"),RAG_READER_DIR:join(root,"reader"),OPENAI_API_KEY_FILE:join(root,"key")};
  await writeFile(env.OPENAI_API_KEY_FILE,"fixture-openai-key\n");return {root,env,paths:credentialPaths(env)};
}
test("credentials survive restarts and concurrent init, and derived password file recovers",async t=>{
  const f=await fixture(t);await Promise.all([ensureRagSecrets(f.env),ensureRagSecrets(f.env)]);
  const before=await readFile(f.paths.owner,"utf8"),reader=await readFile(f.paths.reader,"utf8");
  await unlink(f.paths.postgres);await ensureRagSecrets(f.env);
  assert.equal(await readFile(f.paths.owner,"utf8"),before);assert.equal(await readFile(f.paths.reader,"utf8"),reader);
  assert.equal((await readFile(f.paths.postgres,"utf8")).trim(),JSON.parse(before).owner);
});
test("invalid persisted credentials fail closed without rotation",async t=>{
  const f=await fixture(t);await ensureRagSecrets(f.env);
  await unlink(f.paths.owner);await writeFile(f.paths.owner,'{"owner":"partial"}');
  await assert.rejects(ensureRagSecrets(f.env));assert.equal(await readFile(f.paths.owner,"utf8"),'{"owner":"partial"}');
});
test("game reads only reader credentials and defaults model configuration",async t=>{
  const f=await fixture(t);await ensureRagSecrets(f.env);const owner=await readCredentials(f.paths.owner,["owner","ingester"]);
  await unlink(f.paths.owner);await unlink(f.paths.postgres);
  const env=await gameEnvironment(f.env);
  assert.match(env.RAG_DATABASE_URL,/^postgresql:\/\/scs_rag_reader:/);assert.ok(!env.RAG_DATABASE_URL.includes(owner.owner));assert.ok(!env.RAG_DATABASE_URL.includes(owner.ingester));
  assert.equal(env.OPENAI_API_KEY,"fixture-openai-key");assert.equal(env.OPENAI_MODEL,"gpt-6-luna");assert.equal(env.OPENAI_REASONING_EFFORT,"none");
});
test("entrypoint forwards termination and child exit, then removes listeners",async t=>{
  const f=await fixture(t);await ensureRagSecrets(f.env);
  const parent=new EventEmitter(),child=new EventEmitter() as EventEmitter&{kill:(signal:string)=>boolean};const signals:string[]=[];
  child.kill=signal=>{signals.push(signal);queueMicrotask(()=>child.emit("exit",null,signal));return true;};
  let spawned!:()=>void;const started=new Promise<void>(resolve=>spawned=resolve);
  const running=runGame(f.env,(_executable:string,args:string[],options:{env:Record<string,string>})=>{assert.deepEqual(args,["--import","tsx","server/index.ts"]);assert.match(options.env.RAG_DATABASE_URL,/scs_rag_reader/);spawned();return child;},parent);
  await started;parent.emit("SIGTERM");assert.equal(await running,143);assert.deepEqual(signals,["SIGTERM"]);assert.equal(parent.listenerCount("SIGTERM"),0);assert.equal(parent.listenerCount("SIGINT"),0);
});
test("entrypoint rejects missing key before spawning a process",async t=>{
  const f=await fixture(t);await ensureRagSecrets(f.env);await unlink(f.env.OPENAI_API_KEY_FILE);let spawned=false;
  await assert.rejects(runGame(f.env,()=>{spawned=true;}));assert.equal(spawned,false);
});
