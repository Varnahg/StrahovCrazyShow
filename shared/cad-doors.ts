/** Shared B6 door geometry and authoritative discrete state. No renderer,
 * global world, wall clock or physics controller is owned by this module. */
import { cadLocalToWorld, type CadPlacement } from "./cad-building-geometry";
import type { Vec3 } from "./types";

export type CadDoorDefinition = Readonly<{
  id: string;
  buildingId: "b06";
  floor: string;
  sourceDoorId: string;
  renderPartIds: readonly string[];
  collisionPartIds: readonly string[];
  hingeModel: Readonly<Vec3>;
  closedPose: Readonly<{ position: Readonly<Vec3>; rotationY: number }>;
  collider: Readonly<{ halfExtents: Readonly<Vec3> }>;
  openAngle: number;
  handleModel: Readonly<Vec3>;
  defaultOpen: false;
}>;
export type CadDoorWorldDefinition = Readonly<{
  id: string;
  definition: CadDoorDefinition;
  placement: CadPlacement;
  hinge: Readonly<Vec3>;
  closedPosition: Readonly<Vec3>;
  closedRotationY: number;
  closedHandle: Readonly<Vec3>;
  halfExtents: Readonly<Vec3>;
  openAngle: number;
}>;
export type CadDoorIdentity = Readonly<{
  worldEpoch: string;
  definitionHash: string;
}>;
export type CadDoorState = Readonly<{
  id: string;
  open: boolean;
  revision: number;
  changedAtTick: number;
}>;
export type CadDoorSnapshot = CadDoorIdentity &
  Readonly<{ revision: number; tick: number; states: readonly CadDoorState[] }>;
export type CadDoorDelta = CadDoorIdentity &
  Readonly<{ revision: number; tick: number; door: CadDoorState }>;
export type CadDoorRequest = CadDoorIdentity &
  Readonly<{
    requestId: number;
    doorId: string;
    expectedRevision: number;
    open: boolean;
  }>;
export type CadDoorInteractor = Readonly<{
  id: string;
  position: Readonly<Vec3>;
  eye: Readonly<Vec3>;
  vehicle: boolean;
}>;
export type CadDoorRequestReason =
  | "invalid"
  | "wrong-world"
  | "unknown-door"
  | "stale-revision"
  | "stale-request"
  | "rate-limit"
  | "vehicle"
  | "out-of-range"
  | "occluded"
  | "occupied"
  | "disposed";
export type CadDoorRequestResult = Readonly<{
  status: "changed" | "unchanged" | "duplicate" | "rejected";
  requestId?: number;
  reason?: CadDoorRequestReason;
  state?: CadDoorState;
  delta?: CadDoorDelta;
}>;
export type CadDoorRequestContext = {
  actor: CadDoorInteractor;
  tick: number;
  nowMs: number;
  canSee: (
    door: CadDoorWorldDefinition,
    state: CadDoorState,
    eye: Readonly<Vec3>,
  ) => boolean;
  canChange: (
    door: CadDoorWorldDefinition,
    fromOpen: boolean,
    toOpen: boolean,
  ) => boolean;
  /** Apply physics flags synchronously. Throwing leaves authoritative state unchanged. */
  apply: (id: string, open: boolean) => void;
};
export const CAD_DOOR_INTERACTION_RANGE = 2;
export const CAD_DOOR_REQUESTS_PER_SECOND = 4;

const finiteVec = (v: unknown): v is Vec3 =>
  !!v &&
  typeof v === "object" &&
  ["x", "y", "z"].every(
    (k) =>
      typeof (v as Record<string, unknown>)[k] === "number" &&
      Number.isFinite((v as Record<string, number>)[k]),
  );
const idString = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0 && s.length <= 256;
export const cadDoorTick = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0;
export function assertCadDoorIdentity(identity: CadDoorIdentity) {
  if (
    !identity ||
    !idString(identity.worldEpoch) ||
    !/^[a-f0-9]{64}$/.test(identity.definitionHash)
  )
    throw new Error("Invalid door world identity");
}
const cloneVec = (v: Readonly<Vec3>) =>
  Object.freeze({ x: v.x, y: v.y, z: v.z });
