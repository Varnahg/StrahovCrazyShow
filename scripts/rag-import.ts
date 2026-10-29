import { readFile, open, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmbeddingProfile, createOpenAIEmbedder } from "../server/rag-embeddings";
import { createVectorKnowledgeStore, migrateRagSchema } from "../server/rag-vector-store";
import { importRagCorpus, importDocumentChanges, parseDocumentChangeSet, type RagDocumentChangeSet } from "../server/rag-ingest";

export const RAG_CURRENT_FILES = ["server/data/silicon-hill-knowledge.json", "server/data/rag/silicon-hill.json", "server/data/rag/suz.json"] as const;
export const RAG_ARCHIVE_FILES = ["server/data/rag/silicon-hill-archive.json", "server/data/rag/suz-archive.json"] as const;
export async function loadApprovedRagDatasets(root = new URL("../", import.meta.url)) {
  const read = async (path: string): Promise<unknown> => JSON.parse(await readFile(new URL(path, root), "utf8"));
  return { currentDatasets: await Promise.all(RAG_CURRENT_FILES.map(read)), archiveDatasets: await Promise.all(RAG_ARCHIVE_FILES.map(read)) };
}
function budget(args: string[], name: string): number {
  const at = args.indexOf(name), text = args[at + 1];
  if (at < 0 || args.lastIndexOf(name) !== at || !/^\d+$/.test(text ?? "")) throw new Error("explicit-budget-required");
  const value = Number(text); if (!Number.isSafeInteger(value)) throw new Error("invalid-budget"); return value;
}
function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (index !== args.lastIndexOf(name) || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("invalid-arguments");
  return args[index + 1];
}
function argumentsOnly(args: string[], values: readonly string[], switches: readonly string[] = []) {
  const accepted = new Set([0]);
  for (const name of values) {
    if (option(args, name) !== undefined) { const i = args.indexOf(name); accepted.add(i); accepted.add(i + 1); }
  }
  for (const name of switches) {
    const i = args.indexOf(name); if (i < 0) continue;
    if (i !== args.lastIndexOf(name)) throw new Error("invalid-arguments"); accepted.add(i);
  }
  if (args.some((_value, index) => !accepted.has(index))) throw new Error("invalid-arguments");
}
export async function loadDocumentChangeFile(path: string): Promise<RagDocumentChangeSet> {
  const absolute = resolve(path), metadata = await lstat(absolute), maximum = 64 * 1024 * 1024;
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maximum) throw new Error("invalid-document-change-file");
  const handle = await open(absolute, "r");
  try {
    const pieces: Buffer[] = []; let size = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, maximum - size + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      if (size + bytesRead > maximum) throw new Error("document-change-file-too-large");
      pieces.push(chunk.subarray(0, bytesRead)); size += bytesRead;
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(pieces, size)));
    return parseDocumentChangeSet(value);
  } finally { await handle.close(); }
}
export async function ragImportMain(args = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  const [command] = args, connectionString = env.RAG_DATABASE_URL;
  if (!connectionString || !["migrate", "status", "import", "import-documents"].includes(command)) throw new Error("rag-configuration-required");
  const controller = new AbortController();
  const cancel = () => controller.abort(); process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    if (command === "migrate") {
      argumentsOnly(args, ["--reader-role", "--ingester-role"]);
      await migrateRagSchema({ connectionString, readerRole: option(args, "--reader-role") ?? (env.RAG_READER_ROLE?.trim() || undefined),
        ingesterRole: option(args, "--ingester-role") ?? (env.RAG_INGESTER_ROLE?.trim() || undefined) }, controller.signal);
      return { schemaVersion: 2, migrated: true };
    }
    if (command === "status") {
      argumentsOnly(args, ["--scope", "--as-of"]);
      const scope = option(args, "--scope"), asOf = option(args, "--as-of");
      if ((scope !== undefined && !["current", "archive"].includes(scope)) || (asOf !== undefined && scope !== "archive")) throw new Error("invalid-arguments");
      const store = createVectorKnowledgeStore({ connectionString });
      try {
        return scope === undefined ? { active: await store.captureActive(controller.signal) }
          : { search: await store.captureSearch(scope === "current" ? { kind: "current" } : { kind: "archive", ...(asOf === undefined ? {} : { asOf }) }, controller.signal) };
      } finally { await store.close(); }
    }
    const maxEmbeddingInputs = budget(args, "--max-inputs"), maxEmbeddingBytes = budget(args, "--max-bytes");
    argumentsOnly(args, ["--max-inputs", "--max-bytes", ...(command === "import-documents" ? ["--input"] : [])], ["--retry-uncertain"]);
    if (!env.OPENAI_API_KEY?.trim()) throw new Error("embedding-key-required");
    const dimensions = env.OPENAI_EMBEDDING_DIMENSIONS === undefined ? undefined : Number(env.OPENAI_EMBEDDING_DIMENSIONS);
    const profile = createEmbeddingProfile({ model: env.OPENAI_EMBEDDING_MODEL?.trim() || undefined, dimensions,
      ...(command === "import-documents" ? { inputVersion: "title-heading-text-v2" as const } : {}) });
    const embedder = createOpenAIEmbedder({ apiKey: env.OPENAI_API_KEY.trim(), profile });
    if (command === "import-documents") {
      const path = option(args, "--input"); if (!path) throw new Error("document-change-file-required");
      return await importDocumentChanges({ connectionString, changes: await loadDocumentChangeFile(path), embedder, maxEmbeddingInputs, maxEmbeddingBytes, retryUncertain: args.includes("--retry-uncertain"), signal: controller.signal });
    }
    const datasets = await loadApprovedRagDatasets();
    return await importRagCorpus({ connectionString, ...datasets, embedder, maxEmbeddingInputs, maxEmbeddingBytes, retryUncertain: args.includes("--retry-uncertain"), signal: controller.signal });
  } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void ragImportMain().then((result) => process.stdout.write(JSON.stringify(result) + "\n"), (error: unknown) => {
    // Never print a DB URL, API key, SQL values, raw upstream response or stack.
    const known = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[a-z-]{1,60}$/.test(error.code) ? error.code : "rag-command-failed";
    process.stderr.write(JSON.stringify({ error: known }) + "\n"); process.exitCode = 1;
  });
}
