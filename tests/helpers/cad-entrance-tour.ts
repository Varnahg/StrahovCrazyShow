import assert from "node:assert/strict";
import { ServerDoorInteractions, type ServerDoorResult } from "../../server/door-interactions";
import { CAD_B6_ENTRY, CAD_DOOR_DEFINITIONS, CAD_DOOR_DEFINITION_HASH } from "../../shared/cad-buildings";
import type { Actor, Simulation } from "../../shared/simulation";

/** Ordinary Actor inputs and the production authority adapter, including reach,
 * sight and swept occupancy. No pose changes or directly forced door states. */
export function cadEntranceTour(sim: Simulation, actor: Actor) {
  const e = CAD_B6_ENTRY;
  const door = CAD_DOOR_DEFINITIONS.find(d => d.definition.sourceDoorId === e.doorId)!;
  assert.ok(door);
  const identity = {worldEpoch: "entrance-regression", definitionHash: CAD_DOOR_DEFINITION_HASH};
  let tick = 0, requestId = 0;
  const results: ServerDoorResult[] = [];
  const manager = new ServerDoorInteractions(sim, CAD_DOOR_DEFINITIONS, identity, {
    isCurrentConnection: (connection: string, id) => connection === actor.id && id === actor.id,
    sendResult: (_connection, result) => results.push(result),
    broadcastDelta() {},
  });
  const step = (x = 0, z = 0) => {
    actor.step({x, z, yaw: Math.atan2(x, z), jump: false, seq: ++tick});
    manager.flush(tick, tick * 1000 / 60);
    sim.tick(0);
    assert.ok(Number.isFinite(actor.position.y), "whole-world route remains finite");
  };
  const walk = (points: readonly (readonly [number, number])[]) => {
    for (const [x,z] of points) {
      let reached = false;
      for (let n = 0; n < 900; n++) {
        const dx = x - actor.position.x, dz = z - actor.position.z, distance = Math.hypot(dx,dz);
        if (distance < .10) { reached = true; break; }
        step(dx/distance,dz/distance);
      }
      assert.ok(reached, `CAD approach blocked before ${x},${z}: ${JSON.stringify(actor.position)}`);
    }
  };
  const request = (open: boolean) => {
    const state = manager.snapshot(tick).states.find(s => s.id === door.id)!;
    assert.equal(manager.receive(actor.id, actor.id, {...identity, requestId: ++requestId, doorId: door.id, expectedRevision: state.revision, open}), true);
    step();
    assert.equal(results.at(-1)?.status, "changed", JSON.stringify(results.at(-1)));
    assert.equal(sim.doorPhysics.isOpen(door.id), open);
  };
  const outside: [number,number] = [e.x + e.nx*1.2,e.z + e.nz*1.2];
  const inside: [number,number] = [e.x - e.nx*.8,e.z - e.nz*.8];
  const length = Math.hypot(e.end.x-e.start.x,e.end.z-e.start.z);
  const stairs: [number,number][] = [
    [e.start.x + (e.start.x-e.end.x)/length*.6, e.start.z + (e.start.z-e.end.z)/length*.6],
    [e.start.x,e.start.z], [e.end.x,e.end.z], outside,
  ];
  const blockedByClosedLeaf = () => {
    assert.equal(sim.doorPhysics.isOpen(door.id), false);
    for (let n=0;n<90;n++) step(-e.nx,-e.nz);
    const p = actor.position;
    assert.ok((p.x-e.x)*e.nx+(p.z-e.z)*e.nz > .24, "closed native leaf blocks the actual actor");
    walk([outside]);
  };
  return {step,walk,request,stairs,outside,inside,blockedByClosedLeaf,dispose:()=>manager.dispose()};
}
