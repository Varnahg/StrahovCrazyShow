/** Instant doors need no query-tree rebuild: both rigid poses are registered
 * once, and only collision/sensor/query masks change. Never disable/remove the
 * inactive pose during normal operation; doing so invalidates immediate rewind. */
import RAPIER from "@dimforge/rapier3d-compat";
import {
  cadDoorDefinitionsById,
  cadDoorPose,
  type CadDoorState,
  type CadDoorWorldDefinition,
} from "./cad-doors";
import type { Vec3 } from "./types";

export const CAD_DOOR_QUERY_GROUPS = 0xffffffff;
export type CadDoorCapsuleProbe = Readonly<{
  id: string;
  current: Readonly<Vec3>;
  next: Readonly<Vec3>;
  radius: number;
  halfHeight: number;
  skin?: number;
}>;
export type CadDoorObstacleProbe = Readonly<{
  id: string;
  /** Explicit known vehicle/traffic collider, including a parked (Fixed) car. */
  collider: RAPIER.Collider;
  /** Predicted WORLD COLLIDER pose, including its body-local offset. */
  next: Readonly<{
    position: Readonly<Vec3>;
    rotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  }>;
  skin?: number;
}>;
export type CadDoorChangeGuard = {
  allowed: boolean;
  blockedBy: string[];
  reason?: "occupied" | "invalid-capsule" | "invalid-obstacle";
};
type Entry = {
  definition: CadDoorWorldDefinition;
  colliders: readonly [RAPIER.Collider, RAPIER.Collider];
  open: boolean;
};
const finiteVec = (p: Readonly<Vec3>) =>
  p && [p.x, p.y, p.z].every(Number.isFinite);
const finiteNativeVec = (p: Readonly<Vec3>) =>
  finiteVec(p) && [p.x, p.y, p.z].every((v) => Number.isFinite(Math.fround(v)));
const pointSegmentDistance = (
  p: readonly number[],
  a: readonly number[],
  b: readonly number[],
) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = dx * dx + dz * dz;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length),
      )
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
function segmentRectDistance(
  a: readonly number[],
  b: readonly number[],
  hx: number,
  hz: number,
) {
  // Liang-Barsky tests the full trajectory, not only its endpoints.
  let low = 0,
    high = 1;
  for (const [p, q] of [
    [a[0], b[0]],
    [a[1], b[1]],
  ].entries()) {
    const h = p === 0 ? hx : hz,
      d = q[1] - q[0];
    if (Math.abs(d) < 1e-12) {
      if (q[0] < -h || q[0] > h) {
        low = 1;
        high = 0;
        break;
      }
    } else {
      const t0 = (-h - q[0]) / d,
        t1 = (h - q[0]) / d;
      low = Math.max(low, Math.min(t0, t1));
      high = Math.min(high, Math.max(t0, t1));
    }
  }
  if (low <= high) return 0;
  const outside = (p: readonly number[]) =>
    Math.hypot(
      Math.max(0, Math.abs(p[0]) - hx),
      Math.max(0, Math.abs(p[1]) - hz),
    );
  let distance = Math.min(outside(a), outside(b));
  for (const corner of [
    [-hx, -hz],
    [-hx, hz],
    [hx, -hz],
    [hx, hz],
  ])
    distance = Math.min(distance, pointSegmentDistance(corner, a, b));
  return distance;
}

