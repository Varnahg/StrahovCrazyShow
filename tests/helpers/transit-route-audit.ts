import RAPIER from "@dimforge/rapier3d-compat";
import assert from "node:assert/strict";
import { MAP, TREES, CAR_SPAWN } from "../../shared/world";
import { PARKING_SLOTS, groundHeight } from "../../shared/terrain";
import { STREET_COLLISIONS } from "../../shared/streets";
import { B6_LAYOUT, b6EntranceHeight } from "../../shared/b6-interior";
import { B6_PROP_COLLISIONS } from "../../shared/b6-props";
import {
  COMMON_DORM_ENTRANCES,
  commonEntranceHeight,
} from "../../shared/landmark-reality";
import { groundRotation } from "../../shared/terrain-entities";
import {
  initPhysics,
  Simulation,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
} from "../../shared/simulation";
import { sampleWalkingPath } from "../../shared/transit";
import type { Vec3 } from "../../shared/types";

export type NavigationAuditInput = {
  schemaVersion?: number;
  destinations: { buildingId: string; name: string; threshold: number[] }[];
  journeys: {
    stopId: string;
    buildingId: string;
    points: number[][];
    length: number;
    sourceWayIds?: string[];
    startConnector?: number;
    endConnector?: number;
  }[];
};
export function inSourceBuilding(p: Vec3) {
  return MAP.buildings.find((b) => {
    let inside = false;
    for (let i = 0, j = b.points.length - 1; i < b.points.length; j = i++) {
      const a = b.points[i],
        c = b.points[j];
      if (
        a[1] > p.z !== c[1] > p.z &&
        p.x < ((c[0] - a[0]) * (p.z - a[1])) / (c[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  });
}

/** Mirrors the actual production solids, including the rotated 24 parked cars.
 * Floors/stairs are omitted here because intentional support is validated with
 * the full production KCC separately. No removed fictional benches/lamps.
 */
export async function createFixedCampusPropProbe() {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }),
    names = new Map<number, string>();
  const box = (
    id: string,
    p: {
      x: number;
      y: number;
      z: number;
      w: number;
      h: number;
      d: number;
      yaw?: number;
    },
  ) => {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(p.w / 2, p.h / 2, p.d / 2)
        .setTranslation(p.x, p.y, p.z)
        .setRotation({
          x: 0,
          y: Math.sin((p.yaw ?? 0) / 2),
          z: 0,
          w: Math.cos((p.yaw ?? 0) / 2),
        }),
    );
    names.set(collider.handle, id);
  };
  for (const p of TREES) {
    const diameter = (0.36 * p.size) / 5.8;
    box(`tree:${p.osmId}`, {
      x: p.x,
      y: groundHeight(p.x, p.z) + p.size * 0.25,
      z: p.z,
      w: diameter,
      h: p.size * 0.5,
      d: diameter,
    });
  }
  for (const p of STREET_COLLISIONS) box(p.id, p);
  for (const [i, p] of B6_PROP_COLLISIONS.entries())
    box(`b6-prop:${i}`, { ...p, y: p.y + B6_LAYOUT.foundationOffset });
  for (const slot of [
    ...PARKING_SLOTS,
    { id: "interactive-car-initial", ...CAR_SPAWN },
  ]) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(slot.x, groundHeight(slot.x, slot.z) - 0.0112, slot.z)
        .setRotation(groundRotation(slot.x, slot.z, slot.yaw)),
    );
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.02, 0.615, 1.78).setTranslation(0, 0.945, 0),
      body,
    );
    names.set(c.handle, `parked-car:${slot.id}`);
  }
  world.step();
  return {
    count: names.size,
    obstruction(p: Vec3) {
      const hit = world.intersectionWithShape(
        {
          x: p.x,
          y: p.y + CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS + 0.02,
          z: p.z,
        },
        { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
      );
      return hit ? names.get(hit.handle) : undefined;
    },
    dispose: () => world.free(),
  };
}

