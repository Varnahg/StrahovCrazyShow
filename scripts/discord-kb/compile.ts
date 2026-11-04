import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCuratedKnowledgeDocumentV3 } from "../../server/rag-curation-contract";
import {
  createEmbeddingProfile,
  documentEmbeddingInputV3,
} from "../../server/rag-embeddings";
import { isPublicCurationText } from "../../shared/knowledge-curation";
import {
  canonicalRagJson,
  isRagDay,
  isRagText,
} from "../../shared/rag-provenance";
import type {
  CuratedKnowledgeMetadataV3,
  RagDocumentBundleV3,
} from "../../server/rag-knowledge-types";

export type CanonicalItem = Omit<
  CuratedKnowledgeMetadataV3,
  "archiveReason" | "versionNote" | "title" | "status"
> & {
  question: string;
  aliases: string[];
  answer: string;
  topic: string;
  kind: "qa" | "guide";
  reviewReceipt: string;
};
export type CanonicalKnowledge = {
  schemaVersion: 1;
  sourceInventorySha256: string;
  items: CanonicalItem[];
};
export type ItemReview = Readonly<{
  id: string;
  contentSha256: string;
  reviewer: string;
  decision: "accept";
  reviewedAt: string;
}>;
export type PublicationProof = Readonly<{
  reviewManifest: unknown;
  auditLedger: unknown;
  rawManifest: unknown;
  rawMessages: readonly unknown[];
}>;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function demand(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
const normalized = (text: string) =>
  text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("cs");
const shaPattern = /^[a-f0-9]{64}$/;
const hashJson = (value: unknown) => hash(canonicalRagJson(value));
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

/** A digest identifies reviewed content; it does not establish semantic truth. */
export function canonicalItemContentHash(item: CanonicalItem): string {
  return hashJson(
    Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== "reviewReceipt"),
    ),
  );
}
export function auditLedgerHash(ledger: unknown): string {
  return hashJson(ledger);
}
/** Only the reviewer/coordinator issues this after an explicit content review. */
export function reviewReceiptFor(
  review: ItemReview,
  sourceInventorySha256: string,
  auditLedgerSha256: string,
): string {
  return hashJson([
    "discord-kb-review-v1",
    sourceInventorySha256,
    auditLedgerSha256,
    review,
  ]);
}

