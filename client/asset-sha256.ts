/** SHA-256 integrity veřejných assetů. Native Web Crypto je první volba;
 * přenosná cesta podle FIPS 180-4 §5/6.2 slouží pouze při absenci SubtleCrypto.
 * Nevytváří další kopii vstupu; volající během výpočtu vlastní neměnné bajty. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const SLICE_BYTES = 256 * 1024;
const rotate = (word: number, count: number) => (word >>> count) | (word << (32 - count));
const abortError = () => new DOMException("Výpočet SHA-256 byl zrušen.", "AbortError");
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }

/** Native digest nelze zrušit. Pozorujeme i jeho pozdní odmítnutí, ale vlastník
 * nečeká na dokončení po abortu a nepřevezme pozdě vrácený výsledek. */
function nativeDigest(pending: Promise<ArrayBuffer>, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => { cleanup(); reject(abortError()); };
    signal.addEventListener("abort", abort, { once: true });
    pending.then(value => { cleanup(); if (signal.aborted) reject(abortError()); else resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

function yieldToHost(signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => { cleanup(); if (signal?.aborted) reject(abortError()); else resolve(); }, 0);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Pevný stav a jeden znovu použitý schedule; žádné pole nevzniká za blok. */
class Sha256State {
  private readonly state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly words = new Uint32Array(64);
  block(bytes: Uint8Array, offset: number) {
    const w = this.words;
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      w[i] = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + w[i - 16] +
        (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10)) + w[i - 7];
    }
    const s = this.state;
    let a = s[0], b = s[1], c = s[2], d = s[3], e = s[4], f = s[5], g = s[6], h = s[7];
    for (let i = 0; i < 64; i++) {
      const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
        ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) +
        ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + first) >>> 0;
      d = c; c = b; b = a; a = (first + second) >>> 0;
    }
    s[0] += a; s[1] += b; s[2] += c; s[3] += d;
    s[4] += e; s[5] += f; s[6] += g; s[7] += h;
  }
  hex() { return Array.from(this.state, word => word.toString(16).padStart(8, "0")).join(""); }
}

export async function assetSha256(input: ArrayBuffer | Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<string> {
  checkAbort(signal);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!(bytes.buffer instanceof ArrayBuffer)) throw new TypeError("SHA-256 vyžaduje nesdílený buffer assetu.");
  const subtle = globalThis.crypto?.subtle;
  if (subtle != null) {
    // Chybějící API dovoluje fallback. Existující API, které odmítne digest,
    // chybu nezamění za jiný výsledek nebo přijatý neověřený asset.
    const operation = Promise.resolve().then(() => { checkAbort(signal); return subtle.digest("SHA-256", bytes); });
    const result = await nativeDigest(operation, signal);
    checkAbort(signal);
    if (result.byteLength !== 32) throw new Error("Neplatná délka SHA-256 digestu.");
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  const length = bytes.byteLength, end = length - length % 64, hash = new Sha256State();
  let offset = 0;
  while (offset < end) {
    checkAbort(signal);
    if (bytes.byteLength !== length) throw new Error("Buffer assetu se během hashování změnil.");
    const stop = Math.min(end, offset + SLICE_BYTES);
    for (; offset < stop; offset += 64) hash.block(bytes, offset);
    if (offset < end) await yieldToHost(signal);
  }
  checkAbort(signal);
  if (bytes.byteLength !== length) throw new Error("Buffer assetu se během hashování změnil.");
  // Pouze poslední jeden či dva bloky se kopírují kvůli FIPS paddingu.
  const remainder = length - end, tail = new Uint8Array(remainder < 56 ? 64 : 128);
  tail.set(bytes.subarray(end)); tail[remainder] = 0x80;
  const view = new DataView(tail.buffer);
  view.setUint32(tail.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(tail.length - 4, (length << 3) >>> 0);
  for (let p = 0; p < tail.length; p += 64) hash.block(tail, p);
  return hash.hex();
}
