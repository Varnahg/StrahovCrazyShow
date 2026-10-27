import { GLTFFileLoader } from "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { TreeAssetFile, TreePrototype, TreeRole, TreeMaterialKey, TreeLod } from "../shared/tree-asset-types";
import { treeAssetUrl } from "../shared/tree-asset-types";
import { assetSha256 } from "./asset-sha256";

const MAX_BYTES = 128 * 1024 * 1024;
const integer = (n: unknown, min = 0, max = MAX_BYTES): number => {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < min || n > max) throw Error("Invalid tree integer/range");
  return n;
};
const object = (v: unknown): Record<string, any> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Invalid tree object");
  return v as Record<string, any>;
};
const abortError = () => new DOMException("Tree loading disposed", "AbortError");
function validateGeometry(positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array) {
  if (!positions.length || positions.length % 3 || normals.length !== positions.length || uvs.length !== positions.length / 3 * 2 || !indices.length || indices.length % 3) throw Error("Invalid tree geometry shape");
  for (const a of [positions, normals, uvs]) for (const n of a) if (!Number.isFinite(n)) throw Error("Nonfinite tree vertex");
  for (const index of indices) if (index >= positions.length / 3) throw Error("Tree index outside vertices");
}

/** Lossless v1 chunk views. Validate every primitive before the caller allocates meshes. */
export function decodeTreeRuntimeChunk(buffer: ArrayBuffer) {
  if (buffer.byteLength < 8 || buffer.byteLength > MAX_BYTES) throw Error("Invalid tree chunk size");
  const length = new DataView(buffer).getUint32(0, true);
  if (!length || length > 1024 * 1024 || length + 4 > buffer.byteLength) throw Error("Invalid tree chunk header");
  const metadata = object(JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length))));
  if (metadata.version !== 1 || ![0, 1].includes(metadata.lod) || typeof metadata.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(metadata.id) || !Array.isArray(metadata.primitives) || !metadata.primitives.length || metadata.primitives.length > 2) throw Error("Invalid tree chunk identity");
  const read = (value: unknown, components: number, type: "float" | "index") => {
    const a = object(value), componentType = integer(a.componentType), bytes = componentType === 5123 ? 2 : 4;
    if ((type === "float" ? componentType !== 5126 : ![5123, 5125].includes(componentType)) || a.components !== components) throw Error("Invalid tree attribute type");
    const count = integer(a.count, 1), start = 4 + length + integer(a.byteOffset), byteLength = integer(a.byteLength, 1);
    if (start % bytes || count * components * bytes !== byteLength || start + byteLength > buffer.byteLength) throw Error("Invalid tree attribute bounds");
    return componentType === 5126 ? new Float32Array(buffer, start, count * components) : componentType === 5123 ? new Uint16Array(buffer, start, count) : new Uint32Array(buffer, start, count);
  };
  const names = new Set<string>();
  const primitives = metadata.primitives.map((value: unknown) => {
    const p = object(value), attrs = object(p.attributes);
    if (typeof p.name !== "string" || !["bark", "leaves"].some(role => p.name === `tree__${metadata.id}__lod${metadata.lod}__${role}`) || names.has(p.name)) throw Error("Invalid tree primitive identity");
    names.add(p.name);
    const positions = read(attrs.POSITION, 3, "float") as Float32Array, normals = read(attrs.NORMAL, 3, "float") as Float32Array, uvs = read(attrs.TEXCOORD_0, 2, "float") as Float32Array, indices = read(p.indices, 1, "index") as Uint16Array | Uint32Array;
    validateGeometry(positions, normals, uvs, indices);
    return { name: p.name as string, material: integer(p.material, 0, 15), positions, normals, uvs, indices };
  });
  if (!primitives.some((p: { name: string }) => p.name.endsWith("__bark"))) throw Error("Tree chunk lacks wood");
  return { version: 1, id: metadata.id as string, lod: metadata.lod as number, primitives };
}