/** Read-only proof check. Private messages, filenames and reviewer names never enter bundles. */
export function validatePublicationProof(
  dataset: CanonicalKnowledge,
  proof: PublicationProof,
): void {
  demand(record(proof), "publication-proof-required");
  const raw = proof.rawManifest;
  demand(
    record(raw) &&
      raw.schemaVersion === 1 &&
      typeof raw.sourceManifestSha256 === "string" &&
      raw.sourceManifestSha256 === dataset.sourceInventorySha256 &&
      Array.isArray(raw.files) &&
      Array.isArray(raw.exports) &&
      record(raw.counts) &&
      Array.isArray(proof.rawMessages),
    "invalid-raw-proof",
  );
  demand(
    hashJson(raw.files) === raw.sourceManifestSha256,
    "source-inventory-mismatch",
  );
  const files = new Map<string, Record<string, unknown>>();
  for (const file of raw.files) {
    demand(
      record(file) &&
        exactKeys(file, ["file", "bytes", "sha256"]) &&
        isRagText(file.file, 1000) &&
        Number.isSafeInteger(file.bytes) &&
        (file.bytes as number) >= 0 &&
        typeof file.sha256 === "string" &&
        shaPattern.test(file.sha256) &&
        !files.has(file.file),
      "invalid-source-inventory",
    );
    files.set(file.file, file);
  }
  const exports = new Map<string, Record<string, unknown>>();
  for (const source of raw.exports) {
    demand(
      record(source) &&
        isRagText(source.file, 1000) &&
        !exports.has(source.file) &&
        typeof source.sha256 === "string" &&
        files.get(source.file)?.sha256 === source.sha256 &&
        isRagText(source.sourceId, 200) &&
        source.countsMatch === true &&
        Number.isSafeInteger(source.actualMessageCount) &&
        (source.actualMessageCount as number) >= 0 &&
        source.declaredMessageCount === source.actualMessageCount,
      "invalid-export-inventory",
    );
    exports.set(source.file, source);
  }
  demand(
    exports.size > 0 &&
      raw.counts.files === files.size &&
      raw.counts.htmlExports === exports.size,
    "invalid-export-counts",
  );
  const messages = new Map<string, string>();
  const ordinals = new Map(
    [...exports.keys()].map((file) => [file, new Set<number>()]),
  );
  for (const message of proof.rawMessages) {
    demand(
      record(message) &&
        typeof message.messageId === "string" &&
        /^\d{1,20}$/.test(message.messageId) &&
        !messages.has(message.messageId) &&
        typeof message.sourceFile === "string" &&
        exports.has(message.sourceFile) &&
        Number.isSafeInteger(message.ordinal) &&
        (message.ordinal as number) >= 0,
      "invalid-raw-message",
    );
    const source = exports.get(message.sourceFile)!;
    const seen = ordinals.get(message.sourceFile)!;
    demand(
      message.sourceSha256 === source.sha256 &&
        message.sourceId === source.sourceId &&
        (message.ordinal as number) < (source.actualMessageCount as number) &&
        !seen.has(message.ordinal as number),
      "raw-message-source-mismatch",
    );
    seen.add(message.ordinal as number);
    messages.set(message.messageId, message.sourceFile);
  }
  demand(
    raw.counts.messages === messages.size &&
      raw.counts.uniqueMessageIds === messages.size &&
      [...exports].every(
        ([file, source]) =>
          ordinals.get(file)!.size === source.actualMessageCount,
      ),
    "raw-message-count-mismatch",
  );

  const ledger = proof.auditLedger;
  demand(
    record(ledger) &&
      exactKeys(ledger, [
        "version",
        "sourceInventorySha256",
        "reviewedFiles",
      ]) &&
      ledger.version === 1 &&
      ledger.sourceInventorySha256 === dataset.sourceInventorySha256 &&
      Array.isArray(ledger.reviewedFiles),
    "invalid-final-ledger",
  );
  const canonicalIds = new Set(dataset.items.map((item) => item.id));
  const referencedIds = new Set<string>(),
    classified = new Set<string>(),
    reviewedFiles = new Set<string>();
  const terminal = new Set([
    "used",
    "duplicate",
    "system",
    "excluded",
    "insufficient-context",
  ]);
  for (const source of ledger.reviewedFiles) {
    demand(
      record(source) &&
        exactKeys(source, ["fileName", "dispositions"]) &&
        typeof source.fileName === "string" &&
        exports.has(source.fileName) &&
        !reviewedFiles.has(source.fileName) &&
        Array.isArray(source.dispositions),
      "invalid-reviewed-file",
    );
    reviewedFiles.add(source.fileName);
    for (const row of source.dispositions) {
      demand(
        record(row) &&
          exactKeys(row, ["messageId", "status", "itemIds", "reason"]) &&
          typeof row.messageId === "string" &&
          messages.get(row.messageId) === source.fileName &&
          !classified.has(row.messageId) &&
          typeof row.status === "string" &&
          terminal.has(row.status) &&
          isRagText(row.reason, 4000) &&
          Array.isArray(row.itemIds) &&
          row.itemIds.every(
            (id): id is string =>
              typeof id === "string" && canonicalIds.has(id),
          ) &&
          new Set(row.itemIds).size === row.itemIds.length,
        "invalid-disposition",
      );
      const used = row.status === "used" || row.status === "duplicate";
      demand(
        used ? row.itemIds.length > 0 : row.itemIds.length === 0,
        "invalid-canonical-reference",
      );
      row.itemIds.forEach((id) => referencedIds.add(id));
      classified.add(row.messageId);
    }
  }
  demand(
    classified.size === messages.size &&
      reviewedFiles.size === exports.size &&
      referencedIds.size === canonicalIds.size,
    "incomplete-publication-audit",
  );

  const reviews = proof.reviewManifest;
  const ledgerSha = auditLedgerHash(ledger);
  demand(
    record(reviews) &&
      exactKeys(reviews, [
        "version",
        "sourceInventorySha256",
        "auditLedgerSha256",
        "items",
      ]) &&
      reviews.version === 1 &&
      reviews.sourceInventorySha256 === dataset.sourceInventorySha256 &&
      reviews.auditLedgerSha256 === ledgerSha &&
      Array.isArray(reviews.items) &&
      reviews.items.length === dataset.items.length,
    "invalid-review-manifest",
  );
  const byId = new Map(dataset.items.map((item) => [item.id, item]));
  const reviewedIds = new Set<string>();
  for (const review of reviews.items) {
    demand(
      record(review) &&
        exactKeys(review, [
          "id",
          "contentSha256",
          "reviewer",
          "decision",
          "reviewedAt",
        ]) &&
        typeof review.id === "string" &&
        byId.has(review.id) &&
        !reviewedIds.has(review.id) &&
        typeof review.contentSha256 === "string" &&
        shaPattern.test(review.contentSha256) &&
        isRagText(review.reviewer, 200) &&
        review.decision === "accept" &&
        isRagDay(review.reviewedAt),
      "unaccepted-item-review",
    );
    const item = byId.get(review.id)!;
    demand(
      review.reviewedAt === item.reviewedAt &&
        review.contentSha256 === canonicalItemContentHash(item) &&
        item.reviewReceipt ===
          reviewReceiptFor(
            review as ItemReview,
            dataset.sourceInventorySha256,
            ledgerSha,
          ),
      "review-content-mismatch",
    );
    reviewedIds.add(review.id);
  }
}
const itemKeys = new Set([
  "id",
  "itemId",
  "question",
  "aliases",
  "answer",
  "topic",
  "kind",
  "verification",
  "applicability",
  "reviewedAt",
  "reviewAfter",
  "factCheckedAt",
  "observedFrom",
  "observedUntil",
  "limitations",
  "supportingRefs",
  "reviewReceipt",
]);

