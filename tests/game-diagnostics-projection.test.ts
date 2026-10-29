import test from "node:test";
import assert from "node:assert/strict";
import {
  snapshotAcceptedAuthorityDiagnostics,
  snapshotTimelineDiagnostics,
  snapshotTransportDiagnostics,
} from "../client/game-diagnostics";
import { NetworkClockTiming } from "../shared/network-diagnostics";
import { TimelineInputQueue } from "../shared/input-timeline";
import { NetworkTimeline } from "../client/network-timeline";

function authority() {
  const timing = new NetworkClockTiming();
  assert.equal(
    timing.record({
      elapsedMs: 17.25,
      cpuMs: 2.5,
      steps: 1,
      droppedMs: 0.25,
      accumulatorMs: 0.5,
    }),
    true,
  );
  return {
    network: {
      clock: timing.snapshot(),
      queue: new TimelineInputQueue(4, 10).diagnostics(100),
    },
  };
}

function throwGetter(target: object, key: string, accessed: () => void) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get() {
      accessed();
      throw new Error("Optional telemetry getter executed");
    },
  });
}

test("actual clock and own queue retain valid telemetry, without unlisted packet or future private fields", () => {
  const packet = authority();
  const expected = structuredClone(packet.network);
  for (const object of [
    packet,
    packet.network,
    packet.network.clock,
    packet.network.queue,
    packet.network.queue.rejected,
  ]) {
    Object.assign(object, {
      extra: "PRIVATE-SENTINEL",
      profile: { nickname: "PRIVATE-SENTINEL" },
      peers: [{ id: "PRIVATE-SENTINEL" }],
      token: "PRIVATE-SENTINEL",
      freeText: "PRIVATE-SENTINEL",
    });
  }
  const result = snapshotAcceptedAuthorityDiagnostics(packet);
  assert.deepEqual(
    result,
    expected,
    "known actual server fields survive exactly; extras cannot ride along",
  );
  assert.equal(JSON.stringify(result).includes("PRIVATE-SENTINEL"), false);
});

test("plain and null-prototype own data work; legacy queues, inherited data and exotic objects do not", () => {
  const packet = authority();
  const nullPrototype = (value: Record<string, unknown>): object =>
    Object.assign(Object.create(null), value);
  const nullPacket = nullPrototype({
    network: nullPrototype({
      clock: nullPrototype(packet.network.clock),
      queue: nullPrototype({
        ...packet.network.queue,
        rejected: nullPrototype(packet.network.queue.rejected),
      }),
    }),
  });
  assert.deepEqual(
    snapshotAcceptedAuthorityDiagnostics(nullPacket),
    packet.network,
  );
  assert.equal(
    snapshotAcceptedAuthorityDiagnostics(Object.create(packet)),
    null,
  );
  assert.equal(
    snapshotAcceptedAuthorityDiagnostics({ network: new Map() }),
    null,
  );
  assert.equal(
    snapshotAcceptedAuthorityDiagnostics({
      network: { queue: { depth: 3, ack: 4 } },
    }),
    null,
  );
  assert.deepEqual(
    snapshotAcceptedAuthorityDiagnostics({
      network: {
        clock: packet.network.clock,
        queue: { depth: 3, ack: 4 },
      },
    }),
    { clock: packet.network.clock, queue: null },
  );
  for (const value of [
    null,
    undefined,
    false,
    "packet",
    7,
    [],
    new Date(),
    new Set(),
  ]) {
    assert.equal(snapshotAcceptedAuthorityDiagnostics(value), null);
    assert.equal(snapshotTimelineDiagnostics(value), null);
  }
});

test("known and unknown getters are never evaluated by any diagnostic projector", () => {
  let accessed = 0;
  const count = () => accessed++;
  const packet = authority();
  throwGetter(packet, "profile", count);
  throwGetter(packet.network.clock, "cpuMs", count);
  throwGetter(packet.network.queue, "depth", count);
  throwGetter(packet.network.queue.rejected, "invalid", count);
  const projected = snapshotAcceptedAuthorityDiagnostics(packet)!;
  assert.equal(projected.clock!.cpuMs, null);
  assert.equal(projected.queue!.depth, null);
  assert.equal(
    (projected.queue!.rejected as Record<string, unknown>).invalid,
    null,
  );
  const transport = {
    sender: { queued: 4 },
    probe: { timeouts: 2 },
    authorities: { received: 3 },
  };
  throwGetter(transport.sender, "queued", count);
  throwGetter(transport, "privateThing", count);
  const transported = snapshotTransportDiagnostics(() => transport)!;
  assert.equal((transported.sender as Record<string, unknown>).queued, null);
  const timeline = { ...new NetworkTimeline().snapshot(), retainedInputs: 2 };
  throwGetter(timeline, "retainedInputs", count);
  throwGetter(timeline, "clockCalibrated", count);
  assert.equal(snapshotTimelineDiagnostics(timeline)!.retainedInputs, null);
  assert.equal(snapshotTimelineDiagnostics(timeline)!.clockCalibrated, null);
  throwGetter(packet, "network", count);
  assert.equal(snapshotAcceptedAuthorityDiagnostics(packet), null);
  assert.equal(accessed, 0);
});

