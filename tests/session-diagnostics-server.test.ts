import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createSessionDiagnosticsHandler,
  readDiagnosticsSource,
  type DiagnosticsSource,
} from "../server/session-diagnostics";

const source: DiagnosticsSource = {
  kind: "working-tree",
  gitHead: "a".repeat(40),
  contentSha256: "b".repeat(64),
  dirty: true,
  buildSnapshotId: null,
  capturedAtUTC: "2026-10-13T12:00:00.000Z",
  scope: "fixture",
  files: 2,
};
const batch = (sessionId: string, batchId = 0, seq = batchId) => ({
  schemaVersion: 1,
  sessionId,
  batchId,
  records: [
    {
      seq,
      atMs: seq * 1000,
      kind: "frame-window",
      data: {
        frameMs: [16, 17, 150],
        renderErrors: 1,
        avatars: 3,
        settings: { quality: "auto" },
      },
    },
  ],
});

async function fixture(
  t: TestContext,
  options: {
    listenHost?: string;
    policy?: {
      maxDiskBytes?: number;
      maxFileBytes?: number;
      maxFiles?: number;
      retentionDays?: number;
    };
  } = {},
) {
  const directory = await mkdtemp(
    join(tmpdir(), "strahov-session-diagnostics-"),
  );
  const config = {
    directory,
    listenHost: options.listenHost ?? "127.0.0.1",
    source: async () => source,
    policy: options.policy,
  };
  let handler = createSessionDiagnosticsHandler(config);
  const server = createServer((req, res) => {
    void handler(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    assert.ok(
      relative(tmpdir(), directory).startsWith("strahov-session-diagnostics-"),
    );
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    base,
    restart: () => {
      handler = createSessionDiagnosticsHandler(config);
    },
    get: (headers: Record<string, string> = {}) =>
      fetch(base + "/api/diagnostics/session/status", {
        headers: { Referer: base + "/", ...headers },
      }),
    post: (body: unknown, headers: Record<string, string> = {}) =>
      fetch(base + "/api/diagnostics/session", {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    files: () => readdir(directory),
    contents: async (id: string) =>
      (await readdir(directory))
        .filter((name) => name.startsWith(id))
        .sort()
        .map((name) => join(directory, name)),
  };
}

test("automatic collector needs no env opt-in; exact local proxy Host/Origin and Referer are required", async (t) => {
  const f = await fixture(t);
  const response = await f.get();
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.enabled, true);
  assert.equal(status.sourceId, source.contentSha256);
  assert.equal(status.source.kind, "working-tree");
  assert.equal(status.policy.retentionDays, 7);
  assert.equal(response.headers.get("access-control-allow-origin"), f.base);
  const rejectedHeaders: Record<string, string>[] = [
    { Origin: "http://evil.example" },
    { Origin: "null" },
    { Origin: "http://127.0.0.1:5173" },
    { "Sec-Fetch-Site": "cross-site" },
    { Host: "evil.example", Origin: "http://evil.example" },
  ];
  for (const headers of rejectedHeaders) {
    const rejected = await f.post(batch(randomUUID()), headers);
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  }
  assert.equal(
    (await fetch(f.base + "/api/diagnostics/session/status")).status,
    403,
  );
  assert.equal(
    (
      await fetch(f.base + "/api/diagnostics/session/list", {
        headers: { Origin: f.base },
      })
    ).status,
    404,
  );
  // A local same-origin reverse proxy preserves the browser's Host header.
  const proxiedStatus = await new Promise<number>((done, reject) => {
    const req = request(
      f.base + "/api/diagnostics/session/status",
      {
        headers: { Host: "127.0.0.1:5173", Referer: "http://127.0.0.1:5173/" },
      },
      (response) => {
        response.resume();
        response.on("end", () => done(response.statusCode!));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(proxiedStatus, 200);
  assert.deepEqual(await f.files(), []);
  const publicServer = await fixture(t, { listenHost: "0.0.0.0" });
  assert.equal((await publicServer.get()).status, 404);
  assert.equal((await publicServer.post(batch(randomUUID()))).status, 404);
});

test("errors and any avatar count are retained, while user content is projected out before disk", async (t) => {
  const f = await fixture(t),
    id = randomUUID(),
    raw = batch(id);
  Object.assign(raw.records[0].data, {
    chat: "private chat",
    profile: { name: "private" },
    accessToken: "secret",
    endpoint: "http://localhost/model.glb?token=secret",
    playerNickname: "private nick",
  });
  const response = await f.post(raw);
  assert.equal(response.status, 201);
  const ack = await response.json();
  assert.equal(ack.saved, true);
  assert.equal(ack.ok, true);
  assert.equal(ack.sessionId, id);
  assert.equal(ack.lastSeq, 0);
  const text = await readFile(join(f.directory, id + ".jsonl"), "utf8");
  const rows = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(rows[0].type, "session-log");
  assert.equal(rows[1].source.contentSha256, source.contentSha256);
  assert.equal(rows[1].records[0].data.renderErrors, 1);
  assert.equal(rows[1].records[0].data.avatars, 3);
  assert.ok(!text.includes("private chat"));
  assert.ok(!text.includes("private nick"));
  assert.ok(!text.includes("secret"));
  assert.deepEqual(rows[1].records[0].data.frameMs, [16, 17, 150]);
});

test("uppercase UUIDs use the same canonical local session file", async (t) => {
  const f = await fixture(t),
    id = randomUUID();
  assert.equal((await f.post(batch(id.toUpperCase()))).status, 201);
  assert.equal((await f.post(batch(id))).status, 200);
  assert.deepEqual(await f.files(), [id + ".jsonl"]);
});

test("serialized writes and durable retry acknowledgement survive restart and reject conflicts", async (t) => {
  const f = await fixture(t),
    id = randomUUID(),
    first = batch(id);
  const results = await Promise.all([f.post(first), f.post(first)]);
  assert.deepEqual(
    results.map((response) => response.status).sort(),
    [200, 201],
  );
  assert.equal((await f.post(batch(id, 1, 1))).status, 201);
  f.restart();
  const retried = await f.post(first);
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).duplicate, true);
  const changed = batch(id);
  changed.records[0].data.frameMs = [1000];
  assert.equal((await f.post(changed)).status, 409);
  assert.equal((await f.post(batch(id, 2, 0))).status, 409);
  assert.equal((await f.post(batch(id, 2, 2))).status, 201);
  const rows = (await readFile(join(f.directory, id + ".jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    rows.filter((row) => row.type === "batch").map((row) => row.batchId),
    [0, 1, 2],
  );
});

test("malformed, oversized, reordered and wrong-content requests cannot create log files", async (t) => {
  const f = await fixture(t),
    id = randomUUID();
  for (const body of [
    null,
    { ...batch(id), sessionId: "../../outside" },
    { ...batch(id), batchId: -1 },
    { ...batch(id), records: [] },
    { ...batch(id), records: [batch(id).records[0], batch(id).records[0]] },
  ])
    assert.equal((await f.post(body)).status, 400);
  assert.equal(
    (await f.post(batch(id), { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal(
    (await f.post({ ...batch(id), tooLarge: "x".repeat(140000) })).status,
    413,
  );
  const chunkedStatus = await new Promise<number>((done, reject) => {
    const req = request(
      f.base + "/api/diagnostics/session",
      {
        method: "POST",
        headers: {
          Origin: f.base,
          "Content-Type": "application/json",
          "Transfer-Encoding": "chunked",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => done(response.statusCode!));
      },
    );
    req.on("error", reject);
    for (let i = 0; i < 20; i++) req.write("x".repeat(8192));
    req.end();
  });
  assert.equal(chunkedStatus, 413);
  assert.deepEqual(await f.files(), []);
});

test("rotation/retention are bounded and do not remove unrelated local files", async (t) => {
  const f = await fixture(t, {
      policy: { maxFileBytes: 2600, maxDiskBytes: 6000, maxFiles: 2 },
    }),
    id = randomUUID();
  await writeFile(join(f.directory, "keep.txt"), "unrelated");
  const expired = randomUUID() + ".jsonl";
  await writeFile(join(f.directory, expired), "expired\n");
  await utimes(join(f.directory, expired), new Date(0), new Date(0));
  for (let i = 0; i < 6; i++)
    assert.equal((await f.post(batch(id, i))).status, 201);
  const files = await f.files();
  assert.ok(files.includes("keep.txt"));
  assert.ok(!files.includes(expired));
  const own = files.filter((name) => name.endsWith(".jsonl"));
  assert.ok(own.length <= 2);
  assert.ok(own.some((name) => name.includes("part-")));
  let total = 0;
  for (const name of own)
    total += Buffer.byteLength(await readFile(join(f.directory, name)));
  assert.ok(total <= 6000);
});

test("a crash tail stays visible and later valid batches remain readable", async (t) => {
  const f = await fixture(t),
    id = randomUUID();
  assert.equal((await f.post(batch(id))).status, 201);
  const path = join(f.directory, id + ".jsonl");
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, '{"type":"batch","unfinished":');
  f.restart();
  assert.equal((await f.post(batch(id, 1))).status, 201);
  const lines = (await readFile(path, "utf8")).trim().split("\n");
  assert.ok(lines.includes('{"type":"batch","unfinished":'));
  assert.equal(JSON.parse(lines.at(-1)!).batchId, 1);
});

test("source identity hashes runtime/config/tests, excludes binary assets, and changes with source", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "strahov-source-diagnostics-"),
  );
  t.after(async () => {
    assert.ok(
      relative(tmpdir(), directory).startsWith("strahov-source-diagnostics-"),
    );
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(join(directory, "client"));
  await mkdir(join(directory, "tests"));
  await mkdir(join(directory, "public"));
  await writeFile(join(directory, "client/game.ts"), "first");
  await writeFile(join(directory, "tests/game.test.ts"), "test");
  await writeFile(join(directory, "public/model.glb"), "binary");
  const first = await readDiagnosticsSource(directory, {});
  await writeFile(join(directory, "public/model.glb"), "binary changed");
  assert.equal(
    (await readDiagnosticsSource(directory, {})).contentSha256,
    first.contentSha256,
  );
  await writeFile(join(directory, "client/game.ts"), "second source");
  const second = await readDiagnosticsSource(directory, {});
  assert.notEqual(second.contentSha256, first.contentSha256);
  assert.equal(second.files, 2);
  assert.equal(second.gitHead, null);
  assert.equal(second.dirty, null);
  assert.equal(second.kind, "working-tree");
});

test("in-process sequential drain reuses source observation across batches and refreshes after TTL", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "strahov-session-diagnostics-source-drain-"),
  );
  t.after(async () => {
    assert.ok(
      relative(tmpdir(), directory).startsWith(
        "strahov-session-diagnostics-source-drain-",
      ),
    );
    await rm(directory, { recursive: true, force: true });
  });
  let now = 1000,
    captures = 0;
  const handler = createSessionDiagnosticsHandler({
    directory,
    listenHost: "127.0.0.1",
    now: () => now,
    source: async () => {
      captures++;
      return {
        ...source,
        contentSha256: (captures === 1 ? "b" : "d").repeat(64),
        buildSnapshotId: "c".repeat(64),
      };
    },
  });
  const id = randomUUID();
  const post = async (index: number) => {
    const req = Readable.from([
      Buffer.from(JSON.stringify(batch(id, index))),
    ]) as IncomingMessage;
    Object.assign(req, {
      method: "POST",
      url: "/api/diagnostics/session",
      headers: {
        host: "127.0.0.1:2567",
        origin: "http://127.0.0.1:2567",
        "content-type": "application/json",
      },
      socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
    });
    let status = 0;
    const response = {
      setHeader() {},
      writeHead(code: number) {
        status = code;
        return this;
      },
      end() {},
    } as unknown as ServerResponse;
    assert.equal(await handler(req, response), true);
    assert.equal(status, 201);
  };
  for (let index = 0; index < 100; index++) await post(index);
  assert.equal(
    captures,
    1,
    "draining does not hash source files for each batch",
  );
  now += 30001;
  await post(100);
  assert.equal(
    captures,
    2,
    "an explicit build snapshot ID never silently freezes the observed working-tree hash",
  );
  const rows = (await readFile(join(directory, id + ".jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(rows[1].source.contentSha256, "b".repeat(64));
  assert.equal(rows.at(-1).source.contentSha256, "d".repeat(64));
  assert.equal(rows.at(-1).source.buildSnapshotId, "c".repeat(64));
  assert.deepEqual(
    rows
      .filter((row) => row.type === "batch")
      .flatMap((row) => row.records.map((r: { seq: number }) => r.seq)),
    Array.from({ length: 101 }, (_, i) => i),
  );
});
