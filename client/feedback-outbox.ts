import {
  FEEDBACK_LIMITS,
  validateFeedbackReport,
  type FeedbackReceipt,
  type FeedbackReport,
} from "../shared/feedback";

export interface FeedbackPending {
  report: FeedbackReport;
  image: Blob | null;
  bytes: number;
  queuedAtMs: number;
  attempts: number;
  nextAttemptAtMs: number;
  error?: string;
  blocked?: boolean;
}

/** The synchronous reducer runs in one read/write transaction, including capacity checks. */
export interface FeedbackStorage {
  list(): Promise<FeedbackPending[]>;
  change<T>(
    update: (entries: FeedbackPending[]) => {
      entries: FeedbackPending[];
      value: T;
    },
  ): Promise<T>;
  close?(): void;
}

export class FeedbackOutboxError extends Error {
  constructor(
    public readonly code: "storage" | "full" | "invalid" | "disposed",
  ) {
    super(code);
  }
}

export class IndexedDBFeedbackStorage implements FeedbackStorage {
  private connection: Promise<IDBDatabase> | undefined;
  private closed = false;

  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  private database(): Promise<IDBDatabase> {
    if (this.closed || !this.factory)
      return Promise.reject(new FeedbackOutboxError("storage"));
    return (this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open("strahov-feedback-v1", 1);
      let abandoned = false;
      request.onupgradeneeded = () =>
        request.result.createObjectStore("reports", { keyPath: "report.id" });
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        abandoned = true;
        reject(new FeedbackOutboxError("storage"));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (this.closed || abandoned) {
          db.close();
          reject(new FeedbackOutboxError("storage"));
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.connection = undefined;
        };
        resolve(db);
      };
    }).catch((error: unknown) => {
      this.connection = undefined;
      throw error;
    }));
  }

  async list(): Promise<FeedbackPending[]> {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("reports", "readonly");
      const request = tx.objectStore("reports").getAll();
      tx.oncomplete = () => resolve(request.result as FeedbackPending[]);
      tx.onerror = tx.onabort = () =>
        reject(tx.error ?? new FeedbackOutboxError("storage"));
    });
  }

  async change<T>(
    update: (entries: FeedbackPending[]) => {
      entries: FeedbackPending[];
      value: T;
    },
  ): Promise<T> {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("reports", "readwrite");
      const store = tx.objectStore("reports");
      const request = store.getAll();
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const previous = request.result as FeedbackPending[];
          const changed = update(previous);
          result = changed.value;
          const remaining = new Set(
            changed.entries.map((entry) => entry.report.id),
          );
          for (const entry of previous)
            if (!remaining.has(entry.report.id)) store.delete(entry.report.id);
          // Unchanged Blobs are not rewritten when another report changes state.
          for (const entry of changed.entries)
            if (!previous.includes(entry)) store.put(entry);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () =>
        reject(failure ?? tx.error ?? new FeedbackOutboxError("storage"));
    });
  }

  close() {
    this.closed = true;
    void this.connection?.then(
      (db) => db.close(),
      () => {},
    );
  }
}

export type FeedbackSubmitResult =
  | { state: "accepted"; receipt: FeedbackReceipt }
  | { state: "queued"; id: string };

export interface FeedbackOutboxOptions {
  storage?: FeedbackStorage;
  fetch?: typeof globalThis.fetch;
  online?: () => boolean;
  now?: () => number;
  events?: Pick<Window, "addEventListener" | "removeEventListener">;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}

const receiptFor = (value: unknown, id: string): FeedbackReceipt | null => {
  if (!value || typeof value !== "object") return null;
  const receipt = value as Partial<FeedbackReceipt>;
  return receipt.accepted === true &&
    receipt.id === id &&
    typeof receipt.receivedAtUTC === "string" &&
    /^\d{4}-\d\d-\d\dT/.test(receipt.receivedAtUTC) &&
    receipt.receivedAtUTC.length <= 32 &&
    Number.isFinite(Date.parse(receipt.receivedAtUTC))
    ? (receipt as FeedbackReceipt)
    : null;
};

