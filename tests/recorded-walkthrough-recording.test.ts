import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
// @ts-expect-error Plain Node replay module intentionally has no declaration file.
import { compileRecording } from "./replay/recording.mjs";

const sessionId = "c063cf2e-4c92-49af-9283-cd55783b4e93";
const buildSnapshotId = "a".repeat(64);
const position = { x: 1, y: 2, z: 3 };
const camera = { ...position, yaw: 1, pitch: 0.28, distance: 8, fov: 0.85, firstPerson: false };
const context = () => ({
  position: { ...position }, camera: { ...camera }, zone: "b6:4", vehicle: false,
  speed: 0, flashlight: false, lightingInstant: 1792247063012, lightingPreview: false,
  rendering: { mode: "auto", quality: "low", hardwareScaling: 2, statistics: { averageFps: 42 } },
  weather: { temperature: null, wind: 0, rain: 0, cloud: 0.9, stale: false, sourceKind: "model" },
  appearance: { badge: "private content" }, userAgent: "private browser", network: { profile: "private" },
});
const record = (seq: number, kind: string, data: object = {}, atMs = seq * 100) => ({ seq, kind, data, atMs });
const frame = (seq: number, contextAtMs: number, atMs: number) =>
  record(seq, "frame-window", { context: context(), contextAtMs, frameMs: [16, 17] }, atMs);
