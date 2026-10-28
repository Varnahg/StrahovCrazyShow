import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmbeddingProfile, createOpenAIEmbedder } from "../server/rag-embeddings";
import { createVectorKnowledgeStore, migrateRagSchema } from "../server/rag-vector-store";
import { importRagCorpus } from "../server/rag-ingest";

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
export async function ragImportMain(args = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  const [command] = args, connectionString = env.RAG_DATABASE_URL;
  if (!connectionString || !["migrate", "status", "import"].includes(command)) throw new Error("rag-configuration-required");
  const controller = new AbortController();
  const cancel = () => controller.abort(); process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    if (command === "migrate") { if (args.length !== 1) throw new Error("invalid-arguments"); await migrateRagSchema({ connectionString }, controller.signal); return { schemaVersion: 1, migrated: true }; }
    if (command === "status") {
      if (args.length !== 1) throw new Error("invalid-arguments");
      const store = createVectorKnowledgeStore({ connectionString });
      try { return { active: await store.captureActive(controller.signal) }; } finally { await store.close(); }
    }
    const maxEmbeddingInputs = budget(args, "--max-inputs"), maxEmbeddingBytes = budget(args, "--max-bytes");
    const accepted = new Set([0, args.indexOf("--max-inputs"), args.indexOf("--max-inputs") + 1, args.indexOf("--max-bytes"), args.indexOf("--max-bytes") + 1]);
    args.forEach((value, i) => { if (!accepted.has(i) && !(value === "--retry-uncertain" && args.indexOf(value) === i)) throw new Error("invalid-arguments"); });
    if (!env.OPENAI_API_KEY?.trim()) throw new Error("embedding-key-required");
    const dimensions = env.OPENAI_EMBEDDING_DIMENSIONS === undefined ? undefined : Number(env.OPENAI_EMBEDDING_DIMENSIONS);
    const profile = createEmbeddingProfile({ model: env.OPENAI_EMBEDDING_MODEL?.trim() || undefined, dimensions });
    const datasets = await loadApprovedRagDatasets();
    const embedder = createOpenAIEmbedder({ apiKey: env.OPENAI_API_KEY.trim(), profile });
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