const rotate = (p: Readonly<Vec3>, angle: number): Vec3 => ({
  x: Math.cos(angle) * p.x + Math.sin(angle) * p.z,
  y: p.y,
  z: -Math.sin(angle) * p.x + Math.cos(angle) * p.z,
});
const about = (
  p: Readonly<Vec3>,
  hinge: Readonly<Vec3>,
  angle: number,
): Vec3 => {
  const q = rotate(
    { x: p.x - hinge.x, y: p.y - hinge.y, z: p.z - hinge.z },
    angle,
  );
  return { x: q.x + hinge.x, y: q.y + hinge.y, z: q.z + hinge.z };
};

export function placeCadDoorDefinition(
  raw: CadDoorDefinition,
  placement: CadPlacement,
): CadDoorWorldDefinition {
  if (
    !raw ||
    raw.buildingId !== "b06" ||
    !idString(raw.id) ||
    !idString(raw.floor) ||
    !idString(raw.sourceDoorId) ||
    raw.defaultOpen !== false ||
    !Array.isArray(raw.renderPartIds) ||
    !raw.renderPartIds.length ||
    !Array.isArray(raw.collisionPartIds) ||
    ![...raw.renderPartIds, ...raw.collisionPartIds].every(idString) ||
    new Set(raw.renderPartIds).size !== raw.renderPartIds.length ||
    new Set(raw.collisionPartIds).size !== raw.collisionPartIds.length ||
    !finiteVec(raw.hingeModel) ||
    !finiteVec(raw.closedPose?.position) ||
    !finiteVec(raw.handleModel) ||
    !finiteVec(raw.collider?.halfExtents) ||
    ![raw.openAngle, raw.closedPose.rotationY, placement?.yaw].every(
      Number.isFinite,
    ) ||
    !finiteVec(placement?.translation) ||
    Math.abs(raw.openAngle) < 0.01 ||
    Math.abs(raw.openAngle) > Math.PI ||
    !Object.values(raw.collider.halfExtents).every((n) => n > 0 && n <= 10)
  )
    throw new Error("Invalid native B6 door definition");
  const definition: CadDoorDefinition = Object.freeze({
    ...raw,
    renderPartIds: Object.freeze([...raw.renderPartIds]),
    collisionPartIds: Object.freeze([...raw.collisionPartIds]),
    hingeModel: cloneVec(raw.hingeModel),
    handleModel: cloneVec(raw.handleModel),
    closedPose: Object.freeze({
      position: cloneVec(raw.closedPose.position),
      rotationY: raw.closedPose.rotationY,
    }),
    collider: Object.freeze({
      halfExtents: cloneVec(raw.collider.halfExtents),
    }),
  });
  const pose = Object.freeze({
    translation: cloneVec(placement.translation),
    yaw: placement.yaw,
  });
  return Object.freeze({
    id: raw.id,
    definition,
    placement: pose,
    hinge: cloneVec(cadLocalToWorld(raw.hingeModel, pose)),
    closedPosition: cloneVec(cadLocalToWorld(raw.closedPose.position, pose)),
    closedRotationY: raw.closedPose.rotationY + pose.yaw,
    closedHandle: cloneVec(cadLocalToWorld(raw.handleModel, pose)),
    halfExtents: definition.collider.halfExtents,
    openAngle: raw.openAngle,
  });
}

export function cadDoorDefinitionsById(
  definitions: readonly CadDoorWorldDefinition[],
) {
  const result = new Map<string, CadDoorWorldDefinition>(),
    renderIds = new Set<string>(),
    collisionIds = new Set<string>();
  for (const door of definitions) {
    if (result.has(door.id)) throw new Error("Duplicate door ID " + door.id);
    result.set(door.id, door);
    for (const id of door.definition.renderPartIds) {
      if (renderIds.has(id))
        throw new Error("Shared movable door render part " + id);
      renderIds.add(id);
    }
    for (const id of door.definition.collisionPartIds) {
      if (collisionIds.has(id))
        throw new Error("Shared movable door collision part " + id);
      collisionIds.add(id);
    }
  }
  return result;
}
/** Exact IDs only. Empty lists are valid when moving render parts export collision:false. */
export function cadDoorCollisionPartIds(
  definitions: readonly CadDoorWorldDefinition[],
): ReadonlySet<string> {
  cadDoorDefinitionsById(definitions);
  return new Set(
    definitions.flatMap((d) => [...d.definition.collisionPartIds]),
  );
}
export function cadDoorPose(door: CadDoorWorldDefinition, open: boolean) {
  if (typeof open !== "boolean") throw new Error("Invalid door state");
  const angle = open ? door.openAngle : 0,
    rotationY = door.closedRotationY + angle;
  return {
    position: about(door.closedPosition, door.hinge, angle),
    rotationY,
    rotation: {
      x: 0,
      y: Math.sin(rotationY / 2),
      z: 0,
      w: Math.cos(rotationY / 2),
    },
    handle: about(door.closedHandle, door.hinge, angle),
  };
}
/** Affine delta for CLOSED model-space vertex batches: R*p + translation.
 * Apply before the existing building placement; no extra pivot or draw call. */