export function northEntries() {
  return [
    ...COMMON_DORM_ENTRANCES.map((e) => ({ ...e })),
    {
      block: 6,
      buildingId: "53929071",
      x: B6_LAYOUT.entry.x,
      z: B6_LAYOUT.entry.z,
      nx: B6_LAYOUT.entry.outward.x,
      nz: B6_LAYOUT.entry.outward.z,
      baseY: 0,
      rise: B6_LAYOUT.entranceRise,
      steps: B6_LAYOUT.entry.stepCount,
    },
  ];
}

export async function auditNorthPassengerNavigation(nav: NavigationAuditInput) {
  const probe = await createFixedCampusPropProbe(),
    issues: unknown[] = [],
    routes: unknown[] = [];
  let samples = 0;
  try {
    for (const journey of nav.journeys) {
      const points = journey.points as [number, number][],
        destination = nav.destinations.find(
          (d) => d.buildingId === journey.buildingId,
        )!,
        entry = northEntries().find((e) => e.buildingId === journey.buildingId);
      if (!entry) {
        issues.push({
          stop: journey.stopId,
          buildingId: journey.buildingId,
          kind: "unmatched-entry",
        });
        continue;
      }
      const last = points.at(-1)!,
        before = points.at(-2)!,
        dx = last[0] - before[0],
        dz = last[1] - before[1],
        length = Math.hypot(dx, dz);
      const normalAlignment = -(dx * entry.nx + dz * entry.nz) / length;
      if (normalAlignment < 0.99999)
        issues.push({
          stop: journey.stopId,
          buildingId: journey.buildingId,
          kind: "non-normal-final-approach",
          normalAlignment,
        });
      if (
        Math.hypot(
          last[0] - (entry.x + entry.nx * 0.52),
          last[1] - (entry.z + entry.nz * 0.52),
        ) > 0.002
      )
        issues.push({
          stop: journey.stopId,
          buildingId: journey.buildingId,
          kind: "wrong-landing",
        });
      const firstIssue = issues.length;
      for (let d = 0; d <= journey.length + 0.01; d += 0.25) {
        const p = sampleWalkingPath(
            points,
            Math.min(d, journey.length),
          ).position,
          building = inSourceBuilding(p),
          object = probe.obstruction(p);
        samples++;
        if (building)
          issues.push({
            stop: journey.stopId,
            destination: destination.name,
            kind: "source-building",
            building: building.id,
            d,
            position: p,
          });
        if (object)
          issues.push({
            stop: journey.stopId,
            destination: destination.name,
            kind: "fixed-prop",
            object,
            d,
            position: p,
          });
        if (issues.length - firstIssue > 12) break;
      }
      routes.push({
        stopId: journey.stopId,
        buildingId: journey.buildingId,
        name: destination.name,
        length: journey.length,
        normalAlignment,
        issues: issues.length - firstIssue,
      });
    }
    return { samples, propCount: probe.count, routes, issues };
  } finally {
    probe.dispose();
  }
}