test("optional proxy failures and throwing callbacks are contained without inspecting values through get", () => {
  const inaccessible = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error("prototype trap");
      },
    },
  );
  const descriptorsThrow = new Proxy(
    {},
    {
      getOwnPropertyDescriptor() {
        throw new Error("descriptor trap");
      },
    },
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const bad of [inaccessible, descriptorsThrow, revoked.proxy]) {
    assert.equal(snapshotAcceptedAuthorityDiagnostics(bad), null);
    assert.equal(snapshotAcceptedAuthorityDiagnostics({ network: bad }), null);
    assert.equal(snapshotTimelineDiagnostics(bad), null);
    assert.equal(
      snapshotTransportDiagnostics(() => bad),
      null,
    );
  }
  const packet = authority();
  const noOrdinaryRead = new Proxy(packet, {
    get() {
      throw new Error("property get trap");
    },
  });
  assert.deepEqual(
    snapshotAcceptedAuthorityDiagnostics(noOrdinaryRead),
    packet.network,
  );
  assert.equal(
    snapshotTransportDiagnostics(() => {
      throw new Error("transport failed");
    }),
    null,
  );
  assert.equal(snapshotTransportDiagnostics(), null);
});

test("clock identity counters reject fractions, unsafe integers, coercion and nonfinite values", () => {
  let coerced = 0;
  const coercion = {
    valueOf() {
      coerced++;
      return 1;
    },
  };
  for (const bad of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    -Infinity,
    "1",
    coercion,
  ]) {
    const packet = authority();
    Object.assign(packet.network.clock, { callbacks: bad });
    assert.equal(
      snapshotAcceptedAuthorityDiagnostics(packet)!.clock,
      null,
      String(bad),
    );
  }
  for (const bad of [-1, NaN, Infinity, -Infinity, "1", coercion]) {
    const packet = authority();
    Object.assign(packet.network.clock, { droppedTotalMs: bad });
    assert.equal(snapshotAcceptedAuthorityDiagnostics(packet)!.clock, null);
  }
  const packet = authority();
  Object.assign(packet.network.clock, {
    callbacks: Number.MAX_SAFE_INTEGER,
    steps: 1.5,
    elapsedMs: -1,
    cpuMs: Infinity,
  });
  const clock = snapshotAcceptedAuthorityDiagnostics(packet)!.clock!;
  assert.equal(clock.callbacks, Number.MAX_SAFE_INTEGER);
  assert.equal(clock.steps, null);
  assert.equal(clock.elapsedMs, null);
  assert.equal(clock.cpuMs, null);
  assert.equal(clock.droppedTotalMs, 0.25, "fractional timing remains valid");
  assert.equal(coerced, 0);
});

test("queue and rejection counters reject nonintegers while valid fractional ages remain usable", () => {
  const packet = authority();
  Object.assign(packet.network.queue, {
    depth: 0.5,
    maxDepth: Number.MAX_SAFE_INTEGER + 1,
    accepted: -1,
    consumed: Infinity,
    inputEpoch: "4",
    lastInputAgeMs: 0.125,
    oldestQueuedAgeMs: NaN,
  });
  Object.assign(packet.network.queue.rejected, {
    invalid: 0.5,
    late: -1,
    duplicate: Infinity,
    ahead: 5,
  });
  const queue = snapshotAcceptedAuthorityDiagnostics(packet)!.queue!;
  for (const key of [
    "depth",
    "maxDepth",
    "accepted",
    "consumed",
    "inputEpoch",
    "oldestQueuedAgeMs",
  ])
    assert.equal(queue[key], null, key);
  assert.equal(queue.lastInputAgeMs, 0.125);
  assert.deepEqual(queue.rejected, {
    invalid: null,
    epoch: 0,
    late: null,
    ahead: 5,
    duplicate: null,
  });
});