const records = () => [
  record(0, "session-start"), record(1, "game-start"), record(2, "game-ready", {}, 1000),
  frame(3, 1050, 1300),
  record(4, "action", { action: "flashlight", enabled: false, profile: "private" }, 1120),
  record(5, "quality-change", { rendering: context().rendering }, 1120),
  record(6, "camera-change", { firstPerson: false, distance: 8, vehicle: false }, 1130),
  record(7, "lighting-change", { mode: "night" }, 1140),
  frame(8, 1500, 1600), record(9, "game-dispose", {}, 1700),
  record(10, "action", { action: "interact", profile: "after game" }, 1800),
];
function encode(items = records(), extra: object = {}) {
  return Buffer.from([
    { type: "session-log", schemaVersion: 1, sessionId, source: { buildSnapshotId } },
    { type: "batch", schemaVersion: 1, sessionId, source: { buildSnapshotId }, batchId: 0, records: items, ...extra },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n");
}
function options(bytes: Uint8Array, extra: object = {}) {
  return {
    id: "test-route", sessionId, sha256: createHash("sha256").update(bytes).digest("hex"),
    fromSeq: 0, readySeq: 2, toSeq: 9, ...extra,
  };
}
const compile = (bytes = encode(), extra: object = {}) => compileRecording(bytes, options(bytes, extra));
type TimelineItem = { type: string; atMs: number; seq: number; state?: Record<string, unknown>; kind?: string; data?: Record<string, unknown> };

test("compiles sampled context time and explicit actions in stable time/sequence order", () => {
  const fixture = compile();
  assert.deepEqual(fixture.source, { sessionId, buildSnapshotId, sha256: options(encode()).sha256,
    fromSeq: 0, readySeq: 2, toSeq: 9, recordCount: 11 });
  assert.deepEqual(fixture.timeline.map((item: TimelineItem) => [item.seq, item.atMs]),
    [[3, 50], [4, 120], [5, 120], [6, 130], [7, 140], [8, 500]]);
  assert.equal(fixture.durationMs, 500);
  assert.equal(fixture.timeline[0].state.zone, "b6:4");
  assert.ok(fixture.limitations.some((item: string) => item.includes("first observed state is seq 3 at 50ms")));
});

test("whitelists technical state/events, retains false/zero/null and discards performance/private context", () => {
  const fixture = compile();
  const state = fixture.timeline[0].state;
  assert.equal(state.vehicle, false);
  assert.equal(state.speed, 0);
  assert.equal(state.flashlight, false);
  assert.equal(state.camera.firstPerson, false);
  assert.equal(state.weather.temperature, null);
  assert.equal(state.weather.wind, 0);
  assert.deepEqual(fixture.timeline.find((item: TimelineItem) => item.seq === 4).data,
    { action: "flashlight", enabled: false });
  assert.deepEqual(state.rendering, { mode: "auto", quality: "low", hardwareScaling: 2 });
  assert.doesNotMatch(JSON.stringify(fixture), /private|averageFps|frameMs|userAgent|profile|badge/);
});

test("rejects a wrong hash before compiling a source", () => {
  assert.throws(() => compile(encode(), { sha256: "0".repeat(64) }), /SHA-256 mismatch/);
  assert.throws(() => compileRecording(encode(), { ...options(encode()), sha256: "invalid" }), /invalid expected SHA/);
  assert.throws(() => compileRecording("not bytes", options(encode())), /Uint8Array/);
});

test("validates the full log session and continuity outside the selected replay", () => {
  assert.throws(() => compile(encode(records(), { sessionId: "other-session" })), /wrong session/);
  const gap = records(); gap[10].seq = 11;
  assert.throws(() => compile(encode(gap)), /sequence gap/);
  const duplicate = records(); duplicate[10].seq = 9;
  assert.throws(() => compile(encode(duplicate)), /duplicate sequence/);
  assert.throws(() => compile(encode(records().slice(1))), /sequence gap/);
});

test("rejects malformed envelopes, records, duplicate delivery and conflicting builds", () => {
  assert.throws(() => compile(encode(records(), { schemaVersion: 2 })), /unsupported envelope/);
  assert.throws(() => compile(encode(records(), { type: "unknown" })), /unsupported row type/);
  assert.throws(() => compile(Buffer.from("{broken JSON\n")), /malformed JSON/);
  assert.throws(() => compile(Buffer.from([0xff])), /encoded data/);
  const duplicateBatch = Buffer.concat([encode(), Buffer.from(encode().toString().split("\n")[1] + "\n")]);
  assert.throws(() => compile(duplicateBatch), /duplicate batch/);
  assert.throws(() => compile(encode(records(), { source: { buildSnapshotId: "b".repeat(64) } })), /conflicting build/);
  assert.throws(() => compile(encode(records(), { records: [{ seq: 0, atMs: null, kind: "game-ready", data: {} }] })), /malformed record/);
});

test("requires one selected game-ready and does not cross disposal into menu or another game", () => {
  assert.throws(() => compile(encode(), { readySeq: 3 }), /not game-ready/);
  assert.throws(() => compile(encode(), { fromSeq: 3 }), /sequence selection/);
  assert.throws(() => compile(encode(), { toSeq: 999 }), /sequence selection/);
  assert.throws(() => compile(encode(), { toSeq: 10 }), /beyond game end/);
  const twoGames = records(); twoGames[1].kind = "game-ready";
  assert.throws(() => compile(encode(twoGames)), /multiple games/);
  const restart = records(); restart[7].kind = "game-start";
  assert.throws(() => compile(encode(restart)), /crosses game lifecycle/);
});

test("requires contextAtMs and sampled positions without substituting record flush time", () => {
  for (const invalidTime of [999, 1301, undefined]) {
    const input = records(); input[3] = record(3, "frame-window", { context: context(), contextAtMs: invalidTime }, 1300);
    assert.throws(() => compile(encode(input)), /context time|contextAtMs/);
  }
  const input = records(); input[3] = record(3, "frame-window", { context: { position: { x: 1 } }, contextAtMs: 1050 }, 1300);
  assert.throws(() => compile(encode(input)), /missing sampled position/);
  const noSamples = records().map((item) => item.kind === "frame-window" ? { ...item, kind: "resource-window" } : item);
  assert.throws(() => compile(encode(noSamples)), /no sampled states/);
});

test("missing optional fields, unknown actions, long observation gaps and historical faults stay explicit", () => {
  const input = records();
  input[3] = record(3, "frame-window", { context: { position, camera: { x: 1 } }, contextAtMs: 1050 }, 1300);
  input[4] = record(4, "action", { action: "unrecorded-jump", profile: "private" }, 1120);
  input[7] = record(7, "render-fault", { error: "historical source detail omitted" }, 1140);
  input[8] = frame(8, 5050, 5100);
  const fixture = compile(encode(input));
  assert.ok(fixture.limitations.some((item: string) => item.includes("state.weather")));
  assert.ok(fixture.limitations.some((item: string) => item.includes("state.camera.yaw")));
  assert.ok(fixture.limitations.some((item: string) => item.includes("Unknown actions at seq 4")));
  assert.ok(fixture.limitations.some((item: string) => item.includes("3->8: 4000ms")));
  assert.ok(fixture.limitations.some((item: string) => item.includes("Historical errors at seq 7")));
  assert.ok(!fixture.timeline.some((item: TimelineItem) => item.seq === 4 || item.seq === 7));
  assert.doesNotMatch(JSON.stringify(fixture), /historical source detail omitted|unrecorded-jump/);
});

test("source delivery order does not change sampled time ordering", () => {
  const input = records().reverse();
  assert.deepEqual(compile(encode(input)).timeline, compile().timeline);
});

test("unknown diagnostic kinds cannot enter the explicit event whitelist through object prototypes", () => {
  const input = records(); input[7].kind = "toString";
  assert.ok(!compile(encode(input)).timeline.some((item: TimelineItem) => item.seq === 7));
});

async function fixture(name: string) {
  return JSON.parse(await readFile(new URL(`./replay/fixtures/${name}.json`, import.meta.url), "utf8"));
}

test("B6 fixture preserves the selected source, all floors, car, lighting and historical failure boundary", async () => {
  const route = await fixture("b6-20261017");
  assert.deepEqual(route.source, {
    sessionId, sha256: "cb15db6a0ee7905ede9debdd7435556c165799bcc0d3931246122d97403e46c2",
    buildSnapshotId: "1383fc9296d70d256ead4c6df0ac87892cdcd522426272bc8e7288613266f277",
    fromSeq: 0, toSeq: 2498, readySeq: 259, recordCount: 5297,
  });
  const samples = route.timeline.filter((item: TimelineItem) => item.type === "sample");
  assert.equal(samples.length, 584);
  assert.equal(route.timeline.length, 608);
  assert.deepEqual([...new Set(samples.map((item: TimelineItem) => item.state?.zone))],
    ["outside", "b6:0", "b6:1", "b6:2", "b6:3", "b6:4"]);
  assert.ok(samples.some((item: TimelineItem) => item.state?.vehicle === true));
  assert.ok(samples.some((item: TimelineItem) => item.state?.flashlight === true));
  assert.equal(route.timeline[0].seq, 263);
  assert.equal(route.timeline.at(-1).seq, 2498);
  assert.ok(route.durationMs > 579953 && route.durationMs < 579954);
  assert.ok(route.limitations.some((item: string) => item.includes("2412,2413,2450,2451,2496")));
});

test("outdoor fixture exactly matches extraction from the committed gzip and excludes agent smoke", async () => {
  const route = await fixture("outdoor-car-20261018");
  const bytes = gunzipSync(await readFile(new URL(
    "../docs/performance/evidence/webgpu-migration-20261016/user-4196-20261018/session.jsonl.gz", import.meta.url)));
  assert.deepEqual(compileRecording(new Uint8Array(bytes), {
    id: "outdoor-car-20261018", sessionId: "ccac5532-9f27-46a0-928f-b6b5c1e62acf",
    sha256: "52cdf6bde7f27268ee6f628d347ba636a9ebb13d42aa504be2fb0a949434d425",
    fromSeq: 636, readySeq: 1014, toSeq: 1695,
  }), route);
  assert.equal(route.source.recordCount, 1717);
  assert.equal(route.timeline.length, 185);
  assert.equal(route.timeline.filter((item: TimelineItem) => item.type === "sample").length, 166);
  assert.equal(route.timeline[0].seq, 1017);
  assert.equal(route.timeline.at(-1).seq, 1693);
  assert.ok(route.timeline.every((item: TimelineItem) => item.seq > 1014 && item.seq < 1695));
  assert.ok(route.durationMs > 159961 && route.durationMs < 159962);
});

test("committed fixtures contain only the bounded technical timeline and preserve monotonically sorted time", async () => {
  for (const name of ["b6-20261017", "outdoor-car-20261018"]) {
    const route = await fixture(name);
    let previous: TimelineItem | undefined;
    for (const item of route.timeline as TimelineItem[]) {
      assert.ok(item.atMs >= 0 && item.atMs <= route.durationMs);
      assert.ok(!previous || item.atMs > previous.atMs || (item.atMs === previous.atMs && item.seq > previous.seq));
      assert.ok(["sample", "event"].includes(item.type));
      assert.ok(item.seq >= route.source.readySeq && item.seq <= route.source.toSeq);
      if (item.type === "event") assert.ok(["action", "camera-change", "quality-change", "lighting-change"].includes(item.kind!));
      previous = item;
    }
    assert.doesNotMatch(JSON.stringify(route), /"(?:appearance|badge|userAgent|profile|network|frameMs|statistics|render-fault|js-error)":/);
  }
});
