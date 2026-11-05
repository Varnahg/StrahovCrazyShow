import { mkdir, open, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";
import { createIsolatedIntegrationEnvironment } from "../../../../../scripts/test-integration.mjs";
import { root, cache, buildDir, dist, port, apiPort, origin, apiOrigin, parseArguments, assertCanonicalMain,
  runDirectory, json, saveNew, hash, treeHashes, readInputs, assertInputIdentity, verifyBuild,
  exists, delay, stopController, bindSignals, ensureStopFile } from "./common.mjs";

async function build() {
  const started = performance.now();
  await mkdir(cache, { recursive: true }); await mkdir(buildDir);
  try {
    console.log("Hashing source/tests, public assets and installed Babylon bytes before build.");
    const inputs = await readInputs(); await saveNew(join(buildDir, "inputs-before.json"), inputs);
    for (const key of Object.keys(process.env)) if (/^VITE_/i.test(key)) delete process.env[key];
    const { build: viteBuild, loadConfigFromFile, mergeConfig } = await import("vite");
    const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, join(root, "vite.config.ts"), root, undefined, undefined, "native");
    if (!loaded) throw new Error("Missing production Vite configuration");
    await viteBuild(mergeConfig(loaded.config, {
      root, configFile: false, envFile: false, publicDir: false, cacheDir: join(buildDir, ".vite"),
      define: { "import.meta.env.VITE_SOURCE_SNAPSHOT_ID": JSON.stringify(inputs.sourceHash),
        "import.meta.env.VITE_MULTIPLAYER_URL": JSON.stringify(origin + "/realtime") },
      build: { outDir: dist, emptyOutDir: false, copyPublicDir: false },
    }));
    console.log("Revalidating all build inputs.");
    const after = await readInputs(); assertInputIdentity(inputs, after);
    const identity = { schemaVersion: 1, createdAt: new Date().toISOString(), inputs,
      buildElapsedMs: performance.now() - started,
      bundleFiles: await treeHashes(dist), clientBuildId: loaded.config.define?.["import.meta.env.VITE_CLIENT_BUILD_ID"] ?? null,
      hashAfterDurationMs: after.hashDurationMs, method: "Unmodified production bootstrap, explicitly authorized checkout recorded in inputs.checkout, build artifacts only; public assets served read-only" };
    await saveNew(join(buildDir, "identity.json"), identity);
    console.log(JSON.stringify({ status: "built", sourceHash: inputs.sourceHash, dist }));
  } catch (error) { await saveNew(join(buildDir, "failure.json"), { at: new Date().toISOString(), error: String(error) }); throw error; }
}

async function portFree(value) {
  const probe = net.createServer();
  await new Promise((done, reject) => { probe.once("error", reject); probe.listen(value, "127.0.0.1", done); });
  await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
}
async function weather() {
  if (!process.env.STRAHOV_PERF_WEATHER_FIXTURE) throw new Error("Explicit STRAHOV_PERF_WEATHER_FIXTURE is required");
  const bytes = await readFile(resolve(process.env.STRAHOV_PERF_WEATHER_FIXTURE)), value = JSON.parse(bytes);
  for (const key of ["temperature", "cloud", "rain", "wind", "windDirection"])
    if (!Number.isFinite(value[key])) throw new Error("Invalid QA weather: " + key);
  return { sha256: hash(bytes), value: { ...value, status: "fallback", source: "Řízené testovací počasí · uložený záznam",
    cloudSource: "Řízený meteorologický model · benchmark", cloudWindSource: "Řízené modelové proudění · benchmark" } };
}

