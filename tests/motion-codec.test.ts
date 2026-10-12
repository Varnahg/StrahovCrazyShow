import { test } from "node:test";
import assert from "node:assert/strict";
import { getMessageBytes, Protocol } from "@colyseus/core";
import {
  MotionDecoder,
  MotionEncoder,
  type MotionWire,
} from "../shared/motion-codec";
import type { MotionPacket } from "../shared/netcode";
import type { VehicleState } from "../shared/vehicle";

const row = (id: string, x = 123.123456, ack = 3, grounded?: boolean) => {
  const result: any[] = [
    id,
    x,
    2.00049,
    -42.123456,
    1.23456789,
    4.50049,
    ack,
    0,
    "outside",
  ];
  if (grounded !== undefined) result.push(grounded);
  return result;
};
const packet = (rows: any[][], tick = 3, car?: VehicleState): MotionPacket => ({
  time: 1791727486000 + (tick * 1000) / 60,
  tick,
  rows,
  ...(car ? { car } : {}),
});
const carState = (): VehicleState => ({
  id: "campus-car",
  driverId: null,
  parked: true,
  sleeping: true,
  position: { x: 1.123456789, y: 2.987654321, z: -5.0123456789 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  parking: {
    position: { x: 1.123456789, y: 2.987654321, z: -5.0123456789 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  },
  linvel: { x: 0, y: 0, z: 0 },
  angvel: { x: 0, y: 0, z: 0 },
  force: { x: 0, y: 0, z: 0 },
  torque: { x: 0, y: 0, z: 0 },
  steering: 0,
  wheelSpin: [1.123456789, 2, 3, 4],
  wheelSuspension: [0.41, 0.42, 0.43, 0.44],
  wheelContact: [true, true, true, true],
});

function assertReconstruction(
  expected: MotionPacket,
  actual: MotionPacket | null,
) {
  assert.ok(actual);
  assert.equal(actual.time, expected.time);
  assert.equal(actual.tick, expected.tick);
  assert.equal(actual.rows.length, expected.rows.length);
  for (const source of expected.rows) {
    const result: any[] | undefined = actual.rows.find(
      (candidate) => candidate[0] === source[0],
    );
    assert.ok(result);
    for (let field = 1; field <= 5; field++) {
      const bound = field === 4 ? 0.00005 : 0.0005;
      assert.ok(
        Math.abs(result[field] - source[field]) <= bound + 1e-10,
        `field ${field} quantization bound`,
      );
    }
    assert.deepEqual(result.slice(6), source.slice(6));
  }
  if (expected.car) assert.deepEqual(actual.car, expected.car);
}

test("keyframes and moving deltas reconstruct every player within presentation quantization bounds", () => {
  const encoder = new MotionEncoder(),
    decoder = new MotionDecoder();
  const snapshots = Array.from({ length: 125 }, (_, frame) =>
    packet(
      Array.from({ length: 30 }, (_, person) => {
        const state = row(
          `player-${person}`,
          -75.123456 + person * 2 + Math.sin(frame / 10) * 3,
          2 ** 40 + frame * 3,
          frame % 11 < 7,
        );
        state[2] += Math.sin(frame / 4);
        state[3] += Math.cos(frame / 6) * 2;
        state[4] = (frame / 8 + person) % (2 * Math.PI);
        state[5] = Math.cos(frame / 7) * 4;
        state[7] = person === 0 && frame > 70 ? 1 : 0;
        state[8] = person === 1 && frame > 60 ? "b6:ground" : "outside";
        return state;
      }),
      frame * 3,
      carState(),
    ),
  );
  for (const source of snapshots)
    assertReconstruction(source, decoder.decode(encoder.encode(source)));
});

test("stationary deltas still advance every player and retain optional grounded and exact acknowledgments", () => {
  const encoder = new MotionEncoder(),
    decoder = new MotionDecoder();
  const source = packet([row("a", 10, 123, true), row("b", -20, 987654321)]);
  decoder.decode(encoder.encode(source));
  const next = packet(source.rows, 6),
    wire = encoder.encode(next);
  assert.deepEqual(wire.r, []);
  assert.equal(wire.p, 2);
  assertReconstruction(next, decoder.decode(wire));
  source.rows[0][6]++;
  source.rows[0][9] = false;
  const changed = encoder.encode(packet(source.rows, 9));
  assert.equal(changed.r.length, 1);
  assert.equal(changed.r[0][1], (1 << 5) | (1 << 8));
  assertReconstruction(packet(source.rows, 9), decoder.decode(changed));
  source.rows[0].pop();
  assertReconstruction(
    packet(source.rows, 12),
    decoder.decode(encoder.encode(packet(source.rows, 12))),
  );
});

test("fresh targeted join keyframe cannot poison global baseline when transforms revert before broadcast", () => {
  const encoder = new MotionEncoder(),
    existing = new MotionDecoder(),
    joining = new MotionDecoder();
  const first = encoder.encode(packet([row("a", 10)]));
  existing.decode(first);
  const fresh = encoder.keyframe(packet([row("a", 20), row("b", 30)], 4));
  assert.equal(fresh.s, first.s);
  assertReconstruction(
    packet([row("a", 20), row("b", 30)], 4),
    joining.decode(fresh),
  );
  const next = packet([row("a", 10), row("b", 30)], 6),
    broadcast = encoder.encode(next);
  assert.equal(broadcast.s, first.s + 1);
  assert.equal(broadcast.k, 1);
  assertReconstruction(next, existing.decode(broadcast));
  assertReconstruction(next, joining.decode(broadcast));
  // The same protection is needed for a targeted resync without a roster change.
  const reconnect = new MotionDecoder();
  reconnect.decode(encoder.keyframe(packet([row("a", 999), row("b", 30)], 7)));
  assertReconstruction(
    packet(next.rows, 9),
    reconnect.decode(encoder.encode(packet(next.rows, 9))),
  );
});

test("explicit removals and complete roster keyframes cannot leave ghosts; handles are not reused", () => {
  const encoder = new MotionEncoder(),
    decoder = new MotionDecoder();
  const first = encoder.encode(packet([row("a"), row("b")]));
  decoder.decode(first);
  const removedHandle = first.r.find((entry) => entry[1] === "a")![0];
  const next = encoder.encode(packet([row("b"), row("c")], 6));
  assert.equal(next.k, 1);
  assert.deepEqual(next.d, [removedHandle]);
  assert.notEqual(next.r.find((entry) => entry[1] === "c")![0], removedHandle);
  assert.deepEqual(
    decoder.decode(next)!.rows.map((entry) => entry[0]),
    ["b", "c"],
  );
  const empty = encoder.encode(packet([], 9));
  assert.equal(empty.d!.length, 2);
  assert.deepEqual(decoder.decode(empty)!.rows, []);
});

test("a gap waits for periodic full state, ignores replay, and a new session must reset", () => {
  const encoder = new MotionEncoder({ keyframeInterval: 3 }),
    decoder = new MotionDecoder();
  assert.equal(decoder.needsKeyframe, true);
  const first = encoder.encode(packet([row("a")], 3));
  assert.equal(new MotionDecoder().decode({ ...first, k: undefined }), null);
  assert.ok(decoder.decode(first));
  assert.equal(decoder.needsKeyframe, false);
  assert.equal(decoder.decode(encoder.keyframe(packet([row("a")], 4))), null);
  assert.equal(
    decoder.needsKeyframe,
    false,
    "caught-up targeted baseline is benign, not another resync request",
  );
  encoder.encode(packet([row("a", 20)], 6)); // Lost second message.
  const third = encoder.encode(packet([row("a", 30)], 9));
  assert.equal(decoder.decode(third), null);
  assert.equal(decoder.needsKeyframe, true);
  // Targeted keyframe above forced seq2 full; next periodic one is seq5.
  assert.equal(
    decoder.decode(encoder.encode(packet([row("a", 35)], 12))),
    null,
  );
  const fifth = encoder.encode(packet([row("a", 40)], 15));
  assert.equal(fifth.k, 1);
  assertReconstruction(packet([row("a", 40)], 15), decoder.decode(fifth));
  assert.equal(decoder.needsKeyframe, false);
  assert.equal(decoder.decode(first), null);
  assert.equal(decoder.decode(fifth), null);
  assert.equal(decoder.needsKeyframe, false);
  assertReconstruction(
    packet([row("a", 50)], 18),
    decoder.decode(encoder.encode(packet([row("a", 50)], 18))),
  );
  const other = new MotionEncoder().keyframe(packet([row("new-session")], 0));
  assert.equal(decoder.decode(other), null);
  decoder.reset();
  assert.equal(decoder.needsKeyframe, true);
  assertReconstruction(packet([row("new-session")], 0), decoder.decode(other));
});

test("malformed packets fail atomically without corrupting the previous dictionary or vehicle state", () => {
  const encoder = new MotionEncoder(),
    decoder = new MotionDecoder();
  decoder.decode(encoder.encode(packet([row("a"), row("b")], 3, carState())));
  const good = encoder.encode(packet([row("a", 1), row("b", 2)], 6));
  const malformed: MotionWire[] = [
    { ...good, p: 99 },
    { ...good, r: [...good.r, [999, 1, 2]] },
    { ...good, r: [good.r[0], [good.r[1][0], 1, Infinity]] },
    { ...good, r: [[good.r[0][0], 1, 2, "extra"]] },
    { ...good, r: [[good.r[0][0], 1024, 2]] },
    { ...good, r: [good.r[0], good.r[0]] },
    { ...good, d: [999] },
    { ...good, c: { ...carState(), wheelSpin: [NaN, 0, 0, 0] } },
  ];
  for (const broken of malformed) assert.equal(decoder.decode(broken), null);
  assertReconstruction(
    packet([row("a", 1), row("b", 2)], 6, carState()),
    decoder.decode(good),
  );
  const full = encoder.keyframe(packet([row("a"), row("b")], 7));
  const fresh = new MotionDecoder();
  assert.equal(fresh.decode({ ...full, r: [full.r[0], full.r[0]] }), null);
  assert.equal(
    fresh.decode({
      ...full,
      r: [
        [0, "a", ...full.r[0].slice(2)],
        [1, "a", ...full.r[1].slice(2)],
      ],
    }),
    null,
  );
  assert.equal(fresh.decode({ ...full, r: [full.r[0]], p: 2 }), null);
  assert.equal(fresh.decode({ ...full, v: 2 }), null);
  assert.ok(fresh.decode(full));
});

test("input, wire, and decoded objects have independent ownership; unchanged car remains lossless", () => {
  const encoder = new MotionEncoder(),
    decoder = new MotionDecoder();
  const source = packet([row("a")], 3, carState());
  const baseline = structuredClone(source);
  const first = encoder.encode(source);
  const decoded = decoder.decode(first)!;
  source.rows[0][1] = 500;
  source.car!.position.x = 600;
  first.r[0][2] = 700;
  first.c!.position.x = 800;
  decoded.rows[0][1] = 900;
  decoded.car!.wheelSpin[0] = 1000;
  const nextSource = { ...baseline, tick: 6, time: baseline.time + 50 };
  const next = encoder.encode(nextSource);
  assert.deepEqual(next.r, []);
  assert.equal(next.c, undefined);
  assertReconstruction(nextSource, decoder.decode(next));
  nextSource.car!.wheelSpin[0] += 0.000000001;
  const changed = encoder.encode({ ...nextSource, tick: 9 });
  assert.deepEqual(changed.c, nextSource.car);
  assertReconstruction({ ...nextSource, tick: 9 }, decoder.decode(changed));
});

test("invalid application rows are rejected before changing encoder sequence or baseline", () => {
  const encoder = new MotionEncoder();
  const first = encoder.encode(packet([row("a")]));
  const bad = row("a");
  bad[6] = 1.5;
  assert.throws(() => encoder.encode(packet([bad])), TypeError);
  assert.throws(() => encoder.encode(packet([row("a"), row("a")])), TypeError);
  const overflow = row("a", Number.MAX_VALUE);
  assert.throws(() => encoder.encode(packet([overflow])), TypeError);
  const next = encoder.encode(packet([row("a")], 6));
  assert.equal(next.s, first.s + 1);
  assert.deepEqual(next.r, []);
});

test("actual Colyseus binary frames reduce a mixed 100-player replay including periodic keyframes", () => {
  const encoder = new MotionEncoder(),
    decoder = new MotionDecoder();
  let baselineBytes = 0,
    compactBytes = 0;
  const bytes = (value: unknown) =>
    getMessageBytes.raw(Protocol.ROOM_DATA, "motion", value).length;
  for (let frame = 0; frame < 120; frame++) {
    const source = packet(
      Array.from({ length: 100 }, (_, i) =>
        row(
          `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          120.123456 + i / 10 + (i % 2 ? frame / 4 : 0),
          frame * 3,
          true,
        ),
      ),
      frame * 3,
      carState(),
    );
    const wire = encoder.encode(source);
    baselineBytes += bytes(source);
    compactBytes += bytes(wire);
    assertReconstruction(source, decoder.decode(wire));
  }
  assert.ok(
    compactBytes < baselineBytes * 0.5,
    `${compactBytes} compact vs ${baselineBytes} baseline bytes`,
  );
});
