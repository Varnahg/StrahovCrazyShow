import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { decodePhotogrammetryPhysicsPayload } from "../client/photogrammetry-physics";
function payload() {
  const data = new ArrayBuffer(64),
    view = new DataView(data);
  view.setUint32(0, 0x314d4350, true);
  view.setUint32(4, 3, true);
  view.setUint32(8, 3, true);
  new Float32Array(data, 16, 9).set([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  new Uint32Array(data, 52, 3).set([0, 1, 2]);
  return data;
}
test("browser HTTP Content-Encoding already decoded PCM is accepted without a second gzip pass", async () => {
  const result = await decodePhotogrammetryPhysicsPayload(payload());
  assert.deepEqual([...result.indices], [0, 1, 2]);
  assert.equal(result.positions[8], 1);
});
test("raw gzip file payload from a host without Content-Encoding is decoded exactly once", async () => {
  const gzip = gzipSync(new Uint8Array(payload()));
  const result = await decodePhotogrammetryPhysicsPayload(
    Uint8Array.from(gzip).buffer,
  );
  assert.deepEqual([...result.positions], [0, 0, 0, 1, 0, 0, 0, 0, 1]);
});
test("an HTML error page cannot be mistaken for a valid physics source", async () => {
  await assert.rejects(
    decodePhotogrammetryPhysicsPayload(
      new TextEncoder().encode("<!DOCTYPE html>").buffer,
    ),
    /Neplatný formát/,
  );
});
