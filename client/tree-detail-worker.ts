import type { TreeAssetFile } from "../shared/tree-asset-types";
import { readTreeAssetBytes } from "./tree-asset-bytes";
import { prepareTreeDetail, treeDetailTransferList, type PreparedTreeDetail, type TreeDetailInput } from "./tree-detail-prepare";

export type TreeDetailRequest = { id: number } & ({ file: TreeAssetFile } | { prepare: TreeDetailInput });
export type TreeDetailReply = { id: number; bytesFetched: number } & (
  | { buffer: ArrayBuffer }
  | { prepared: PreparedTreeDetail }
  | { error: string }
);

// The scene owns this dedicated worker; termination aborts all its tasks.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TreeDetailRequest>) => void) | null;
  postMessage(message: TreeDetailReply, transfer?: Transferable[]): void;
};
const lifetime = new AbortController();

scope.onmessage = async ({ data }) => {
  const { id } = data;
  let bytesFetched = 0;
  try {
    const read = (file: TreeAssetFile) => readTreeAssetBytes(file.url, file.bytes, file, lifetime.signal, bytes => {
      bytesFetched += bytes;
    });
    if ("prepare" in data) {
      const prepared = await prepareTreeDetail(data.prepare, read);
      scope.postMessage({ id, bytesFetched, prepared }, treeDetailTransferList(prepared));
    } else {
      const buffer = await read(data.file);
      scope.postMessage({ id, bytesFetched, buffer }, [buffer]);
    }
  } catch (error) {
    scope.postMessage({ id, bytesFetched, error: error instanceof Error ? error.message : String(error) });
  }
};