export function knowledgeUnitText(item: CanonicalItem): string {
  return [
    `Otázka: ${item.question}`,
    ...(item.aliases.length
      ? [`Další formulace: ${item.aliases.join("; ")}`]
      : []),
    `Odpověď: ${item.answer}`,
    `Platí pro: ${item.applicability}`,
  ].join("\n\n");
}
function metadata(item: CanonicalItem): CuratedKnowledgeMetadataV3 {
  return {
    id: item.id,
    itemId: item.itemId,
    title: item.question,
    status: "current",
    verification: item.verification,
    applicability: item.applicability,
    reviewedAt: item.reviewedAt,
    reviewAfter: item.reviewAfter,
    factCheckedAt: item.factCheckedAt,
    observedFrom: item.observedFrom,
    observedUntil: item.observedUntil,
    limitations: item.limitations,
    supportingRefs: item.supportingRefs,
    archiveReason: null,
    versionNote:
      "Kurátorovaná a anonymizovaná znalost; původní zprávy jsou pouze v neveřejném auditu.",
  };
}

/** Structural/provenance validation only; publication additionally requires validatePublicationProof. */
export function validateCanonicalKnowledge(value: unknown): CanonicalKnowledge {
  demand(
    record(value) &&
      Object.keys(value).sort().join(",") ===
        "items,schemaVersion,sourceInventorySha256" &&
      value.schemaVersion === 1 &&
      typeof value.sourceInventorySha256 === "string" &&
      /^[a-f0-9]{64}$/.test(value.sourceInventorySha256) &&
      Array.isArray(value.items) &&
      value.items.length > 0 &&
      value.items.length <= 1024,
    "invalid-canonical-dataset",
  );
  const ids = new Set<string>(),
    meanings = new Set<string>();
  for (const raw of value.items) {
    demand(
      record(raw) &&
        Object.keys(raw).length === itemKeys.size &&
        Object.keys(raw).every((key) => itemKeys.has(key)),
      "invalid-item-keys",
    );
    demand(
      isPublicCurationText(raw.question, 200) &&
        isPublicCurationText(raw.answer, 6000) &&
        isPublicCurationText(raw.topic, 100) &&
        ["qa", "guide"].includes(String(raw.kind)) &&
        Array.isArray(raw.aliases) &&
        raw.aliases.length <= 4 &&
        raw.aliases.every((alias) => isPublicCurationText(alias, 200)) &&
        typeof raw.reviewReceipt === "string" &&
        /^[a-f0-9]{64}$/.test(raw.reviewReceipt),
      "invalid-reviewed-item",
    );
    const item = raw as unknown as CanonicalItem;
    demand(!ids.has(item.id), "duplicate-item-id");
    ids.add(item.id);
    const meaning = JSON.stringify([
      normalized(item.question),
      normalized(item.applicability),
      item.verification,
    ]);
    demand(!meanings.has(meaning), "duplicate-canonical-question");
    meanings.add(meaning);
    demand(
      new Set(item.aliases.map(normalized)).size === item.aliases.length &&
        !item.aliases.map(normalized).includes(normalized(item.question)),
      "duplicate-alias",
    );
    // Full provenance validation is reused; the measured token count is supplied at compilation.
    buildCuratedKnowledgeDocumentV3(metadata(item), {
      text: knowledgeUnitText(item),
      headingPath: [item.topic],
      tokenCount: 1,
    });
  }
  return structuredClone(value) as CanonicalKnowledge;
}

