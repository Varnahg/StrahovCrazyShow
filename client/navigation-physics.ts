import RAPIER from "@dimforge/rapier3d-compat";
import type { Simulation } from "../shared/simulation";
import type { MapPoint } from "./minimap-math";

/** Planner clearance, not another physics world. The reduced torso capsule
 * allows the same low stair risers as walking; the final route still stops at
 * the exterior approach. Dynamic actors/traffic are not permanent barriers. */
type NavigationPhysics = Pick<
  Simulation,
  "world" | "surfaceHeight" | "walkingColliders" | "groundColliders" | "car"
>;
export type NavigationClearance = ((a: MapPoint, b: MapPoint) => boolean) & {
  /** Small bounded work units used by the browser's cooperative planner. */
  steps?: (a: MapPoint, b: MapPoint) => Generator<void, boolean>;
};
export const NAVIGATION_CLEARANCE = {
  radius: 0.43,
  contactMargin: 0.01,
  halfHeight: 0.32,
  centreHeight: 0.98,
  maximumSweepLength: 1.5,
  terrainSampleSpacing: 0.15,
  maximumStepUp: 0.22,
  maximumStepDown: 0.25,
  maximumGrade: 0.62,
} as const;
export function createNavigationClearance(sim: NavigationPhysics) {
  // 43cm plus a 1cm query margin matches the production radius42cm + KCC
  // offset2cm. The raised lower hemisphere remains a conservative torso query,
  // not a substitute for the actual autostep controller.
  const shape = new RAPIER.Capsule(
    NAVIGATION_CLEARANCE.halfHeight,
    NAVIGATION_CLEARANCE.radius,
  );
  const rotation = { x: 0, y: 0, z: 0, w: 1 };
  const position = { x: 0, y: 0, z: 0 },
    velocity = { x: 0, y: 0, z: 0 };
  const accept = (collider: RAPIER.Collider) =>
    !sim.walkingColliders.has(collider.handle) &&
    !sim.groundColliders.has(collider.handle) &&
    collider.parent()?.handle !== sim.car.body.handle;
  function* steps(a: MapPoint, b: MapPoint): Generator<void, boolean> {
    if (![a.x, a.z, b.x, b.z].every(Number.isFinite)) return false;
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const sweepCount = Math.max(
      1,
      Math.ceil(distance / NAVIGATION_CLEARANCE.maximumSweepLength),
    );
    let x = a.x,
      z = a.z,
      y = sim.surfaceHeight(x, z);
    if (!Number.isFinite(y)) return false;
    for (let i = 1; i <= sweepCount; i++) {
      const nx = a.x + ((b.x - a.x) * i) / sweepCount,
        nz = a.z + ((b.z - a.z) * i) / sweepCount;
      const ny = sim.surfaceHeight(nx, nz),
        length = Math.hypot(nx - x, nz - z);
      if (
        !Number.isFinite(ny) ||
        Math.abs(ny - y) >
          Math.max(
            NAVIGATION_CLEARANCE.maximumStepUp,
            length * NAVIGATION_CLEARANCE.maximumGrade,
          )
      )
        return false;
      // Coarse endpoint interpolation can turn an unwalkable 35cm terrain
      // ledge into an imaginary 1.5m ramp. Sample the actual supporting heights
      // before the broad sweep, without creating another character/world.
      const samples = Math.max(
        1,
        Math.ceil(length / NAVIGATION_CLEARANCE.terrainSampleSpacing),
      );
      let previousHeight = y;
      for (let sample = 1; sample <= samples; sample++) {
        const height =
          sample === samples
            ? ny
            : sim.surfaceHeight(
                x + ((nx - x) * sample) / samples,
                z + ((nz - z) * sample) / samples,
              );
        if (
          !Number.isFinite(height) ||
          height - previousHeight > NAVIGATION_CLEARANCE.maximumStepUp + 1e-5 ||
          previousHeight - height > NAVIGATION_CLEARANCE.maximumStepDown + 1e-5
        )
          return false;
        previousHeight = height;
      }
      position.x = x;
      position.y = y + NAVIGATION_CLEARANCE.centreHeight;
      position.z = z;
      velocity.x = nx - x;
      velocity.y = ny - y;
      velocity.z = nz - z;
      const hit = sim.world.castShape(
        position,
        rotation,
        velocity,
        shape,
        NAVIGATION_CLEARANCE.contactMargin,
        1,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC |
          RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
        undefined,
        undefined,
        undefined,
        accept,
      );
      if (hit && hit.time_of_impact < 0.999) return false;
      x = nx;
      y = ny;
      z = nz;
      yield;
    }
    return true;
  }
  const clear: NavigationClearance = (a, b) => {
    const iterator = steps(a, b);
    let result = iterator.next();
    while (!result.done) result = iterator.next();
    return result.value;
  };
  clear.steps = steps;
  return clear;
}
