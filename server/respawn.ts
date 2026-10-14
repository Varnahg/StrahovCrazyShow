import type { Actor, Simulation } from "../shared/simulation";
import type { Player } from "../shared/types";
import type { Authority } from "../shared/netcode";
import type { TimelineInputQueue } from "../shared/input-timeline";
import { zoneAt } from "../shared/world";
import { validVehicleState } from "../shared/vehicle";

/** Presence and motion must describe the same current authoritative actor. */
export function synchronizePlayer(
  player: Player,
  actor: Actor,
  ack = player.ack,
) {
  const position = actor.position;
  Object.assign(player, position, {
    yaw: actor.yaw,
    speed: actor.speed,
    vehicle: actor.vehicle,
    grounded: actor.grounded,
    zone: zoneAt(position),
    ack,
  });
}

/** Explicit recovery starts a new input epoch, so neither queued nor in-flight
 * commands can replay a pre-respawn car instruction into the recovered actor.
 * Never read the damaged pose or invoke an ordinary vehicle exit here.
 */
export function respawnServerPlayer(
  simulation: Simulation,
  player: Player,
  queue: TimelineInputQueue,
  recovery: { inputEpoch: number; tick: number; time: number },
): { authority: Authority; carRecovered: boolean } | null {
  const actor = simulation.actors.get(player.id);
  if (!actor) return null;
  const carRecovered =
    simulation.car.driverId === player.id ||
    (actor.vehicle && simulation.car.driverId === null);
  queue.reset(recovery.inputEpoch, recovery.tick);
  if (!simulation.respawnActor(player.id)) return null;
  synchronizePlayer(player, actor, queue.ack);
  const state = actor.capture(),
    car = simulation.car.capture();
  // The same forced reset supplies a safe public car pose before the next
  // rendered frame. Never serialize invalid third-party vehicle physics.
  if (validVehicleState(car)) state.vehicleState = car;
  return {
    authority: {
      ...queue.frontier(),
      time: recovery.time,
      state,
      resync: true,
      respawn: true,
      resyncReason: "respawn",
    },
    carRecovered,
  };
}