export function cadDoorModelTransform(
  definition: CadDoorDefinition,
  open: boolean,
) {
  if (typeof open !== "boolean") throw new Error("Invalid door state");
  const rotationY = open ? definition.openAngle : 0,
    h = definition.hingeModel,
    r = rotate(h, rotationY);
  return { rotationY, translation: { x: h.x - r.x, y: 0, z: h.z - r.z } };
}
export function cadDoorModelPoint(
  definition: CadDoorDefinition,
  point: Readonly<Vec3>,
  open: boolean,
): Vec3 {
  if (!finiteVec(point)) throw new Error("Invalid door vertex");
  const t = cadDoorModelTransform(definition, open),
    p = rotate(point, t.rotationY);
  return { x: p.x + t.translation.x, y: p.y, z: p.z + t.translation.z };
}

export function parseCadDoorRequest(raw: unknown): CadDoorRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as CadDoorRequest;
  if (
    !Object.keys(r).every((k) =>
      [
        "worldEpoch",
        "definitionHash",
        "requestId",
        "doorId",
        "expectedRevision",
        "open",
      ].includes(k),
    ) ||
    !idString(r.worldEpoch) ||
    !/^[a-f0-9]{64}$/.test(r.definitionHash) ||
    !idString(r.doorId) ||
    !cadDoorTick(r.requestId) ||
    !cadDoorTick(r.expectedRevision) ||
    typeof r.open !== "boolean"
  )
    return null;
  return {
    worldEpoch: r.worldEpoch,
    definitionHash: r.definitionHash,
    requestId: r.requestId,
    doorId: r.doorId,
    expectedRevision: r.expectedRevision,
    open: r.open,
  };
}

/** Validate complete snapshots; missing IDs are never guessed closed. */
export function validateCadDoorSnapshot(
  snapshot: CadDoorSnapshot,
  definitions: ReadonlyMap<string, CadDoorWorldDefinition>,
  identity: CadDoorIdentity,
) {
  if (
    !snapshot ||
    snapshot.worldEpoch !== identity.worldEpoch ||
    snapshot.definitionHash !== identity.definitionHash ||
    !cadDoorTick(snapshot.tick) ||
    !cadDoorTick(snapshot.revision) ||
    !Array.isArray(snapshot.states) ||
    snapshot.states.length !== definitions.size
  )
    throw new Error("Invalid/incompatible door snapshot");
  const ids = new Set<string>();
  let revisions = 0;
  for (const state of snapshot.states) {
    if (
      !state ||
      !definitions.has(state.id) ||
      ids.has(state.id) ||
      typeof state.open !== "boolean" ||
      !cadDoorTick(state.revision) ||
      !cadDoorTick(state.changedAtTick) ||
      state.changedAtTick > snapshot.tick ||
      state.open !== (state.revision % 2 === 1) ||
      (state.revision === 0 && state.changedAtTick !== 0)
    )
      throw new Error("Invalid/incomplete door snapshot state");
    ids.add(state.id);
    revisions += state.revision;
  }
  if (!Number.isSafeInteger(revisions) || revisions !== snapshot.revision)
    throw new Error("Door snapshot revision totals disagree");
}