export function readTreeGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 28 || buffer.byteLength > MAX_BYTES) throw Error("Invalid tree GLB size");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw Error("Invalid tree GLB header");
  const jsonLength = view.getUint32(12, true), binHeader = 20 + jsonLength;
  if (!jsonLength || jsonLength % 4 || jsonLength > 4 * 1024 * 1024 || binHeader + 8 > buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a || view.getUint32(binHeader + 4, true) !== 0x004e4942) throw Error("Invalid tree GLB chunks");
  const binLength = view.getUint32(binHeader, true), binOffset = binHeader + 8;
  if (binOffset + binLength !== buffer.byteLength) throw Error("Invalid tree GLB binary length");
  const json = object(JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))));
  if (json.asset?.version !== "2.0" || !Array.isArray(json.buffers) || json.buffers.length !== 1 || json.buffers[0].uri !== undefined || integer(json.buffers[0].byteLength, 1) > binLength || binLength - json.buffers[0].byteLength > 3 || json.animations?.length || json.skins?.length || json.cameras?.length || json.extensionsRequired?.length || json.extensionsUsed?.length) throw Error("Unsupported tree GLB content");
  if (!Array.isArray(json.bufferViews) || !Array.isArray(json.accessors)) throw Error("Missing tree GLB buffers");
  for (const b of json.bufferViews) {
    if (b.buffer !== 0 || b.byteStride !== undefined || b.extensions !== undefined || integer(b.byteOffset ?? 0) + integer(b.byteLength, 1) > json.buffers[0].byteLength) throw Error("Invalid tree GLB buffer view");
  }
  for (const img of json.images ?? []) if (img.uri !== undefined || !json.bufferViews[integer(img.bufferView)] || !["image/jpeg", "image/png"].includes(img.mimeType)) throw Error("External/invalid tree image");
  for (const texture of json.textures ?? []) if (!json.images?.[integer(texture.source)] || (texture.sampler !== undefined && !json.samplers?.[integer(texture.sampler)]) || texture.extensions) throw Error("Invalid tree texture reference");
  const checkTexture = (info: any) => { if (info !== undefined && (!json.textures?.[integer(info.index)] || (info.texCoord ?? 0) !== 0 || info.extensions)) throw Error("Invalid tree material texture"); };
  for (const material of json.materials ?? []) {
    if (material.extensions || (material.alphaMode !== undefined && !["OPAQUE", "MASK", "BLEND"].includes(material.alphaMode))) throw Error("Unsupported tree material");
    for (const info of [material.normalTexture, material.occlusionTexture, material.emissiveTexture, material.pbrMetallicRoughness?.baseColorTexture, material.pbrMetallicRoughness?.metallicRoughnessTexture]) checkTexture(info);
  }
  if (!Array.isArray(json.meshes) || !json.meshes.length || !Array.isArray(json.nodes) || !json.nodes.length || !Array.isArray(json.scenes) || json.scenes.length !== 1 || (json.scene ?? 0) !== 0 || !Array.isArray(json.scenes[0].nodes)) throw Error("Invalid tree scene");
  const sceneNodes = json.scenes[0].nodes;
  if (sceneNodes.length !== json.nodes.length || new Set(sceneNodes).size !== sceneNodes.length || sceneNodes.some((n: unknown) => !json.nodes[integer(n)])) throw Error("Tree scene must include each flat node once");
  for (const node of json.nodes) {
    if (!json.meshes[integer(node.mesh)] || node.children?.length || node.skin !== undefined || node.camera !== undefined || node.extensions) throw Error("Unsupported tree node hierarchy");
    for (const [key, count] of [["translation", 3], ["rotation", 4], ["scale", 3], ["matrix", 16]] as const) if (node[key] !== undefined && (!Array.isArray(node[key]) || node[key].length !== count || !node[key].every((n: unknown) => typeof n === "number" && Number.isFinite(n)))) throw Error("Invalid tree node transform");
  }
  const accessor = (index: number, type?: string, componentType?: number) => {
    const a = object(json.accessors[integer(index)]), b = json.bufferViews[integer(a.bufferView)], sizes: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }, components = sizes[a.type];
    if (!b || !components || a.sparse || a.extensions || ![5123, 5125, 5126].includes(a.componentType) || (type && a.type !== type) || (componentType && a.componentType !== componentType)) throw Error("Unsupported tree accessor");
    const bytes = a.componentType === 5123 ? 2 : 4, count = integer(a.count, 1), offset = integer(a.byteOffset ?? 0), start = binOffset + (b.byteOffset ?? 0) + offset;
    if (start % bytes || offset + count * components * bytes > b.byteLength) throw Error("Invalid tree accessor bounds");
    const data = a.componentType === 5126 ? new Float32Array(buffer, start, count * components) : a.componentType === 5123 ? new Uint16Array(buffer, start, count * components) : new Uint32Array(buffer, start, count * components);
    if (a.componentType === 5126) for (const n of data) if (!Number.isFinite(n)) throw Error("Nonfinite tree GLB attribute");
    return { data, normalized: a.normalized === true, count, componentType: a.componentType };
  };
  for (let i = 0; i < json.accessors.length; i++) accessor(i);
  for (const mesh of json.meshes) {
    if (!Array.isArray(mesh.primitives) || !mesh.primitives.length || mesh.primitives.length > 2) throw Error("Invalid tree primitive population");
    for (const p of mesh.primitives) {
    if ((p.mode ?? 4) !== 4 || p.targets || p.extensions || (p.material !== undefined && !json.materials?.[integer(p.material)])) throw Error("Unsupported tree primitive/material");
    const positions = accessor(p.attributes?.POSITION, "VEC3", 5126).data as Float32Array, normals = accessor(p.attributes?.NORMAL, "VEC3", 5126).data as Float32Array, uvs = accessor(p.attributes?.TEXCOORD_0, "VEC2", 5126).data as Float32Array, indices = accessor(p.indices, "SCALAR");
    if (![5123, 5125].includes(indices.componentType)) throw Error("Invalid tree GLB index type");
    validateGeometry(positions, normals, uvs, indices.data as Uint16Array | Uint32Array);
    }
  }
  return { json, accessor, bin: { byteLength: binLength, readAsync: async (offset: number, length: number) => {
    if (integer(offset) + integer(length) > binLength) throw Error("Tree GLB binary read out of bounds");
    return new Uint8Array(buffer, binOffset + offset, length);
  } } };
}

