/** Local review ledger; this module never calls Linear or sends a message. */
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const id = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,160}$/.test(value);
const text = (value, maximum = 10000) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const serial = (value) => JSON.stringify(value, null, 2) + "\n";
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};

export function validateReviewFindings(value) {
  if (!value || !id(value.projectKey) || !/^[a-f0-9]{64}$/.test(value.archiveId) || !Array.isArray(value.findings) || value.findings.length > 200)
    throw Error("Review requires projectKey, SHA-256 archiveId and at most 200 findings");
  const keys = new Set();
  return value.findings.map((finding) => {
    if (!id(finding.key) || keys.has(finding.key) || !text(finding.title, 200) || !text(finding.observed) ||
      !["low", "medium", "high", "critical"].includes(finding.severity) ||
      !Array.isArray(finding.evidence) || !finding.evidence.length || finding.evidence.length > 40)
      throw Error("Each finding needs a unique stable key, title, observed symptom, severity and evidence");
    keys.add(finding.key);
    const evidence = finding.evidence.map((entry) => {
      if (!entry || !text(entry.reference, 500) || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        (entry.note !== undefined && !text(entry.note, 2000))) throw Error("Evidence needs an inspectable reference and SHA-256");
      return { reference: entry.reference, sha256: entry.sha256, ...(entry.note ? { note: entry.note } : {}) };
    });
    if (finding.hypothesis !== undefined && !text(finding.hypothesis)) throw Error("Invalid hypothesis");
    if (finding.reproduction !== undefined && !text(finding.reproduction)) throw Error("Invalid reproduction");
    const result = { key: finding.key, title: finding.title, observed: finding.observed, severity: finding.severity, evidence,
      hypothesis: finding.hypothesis ?? null, reproduction: finding.reproduction ?? null };
    return { ...result, fingerprint: sha(`${value.projectKey}:${finding.key}`), contentHash: sha(canonical(result)) };
  });
}

export async function readReviewLedger(path) {
  let bytes;
  try { bytes = await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const rows = [], lines = bytes.split(/\r?\n/).filter(Boolean);
  let previous = "0".repeat(64);
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch { throw Error("Review ledger has an incomplete/corrupt row; do not overwrite it"); }
    const { hash, ...body } = row;
    if (body.schemaVersion !== 1 || body.previousHash !== previous || sha(body) !== hash)
      throw Error("Review ledger hash chain is invalid");
    previous = hash; rows.push(row);
  }
  return rows;
}

async function withLedger(path, work) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  // Cooperative single-writer lock: never break somebody else's stale lock.
  const lock = await open(target + ".lock", "wx");
  try {
    await lock.writeFile(serial({ createdAtUTC: new Date().toISOString(), nonce: randomUUID(), pid: process.pid }));
    const rows = await readReviewLedger(target);
    const append = async (event) => {
      const body = { schemaVersion: 1, previousHash: rows.at(-1)?.hash ?? "0".repeat(64), atUTC: new Date().toISOString(), ...event };
      const row = { ...body, hash: sha(body) };
      const handle = await open(target, "a");
      try { await handle.writeFile(JSON.stringify(row) + "\n"); await handle.sync(); } finally { await handle.close(); }
      rows.push(row); return row;
    };
    return await work(rows, append);
  } finally {
    await lock.close();
    // Delete only the lock this invocation exclusively created.
    const { unlink } = await import("node:fs/promises");
    await unlink(target + ".lock");
  }
}

function bindings(rows) {
  const result = new Map();
  for (const row of rows) if (row.event === "recorded" || row.event === "reconciled") result.set(row.fingerprint, row);
  return result;
}

export async function prepareReview(ledgerPath, review) {
  const findings = validateReviewFindings(review);
  return withLedger(ledgerPath, async (rows, append) => {
    const linked = bindings(rows), operations = [];
    for (const finding of findings) {
      const prior = linked.get(finding.fingerprint), operationId = sha([finding.fingerprint, finding.contentHash, review.archiveId].join(":"));
      const existing = rows.find((row) => row.event === "prepared" && row.operationId === operationId);
      const completed = rows.some((row) => ["recorded", "reconciled"].includes(row.event) && row.operationId === operationId);
      if (completed) { operations.push({ operationId, fingerprint: finding.fingerprint, status: "already-recorded", issueId: prior?.issueId, issueUrl: prior?.issueUrl }); continue; }
      if (existing) { operations.push({ ...existing.operation, status: "pending" }); continue; }
      // An uncertain previous create must be reconciled before another create.
      const unresolved = rows.find((row) => row.event === "prepared" && row.fingerprint === finding.fingerprint &&
        !rows.some((done) => ["recorded", "reconciled"].includes(done.event) && done.operationId === row.operationId));
      if (unresolved) { operations.push({ operationId: unresolved.operationId, fingerprint: finding.fingerprint, status: "reconcile-required", reason: "A previous external operation has no confirmed receipt" }); continue; }
      const operation = { operationId, fingerprint: finding.fingerprint, action: prior?.issueId ? "update" : "create", projectKey: review.projectKey,
        archiveId: review.archiveId, issueId: prior?.issueId ?? null, issueUrl: prior?.issueUrl ?? null,
        finding, marker: `playtest-finding:${finding.fingerprint}`, status: "pending" };
      await append({ event: "prepared", operationId, fingerprint: finding.fingerprint, operation });
      operations.push(operation);
    }
    return { schemaVersion: 1, archiveId: review.archiveId, projectKey: review.projectKey, operations,
      instruction: "Inspect evidence. The coordinating agent performs actual Linear calls, then records their confirmed receipts. Pending is not sent." };
  });
}

