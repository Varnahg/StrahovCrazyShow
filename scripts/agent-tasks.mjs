import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);
const TASK_DIRECTORY = "docs/agents/tasks";
const STALE_MS = 30 * 60 * 1000;
const LOCK_WAIT_MS = 3000;
const TASK_KEYS = [
  "schemaVersion",
  "id",
  "title",
  "status",
  "dependsOn",
  "writePaths",
  "resources",
  "acceptance",
  "verification",
  "notes",
];
const usage = `Usage: node scripts/agent-tasks.mjs <command>
  status
  validate
  claim --task ID --owner UNIQUE_AGENT_ID [--pid N] [--adopt-dirty]
  heartbeat --task ID --owner UNIQUE_AGENT_ID
  release --task ID --owner UNIQUE_AGENT_ID

Claims are cooperative and shared by all worktrees of this Git repository.
--pid is informational: use a long-lived agent/session PID, never this CLI PID.
--adopt-dirty requires an explicit, documented coordinator handoff of the changes.
Heartbeat older than 30 minutes warns; it never releases or transfers ownership.`;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,95}$/.test(value);
}

function validOwner(value) {
  return typeof value === "string" && /^[^\s\x00-\x1f\x7f]{1,160}$/.test(value);
}

function stringList(value, label, { nonempty = false } = {}) {
  requireThat(Array.isArray(value), `${label}: expected an array`);
  requireThat(!nonempty || value.length > 0, `${label}: must not be empty`);
  for (const item of value) {
    requireThat(
      typeof item === "string" &&
        item.trim().length > 0 &&
        item === item.trim(),
      `${label}: expected nonempty trimmed strings`,
    );
  }
  requireThat(
    new Set(value).size === value.length,
    `${label}: duplicate entries`,
  );
}

function validateWritePath(value, label) {
  requireThat(
    typeof value === "string" && value.length > 0 && value === value.trim(),
    `${label}: expected a nonempty repository-relative path`,
  );
  requireThat(
    !/[\\:*?\[\]{}\x00-\x1f\x7f]/.test(value) && !value.startsWith("/"),
    `${label}: absolute paths, backslashes, glob syntax and control characters are forbidden: ${value}`,
  );
  const parts = value.replace(/\/$/, "").split("/");
  requireThat(
    parts.every(
      (part) =>
        part !== "" &&
        part !== "." &&
        part !== ".." &&
        part.toLowerCase() !== ".git" &&
        !/[. ]$/.test(part) &&
        !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
    ),
    `${label}: unsafe or noncanonical path: ${value}`,
  );
}

function validateScopes(value, label) {
  stringList(value.writePaths, `${label}.writePaths`);
  stringList(value.resources, `${label}.resources`);
  for (const item of value.writePaths)
    validateWritePath(item, `${label}.writePaths`);
  for (const resource of value.resources) {
    requireThat(
      /^[a-z0-9][a-z0-9:._-]*$/.test(resource),
      `${label}.resources: use lowercase resource identifiers: ${resource}`,
    );
    if (resource.startsWith("port:")) {
      requireThat(
        /^port:[1-9][0-9]{0,4}$/.test(resource) &&
          Number(resource.slice(5)) <= 65535,
        `${label}.resources: port must be canonical decimal 1..65535 without leading zeros: ${resource}`,
      );
    }
  }
  requireThat(
    value.writePaths.length + value.resources.length > 0,
    `${label}: reserve at least one path or resource`,
  );
  const canonical = value.writePaths.map(normalizeScope);
  requireThat(
    new Set(canonical).size === canonical.length,
    `${label}.writePaths: duplicate case-insensitive paths`,
  );
}

function normalizeScope(value) {
  return value.replace(/\/$/, "").toLowerCase();
}

function sameWorktree(first, second) {
  return (
    path.resolve(first).toLowerCase() === path.resolve(second).toLowerCase()
  );
}