export function compileKnowledge(
  value: unknown,
  countTokens: (inputs: readonly string[]) => readonly number[],
  proof: PublicationProof,
) {
  const dataset = validateCanonicalKnowledge(value);
  validatePublicationProof(dataset, proof);
  dataset.items.sort((a, b) => a.id.localeCompare(b.id, "en"));
  const inputs = dataset.items.map((item) =>
    JSON.stringify([item.question, [item.topic], knowledgeUnitText(item)]),
  );
  const counts = countTokens(inputs);
  demand(
    counts.length === inputs.length &&
      counts.every((n) => Number.isSafeInteger(n) && n > 0 && n <= 650),
    "embedding-token-budget",
  );
  const bundles = dataset.items.map((item, index) =>
    buildCuratedKnowledgeDocumentV3(metadata(item), {
      text: knowledgeUnitText(item),
      headingPath: [item.topic],
      tokenCount: counts[index],
    }),
  );
  const profile = createEmbeddingProfile({
    inputVersion: "title-heading-text-v2",
  });
  for (let i = 0; i < bundles.length; i++)
    demand(
      documentEmbeddingInputV3(
        bundles[i].document,
        bundles[i].chunks[0],
        profile,
      ) === inputs[i],
      "embedding-input-mismatch",
    );
  const manifest = {
    schemaVersion: 1,
    sourceInventorySha256: dataset.sourceInventorySha256,
    canonicalSha256: hash(JSON.stringify(dataset)),
    auditLedgerSha256: auditLedgerHash(proof.auditLedger),
    reviewManifestSha256: hashJson(proof.reviewManifest),
    unitCount: bundles.length,
    verificationCounts: {
      official: dataset.items.filter(
        (item) => item.verification === "verified-official",
      ).length,
      community: dataset.items.filter(
        (item) => item.verification === "community-experience",
      ).length,
    },
    embedding: {
      model: "text-embedding-3-large",
      dimensions: 3072,
      inputVersion: "title-heading-text-v2",
      inputs: inputs.length,
      bytes: inputs.reduce((n, s) => n + Buffer.byteLength(s), 0),
      tokens: counts.reduce((a, b) => a + b, 0),
    },
    units: bundles.map((bundle, index) => ({
      id: bundle.document.id,
      sourceVersionId: bundle.document.sourceVersionId,
      inputSha256: hash(inputs[index]),
      tokenCount: counts[index],
      reviewReceipt: dataset.items[index].reviewReceipt,
    })),
  };
  return {
    dataset,
    bundles,
    manifest,
    markdown: renderKnowledgeMarkdown(dataset),
  };
}

