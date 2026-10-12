import { MotionDecoder, MotionEncoder } from "../../shared/motion-codec";
import { SnapshotBuffer } from "../../shared/netcode";
import type { JumpClip } from "./jump-animation-fixture";

export const REMOTE_JUMP_EPOCH = Date.parse("2026-10-12T09:00:00Z");
export const REMOTE_JUMP_ID = "remote-jump";

/** Actual 20Hz codec + ordered delivery into the production interpolation buffer.
 * Latency/jitter affect arrival only, never the aligned server physics samples. */
export function remoteJumpStream(
  clip: JumpClip,
  options: {
    latencyMs?: number;
    jitterMs?: number[];
    omitGrounded?: boolean;
  } = {},
) {
  const encoder = new MotionEncoder(),
    decoder = new MotionDecoder();
  const snapshots = new SnapshotBuffer();
  let lastArrival = -Infinity;
  const packets = clip.frames.flatMap((frame, index) => {
    if ((index + 1) % 3 !== 0) return [];
    const time = REMOTE_JUMP_EPOCH + frame.time * 1000;
    const row: unknown[] = [
      REMOTE_JUMP_ID,
      frame.position.x,
      frame.position.y + 0.8,
      frame.position.z,
      frame.yaw,
      0,
      index + 1,
      0,
      "outside",
    ];
    if (!options.omitGrounded) row.push(frame.grounded);
    const jitter =
      options.jitterMs?.[Math.floor(index / 3) % options.jitterMs.length] ?? 0;
    const arrival = Math.max(
      lastArrival + 1,
      time + (options.latencyMs ?? 60) + jitter,
    );
    lastArrival = arrival;
    return [
      { arrival, wire: encoder.encode({ time, tick: index + 1, rows: [row] }) },
    ];
  });
  let delivered = 0;
  return {
    snapshots,
    get delivered() {
      return delivered;
    },
    sample(elapsedSeconds: number) {
      const now = REMOTE_JUMP_EPOCH + elapsedSeconds * 1000;
      while (delivered < packets.length && packets[delivered].arrival <= now) {
        const incoming = packets[delivered++];
        const packet = decoder.decode(incoming.wire);
        if (!packet)
          throw new Error("Valid ordered remote jump packet was rejected");
        snapshots.push(packet, incoming.arrival);
      }
      return snapshots.sample(REMOTE_JUMP_ID, now);
    },
  };
}