// Conservative on every OS, so a Linux claim cannot conflict silently on Windows.
function pathsOverlap(first, second) {
  const a = normalizeScope(first),
    b = normalizeScope(second);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function conflicts(first, second) {
  const paths = first.writePaths.filter((a) =>
    second.writePaths.some((b) => pathsOverlap(a, b)),
  );
  const resources = first.resources.filter((a) => second.resources.includes(a));
  return [
    ...paths.map((item) => `path ${item}`),
    ...resources.map((item) => `resource ${item}`),
  ];
}

async function git(cwd, ...args) {
  const result = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.stdout;
}

async function context() {
  const worktree = (
    await git(process.cwd(), "rev-parse", "--show-toplevel")
  ).trim();
  const common = (
    await git(
      worktree,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    )
  ).trim();
  const directory = path.join(common, "agent-coordination");
  return {
    worktree,
    directory,
    registry: path.join(directory, "claims.json"),
    lock: path.join(directory, "directory.lock"),
  };
}

async function readJson(filename, label) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw error;
    throw new Error(
      `${label}: cannot read valid JSON at ${filename}: ${error.message}`,
    );
  }
}

async function readTasks(worktree) {
  const directory = path.join(worktree, TASK_DIRECTORY);
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  requireThat(
    files.length > 0,
    `No task JSON definitions found in ${directory}`,
  );
  const tasks = new Map();
  for (const file of files) {
    const task = await readJson(path.join(directory, file), `Task ${file}`);
    requireThat(isObject(task), `Task ${file}: expected an object`);
    requireThat(
      Object.keys(task).every((key) => TASK_KEYS.includes(key)) &&
        TASK_KEYS.every((key) => Object.hasOwn(task, key)),
      `Task ${file}: unexpected or missing schema fields`,
    );
    requireThat(
      task.schemaVersion === 1,
      `Task ${file}: unsupported schemaVersion`,
    );
    requireThat(validId(task.id), `Task ${file}: invalid id`);
    requireThat(
      file === `${task.id}.json`,
      `Task ${file}: filename must match id ${task.id}`,
    );
    requireThat(
      typeof task.title === "string" && task.title.trim().length > 0,
      `Task ${file}: missing title`,
    );
    requireThat(
      ["ready", "blocked", "done"].includes(task.status),
      `Task ${file}: invalid status`,
    );
    for (const key of ["dependsOn", "acceptance", "verification", "notes"]) {
      stringList(task[key], `Task ${file}.${key}`, {
        nonempty: ["acceptance", "verification"].includes(key),
      });
    }
    requireThat(
      task.dependsOn.every(validId),
      `Task ${file}: invalid dependency id`,
    );
    validateScopes(task, `Task ${file}`);
    requireThat(!tasks.has(task.id), `Duplicate task id ${task.id}`);
    tasks.set(task.id, task);
  }
  const visited = new Set(),
    active = new Set();
  function visit(id, chain = []) {
    requireThat(
      tasks.has(id),
      `Unknown dependency ${id} (from ${chain.at(-1)})`,
    );
    requireThat(
      !active.has(id),
      `Dependency cycle: ${[...chain, id].join(" -> ")}`,
    );
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of tasks.get(id).dependsOn)
      visit(dependency, [...chain, id]);
    active.delete(id);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  return tasks;
}

function validTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

