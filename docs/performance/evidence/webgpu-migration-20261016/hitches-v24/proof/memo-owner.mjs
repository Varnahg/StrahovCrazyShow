/** Test owner only. Production lifetime/ownership deliberately unresolved. */
export class DefineMemo {
  #reference;
  #entries = new Map();
  #units = 0;
  #disposed = false;
  #counts = { calls: 0, hits: 0, misses: 0, bypasses: 0, unchanged: 0, tooLarge: 0, evictions: 0, inserts: 0, clears: 0, peakEntries: 0, peakCodeUnits: 0 };
  constructor(reference, { maxEntries = 64, maxCodeUnits = 256 * 1024 } = {}) {
    if (typeof reference !== 'function') throw new TypeError('Reference canonicalizer required');
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 0 || !Number.isSafeInteger(maxCodeUnits) || maxCodeUnits < 0) throw new RangeError('Finite nonnegative owner caps required');
    this.#reference = reference;
    Object.defineProperties(this,{maxEntries:{value:maxEntries,enumerable:true},maxCodeUnits:{value:maxCodeUnits,enumerable:true}});
  }
  convert(raw) {
    this.#counts.calls++;
    if (this.#disposed || typeof raw !== 'string' || !raw || raw.length > 32768) {
      this.#counts.bypasses++;
      return this.#reference(raw);
    }
    const found = this.#entries.get(raw);
    if (found !== undefined) { this.#counts.hits++; return found; }
    this.#counts.misses++;
    const value = this.#reference(raw);
    if (typeof value !== 'string' || value === raw) { this.#counts.unchanged++; return value; }
    const units = raw.length + value.length;
    if (!this.maxEntries || units > this.maxCodeUnits) { this.#counts.tooLarge++; return value; }
    while (this.#entries.size >= this.maxEntries || this.#units + units > this.maxCodeUnits) {
      const key = this.#entries.keys().next().value;
      this.#units -= key.length + this.#entries.get(key).length;
      this.#entries.delete(key); this.#counts.evictions++;
    }
    this.#entries.set(raw,value); this.#units += units; this.#counts.inserts++;
    this.#counts.peakEntries = Math.max(this.#counts.peakEntries,this.#entries.size);
    this.#counts.peakCodeUnits = Math.max(this.#counts.peakCodeUnits,this.#units);
    return value;
  }
  clear() { this.#entries.clear(); this.#units = 0; this.#counts.clears++; }
  dispose() { if (this.#disposed) return; this.clear(); this.#disposed = true; }
  snapshot() { return { ...this.#counts, retainedEntries: this.#entries.size, retainedCodeUnits: this.#units, disposed: this.#disposed, maxEntries: this.maxEntries, maxCodeUnits: this.maxCodeUnits }; }
  // Bounded test inspection only: no user objects or callbacks in entries.
  inspect() { return [...this.#entries].map(([key,value])=>({key,value})); }
}
