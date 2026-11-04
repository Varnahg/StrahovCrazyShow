import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalRagJson } from "../shared/rag-provenance";
import {
  compileKnowledge,
  validateCanonicalKnowledge,
  changesForSnapshot,
  canonicalItemContentHash,
  auditLedgerHash,
  reviewReceiptFor,
  type PublicationProof,
  type CanonicalKnowledge,
} from "../scripts/discord-kb/compile";

function fixture(): CanonicalKnowledge {
  return {
    schemaVersion: 1,
    sourceInventorySha256: "a".repeat(64),
    items: [
      {
        id: "laundry-planning-b-six",
        itemId: "laundry-planning",
        question: "Jak naplánovat praní na bloku 6?",
        aliases: ["How can I plan laundry in block 6?"],
        answer:
          "Obyvatelé doporučovali naplánovat praní předem. Jde o datovanou zkušenost, nikoli garanci volné pračky.",
        topic: "Praní",
        kind: "qa",
        verification: "community-experience",
        applicability: "Blok 6; plánování, nikoli živá dostupnost.",
        reviewedAt: "2026-11-03",
        reviewAfter: "2027-02-01",
        factCheckedAt: null,
        observedFrom: "2025-10-01",
        observedUntil: "2025-10-31",
        limitations: ["Dostupnost je nutné ověřit v rezervačním systému."],
        supportingRefs: [],
        reviewReceipt: "b".repeat(64),
      },
    ],
  };
}

function proofFor(dataset: CanonicalKnowledge): PublicationProof {
  const files = [
    { file: "empty.html", bytes: 0, sha256: "0".repeat(64) },
    { file: "messages.html", bytes: 123, sha256: "1".repeat(64) },
  ];
  const inventory = createHash("sha256")
    .update(canonicalRagJson(files))
    .digest("hex");
  dataset.sourceInventorySha256 = inventory;
  const rawMessages = dataset.items.map((_, ordinal) => ({
    messageId: String(1000 + ordinal),
    sourceFile: "messages.html",
    sourceId: "message-export",
    sourceSha256: files[1].sha256,
    ordinal,
    text: "PRIVATE RAW MUST NOT ESCAPE",
  }));
  const rawManifest = {
    schemaVersion: 1,
    sourceManifestSha256: inventory,
    files,
    exports: files.map((file, index) => ({
      ...file,
      sourceId: index ? "message-export" : "empty-export",
      countsMatch: true,
      actualMessageCount: index ? dataset.items.length : 0,
      declaredMessageCount: index ? dataset.items.length : 0,
    })),
    counts: {
      files: 2,
      htmlExports: 2,
      messages: rawMessages.length,
      uniqueMessageIds: rawMessages.length,
    },
  };
  const ledger = {
    version: 1,
    sourceInventorySha256: inventory,
    reviewedFiles: [
      { fileName: "empty.html", dispositions: [] },
      {
        fileName: "messages.html",
        dispositions: rawMessages.map((row, i) => ({
          messageId: row.messageId,
          status: "used",
          itemIds: [dataset.items[i].id],
          reason: "Synthetic reviewed evidence.",
        })),
      },
    ],
  };
  const ledgerHash = auditLedgerHash(ledger);
  const reviews = dataset.items.map((item) => ({
    id: item.id,
    contentSha256: canonicalItemContentHash(item),
    reviewer: "private-synthetic-reviewer",
    decision: "accept" as const,
    reviewedAt: item.reviewedAt,
  }));
  dataset.items = dataset.items.map((item, i) => ({
    ...item,
    reviewReceipt: reviewReceiptFor(reviews[i], inventory, ledgerHash),
  }));
  return {
    rawManifest,
    rawMessages,
    auditLedger: ledger,
    reviewManifest: {
      version: 1,
      sourceInventorySha256: inventory,
      auditLedgerSha256: ledgerHash,
      items: reviews,
    },
  };
}

