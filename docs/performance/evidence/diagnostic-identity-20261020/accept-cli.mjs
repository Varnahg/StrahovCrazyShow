import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const input = fileURLToPath(new URL("./input.jsonl", import.meta.url));
const before = readFileSync(input);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const invoke = (args) => {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const r = spawnSync(process.execPath, [path.join(root, "scripts/diagnostics-report.mjs"), input, ...args], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024, env,
  });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  return r.stdout;
};
const json = JSON.parse(invoke(["--json"]));
const text = invoke([]);
const session = json.sessions[0];
assert.equal(json.sessions.length, 1);
assert.ok(before.equals(readFileSync(input)), "CLI must preserve input bytes");
console.log(JSON.stringify({
  syntheticFixture: true,
  inputSha256: hash(before),
  actualInconsistentWindows: session.network.inconsistentConnectionWindows,
  expectedInconsistentWindows: 2,
  frames: session.performance.frames,
  observedClock: session.serverClock.observed,
  comparableIntervals: session.serverClock.comparableIntervals,
  inputUnchanged: true,
}));
assert.equal(session.network.inconsistentConnectionWindows, 2);
assert.equal(session.incidents.find((x) => x.code === "connection-state-inconsistent")?.count, 2);
assert.match(text, /INCIDENT \[medium\] connection-state-inconsistent: 2\./);
assert.equal(session.performance.frames, 9);
assert.equal(session.performance.p50FrameMs, 16);
assert.equal(session.performance.p95FrameMs, 100);
assert.equal(session.performance.p99FrameMs, 100);
assert.equal(session.performance.maxFrameMs, 100);
assert.equal(session.performance.averageFps, 9000 / 264);
assert.deepEqual(session.serverClock.observed, { callbacks: 20, droppedMs: 12 });
assert.equal(session.serverClock.comparableIntervals, 2);
assert.ok(session.lifecycle.some((x) => x.kind === "network-left" && x.data.reason === "identity-change"));
console.log("PASS: plain Node JSON/text CLI, identity semantics, raw performance and clock boundaries; fixture unchanged.");
