import { Worker } from "node:worker_threads";
import type { Profile, Vec3 } from "../../shared/types";

export type Checkpoint = { position: Vec3; yaw: number };
export type Account = {
  id: string;
  profile: Profile | null;
  rewards: string[];
  checkpoint: Checkpoint | null;
};
export type Login = { id: string; expires: number; hash: string };

type Queries = {
  login: [(sub: string, hash: string, expires: number, previousHash?: string) => string];
  session: [(hash: string, now: number) => Omit<Login, "hash"> | null];
  revoke: [(hash: string) => void];
  prune: [(now: number) => void];
  account: [(id: string) => Account | undefined];
  profile: [(id: string, profile: Profile) => void];
  checkpoints: [(entries: [string, Checkpoint][]) => void];
  reward: [(ids: string[], name: string) => string[]];
  relationships: [() => {
    contacts: { a: string; b: string }[];
    blocks: { owner: string; target: string }[];
    names: { id: string; nickname: string }[];
  }];
  contact: [(from: string, to: string) => boolean];
  block: [(owner: string, target: string, enabled: boolean) => void];
};

export class AccountDatabase {
  private readonly worker: Worker;
  private readonly pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private serial = 0;
  private failed = false;
  readonly ready: Promise<void>;

  constructor(file: string) {
    this.worker = new Worker(new URL("./database-worker.mjs", import.meta.url), { workerData: file });
    this.ready = new Promise((resolve, reject) => {
      const fail = () => {
        this.failed = true;
        const error = new Error("account-storage-unavailable");
        reject(error);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      };
      this.worker.on("error", fail);
      this.worker.on("exit", fail);
      this.worker.on("message", ({ ready, serial, value, failed }) => {
        if (ready) return resolve();
        const pending = this.pending.get(serial);
        if (!pending) return;
        this.pending.delete(serial);
        if (failed) pending.reject(new Error("account-storage-unavailable"));
        else pending.resolve(value);
      });
    });
  }

  async run<K extends keyof Queries>(
    action: K,
    ...args: Parameters<Queries[K][0]>
  ): Promise<ReturnType<Queries[K][0]>> {
    await this.ready;
    if (this.failed || this.pending.size >= 1024) throw new Error("account-storage-unavailable");
    return new Promise((resolve, reject) => {
      const serial = ++this.serial;
      this.pending.set(serial, { resolve, reject });
      this.worker.postMessage({ serial, action, args });
    });
  }

  async close() { await this.worker.terminate(); }
}