export function decodeTreePrototype(buffer: ArrayBuffer, id: string, prototype: TreePrototype, onlyLod?: TreeLod) {
  const glb = readTreeGlb(buffer), { json, accessor } = glb;
  if (json.images?.length || json.materials?.length || json.textures?.length || !Array.isArray(json.nodes) || !Array.isArray(json.meshes)) throw Error("Pilot GLB must be geometry-only");
  const expected = new Set(onlyLod === undefined ? prototype.lods.flatMap(lod => lod.meshNames) : prototype.lods[onlyLod].meshNames), seen = new Set<string>();
  const usedAccessors = new Set<number>();
  const parts = json.nodes.map((node: any) => {
    if (node.mesh === undefined) throw Error("Pilot tree must have flat mesh nodes");
    const identity = (value: unknown, expected: number[]) => value === undefined || (Array.isArray(value) && value.length === expected.length && value.every((n, i) => n === expected[i]));
    if (node.children?.length || node.matrix || !identity(node.translation, [0, 0, 0]) || !identity(node.scale, [1, 1, 1]) || !identity(node.rotation, [0, 0, 0, 1]) || !expected.has(node.name) || seen.has(node.name)) throw Error("Invalid pilot node identity/transform");
    seen.add(node.name);
    const e = object(node.extras), lod = integer(e.lod, 0, 2), role = e.role as TreeRole, materialKey = e.materialKey as TreeMaterialKey;
    if ((onlyLod !== undefined && lod !== onlyLod) || node.name !== `${id}__lod${lod}__${role}` || e.archetypeId !== id || e.sourceTreeId !== prototype.sourceTreeId || !["wood", "foliage"].includes(role) || (role === "wood" ? materialKey !== "Bark012" : materialKey !== (prototype.family === "evergreen-conifer" ? "fir_tree_01" : "LeafSet024"))) throw Error("Pilot extras mismatch");
    const mesh = object(json.meshes[integer(node.mesh)]);
    if (!Array.isArray(mesh.primitives) || mesh.primitives.length !== 1 || mesh.primitives[0].material !== undefined) throw Error("Pilot requires one primitive per role");
    const p = mesh.primitives[0], positions = accessor(p.attributes.POSITION, "VEC3", 5126).data as Float32Array, normals = accessor(p.attributes.NORMAL, "VEC3", 5126).data as Float32Array, uvs = accessor(p.attributes.TEXCOORD_0, "VEC2", 5126).data as Float32Array, indices = accessor(p.indices, "SCALAR").data as Uint16Array | Uint32Array;
    if (onlyLod !== undefined) {
      const names = Object.keys(p.attributes);
      if (names.length !== (role === "foliage" ? 4 : 3) || names.some(name => !["POSITION", "NORMAL", "TEXCOORD_0", ...(role === "foliage" ? ["COLOR_0"] : [])].includes(name))) throw Error("Unexpected streamed tree attribute");
      for (const index of [...Object.values(p.attributes), p.indices]) usedAccessors.add(integer(index));
    }
    let colors: Float32Array | undefined;
    if (role === "foliage") {
      const color = accessor(p.attributes.COLOR_0, "VEC4", 5123);
      if (!color.normalized || color.count !== positions.length / 3) throw Error("Pilot foliage lacks normalized uint16 rank");
      colors = new Float32Array(color.data.length);
      for (let i = 0; i < colors.length; i++) { const n = color.data[i]; if (i % 4 === 3 ? n < 1 || n > 65534 : n !== 65535) throw Error("Invalid pilot rank/RGB"); colors[i] = n / 65535; }
      for (let i = 0; i < indices.length; i += 3) if (colors[indices[i] * 4 + 3] !== colors[indices[i + 1] * 4 + 3] || colors[indices[i] * 4 + 3] !== colors[indices[i + 2] * 4 + 3]) throw Error("Pilot triangle crosses leaf ranks");
    }
    return { name: node.name as string, role, materialKey, lod, positions, normals, uvs, indices, colors };
  });
  if (seen.size !== expected.size || json.meshes.length !== seen.size) throw Error("Pilot GLB missing/extra meshes");
  if (onlyLod !== undefined) {
    const usedViews = new Set([...usedAccessors].map(index => json.accessors[index].bufferView));
    if (usedAccessors.size !== json.accessors.length || usedViews.size !== json.bufferViews.length) throw Error("Streamed GLB contains unused accessors/views");
    let end = 0;
    for (const view of [...json.bufferViews].sort((a, b) => (a.byteOffset ?? 0) - (b.byteOffset ?? 0))) {
      if ((view.byteOffset ?? 0) !== end) throw Error("Streamed GLB contains unused BIN bytes");
      end += view.byteLength; end += (4 - end % 4) % 4;
    }
    if (end !== glb.bin.byteLength) throw Error("Streamed GLB contains unused BIN bytes");
  }
  return parts;
}

