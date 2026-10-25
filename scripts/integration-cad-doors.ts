/** Authenticated public SDK proof. This script never starts a server, changes
 * actor positions, or targets the user's frozen playtest. Root owns port 2568. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Client, type Room } from "@colyseus/sdk";
import {
  CAD_B6_ENTRY,
  CAD_DOOR_DEFINITIONS,
  CAD_DOOR_DEFINITION_HASH,
} from "../shared/cad-buildings";
import { CadDoorTimeline } from "../shared/cad-door-timeline";
import type {
  CadDoorDelta,
  CadDoorSnapshot,
  CadDoorRequest,
} from "../shared/cad-doors";
import { PROTOCOL_VERSION } from "../shared/netcode";
import { DEFAULT_PROFILE } from "../shared/types";
import type { ServerDoorResult } from "../server/door-interactions";
import { ScriptTimelineClient, type ScriptAuthority } from "./timeline-client";

const endpoint = process.env.STRAHOV_TEST_URL ?? "http://127.0.0.1:2568";
assert.equal(
  endpoint,
  "http://127.0.0.1:2568",
  "Use the owned isolated integration server only",
);
const args = process.argv.slice(2),
  boundaryOnly = args.length === 1 && args[0] === "--boundary-only";
assert.ok(
  boundaryOnly || (args.length === 2 && args[0] === "--approach"),
  "Usage: tsx scripts/integration-cad-doors.ts --boundary-only | --approach source-route.json",
);
type Approach = {
  schemaVersion: 1;
  definitionHash: string;
  provenance: string;
  waypoints: { x: number; z: number }[];
};
const approach: Approach | undefined = boundaryOnly
  ? undefined
  : JSON.parse(readFileSync(args[1], "utf8"));
if (approach) {
  assert.equal(approach.schemaVersion, 1);
  assert.equal(approach.definitionHash, CAD_DOOR_DEFINITION_HASH);
  assert.ok(
    typeof approach.provenance === "string" &&
      approach.provenance.trim().length > 0,
  );
  assert.ok(
    Array.isArray(approach.waypoints) &&
      approach.waypoints.length > 0 &&
      approach.waypoints.length <= 100,
  );
  assert.ok(
    approach.waypoints.every(
      (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z),
    ),
  );
}
const native = CAD_DOOR_DEFINITIONS.find(
  (d) => d.definition.sourceDoorId === CAD_B6_ENTRY.doorId,
);
assert.ok(
  native,
  "Published native main entrance must be interactive; zero-door placeholder is not a passing build",
);
const doorId = native.id;
const evidence = {
  startedAt: new Date().toISOString(),
  endpoint,
  protocol: PROTOCOL_VERSION,
  definitionHash: CAD_DOOR_DEFINITION_HASH,
  harnessSha256: createHash("sha256")
    .update(readFileSync(import.meta.filename))
    .digest("hex"),
  scope: boundaryOnly
    ? "protocol-boundaries-only; physical SDK passage NOT tested"
    : "continuous real SDK approach and entry passage; no teleport or privileged mutation",
  approach: approach ?? null,
  completed: false,
  physicalPassageVerified: false,
  checks: [] as string[],
  failure: null as string | null,
  openConnectionsAfterCleanup: null as number | null,
};
const evidencePath = process.env.STRAHOV_CAD_DOOR_EVIDENCE;
process.on("exit", (code) => {
  if (evidencePath)
    writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          ...evidence,
          exitCode: code,
          status:
            code === 0 && evidence.completed
              ? boundaryOnly
                ? "boundary-pass"
                : "passed"
              : "failed",
          finishedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
});
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string, timeout = 8000) {
  const deadline = performance.now() + timeout;
  while (!check()) {
    if (performance.now() > deadline) throw new Error("Timeout: " + label);
    await sleep(20);
  }
}
type Probe = {
  room: Room;
  id: string;
  inputs: ScriptTimelineClient;
  authority?: ScriptAuthority;
  timeline?: CadDoorTimeline;
  snapshot?: CadDoorSnapshot;
  snapshotCount: number;
  results: ServerDoorResult[];
  deltas: CadDoorDelta[];
  order: string[];
  failures: string[];
  closed: boolean;
};
const sdk = new Client(endpoint),
  probes: Probe[] = [];
async function join(nickname: string) {
  const response = await fetch(endpoint + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "multiplayer",
      profile: { ...DEFAULT_PROFILE, nickname },
    }),
  });
  assert.equal(response.status, 200);
  const session = (await response.json()) as {
    id: string;
    token: string;
    worldId: string;
  };
  if (!probes.length) {
    await assert.rejects(() =>
      sdk.joinById(session.worldId, { protocol: PROTOCOL_VERSION }),
    );
    await assert.rejects(() =>
      sdk.joinById(session.worldId, {
        token: session.token,
        protocol: PROTOCOL_VERSION - 1,
      }),
    );
  }
  const room = await sdk.joinById(session.worldId, {
    token: session.token,
    protocol: PROTOCOL_VERSION,
  });
  const p: Probe = {
    room,
    id: session.id,
    inputs: new ScriptTimelineClient({
      send: (batch) => room.send("inputs", batch),
    }),
    snapshotCount: 0,
    results: [],
    deltas: [],
    order: [],
    failures: [],
    closed: false,
  };
  probes.push(p);
  room.onMessage("*", () => {});
  room.onMessage("doorSnapshot", (snapshot: CadDoorSnapshot) => {
    p.order.push("snapshot");
    p.snapshotCount++;
    p.snapshot = snapshot;
    if (snapshot.definitionHash !== CAD_DOOR_DEFINITION_HASH) {
      p.failures.push("definition hash mismatch");
      return;
    }
    p.timeline ??= new CadDoorTimeline(CAD_DOOR_DEFINITIONS, {
      worldEpoch: snapshot.worldEpoch,
      definitionHash: snapshot.definitionHash,
    });
    const result = p.timeline.acceptSnapshot(snapshot);
    if (result.status === "rejected" || result.status === "resync")
      p.failures.push("snapshot " + result.reason);
  });
  room.onMessage("doorDelta", (delta: CadDoorDelta) => {
    p.order.push("delta");
    p.deltas.push(delta);
    const result = p.timeline?.acceptDelta(delta);
    if (!result || result.status !== "accepted")
      p.failures.push("delta " + result?.status + " " + result?.reason);
  });
  room.onMessage("doorResult", (result: ServerDoorResult) =>
    p.results.push(result),
  );
  room.onMessage("welcome", () => p.order.push("welcome"));
  room.onMessage("authoritative", (authority: ScriptAuthority) => {
    p.order.push("authority");
    p.authority = authority;
    p.inputs.acceptAuthority(authority);
    if (
      authority.doorRevision === undefined ||
      authority.doorWorldEpoch !== p.snapshot?.worldEpoch ||
      !p.timeline?.snapshotAt(authority.tick, authority.doorRevision)
    )
      p.failures.push("authority lacks matching prior door snapshot/delta");
    if (p.order.length > 500) p.order.splice(3, p.order.length - 500);
  });
  room.onError((code, message) => p.failures.push(`SDK ${code}: ${message}`));
  room.onLeave(() => (p.closed = true));
  await until(
    () => !!p.authority && !!p.snapshot,
    nickname + " snapshot and authority",
  );
  assert.ok(p.order.indexOf("snapshot") < p.order.indexOf("welcome"));
  assert.ok(p.order.indexOf("snapshot") < p.order.indexOf("authority"));
  assert.deepEqual(p.failures, []);
  return p;
}
function packet(p: Probe, requestId: number, open: boolean): CadDoorRequest {
  const state = p
    .timeline!.currentSnapshot()!
    .states.find((d) => d.id === doorId)!;
  return {
    worldEpoch: p.snapshot!.worldEpoch,
    definitionHash: CAD_DOOR_DEFINITION_HASH,
    requestId,
    doorId,
    expectedRevision: state.revision,
    open,
  };
}
async function send(p: Probe, request: CadDoorRequest) {
  const index = p.results.length;
  p.room.send("doorRequest", request);
  await until(
    () => p.results.slice(index).some((r) => r.requestId === request.requestId),
    "door request acknowledgement",
  );
  return p.results.slice(index).find((r) => r.requestId === request.requestId)!;
}
const signedSide = (p: { x: number; z: number }) =>
  (p.x - CAD_B6_ENTRY.x) * CAD_B6_ENTRY.nx +
  (p.z - CAD_B6_ENTRY.z) * CAD_B6_ENTRY.nz;
async function walk(
  p: Probe,
  target: { x: number; z: number },
  timeout = 30000,
) {
  await p.inputs.holdUntil(
    () => {
      const position = p.authority!.state.position,
        dx = target.x - position.x,
        dz = target.z - position.z,
        length = Math.hypot(dx, dz);
      return {
        x: length > 0.1 ? dx / length : 0,
        z: length > 0.1 ? dz / length : 0,
        yaw: Math.atan2(dx, dz),
        jump: false,
      };
    },
    () =>
      Math.hypot(
        p.authority!.state.position.x - target.x,
        p.authority!.state.position.z - target.z,
      ) < 0.15,
    `walk to ${target.x.toFixed(3)},${target.z.toFixed(3)}`,
    timeout,
  );
  await p.inputs.holdFor({ x: 0, z: 0, yaw: 0, jump: false }, 180);
  await p.inputs.settle();
}
try {
  const guest = await fetch(endpoint + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "guest" }),
  });
  assert.equal(guest.status, 403);
  assert.equal((await fetch(endpoint + "/api/doors")).status, 403);
  const alice = await join("door-alice"),
    bob = await join("door-bob");
  assert.equal(alice.snapshot!.worldEpoch, bob.snapshot!.worldEpoch);
  assert.equal(alice.snapshot!.states.length, CAD_DOOR_DEFINITIONS.length);
  assert.equal(
    alice.snapshot!.revision,
    0,
    "Use a fresh owned integration server",
  );
  assert.ok(
    alice.snapshot!.states.every((s) => !s.open),
    "Use a fresh isolated server: all default door states must be closed",
  );
  evidence.checks.push(
    "guest/private HTTP boundary; two authenticated clients receive complete same-world closed snapshot before welcome/authority",
  );
  const distant = await send(alice, packet(alice, 1, true));
  assert.equal(distant.reason, "out-of-range");
  assert.equal(alice.deltas.length, 0);
  assert.equal(bob.deltas.length, 0);
  const wrong = await send(bob, {
    ...packet(bob, 1, true),
    worldEpoch: "foreign-guest-world",
  });
  assert.equal(wrong.reason, "wrong-world");
  const snapshots = bob.snapshotCount;
  bob.room.send("doorResync");
  await until(() => bob.snapshotCount > snapshots, "explicit complete resync");
  assert.equal(bob.timeline!.revision, 0);
  evidence.checks.push(
    "far request and foreign world rejected without fanout; explicit resync is complete",
  );
  if (approach) {
    for (const point of approach.waypoints) await walk(alice, point);
    const e = CAD_B6_ENTRY,
      len = Math.hypot(e.end.x - e.start.x, e.end.z - e.start.z);
    const outside = { x: e.x + e.nx * 1.2, z: e.z + e.nz * 1.2 },
      inside = { x: e.x - e.nx * 0.8, z: e.z - e.nz * 0.8 };
    for (const point of [
      {
        x: e.start.x + ((e.start.x - e.end.x) / len) * 0.6,
        z: e.start.z + ((e.start.z - e.end.z) / len) * 0.6,
      },
      e.start,
      e.end,
      outside,
    ])
      await walk(alice, point);
    await sleep(1100);
    const openRequest = packet(alice, 2, true),
      opened = await send(alice, openRequest);
    assert.equal(opened.status, "changed");
    await until(
      () => bob.timeline!.revision === opened.revision,
      "open delta reaches observer before authority",
    );
    const count = bob.deltas.length;
    assert.equal((await send(alice, openRequest)).status, "duplicate");
    await sleep(100);
    assert.equal(bob.deltas.length, count);
    const late = await join("door-late");
    assert.equal(
      late.timeline!.currentSnapshot()!.states.find((s) => s.id === doorId)!
        .open,
      true,
    );
    await walk(alice, inside);
    assert.ok(signedSide(alice.authority!.state.position) < -0.5);
    await walk(alice, outside);
    await sleep(1100);
    const closed = await send(alice, packet(alice, 3, false));
    assert.equal(closed.status, "changed");
    await until(
      () => [bob, late].every((p) => p.timeline!.revision === closed.revision),
      "close synchronized to original and late peer",
    );
    await alice.inputs.holdFor(
      { x: -e.nx, z: -e.nz, yaw: Math.atan2(-e.nx, -e.nz), jump: false },
      700,
    );
    await alice.inputs.settle();
    assert.ok(
      signedSide(alice.authority!.state.position) > 0.24,
      "Closed leaf must stop actual server Actor at the threshold",
    );
    evidence.physicalPassageVerified = true;
    evidence.checks.push(
      "ordinary SDK movement from spawn; E open, observer delta, duplicate idempotence, open late join, inside/outside passage and closed-leaf blocking",
    );
  }
  for (const p of probes) assert.deepEqual(p.failures, []);
  evidence.completed = true;
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  for (const p of probes) {
    p.inputs.dispose();
    p.timeline?.dispose();
    await p.room.leave();
  }
  evidence.openConnectionsAfterCleanup = probes.filter((p) => !p.closed).length;
  assert.equal(evidence.openConnectionsAfterCleanup, 0);
  console.log(JSON.stringify(evidence, null, 2));
}