function doorSweep(
  door: CadDoorWorldDefinition,
  fromOpen: boolean,
  toOpen: boolean,
) {
  const start = fromOpen ? door.openAngle : 0,
    end = toOpen ? door.openAngle : 0;
  const radius =
    Math.hypot(
      door.closedPosition.x - door.hinge.x,
      door.closedPosition.z - door.hinge.z,
    ) + Math.hypot(door.halfExtents.x, door.halfExtents.z);
  const segments = Math.min(
    512,
    Math.max(1, Math.ceil((Math.abs(end - start) * radius) / 0.02)),
  );
  return {
    start,
    end,
    radius,
    segments,
    pad: 2 * radius * Math.sin(Math.abs(end - start) / segments / 4),
  };
}
function doorPoseAt(door: CadDoorWorldDefinition, angle: number) {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    dx = door.closedPosition.x - door.hinge.x,
    dz = door.closedPosition.z - door.hinge.z;
  const yaw = door.closedRotationY + angle;
  return {
    position: {
      x: door.hinge.x + c * dx + s * dz,
      y: door.closedPosition.y,
      z: door.hinge.z - s * dx + c * dz,
    },
    rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
  };
}
type Rotation = { x: number; y: number; z: number; w: number };
function normalizedRotation(raw: Readonly<Rotation>): Rotation {
  if (!raw || ![raw.x, raw.y, raw.z, raw.w].every(Number.isFinite))
    throw new Error("Invalid obstacle rotation");
  const length = Math.hypot(raw.x, raw.y, raw.z, raw.w);
  if (!Number.isFinite(length) || Math.abs(length - 1) > 0.001)
    throw new Error("Obstacle rotation must be a unit quaternion");
  return {
    x: raw.x / length,
    y: raw.y / length,
    z: raw.z / length,
    w: raw.w / length,
  };
}
function rotationPath(a: Rotation, b: Rotation) {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) {
    b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    dot = -dot;
  }
  const halfAngle = Math.acos(Math.min(1, Math.max(0, dot)));
  return {
    angle: halfAngle * 2,
    at: (t: number): Rotation => {
      if (halfAngle < 1e-8) return a;
      const scale = Math.sin(halfAngle),
        u = Math.sin((1 - t) * halfAngle) / scale,
        v = Math.sin(t * halfAngle) / scale;
      return {
        x: u * a.x + v * b.x,
        y: u * a.y + v * b.y,
        z: u * a.z + v * b.z,
        w: u * a.w + v * b.w,
      };
    },
  };
}
function rotateVector(q: Rotation, p: Readonly<Vec3>): Vec3 {
  const tx = 2 * (q.y * p.z - q.z * p.y),
    ty = 2 * (q.z * p.x - q.x * p.z),
    tz = 2 * (q.x * p.y - q.y * p.x);
  return {
    x: p.x + q.w * tx + q.y * tz - q.z * ty,
    y: p.y + q.w * ty + q.z * tx - q.x * tz,
    z: p.z + q.w * tz + q.x * ty - q.y * tx,
  };
}

/** Event-only exact Cuboid contacts with conservative displacement padding.
 * The Cartesian product covers every door angle against every obstacle motion
 * phase, not merely matching endpoints. It never mutates/registers colliders. */
