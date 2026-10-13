import type { RootDemand } from "./photo-grass-budget";

// High radius12 + orbit15m + up to3m follow lag: even the enclosing grid box
// has fewer than1536 tiles at any yaw. Matrix payload stays below15MiB. The
// former256 limit cannot hold ordinary high third-person views (300–460 tiles).
export const GRASS_CACHE_TILES = 1536;

// Tile construction yields every 16 source-backed placement/transform samples;
// neither a cold view nor ranking its roots may occupy an entire frame.
export const GRASS_PREPARATION = {
  milliseconds: 2,
  coldTiles: 2,
  steps: 256,
  rankedRootsPerStep: 64,
  additions: 256,
  allocationChecks: 1024,
} as const;

const before = (a: RootDemand, b: RootDemand) =>
  a.score < b.score || (a.score === b.score && a.id < b.id);

/** Incremental equivalent of sorting by score then stable world ID. Keeping a
 * heap avoids moving the full sort into the last preparation frame. */
export class GrassSelectionHeap<T extends RootDemand> {
  private entries: T[] = [];
  get length() {
    return this.entries.length;
  }
  push(value: T) {
    let index = this.entries.length;
    this.entries.push(value);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (!before(value, this.entries[parent])) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = value;
  }
  pop(): T | undefined {
    const first = this.entries[0],
      last = this.entries.pop();
    if (!last || !this.entries.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.entries.length &&
        before(this.entries[child + 1], this.entries[child])
      )
        child++;
      if (!before(this.entries[child], last)) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
  clear() {
    this.entries.length = 0;
  }
}
