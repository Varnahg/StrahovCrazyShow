import type { Authority } from "../shared/netcode";
import { validTimelineAuthority } from "../shared/input-timeline";

export type ReceivedAuthority = { packet: Authority; receivedAt: number };
export type AuthorityOffer =
  | { kind: "rejected"; reason: "invalid" | "stale" | "disposed" }
  | { kind: "queued"; replaced: boolean }
  | { kind: "barrier"; authority: ReceivedAuthority };

/** Coalesce ordinary state only. The integration applies returned barriers
 * immediately (or keeps the bootstrap barrier until Game is ready). It must
 * never defer a respawn marker into the replaceable ordinary slot. */
export class AuthorityBuffer {
  private latest: ReceivedAuthority | null = null;
  private frontier: Pick<
    Authority,
    "inputEpoch" | "inputTickBase" | "tick" | "ack"
  > | null = null;
  private disposed = false;
  private received = 0;
  private superseded = 0;
  private barriers = 0;
  private taken = 0;
  private rejected = 0;

  offer(packet: Authority, receivedAt: number): AuthorityOffer {
    if (this.disposed) return { kind: "rejected", reason: "disposed" };
    if (
      !validTimelineAuthority(packet) ||
      !Number.isFinite(receivedAt) ||
      receivedAt < 0
    ) {
      this.rejected++;
      return { kind: "rejected", reason: "invalid" };
    }
    const previous = this.frontier;
    if (
      previous &&
      (packet.inputEpoch < previous.inputEpoch ||
        packet.tick < previous.tick ||
        (packet.inputEpoch === previous.inputEpoch &&
          (packet.inputTickBase !== previous.inputTickBase ||
            packet.ack <= previous.ack)))
    ) {
      this.rejected++;
      return { kind: "rejected", reason: "stale" };
    }
    const barrier =
      !previous ||
      packet.inputEpoch !== previous.inputEpoch ||
      packet.resync === true ||
      packet.respawn === true;
    this.frontier = {
      inputEpoch: packet.inputEpoch,
      inputTickBase: packet.inputTickBase,
      tick: packet.tick,
      ack: packet.ack,
    };
    this.received++;
    const authority = { packet, receivedAt };
    if (barrier) {
      if (this.latest) this.superseded++;
      this.latest = null;
      this.barriers++;
      return { kind: "barrier", authority };
    }
    const replaced = this.latest !== null;
    if (replaced) this.superseded++;
    this.latest = authority;
    return { kind: "queued", replaced };
  }

  takeLatest(): ReceivedAuthority | null {
    const result = this.latest;
    this.latest = null;
    if (result) this.taken++;
    return result;
  }

  /** New room lifecycle can legitimately restart server tick and epoch values. */
  reset(): void {
    this.latest = null;
    this.frontier = null;
  }
  dispose(): void {
    this.reset();
    this.disposed = true;
  }
  snapshot() {
    return {
      received: this.received,
      superseded: this.superseded,
      barriers: this.barriers,
      ordinaryApplied: this.taken,
      rejected: this.rejected,
      pending: this.latest !== null,
      disposed: this.disposed,
    };
  }
}