export function cadDoorSweepIntersectsObstacle(
  door: CadDoorWorldDefinition,
  fromOpen: boolean,
  toOpen: boolean,
  obstacle: CadDoorObstacleProbe,
): boolean {
  if (
    !obstacle ||
    typeof obstacle.id !== "string" ||
    !obstacle.id ||
    !obstacle.collider?.isValid()
  )
    throw new Error("Invalid obstacle collider");
  const collider = obstacle.collider;
  if (
    !collider.isEnabled() ||
    collider.isSensor() ||
    collider.parent()?.isEnabled() === false
  )
    return false;
  const shape = collider.shape;
  if (shape.type !== RAPIER.ShapeType.Cuboid)
    throw new Error("Known door obstacle must use its actual Cuboid collider");
  const halfExtents = (shape as RAPIER.Cuboid).halfExtents,
    current = collider.translation(),
    next = obstacle.next?.position,
    skin = obstacle.skin ?? 0.02;
  if (
    !finiteNativeVec(halfExtents) ||
    ![halfExtents.x, halfExtents.y, halfExtents.z].every(
      (v) => Math.fround(v) > 0,
    ) ||
    !finiteNativeVec(current) ||
    !finiteNativeVec(next) ||
    !Number.isFinite(Math.fround(skin)) ||
    skin < 0
  )
    throw new Error("Invalid obstacle pose/dimensions/skin");
  const currentRotation = normalizedRotation(collider.rotation()),
    nextRotation = normalizedRotation(obstacle.next.rotation);
  const pivot = collider.parent()?.translation() ?? current;
  if (!finiteNativeVec(pivot))
    throw new Error("Invalid obstacle rotation pivot");
  // The chassis collider is offset .945m from its body origin. Interpolating
  // its centre on a straight chord would miss a rolling/pitching body's arc.
  const offset = rotateVector(
    {
      x: -currentRotation.x,
      y: -currentRotation.y,
      z: -currentRotation.z,
      w: currentRotation.w,
    },
    { x: current.x - pivot.x, y: current.y - pivot.y, z: current.z - pivot.z },
  );
  const nextOffset = rotateVector(nextRotation, offset),
    nextPivot = {
      x: next.x - nextOffset.x,
      y: next.y - nextOffset.y,
      z: next.z - nextOffset.z,
    };
  const radius =
      Math.hypot(halfExtents.x, halfExtents.y, halfExtents.z) +
      Math.hypot(offset.x, offset.y, offset.z),
    distance = Math.hypot(
      nextPivot.x - pivot.x,
      nextPivot.y - pivot.y,
      nextPivot.z - pivot.z,
    );
  if (!Number.isFinite(radius) || !Number.isFinite(distance))
    throw new Error("Invalid obstacle displacement");
  const rotations = rotationPath(currentRotation, nextRotation);
  const sweep = doorSweep(door, fromOpen, toOpen);
  // Rotationally invariant bounds make the common far-car/traffic rejection cheap.
  if (
    Math.min(pivot.y, nextPivot.y) - radius - skin >
      door.closedPosition.y + door.halfExtents.y ||
    Math.max(pivot.y, nextPivot.y) + radius + skin <
      door.closedPosition.y - door.halfExtents.y ||
    pointSegmentDistance(
      [door.hinge.x, door.hinge.z],
      [pivot.x, pivot.z],
      [nextPivot.x, nextPivot.z],
    ) >
      sweep.radius + radius + skin
  )
    return false;
  const segments =
    distance === 0 && rotations.angle === 0
      ? 0
      : Math.min(
          128,
          Math.max(1, Math.ceil((distance + radius * rotations.angle) / 0.08)),
        );
  // Nearest sample is at most half a segment away in translation and rotation.
  const obstaclePad =
    segments === 0
      ? 0
      : distance / (2 * segments) +
        2 * radius * Math.sin(rotations.angle / (4 * segments));
  const prediction = sweep.pad + obstaclePad + skin;
  if (!Number.isFinite(Math.fround(prediction)))
    throw new Error("Invalid native contact padding");
  const samples = Array.from({ length: segments + 1 }, (_, i) => {
    const t = segments ? i / segments : 0,
      rotation = rotations.at(t),
      rotatedOffset = rotateVector(rotation, offset);
    return {
      position: {
        x: pivot.x + (nextPivot.x - pivot.x) * t + rotatedOffset.x,
        y: pivot.y + (nextPivot.y - pivot.y) * t + rotatedOffset.y,
        z: pivot.z + (nextPivot.z - pivot.z) * t + rotatedOffset.z,
      },
      rotation,
    };
  });
  if (samples.some((sample) => !finiteNativeVec(sample.position)))
    throw new Error("Invalid obstacle trajectory");
  const leaf = new RAPIER.Cuboid(
    door.halfExtents.x,
    door.halfExtents.y,
    door.halfExtents.z,
  );
  for (let i = 0; i <= sweep.segments; i++) {
    const pose = doorPoseAt(
      door,
      sweep.start + ((sweep.end - sweep.start) * i) / sweep.segments,
    );
    for (const sample of samples)
      if (
        leaf.contactShape(
          pose.position,
          pose.rotation,
          shape,
          sample.position,
          sample.rotation,
          prediction,
        )
      )
        return true;
  }
  return false;
}

/** Conservative continuous angular sweep vs current→next player capsule.
 * Sampled OBBs are expanded by a proven nearest-angle displacement bound, so
 * a thin leaf/player between angular samples cannot be missed. */
