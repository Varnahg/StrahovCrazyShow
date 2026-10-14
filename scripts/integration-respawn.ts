/** Real authenticated SDK recovery regression. Never targets the user's world. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  type Authority,
  type MotionPacket,
} from "../shared/netcode";
import { DEFAULT_PROFILE, type Player } from "../shared/types";
import { SPAWN, CAR_SPAWN } from "../shared/world";
import { validVehicleState } from "../shared/vehicle";
import { MotionDecoder } from "../shared/motion-codec";
import {
  ScriptTimelineClient,
  type ScriptAuthority,
  type ScriptControls,
} from "./timeline-client";

const endpoint = process.env.STRAHOV_TEST_URL || "http://127.0.0.1:2568";
assert.equal(
  endpoint,
  "http://127.0.0.1:2568",
  "Respawn regression requires its dedicated test server on 2568",
);
const evidencePath =
  process.env.STRAHOV_RESPAWN_EVIDENCE ||
  process.env.STRAHOV_INTEGRATION_EVIDENCE?.replace(/\.json$/, "-respawn.json");
const evidence = {
  startedAt: new Date().toISOString(),
  endpoint,
  protocol: PROTOCOL_VERSION,
  sourceSnapshotId: existsSync("source-manifest.json")
    ? JSON.parse(readFileSync("source-manifest.json", "utf8")).snapshotId
    : null,
  harnessSha256: createHash("sha256")
    .update(readFileSync(import.meta.filename))
    .digest("hex"),
  completed: false,
  lastStage: "connect",
  checks: [] as string[],
  resets: [] as unknown[],
  errors: [] as string[],
  openAuthenticatedConnectionsAfterCleanup: null as number | null,
  scope:
    "Real HTTP session issuance and authenticated SDK messages on an isolated production server; no privileged position mutation, no GPU/FPS benchmark, no access to live API2570.",
};
process.on("exit", (code) => {
  if (evidencePath)
    writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          ...evidence,
          exitCode: code,
          status: code === 0 && evidence.completed ? "passed" : "failed",
          finishedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string) {
  evidence.lastStage = label;
  for (let i = 0; i < 200; i++) {
    if (check()) {
      evidence.checks.push(label);
      return;
    }
    await sleep(25);
  }
  throw new Error("Timeout: " + label);
}
type Event = { type: string; value: any };
type Probe = {
  id: string;
  room: Room;
  inputs: ScriptTimelineClient;
  authority?: ScriptAuthority;
  motion?: MotionPacket;
  events: Event[];
  notices: string[];
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
  const room = await sdk.joinById(session.worldId, {
    token: session.token,
    protocol: PROTOCOL_VERSION,
  });
  const probe: Probe = {
    id: session.id,
    room,
    inputs: new ScriptTimelineClient({
      send: (batch) => room.send("inputs", batch),
    }),
    events: [],
    notices: [],
  };
  probes.push(probe);
  room.onMessage("*", () => {});
  room.onMessage("authoritative", (packet: ScriptAuthority) => {
    probe.authority = packet;
    probe.inputs.acceptAuthority(packet);
    probe.events.push({ type: "authoritative", value: packet });
  });
  const motion = new MotionDecoder();
  room.onMessage("motion", (wire: unknown) => {
    const packet = motion.decode(wire);
    assert.ok(packet, "respawn observer retains the motion baseline");
    probe.motion = packet;
  });
  room.onMessage("presence", (players: Player[]) =>
    probe.events.push({ type: "presence", value: players }),
  );
  room.onMessage("car", (packet) =>
    probe.events.push({ type: "car", value: packet }),
  );
  room.onMessage("notice", (notice) => probe.notices.push(String(notice)));
  room.onError((code, message) =>
    evidence.errors.push(`${nickname}: ${code} ${message}`),
  );
  await until(() => !!probe.authority, nickname + " initial authority");
  assert.equal(
    probe.authority!.respawn,
    undefined,
    "welcome reset is not a respawn acknowledgement",
  );
  return probe;
}
async function ordinaryResync(probe: Probe) {
  const firstEvent = probe.events.length,
    previousEpoch = probe.authority!.inputEpoch;
  probe.room.send("resync");
  let reply: Authority | undefined;
  await until(() => {
    reply = probe.events
      .slice(firstEvent)
      .find(
        (event) =>
          event.type === "authoritative" && event.value.resync === true,
      )?.value;
    return !!reply;
  }, "ordinary resync receives its own authoritative reply");
  assert.equal(
    reply!.respawn,
    undefined,
    "ordinary resync must not acknowledge a pending respawn",
  );
  assert.ok(
    reply!.inputEpoch > previousEpoch,
    "ordinary recovery changes the input epoch",
  );
  assert.equal(reply!.ack, 0);
}
async function moveUntil(
  probe: Probe,
  controls: ScriptControls | (() => ScriptControls),
  check: () => boolean,
  label: string,
) {
  evidence.lastStage = label;
  await probe.inputs.holdUntil(controls, check, label, 120 * 34);
  evidence.checks.push(label);
}
async function enterCar(probe: Probe) {
  await moveUntil(
    probe,
    () => {
      const p = probe.authority!.state.position;
      const dx = CAR_SPAWN.x - p.x,
        dz = CAR_SPAWN.z - p.z,
        length = Math.max(1, Math.hypot(dx, dz));
      return {
        x: dx / length,
        z: dz / length,
        yaw: 0,
        jump: false,
        vehicle: false,
      };
    },
    () =>
      Math.hypot(
        probe.authority!.state.position.x - CAR_SPAWN.x,
        probe.authority!.state.position.z - CAR_SPAWN.z,
      ) < 4.2,
    "walk within car entry range",
  );
  await probe.inputs.settle();
  evidence.checks.push("walking timeline resolved before entering");
  probe.room.send("vehicle");
  await until(
    () =>
      probe.authority!.state.vehicle &&
      probe.authority!.state.vehicleState?.driverId === probe.id,
    "actual vehicle entry",
  );
}
const atSpawn = (p: { x: number; y: number; z: number }) =>
  Math.hypot(p.x - SPAWN.x, p.y - SPAWN.y, p.z - SPAWN.z) < 1e-4;
const playerRecord = (p: Player) => ({
  id: p.id,
  x: p.x,
  y: p.y,
  z: p.z,
  yaw: p.yaw,
  speed: p.speed,
  vehicle: p.vehicle,
  ack: p.ack,
  zone: p.zone,
});
async function respawn(
  probe: Probe,
  observer: Probe,
  count: number,
  vehicle: boolean,
) {
  const firstEvent = probe.events.length,
    firstObserver = observer.events.length;
  const ackBefore = probe.authority!.ack,
    epochBefore = probe.authority!.inputEpoch;
  const discardedBefore = probe.authority!.network!.queue.discarded;
  for (let sent = 0; sent < count; sent += 8)
    probe.room.send(
      "inputs",
      Array.from({ length: Math.min(8, count - sent) }, (_, index) => ({
        x: 1,
        z: 1,
        yaw: 0,
        jump: false,
        vehicle,
        seq: ackBefore + sent + index + 1,
        inputEpoch: epochBefore,
      })),
    );
  probe.room.send("respawn");
  let forced: Authority | undefined;
  await until(() => {
    forced = probe.events
      .slice(firstEvent)
      .find(
        (event) =>
          event.type === "authoritative" &&
          event.value.resync === true &&
          event.value.respawn === true &&
          event.value.inputEpoch > epochBefore &&
          event.value.ack === 0,
      )?.value;
    return !!forced;
  }, "respawn replies with forced authority in a fresh input epoch at ack zero");
  assert.equal(forced!.inputTickBase, forced!.tick);
  assert.equal(forced!.receivedSeq, 0);
  assert.equal(forced!.state.vehicle, false);
  assert.equal(forced!.respawn, true);
  assert.ok(
    atSpawn(forced!.state.position),
    "forced packet must carry the pre-tick spawn, not delayed motion",
  );
  assert.equal(forced!.state.speed, 0);
  assert.equal(forced!.state.vertical, 0);
  assert.ok(validVehicleState(forced!.state.vehicleState!));
  let current: Player | undefined, seenByObserver: Player | undefined;
  const findPresence = (events: Event[]) =>
    events
      .filter((event) => event.type === "presence")
      .flatMap((event) => event.value as Player[])
      .find(
        (p) => p.id === probe.id && !p.vehicle && p.ack === 0 && atSpawn(p),
      );
  await until(() => {
    current = findPresence(probe.events.slice(firstEvent));
    seenByObserver = findPresence(observer.events.slice(firstObserver));
    return !!current && !!seenByObserver;
  }, "both SDK peers receive current respawn presence, without stale vehicle or coordinates");
  const authorityIndex = probe.events.findIndex(
    (event, index) =>
      index >= firstEvent &&
      event.type === "authoritative" &&
      event.value === forced,
  );
  const presenceIndex = probe.events.findIndex(
    (event, index) =>
      index >= firstEvent &&
      event.type === "presence" &&
      (event.value as Player[]).some((p) => p.id === probe.id && p.ack === 0),
  );
  assert.ok(
    authorityIndex >= firstEvent && presenceIndex > authorityIndex,
    "forced authority must precede matching presence",
  );
  if (count > 0) {
    const queue = forced!.network!.queue;
    assert.ok("resolution" in queue && queue.resolution === "scheduled-tick");
    assert.equal(queue.depth, 0, "respawn discards queued old-epoch input");
    assert.ok(
      queue.discarded > discardedBefore,
      "this request actually left accepted future commands pending",
    );
  }
  evidence.resets.push({
    id: probe.id,
    ackBefore,
    epochBefore,
    burstLastSeq: ackBefore + count,
    queuedBurst: count,
    forced,
    localPresence: playerRecord(current!),
    observerPresence: playerRecord(seenByObserver!),
  });
  return forced!;
}

try {
  assert.deepEqual(await (await fetch(endpoint + "/api/health")).json(), {
    ok: true,
    demo: true,
  });
  assert.equal((await fetch(endpoint + "/api/players")).status, 403);
  const a = await join("respawn driver"),
    b = await join("respawn observer");
  await ordinaryResync(a);
  await ordinaryResync(b);
  await enterCar(a);
  const recovered = await respawn(a, b, 32, true);
  assert.equal(recovered.state.vehicleState!.driverId, null);
  assert.equal(recovered.state.vehicleState!.parked, true);
  assert.equal(recovered.state.vehicleState!.position.x, CAR_SPAWN.x);
  assert.equal(recovered.state.vehicleState!.position.z, CAR_SPAWN.z);
  // Neither a resolved new-epoch slot nor an old-epoch vehicle input can regain control.
  const duplicateAck = recovered.ack,
    beforeDuplicate = a.events.length;
  a.room.send("inputs", [
    {
      x: 1,
      z: 1,
      yaw: 0,
      jump: true,
      vehicle: true,
      seq: duplicateAck,
      inputEpoch: recovered.inputEpoch,
    },
    {
      x: 1,
      z: 1,
      yaw: 0,
      jump: true,
      vehicle: true,
      seq: 12,
      inputEpoch: recovered.inputEpoch - 1,
    },
  ]);
  await until(
    () =>
      a.events.slice(beforeDuplicate).filter((e) => e.type === "authoritative")
        .length >= 2,
    "two authority samples after duplicate input",
  );
  assert.ok(
    a.authority!.ack > duplicateAck,
    "world time continues without replaying rejected inputs",
  );
  assert.equal(a.authority!.inputEpoch, recovered.inputEpoch);
  assert.equal(a.authority!.state.vehicle, false);
  assert.ok(
    Math.hypot(
      a.authority!.state.position.x - SPAWN.x,
      a.authority!.state.position.z - SPAWN.z,
    ) < 1e-4,
  );
  await moveUntil(
    a,
    { x: 1, z: 0, yaw: 0, jump: false, vehicle: false },
    () => a.authority!.state.position.x > SPAWN.x + 0.01,
    "fresh scheduled input moves the recovered pedestrian",
  );
  const resumedFrontier = a.inputs.frontier;
  await a.inputs.settle(resumedFrontier);
  await until(
    () =>
      b.motion?.rows.some(
        (row) =>
          row[0] === a.id &&
          row[6] >= resumedFrontier.seq &&
          row[1] > SPAWN.x + 0.01,
      ) ?? false,
    "observer receives movement after recovery",
  );
  await enterCar(a);
  await moveUntil(
    a,
    { x: 0, z: 1, yaw: 0, jump: false, vehicle: true },
    () => {
      const p = a.authority!.state.position;
      return Math.hypot(p.x - CAR_SPAWN.x, p.z - CAR_SPAWN.z) > 1.1;
    },
    "drive shared car away from its canonical recovery pose",
  );
  await moveUntil(
    a,
    { x: 0, z: 0, yaw: 0, jump: true, vehicle: true },
    () => Math.abs(a.authority!.state.speed) < 0.2,
    "brake before testing another player's respawn",
  );
  await a.inputs.settle();
  const foreignBefore = a.authority!.state.vehicleState!;
  const otherReset = await respawn(b, a, 32, false);
  const foreignAfter = otherReset.state.vehicleState!;
  assert.equal(foreignAfter.driverId, a.id);
  assert.equal(foreignAfter.parked, false);
  assert.ok(
    Math.hypot(
      foreignAfter.position.x - CAR_SPAWN.x,
      foreignAfter.position.z - CAR_SPAWN.z,
    ) > 0.75,
    "other player must not teleport the shared car to recovery spawn",
  );
  assert.ok(
    Math.hypot(
      foreignAfter.position.x - foreignBefore.position.x,
      foreignAfter.position.z - foreignBefore.position.z,
    ) < 0.3,
    "stationary foreign car retains its location",
  );
  assert.equal(a.authority!.state.vehicle, true);
  evidence.checks.push(
    "another player's respawn retains the different driver and displaced shared car",
  );
  // Restore the isolated test world's canonical car for the next integration.
  await respawn(a, b, 0, true);
} catch (error) {
  evidence.errors.push(error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  probes.forEach((probe) => probe.inputs.dispose());
  for (const probe of probes)
    if (probe.room.connection.isOpen) await probe.room.leave();
  evidence.openAuthenticatedConnectionsAfterCleanup = probes.filter(
    (probe) => probe.room.connection.isOpen,
  ).length;
  assert.equal(evidence.openAuthenticatedConnectionsAfterCleanup, 0);
}
assert.deepEqual(
  evidence.errors,
  [],
  "SDK must finish without protocol errors",
);
assert.deepEqual(
  probes.flatMap((probe) => probe.notices),
  [],
  "all scripted recovery actions must be accepted without server notices",
);
evidence.completed = true;
console.log(
  "PASS: real SDK queued vehicle respawn, fresh epoch forced authority and current presence, duplicate/old-epoch rejection, fresh scheduled movement, protected foreign driver, canonical isolated-world cleanup.",
);
