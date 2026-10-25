/** One authenticated connection owns its door history, even before Game exists.
 * The guest world never constructs this adapter or borrows its timeline. */
import { CadDoorTimeline } from "../shared/cad-door-timeline";
import {
  assertCadDoorIdentity,
  cadDoorTick,
  type CadDoorDelta,
  type CadDoorSnapshot,
  type CadDoorWorldDefinition,
} from "../shared/cad-doors";

export const DOOR_REJECTION_MESSAGES = {
  occupied: "Ve dveřích někdo stojí.",
  "out-of-range": "Přistup blíž ke dveřím.",
  "stale-revision": "Stav dveří se změnil. Zkus to znovu.",
  "stale-request": "Stav dveří se změnil. Zkus to znovu.",
  "rate-limit": "Počkej před další akcí.",
  vehicle: "Nejdřív vystup z auta.",
  occluded: "Ke dveřím musíš mít volný výhled.",
  "wrong-world": "Herní verze se změnila. Obnov stránku.",
  "unknown-door": "Herní verze se změnila. Obnov stránku.",
  invalid: "Dveře se nepodařilo ovládat. Zkus to znovu.",
  disposed: "Spojení přerušeno. Použij Obnovit spojení.",
} as const;
export type DoorConnectionNotice =
  (typeof DOOR_REJECTION_MESSAGES)[keyof typeof DOOR_REJECTION_MESSAGES];
type Options = {
  definitions: readonly CadDoorWorldDefinition[];
  definitionHash: string;
  isCurrent: () => boolean;
  onTimeline: (timeline: CadDoorTimeline | null) => void;
  requestResync: () => void;
  onNotice: (message: DoorConnectionNotice) => void;
  now?: () => number;
};

export class DoorConnection {
  private value: CadDoorTimeline | null = null;
  private disposed = false;
  private incompatible = false;
  private lastResync = -Infinity;
  private now: () => number;
  constructor(private options: Options) {
    assertCadDoorIdentity({
      worldEpoch: "validation",
      definitionHash: options.definitionHash,
    });
    this.now = options.now ?? (() => performance.now());
  }
  get timeline() {
    return this.value;
  }
  get failed() {
    return this.incompatible;
  }
  private active() {
    return !this.disposed && this.options.isCurrent();
  }
  requestResync(): boolean {
    if (!this.active() || this.incompatible) return false;
    return this.sendResync();
  }
  private sendResync(): boolean {
    const now = this.now();
    if (!Number.isFinite(now) || now - this.lastResync < 1000) return false;
    this.lastResync = now;
    try {
      this.options.requestResync();
      return true;
    } catch {
      return false;
    }
  }
  private rejectIdentity() {
    if (!this.incompatible) {
      this.incompatible = true;
      this.options.onTimeline(null);
      this.value?.dispose();
      this.value = null;
      this.options.onNotice(DOOR_REJECTION_MESSAGES["wrong-world"]);
      // A different asset/epoch cannot heal by repeatedly requesting the same
      // world. Send once, then require a fresh compatible connection/reload.
      this.sendResync();
    }
    return false;
  }
  receiveSnapshot(raw: unknown): boolean {
    if (!this.active()) return false;
    if (this.incompatible) return false;
    const snapshot = raw as CadDoorSnapshot;
    if (!snapshot || typeof snapshot !== "object") {
      this.requestResync();
      return false;
    }
    try {
      assertCadDoorIdentity(snapshot);
    } catch {
      this.requestResync();
      return false;
    }
    if (snapshot.definitionHash !== this.options.definitionHash)
      return this.rejectIdentity();
    if (this.value && snapshot.worldEpoch !== this.value.identity.worldEpoch)
      return this.rejectIdentity();
    this.value ??= new CadDoorTimeline(
      this.options.definitions,
      {
        worldEpoch: snapshot.worldEpoch,
        definitionHash: snapshot.definitionHash,
      },
      { historyTicks: 128, maxEvents: 1024 },
    );
    const result = this.value.acceptSnapshot(snapshot);
    this.options.onTimeline(this.value);
    if (result.status === "resync" || result.status === "rejected") {
      this.requestResync();
      return false;
    }
    return result.status === "accepted" || result.status === "duplicate";
  }
  receiveDelta(raw: unknown): boolean {
    if (!this.active() || this.incompatible) return false;
    const delta = raw as CadDoorDelta;
    if (!delta || typeof delta !== "object") {
      this.requestResync();
      return false;
    }
    try {
      assertCadDoorIdentity(delta);
    } catch {
      this.requestResync();
      return false;
    }
    if (delta.definitionHash !== this.options.definitionHash)
      return this.rejectIdentity();
    if (!this.value) {
      this.requestResync();
      return false;
    }
    if (delta.worldEpoch !== this.value.identity.worldEpoch)
      return this.rejectIdentity();
    const result = this.value.acceptDelta(delta);
    this.options.onTimeline(this.value);
    if (result.status === "resync" || result.status === "rejected") {
      this.requestResync();
      return false;
    }
    return result.status === "accepted" || result.status === "duplicate";
  }
  receiveResult(raw: unknown): void {
    if (
      !this.active() ||
      this.incompatible ||
      !raw ||
      typeof raw !== "object" ||
      !this.value
    )
      return;
    const result = raw as {
      status?: unknown;
      reason?: unknown;
      requestId?: unknown;
      worldEpoch?: unknown;
      definitionHash?: unknown;
    };
    if (
      result.worldEpoch !== this.value.identity.worldEpoch ||
      result.definitionHash !== this.options.definitionHash ||
      result.status !== "rejected" ||
      !cadDoorTick(result.requestId) ||
      typeof result.reason !== "string" ||
      !Object.hasOwn(DOOR_REJECTION_MESSAGES, result.reason)
    )
      return;
    this.options.onNotice(
      DOOR_REJECTION_MESSAGES[
        result.reason as keyof typeof DOOR_REJECTION_MESSAGES
      ],
    );
    if (
      result.reason === "stale-revision" ||
      result.reason === "wrong-world" ||
      result.reason === "unknown-door"
    )
      this.requestResync();
    // An acknowledgement is not an authoritative delta and never changes state.
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.options.onTimeline(null);
    this.value?.dispose();
    this.value = null;
  }
}
