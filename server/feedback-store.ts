import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  feedbackIdValid,
  validateFeedbackReport,
  type FeedbackReport,
  type FeedbackReceipt,
} from "../shared/feedback";

export interface FeedbackImage {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}
export interface FeedbackDelivery {
  stage:
    | "pending-config"
    | "pending"
    | "uploading"
    | "uploaded"
    | "creating"
    | "verifying"
    | "delivered"
    | "blocked";
  issueId: string;
  attempts: number;
  nextAttemptAt: number;
  createAttempted?: boolean;
  assetUrl?: string;
  issueUrl?: string;
  error?: string;
  deliveredAtUTC?: string;
}
export interface StoredFeedback {
  version: 1;
  report: FeedbackReport;
  receipt: FeedbackReceipt;
  hash: string;
  image?: { mimeType: string; width: number; height: number; bytes: number };
  delivery: FeedbackDelivery;
}
export class FeedbackStoreError extends Error {
  constructor(public readonly code: "conflict" | "capacity" | "corrupt") {
    super(code);
  }
}
export interface FeedbackStoreOptions {
  directory: string;
  now?: () => number;
  maxReports?: number;
  maxBytes?: number;
  maxFiles?: number;
  staleStagingMs?: number;
}
// Atomic rename is durable only after both the file and parent directory are synced.
// Windows cannot open a directory for fsync; files are still flushed there. The
// production Linux volume supports directory fsync. Never ignore Linux I/O errors.
async function syncDirectory(path: string) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (
      process.platform !== "win32" ||
      !["EPERM", "EISDIR", "EINVAL", "EACCES"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      throw error;
  } finally {
    await handle?.close();
  }
}
async function writeSynced(path: string, data: string | Buffer) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}
const json = (value: unknown) => JSON.stringify(value) + "\n";
const clone = <T>(value: T): T => structuredClone(value);
export function feedbackContentHash(
  report: FeedbackReport,
  image?: FeedbackImage,
) {
  const hash = createHash("sha256").update(JSON.stringify(report)).update("\0");
  if (image) hash.update(image.bytes);
  return hash.digest("hex");
}
export async function createFeedbackStore(options: FeedbackStoreOptions) {
  const directory = resolve(options.directory),
    now = options.now ?? Date.now;
  const maxReports = options.maxReports ?? 1000,
    maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 4096;
  const records = new Map<string, StoredFeedback>();
  let usedBytes = 0,
    usedFiles = 0;
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = tail.then(action);
    tail = result.catch(() => {});
    return result;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const entries = await readdir(directory, { withFileTypes: true });
  // Unknown files consume the same budget; acknowledged data is never evicted to
  // admit a newer report. A corrupt committed record blocks startup for repair.
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith(".staging-") && entry.isDirectory()) {
      if (
        now() - (await stat(path)).mtimeMs >
        (options.staleStagingMs ?? 3600000)
      ) {
        await rm(path, { recursive: true, force: true });
        continue;
      }
    }
    if (!entry.isDirectory() || !feedbackIdValid(entry.name)) {
      usedFiles++;
      usedBytes += (await stat(path)).size;
      if (entry.isDirectory())
        for (const file of await readdir(path)) {
          usedFiles++;
          usedBytes += (await stat(join(path, file))).size;
        }
      continue;
    }
    try {
      if (
        (await stat(join(path, "report.json"))).size > 131072 ||
        (await stat(join(path, "delivery.json"))).size > 16384
      )
        throw new Error("record-size");
      const record = JSON.parse(
        await readFile(join(path, "report.json"), "utf8"),
      ) as StoredFeedback;
      const delivery = JSON.parse(
        await readFile(join(path, "delivery.json"), "utf8"),
      ) as FeedbackDelivery;
      const validation = validateFeedbackReport(record.report);
      if (
        record.version !== 1 ||
        !validation.ok ||
        validation.report.id !== entry.name ||
        !/^[a-f0-9]{64}$/.test(record.hash) ||
        record.receipt?.id !== entry.name ||
        record.receipt.accepted !== true ||
        !Number.isFinite(Date.parse(record.receipt.receivedAtUTC)) ||
        !feedbackIdValid(delivery.issueId) ||
        !Number.isSafeInteger(delivery.attempts) ||
        delivery.attempts < 0 ||
        !Number.isFinite(delivery.nextAttemptAt) ||
        ![
          "pending-config",
          "pending",
          "uploading",
          "uploaded",
          "creating",
          "verifying",
          "delivered",
          "blocked",
        ].includes(delivery.stage)
      )
        throw new Error("record");
      if (record.image) {
        const size = (await stat(join(path, "image.bin"))).size;
        if (size !== record.image.bytes || size > 4 * 1024 * 1024)
          throw new Error("image");
      }
      const imageBytes = record.image
        ? await readFile(join(path, "image.bin"))
        : undefined;
      if (
        feedbackContentHash(
          record.report,
          record.image ? { ...record.image, bytes: imageBytes! } : undefined,
        ) !== record.hash
      )
        throw new Error("hash");
      record.delivery = delivery;
      records.set(entry.name, record);
      usedFiles++;
      for (const file of await readdir(path)) {
        // A crash during an atomic state update leaves an uncommitted temp.
        if (file.startsWith(".delivery-")) {
          await rm(join(path, file), { force: true });
          continue;
        }
        usedFiles++;
        usedBytes += (await stat(join(path, file))).size;
      }
    } catch {
      throw new FeedbackStoreError("corrupt");
    }
  }
  await syncDirectory(directory);
  return {
    directory,
    list: () => [...records.values()].map(clone),
    pending: (instant: number, includePendingConfig: boolean) =>
      [...records.values()]
        .filter(
          (record) =>
            !["delivered", "blocked"].includes(record.delivery.stage) &&
            (includePendingConfig ||
              record.delivery.stage !== "pending-config") &&
            record.delivery.nextAttemptAt <= instant,
        )
        .map(clone),
    get: (id: string) => {
      const record = records.get(id);
      return record ? clone(record) : undefined;
    },
    image: async (id: string) => {
      if (!records.get(id)?.image) return undefined;
      return readFile(join(directory, id, "image.bin"));
    },
    accept: (report: FeedbackReport, image?: FeedbackImage) =>
      exclusive(async () => {
        const hash = feedbackContentHash(report, image),
          existing = records.get(report.id);
        if (existing) {
          if (hash !== existing.hash) throw new FeedbackStoreError("conflict");
          await syncDirectory(directory);
          return clone(existing.receipt);
        }
        const record: StoredFeedback = {
          version: 1,
          report,
          hash,
          receipt: {
            accepted: true,
            id: report.id,
            receivedAtUTC: new Date(now()).toISOString(),
          },
          delivery: {
            stage: "pending",
            issueId: randomUUID(),
            attempts: 0,
            nextAttemptAt: 0,
          },
          ...(image
            ? {
                image: {
                  mimeType: image.mimeType,
                  width: image.width,
                  height: image.height,
                  bytes: image.bytes.length,
                },
              }
            : {}),
        };
        // Reserve room for growing delivery state as well as immutable payload.
        const size =
          Buffer.byteLength(json(record)) +
          Buffer.byteLength(json(record.delivery)) +
          (image?.bytes.length ?? 0);
        const files = image ? 4 : 3;
        if (
          records.size >= maxReports ||
          usedFiles + files + 1 > maxFiles ||
          usedBytes + size + (records.size + 1) * 16384 > maxBytes
        )
          throw new FeedbackStoreError("capacity");
        const staging = join(directory, `.staging-${randomUUID()}`),
          target = join(directory, report.id);
        await mkdir(staging, { mode: 0o700 });
        try {
          await writeSynced(join(staging, "report.json"), json(record));
          await writeSynced(
            join(staging, "delivery.json"),
            json(record.delivery),
          );
          if (image) await writeSynced(join(staging, "image.bin"), image.bytes);
          await syncDirectory(staging);
          await rename(staging, target);
          records.set(report.id, clone(record));
          usedBytes += size;
          usedFiles += files;
          await syncDirectory(directory);
          return clone(record.receipt);
        } catch (error) {
          await rm(staging, { recursive: true, force: true }).catch(() => {});
          throw error;
        }
      }),
    update: (id: string, delivery: FeedbackDelivery) =>
      exclusive(async () => {
        const record = records.get(id);
        if (!record) throw new FeedbackStoreError("corrupt");
        if (delivery.issueId !== record.delivery.issueId)
          throw new FeedbackStoreError("conflict");
        const body = json(delivery);
        if (Buffer.byteLength(body) > 16384)
          throw new FeedbackStoreError("capacity");
        const path = join(directory, id),
          temp = join(path, `.delivery-${randomUUID()}`);
        try {
          await writeSynced(temp, body);
          await rename(temp, join(path, "delivery.json"));
          await syncDirectory(path);
          usedBytes +=
            Buffer.byteLength(body) - Buffer.byteLength(json(record.delivery));
          record.delivery = clone(delivery);
        } finally {
          await rm(temp, { force: true }).catch(() => {});
        }
      }),
    close: async () => {
      await tail;
    },
  };
}
export type FeedbackStore = Awaited<ReturnType<typeof createFeedbackStore>>;
