/** Build artifacts only. All editable sources remain in the canonical main checkout. */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { readReplaySourceManifest } from "../../../../../tests/replay/runner-config.mjs";
import { createIsolatedIntegrationEnvironment } from "../../../../../scripts/test-integration.mjs";

const root = resolve(import.meta.dirname, "../../../../..");
const cache = join(root, ".cache/low-tree-lod-20261102");
const apiPort = 2568, port = 4179, origin = `http://127.0.0.1:${port}`;
const [command, label, ...extra] = process.argv.slice(2);
const usage = "From canonical main: node docs/performance/evidence/low-tree-lod-20261102/harness/run.mjs --build|--serve baseline[-N]|candidate[-N]";
if (command === "--help" && !label) { console.log(usage); process.exit(0); }
if (!["--build", "--serve"].includes(command) || !/^(?:baseline|candidate)(?:-[1-9][0-9]*)?$/.test(label ?? "") || extra.length)
  throw new Error(usage);
const variantKind = label.startsWith("baseline") ? "baseline" : "candidate";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
if (resolve(process.cwd()).toLowerCase() !== root.toLowerCase() || git("branch", "--show-current") !== "main")
  throw new Error("Run only from the canonical checkout on main");
const variant = join(cache, label), dist = join(variant, "dist");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const saveNew = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function fileHash(path) {
  const before = await stat(path), digest = createHash("sha256");
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  const after = await stat(path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
    throw new Error("File changed while hashing: " + path);
  return { bytes: after.size, sha256: digest.digest("hex") };
}

async function treeHashes(directory) {
  const files = {};
  async function walk(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files[relative(directory, path).replaceAll("\\", "/")] = await fileHash(path);
      else throw new Error("Unexpected link or special file: " + path);
    }
  }
  await walk(directory);
  return files;
}

async function harnessIdentity() {
  const names = [
    "docs/performance/evidence/low-tree-lod-20261102/harness/run.mjs",
    "tests/replay/runner-config.mjs", "scripts/test-integration.mjs",
  ];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, sha(await readFile(join(root, name)))])));
}

