/** Bounded history of authoritative, instantaneous door transitions. No client
 * command is predicted here, and a missing revision always requires a snapshot. */
import {
  assertCadDoorIdentity,
  cadDoorDefinitionsById,
  cadDoorTick,
  validateCadDoorSnapshot,
  type CadDoorDelta,
  type CadDoorIdentity,
  type CadDoorSnapshot,
  type CadDoorState,
  type CadDoorWorldDefinition,
} from "./cad-doors";

export type CadDoorTimelineResult = Readonly<{
  status: "accepted" | "duplicate" | "stale" | "rejected" | "resync";
  reason?: string;
}>;
const stateEqual = (a: CadDoorState, b: CadDoorState) =>
  a.id === b.id &&
  a.open === b.open &&
  a.revision === b.revision &&
  a.changedAtTick === b.changedAtTick;
const copyState = (s: CadDoorState): CadDoorState =>
  Object.freeze({
    id: s.id,
    open: s.open,
    revision: s.revision,
    changedAtTick: s.changedAtTick,
  });
type Baseline = {
  tick: number;
  revision: number;
  states: Map<string, CadDoorState>;
};

export class CadDoorTimeline {
  readonly definitions: ReadonlyMap<string, CadDoorWorldDefinition>;
  readonly identity: CadDoorIdentity;
  readonly historyTicks: number;
  readonly maxEvents: number;
  private base: Baseline | null = null;
  private current = new Map<string, CadDoorState>();
  private events: CadDoorDelta[] = [];
  private latestRevision = 0;
  private latestTick = 0;
  private gap = false;
  private disposed = false;
  private readonly stateCache = new Map<number, readonly CadDoorState[]>();

  constructor(
    definitions: readonly CadDoorWorldDefinition[],
    identity: CadDoorIdentity,
    options: { historyTicks?: number; maxEvents?: number } = {},
  ) {
    assertCadDoorIdentity(identity);
    this.identity = Object.freeze({ ...identity });
    this.definitions = cadDoorDefinitionsById(definitions);
    this.historyTicks = options.historyTicks ?? 128;
    this.maxEvents = options.maxEvents ?? 1024;
    if (
      !cadDoorTick(this.historyTicks) ||
      !cadDoorTick(this.maxEvents) ||
      this.historyTicks < 1 ||
      this.maxEvents < 1
    )
      throw new Error("Door history limits must be positive safe integers");
  }
  get initialized() {
    return this.base !== null && !this.disposed;
  }
  get needsResync() {
    return this.gap;
  }
  get revision() {
    return this.latestRevision;
  }
  get oldestTick() {
    return this.base?.tick ?? null;
  }
  get eventCount() {
    return this.events.length;
  }
  private compatible(raw: CadDoorIdentity) {
    return (
      raw &&
      raw.worldEpoch === this.identity.worldEpoch &&
      raw.definitionHash === this.identity.definitionHash
    );
  }
  private resync(reason: string): CadDoorTimelineResult {
    this.gap = true;
    return { status: "resync", reason };
  }

  acceptSnapshot(snapshot: CadDoorSnapshot): CadDoorTimelineResult {
    if (this.disposed) return { status: "rejected", reason: "disposed" };
    if (!this.compatible(snapshot))
      return { status: "rejected", reason: "wrong-world" };
    try {
      validateCadDoorSnapshot(snapshot, this.definitions, this.identity);
    } catch {
      return this.resync("invalid-snapshot");
    }
    if (
      this.base &&
      (snapshot.revision < this.latestRevision ||
        snapshot.tick < this.latestTick)
    )
      return { status: "stale" };
    const next = new Map(snapshot.states.map((s) => [s.id, copyState(s)]));
    if (
      this.base &&
      [...next].some(([id, s]) => {
        const old = this.current.get(id)!;
        return (
          s.revision < old.revision ||
          s.changedAtTick < old.changedAtTick ||
          (s.revision === old.revision && !stateEqual(s, old))
        );
      })
    )
      return this.resync("regressive-snapshot");
    if (this.base && !this.gap && snapshot.revision === this.latestRevision) {
      if ([...next].some(([id, s]) => !stateEqual(s, this.current.get(id)!)))
        return this.resync("conflicting-snapshot");
      const duplicate = snapshot.tick === this.latestTick;
      this.latestTick = snapshot.tick;
      this.prune();
      return { status: duplicate ? "duplicate" : "accepted" };
    }
    // A complete newer snapshot proves its own tick only. It cannot invent the
    // order/ticks of intervening transitions, so discard the old replay range.
    this.current = next;
    this.latestTick = snapshot.tick;
    this.latestRevision = snapshot.revision;
    this.base = {
      tick: snapshot.tick,
      revision: snapshot.revision,
      states: new Map(next),
    };
    this.events = [];
    this.stateCache.clear();
    this.gap = false;
    return { status: "accepted" };
  }

