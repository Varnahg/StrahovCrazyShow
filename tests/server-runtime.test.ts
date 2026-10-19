import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import express from "express";
import {
  createServerReadiness,
  createStaticClientHandler,
  readServerConfig,
} from "../server/runtime";

const port = 18081;
const fixtureRoot = resolve(".cache/docker-runtime-tests");

test("server configuration preserves loopback defaults and validates explicit deployment settings", () => {
  assert.deepEqual(readServerConfig({}), {
    host: "127.0.0.1",
    port: 2567,
    staticDir: undefined,
  });
  assert.deepEqual(
    readServerConfig({
      HOST: "0.0.0.0",
      PORT: "8080",
      STATIC_DIR: fixtureRoot,
    }),
    {
      host: "0.0.0.0",
      port: 8080,
      staticDir: fixtureRoot,
    },
  );
  assert.equal(readServerConfig({ HOST: "::1", PORT: "65535" }).port, 65535);
  for (const value of [
    "",
    "0",
    "-1",
    "65536",
    "2567.5",
    "1e3",
    "NaN",
    " 2567",
    "2567 ",
  ])
    assert.throws(() => readServerConfig({ PORT: value }), /PORT/);
  for (const value of [
    "",
    " ",
    "http://localhost",
    "localhost/path",
    "host\0name",
  ])
    assert.throws(() => readServerConfig({ HOST: value }), /HOST/);
  for (const value of ["", "dist", "../dist"])
    assert.throws(() => readServerConfig({ STATIC_DIR: value }), /STATIC_DIR/);
});

function get(
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {},
) {
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    body: Buffer;
  }>((done, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, ...options },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () =>
          done({
            status: res.statusCode!,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(5000, () =>
      req.destroy(new Error("Runtime HTTP test timed out")),
    );
    req.on("error", reject);
    req.end();
  });
}

test("static HTTP serves only the explicit build with MIME, revalidation and readiness lifecycle", async (t) => {
  await mkdir(fixtureRoot, { recursive: true });
  const directory = await mkdtemp(join(fixtureRoot, "fixture-"));
  let server: Server | undefined;
  t.after(async () => {
    if (server?.listening) {
      const closing = new Promise<void>((done, reject) =>
        server!.close((error) => (error ? reject(error) : done())),
      );
      server.closeAllConnections();
      await closing;
    }
    // Cleanup is confined to this test's freshly created reserved directory.
    assert.ok(directory.startsWith(fixtureRoot + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const build = join(directory, "dist");
  await mkdir(join(build, "assets"), { recursive: true });
  await mkdir(join(build, "models"));
  await writeFile(join(directory, "private.txt"), "outside the client build");
  await assert.rejects(createStaticClientHandler(build), /built index\.html/);
  await assert.rejects(createStaticClientHandler("dist"), /absolute path/);
  const html = "<!doctype html><title>Production fixture</title>";
  await writeFile(join(build, "index.html"), html);
  await writeFile(
    join(build, "assets", "app-123.js"),
    "export const build = 'fixture';",
  );
  await writeFile(
    join(build, "assets", "physics.wasm"),
    Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
  );
  await writeFile(
    join(build, "models", "world.glb"),
    Buffer.from("glTF-fixture-model"),
  );
  await writeFile(join(build, ".env"), "PRIVATE=not-public");
  const readiness = createServerReadiness();
  const app = express();
  app.get("/api/health", (_req, res) => readiness.reply(res));
  app.get("/api/players", (_req, res) =>
    res.status(403).json({ error: "Private" }),
  );
  app.use(await createStaticClientHandler(build));
  server = createServer(app);
  await new Promise<void>((done, reject) => {
    server!.once("error", reject);
    server!.listen(port, "127.0.0.1", done);
  });

  const pending = await get("/api/health");
  assert.equal(pending.status, 503);
  assert.deepEqual(JSON.parse(pending.body.toString()), {
    ok: false,
    demo: true,
  });
  readiness.ready();
  const healthy = await get("/api/health");
  assert.equal(healthy.status, 200);
  assert.equal(healthy.headers["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(healthy.body.toString()), {
    ok: true,
    demo: true,
  });
  assert.equal((await get("/api/players")).status, 403);

  const root = await get("/");
  assert.equal(root.status, 200);
  assert.match(root.headers["content-type"]!, /^text\/html/);
  assert.equal(root.body.toString(), html);
  assert.ok(root.headers.etag);
  assert.ok(root.headers["last-modified"]);
  assert.match(root.headers["cache-control"]!, /max-age=0/);
  assert.doesNotMatch(root.headers["cache-control"]!, /immutable/);
  const fresh = await get("/", {
    headers: { "If-None-Match": root.headers.etag! },
  });
  assert.equal(fresh.status, 304);
  assert.equal(fresh.body.length, 0);
  const head = await get("/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers["content-length"]), Buffer.byteLength(html));
  assert.match(
    (await get("/assets/app-123.js")).headers["content-type"]!,
    /javascript/,
  );
  assert.match(
    (await get("/assets/physics.wasm")).headers["content-type"]!,
    /^application\/wasm/,
  );
  const model = await get("/models/world.glb");
  assert.match(model.headers["content-type"]!, /^model\/gltf-binary/);
  assert.equal(model.body.toString(), "glTF-fixture-model");
  const range = await get("/models/world.glb", {
    headers: { Range: "bytes=0-3" },
  });
  assert.equal(range.status, 206);
  assert.equal(range.body.toString(), "glTF");

  for (const path of [
    "/assets/missing.js",
    "/models/missing.glb",
    "/unknown",
    "/private.txt",
    "/models/",
  ]) {
    const missing = await get(path);
    assert.equal(missing.status, 404, path);
    assert.match(missing.headers["content-type"]!, /^text\/plain/);
    assert.equal(missing.headers["cache-control"], "no-store");
    assert.equal(missing.body.toString(), "Not found");
  }
  for (const path of ["/.env", "/%2e%2e/private.txt"]) {
    const rejected = await get(path);
    assert.equal(rejected.status, 403, path);
    assert.equal(rejected.body.toString(), "Request rejected");
  }
  assert.equal((await get("/", { method: "POST" })).status, 405);
  assert.equal((await get("/%ZZ")).status, 400);
  readiness.stop();
  readiness.ready(); // A startup completion racing shutdown must not reopen readiness.
  assert.equal((await get("/api/health")).status, 503);
});