export class CadDoorStateStore {
  readonly definitions: ReadonlyMap<string, CadDoorWorldDefinition>;
  readonly identity: CadDoorIdentity;
  private states = new Map<string, CadDoorState>();
  private revisionValue = 0;
  private lastTick = 0;
  private disposed = false;
  private requests = new Map<
    string,
    { lastId: number; signature: string; nowMs: number; times: number[] }
  >();
  constructor(
    definitions: readonly CadDoorWorldDefinition[],
    identity: CadDoorIdentity,
  ) {
    assertCadDoorIdentity(identity);
    this.identity = Object.freeze({ ...identity });
    this.definitions = cadDoorDefinitionsById(definitions);
    for (const id of this.definitions.keys())
      this.states.set(
        id,
        Object.freeze({ id, open: false, revision: 0, changedAtTick: 0 }),
      );
  }
  get revision() {
    return this.revisionValue;
  }
  get sessionCount() {
    return this.requests.size;
  }
  get(id: string): CadDoorState | undefined {
    return this.states.get(id);
  }
  snapshot(tick: number = this.lastTick): CadDoorSnapshot {
    if (this.disposed || !cadDoorTick(tick) || tick < this.lastTick)
      throw new Error("Invalid door snapshot tick/lifecycle");
    return {
      ...this.identity,
      revision: this.revisionValue,
      tick,
      states: [...this.states.values()].map((s) => ({ ...s })),
    };
  }
  forgetActor(id: string) {
    this.requests.delete(id);
  }
  request(raw: unknown, context: CadDoorRequestContext): CadDoorRequestResult {
    const reject = (
      reason: CadDoorRequestReason,
      r?: CadDoorRequest,
      state?: CadDoorState,
    ): CadDoorRequestResult => ({
      status: "rejected",
      reason,
      requestId: r?.requestId,
      state,
    });
    if (this.disposed) return reject("disposed");
    const { actor, tick, nowMs } = context;
    if (
      !actor ||
      !idString(actor.id) ||
      !finiteVec(actor.position) ||
      !finiteVec(actor.eye) ||
      typeof actor.vehicle !== "boolean" ||
      !cadDoorTick(tick) ||
      tick < this.lastTick ||
      !Number.isFinite(nowMs)
    )
      return reject("invalid");
    const r = parseCadDoorRequest(raw),
      window = this.requests.get(actor.id) ?? {
        lastId: -1,
        signature: "",
        nowMs,
        times: [],
      };
    if (nowMs < window.nowMs) return reject("invalid", r ?? undefined);
    window.nowMs = nowMs;
    window.times = window.times.filter((t) => t > nowMs - 1000);
    this.requests.set(actor.id, window);
    const signature = r ? JSON.stringify(r) : "";
    if (r && r.requestId === window.lastId) {
      return signature === window.signature
        ? {
            status: "duplicate",
            requestId: r.requestId,
            state: this.get(r.doorId),
          }
        : reject("stale-request", r);
    }
    if (r && r.requestId < window.lastId) return reject("stale-request", r);
    if (window.times.length >= CAD_DOOR_REQUESTS_PER_SECOND)
      return reject("rate-limit", r ?? undefined);
    window.times.push(nowMs);
    if (!r) return reject("invalid");
    window.lastId = r.requestId;
    window.signature = signature;
    if (
      r.worldEpoch !== this.identity.worldEpoch ||
      r.definitionHash !== this.identity.definitionHash
    )
      return reject("wrong-world", r);
    const definition = this.definitions.get(r.doorId),
      state = this.states.get(r.doorId);
    if (!definition || !state) return reject("unknown-door", r);
    if (r.expectedRevision !== state.revision)
      return reject("stale-revision", r, state);
    if (actor.vehicle) return reject("vehicle", r, state);
    const handle = cadDoorPose(definition, state.open).handle;
    if (
      Math.hypot(
        actor.position.x - handle.x,
        actor.position.y - handle.y,
        actor.position.z - handle.z,
      ) > CAD_DOOR_INTERACTION_RANGE
    )
      return reject("out-of-range", r, state);
    if (!context.canSee(definition, state, actor.eye))
      return reject("occluded", r, state);
    if (r.open === state.open)
      return { status: "unchanged", requestId: r.requestId, state };
    if (!context.canChange(definition, state.open, r.open))
      return reject("occupied", r, state);
    const next = Object.freeze({
      id: state.id,
      open: r.open,
      revision: state.revision + 1,
      changedAtTick: tick,
    });
    if (!cadDoorTick(next.revision) || !cadDoorTick(this.revisionValue + 1))
      return reject("invalid", r, state);
    context.apply(next.id, next.open);
    this.states.set(next.id, next);
    this.revisionValue++;
    this.lastTick = tick;
    const delta: CadDoorDelta = {
      ...this.identity,
      revision: this.revisionValue,
      tick,
      door: next,
    };
    return { status: "changed", requestId: r.requestId, state: next, delta };
  }
  dispose() {
    this.disposed = true;
    this.requests.clear();
    this.states.clear();
  }
}