  acceptDelta(delta: CadDoorDelta): CadDoorTimelineResult {
    if (this.disposed) return { status: "rejected", reason: "disposed" };
    if (!this.compatible(delta))
      return { status: "rejected", reason: "wrong-world" };
    const state = delta.door;
    if (
      !cadDoorTick(delta.tick) ||
      !cadDoorTick(delta.revision) ||
      !state ||
      !this.definitions.has(state.id) ||
      !cadDoorTick(state.revision) ||
      typeof state.open !== "boolean" ||
      state.changedAtTick !== delta.tick
    )
      return this.resync("invalid-delta");
    if (!this.base) return this.resync("missing-snapshot");
    if (this.gap) return { status: "resync", reason: "snapshot-required" };
    if (delta.revision <= this.latestRevision) {
      const known = this.events.find((e) => e.revision === delta.revision);
      if (known) {
        if (known.tick === delta.tick && stateEqual(known.door, state))
          return { status: "duplicate" };
        return this.resync("conflicting-delta");
      }
      if (delta.revision === this.latestRevision) {
        return stateEqual(this.current.get(state.id)!, state)
          ? { status: "duplicate" }
          : this.resync("conflicting-delta");
      }
      return { status: "stale" };
    }
    if (delta.revision !== this.latestRevision + 1)
      return this.resync("revision-gap");
    const previous = this.current.get(state.id)!;
    if (
      delta.tick < this.latestTick ||
      state.revision !== previous.revision + 1 ||
      state.open === previous.open
    )
      return this.resync("invalid-transition");
    const event: CadDoorDelta = Object.freeze({
      ...this.identity,
      revision: delta.revision,
      tick: delta.tick,
      door: copyState(state),
    });
    this.events.push(event);
    this.current.set(state.id, event.door);
    this.latestRevision = event.revision;
    this.latestTick = event.tick;
    this.prune();
    return { status: "accepted" };
  }

  private materialize(tick: number): Baseline {
    const base = this.base!,
      states = new Map(base.states);
    let revision = base.revision;
    for (const e of this.events) {
      if (e.tick > tick) break;
      states.set(e.door.id, e.door);
      revision = e.revision;
    }
    return { tick, revision, states };
  }
  private prune() {
    if (!this.base) return;
    let cutoff = Math.max(this.base.tick, this.latestTick - this.historyTicks);
    if (this.events.length > this.maxEvents) {
      // Evict whole tick groups. A baseline never contains half of the events
      // retained for one tick, even when many clients interact in that tick.
      cutoff = Math.max(
        cutoff,
        this.events[this.events.length - this.maxEvents - 1].tick,
      );
    }
    if (cutoff > this.base.tick || this.events.some((e) => e.tick <= cutoff)) {
      this.base = this.materialize(cutoff);
      this.events = this.events.filter((e) => e.tick > cutoff);
      for (const revision of this.stateCache.keys())
        if (revision < this.base.revision) this.stateCache.delete(revision);
    }
  }
  /** Post-tick state. A required revision is mandatory for authoritative replay;
   * future local prediction can retain the last known state, never a guessed E. */
  revisionAt(tick: number, requiredRevision?: number): number | null {
    if (
      this.disposed ||
      this.gap ||
      !this.base ||
      !cadDoorTick(tick) ||
      tick < this.base.tick ||
      (requiredRevision !== undefined && !cadDoorTick(requiredRevision))
    )
      return null;
    let revision = this.base.revision;
    for (const event of this.events) {
      if (event.tick > tick) break;
      revision = event.revision;
    }
    if (requiredRevision !== undefined && revision !== requiredRevision)
      return null;
    return revision;
  }
  snapshotAt(tick: number, requiredRevision?: number): CadDoorSnapshot | null {
    const revision = this.revisionAt(tick, requiredRevision);
    if (revision === null) return null;
    let states = this.stateCache.get(revision);
    if (!states) {
      states = Object.freeze([...this.materialize(tick).states.values()]);
      this.stateCache.set(revision, states);
    }
    return {
      ...this.identity,
      tick,
      revision,
      states,
    };
  }
  currentSnapshot(): CadDoorSnapshot | null {
    return this.snapshotAt(this.latestTick, this.latestRevision);
  }
  dispose() {
    this.disposed = true;
    this.base = null;
    this.events = [];
    this.current.clear();
    this.stateCache.clear();
    this.gap = false;
  }
}
