import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const cli = fileURLToPath(
  new URL("../scripts/agent-tasks.mjs", import.meta.url),
);

type Task = {
  schemaVersion: number;
  id: string;
  title: string;
  status: string;
  dependsOn: string[];
  writePaths: string[];
  resources: string[];
  acceptance: string[];
  verification: string[];
  notes: string[];
};

function task(
  id: string,
  writePaths = ["src/a.ts"],
  overrides: Partial<Task> = {},
): Task {
  return {
    schemaVersion: 1,
    id,
    title: `Task ${id}`,
    status: "ready",
    dependsOn: [],
    writePaths,
    resources: [],
    acceptance: ["Fixture acceptance"],
    verification: ["Fixture verification"],
    notes: [],
    ...overrides,
  };
}

async function git(cwd: string, ...args: string[]) {
  return (
    await execute("git", ["-C", cwd, ...args], { windowsHide: true })
  ).stdout.trim();
}

async function writeTask(cwd: string, definition: Task) {
  await writeFile(
    path.join(cwd, "docs/agents/tasks", `${definition.id}.json`),
    JSON.stringify(definition),
  );
}

async function fixture(t: TestContext, definitions: Task[]) {
  const base = await mkdtemp(path.join(tmpdir(), "strahov-agent-tasks-"));
  // All removals stay inside this newly allocated temporary fixture.
  t.after(async () => {
    await rm(base, { recursive: true, force: true });
  });
  const cwd = path.join(base, "repo");
  await mkdir(path.join(cwd, "docs/agents/tasks"), { recursive: true });
  await mkdir(path.join(cwd, "src"));
  await writeFile(path.join(cwd, "src/a.ts"), "original a\n");
  await writeFile(path.join(cwd, "src/b.ts"), "original b\n");
  await git(cwd, "init", "--initial-branch=main");
  for (const definition of definitions) await writeTask(cwd, definition);
  await git(cwd, "add", ".");
  await git(
    cwd,
    "-c",
    "user.name=Agent fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--no-verify",
    "-qm",
    "fixture",
  );
  const directory = path.join(cwd, ".git", "agent-coordination");
  return {
    base,
    cwd,
    directory,
    registry: path.join(directory, "claims.json"),
  };
}