/** Counts actual immutable files once and rejects conflicting identities before
 * admission. Shared banks and maps cannot multiply (or hide) source-byte costs. */
export function uniqueTreeSourceBytes(files: readonly TreeAssetFile[]) {
  const unique = new Map<string, TreeAssetFile>();
  for (const file of files) {
    const previous = unique.get(file.url);
    if (previous && (previous.bytes !== file.bytes || previous.sha256 !== file.sha256)) throw Error("Conflicting tree asset identity");
    unique.set(file.url, file);
  }
  let bytes = 0; for (const file of unique.values()) bytes += file.bytes;
  if (!Number.isSafeInteger(bytes)) throw Error("Tree source byte overflow");
  return bytes;
}

/** Coverage comes from indexed triangles in the validated fallback GLB, never
 * from placement metadata or unreferenced COLOR entries. */
export function treePrototypeFoliageRanks(parts: ReturnType<typeof decodeTreePrototype>) {
  const ranks = new Set<number>();
  for (const part of parts) if (part.role === "foliage") {
    if (!part.colors) throw Error("Tree fallback lacks ranks");
    for (const index of part.indices) ranks.add(Math.round(part.colors[index * 4 + 3] * 65535));
  }
  return [...ranks].sort((a, b) => a - b);
}

/** One lifecycle owner. Only in-flight requests coalesce; completed buffers are
 * released to callers rather than retained in a second unbounded cache. */