function markdownText(text: string) {
  return text.replace(/[<>]/g, (char) => (char === "<" ? "&lt;" : "&gt;"));
}
export function renderKnowledgeMarkdown(dataset: CanonicalKnowledge): string {
  const groups = new Map<string, CanonicalItem[]>();
  for (const item of dataset.items)
    groups.set(item.topic, [...(groups.get(item.topic) ?? []), item]);
  const lines = [
    "# Znalosti z konverzací o Strahově",
    "",
    "Generováno z kanonického datasetu. Oficiální pravidla a komunitní zkušenosti jsou rozlišeny u každé položky.",
    "",
  ];
  for (const [topic, items] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b, "cs"),
  )) {
    lines.push(`## ${markdownText(topic)}`, "");
    for (const item of items) {
      lines.push(
        `### ${markdownText(item.question)}`,
        "",
        markdownText(item.answer),
        "",
        `**Platí pro:** ${markdownText(item.applicability)}`,
        "",
      );
      lines.push(
        item.verification === "community-experience"
          ? `**Komunitní zkušenost — nezávisle neověřeno.** Období: ${item.observedFrom} až ${item.observedUntil}.`
          : `**Doloženo oficiálními zdroji.** Ověření tvrzení: ${item.factCheckedAt}.`,
        "",
      );
      for (const limitation of item.limitations)
        lines.push(`- ${markdownText(limitation)}`);
      if (item.limitations.length) lines.push("");
      for (const ref of item.supportingRefs)
        lines.push(
          `- [${markdownText(ref.title).replace(/[\[\]]/g, "")}](<${ref.url}>) — ${markdownText(ref.locator)}; ověřeno ${ref.factCheckedAt}.`,
        );
      lines.push(
        "",
        `Kontrola kurace: ${item.reviewedAt}; další kontrola: ${item.reviewAfter}.`,
        "",
      );
    }
  }
  return lines.join("\n");
}

export function changesForSnapshot(
  bundles: readonly RagDocumentBundleV3[],
  expectedSnapshotId: string | null,
) {
  demand(
    expectedSnapshotId === null || /^[a-f0-9]{64}$/.test(expectedSnapshotId),
    "invalid-snapshot",
  );
  return {
    collection: "current",
    expectedSnapshotId,
    upserts: bundles,
    retireSourceVersionIds: [],
    legacyReplacements: [],
    restoreLegacySourceVersionIds: [],
  };
}

async function main(args: string[]) {
  const option = (key: string) => {
    const index = args.indexOf(key);
    demand(
      index >= 0 && args.lastIndexOf(key) === index && args[index + 1],
      "missing-argument",
    );
    return args[index + 1];
  };
  const input = resolve(option("--input")),
    output = resolve(option("--output-directory")),
    python = resolve(option("--python")),
    cache = resolve(option("--tokenizer-cache")),
    rawDirectory = resolve(option("--raw-directory"));
  const raw: unknown = JSON.parse(await readFile(input, "utf8"));
  const proof: PublicationProof = {
    reviewManifest: JSON.parse(
      await readFile(resolve(option("--review-manifest")), "utf8"),
    ),
    auditLedger: JSON.parse(
      await readFile(resolve(option("--audit-ledger")), "utf8"),
    ),
    rawManifest: JSON.parse(
      await readFile(resolve(rawDirectory, "manifest.json"), "utf8"),
    ),
    rawMessages: (
      await readFile(resolve(rawDirectory, "messages.ndjson"), "utf8")
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
  const result = compileKnowledge(
    raw,
    (inputs) => {
      const child = spawnSync(
        python,
        [
          "-B",
          resolve(dirname(fileURLToPath(import.meta.url)), "audit.py"),
          "tokens",
          "--cache",
          cache,
        ],
        {
          input: JSON.stringify(inputs),
          encoding: "utf8",
          windowsHide: true,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        },
      );
      demand(child.status === 0, "tokenizer-failed");
      const counts: unknown = JSON.parse(child.stdout);
      demand(Array.isArray(counts), "invalid-tokenizer-result");
      return counts as number[];
    },
    proof,
  );
  await mkdir(output, { recursive: true });
  for (const [name, text] of [
    ["documents.json", JSON.stringify(result.bundles, null, 2) + "\n"],
    ["manifest.json", JSON.stringify(result.manifest, null, 2) + "\n"],
    ["knowledge.md", result.markdown],
  ] as const)
    await writeFile(resolve(output, name), text, {
      encoding: "utf8",
      flag: "wx",
    });
  process.stdout.write(JSON.stringify(result.manifest) + "\n");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main(process.argv.slice(2)).catch(() => {
    process.stderr.write('{"error":"knowledge-compile-failed"}\n');
    process.exitCode = 1;
  });
