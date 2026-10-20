import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const store = await import(
  new URL("../scripts/autodev/store.mjs", import.meta.url).href
);

async function temporary(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "strahov-autodev-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function assignment() {
  return {
    schemaVersion: 1,
    issue: "KEY-47",
    task: "controller-pilot",
    workerTask: "worker-pilot",
    repository: "fixture/project",
    baseBranch: "main",
    intentFile: "intent.md",
    artifactDir: "artifacts/pilot",
    handoffFile: "handoff.md",
    prTitle: "Fixture pilot",
    checks: [{ id: "cli", command: "node", args: ["--version"] }],
    linearStates: { active: "In Progress", done: "Done" },
    acceptance: { kind: "cli", description: "A real CLI check" },
    merge: true,
  };
}

test("atomic checkpoint replacement preserves old state on serialization failure", async (t) => {
  const root = await temporary(t);
  const file = path.join(root, "state.json");
  await store.atomicWriteJson(file, { counter: 1, nested: { b: 2, a: 1 } });
  await store.atomicWriteJson(file, { counter: 2 });
  const before = await readFile(file, "utf8");
  await assert.rejects(
    store.atomicWriteJson(file, { bad: undefined }),
    /JSON values/,
  );
  assert.equal(await readFile(file, "utf8"), before);
  assert.deepEqual(await store.readJson(file), { counter: 2 });
  assert.deepEqual(await readdir(root), ["state.json"]);
});

test("corrupt existing data is never mistaken for a missing checkpoint", async (t) => {
  const root = await temporary(t);
  const file = path.join(root, "state.json");
  assert.equal(await store.readJson(file, { optional: true }), undefined);
  await writeFile(file, "{broken");
  await assert.rejects(store.readJson(file, { optional: true }), {
    code: "CORRUPT_STATE",
  });
  assert.equal(await readFile(file, "utf8"), "{broken");
  for (const value of [null, false, 0, ""]) {
    await writeFile(file, JSON.stringify(value));
    assert.equal(await store.readJson(file, { optional: true }), value);
  }
});

test("manifest rejects unassigned work, shell field, escaping paths and unsupported acceptance before mutation", () => {
  const original = assignment();
  assert.deepEqual(store.validateAssignment(original), original);
  for (const patch of [
    { workerTask: original.task },
    { workerTask: undefined },
    { task: "../task" },
    { intentFile: "../outside.md" },
    { artifactDir: "C:/outside" },
    { acceptance: { kind: "gpu", description: "Not measured" } },
    { checks: [{ id: "cli", command: "node", args: [], shell: true }] },
    { checks: [original.checks[0], original.checks[0]] },
    { merge: undefined },
    { adapter: "external.mjs" },
  ])
    assert.throws(() => store.validateAssignment({ ...original, ...patch }), {
      code: "INVALID_ASSIGNMENT",
    });
});

test("canonical digests ignore object key order but freeze behavior, and run IDs cannot escape their directory", () => {
  assert.equal(
    store.digest({ b: 1, a: { c: 2 } }),
    store.digest({ a: { c: 2 }, b: 1 }),
  );
  assert.notEqual(
    store.digest(assignment()),
    store.digest({ ...assignment(), merge: false }),
  );
  assert.equal(
    store.makeRunId("/repo/.git", "KEY-47"),
    store.makeRunId("/repo/.git", "key-47"),
  );
  assert.notEqual(
    store.makeRunId("/repo/.git", "KEY-47"),
    store.makeRunId("/repo/.git", "KEY-48"),
  );
  assert.throws(() => store.validateRunId("../../state"), {
    code: "INVALID_RUN_ID",
  });
});

test("external manifest freezes independent authority and an exact immutable evidence list", () => {
  const acceptance = {
    kind: "external",
    description: "Comparable production A/B",
    authority: { task: "coordinator", owner: "run:coordinator" },
    receiptFile: "evidence/acceptance.json",
    evidenceFiles: [{ id: "ab", path: "evidence/ab.json" }],
  };
  const original = { ...assignment(), acceptance };
  assert.deepEqual(store.validateAssignment(original), original);
  const bad = [
    { unknown: true },
    { authority: { ...acceptance.authority, key: "ignored" } },
    { authority: { task: original.workerTask, owner: "owner" } },
    { authority: { task: original.task, owner: "owner" } },
    { authority: { task: 123, owner: "owner" } },
    { authority: { task: "coordinator", owner: "bad owner" } },
    { evidenceFiles: [] },
    {
      evidenceFiles: [...acceptance.evidenceFiles, ...acceptance.evidenceFiles],
    },
    { evidenceFiles: [{ id: "ab", path: acceptance.receiptFile }] },
    { evidenceFiles: [{ id: "ab", path: "evidence/ab.json", ignored: true }] },
    {
      evidenceFiles: [
        { id: "a", path: "A.json" },
        { id: "b", path: "a.json" },
      ],
    },
    ...[
      "../proof",
      "/proof",
      "C:/proof",
      "proof\\x",
      "proof/*",
      "proof/[a]",
      "proof/./x",
      "proof/.git/x",
      "proof/x.",
      "proof/CON.txt",
      "proof//x",
    ].map((receiptFile) => ({ receiptFile })),
  ];
  for (const patch of bad)
    assert.throws(
      () =>
        store.validateAssignment({
          ...original,
          acceptance: { ...acceptance, ...patch },
        }),
      { code: "INVALID_ASSIGNMENT" },
    );
  assert.throws(
    () =>
      store.validateAssignment({ ...original, validationTask: "coordinator" }),
    { code: "INVALID_ASSIGNMENT" },
  );
});