test("one canonical item produces one self-contained Q/A embedding and one derived Markdown answer", () => {
  const dataset = fixture();
  const proof = proofFor(dataset);
  let measured: readonly string[] = [];
  const result = compileKnowledge(
    dataset,
    (inputs) => {
      measured = inputs;
      return [110];
    },
    proof,
  );
  assert.equal(result.bundles.length, 1);
  assert.equal(result.bundles[0].chunks[0].tokenCount, 110);
  assert.match(measured[0], /Otázka:/);
  assert.match(measured[0], /Odpověď:/);
  assert.match(measured[0], /Blok 6/);
  assert.match(result.markdown, /nezávisle neověřeno/);
  assert.match(result.markdown, /2025-10-01 až 2025-10-31/);
  assert.equal(result.manifest.unitCount, 1);
  assert.equal(result.manifest.embedding.inputs, 1);
  assert.deepEqual(
    changesForSnapshot(result.bundles, null).upserts,
    result.bundles,
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE RAW MUST NOT ESCAPE|private-synthetic-reviewer/,
  );
});

test("canonical gate rejects missing review, private audit fields and raw chat identifiers", () => {
  for (const mutate of [
    (item: any) => {
      item.reviewReceipt = "pending";
    },
    (item: any) => {
      item.sourceMessageIds = ["123456789012345678"];
    },
    (item: any) => {
      item.answer = "Podrobnosti: https://discord.com/channels/1/2/3";
    },
    (item: any) => {
      item.answer = "Zpráva 123456789012345678";
    },
    (item: any) => {
      item.factCheckedAt = "2026-11-03";
    },
  ]) {
    const input = fixture();
    mutate(input.items[0]);
    assert.throws(() => validateCanonicalKnowledge(input));
  }
});

test("exact duplicate intent within same scope fails; block-specific variants remain separate", () => {
  const input = fixture();
  input.items.push({
    ...structuredClone(input.items[0]),
    id: "duplicate",
    question: "  JAK naplánovat praní na bloku 6?  ",
  });
  const firstProof = proofFor(input);
  assert.throws(
    () => compileKnowledge(input, () => [110, 110], firstProof),
    /duplicate-canonical-question/,
  );
  input.items[1] = {
    ...input.items[1],
    question: "Jak naplánovat praní na bloku 9?",
    applicability: "Blok 9; samostatná zkušenost.",
  };
  assert.equal(
    compileKnowledge(input, () => [110, 110], proofFor(input)).bundles.length,
    2,
  );
});

test("over-budget knowledge units fail before publishing rather than silently cutting answers", () => {
  const input = fixture(),
    proof = proofFor(input);
  assert.throws(
    () => compileKnowledge(input, () => [651], proof),
    /embedding-token-budget/,
  );
  assert.throws(
    () => compileKnowledge(input, () => [], proof),
    /embedding-token-budget/,
  );
  assert.throws(
    () => compileKnowledge(input, () => [NaN], proof),
    /embedding-token-budget/,
  );
});

test("curator-review metadata changes version while preserving exact embedding text", () => {
  const input = fixture();
  const initial = compileKnowledge(input, () => [110], proofFor(input));
  const changed = fixture();
  changed.items[0] = { ...changed.items[0], reviewedAt: "2026-11-04" };
  const next = compileKnowledge(changed, () => [110], proofFor(changed));
  assert.notEqual(
    initial.bundles[0].document.sourceVersionId,
    next.bundles[0].document.sourceVersionId,
  );
  assert.equal(
    initial.manifest.units[0].inputSha256,
    next.manifest.units[0].inputSha256,
  );
  assert.equal(next.dataset.items[0].observedUntil, "2025-10-31");
});

test("a reviewed receipt cannot authorize changed content, scope, evidence or inventory", () => {
  for (const change of [
    (d: CanonicalKnowledge) => {
      d.items[0] = { ...d.items[0], answer: "Never reviewed replacement." };
    },
    (d: CanonicalKnowledge) => {
      d.items[0] = { ...d.items[0], applicability: "A different block." };
    },
    (d: CanonicalKnowledge) => {
      d.items[0] = { ...d.items[0], observedUntil: "2026-01-01" };
    },
    (d: CanonicalKnowledge) => {
      d.sourceInventorySha256 = "d".repeat(64);
    },
  ]) {
    const input = fixture(),
      proof = proofFor(input);
    change(input);
    let called = false;
    assert.throws(() =>
      compileKnowledge(
        input,
        () => {
          called = true;
          return [110];
        },
        proof,
      ),
    );
    assert.equal(called, false);
  }
});

