import audit from "../shared/data/photogrammetry-collision.json";
import { decodePhotogrammetryCollision } from "../shared/photogrammetry-gameplay";
let pending: ReturnType<typeof load> | undefined;
async function load() {
  const response = await fetch(audit.url);
  if (!response.ok)
    throw new Error("Nelze načíst kolize fotogrammetrického Strahova.");
  return decodePhotogrammetryPhysicsPayload(await response.arrayBuffer());
}
export async function decodePhotogrammetryPhysicsPayload(payload: ArrayBuffer) {
  const bytes = new Uint8Array(payload);
  // Vite/HTTP hosts set Content-Encoding:gzip and the browser transparently
  // decompresses it. File hosts may instead deliver a raw .gz payload.
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x43 &&
    bytes[2] === 0x4d &&
    bytes[3] === 0x31
  )
    return decodePhotogrammetryCollision(payload);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Response(payload).body!.pipeThrough(
      new DecompressionStream("gzip"),
    );
    return decodePhotogrammetryCollision(
      await new Response(stream).arrayBuffer(),
    );
  }
  throw new Error("Neplatný formát kolizního podkladu Strahova.");
}
export function loadPhotogrammetryPhysics() {
  return (pending ??= load().catch((error) => {
    pending = undefined;
    throw error;
  }));
}
