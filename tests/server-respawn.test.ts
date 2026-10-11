import test from "node:test";
import assert from "node:assert/strict";
import { initPhysics, Simulation, type Actor } from "../shared/simulation";
import { InputQueue, FIXED_DT } from "../shared/netcode";
import { DEFAULT_PROFILE, type Player } from "../shared/types";
import { SPAWN, CAR_SPAWN } from "../shared/world";
import { validVehicleState } from "../shared/vehicle";
import { respawnServerPlayer } from "../server/respawn";

await initPhysics();
function queuedVehicleInputs() {
  const queue = new InputQueue();
  for (let seq = 1; seq <= 8; seq++)
    assert.equal(
      queue.push({ x: 1, z: 1, yaw: 0.3, seq, jump: true, vehicle: true }, 100),
      true,
    );
  queue.consume(110);
  queue.consume(110);
  return queue;
}
function presence(actor: Actor, ack: number): Player {
  return {
    ...DEFAULT_PROFILE,
    id: actor.id,
    ...actor.position,
    yaw: actor.yaw,
    speed: actor.speed,
    vehicle: actor.vehicle,
    ack,
    zone: "outside",
    emote: "",
  };
}
function nearSpawn(position: { x: number; y: number; z: number }) {
  assert.ok(
    Math.hypot(
      position.x - SPAWN.x,
      position.y - SPAWN.y,
      position.z - SPAWN.z,
    ) < 1e-4,
  );
}

test("old respawn sequence demonstrably retains queued commands and broadcasts stale presence; forced recovery clears both", () => {
  const sim = new Simulation();
  try {
    const actor = sim.add("driver");
    actor.setVehicle(true);
    sim.car.body.setTranslation({ x: 1e6, y: 1e6, z: -1e6 }, true);
    const queue = queuedVehicleInputs(),
      player = presence(actor, queue.ack);
    // Exact old server handler's state operations. This is an independent
    // reset regression, not proof of the cause of the user's roof incident.
    actor.setVehicle(false);
    actor.setPosition(SPAWN);
    nearSpawn(actor.position);
    assert.equal(queue.pending.length, 6);
    assert.equal(queue.ack, 2);
    assert.equal(player.vehicle, true);
    assert.equal(player.x, 1e6);
    // Start the fixed recovery from the same owned, distant car situation.
    actor.setVehicle(true);
    const result = respawnServerPlayer(sim, player, queue, 37, 12345)!;
    assert.equal(result.carRecovered, true);
    assert.equal(result.authority.resync, true);
    assert.equal(result.authority.respawn, true);
    assert.equal(result.authority.tick, 37);
    assert.equal(result.authority.time, 12345);
    assert.equal(result.authority.ack, 8);
    assert.equal(queue.pending.length, 0);
    assert.equal(queue.lastReceived, 8);
    assert.equal(queue.ack, 8);
    assert.deepEqual(queue.consume(120), {
      x: 0,
      z: 0,
      yaw: 0,
      jump: false,
      seq: 8,
    });
    assert.equal(result.authority.state.vehicle, false);
    nearSpawn(result.authority.state.position);
    nearSpawn(player);
    assert.equal(player.vehicle, false);
    assert.equal(player.ack, 8);
    assert.equal(player.speed, 0);
    assert.equal(player.yaw, 0);
    assert.ok(validVehicleState(result.authority.state.vehicleState!));
    assert.equal(result.authority.state.vehicleState!.driverId, null);
    assert.equal(result.authority.state.vehicleState!.parked, true);
    assert.equal(result.authority.state.vehicleState!.position.x, CAR_SPAWN.x);
    assert.equal(result.authority.state.vehicleState!.position.z, CAR_SPAWN.z);
    assert.equal(
      queue.push(
        { x: 1, z: 0, yaw: 0, jump: false, seq: 8, vehicle: true },
        130,
      ),
      false,
    );
    assert.equal(
      queue.push(
        { x: 1, z: 0, yaw: 0, jump: false, seq: 9, vehicle: false },
        130,
      ),
      true,
    );
    actor.step(queue.consume(140), FIXED_DT);
    sim.tick(0);
    assert.ok(
      actor.position.x > SPAWN.x,
      "fresh acknowledged input must work after recovery",
    );
    assert.equal(actor.vehicle, false);
  } finally {
    sim.dispose();
  }
});

test("server forced recovery produces finite authoritative foot+car state from invalid physics without stale reads", () => {
  const sim = new Simulation();
  try {
    const actor = sim.add("invalid-driver");
    actor.setVehicle(true);
    const queue = queuedVehicleInputs(),
      player = presence(actor, queue.ack);
    // Inject the failure in native physics only in this isolated test world.
    sim.car.body.setTranslation({ x: NaN, y: Infinity, z: -Infinity }, true);
    actor.body.setTranslation({ x: NaN, y: NaN, z: NaN }, true);
    actor.vertical = NaN;
    const result = respawnServerPlayer(sim, player, queue, 100, 54321)!;
    assert.equal(
      sim.actors.get(actor.id),
      actor,
      "public actor identity must survive native recovery",
    );
    assert.equal(result.authority.resync, true);
    assert.equal(result.authority.respawn, true);
    assert.equal(result.authority.ack, 8);
    nearSpawn(result.authority.state.position);
    assert.equal(result.authority.state.vehicle, false);
    assert.equal(result.authority.state.speed, 0);
    assert.equal(result.authority.state.vertical, 0);
    assert.equal(result.authority.state.yaw, 0);
    assert.ok(validVehicleState(result.authority.state.vehicleState!));
    assert.deepEqual(
      JSON.parse(JSON.stringify(result.authority)),
      result.authority,
      "wire payload must not silently turn NaN/Infinity into null",
    );
    for (let i = 0; i < 4; i++) {
      actor.step(queue.consume(200 + i), FIXED_DT);
      sim.tick(0);
    }
    assert.ok(
      [actor.position.x, actor.position.y, actor.position.z].every(
        Number.isFinite,
      ),
    );
    assert.ok(
      Math.hypot(actor.position.x - SPAWN.x, actor.position.z - SPAWN.z) < 1e-4,
    );
  } finally {
    sim.dispose();
  }
});

test("respawn of another player never resets the shared car's different owner", () => {
  const sim = new Simulation();
  try {
    const owner = sim.add("owner"),
      walker = sim.add("walker");
    owner.setVehicle(true);
    sim.car.body.setTranslation({ x: 120, y: 4, z: 35 }, true);
    const before = sim.car.capture(),
      queue = queuedVehicleInputs(),
      player = presence(walker, queue.ack);
    walker.setPosition({ x: 1e6, y: 1e6, z: 1e6 });
    const result = respawnServerPlayer(sim, player, queue, 5)!;
    assert.equal(result.carRecovered, false);
    assert.deepEqual(sim.car.capture(), before);
    assert.deepEqual(result.authority.state.vehicleState, before);
    assert.equal(owner.vehicle, true);
    assert.equal(sim.car.driverId, owner.id);
    nearSpawn(player);
    assert.equal(queue.pending.length, 0);
    sim.remove(walker.id);
    assert.equal(respawnServerPlayer(sim, player, queue, 6), null);
  } finally {
    sim.dispose();
  }
});