export async function walkNorthEntranceApproaches(nav: NavigationAuditInput) {
  await initPhysics();
  const sim = new Simulation(),
    results: unknown[] = [];
  const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  try {
    for (const entry of northEntries()) {
      const journey = nav.journeys.find(
        (j) => j.buildingId === entry.buildingId,
      )!;
      assert(journey, `Missing route to B${entry.block}`);
      const points = journey.points.slice(-3) as [number, number][],
        start = points[0],
        actor = sim.add(`entrance-${entry.block}`, {
          x: start[0],
          y: groundHeight(start[0], start[1]) + 1,
          z: start[1],
        });
      actor.setPosition = () =>
        assert.fail(
          `B${entry.block}: no approach teleport or fall recovery allowed`,
        );
      let ticks = 0,
        distance = 0,
        minClearance = Infinity,
        maxStep = 0;
      const step = (x: number, z: number) => {
        const before = actor.position;
        actor.step({ ...idle, x, z });
        sim.tick(0);
        ticks++;
        const p = actor.position,
          moved = Math.hypot(p.x - before.x, p.z - before.z),
          clearance = p.y - groundHeight(p.x, p.z);
        distance += moved;
        maxStep = Math.max(maxStep, moved);
        minClearance = Math.min(minClearance, clearance);
        assert(
          moved < 0.13,
          `B${entry.block}: discontinuous movement ${moved}`,
        );
        assert(
          clearance > 0.76,
          `B${entry.block}: ground penetration ${JSON.stringify(p)}`,
        );
      };
      try {
        for (let i = 0; i < 30; i++) step(0, 0);
        for (const target of points.slice(1)) {
          let budget =
            Math.ceil(
              Math.hypot(
                target[0] - actor.position.x,
                target[1] - actor.position.z,
              ) /
                (4.6 / 60),
            ) + 150;
          while (budget-- > 0) {
            const p = actor.position,
              dx = target[0] - p.x,
              dz = target[1] - p.z,
              d = Math.hypot(dx, dz);
            if (d < 0.18) break;
            step(dx / d, dz / d);
          }
          assert(
            budget > 0,
            `B${entry.block}: blocked to ${target}, actual=${JSON.stringify(actor.position)}`,
          );
        }
        for (let i = 0; i < 45; i++) step(0, 0);
        const p = actor.position,
          landingY = entry.baseY + entry.rise;
        assert(
          Math.hypot(
            p.x - journey.points.at(-1)![0],
            p.z - journey.points.at(-1)![1],
          ) < 0.2,
          `B${entry.block}: did not reach landing`,
        );
        assert(
          Math.abs(p.y - (landingY + 0.82)) < 0.025,
          `B${entry.block}: actual capsule support ${p.y - 0.82}, expected landing ${landingY}`,
        );
        // Each centre of an actual tread must agree with the NPC analytic
        // height and the shared production collider, independent of path pose.
        let maxTreadError = 0;
        for (let i = 0; i < entry.steps; i++) {
          const out =
            entry.block === 6
              ? undefined
              : 0.48 + (entry.steps - i - 0.5) * 0.29;
          const x = entry.block === 6 ? entry.x : entry.x + entry.nx * out!,
            z =
              entry.block === 6
                ? B6_LAYOUT.entry.stepsFromZ +
                  ((i + 0.5) *
                    (B6_LAYOUT.entry.stepsToZ - B6_LAYOUT.entry.stepsFromZ)) /
                    entry.steps
                : entry.z + entry.nz * out!;
          const expected = entry.baseY + ((i + 1) * entry.rise) / entry.steps,
            analytic =
              entry.block === 6
                ? b6EntranceHeight(x, z)
                : commonEntranceHeight(x, z);
          assert(analytic !== undefined);
          assert(
            Math.abs(analytic - expected) < 1e-7,
            `B${entry.block}: analytic tread ${i} ${analytic} != ${expected}`,
          );
          const hit = sim.world.castRay(
            new RAPIER.Ray({ x, y: expected + 0.3, z }, { x: 0, y: -1, z: 0 }),
            0.6,
            true,
            undefined,
            undefined,
            actor.collider,
            actor.body,
          );
          assert(hit, `B${entry.block}: missing tread ${i}`);
          const actual = expected + 0.3 - hit.timeOfImpact,
            error = Math.abs(actual - expected);
          maxTreadError = Math.max(maxTreadError, error);
          assert(
            error < 0.00015,
            `B${entry.block}: collision tread ${i} ${actual} != ${expected}`,
          );
        }
        results.push({
          block: entry.block,
          buildingId: entry.buildingId,
          ticks,
          distance,
          maxStep,
          minClearance,
          maxTreadError,
          landingY,
          finalPosition: p,
        });
      } finally {
        sim.remove(actor.id);
      }
    }
    return results;
  } finally {
    sim.dispose();
  }
}
