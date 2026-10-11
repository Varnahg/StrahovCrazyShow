import { groundHeight } from "./terrain";

type Point = readonly [number, number];
export const STADIUM_ACCESS_POLICY = Object.freeze({
  mode: "exterior-only" as const,
  interiorPubliclyAccessible: false,
  provenance:
    "game closure requested 2026-10-11; not a surveyed permanent facade" as const,
  exteriorSetback: 5,
  fieldClearance: 0.8,
  minimumBarrierHeight: 3.2,
  maximumPanelLength: 10,
});

export function stadiumClosureBoundary(
  outline: readonly Point[],
  inner: readonly Point[],
  center: { x: number; z: number },
) {
  // A uniform scale can cut across an OSM recess. Include every source corner
  // direction and constrain each radius between the actual outer and inner
  // intersections, so closure surfaces cannot become a cap over a field bay.
  const angles = [...outline, ...inner].map(([x, z]) =>
    Math.atan2(z - center.z, x - center.x),
  );
  for (let i = 0; i < 120; i++) angles.push(-Math.PI + (i * Math.PI * 2) / 120);
  return [...new Set(angles.map((a) => Math.round(a * 1e12) / 1e12))]
    .sort((a, b) => a - b)
    .map((angle) => {
      const outerRadius = ringBoundaryDistance(
          outline,
          center.x,
          center.z,
          angle,
        ),
        innerRadius = ringBoundaryDistance(inner, center.x, center.z, angle);
      if (
        !Number.isFinite(outerRadius) ||
        !Number.isFinite(innerRadius) ||
        outerRadius - innerRadius < 2
      )
        throw new Error("Invalid stadium source annulus for exterior closure");
      const radius = Math.min(
        outerRadius - 0.5,
        Math.max(
          innerRadius + STADIUM_ACCESS_POLICY.fieldClearance,
          outerRadius - STADIUM_ACCESS_POLICY.exteriorSetback,
        ),
      );
      return [
        center.x + Math.cos(angle) * radius,
        center.z + Math.sin(angle) * radius,
      ] as [number, number];
    });
}

export function ringBoundaryDistance(
  points: readonly Point[],
  cx: number,
  cz: number,
  angle: number,
) {
  const dx = Math.cos(angle),
    dz = Math.sin(angle);
  let result = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      ex = b[0] - a[0],
      ez = b[1] - a[1],
      den = dx * ez - dz * ex;
    if (Math.hypot(ex, ez) < 0.08 || Math.abs(den) < 1e-9) continue;
    const ax = a[0] - cx,
      az = a[1] - cz,
      t = (ax * ez - az * ex) / den,
      u = (ax * dz - az * dx) / den;
    if (t > 0 && u >= -1e-7 && u <= 1 + 1e-7) result = Math.min(result, t);
  }
  return result;
}

export function pointInsideStadiumBoundary(
  position: { x: number; z: number },
  points: readonly Point[],
) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > position.z !== b[1] > position.z &&
      position.x < ((b[0] - a[0]) * (position.z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

/** Continuous visible closure behind the source exterior piers. Sampling the
 * same DEM as the world prevents a gap under panels on the sloping perimeter.
 * These are deliberately simple game panels, not invented rooms or doors. */
export function stadiumClosurePanels(
  outline: readonly Point[],
  inner: readonly Point[],
  center: { x: number; z: number },
  offset = 0,
  eastConcourseTop = -Infinity,
) {
  const points = stadiumClosureBoundary(outline, inner, center);
  const panels = [];
  for (let edge = 0; edge < points.length; edge++) {
    const a = points[edge],
      b = points[(edge + 1) % points.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const count = Math.ceil(length / STADIUM_ACCESS_POLICY.maximumPanelLength);
    for (let i = 0; i < count; i++) {
      const at = (t: number) =>
        [a[0] + (dx * (i + t)) / count, a[1] + (dz * (i + t)) / count] as const;
      const samples = Array.from({ length: 11 }, (_, j) => {
        const [x, z] = at(j / 10);
        return groundHeight(x, z) + offset;
      });
      const [x, z] = at(0.5),
        bottom = Math.min(...samples) - 0.3;
      // The outside stair reaches the east concourse. Its rear closure must
      // reach the soffit too, otherwise a walker could simply go over a gate.
      const closesConcourse = x > -170 && z > -52 && z < 82;
      const top = Math.max(
        Math.max(...samples) + STADIUM_ACCESS_POLICY.minimumBarrierHeight,
        closesConcourse ? eastConcourseTop : -Infinity,
      );
      panels.push({
        edge,
        x,
        y: (bottom + top) / 2,
        z,
        w: length / count + 0.22,
        h: top - bottom,
        yaw: Math.atan2(-dz, dx),
        bottom,
        top,
        closesConcourse,
      });
    }
  }
  return { points, panels, policy: STADIUM_ACCESS_POLICY };
}