export function cadDoorSweepIntersectsCapsule(
  door: CadDoorWorldDefinition,
  fromOpen: boolean,
  toOpen: boolean,
  capsule: CadDoorCapsuleProbe,
): boolean {
  const skin = capsule.skin ?? 0.02;
  if (
    !finiteVec(capsule.current) ||
    !finiteVec(capsule.next) ||
    ![capsule.radius, capsule.halfHeight, skin].every(Number.isFinite) ||
    capsule.radius <= 0 ||
    capsule.halfHeight < 0 ||
    skin < 0
  )
    throw new Error("Invalid player capsule for door guard");
  const bottom = door.closedPosition.y - door.halfExtents.y,
    top = door.closedPosition.y + door.halfExtents.y;
  const extent = capsule.halfHeight + capsule.radius + skin;
  if (
    Math.min(capsule.current.y, capsule.next.y) - extent > top ||
    Math.max(capsule.current.y, capsule.next.y) + extent < bottom
  )
    return false;
  const {
    start,
    end,
    segments,
    pad,
    radius: sweepRadius,
  } = doorSweep(door, fromOpen, toOpen);
  if (
    pointSegmentDistance(
      [door.hinge.x, door.hinge.z],
      [capsule.current.x, capsule.current.z],
      [capsule.next.x, capsule.next.z],
    ) >
    sweepRadius + capsule.radius + skin
  )
    return false;
  const radius = capsule.radius + skin + pad;
  for (let i = 0; i <= segments; i++) {
    const angle = start + ((end - start) * i) / segments,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const dx = door.closedPosition.x - door.hinge.x,
      dz = door.closedPosition.z - door.hinge.z;
    const center = {
      x: door.hinge.x + c * dx + s * dz,
      z: door.hinge.z - s * dx + c * dz,
    };
    const yaw = door.closedRotationY + angle,
      cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    const local = (p: Readonly<Vec3>) => {
      const x = p.x - center.x,
        z = p.z - center.z;
      return [cy * x - sy * z, sy * x + cy * z];
    };
    if (
      segmentRectDistance(
        local(capsule.current),
        local(capsule.next),
        door.halfExtents.x,
        door.halfExtents.z,
      ) <= radius
    )
      return true;
  }
  return false;
}