async function readRegistry(ctx) {
  let registry;
  try {
    registry = await readJson(ctx.registry, "Corrupt reservation registry");
  } catch (error) {
    if (error.code === "ENOENT") return { schemaVersion: 1, claims: [] };
    throw error;
  }
  requireThat(
    isObject(registry) &&
      registry.schemaVersion === 1 &&
      Array.isArray(registry.claims),
    `Corrupt reservation registry: invalid schema at ${ctx.registry}; preserve it for coordinator recovery`,
  );
  const ids = new Set();
  for (const claim of registry.claims) {
    const label = "Corrupt reservation registry";
    requireThat(
      isObject(claim) && validId(claim.task) && validOwner(claim.owner),
      `${label}: invalid task or owner`,
    );
    requireThat(!ids.has(claim.task), `${label}: duplicate task ${claim.task}`);
    ids.add(claim.task);
    requireThat(
      typeof claim.worktree === "string" &&
        path.isAbsolute(claim.worktree) &&
        typeof claim.baseHead === "string" &&
        /^[a-f0-9]{40,64}$/.test(claim.baseHead),
      `${label}: invalid worktree or baseHead`,
    );
    requireThat(
      validTimestamp(claim.claimedAt) &&
        validTimestamp(claim.heartbeatAt) &&
        claim.heartbeatAt >= claim.claimedAt,
      `${label}: invalid timestamps`,
    );
    requireThat(
      claim.pid === undefined ||
        (Number.isSafeInteger(claim.pid) && claim.pid > 0),
      `${label}: invalid pid`,
    );
    validateScopes(claim, label);
    if (claim.adoptedDirtyPaths !== undefined) {
      stringList(claim.adoptedDirtyPaths, `${label}.adoptedDirtyPaths`);
      for (const item of claim.adoptedDirtyPaths) {
        validateWritePath(item, `${label}.adoptedDirtyPaths`);
        requireThat(
          claim.writePaths.some((scope) => pathsOverlap(scope, item)),
          `${label}: adopted path outside scope`,
        );
      }
    }
  }
  for (let i = 0; i < registry.claims.length; i++) {
    for (let j = i + 1; j < registry.claims.length; j++) {
      requireThat(
        conflicts(registry.claims[i], registry.claims[j]).length === 0,
        `Corrupt reservation registry: overlapping claims ${registry.claims[i].task} and ${registry.claims[j].task}`,
      );
    }
  }
  return registry;
}