test("publication proof rejects incomplete, pending, incorrectly attributed or dangling ledger entries before tokenization", () => {
  for (const change of [
    (p: any) => {
      p.auditLedger.reviewedFiles.pop();
    },
    (p: any) => {
      p.auditLedger.reviewedFiles.shift();
    }, // Required empty export.
    (p: any) => {
      p.auditLedger.reviewedFiles[1].dispositions[0].status = "pending";
    },
    (p: any) => {
      p.auditLedger.reviewedFiles[1].dispositions[0].itemIds = ["missing-item"];
    },
    (p: any) => {
      p.auditLedger.reviewedFiles[1].dispositions[0].reason = "";
    },
    (p: any) => {
      p.auditLedger.reviewedFiles[0].dispositions =
        p.auditLedger.reviewedFiles[1].dispositions;
      p.auditLedger.reviewedFiles[1].dispositions = [];
    },
    (p: any) => {
      p.auditLedger.reviewedFiles[1].dispositions.push(
        p.auditLedger.reviewedFiles[1].dispositions[0],
      );
    },
    (p: any) => {
      p.auditLedger.reviewedFiles[1].dispositions[0] = {
        ...p.auditLedger.reviewedFiles[1].dispositions[0],
        status: "excluded",
        itemIds: [],
      };
    },
    (p: any) => {
      p.rawMessages[0].sourceFile = "empty.html";
    },
    (p: any) => {
      p.rawManifest.exports[1].actualMessageCount++;
    },
    (p: any) => {
      p.rawManifest.files[1].sha256 = "c".repeat(64);
    },
  ]) {
    const input = fixture(),
      proof = proofFor(input);
    change(proof);
    let called = false;
    assert.throws(() =>
      compileKnowledge(
        input,
        () => {
          called = true;
          return [110];
        },
        proof,
      ),
    );
    assert.equal(called, false);
  }
});

test("closed insufficient-context disposition is allowed but unreviewed or stale approvals are not", () => {
  for (const change of [
    (p: any) => {
      p.reviewManifest.items[0].decision = "pending";
    },
    (p: any) => {
      p.reviewManifest.items[0].reviewer = "";
    },
    (p: any) => {
      p.reviewManifest.items = [];
    },
    (p: any) => {
      p.reviewManifest.items.push(p.reviewManifest.items[0]);
    },
    (p: any) => {
      p.reviewManifest.auditLedgerSha256 = "c".repeat(64);
    },
    (p: any) => {
      p.reviewManifest.items[0].contentSha256 = "c".repeat(64);
    },
    (p: any) => {
      p.reviewManifest.items[0].reviewedAt = "2026-11-02";
    },
    (p: any) => {
      p.reviewManifest.items[0].reviewer = "different-reviewer";
    },
    (p: any) => {
      p.auditLedger.reviewedFiles[1].dispositions[0].reason =
        "Changed audit rationale.";
      p.reviewManifest.auditLedgerSha256 = auditLedgerHash(p.auditLedger);
    },
  ]) {
    const input = fixture(),
      proof = proofFor(input);
    change(proof);
    let called = false;
    assert.throws(() =>
      compileKnowledge(
        input,
        () => {
          called = true;
          return [110];
        },
        proof,
      ),
    );
    assert.equal(called, false);
  }
  const input = fixture(),
    proof = proofFor(input);
  assert.throws(
    () => compileKnowledge(input, () => [110], undefined as any),
    /publication-proof-required/,
  );
  assert.equal(compileKnowledge(input, () => [110], proof).bundles.length, 1);
  const mutable = proof as any;
  mutable.rawMessages.push({
    ...mutable.rawMessages[0],
    messageId: "1001",
    ordinal: 1,
  });
  mutable.rawManifest.exports[1].actualMessageCount = 2;
  mutable.rawManifest.exports[1].declaredMessageCount = 2;
  mutable.rawManifest.counts.messages = 2;
  mutable.rawManifest.counts.uniqueMessageIds = 2;
  mutable.auditLedger.reviewedFiles[1].dispositions.push({
    messageId: "1001",
    status: "insufficient-context",
    itemIds: [],
    reason: "Read but unsupported, explicitly held out of publication.",
  });
  const ledgerHash = auditLedgerHash(mutable.auditLedger);
  mutable.reviewManifest.auditLedgerSha256 = ledgerHash;
  input.items[0] = {
    ...input.items[0],
    reviewReceipt: reviewReceiptFor(
      mutable.reviewManifest.items[0],
      input.sourceInventorySha256,
      ledgerHash,
    ),
  };
  assert.equal(compileKnowledge(input, () => [110], proof).bundles.length, 1);
});