function validateIssue(receipt) {
  if (!id(receipt?.operationId) || !id(receipt.issueId) || !text(receipt.issueUrl, 1000)) throw Error("Expected operationId, issueId and Linear issue URL");
  let url;
  try { url = new URL(receipt.issueUrl); } catch { throw Error("Invalid issue URL"); }
  if (url.protocol !== "https:" || (url.hostname !== "linear.app" && !url.hostname.endsWith(".linear.app")) || url.username || url.password)
    throw Error("Receipt must identify an HTTPS Linear issue URL");
}

export async function recordReviewReceipt(ledgerPath, receipt) {
  validateIssue(receipt);
  return withLedger(ledgerPath, async (rows, append) => {
    const pending = rows.find((row) => row.event === "prepared" && row.operationId === receipt.operationId);
    if (!pending) throw Error("No prepared operation with this ID");
    const existing = rows.find((row) => ["recorded", "reconciled"].includes(row.event) && row.operationId === receipt.operationId);
    if (existing) {
      if (existing.issueId !== receipt.issueId || existing.issueUrl !== receipt.issueUrl) throw Error("Conflicting external receipt; reconcile explicitly");
      return { status: "already-recorded", ...existing };
    }
    if (pending.operation.issueId && pending.operation.issueId !== receipt.issueId) throw Error("Update receipt points to another issue");
    return append({ event: "recorded", operationId: receipt.operationId, fingerprint: pending.fingerprint,
      issueId: receipt.issueId, issueUrl: receipt.issueUrl, externalReceipt: receipt.receipt ?? null });
  });
}

/** Root obtains actual current Linear evidence. Absence never authorizes a
 * retry-create automatically: search visibility or an uncertain response may be incomplete. */
export async function reconcileReview(ledgerPath, snapshot) {
  if (!text(snapshot?.observedAtUTC, 100) || !Number.isFinite(Date.parse(snapshot.observedAtUTC)) || !Array.isArray(snapshot.issues)) throw Error("Reconciliation requires dated external issue evidence");
  return withLedger(ledgerPath, async (rows, append) => {
    const results = [];
    for (const pending of rows.filter((row) => row.event === "prepared")) {
      const matches = snapshot.issues.filter((issue) => issue.fingerprint === pending.fingerprint &&
        (issue.operationId === pending.operationId || (!issue.operationId && pending.operation.action === "create")));
      if (matches.length !== 1) { results.push({ operationId: pending.operationId, status: matches.length ? "ambiguous" : "unresolved" }); continue; }
      const issue = matches[0];
      validateIssue({ ...issue, operationId: pending.operationId });
      const existing = rows.find((row) => ["recorded", "reconciled"].includes(row.event) && row.operationId === pending.operationId);
      if (existing && (existing.issueId !== issue.issueId || existing.issueUrl !== issue.issueUrl)) throw Error("External reconciliation conflicts with recorded issue");
      if (existing) { results.push({ operationId: pending.operationId, status: "already-recorded", issueId: issue.issueId }); continue; }
      const row = await append({ event: "reconciled", operationId: pending.operationId, fingerprint: pending.fingerprint,
        issueId: issue.issueId, issueUrl: issue.issueUrl, observedAtUTC: snapshot.observedAtUTC, externalState: issue.state ?? null });
      results.push({ operationId: row.operationId, status: "reconciled", issueId: row.issueId });
    }
    return { schemaVersion: 1, results, note: "External status is recorded evidence, never a local assertion that a visual issue is fixed." };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, input, ...args] = process.argv.slice(2), option = (flag) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  if (!command || command === "--help") console.log("node scripts/playtest-review.mjs prepare|record|reconcile INPUT.json --ledger LEDGER.jsonl [--out NEW_RESULT.json]\nNo external calls. Keep the ledger outside immutable evidence archives. Unknown external outcomes require reconciliation before retry.");
  else try {
    const ledger = option("--ledger");
    if (!ledger || !input) throw Error("Expected input JSON and --ledger");
    const parsed = JSON.parse(await readFile(input, "utf8"));
    const result = command === "prepare" ? await prepareReview(ledger, parsed) : command === "record" ? await recordReviewReceipt(ledger, parsed) : command === "reconcile" ? await reconcileReview(ledger, parsed) : (() => { throw Error("Unknown review command"); })();
    if (option("--out")) await writeFile(option("--out"), serial(result), { flag: "wx" });
    console.log(serial(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
