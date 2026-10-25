/** Authenticated transport adapter. Only flush() changes the shared door world;
 * packet callbacks never move physics or trust client-supplied actor positions. */
import type RAPIER from "@dimforge/rapier3d-compat";
import {
  CadDoorStateStore,
  cadDoorTick,
  parseCadDoorRequest,
  type CadDoorDelta,
  type CadDoorIdentity,
  type CadDoorRequest,
  type CadDoorRequestResult,
  type CadDoorSnapshot,
  type CadDoorWorldDefinition,
} from "../shared/cad-doors";
import type {
  CadDoorPhysics,
  CadDoorCapsuleProbe,
  CadDoorObstacleProbe,
} from "../shared/cad-door-physics";
import type { Vec3 } from "../shared/types";

export const MAX_PENDING_DOOR_REQUESTS_PER_ACTOR = 4;
/** Canonical server eye stays within the player's standing capsule. Camera or
 * cosmetic avatar dimensions cannot let a client interact through a wall. */
export const SERVER_DOOR_EYE_OFFSET = 0.6;
export type ServerDoorActor = {
  readonly position: Readonly<Vec3>;
  readonly vehicle: boolean;
  readonly collider: RAPIER.Collider;
};
export type ServerDoorSimulation = {
  readonly actors: ReadonlyMap<string, ServerDoorActor>;
  readonly doorPhysics: Pick<
    CadDoorPhysics,
    "lineOfSight" | "guardChange" | "apply"
  >;
  doorCapsules(): readonly CadDoorCapsuleProbe[];
  doorObstacles(): readonly CadDoorObstacleProbe[];
};
export type ServerDoorResult = Omit<CadDoorRequestResult, "delta"> &
  CadDoorIdentity & { revision: number };
type Transport<C> = {
  isCurrentConnection: (connection: C, actorId: string) => boolean;
  sendResult: (connection: C, result: ServerDoorResult) => void;
  broadcastDelta: (delta: CadDoorDelta) => void;
};
type Pending<C> = {
  actorId: string;
  connection: C;
  request: CadDoorRequest | null;
};

export class ServerDoorInteractions<C> {
  private readonly state: CadDoorStateStore;
  private pending: Pending<C>[] = [];
  private pendingCounts = new Map<string, number>();
  private disposed = false;
  constructor(
    readonly sim: ServerDoorSimulation,
    definitions: readonly CadDoorWorldDefinition[],
    identity: CadDoorIdentity,
    private transport: Transport<C>,
  ) {
    this.state = new CadDoorStateStore(definitions, identity);
  }
  get identity() {
    return this.state.identity;
  }
  get revision() {
    return this.state.revision;
  }
  get pendingCount() {
    return this.pending.length;
  }
  snapshot(tick: number): CadDoorSnapshot {
    return this.state.snapshot(tick);
  }
  /** actorId comes from authenticated server session, never from the payload. */
  receive(connection: C, actorId: string, raw: unknown): boolean {
    if (
      this.disposed ||
      !this.transport.isCurrentConnection(connection, actorId) ||
      !this.sim.actors.has(actorId)
    )
      return false;
    const request = parseCadDoorRequest(raw),
      count = this.pendingCounts.get(actorId) ?? 0;
    if (count >= MAX_PENDING_DOOR_REQUESTS_PER_ACTOR) {
      this.reply(connection, {
        status: "rejected",
        reason: "rate-limit",
        requestId: request?.requestId,
      });
      return false;
    }
    // Retain a bounded validated copy only, not an arbitrary large wire object.
    this.pending.push({ actorId, connection, request });
    this.pendingCounts.set(actorId, count + 1);
    return true;
  }
  /** Call after every actor.step and before the ordinary sim.tick. The delta's
   * tick describes the resulting POST-TICK door state, not the movement phase. */
  flush(tick: number, nowMs: number): void {
    if (this.disposed) return;
    if (!cadDoorTick(tick) || !Number.isFinite(nowMs))
      throw new Error("Invalid door flush clock");
    const requests = this.pending;
    this.pending = [];
    this.pendingCounts.clear();
    if (!requests.length) return;
    // Same explicit current/next body trajectories for all decisions this tick.
    const capsules = this.sim.doorCapsules();
    for (const { actorId, connection, request } of requests) {
      const actor = this.sim.actors.get(actorId);
      if (!actor || !this.transport.isCurrentConnection(connection, actorId))
        continue;
      const p = actor.position,
        eye = { x: p.x, y: p.y + SERVER_DOOR_EYE_OFFSET, z: p.z };
      const result = this.state.request(request, {
        actor: { id: actorId, position: p, eye, vehicle: actor.vehicle },
        tick,
        nowMs,
        canSee: (door, state) =>
          this.sim.doorPhysics.lineOfSight(
            eye,
            door.id,
            state.open,
            actor.collider,
          ),
        canChange: (door, _from, open) =>
          this.sim.doorPhysics.guardChange(door.id, open, capsules, this.sim.doorObstacles()).allowed,
        apply: (id, open) => {
          this.sim.doorPhysics.apply(id, open);
        },
      });
      // A single broadcast per accepted revision, before the authority frontier.
      if (result.delta) this.transport.broadcastDelta(result.delta);
      this.reply(connection, result);
    }
  }
  private reply(connection: C, result: CadDoorRequestResult) {
    const { delta: _delta, ...reply } = result;
    this.transport.sendResult(connection, {
      ...reply,
      ...this.state.identity,
      revision: this.state.revision,
    });
  }
  forgetActor(actorId: string) {
    this.pending = this.pending.filter((p) => p.actorId !== actorId);
    this.pendingCounts.delete(actorId);
    this.state.forgetActor(actorId);
  }
  /** Physics belongs to Simulation and must not be disposed by this adapter. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = [];
    this.pendingCounts.clear();
    this.state.dispose();
  }
}