export async function serve(name, signal) {
  signal?.throwIfAborted();
  const identity = await verifyBuild();
  signal?.throwIfAborted();
  const fixture = await weather(); await portFree(apiPort); await portFree(port);
  signal?.throwIfAborted();
  await mkdir(join(cache, "runs"), { recursive: true }); const run = runDirectory(name); await mkdir(run);
  const stopFile = join(run, "STOP"), control = stopController([stopFile]), unbind = bindSignals(control);
  const abort = () => control.stop("experiment-aborted");
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const apiLog = await open(join(run, "api.log"), "wx");
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:STATIC_DIR$|VITE_|STRAHOV_|NODE_OPTIONS$)/i.test(key)));
  const env = { ...createIsolatedIntegrationEnvironment(clean, join(run, "feedback")),
    STRAHOV_SOURCE_SNAPSHOT_ID: identity.inputs.sourceHash, STRAHOV_LOCAL_BENCHMARK_DIR: join(run, "benchmarks"),
    STRAHOV_LOCAL_BENCHMARK_ORIGIN: origin };
  let api, preview, exited = false, failure = null;
  const sockets = new Set();
  try {
    control.signal.throwIfAborted();
    await saveNew(join(run, "start.json"), { name, startedAt: new Date().toISOString(), pid: process.pid,
      sourceHash: identity.inputs.sourceHash, weatherSha256: fixture.sha256, origin, apiOrigin, stopFile, maximumMinutes: 90 });
    await saveNew(join(run, "weather.json"), fixture.value);
    control.signal.throwIfAborted();
    api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], { cwd: root, env,
      windowsHide: true, stdio: ["ignore", apiLog.fd, apiLog.fd] });
    api.once("error", error => { exited = true; failure = String(error); control.stop("API spawn error"); });
    api.once("exit", () => { exited = true; control.stop("API exited"); });
    const deadline = performance.now() + 30000;
    let ready = false;
    while (!control.signal.aborted && performance.now() < deadline) {
      if ((await readFile(join(run, "api.log"), "utf8")).includes("Strahov multiplayer: " + apiOrigin)) {
        try { ready = (await fetch(apiOrigin + "/api/health", { signal: AbortSignal.timeout(1000) })).ok; } catch {}
        if (ready) break;
      }
      await delay(100);
    }
    if (!ready) throw new Error("Owned API readiness failed: " + (failure ?? control.reason ?? "timeout"));
    const { preview: vitePreview } = await import("vite"), { default: express } = await import("express");
    preview = await vitePreview({ root, configFile: false, envFile: false, publicDir: false, build: { outDir: dist },
      plugins: [{ name: "render-profile-owned-preview", configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/api/weather") return next();
          res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(fixture.value));
        });
        server.middlewares.use(express.static(dist, { index: false, redirect: false, dotfiles: "deny" }));
        server.middlewares.use(express.static(join(root, "public"), { index: false, redirect: false, dotfiles: "deny" }));
      } }],
      preview: { host: "127.0.0.1", port, strictPort: true, proxy: {
        "/api": { target: apiOrigin, changeOrigin: false },
        "/realtime": { target: apiOrigin, changeOrigin: false, ws: true, rewrite: path => path.replace(/^\/realtime/, "") },
      } } });
    preview.httpServer.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    await saveNew(join(run, "runtime.json"), { name, sourceHash: identity.inputs.sourceHash, root, dist, origin, apiOrigin,
      verification: identity.verification ?? { mode: "exact-current-inputs" },
      pid: process.pid, apiPid: api.pid, startedAt: new Date().toISOString(), weatherSha256: fixture.sha256, stopFile,
      buildElapsedMs: identity.buildElapsedMs ?? null,
      automaticSessionDiagnostics: join(root, ".cache/game-diagnostics") });
    console.log(JSON.stringify({ status: "ready", name, sourceHash: identity.inputs.sourceHash, origin, run, stopFile }));
    await control.stopped;
    if (exited) throw new Error("Owned API ended before requested cleanup");
    if (control.reason?.startsWith("stop-check-error:")) throw new Error(control.reason);
  } catch (error) { failure = String(error); throw error; }
  finally {
    signal?.removeEventListener("abort", abort);
    control.dispose(); unbind(); await ensureStopFile(stopFile);
    const errors = [];
    // Independently launched peers own themselves; ask them to leave before stopping their API.
    if (await exists(join(run, "peers-start.json"))) {
      const deadline = performance.now() + 7000;
      while (!await exists(join(run, "peers-cleanup.json")) && performance.now() < deadline) await delay(100);
      if (!await exists(join(run, "peers-cleanup.json"))) errors.push("Peers did not confirm cleanup before API shutdown");
    }
    if (preview) try {
      await new Promise((done, reject) => {
        const timer = setTimeout(() => reject(new Error("Preview cleanup timeout")), 5000);
        preview.httpServer.close(error => { clearTimeout(timer); error ? reject(error) : done(); });
        preview.httpServer.closeAllConnections(); for (const socket of sockets) socket.destroy();
      });
    } catch (error) { errors.push(String(error)); }
    if (api && !exited) try {
      await new Promise((done, reject) => {
        const force = setTimeout(() => api.kill("SIGKILL"), 5000), limit = setTimeout(() => reject(new Error("API cleanup timeout")), 10000);
        api.once("exit", () => { clearTimeout(force); clearTimeout(limit); done(); }); api.kill("SIGTERM");
      });
    } catch (error) { errors.push(String(error)); }
    try { await verifyBuild(); } catch (error) { errors.push(String(error)); }
    await apiLog.close();
    await saveNew(join(run, "cleanup.json"), { finishedAt: new Date().toISOString(), reason: control.reason,
      failure, apiExited: exited, inputsRevalidated: !errors.length, cleanupErrors: errors });
    if (errors.length) throw new Error(errors.join("; "));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const { command, name } = args[0] === "--experiment" && args.length === 2
    ? { command: "--experiment", name: args[1] } : parseArguments(args);
  if (command === "help") { console.log("run.mjs --build baseline | --serve run1|run2|run3 | --peers run1|run2|run3 | --experiment run1|run2|run3. Experiment requires STRAHOV_PERF_EXPERIMENT_PLAN; STOP files are printed in runtime metadata."); return; }
  assertCanonicalMain();
  if (command === "--build" && process.env.STRAHOV_SHADER_CANDIDATE === "baseline")
    throw new Error("The archived baseline can only be served, never rebuilt");
  if (command === "--experiment") {
    const { runExperiment } = await import("../../../../../scripts/performance-experiment.mjs");
    const result = await runExperiment({ root, run: runDirectory(name),
      planPath: process.env.STRAHOV_PERF_EXPERIMENT_PLAN, serve: signal => serve(name, signal) });
    if (result.decision !== "measurement-complete") process.exitCode = 2;
  } else if (command === "--build") await build();
  else if (command === "--serve") await serve(name);
  else await (await import("./peers.mjs")).runPeers(name);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