test("transport projection preserves selected scalar types and excludes arbitrary nested metadata", () => {
  let reads = 0;
  const projected = snapshotTransportDiagnostics(() => {
    reads++;
    return {
      sender: {
        queued: 2.5,
        inFlight: Number.MAX_SAFE_INTEGER + 1,
        sentPackets: 5,
        lastSendAgeMs: 0.25,
        maxTimerIntervalMs: -1,
        token: "PRIVATE-SENTINEL",
        packet: ["PRIVATE-SENTINEL"],
      },
      probe: {
        retainedLongTasks: 0.5,
        acceptedSamples: 3,
        pendingMs: Infinity,
        measuredAt: 100.125,
        rawRoundTripMs: 3.75,
        nonce: "PRIVATE-SENTINEL",
      },
      authorities: {
        received: 4,
        superseded: 1.5,
        payload: "PRIVATE-SENTINEL",
      },
      room: { sessionId: "PRIVATE-SENTINEL" },
    };
  })!;
  assert.equal(reads, 1);
  const sender = projected.sender as Record<string, unknown>;
  const probe = projected.probe as Record<string, unknown>;
  const authorities = projected.authorities as Record<string, unknown>;
  assert.equal(sender.queued, null);
  assert.equal(sender.inFlight, null);
  assert.equal(sender.sentPackets, 5);
  assert.equal(sender.lastSendAgeMs, 0.25);
  assert.equal(sender.maxTimerIntervalMs, null);
  assert.equal(probe.retainedLongTasks, null);
  assert.equal(probe.acceptedSamples, 3);
  assert.equal(probe.pendingMs, null);
  assert.equal(probe.measuredAt, 100.125);
  assert.equal(probe.rawRoundTripMs, 3.75);
  assert.equal(authorities.received, 4);
  assert.equal(authorities.superseded, null);
  assert.deepEqual(Object.keys(projected).sort(), [
    "authorities",
    "probe",
    "sender",
  ]);
  assert.equal(JSON.stringify(projected).includes("PRIVATE-SENTINEL"), false);
});

test("timeline retains fractional clock estimates but validates sequences and flags explicitly", () => {
  const timeline = {
    ...new NetworkTimeline().snapshot(),
    inputEpoch: 5,
    ack: 2,
    predictedSeq: 2.5,
    retainedInputs: Number.MAX_SAFE_INTEGER + 1,
    leadTicks: -1,
    clockSeqAtAnchor: 4.25,
    clockAnchorAtMs: 200.125,
    rawRttMs: Infinity,
    deliveryBudgetExceeded: "false",
    clockCalibrated: true,
    profile: { secret: "PRIVATE-SENTINEL" },
  };
  const result = snapshotTimelineDiagnostics(timeline)!;
  assert.equal(result.inputEpoch, 5);
  assert.equal(result.ack, 2);
  assert.equal(result.predictedSeq, null);
  assert.equal(result.retainedInputs, null);
  assert.equal(result.leadTicks, null);
  assert.equal(result.clockSeqAtAnchor, 4.25);
  assert.equal(result.clockAnchorAtMs, 200.125);
  assert.equal(result.rawRttMs, null);
  assert.equal(result.deliveryBudgetExceeded, null);
  assert.equal(result.clockCalibrated, true);
  assert.equal(JSON.stringify(result).includes("PRIVATE-SENTINEL"), false);
});

test("captured authority, transport and timeline values remain detached from later source mutations", () => {
  const packet = authority();
  const transport = {
    sender: { queued: 2 },
    probe: { timeouts: 3 },
    authorities: { received: 4 },
  };
  const timeline = { ...new NetworkTimeline().snapshot(), retainedInputs: 5 };
  const result = {
    server: snapshotAcceptedAuthorityDiagnostics(packet),
    transport: snapshotTransportDiagnostics(() => transport),
    timeline: snapshotTimelineDiagnostics(timeline),
  };
  const before = structuredClone(result);
  packet.network.clock.callbacks = 999;
  packet.network.queue.depth = 888;
  packet.network.queue.rejected.late = 777;
  transport.sender.queued = 666;
  transport.probe.timeouts = 555;
  transport.authorities.received = 444;
  timeline.retainedInputs = 333;
  assert.deepEqual(result, before);
});

test("fixed whitelist does not enumerate large arbitrary objects or copy unknown fields", () => {
  const packet = authority();
  const hugeClock = Object.assign(
    {},
    packet.network.clock,
    Object.fromEntries(
      Array.from({ length: 3000 }, (_, index) => [
        `unknown${index}`,
        "PRIVATE-SENTINEL",
      ]),
    ),
  );
  const noEnumeration = new Proxy(hugeClock, {
    ownKeys() {
      throw new Error("Telemetry must not enumerate unknown properties");
    },
  });
  const result = snapshotAcceptedAuthorityDiagnostics({
    network: { clock: noEnumeration, queue: packet.network.queue },
  });
  assert.deepEqual(result, packet.network);
  assert.ok(
    Buffer.byteLength(JSON.stringify(result)) < 4096,
    "output size depends only on the fixed scalar schema",
  );
});
