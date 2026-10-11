import fs from "node:fs";
import { TRANSIT_NAVIGATION } from "../../../shared/transit";
import { PARKING_SLOTS } from "../../../shared/terrain";
import { CHARACTER_RADIUS } from "../../../shared/simulation";
const collisions = [];
for (const journey of TRANSIT_NAVIGATION.journeys) {
  const hitSlots = new Map();
  for (let i = 1; i < journey.points.length; i++) {
    const a = journey.points[i - 1],
      b = journey.points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let j = 0; j <= Math.ceil(length / 0.2); j++) {
      const t = j / Math.max(1, Math.ceil(length / 0.2)),
        x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      for (const slot of PARKING_SLOTS) {
        const dx = x - slot.x,
          dz = z - slot.z,
          localX = dx * Math.cos(slot.yaw) - dz * Math.sin(slot.yaw),
          localZ = dx * Math.sin(slot.yaw) + dz * Math.cos(slot.yaw);
        const distance = Math.hypot(
          Math.max(Math.abs(localX) - 1.02, 0),
          Math.max(Math.abs(localZ) - 1.78, 0),
        );
        if (
          distance < CHARACTER_RADIUS &&
          (!hitSlots.has(slot.id) || hitSlots.get(slot.id).distance > distance)
        )
          hitSlots.set(slot.id, { slot: slot.id, point: { x, z }, distance });
      }
    }
  }
  if (hitSlots.size)
    collisions.push({
      stopId: journey.stopId,
      buildingId: journey.buildingId,
      collisions: [...hitSlots.values()],
    });
}
const report = {
  checkedAt: new Date().toISOString(),
  description:
    "Static 20cm path samples against the shared parked-car footprint plus player/NPC capsule radius; not a live passenger count.",
  journeys: TRANSIT_NAVIGATION.journeys.length,
  parkingSlots: PARKING_SLOTS.length,
  blockedJourneys: collisions.length,
  collisions,
};
fs.writeFileSync(
  "docs/reality-pack/physics-validation/npc-clearance.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