async function run(cwd: string, ...args: string[]) {
  try {
    const result = await execute(process.execPath, [cli, ...args], {
      cwd,
      windowsHide: true,
    });
    return { code: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as Error & {
      code: number | string;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failure.code,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

async function succeeds(cwd: string, ...args: string[]) {
  const result = await run(cwd, ...args);
  assert.equal(result.code, 0, result.output);
  return result.output;
}

async function fails(cwd: string, pattern: RegExp, ...args: string[]) {
  const result = await run(cwd, ...args);
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, pattern);
  return result.output;
}

async function registry(filename: string) {
  return JSON.parse(await readFile(filename, "utf8")) as {
    schemaVersion: number;
    claims: Array<{
      task: string;
      owner: string;
      pid?: number;
      worktree: string;
      baseHead: string;
      claimedAt: string;
      heartbeatAt: string;
      writePaths: string[];
      resources: string[];
      adoptedDirtyPaths?: string[];
    }>;
  };
}

test("validates planned overlaps and reports clean, unreserved tasks", async (t) => {
  const f = await fixture(t, [task("one"), task("two", ["src/"])]);
  assert.match(await succeeds(f.cwd, "validate"), /Valid: 2 task definitions/);
  const output = await succeeds(f.cwd, "status");
  assert.match(output, /Active reservations: 0/);
  assert.match(
    output,
    /Dirty paths in this checkout only: 0; without an active owner: 0/,
  );
  assert.match(output, /one: ready/);
});

test("claim records source and owner, gates heartbeat/release, and preserves edits", async (t) => {
  const f = await fixture(t, [task("one")]);
  await succeeds(
    f.cwd,
    "claim",
    "--task",
    "one",
    "--owner",
    "thread/worker",
    "--pid",
    "1234",
  );
  const before = (await registry(f.registry)).claims[0];
  assert.equal(before.owner, "thread/worker");
  assert.equal(before.pid, 1234);
  assert.equal(path.resolve(before.worktree), path.resolve(f.cwd));
  assert.equal(before.baseHead, await git(f.cwd, "rev-parse", "HEAD"));
  assert.deepEqual(before.writePaths, ["src/a.ts"]);
  await fails(
    f.cwd,
    /Owner mismatch/,
    "heartbeat",
    "--task",
    "one",
    "--owner",
    "other",
  );
  await fails(
    f.cwd,
    /Owner mismatch/,
    "release",
    "--task",
    "one",
    "--owner",
    "other",
  );
  await fails(
    f.cwd,
    /already owned/,
    "claim",
    "--task",
    "one",
    "--owner",
    "thread/worker",
  );
  await succeeds(
    f.cwd,
    "heartbeat",
    "--task",
    "one",
    "--owner",
    "thread/worker",
  );
  assert.ok(
    (await registry(f.registry)).claims[0].heartbeatAt >= before.heartbeatAt,
  );
  await writeFile(path.join(f.cwd, "src/a.ts"), "owned edit\n");
  assert.match(await succeeds(f.cwd, "status"), /without an active owner: 0/);
  await succeeds(f.cwd, "release", "--task", "one", "--owner", "thread/worker");
  assert.equal((await registry(f.registry)).claims.length, 0);
  assert.equal(
    await readFile(path.join(f.cwd, "src/a.ts"), "utf8"),
    "owned edit\n",
  );
  assert.match(await succeeds(f.cwd, "status"), /without an active owner: 1/);
});

test("independent simultaneous CLI processes have exactly one conflicting winner", async (t) => {
  const f = await fixture(t, [task("one"), task("two", ["src/"])]);
  const results = await Promise.all([
    run(f.cwd, "claim", "--task", "one", "--owner", "first"),
    run(f.cwd, "claim", "--task", "two", "--owner", "second"),
  ]);
  assert.equal(
    results.filter((result) => result.code === 0).length,
    1,
    JSON.stringify(results),
  );
  assert.match(
    results.find((result) => result.code !== 0)!.output,
    /Reservation conflict/,
  );
  assert.equal((await registry(f.registry)).claims.length, 1);
  await assert.rejects(access(path.join(f.directory, "directory.lock")));
});

test("path claims compare case-insensitive ancestors but allow neighboring filenames", async (t) => {
  const f = await fixture(t, [
    task("file", ["src/A.ts"]),
    task("parent", ["SRC/"]),
    task("neighbor", ["src/ab.ts"]),
  ]);
  await succeeds(f.cwd, "claim", "--task", "file", "--owner", "first");
  await fails(
    f.cwd,
    /Reservation conflict.*path SRC\//,
    "claim",
    "--task",
    "parent",
    "--owner",
    "second",
  );
  await succeeds(f.cwd, "claim", "--task", "neighbor", "--owner", "third");
  assert.equal((await registry(f.registry)).claims.length, 2);
});

test("exclusive resources serialize disjoint file scopes and resource-only tasks", async (t) => {
  const f = await fixture(t, [
    task("one", ["src/a.ts"], { resources: ["gpu", "port:2568"] }),
    task("two", [], { resources: ["gpu"] }),
  ]);
  await succeeds(f.cwd, "validate");
  await succeeds(f.cwd, "claim", "--task", "one", "--owner", "first");
  await fails(
    f.cwd,
    /resource gpu/,
    "claim",
    "--task",
    "two",
    "--owner",
    "second",
  );
  await succeeds(f.cwd, "release", "--task", "one", "--owner", "first");
  await succeeds(f.cwd, "claim", "--task", "two", "--owner", "second");
});

test("port resource aliases and out-of-range ports cannot bypass exclusivity", async (t) => {
  const definition = task("one", [], { resources: ["port:2568"] });
  const f = await fixture(t, [definition]);
  for (const resource of [
    "port:02568",
    "port:0",
    "port:65536",
    "port:999999",
    "port:http",
    "port:1:2",
  ]) {
    await writeTask(f.cwd, { ...definition, resources: [resource] });
    await fails(f.cwd, /port must be canonical decimal 1\.\.65535/, "validate");
  }
  await writeTask(f.cwd, {
    ...definition,
    resources: ["port:1", "port:2568", "port:65535"],
  });
  await succeeds(f.cwd, "validate");
});

test("dirty staged, unstaged and untracked paths require explicit adoption", async (t) => {
  const f = await fixture(t, [task("one", ["src/"])]);
  await writeFile(path.join(f.cwd, "src/a.ts"), "staged edit\n");
  await git(f.cwd, "add", "src/a.ts");
  await writeFile(path.join(f.cwd, "src/b.ts"), "unstaged edit\n");
  await writeFile(path.join(f.cwd, "src/new file.ts"), "untracked edit\n");
  const output = await fails(
    f.cwd,
    /Existing dirty paths/,
    "claim",
    "--task",
    "one",
    "--owner",
    "first",
  );
  for (const name of ["src/a.ts", "src/b.ts", "src/new file.ts"])
    assert.ok(output.includes(name));
  await assert.rejects(access(f.registry));
  await succeeds(
    f.cwd,
    "claim",
    "--task",
    "one",
    "--owner",
    "first",
    "--adopt-dirty",
  );
  assert.deepEqual(
    (await registry(f.registry)).claims[0].adoptedDirtyPaths?.sort(),
    ["src/a.ts", "src/b.ts", "src/new file.ts"],
  );
  assert.match(await succeeds(f.cwd, "status"), /adopted dirty paths/);
});

test("a staged rename blocks both the source and destination scopes", async (t) => {
  const f = await fixture(t, [
    task("source"),
    task("destination", ["src/renamed.ts"]),
  ]);
  await git(f.cwd, "mv", "src/a.ts", "src/renamed.ts");
  await fails(
    f.cwd,
    /src\/a.ts/,
    "claim",
    "--task",
    "source",
    "--owner",
    "first",
  );
  await fails(
    f.cwd,
    /src\/renamed.ts/,
    "claim",
    "--task",
    "destination",
    "--owner",
    "second",
  );
});

test("status and dependencies gate claims, with cycles and unknown ids rejected", async (t) => {
  const first = task("first", ["src/a.ts"], { status: "blocked" });
  const second = task("second", ["src/b.ts"], { dependsOn: ["first"] });
  const f = await fixture(t, [first, second]);
  await fails(
    f.cwd,
    /is blocked, not ready/,
    "claim",
    "--task",
    "first",
    "--owner",
    "one",
  );
  await fails(
    f.cwd,
    /waits for completed dependencies/,
    "claim",
    "--task",
    "second",
    "--owner",
    "two",
  );
  first.status = "done";
  await writeTask(f.cwd, first);
  await fails(
    f.cwd,
    /is done, not ready/,
    "claim",
    "--task",
    "first",
    "--owner",
    "one",
  );
  await succeeds(f.cwd, "claim", "--task", "second", "--owner", "two");
  await succeeds(f.cwd, "release", "--task", "second", "--owner", "two");
  first.dependsOn = ["second"];
  await writeTask(f.cwd, first);
  await fails(f.cwd, /Dependency cycle/, "validate");
  first.dependsOn = ["missing"];
  await writeTask(f.cwd, first);
  await fails(f.cwd, /Unknown dependency missing/, "validate");
});

test("unsafe paths and malformed task structure fail validation", async (t) => {
  const definition = task("one");
  const f = await fixture(t, [definition]);
  for (const value of [
    "../escape",
    "/absolute",
    "C:/absolute",
    "src\\a.ts",
    "src/*.ts",
    "src/[ab].ts",
    "src//a.ts",
    "./src/a.ts",
    ".git/config",
    "src/../a.ts",
    "src/NUL",
    "src/unsafe.",
  ]) {
    await writeTask(f.cwd, { ...definition, writePaths: [value] });
    await fails(f.cwd, /path|glob|unsafe/, "validate");
  }
  await writeTask(f.cwd, { ...definition, writePaths: ["src"] });
  await fails(f.cwd, /directory scopes require a trailing/, "validate");
  await writeTask(f.cwd, {
    ...definition,
    writePaths: ["src/a.ts", "SRC/A.ts"],
  });
  await fails(f.cwd, /duplicate case-insensitive/, "validate");
  await writeTask(f.cwd, { ...definition, resources: ["GPU"] });
  await fails(f.cwd, /lowercase resource identifiers/, "validate");
  await writeTask(f.cwd, { ...definition, verification: [] });
  await fails(f.cwd, /must not be empty/, "validate");
  await writeTask(f.cwd, { ...definition, schemaVersion: 2 });
  await fails(f.cwd, /unsupported schemaVersion/, "validate");
  const { notes: _notes, ...missingField } = definition;
  await writeFile(
    path.join(f.cwd, "docs/agents/tasks/one.json"),
    JSON.stringify(missingField),
  );
  await fails(f.cwd, /missing schema fields/, "validate");
});

test("stale heartbeat remains reserved until the actual owner releases", async (t) => {
  const f = await fixture(t, [task("one"), task("two")]);
  await succeeds(f.cwd, "claim", "--task", "one", "--owner", "first");
  const data = await registry(f.registry);
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  data.claims[0].claimedAt = old;
  data.claims[0].heartbeatAt = old;
  await writeFile(f.registry, JSON.stringify(data));
  assert.match(
    await succeeds(f.cwd, "status"),
    /WARNING: STALE; reservation remains owned/,
  );
  await fails(
    f.cwd,
    /Reservation conflict/,
    "claim",
    "--task",
    "two",
    "--owner",
    "second",
  );
  assert.equal((await registry(f.registry)).claims[0].owner, "first");
  await succeeds(f.cwd, "heartbeat", "--task", "one", "--owner", "first");
  assert.doesNotMatch(await succeeds(f.cwd, "status"), /WARNING: STALE/);
});

test("corrupt registry and abandoned mutex fail closed without deleting evidence", async (t) => {
  const f = await fixture(t, [task("one")]);
  await mkdir(f.directory, { recursive: true });
  await writeFile(f.registry, "{broken json");
  await fails(
    f.cwd,
    /Corrupt reservation registry/,
    "claim",
    "--task",
    "one",
    "--owner",
    "first",
  );
  assert.equal(await readFile(f.registry, "utf8"), "{broken json");
  await writeFile(
    f.registry,
    JSON.stringify({ schemaVersion: 1, claims: [{ task: "one" }] }),
  );
  await fails(f.cwd, /Corrupt reservation registry/, "status");
  const lock = path.join(f.directory, "directory.lock");
  await mkdir(lock);
  const metadata = '{"pid":99999999,"acquiredAt":"2000-01-01T00:00:00.000Z"}';
  await writeFile(path.join(lock, "owner.json"), metadata);
  await fails(
    f.cwd,
    /mutex is busy or abandoned/,
    "release",
    "--task",
    "one",
    "--owner",
    "first",
  );
  assert.equal(await readFile(path.join(lock, "owner.json"), "utf8"), metadata);
});

test("linked Git worktrees use one registry and retain original claim scope", async (t) => {
  const f = await fixture(t, [task("one"), task("two", ["src/a.ts"])]);
  const linked = path.join(f.base, "linked");
  await git(f.cwd, "worktree", "add", "--detach", linked, "HEAD");
  await succeeds(f.cwd, "claim", "--task", "one", "--owner", "first");
  const output = await succeeds(linked, "status");
  assert.match(output, /owner=first/);
  assert.match(output, /Active reservations: 1/);
  await fails(
    linked,
    /Reservation conflict/,
    "claim",
    "--task",
    "two",
    "--owner",
    "second",
  );
  await fails(
    linked,
    /owning worktree/,
    "heartbeat",
    "--task",
    "one",
    "--owner",
    "first",
  );
  await writeTask(linked, task("one", ["src/b.ts"]));
  assert.match(
    await succeeds(linked, "status"),
    /definition changed or missing/,
  );
  await fails(
    linked,
    /Reservation conflict/,
    "claim",
    "--task",
    "two",
    "--owner",
    "second",
  );
  await succeeds(f.cwd, "release", "--task", "one", "--owner", "first");
  await succeeds(linked, "claim", "--task", "two", "--owner", "second");
  assert.equal(
    path.resolve((await registry(f.registry)).claims[0].worktree),
    path.resolve(linked),
  );
});

test("an owner can release even if catalog edits are invalid, without claiming completion", async (t) => {
  const f = await fixture(t, [task("one")]);
  await succeeds(f.cwd, "claim", "--task", "one", "--owner", "first");
  const taskPath = path.join(f.cwd, "docs/agents/tasks/one.json");
  await writeFile(taskPath, "invalid task JSON");
  await succeeds(f.cwd, "heartbeat", "--task", "one", "--owner", "first");
  await succeeds(f.cwd, "release", "--task", "one", "--owner", "first");
  assert.equal(await readFile(taskPath, "utf8"), "invalid task JSON");
  assert.equal((await registry(f.registry)).claims.length, 0);
});

test("argument mistakes cannot mutate the registry", async (t) => {
  const f = await fixture(t, [task("one")]);
  await fails(
    f.cwd,
    /unique, nonempty/,
    "claim",
    "--task",
    "one",
    "--owner",
    "",
  );
  await fails(
    f.cwd,
    /Duplicate option/,
    "claim",
    "--task",
    "one",
    "--owner",
    "first",
    "--owner",
    "second",
  );
  await fails(
    f.cwd,
    /positive integer/,
    "claim",
    "--task",
    "one",
    "--owner",
    "first",
    "--pid",
    "0",
  );
  await fails(
    f.cwd,
    /Unknown option/,
    "claim",
    "--task",
    "one",
    "--owner",
    "first",
    "--force",
  );
  await fails(
    f.cwd,
    /claim-only/,
    "release",
    "--task",
    "one",
    "--owner",
    "first",
    "--adopt-dirty",
  );
  await assert.rejects(access(f.registry));
});
