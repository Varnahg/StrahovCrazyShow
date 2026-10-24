/** Immutable raw bytes survive renderer owners and failed/pending transfers.
 * Entries contain no Game, DOM, device, callbacks or mutable caller objects.
 * Only an exact server ACK releases the entry. Failed attempts remain retryable. */
export function createAttemptQueue({ send, digest, onChange = () => {} }) {
  const entries = new Map(), listeners = new Set();
  const notify = entry => {
    const snapshot = Object.freeze({ ...entry.base, state: entry.state, error: entry.error });
    try { onChange(snapshot); } catch {}
    for (const listener of listeners) { try { listener(); } catch {} }
  };
  async function transfer(entry) {
    try {
      const expected = await digest(entry.base.bytes);
      const receipt = await send(entry.base.bytes);
      if (receipt?.persisted !== true || receipt.attemptId !== entry.base.attemptId ||
          receipt.bytes !== entry.base.byteLength || receipt.sha256 !== expected)
        throw new Error('Receipt ACK identity/bytes/SHA mismatch');
      entries.delete(entry.base.attemptId);
      entry.state = 'acknowledged'; notify(entry);
      return { acknowledged: true, receipt };
    } catch (error) {
      entry.state = 'failed'; entry.error = String(error?.message ?? error).slice(0, 2000); notify(entry);
      return { acknowledged: false, error: entry.error };
    } finally { entry.promise = undefined; }
  }
  function retry(attemptId) {
    const entry = entries.get(attemptId);
    if (!entry) throw new Error('Attempt not retained');
    if (!entry.promise) {
      entry.state = 'pending'; entry.error = undefined; notify(entry);
      entry.promise = Promise.resolve().then(() => transfer(entry));
    }
    return entry.promise;
  }
  return {
    enqueue(raw) {
      const bytes = JSON.stringify(raw), attemptId = raw.attemptId;
      const prior = entries.get(attemptId);
      if (prior) {
        if (prior.base.bytes !== bytes) throw new Error('Immutable queued attempt conflict');
        return retry(attemptId);
      }
      const base = Object.freeze({ attemptId, kind: raw.kind, ownerId: raw.ownerId, bytes,
        byteLength: new TextEncoder().encode(bytes).length });
      const entry = { base, state: 'pending', promise: undefined, error: undefined };
      entries.set(attemptId, entry);
      return retry(attemptId);
    },
    retry,
    get pendingCount() { return entries.size; },
    retained() { return [...entries.values()].map(entry => Object.freeze({ ...entry.base, state: entry.state })); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
