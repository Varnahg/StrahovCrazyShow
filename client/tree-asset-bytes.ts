import type { TreeAssetFile } from "../shared/tree-asset-types";
import { assetSha256 } from "./asset-sha256";

export const treeLoadAborted = () => new DOMException("Tree loading disposed", "AbortError");

export async function readTreeAssetBytes(
  url: string,
  maxBytes: number,
  expected: TreeAssetFile | undefined,
  signal: AbortSignal,
  onRead: (bytes: number) => void,
): Promise<ArrayBuffer> {
  const check = () => { if (signal.aborted) throw treeLoadAborted(); };
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    check();
    response = await fetch(url, { signal });
    check();
    if (!response.ok) throw Error(`Tree HTTP ${response.status}: ${url}`);
    if (Number(response.headers.get("content-length")) > maxBytes)
      throw Error("Tree response exceeds budget");

    // Content-Length is only a hint. Enforce the cap before retaining each chunk.
    let buffer: ArrayBuffer;
    if (response.body) {
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const result = await reader.read();
        check();
        if (result.done) break;
        length += result.value.byteLength;
        if (length > maxBytes) throw Error("Tree response exceeds budget");
        chunks.push(result.value);
      }
      const joined = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      buffer = joined.buffer;
    } else {
      buffer = await response.arrayBuffer();
      if (buffer.byteLength > maxBytes) throw Error("Tree response exceeds budget");
    }
    check();
    onRead(buffer.byteLength);
    if (expected) {
      if (buffer.byteLength !== expected.bytes) throw Error("Tree asset byte length mismatch");
      if (await assetSha256(buffer, signal) !== expected.sha256) throw Error("Tree asset SHA-256 mismatch");
      check();
    }
    return buffer;
  } catch (error) {
    // Cancel this body, without delaying the original failure or aborting peers.
    try {
      void (reader ? reader.cancel(error) : response?.body?.cancel(error))?.catch(() => {});
    } catch { /* Preserve the original error. */ }
    throw error;
  } finally {
    try { reader?.releaseLock(); } catch { /* Best effort for a broken stream adapter. */ }
  }
}