function serverIdentity(manifest) {
  // A later client-only candidate must not prevent serving the preserved A bundle.
  return Object.fromEntries(Object.entries(manifest.files).filter(([name]) =>
    /^(?:server\/|shared\/|patches\/)/.test(name) ||
    ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc", "tsconfig.json"].includes(name)));
}

async function dependencies() {
  const names = ["@babylonjs/core", "@babylonjs/loaders", "@colyseus/core", "@colyseus/sdk", "vite", "tsx"];
  return Object.fromEntries(await Promise.all(names.map(async name => {
    const path = join(root, "node_modules", name, "package.json");
    return [name, { version: (await json(path)).version, packageSha256: sha(await readFile(path)) }];
  })));
}

async function buildVariant() {
  await mkdir(cache, { recursive: true });
  await mkdir(variant); // Existing results, including failed attempts, are never overwritten.
  try {
    const buildStarted = performance.now(), timingsMs = {};
    const source = await readReplaySourceManifest(root);
    let hashingStarted = performance.now();
    console.log("Hashing public assets before " + label + " build (read-only).");
    const publicFiles = await treeHashes(join(root, "public"));
    timingsMs.publicHashBefore = performance.now() - hashingStarted;
    const harness = await harnessIdentity(), deps = await dependencies();
    await saveNew(join(variant, "source-before.json"), source);
    // Do not inherit external endpoints or environment-file configuration.
    for (const key of Object.keys(process.env)) if (/^VITE_/i.test(key)) delete process.env[key];
    const { build, loadConfigFromFile, mergeConfig } = await import("vite");
    const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, join(root, "vite.config.ts"), root, undefined, undefined, "native");
    if (!loaded) throw new Error("Production Vite configuration not found");
    await build(mergeConfig(loaded.config, {
      root, configFile: false, envFile: false, publicDir: false,
      cacheDir: join(variant, ".vite"),
      define: {
        "import.meta.env.VITE_SOURCE_SNAPSHOT_ID": JSON.stringify(source.sourceHash),
        "import.meta.env.VITE_MULTIPLAYER_URL": JSON.stringify(origin + "/realtime"),
      },
      build: { outDir: dist, emptyOutDir: false, copyPublicDir: false },
    }));
    const after = await readReplaySourceManifest(root);
    hashingStarted = performance.now();
    console.log("Revalidating public assets after " + label + " build (read-only).");
    const publicAfter = await treeHashes(join(root, "public"));
    timingsMs.publicHashAfter = performance.now() - hashingStarted;
    if (source.sourceHash !== after.sourceHash || !same(publicFiles, publicAfter) ||
        !same(harness, await harnessIdentity()) || !same(deps, await dependencies()))
      throw new Error("Sources, tests, assets, harness or dependency identity changed during build");
    const identity = {
      schemaVersion: 1, label, variantKind, root, createdAt: new Date().toISOString(), source,
      publicFiles, publicContentHash: sha(JSON.stringify(publicFiles)),
      serverFiles: serverIdentity(source), harness, dependencies: deps,
      clientBuildId: loaded.config.define?.["import.meta.env.VITE_CLIENT_BUILD_ID"] ?? null,
      bundleFiles: await treeHashes(dist),
      method: "Unmodified production bootstrap; build output only, shared read-only public assets, no source copy or injected runtime",
    };
    identity.timingsMs = { ...timingsMs, totalBuildAndValidation: performance.now() - buildStarted };
    await saveNew(join(variant, "identity.json"), identity);
    console.log(JSON.stringify({ label, sourceHash: source.sourceHash, publicContentHash: identity.publicContentHash, dist }));
  } catch (error) {
    await saveNew(join(variant, "build-failure.json"), { at: new Date().toISOString(), error: String(error) });
    throw error;
  }
}

async function verifyInputs(identity) {
  const current = await readReplaySourceManifest(root);
  if (identity.schemaVersion !== 1 || identity.label !== label || identity.root !== root ||
      !same(identity.serverFiles, serverIdentity(current)) ||
      identity.source.publicGitTree !== current.publicGitTree ||
      !same(identity.publicFiles, await treeHashes(join(root, "public"))) ||
      !same(identity.bundleFiles, await treeHashes(dist)) ||
      !same(identity.harness, await harnessIdentity()) ||
      !same(identity.dependencies, await dependencies()))
    throw new Error("Preserved build, public assets, server or harness/dependencies differ; serving refused");
}

async function assertPortFree(value) {
  const probe = net.createServer();
  await new Promise((done, reject) => { probe.once("error", reject); probe.listen(value, "127.0.0.1", done); });
  await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
}

async function weatherFixture() {
  if (!process.env.STRAHOV_PERF_WEATHER_FIXTURE) return null;
  const bytes = await readFile(resolve(process.env.STRAHOV_PERF_WEATHER_FIXTURE));
  const value = JSON.parse(bytes);
  for (const key of ["temperature", "cloud", "rain", "wind", "windDirection"])
    if (!Number.isFinite(value[key])) throw new Error("Invalid weather fixture: " + key);
  return { sha256: sha(bytes), body: JSON.stringify({ ...value, status: "fallback",
    source: "Řízené testovací počasí · uložený záznam",
    cloudSource: "Řízený meteorologický model · benchmark",
    cloudWindSource: "Řízené modelové proudění · benchmark" }) };
}

async function serveVariant() {
  const identity = await json(join(variant, "identity.json"));
  await verifyInputs(identity);
  await assertPortFree(apiPort);
  await assertPortFree(port);
  const fixture = await weatherFixture();
  const run = join(cache, "runs", label + "-" + Date.now() + "-" + randomUUID());
  await mkdir(run, { recursive: true });
  const log = await open(join(run, "api.log"), "wx");
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:STATIC_DIR$|VITE_|STRAHOV_|NODE_OPTIONS$)/i.test(key)));
  const env = {
    ...createIsolatedIntegrationEnvironment(cleanEnv, join(run, "feedback")),
    STRAHOV_SOURCE_SNAPSHOT_ID: identity.source.sourceHash,
    STRAHOV_LOCAL_BENCHMARK_DIR: join(run, "benchmarks"),
    STRAHOV_LOCAL_BENCHMARK_ORIGIN: origin,
  };
  let api, preview, apiStopped = false, apiError, stopReason = "completed";
  const sockets = new Set();
  let finish;
  const stopped = new Promise(done => { finish = done; });
  const stop = reason => { if (stopReason === "completed") stopReason = reason; finish(); };
  const onInterrupt = () => stop("SIGINT"), onTerminate = () => stop("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  const timer = setTimeout(() => stop("30-minute-limit"), 30 * 60 * 1000);
  try {
    api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd: root, env, windowsHide: true, stdio: ["ignore", log.fd, log.fd],
    });
    api.on("error", error => { apiError = error; apiStopped = true; stop("API spawn error"); });
    api.on("exit", () => { apiStopped = true; stop("API exited"); });
    const deadline = performance.now() + 30_000;
    let ready = false;
    while (!apiStopped && performance.now() < deadline && stopReason === "completed") {
      const output = await readFile(join(run, "api.log"), "utf8");
      if (output.includes(`Strahov multiplayer: http://127.0.0.1:${apiPort}`)) {
        try { ready = (await fetch(`http://127.0.0.1:${apiPort}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
        if (ready) break;
      }
      await new Promise(done => setTimeout(done, 100));
    }
    if (!ready) throw new Error("Owned API did not become ready: " + (apiError ?? stopReason));
    const { preview: createPreview } = await import("vite");
    const { default: express } = await import("express");
    preview = await createPreview({
      root, configFile: false, envFile: false, publicDir: false, build: { outDir: dist },
      plugins: [{ name: "owned-low-tree-lod-preview", configurePreviewServer(server) {
        if (fixture) server.middlewares.use((req, res, next) => {
          if (req.url !== "/api/weather") return next();
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(fixture.body);
        });
        // Order is deliberate: immutable bundle files win over public paths;
        // both run before Vite's SPA fallback, without copying public/.
        server.middlewares.use(express.static(dist, { index: false, redirect: false, dotfiles: "deny" }));
        server.middlewares.use(express.static(join(root, "public"), { index: false, redirect: false, dotfiles: "deny" }));
      } }],
      preview: { host: "127.0.0.1", port, strictPort: true, proxy: {
        "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
        "/realtime": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, ws: true, rewrite: path => path.replace(/^\/realtime/, "") },
      } },
    });
    preview.httpServer.on("connection", socket => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await saveNew(join(run, "runtime.json"), {
      label, variantKind, sourceHash: identity.source.sourceHash, publicContentHash: identity.publicContentHash,
      root, dist, origin, apiPort, pid: process.pid, apiPid: api.pid,
      startedAt: new Date().toISOString(), weatherSha256: fixture?.sha256 ?? null,
      automaticSessionDiagnostics: join(root, ".cache/game-diagnostics"),
    });
    console.log(JSON.stringify({ origin, label, run, sourceHash: identity.source.sourceHash, apiPid: api.pid }));
    console.log("Use normal multiplayer UI. Keep this CLI running; Ctrl+C stops only its own preview/API. 30-minute limit.");
    await stopped;
    if (apiError || apiStopped) throw new Error("Owned API ended before requested cleanup");
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
    const cleanupErrors = [];
    if (preview) {
      try {
        await new Promise((done, reject) => {
          const limit = setTimeout(() => reject(new Error("Owned preview cleanup timeout")), 5000);
          preview.httpServer.close(error => { clearTimeout(limit); error ? reject(error) : done(); });
          preview.httpServer.closeAllConnections();
          // closeAllConnections excludes upgraded WebSocket connections.
          for (const socket of sockets) socket.destroy();
        });
      } catch (error) { cleanupErrors.push(String(error)); }
    }
    if (api && !apiStopped) {
      try {
        await new Promise((done, reject) => {
          const grace = setTimeout(() => api.kill("SIGKILL"), 5000);
          const limit = setTimeout(() => { clearTimeout(grace); reject(new Error("Owned API cleanup timeout")); }, 10_000);
          api.once("exit", () => { clearTimeout(grace); clearTimeout(limit); done(); });
          api.kill("SIGTERM");
        });
      } catch (error) { cleanupErrors.push(String(error)); }
    }
    try { await verifyInputs(identity); } catch (error) { cleanupErrors.push(String(error)); }
    await log.close();
    await saveNew(join(run, "cleanup.json"), { finishedAt: new Date().toISOString(), stopReason, apiStopped, inputRevalidated: cleanupErrors.length === 0, cleanupErrors });
    if (cleanupErrors.length) throw new Error("Cleanup/input verification failed: " + cleanupErrors.join("; "));
  }
}

if (command === "--build") await buildVariant();
else await serveVariant();