/** Persistent, bounded delivery. An HTTP response is success only with the matching receipt. */
export class FeedbackOutbox {
  private readonly storage: FeedbackStorage;
  private readonly request: typeof globalThis.fetch;
  private readonly online: () => boolean;
  private readonly now: () => number;
  private readonly events: FeedbackOutboxOptions["events"];
  private readonly timeoutMs: number;
  private readonly delays: readonly number[];
  private readonly listeners = new Set<(accepted?: FeedbackReceipt) => void>();
  private readonly active = new Map<string, Promise<FeedbackReceipt | null>>();
  private readonly controllers = new Set<AbortController>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private startup: Promise<void> | undefined;
  private flushing: Promise<void> | undefined;
  private scheduleGeneration = 0;
  private readonly onOnline = () => {
    void this.flush().catch(() => this.publish());
  };

  constructor(options: FeedbackOutboxOptions = {}) {
    this.storage = options.storage ?? new IndexedDBFeedbackStorage();
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.online =
      options.online ?? (() => globalThis.navigator?.onLine !== false);
    this.now = options.now ?? Date.now;
    this.events =
      options.events ?? (typeof window !== "undefined" ? window : undefined);
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.delays = options.retryDelaysMs ?? [2_000, 10_000, 30_000, 120_000];
    this.events?.addEventListener("online", this.onOnline);
  }

  subscribe(listener: (accepted?: FeedbackReceipt) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Resume only reports previously submitted into persistent storage, even on an already-online reload. */
  start(): Promise<void> {
    this.assertAlive();
    return (this.startup ??= this.flush());
  }

  private publish(accepted?: FeedbackReceipt) {
    if (!this.disposed)
      for (const listener of this.listeners) listener(accepted);
  }
  private assertAlive() {
    if (this.disposed) throw new FeedbackOutboxError("disposed");
  }
  private async store<T>(work: () => Promise<T>): Promise<T> {
    this.assertAlive();
    try {
      return await work();
    } catch (error) {
      throw error instanceof FeedbackOutboxError
        ? error
        : new FeedbackOutboxError("storage");
    }
  }

  async list(): Promise<FeedbackPending[]> {
    return (await this.store(() => this.storage.list())).sort(
      (a, b) => a.queuedAtMs - b.queuedAtMs,
    );
  }

  async enqueue(
    report: FeedbackReport,
    image: Blob | null,
  ): Promise<FeedbackSubmitResult> {
    this.assertAlive();
    const validated = validateFeedbackReport(report);
    if (
      !validated.ok ||
      (report.capture.state === "ready"
        ? !image ||
          image.size === 0 ||
          image.size > FEEDBACK_LIMITS.imageBytes ||
          image.type !== report.capture.mimeType
        : image !== null)
    )
      throw new FeedbackOutboxError("invalid");
    const clean = validated.report;
    const entry: FeedbackPending = {
      report: clean,
      image,
      bytes: new Blob([JSON.stringify(clean)]).size + (image?.size ?? 0),
      queuedAtMs: this.now(),
      attempts: 0,
      nextAttemptAtMs: this.now(),
    };
    await this.store(() =>
      this.storage.change((entries) => {
        const existing = entries.find((item) => item.report.id === clean.id);
        if (existing) {
          // An existing identifier always retries its immutable stored envelope.
          if (
            JSON.stringify(existing.report) !== JSON.stringify(clean) ||
            existing.image?.size !== image?.size
          )
            throw new FeedbackOutboxError("invalid");
          return { entries, value: undefined };
        }
        if (
          entries.length >= FEEDBACK_LIMITS.pendingReports ||
          entries.reduce((sum, item) => sum + item.bytes, entry.bytes) >
            FEEDBACK_LIMITS.pendingBytes
        )
          throw new FeedbackOutboxError("full");
        return { entries: [...entries, entry], value: undefined };
      }),
    );
    this.publish();
    const receipt = this.online() ? await this.deliver(clean.id) : null;
    await this.schedule();
    return receipt
      ? { state: "accepted", receipt }
      : { state: "queued", id: clean.id };
  }

  /** Automatic attempts respect expiry, backoff and permanent HTTP rejection. */
  flush(): Promise<void> {
    this.assertAlive();
    if (this.flushing) return this.flushing;
    this.flushing = this.runFlush().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  private async runFlush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.online()) return;
    for (const entry of await this.list()) {
      if (this.disposed) return;
      if (this.eligible(entry) && entry.nextAttemptAtMs <= this.now())
        await this.deliver(entry.report.id);
    }
    await this.schedule();
  }

