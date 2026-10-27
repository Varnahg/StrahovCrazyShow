import { lstat, open, opendir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feedbackIdValid } from "../shared/feedback";
import {
  feedbackDiagnosticCode,
  resolveFeedbackLinearConfig,
} from "./feedback-config";

const stages = [
  "pending-config",
  "pending",
  "uploading",
  "uploaded",
  "creating",
  "verifying",
  "delivered",
  "blocked",
] as const;
type Stage = (typeof stages)[number];
const maximumDeliveryBytes = 16384,
  maximumEntries = 8192;

/** Čte pouze omezené delivery.json. Neotevírá reporty ani snímky a nepoužívá
 * FeedbackStore, protože jeho inicializace smí uklízet opuštěné staging soubory. */
async function readDelivery(file: string): Promise<unknown> {
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > maximumDeliveryBytes
  )
    throw Error("invalid-record");
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(maximumDeliveryBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const result = await handle.read(
        buffer,
        size,
        buffer.length - size,
        null,
      );
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    if (size > maximumDeliveryBytes) throw Error("invalid-record");
    return JSON.parse(buffer.subarray(0, size).toString("utf8"));
  } finally {
    await handle.close();
  }
}

export async function inspectFeedbackDelivery(
  directory: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuration = resolveFeedbackLinearConfig(env).diagnostic;
  const queue = {
    directory: "readable" as "readable" | "missing" | "unavailable",
    scannedEntries: 0,
    reports: 0,
    invalidRecords: 0,
    ignoredLinks: 0,
    truncated: false,
    stages: Object.fromEntries(stages.map((stage) => [stage, 0])) as Record<
      Stage,
      number
    >,
    errors: {} as Record<string, number>,
  };
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error("invalid-directory");
    const entries = await opendir(directory);
    for await (const entry of entries) {
      if (++queue.scannedEntries > maximumEntries) {
        queue.truncated = true;
        break;
      }
      if (!feedbackIdValid(entry.name)) continue;
      if (entry.isSymbolicLink()) {
        queue.ignoredLinks++;
        continue;
      }
      if (!entry.isDirectory()) continue;
      try {
        const value = await readDelivery(
          join(directory, entry.name, "delivery.json"),
        );
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw Error("invalid-record");
        const stage = (value as { stage?: unknown }).stage;
        if (typeof stage !== "string" || !stages.includes(stage as Stage))
          throw Error("invalid-record");
        const error = (value as { error?: unknown }).error;
        queue.reports++;
        queue.stages[stage as Stage]++;
        const code =
          error === undefined ? "none" : feedbackDiagnosticCode(error);
        queue.errors[code] = (queue.errors[code] ?? 0) + 1;
      } catch {
        queue.invalidRecords++;
      }
    }
  } catch (error) {
    queue.directory =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "missing"
        : "unavailable";
  }
  return {
    version: 1 as const,
    readOnly: true as const,
    apiVerified: false as const,
    queueSnapshot: "best-effort" as const,
    configuration,
    queue,
  };
}

export async function runFeedbackDiagnostics(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  write: (text: string) => void = (text) => process.stdout.write(text),
) {
  if (
    argv.length &&
    (argv.length !== 2 || argv[0] !== "--directory" || !argv[1]?.trim())
  ) {
    write(
      "Použití: node --import tsx server/feedback-diagnostics.ts [--directory CESTA]\n",
    );
    return 2;
  }
  const result = await inspectFeedbackDelivery(
    resolve(argv[1] ?? env.FEEDBACK_DIR ?? ".cache/feedback"),
    env,
  );
  write(JSON.stringify(result, null, 2) + "\n");
  return result.queue.directory === "unavailable"
    ? 2
    : !result.configuration.configured ||
        result.configuration.warnings.length ||
        result.queue.directory !== "readable" ||
        result.queue.stages.blocked ||
        result.queue.stages["pending-config"] ||
        result.queue.invalidRecords ||
        result.queue.ignoredLinks ||
        result.queue.truncated
      ? 1
      : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await runFeedbackDiagnostics(process.argv.slice(2));
  } catch {
    // Nepřeposílat stack, cestu nebo text výjimky z cizích provozních souborů.
    process.stderr.write("Diagnostiku feedbacku se nepodařilo dokončit.\n");
    process.exitCode = 2;
  }
}
