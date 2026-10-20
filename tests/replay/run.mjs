import { build, preview } from "vite";
import express from "express";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { freezeReplayFixtures } from "./replay.mjs";

const root = resolve(import.meta.dirname, "../..");
const cache = resolve(root, ".cache/recorded-walkthrough");
const outDir = resolve(cache, "dist");
const port = 4291,
  apiPort = 2568,
  endpoint = "http://127.0.0.1:" + port;
const args = new Set(process.argv.slice(2));
for (const arg of args)
  if (!["--build-only", "--skip-build"].includes(arg))
    throw new Error("Unknown argument: " + arg);
if (args.has("--build-only") && args.has("--skip-build"))
  throw new Error("Conflicting arguments");
const ids = new Set(["b6-20261017", "outdoor-car-20261018"]);
await mkdir(cache, { recursive: true });

async function sourceManifest() {
  if (
    execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", "public"],
      { cwd: root, encoding: "utf8" },
    ).trim()
  )
    throw new Error(
      "Public assets differ from the pinned Git tree; test build refused",
    );
  const publicGitTree = execFileSync("git", ["rev-parse", "HEAD:public"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const names = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "client",
      "server",
      "shared",
      "scripts",
      "tests",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "vite.config.ts",
      "index.html",
      "docs/reality-pack/landmarks/geometry-source.json",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const files = {};
  for (const name of names)
    files[name] = createHash("sha256")
      .update(await readFile(resolve(root, name)))
      .digest("hex");
  return {
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    publicGitTree,
    sourceHash: createHash("sha256")
      .update(JSON.stringify({ files, publicGitTree }))
      .digest("hex"),
    files,
  };
}
const manifest = await sourceManifest();
if (!args.has("--skip-build")) {
  await build({
    root,
    configFile: resolve(root, "vite.config.ts"),
    publicDir: false,
    plugins: [
      {
        name: "recorded-walkthrough-test-only",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            const replaced = html.replace(
              'src="/client/main.tsx"',
              'src="/tests/replay/browser-entry.ts"',
            );
            if (replaced === html)
              throw new Error(
                "Production bootstrap changed; test injection refused",
              );
            return replaced.replace(
              "</head>",
              '<meta name="replay-source" content="' +
                manifest.sourceHash +
                '"></head>',
            );
          },
        },
      },
    ],
    build: { outDir, emptyOutDir: false },
  });
  if ((await sourceManifest()).sourceHash !== manifest.sourceHash)
    throw new Error("Sources changed during build");
  await writeFile(
    resolve(cache, "source-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
} else {
  const previous = JSON.parse(
    await readFile(resolve(cache, "source-manifest.json"), "utf8"),
  );
  if (previous.sourceHash !== manifest.sourceHash)
    throw new Error("Test build is stale; rebuild");
}
if (args.has("--build-only")) process.exit(0);

const entries = await Promise.all(
  [...ids].map(async (id) => [
    id,
    await readFile(resolve(root, "tests/replay/fixtures", id + ".json")),
  ]),
);
const frozenFixture = freezeReplayFixtures(entries, manifest, (bytes) =>
  createHash("sha256").update(bytes).digest("hex"),
);
const shutdown = new AbortController();
let finish;
const stopped = new Promise((done) => {
  finish = done;
});
const stop = () => {
  shutdown.abort();
  finish();
};
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
const lifetimeTimer = setTimeout(stop, 1800000);

let server, api;
let apiOutput = "",
  apiExited = false;
try {
  shutdown.signal.throwIfAborted();
  api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(apiPort) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  api.once("exit", () => {
    apiExited = true;
  });
  api.on("error", (e) => {
    apiExited = true;
    apiOutput += String(e);
  });
  for (const stream of [api.stdout, api.stderr])
    stream.on("data", (chunk) => {
      apiOutput = (apiOutput + chunk).slice(-1048576);
    });
  let ready = false;
  const readinessDeadline = performance.now() + 30000;
  while (
    !apiExited &&
    !shutdown.signal.aborted &&
    performance.now() < readinessDeadline
  ) {
    if (
      apiOutput.includes("Strahov multiplayer: http://127.0.0.1:" + apiPort)
    ) {
      try {
        ready = (
          await fetch("http://127.0.0.1:" + apiPort + "/api/health", {
            signal: AbortSignal.any([
              shutdown.signal,
              AbortSignal.timeout(
                Math.max(
                  1,
                  Math.min(
                    5000,
                    Math.ceil(readinessDeadline - performance.now()),
                  ),
                ),
              ),
            ]),
          })
        ).ok;
      } catch {}
      if (ready) break;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  shutdown.signal.throwIfAborted();
  if (!ready) throw new Error("Owned API did not start: " + apiOutput);
  server = await preview({
    root,
    configFile: false,
    publicDir: false,
    build: { outDir },
    plugins: [
      {
        name: "recorded-walkthrough-local-io",
        configurePreviewServer(instance) {
          instance.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url, endpoint);
            if (url.pathname.startsWith("/__replay/fixture/")) {
              const id = url.pathname.slice("/__replay/fixture/".length);
              if (!ids.has(id)) {
                res.statusCode = 404;
                res.end();
                return;
              }
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(frozenFixture(id));
            } else if (url.pathname === "/__replay/report") {
              if (
                req.method !== "POST" ||
                req.headers.origin !== endpoint ||
                req.headers["content-type"] !== "application/json"
              ) {
                res.statusCode = 403;
                res.end();
                return;
              }
              try {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 262144) throw new Error("Oversized report");
                  chunks.push(chunk);
                }
                const report = JSON.parse(
                  Buffer.concat(chunks).toString("utf8"),
                );
                if (
                  !ids.has(report.scenario) ||
                  report.sourceHash !== manifest.sourceHash ||
                  !["failed", "complete"].includes(report.status)
                )
                  throw new Error("Invalid report");
                const filename = report.scenario + "-" + Date.now() + ".json";
                await writeFile(
                  resolve(cache, filename),
                  JSON.stringify(report, null, 2) + "\n",
                  { flag: "wx" },
                );
                console.log(
                  "Replay report: " + filename + " = " + report.status,
                );
                res.end("{}");
              } catch (error) {
                res.statusCode = 400;
                res.end(String(error));
              }
            } else next();
          });
          instance.middlewares.use(express.static(resolve(root, "public")));
        },
      },
    ],
    preview: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: {
        "/api": { target: "http://127.0.0.1:" + apiPort },
        "/realtime": {
          target: "http://127.0.0.1:" + apiPort,
          ws: true,
          rewrite: (path) => path.replace(/^\/realtime/, ""),
        },
      },
    },
  });
  await writeFile(
    resolve(cache, "runtime.json"),
    JSON.stringify(
      {
        pid: process.pid,
        apiPid: api.pid,
        root,
        endpoint,
        apiPort,
        sourceHash: manifest.sourceHash,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Test-only production preview: " + endpoint);
  console.log(
    "Open /?scenario=b6-20261017&renderBackend=webgpu (or outdoor-car-20261018), then choose guest.",
  );
  await stopped;
} finally {
  clearTimeout(lifetimeTimer);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.removeListener(signal, stop);
  if (server)
    await new Promise((done) => {
      server.httpServer.close(done);
      server.httpServer.closeAllConnections();
    });
  if (api && !apiExited) {
    const closed = new Promise((done) => api.once("exit", done));
    api.kill();
    await closed;
  }
  await writeFile(resolve(cache, "api.log"), apiOutput);
}
