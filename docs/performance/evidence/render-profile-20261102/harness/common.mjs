import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { readReplaySourceManifest } from "../../../../../tests/replay/runner-config.mjs";

export const root = resolve(import.meta.dirname, "../../../../..");
export const cache = join(root, ".cache/render-profile-20261102");
export const buildDir = join(cache, "build"), dist = join(buildDir, "dist");
export const apiPort = 2568, port = 4179, origin = `http://127.0.0.1:${port}`;
export const apiOrigin = `http://127.0.0.1:${apiPort}`;
export const lifetimeMs = 90 * 60 * 1000;
export const hash = value => createHash("sha256").update(value).digest("hex");
export const json = async path => JSON.parse(await readFile(path, "utf8"));
export const saveNew = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
export const delay = ms => new Promise(done => setTimeout(done, ms));
export function parseArguments(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { command: "help" };
  const [command, name, ...extra] = args;
  if (extra.length || !(command === "--build" && name === "baseline" ||
      ["--serve", "--peers"].includes(command) && /^run[123](?:-attempt[1-9][0-9]*)?$/.test(name ?? "")))
    throw new Error("Usage: run.mjs --build baseline | --serve run1|run2|run3 | --peers run1|run2|run3; retry run1-attempt2 preserves failed starts");
  return { command, name };
}
export function assertCanonicalMain() {
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (resolve(process.cwd()).toLowerCase() !== root.toLowerCase() || branch !== "main")
    throw new Error("Use the canonical main checkout as cwd");
}
export function runDirectory(name) {
  if (!/^run[123](?:-attempt[1-9][0-9]*)?$/.test(name)) throw new Error("Invalid run name");
  return join(cache, "runs", name);
}
export async function exists(path) {
  try { await access(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
export async function fileHash(path) {
  const before = await stat(path), digest = createHash("sha256");
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  const after = await stat(path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("File changed while hashing: " + path);
  return { bytes: after.size, sha256: digest.digest("hex") };
}
export async function treeHashes(directory) {
  const files = {};
  async function walk(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files[relative(directory, path).replaceAll("\\", "/")] = await fileHash(path);
      else throw new Error("Unexpected symlink/special entry: " + path);
    }
  }
  await walk(directory); return files;
}
export async function readInputs() {
  const started = performance.now();
  const source = await readReplaySourceManifest(root);
  const publicFiles = await treeHashes(join(root, "public"));
  const dependencies = {};
  for (const name of ["@babylonjs/core", "@babylonjs/loaders"])
    dependencies[name] = await treeHashes(join(root, "node_modules", name));
  for (const name of ["vite", "tsx", "typescript", "@colyseus/core", "@colyseus/sdk"])
    dependencies[name] = await fileHash(join(root, "node_modules", name, "package.json"));
  const harness = await treeHashes(import.meta.dirname);
  const oldHarness = await fileHash(join(root, "docs/performance/evidence/low-tree-lod-20261102/harness/run.mjs"));
  return { source, publicFiles, dependencies, harness, oldHarness,
    sourceHash: source.sourceHash, publicHash: hash(JSON.stringify(publicFiles)),
    dependencyHash: hash(JSON.stringify(dependencies)), harnessHash: hash(JSON.stringify(harness)),
    hashDurationMs: performance.now() - started };
}
export function assertInputIdentity(expected, current) {
  for (const key of ["sourceHash", "publicHash", "dependencyHash", "harnessHash"])
    if (expected[key] !== current[key]) throw new Error("Changed input identity: " + key);
  if (expected.oldHarness.sha256 !== current.oldHarness.sha256) throw new Error("Protected low-tree harness changed");
}
export async function verifyBuild() {
  const identity = await json(join(buildDir, "identity.json"));
  assertInputIdentity(identity.inputs, await readInputs());
  if (JSON.stringify(identity.bundleFiles) !== JSON.stringify(await treeHashes(dist))) throw new Error("Built dist bytes changed");
  return identity;
}
/** Recursive polling prevents overlapping filesystem queries. Also works on Windows without signals. */
export function stopController(paths, options = {}) {
  const check = options.exists ?? exists, interval = options.pollMs ?? 250;
  const controller = new AbortController();
  let timer, reason, finish, disposed = false;
  const stopped = new Promise(done => { finish = done; });
  function stop(value) {
    if (reason || disposed) return;
    reason = value; clearTimeout(timer); clearTimeout(deadline);
    controller.abort(new Error(value)); finish(value);
  }
  const deadline = setTimeout(() => stop("90-minute-limit"), options.lifetimeMs ?? lifetimeMs);
  async function poll() {
    if (disposed || reason) return;
    try { for (const path of paths) {
      const found = await check(path);
      if (disposed || reason) return;
      if (found) { stop("STOP:" + path); return; }
    } }
    catch (error) { stop("stop-check-error:" + String(error)); return; }
    if (!reason && !disposed) timer = setTimeout(poll, interval);
  }
  void poll();
  return { signal: controller.signal, stopped, stop, get reason() { return reason; },
    dispose() { disposed = true; clearTimeout(timer); clearTimeout(deadline); } };
}
export function bindSignals(control) {
  const interrupt = () => control.stop("SIGINT"), terminate = () => control.stop("SIGTERM");
  process.once("SIGINT", interrupt); process.once("SIGTERM", terminate);
  return () => { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", terminate); };
}
export async function ensureStopFile(path) {
  try { await writeFile(path, "Requested by owned harness cleanup\n", { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
}