async function withLock(ctx, operation) {
  await mkdir(ctx.directory, { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (true) {
    try {
      await mkdir(ctx.lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        let owner = "owner metadata unavailable";
        try {
          owner = await readFile(path.join(ctx.lock, "owner.json"), "utf8");
        } catch {}
        throw new Error(
          `Coordination mutex is busy or abandoned: ${ctx.lock}\n${owner}\nNo lock or reservation was removed. The coordinator must verify all processes before manual recovery.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  try {
    await writeFile(
      path.join(ctx.lock, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        worktree: ctx.worktree,
        acquiredAt: new Date().toISOString(),
      }),
      { flag: "wx" },
    );
    return await operation();
  } finally {
    // Only the process that successfully created this exact mutex removes it.
    await rm(ctx.lock, { recursive: true });
  }
}

async function saveRegistry(ctx, registry) {
  const temporary = path.join(ctx.directory, `claims-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, ctx.registry);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function checkScopeFilesystem(worktree, scopes) {
  for (const scope of scopes) {
    const parts = scope.replace(/\/$/, "").split("/");
    let current = worktree;
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]);
      let info;
      try {
        info = await lstat(current);
      } catch (error) {
        if (error.code === "ENOENT") break;
        throw error;
      }
      requireThat(
        !info.isSymbolicLink(),
        `Scope ${scope} traverses a symlink/junction: ${current}`,
      );
      if (i < parts.length - 1 || scope.endsWith("/")) {
        requireThat(
          info.isDirectory(),
          `Scope ${scope}: expected a directory at ${current}`,
        );
      } else {
        requireThat(
          !info.isDirectory(),
          `Scope ${scope}: directory scopes require a trailing /`,
        );
      }
    }
  }
}

async function dirtyPaths(worktree) {
  const records = (
    await git(
      worktree,
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    )
  ).split("\0");
  const paths = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    paths.push(record.slice(3));
    // With -z a rename is destination NUL source NUL; both paths matter.
    if (/[RC]/.test(record.slice(0, 2))) {
      requireThat(
        Boolean(records[i + 1]),
        "Cannot parse Git rename/copy status safely",
      );
      paths.push(records[++i]);
    }
  }
  return [...new Set(paths)];
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (["--help", "-h", "help"].includes(command)) return { command: "help" };
  requireThat(
    ["status", "validate", "claim", "heartbeat", "release"].includes(command),
    usage,
  );
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const option = rest[i];
    requireThat(
      ["--task", "--owner", "--pid", "--adopt-dirty"].includes(option),
      `Unknown option ${option}\n${usage}`,
    );
    requireThat(!Object.hasOwn(options, option), `Duplicate option ${option}`);
    if (option === "--adopt-dirty") options[option] = true;
    else {
      requireThat(
        rest[i + 1] !== undefined && !rest[i + 1].startsWith("--"),
        `Missing value for ${option}`,
      );
      options[option] = rest[++i];
    }
  }
  if (["status", "validate"].includes(command)) {
    requireThat(rest.length === 0, `${command} takes no options`);
  } else {
    requireThat(
      validId(options["--task"]),
      "--task must be a lowercase task id",
    );
    requireThat(
      validOwner(options["--owner"]),
      "--owner must be a unique, nonempty agent/thread id without whitespace",
    );
    requireThat(
      command === "claim" || (!options["--pid"] && !options["--adopt-dirty"]),
      "--pid and --adopt-dirty are claim-only options",
    );
  }
  if (options["--pid"] !== undefined) {
    requireThat(
      /^[1-9][0-9]*$/.test(options["--pid"]) &&
        Number.isSafeInteger(Number(options["--pid"])),
      "--pid must be a positive integer for a long-lived agent/session process",
    );
  }
  return {
    command,
    task: options["--task"],
    owner: options["--owner"],
    pid: options["--pid"] ? Number(options["--pid"]) : undefined,
    adoptDirty: options["--adopt-dirty"] === true,
  };
}

async function printStatus(ctx, tasks, registry) {
  console.log(`Registry: ${ctx.registry}`);
  console.log(`Worktree: ${ctx.worktree}`);
  console.log(`Active reservations: ${registry.claims.length}`);
  const dirty = await dirtyPaths(ctx.worktree);
  const ownedScopes = registry.claims
    .filter((claim) => sameWorktree(claim.worktree, ctx.worktree))
    .flatMap((claim) => claim.writePaths);
  const unowned = dirty.filter(
    (file) => !ownedScopes.some((scope) => pathsOverlap(scope, file)),
  );
  console.log(
    `Dirty paths in this checkout only: ${dirty.length}; without an active owner: ${unowned.length}`,
  );
  if (unowned.length)
    console.log(
      "  WARNING: unreserved changes may belong to other work. Inspect git status --short and coordinate before claiming them.",
    );
  for (const claim of registry.claims) {
    const ageMinutes = Math.floor(
      (Date.now() - Date.parse(claim.heartbeatAt)) / 60000,
    );
    const stale = Date.now() - Date.parse(claim.heartbeatAt) > STALE_MS;
    console.log(
      `\n${claim.task} | owner=${claim.owner}${claim.pid ? ` | informational pid=${claim.pid}` : ""}`,
    );
    console.log(`  worktree=${claim.worktree} | baseHead=${claim.baseHead}`);
    console.log(
      `  heartbeat=${claim.heartbeatAt} (${Math.max(0, ageMinutes)} min ago)${stale ? " | WARNING: STALE; reservation remains owned" : ""}`,
    );
    console.log(`  paths: ${claim.writePaths.join(", ") || "(none)"}`);
    console.log(`  resources: ${claim.resources.join(", ") || "(none)"}`);
    if (claim.adoptedDirtyPaths?.length)
      console.log(
        `  adopted dirty paths: ${claim.adoptedDirtyPaths.join(", ")}`,
      );
    const task = tasks.get(claim.task);
    if (
      !task ||
      JSON.stringify([task.writePaths, task.resources]) !==
        JSON.stringify([claim.writePaths, claim.resources])
    ) {
      console.log(
        "  WARNING: definition changed or missing; reservation keeps its original scope until release",
      );
    }
  }
  console.log("\nTasks:");
  for (const task of tasks.values()) {
    const reservation = registry.claims.find((claim) => claim.task === task.id);
    const dependencies = task.dependsOn.filter(
      (id) => tasks.get(id).status !== "done",
    );
    const collisions = registry.claims.filter(
      (claim) => claim.task !== task.id && conflicts(task, claim).length > 0,
    );
    console.log(
      `  ${task.id}: ${task.status}${reservation ? ` | owned by ${reservation.owner}` : ""}${dependencies.length ? ` | waiting for ${dependencies.join(", ")}` : ""}${collisions.length ? ` | conflicts with ${collisions.map((claim) => `${claim.task} (${claim.owner})`).join(", ")}` : ""} | ${task.title}`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help") {
    console.log(usage);
    return;
  }
  const ctx = await context();
  await withLock(ctx, async () => {
    const registry = await readRegistry(ctx);
    if (["status", "validate", "claim"].includes(options.command)) {
      const tasks = await readTasks(ctx.worktree);
      if (options.command === "status") {
        await printStatus(ctx, tasks, registry);
        return;
      }
      if (options.command === "validate") {
        for (const task of tasks.values())
          await checkScopeFilesystem(ctx.worktree, task.writePaths);
        console.log(
          `Valid: ${tasks.size} task definitions, ${registry.claims.length} active reservations. Planned task scopes may overlap; claims serialize them.`,
        );
        return;
      }
      const task = tasks.get(options.task);
      requireThat(task, `Unknown task ${options.task}`);
      requireThat(
        task.status === "ready",
        `Task ${task.id} is ${task.status}, not ready`,
      );
      const dependencies = task.dependsOn.filter(
        (id) => tasks.get(id).status !== "done",
      );
      requireThat(
        dependencies.length === 0,
        `Task ${task.id} waits for completed dependencies: ${dependencies.join(", ")}`,
      );
      for (const claim of registry.claims) {
        requireThat(
          claim.task !== task.id,
          `Task ${task.id} is already owned by ${claim.owner}; use heartbeat or an owner-authorized release`,
        );
        const overlap = conflicts(task, claim);
        requireThat(
          overlap.length === 0,
          `Reservation conflict with ${claim.task} owned by ${claim.owner}: ${overlap.join(", ")}`,
        );
      }
      await checkScopeFilesystem(ctx.worktree, task.writePaths);
      const dirty = (await dirtyPaths(ctx.worktree)).filter((file) =>
        task.writePaths.some((scope) => pathsOverlap(scope, file)),
      );
      requireThat(
        dirty.length === 0 || options.adoptDirty,
        `Existing dirty paths overlap task ${task.id}:\n${dirty.map((file) => `  ${file}`).join("\n")}\nNo reservation created. Use --adopt-dirty only after a documented coordinator handoff; do not overwrite unknown work.`,
      );
      for (const file of dirty) validateWritePath(file, "Dirty path");
      const stamp = new Date().toISOString();
      registry.claims.push({
        task: task.id,
        owner: options.owner,
        ...(options.pid === undefined ? {} : { pid: options.pid }),
        worktree: ctx.worktree,
        baseHead: (await git(ctx.worktree, "rev-parse", "HEAD")).trim(),
        claimedAt: stamp,
        heartbeatAt: stamp,
        writePaths: task.writePaths,
        resources: task.resources,
        ...(dirty.length ? { adoptedDirtyPaths: dirty } : {}),
      });
      await saveRegistry(ctx, registry);
      console.log(
        `Claimed ${task.id} for ${options.owner}. Heartbeat at least every 15 minutes; release when finished.`,
      );
      if (dirty.length)
        console.log(
          `Adopted ${dirty.length} existing dirty path(s); documented handoff remains required.`,
        );
      return;
    }
    const claim = registry.claims.find((entry) => entry.task === options.task);
    requireThat(claim, `Task ${options.task} has no active reservation`);
    requireThat(
      claim.owner === options.owner,
      `Owner mismatch: ${options.task} belongs to ${claim.owner}, not ${options.owner}`,
    );
    if (options.command === "heartbeat") {
      requireThat(
        sameWorktree(claim.worktree, ctx.worktree),
        `Heartbeat must run in the owning worktree: ${claim.worktree}`,
      );
      claim.heartbeatAt = new Date(
        Math.max(Date.now(), Date.parse(claim.claimedAt)),
      ).toISOString();
    } else registry.claims = registry.claims.filter((entry) => entry !== claim);
    await saveRegistry(ctx, registry);
    console.log(
      `${options.command === "heartbeat" ? "Heartbeat recorded for" : "Released"} ${claim.task} (${claim.owner}).`,
    );
  });
}

main().catch((error) => {
  console.error(`agent-tasks: ${error.message}`);
  process.exitCode = 1;
});