export class TreeAssetLoader {
  private readonly abort = new AbortController();
  private readonly inflight = new Map<string, Promise<ArrayBuffer>>();
  readonly stats = { requests: 0, bytesFetched: 0, pending: 0 };
  get disposed() { return this.abort.signal.aborted; }
  get signal() { return this.abort.signal; }
  private check() { if (this.disposed) throw abortError(); }
  async json(url: string): Promise<unknown> {
    const data = await this.bytes(treeAssetUrl(url), 2 * 1024 * 1024);
    return JSON.parse(new TextDecoder().decode(data));
  }
  async jsonAsset(file: TreeAssetFile): Promise<unknown> {
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 2 * 1024 * 1024 ||
        typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) throw Error("Invalid tree JSON integrity/budget");
    // Own the caller's descriptor across awaits; mutable application options
    // cannot change integrity validation while a catalogue response is in flight.
    const owned = { url: treeAssetUrl(file.url), bytes: file.bytes, sha256: file.sha256 };
    const data = await this.asset(owned); this.check();
    return JSON.parse(new TextDecoder().decode(data));
  }
  bytes(url: string, maxBytes = MAX_BYTES, expected?: TreeAssetFile): Promise<ArrayBuffer> {
    this.check();
    const key = `${url}:${expected?.sha256 ?? ""}:${expected?.bytes ?? maxBytes}`;
    const existing = this.inflight.get(key); if (existing) return existing;
    const request = (async () => {
      this.stats.requests++; this.stats.pending++;
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        response = await fetch(url, { signal: this.abort.signal }); this.check();
        if (!response.ok) throw Error(`Tree HTTP ${response.status}: ${url}`);
        const advertised = Number(response.headers.get("content-length"));
        if (advertised > maxBytes) throw Error("Tree response exceeds budget");
        // Stream with a hard cap; Content-Length is not trusted.
        let buffer: ArrayBuffer;
        if (response.body) {
          reader = response.body.getReader();
          const chunks: Uint8Array[] = []; let length = 0;
          while (true) { const result = await reader.read(); this.check(); if (result.done) break; length += result.value.byteLength; if (length > maxBytes) throw Error("Tree response exceeds budget"); chunks.push(result.value); }
          const joined = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; } buffer = joined.buffer;
        } else { buffer = await response.arrayBuffer(); if (buffer.byteLength > maxBytes) throw Error("Tree response exceeds budget"); }
        this.check(); this.stats.bytesFetched += buffer.byteLength;
        if (expected) {
          if (buffer.byteLength !== expected.bytes) throw Error("Tree asset byte length mismatch");
          if (await assetSha256(buffer, this.signal) !== expected.sha256) throw Error("Tree asset SHA-256 mismatch");
          this.check();
        }
        return buffer;
      } catch (error) {
        // Odmítnutí hlaviček či opožděná odpověď po dispose vznikají ještě
        // před readerem. Rušíme jen toto tělo, nikdy sdílený abort jiných assetů.
        try {
          const cancellation = reader ? reader.cancel(error) : response?.body?.cancel(error);
          // Cancel uzavře stream synchronně; dokončení podkladového cleanupu
          // nesmí zadržet původní chybu ani další pokus na tutéž URL.
          void cancellation?.catch(() => {});
        } catch { /* Chyba úklidu nesmí nahradit původní selhání. */ }
        throw error;
      } finally {
        try { reader?.releaseLock(); } catch { /* best effort pro vadný stream adapter */ }
        this.stats.pending--;
      }
    })();
    this.inflight.set(key, request);
    // Promise handlers run after registration even when a fetch adapter throws
    // synchronously; rejected entries must never poison subsequent requests.
    void request.then(() => this.inflight.delete(key), () => this.inflight.delete(key));
    return request;
  }
  asset(file: TreeAssetFile) { return this.bytes(file.url, file.bytes, file); }
  async importLegacy(scene: Scene, file: TreeAssetFile, expected?: { materialNames: readonly string[]; treeIds: readonly string[] }): Promise<AssetContainer> {
    const glb = readTreeGlb(await this.asset(file)); this.check();
    if (expected) {
      const materialNames = glb.json.materials?.map((m: { name?: string }) => m.name) ?? [], names = glb.json.nodes.map((n: { name?: string }) => n.name);
      const ids = new Set(expected.treeIds);
      if (materialNames.length !== expected.materialNames.length || new Set(materialNames).size !== materialNames.length || expected.materialNames.some(name => !materialNames.includes(name)) || new Set(names).size !== names.length) throw Error("Legacy bootstrap material/node identity mismatch");
      for (const name of names) { const match = typeof name === "string" ? /^tree__(.+)__lod2__(bark|leaves)$/.exec(name) : null; if (!match || !ids.has(match[1])) throw Error("Unexpected legacy bootstrap tree node"); }
      if (expected.treeIds.some(id => !names.includes(`tree__${id}__lod2__bark`))) throw Error("Legacy bootstrap lacks source wood");
    }
    const loader = new GLTFFileLoader(), resources = new Set<{ dispose(...args: any[]): void }>();
    loader.onMeshLoaded = mesh => { mesh.setEnabled(false); resources.add(mesh); };
    loader.onMaterialLoaded = material => resources.add(material);
    loader.onTextureLoaded = texture => resources.add(texture);
    const cleanup = () => { for (const resource of resources) resource.dispose(); resources.clear(); };
    let rejectAbort: (reason: Error) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => { loader.dispose(); cleanup(); rejectAbort(abortError()); };
    this.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const imported = loader.loadAssetContainerAsync(scene, { json: glb.json, bin: glb.bin }, "", undefined, file.url);
      void imported.then(container => { if (this.disposed) container.dispose(); }, () => {});
      const container = await Promise.race([imported, aborted]); this.check();
      resources.clear(); return container;
    } catch (error) { cleanup(); throw error; }
    finally { this.signal.removeEventListener("abort", onAbort); loader.dispose(); }
  }
  dispose() { this.abort.abort(); }
}
