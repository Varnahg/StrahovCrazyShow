type Position = { readonly x: number; readonly z: number };
type Candidate = { index: number; distance: number };
const byDistance = (a: Candidate, b: Candidate) => a.distance - b.distance;

/** The original distance/range/hysteresis policy with reusable work storage.
 * Positions are the immutable authored grass tiles, never camera-relative data.
 * A stationary selection is stable: selected scores can only decrease after
 * applying the 0.85 preference, while scores of rejected tiles cannot decrease.
 */
export class GrassPatchSelection {
  readonly selected: number[] = [];
  private readonly enabled: Uint8Array;
  private readonly records: Candidate[];
  private readonly candidates: Candidate[] = [];
  private previousX = NaN;
  private previousZ = NaN;
  private previousRange = NaN;
  private previousLimit = NaN;

  constructor(private readonly positions: readonly Position[]) {
    this.enabled = new Uint8Array(positions.length);
    this.records = positions.map((_, index) => ({ index, distance: 0 }));
  }

  /** Returns false when neither position nor quality selection has changed. */
  update(x: number, z: number, range: number, limit: number) {
    if (
      x === this.previousX &&
      z === this.previousZ &&
      range === this.previousRange &&
      limit === this.previousLimit
    )
      return false;
    this.previousX = x;
    this.previousZ = z;
    this.previousRange = range;
    this.previousLimit = limit;
    this.candidates.length = 0;
    for (let i = 0; i < this.positions.length; i++) {
      const position = this.positions[i];
      const distance = Math.hypot(position.x - x, position.z - z);
      if (!(distance < range + 11.4)) continue;
      const record = this.records[i];
      record.distance = distance * (this.enabled[i] ? 0.85 : 1);
      this.candidates.push(record);
    }
    // Stable sort preserves authored tile order at equal priority, as before.
    this.candidates.sort(byDistance);
    this.enabled.fill(0);
    this.selected.length = Math.min(limit, this.candidates.length);
    for (let i = 0; i < this.selected.length; i++) {
      const index = this.candidates[i].index;
      this.selected[i] = index;
      this.enabled[index] = 1;
    }
    return true;
  }

  isSelected(index: number) {
    return this.enabled[index] === 1;
  }
}