export class CadDoorPhysics {
  readonly definitions: ReadonlyMap<string, CadDoorWorldDefinition>;
  private entries = new Map<string, Entry>();
  private owned = new Map<number, { entry: Entry; open: boolean }>();
  private disposed = false;
  constructor(
    readonly world: RAPIER.World,
    definitions: readonly CadDoorWorldDefinition[],
    readonly options: { ignoredColliders: Set<number> },
  ) {
    if (!(options?.ignoredColliders instanceof Set))
      throw new Error("Pass the Simulation's shared walkingColliders Set");
    this.definitions = cadDoorDefinitionsById(definitions);
    const created: RAPIER.Collider[] = [];
    try {
      for (const definition of this.definitions.values()) {
        const colliders = [false, true].map((open) => {
          const pose = cadDoorPose(definition, open),
            h = definition.halfExtents;
          const collider = world.createCollider(
            RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z)
              .setTranslation(pose.position.x, pose.position.y, pose.position.z)
              .setRotation(pose.rotation)
              .setSensor(open)
              .setCollisionGroups(open ? 0 : CAD_DOOR_QUERY_GROUPS),
          );
          created.push(collider);
          if (open) options.ignoredColliders.add(collider.handle);
          return collider;
        }) as [RAPIER.Collider, RAPIER.Collider];
        const entry = { definition, colliders, open: false };
        this.entries.set(definition.id, entry);
        this.owned.set(colliders[0].handle, { entry, open: false });
        this.owned.set(colliders[1].handle, { entry, open: true });
      }
    } catch (error) {
      for (const collider of created) {
        options.ignoredColliders.delete(collider.handle);
        world.removeCollider(collider, true);
      }
      this.entries.clear();
      this.owned.clear();
      this.disposed = true;
      throw error;
    }
  }
  get size() {
    return this.entries.size;
  }
  isOpen(id: string) {
    return this.entry(id).open;
  }
  activeCollider(id: string) {
    const entry = this.entry(id);
    return entry.colliders[entry.open ? 1 : 0];
  }
  collidersFor(id: string) {
    return this.entry(id).colliders;
  }
  isActiveCollider(collider: RAPIER.Collider) {
    const owned = this.owned.get(collider.handle);
    return !owned || owned.entry.open === owned.open;
  }
  private entry(id: string) {
    if (this.disposed) throw new Error("Door physics is disposed");
    const entry = this.entries.get(id);
    if (!entry) throw new Error("Unknown door " + id);
    return entry;
  }
  apply(id: string, open: boolean) {
    if (typeof open !== "boolean") throw new Error("Invalid door state");
    const entry = this.entry(id);
    if (entry.open === open) return false;
    const inactive = entry.colliders[open ? 0 : 1],
      active = entry.colliders[open ? 1 : 0];
    inactive.setCollisionGroups(0);
    inactive.setSensor(true);
    this.options.ignoredColliders.add(inactive.handle);
    active.setCollisionGroups(CAD_DOOR_QUERY_GROUPS);
    active.setSensor(false);
    this.options.ignoredColliders.delete(active.handle);
    entry.open = open;
    return true;
  }
  /** Full state restoration is validated atomically; missing IDs are errors. */
  applyStates(states: readonly Pick<CadDoorState, "id" | "open">[]) {
    if (this.disposed || states.length !== this.entries.size)
      throw new Error("Incomplete door physics snapshot");
    const ids = new Set<string>();
    for (const state of states) {
      if (ids.has(state.id) || typeof state.open !== "boolean")
        throw new Error("Invalid door physics snapshot");
      this.entry(state.id);
      ids.add(state.id);
    }
    for (const state of states) this.apply(state.id, state.open);
  }
  lineOfSight(
    eye: Readonly<Vec3>,
    id: string,
    open = this.isOpen(id),
    actorCollider?: RAPIER.Collider,
  ) {
    const entry = this.entry(id),
      target = cadDoorPose(entry.definition, open).handle;
    if (!finiteVec(eye)) return false;
    const dx = target.x - eye.x,
      dy = target.y - eye.y,
      dz = target.z - eye.z,
      length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return true;
    const [closed, opened] = entry.colliders;
    const hit = this.world.castRay(
      new RAPIER.Ray(eye, { x: dx / length, y: dy / length, z: dz / length }),
      length,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      CAD_DOOR_QUERY_GROUPS,
      actorCollider,
      actorCollider?.parent() ?? undefined,
      (c) =>
        c.handle !== closed.handle &&
        c.handle !== opened.handle &&
        !this.options.ignoredColliders.has(c.handle) &&
        this.isActiveCollider(c),
    );
    return !hit || hit.timeOfImpact >= length - 0.01;
  }
  guardChange(
    id: string,
    open: boolean,
    capsules: readonly CadDoorCapsuleProbe[],
    obstacles: readonly CadDoorObstacleProbe[] = [],
  ): CadDoorChangeGuard {
    const entry = this.entry(id);
    if (typeof open !== "boolean")
      return { allowed: false, blockedBy: [], reason: "invalid-capsule" };
    if (open === entry.open) return { allowed: true, blockedBy: [] };
    const blockedBy: string[] = [];
    for (const capsule of capsules) {
      try {
        if (
          cadDoorSweepIntersectsCapsule(
            entry.definition,
            entry.open,
            open,
            capsule,
          )
        )
          blockedBy.push(capsule.id);
      } catch {
        return {
          allowed: false,
          blockedBy: [capsule?.id ?? "invalid"],
          reason: "invalid-capsule",
        };
      }
    }
    for (const obstacle of obstacles) {
      try {
        if (
          cadDoorSweepIntersectsObstacle(
            entry.definition,
            entry.open,
            open,
            obstacle,
          )
        )
          blockedBy.push(obstacle.id);
      } catch {
        return {
          allowed: false,
          blockedBy: [obstacle?.id ?? "invalid"],
          reason: "invalid-obstacle",
        };
      }
    }
    return blockedBy.length
      ? { allowed: false, blockedBy, reason: "occupied" }
      : { allowed: true, blockedBy };
  }
  /** Call before world.free(). The shared ignore set's actor handles survive. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const handle of this.owned.keys()) {
      this.options.ignoredColliders.delete(handle);
      const collider = this.world.getCollider(handle);
      if (collider) this.world.removeCollider(collider, true);
    }
    this.entries.clear();
    this.owned.clear();
  }
}
