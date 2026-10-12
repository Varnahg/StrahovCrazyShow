/** In-memory binary payload comparison. No server/browser/GPU, no capacity claim. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { getMessageBytes, Protocol } from "@colyseus/core";
import { MotionDecoder, MotionEncoder } from "../shared/motion-codec";
import type { MotionPacket } from "../shared/netcode";
import type { VehicleState } from "../shared/vehicle";

const car: VehicleState = {
  id: "campus-car",
  driverId: null,
  parked: true,
  sleeping: true,
  position: { x: 120.123456789, y: 5.987654321, z: -2.0123456789 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  parking: {
    position: { x: 120.123456789, y: 5.987654321, z: -2.0123456789 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  },
  linvel: { x: 0, y: 0, z: 0 },
  angvel: { x: 0, y: 0, z: 0 },
  force: { x: 0, y: 0, z: 0 },
  torque: { x: 0, y: 0, z: 0 },
  steering: 0,
  wheelSpin: [1.123456789, 2, 3, 4],
  wheelSuspension: [0.41, 0.42, 0.43, 0.44],
  wheelContact: [true, true, true, true],
};
const frames = 120,
  hz = 20;
const bytes = (value: unknown) =>
  getMessageBytes.raw(Protocol.ROOM_DATA, "motion", value).length;
const samples: Record<string, unknown>[] = [];
for (const population of [100, 1000])
  for (const movingFraction of [0, 0.5, 1]) {
    const encoder = new MotionEncoder(),
      decoder = new MotionDecoder();
    const ids = Array.from(
      { length: population },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    let fullBytes = 0,
      compactBytes = 0,
      fullEncodeMs = 0,
      compactEncodeMs = 0,
      compactDecodeMs = 0;
    let keyframes = 0,
      reconstructedPlayerSamples = 0;
    for (let frame = 0; frame < frames; frame++) {
      const packet: MotionPacket = {
        time: 1791727486000 + frame * 50,
        tick: frame * 3,
        car,
        rows: ids.map((id, i) => {
          const moving = i < population * movingFraction;
          return [
            id,
            120.123456 + i / 10 + (moving ? frame / 4 : 0),
            5.123456,
            -12.123456 + (moving ? Math.sin(frame / 20) : 0),
            moving ? frame / 80 : 1.234567,
            moving ? 4.567891 : 0,
            frame * 3,
            0,
            "outside",
            true,
          ];
        }),
      };
      let start = performance.now();
      fullBytes += bytes(packet);
      fullEncodeMs += performance.now() - start;
      start = performance.now();
      const wire = encoder.encode(packet);
      compactBytes += bytes(wire);
      compactEncodeMs += performance.now() - start;
      if (wire.k) keyframes++;
      start = performance.now();
      const reconstructed = decoder.decode(wire);
      compactDecodeMs += performance.now() - start;
      if (reconstructed?.rows.length !== population)
        throw new Error("Incomplete reconstructed population");
      reconstructedPlayerSamples += reconstructed.rows.length;
    }
    samples.push({
      population,
      movingFraction,
      frames,
      keyframes,
      reconstructedPlayerSamples,
      fullBytes,
      compactBytes,
      reductionPercent: +(100 * (1 - compactBytes / fullBytes)).toFixed(3),
      fullAggregateMBps: +(
        ((fullBytes / frames) * hz * population) /
        1e6
      ).toFixed(3),
      compactAggregateMBps: +(
        ((compactBytes / frames) * hz * population) /
        1e6
      ).toFixed(3),
      fullEncodeMeanMs: +(fullEncodeMs / frames).toFixed(4),
      compactEncodeMeanMs: +(compactEncodeMs / frames).toFixed(4),
      compactDecodeMeanMs: +(compactDecodeMs / frames).toFixed(4),
    });
  }
const paths = [
  "shared/motion-codec.ts",
  "shared/netcode.ts",
  "shared/vehicle.ts",
  "scripts/profile-motion-codec.ts",
];
console.log(
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      node: process.version,
      method:
        "Same source MotionPacket replay encoded by installed Colyseus binary message serializer, complete population at 20 Hz, 40-message keyframe interval, exact parked car; no WebSocket/TCP/TLS overhead. Byte counts are measured in-memory, aggregate MB/s extrapolated. CPU means are unisolated diagnostics, not production throughput, GPU or client FPS evidence. All players retained; no distance filtering.",
      sourceHashes: Object.fromEntries(
        paths.map((path) => [
          path,
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        ]),
      ),
      samples,
    },
    null,
    2,
  ),
);
