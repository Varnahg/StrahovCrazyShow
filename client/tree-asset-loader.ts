import { GLTFFileLoader } from "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { TreeAssetFile } from "../shared/tree-asset-types";
import { treeAssetUrl } from "../shared/tree-asset-types";
import { readTreeAssetBytes, treeLoadAborted as abortError } from "./tree-asset-bytes";
import type { TreeDetailReply, TreeDetailRequest } from "./tree-detail-worker";
import { prepareTreeDetail, type PreparedTreeDetail, type TreeDetailInput } from "./tree-detail-prepare";

import { MAX_BYTES, readTreeGlb } from "./tree-asset-decode";
export { readTreeGlb, decodeTreeRuntimeChunk, decodeTreePrototype, treePrototypeFoliageRanks, uniqueTreeSourceBytes } from "./tree-asset-decode";

class DetailWorkerUnavailable extends Error {}

/** One lifecycle owner. Only in-flight requests coalesce; completed buffers are
 * released to callers rather than retained in a second unbounded cache. */
export class TreeAssetLoader {
  private readonly abort = new AbortController();
  private readonly inflight = new Map<string, Promise<ArrayBuffer>>();
  private worker?: Worker;
  private workerFailed = false;
  private nextRequestId = 0;
  private readonly workerRequests = new Map<number, {
    resolve: (value: ArrayBuffer | PreparedTreeDetail) => void;
    reject: (error: Error) => void;
  }>();
  readonly stats = { requests: 0, bytesFetched: 0, pending: 0 };
  constructor(private readonly useDetailWorker = false) {}
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
    return this.request(url, maxBytes, expected);
  }
  private request(url: string, maxBytes: number, expected?: TreeAssetFile, useWorker = false): Promise<ArrayBuffer> {
    this.check();
    const key = `${url}:${expected?.sha256 ?? ""}:${expected?.bytes ?? maxBytes}`;
    const existing = this.inflight.get(key); if (existing) return existing;
    const request = (async () => {
      this.stats.requests++; this.stats.pending++;
      try {
        const read = () => readTreeAssetBytes(url, maxBytes, expected, this.signal, bytes => {
          this.stats.bytesFetched += bytes;
        });
        const worker = useWorker && expected ? this.detailWorker() : undefined;
        const buffer = await (worker && expected ? this.readInWorker(worker, expected).catch(error => {
          if (!(error instanceof DetailWorkerUnavailable)) throw error;
          // Preserve the original reservation and shared promise on transport failure.
          return read();
        }) : read());
        this.check();
        return buffer;
      } finally {
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
  detailAsset(file: TreeAssetFile) {
    return this.request(file.url, file.bytes, file, this.useDetailWorker);
  }
  async prepareDetail(input: TreeDetailInput, current = () => true) {
    this.check();
    if (!current()) return undefined;
    const worker = this.useDetailWorker ? this.detailWorker() : undefined;
    if (worker) {
      this.stats.requests += input.groups ? 2 : 1;
      this.stats.pending++;
      try {
        const detail = await this.sendToWorker(worker, { prepare: input });
        this.check();
        if (!current()) return undefined;
        if (detail instanceof ArrayBuffer) throw Error("Invalid prepared tree detail response");
        return { ...detail, worker: true };
      } catch (error) {
        if (!(error instanceof DetailWorkerUnavailable)) throw error;
      } finally {
        this.stats.pending--;
      }
    }
    this.check();
    if (!current()) return undefined;
    const detail = await prepareTreeDetail(input, file => this.asset(file), current);
    this.check();
    return detail && { ...detail, worker: false };
  }
  private detailWorker() {
    if (this.worker || this.workerFailed || typeof Worker === "undefined") return this.worker;
    try {
      const worker = new Worker(new URL("./tree-detail-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<TreeDetailReply>) => {
        if (this.worker !== worker || this.disposed) return;
        const request = this.workerRequests.get(data.id);
        if (!request) return;
        this.workerRequests.delete(data.id);
        this.stats.bytesFetched += data.bytesFetched;
        if ("error" in data) request.reject(Error(data.error));
        else request.resolve("prepared" in data ? data.prepared : data.buffer);
      };
      worker.onerror = event => {
        if (this.worker !== worker) return;
        event.preventDefault();
        this.stopWorker(new DetailWorkerUnavailable(event.message || "Tree detail worker failed"));
      };
      worker.onmessageerror = () => {
        if (this.worker === worker) this.stopWorker(new DetailWorkerUnavailable("Tree detail worker reply could not be read"));
      };
      return this.worker = worker;
    } catch {
      this.workerFailed = true;
      return undefined;
    }
  }
  private async readInWorker(worker: Worker, file: TreeAssetFile): Promise<ArrayBuffer> {
    const result = await this.sendToWorker(worker, { file });
    if (!(result instanceof ArrayBuffer)) throw Error("Invalid tree asset buffer response");
    return result;
  }
  private sendToWorker(worker: Worker, task: { file: TreeAssetFile } | { prepare: TreeDetailInput }): Promise<ArrayBuffer | PreparedTreeDetail> {
    const id = ++this.nextRequestId;
    return new Promise((resolve, reject) => {
      this.workerRequests.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, ...task } satisfies TreeDetailRequest);
      } catch (error) {
        this.stopWorker(new DetailWorkerUnavailable("Tree detail worker request could not be sent", { cause: error }));
      }
    });
  }
  private stopWorker(error: Error) {
    this.workerFailed = true;
    const worker = this.worker;
    this.worker = undefined;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
    }
    for (const request of this.workerRequests.values()) request.reject(error);
    this.workerRequests.clear();
  }
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
  dispose() {
    this.abort.abort();
    this.stopWorker(abortError());
  }
}