  /** Explicit retry may retry a rejected request, but never silently sends an expired report. */
  async retry(id?: string) {
    await this.store(() =>
      this.storage.change((entries) => ({
        entries: entries.map((entry) =>
          (!id || entry.report.id === id) &&
          !this.expired(entry) &&
          !this.active.has(entry.report.id)
            ? {
                ...entry,
                attempts: 0,
                nextAttemptAtMs: this.now(),
                blocked: false,
                error: undefined,
              }
            : entry,
        ),
        value: undefined,
      })),
    );
    this.publish();
    await this.flush();
  }

  async remove(id: string) {
    // Do not let a late failed request recreate a removed entry.
    await this.store(() =>
      this.storage.change((entries) => ({
        entries: entries.filter((entry) => entry.report.id !== id),
        value: undefined,
      })),
    );
    this.publish();
    await this.schedule();
  }

  expired(entry: FeedbackPending) {
    return this.now() - entry.queuedAtMs >= FEEDBACK_LIMITS.pendingAgeMs;
  }
  private eligible(entry: FeedbackPending) {
    return (
      !entry.blocked &&
      !this.expired(entry) &&
      entry.attempts <= this.delays.length
    );
  }

  private deliver(id: string): Promise<FeedbackReceipt | null> {
    const existing = this.active.get(id);
    if (existing) return existing;
    const delivery = this.runDelivery(id).finally(() => this.active.delete(id));
    this.active.set(id, delivery);
    return delivery;
  }

  private async runDelivery(id: string): Promise<FeedbackReceipt | null> {
    const entry = await this.store(() =>
      this.storage.change((entries) => {
        const found = entries.find((item) => item.report.id === id);
        if (
          !found ||
          !this.eligible(found) ||
          found.nextAttemptAtMs > this.now()
        )
          return { entries, value: null };
        const updated = { ...found, attempts: found.attempts + 1 };
        return {
          entries: entries.map((item) => (item === found ? updated : item)),
          value: updated,
        };
      }),
    );
    if (!entry || this.disposed || !this.online()) return null;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let error = "network";
    let blocked = false;
    let receipt: FeedbackReceipt | null = null;
    try {
      const body = new FormData();
      body.set("metadata", JSON.stringify(entry.report));
      if (entry.image)
        body.set(
          "screenshot",
          entry.image,
          "feedback." +
            ({ "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" }[
              entry.image.type
            ] ?? "bin"),
        );
      const response = await this.request("/api/feedback", {
        method: "POST",
        body,
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.ok) {
        receipt = receiptFor(await response.json().catch(() => null), id);
        error = "receipt";
      } else {
        error = "http-" + response.status;
        blocked = response.status >= 400 && response.status < 500;
      }
    } catch {
      error = controller.signal.aborted ? "timeout" : "network";
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
    if (this.disposed) return null;
    await this.store(() =>
      this.storage.change((entries) => ({
        entries: receipt
          ? entries.filter((item) => item.report.id !== id)
          : entries.map((item) =>
              item.report.id === id
                ? {
                    ...item,
                    error,
                    blocked,
                    nextAttemptAtMs:
                      this.now() + (this.delays[item.attempts - 1] ?? 0),
                  }
                : item,
            ),
        value: undefined,
      })),
    );
    this.publish(receipt ?? undefined);
    return receipt;
  }

  private async schedule() {
    const current = ++this.scheduleGeneration;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed || !this.online()) return;
    const entries = await this.list();
    if (this.disposed || current !== this.scheduleGeneration) return;
    const next = Math.min(
      ...entries
        .filter((entry) => this.eligible(entry))
        .map((entry) => entry.nextAttemptAtMs),
    );
    if (Number.isFinite(next)) {
      this.timer = setTimeout(
        () => {
          void this.flush().catch(() => this.publish());
        },
        Math.max(1, next - this.now()),
      );
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.scheduleGeneration;
    if (this.timer) clearTimeout(this.timer);
    for (const controller of this.controllers) controller.abort();
    this.events?.removeEventListener("online", this.onOnline);
    this.listeners.clear();
    this.storage.close?.();
  }
}
