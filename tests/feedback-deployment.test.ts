import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { runFeedbackIntegration } from "../scripts/integration-feedback";

// Import guarded CLI modules without launching Docker, a port or a server.
const docker = await import(
  new URL("../scripts/test-docker.mjs", import.meta.url).href
);
const integration = await import(
  new URL("../scripts/test-integration.mjs", import.meta.url).href
);

test("Docker build runs the frozen dependency tree without an implicit pnpm install", async () => {
  const dockerfile = await readFile(
    new URL("../Dockerfile", import.meta.url),
    "utf8",
  );
  const invocation = dockerfile.match(
    /^RUN VITE_MULTIPLAYER_URL=\/ pnpm ([^\r\n]+)$/m,
  )?.[1];
  assert.ok(invocation);
  const arguments_ = invocation.trim().split(/\s+/);
  assert.ok(arguments_.every((value) => /^[-a-zA-Z0-9_.=]+$/.test(value)));
  const pnpmEntry = process.env.npm_execpath;
  // pnpm run exports npm_execpath; targeted pnpm exec on Windows may not.
  const command = pnpmEntry
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "pnpm";
  const commandArguments = pnpmEntry
    ? [pnpmEntry, ...arguments_]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", ["pnpm", ...arguments_].join(" ")]
      : arguments_;
  const directory = await mkdtemp(join(tmpdir(), "feedback-docker-pnpm-"));
  try {
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "feedback-build-probe",
        private: true,
        scripts: { build: "node probe.mjs" },
        dependencies: {
          ["feedback-install-must-not-run-" + randomUUID()]: "0.0.0",
        },
      }),
    );
    await writeFile(
      join(directory, "pnpm-workspace.yaml"),
      "packages:\n  - '.'\n",
    );
    await writeFile(
      join(directory, "probe.mjs"),
      "import {writeFileSync} from 'node:fs'; writeFileSync('build-ran.txt','verified-build');\n",
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      npm_config_offline: "true",
      pnpm_config_offline: "true",
    };
    for (const key of Object.keys(env))
      if (/^LINEAR_/i.test(key)) delete env[key];
    await promisify(execFile)(command, commandArguments, {
      cwd: directory,
      env,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(
      await readFile(join(directory, "build-ran.txt"), "utf8"),
      "verified-build",
    );
    assert.equal(
      (await readdir(directory)).includes("node_modules"),
      false,
      "A build must not replace or reinstall the already frozen dependency tree",
    );
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("feedback-docker-pnpm-"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("isolated integration excludes inherited feedback/Linear/OpenAI/RAG settings while preserving NODE_OPTIONS", () => {
  const directory = join(tmpdir(), "strahov-integration-feedback-unit");
  const env = integration.createIsolatedIntegrationEnvironment(
    {
      PATH: "runtime-path",
      NODE_OPTIONS: "--max-old-space-size=512",
      PORT: "9999",
      HOST: "0.0.0.0",
      LINEAR_API_KEY: "fake-private-key",
      LINEAR_ACCESS_TOKEN: "fake-private-token",
      LINEAR_TEAM_ID: "production-team",
      LINEAR_PROJECT_ID: "production-project",
      LINEAR_STATUS_ID: "production-status",
      linear_other_config: "excluded",
      FEEDBACK_DIR: "production-spool",
      FEEDBACK_ALLOWED_ORIGINS: "https://production.example.invalid",
      FEEDBACK_OTHER_CONFIG: "excluded",
      OPENAI_API_KEY: "fake-ai-key",
      openai_model: "production-model",
      OPENAI_REASONING_EFFORT: "high",
      CRAZY_TYPKA_ENABLED: "1",
      crazy_typka_allowed_origins: "https://production.example.invalid",
      CRAZY_TYPKA_GENERATIONS_PER_PROCESS: "500",
      RAG_DATABASE_URL: "postgresql://fake:fake@production.invalid/private",
      rag_test_database_url: "postgresql://fake:fake@production.invalid/test",
      RAG_MAX_COSINE_DISTANCE: "0.5",
    },
    directory,
  );
  assert.deepEqual(env, {
    PATH: "runtime-path",
    NODE_OPTIONS: "--max-old-space-size=512",
    PORT: "2568",
    HOST: "127.0.0.1",
    FEEDBACK_DIR: directory,
    STRAHOV_TEST_URL: "http://127.0.0.1:2568",
  });
  assert.throws(() =>
    integration.createIsolatedIntegrationEnvironment({}, ".cache/feedback"),
  );
});

test("cleanup guard permits only a direct owned temporary spool path", () => {
  integration.assertOwnedFeedbackDirectory(
    join(tmpdir(), "strahov-integration-feedback-owned"),
  );
  for (const directory of [
    tmpdir(),
    resolve(".cache/feedback"),
    join(tmpdir(), "user-feedback"),
    join(tmpdir(), "strahov-integration-feedback-owned", "nested"),
  ])
    assert.throws(() => integration.assertOwnedFeedbackDirectory(directory));
});

test("Docker runtime requires exactly the disposable named volume and rejects host binds/other mounts", () => {
  const project = "strahov-docker-test-123-456",
    volume = docker.disposableFeedbackVolumeName(project);
  const mount = {
    Type: "volume",
    Name: volume,
    Destination: "/data/feedback",
    RW: true,
  };
  docker.assertDockerFeedbackMounts([mount], project);
  for (const mounts of [
    [],
    [mount, mount],
    [{ ...mount, Type: "bind" }],
    [{ ...mount, Name: "production_feedback-data" }],
    [{ ...mount, Destination: "/app/.cache/feedback" }],
    [{ ...mount, RW: false }],
  ])
    assert.throws(() => docker.assertDockerFeedbackMounts(mounts, project));
  assert.throws(() => docker.disposableFeedbackVolumeName("production"));
});

test("Docker cleanup validates exact project ownership and cannot delete user/external/bind-backed volumes", () => {
  const project = "strahov-docker-test-123-456";
  const volume = {
    Name: docker.disposableFeedbackVolumeName(project),
    Driver: "local",
    Options: null,
    Labels: {
      "com.docker.compose.project": project,
      "com.docker.compose.volume": "feedback-data",
    },
  };
  docker.assertDisposableFeedbackVolume(volume, project);
  for (const changed of [
    { ...volume, Name: "production_feedback-data" },
    { ...volume, Labels: {} },
    {
      ...volume,
      Labels: { ...volume.Labels, "com.docker.compose.project": "production" },
    },
    { ...volume, Options: { type: "none", o: "bind", device: "/user/data" } },
  ])
    assert.throws(() =>
      docker.assertDisposableFeedbackVolume(changed, project),
    );
});

test("Docker image and Compose share the writable feedback path and forward optional auth/status settings", async () => {
  const dockerfile = await readFile(
    new URL("../Dockerfile", import.meta.url),
    "utf8",
  );
  const runtime = dockerfile.split(/^FROM\s+[^\n]*\bAS runtime\s*$/im)[1];
  assert.ok(runtime, "Dockerfile declares a runtime stage");
  const instructions = runtime.replace(/\\\r?\n\s*/g, " ").split(/\r?\n/);
  const assignments = instructions
    .filter((line) => /^ENV\s/.test(line))
    .join(" ");
  const feedbackPath = assignments.match(/(?:^|\s)FEEDBACK_DIR=(\S+)/)?.[1];
  assert.equal(
    feedbackPath,
    "/data/feedback",
    "Bare docker run must use the owned writable directory too",
  );
  assert.ok(instructions.includes("USER node"));
  const compose = await readFile(
    new URL("../compose.yaml", import.meta.url),
    "utf8",
  );
  const settings = Object.fromEntries(
    [...compose.matchAll(/^      ([A-Z_]+):\s*([^\r\n]*)$/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  assert.equal(settings.FEEDBACK_DIR, feedbackPath);
  for (const key of [
    "FEEDBACK_ALLOWED_ORIGINS",
    "LINEAR_API_KEY",
    "LINEAR_ACCESS_TOKEN",
    "LINEAR_TEAM_ID",
    "LINEAR_PROJECT_ID",
    "LINEAR_STATUS_ID",
  ])
    assert.equal(
      settings[key],
      "${" + key + ":-}",
      `${key} is explicit configuration with an empty safe default`,
    );
  assert.match(compose, /^      - feedback-data:\/data\/feedback\s*$/m);
});

async function withSpool(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(
    join(tmpdir(), "strahov-integration-feedback-test-"),
  );
  try {
    await action(directory);
  } finally {
    integration.assertOwnedFeedbackDirectory(directory);
    await rm(directory, { recursive: true, force: true });
  }
}
function simulatedFeedbackServer(
  directory: string,
  corruptPersistedMessage = false,
) {
  const accepted = new Map<string, { content: string; receipt: object }>();
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), "http://127.0.0.1:2568/api/feedback");
    assert.equal(
      new Headers(init?.headers).get("origin"),
      "http://127.0.0.1:2568",
    );
    assert.ok(init?.body instanceof FormData);
    const report = JSON.parse(String(init.body.get("metadata")));
    if (!report.context.clientBuildId.trim())
      return new Response("{}", { status: 400 });
    const content = JSON.stringify(report),
      previous = accepted.get(report.id);
    if (previous && previous.content !== content)
      return new Response("{}", { status: 409 });
    const receipt = previous?.receipt ?? {
      accepted: true,
      id: report.id,
      receivedAtUTC: new Date().toISOString(),
    };
    if (!previous) {
      await mkdir(join(directory, report.id));
      await writeFile(
        join(directory, report.id, "report.json"),
        JSON.stringify({
          report: {
            ...report,
            ...(corruptPersistedMessage
              ? { message: "incorrect durable content" }
              : {}),
          },
          receipt,
          hash: createHash("sha256").update(content).digest("hex"),
        }),
      );
      await writeFile(
        join(directory, report.id, "delivery.json"),
        JSON.stringify({ stage: "pending-config" }),
      );
      accepted.set(report.id, { content, receipt });
    }
    return new Response(JSON.stringify(receipt), {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  };
  return { fetcher, calls: () => calls };
}
test("feedback integration checks persisted receipt, replay/conflict and malformed metadata without a live service", () =>
  withSpool(async (directory) => {
    const server = simulatedFeedbackServer(directory);
    await runFeedbackIntegration({
      env: {
        STRAHOV_TEST_URL: "http://127.0.0.1:2568",
        FEEDBACK_DIR: directory,
      },
      fetch: server.fetcher,
    });
    assert.equal(server.calls(), 4);
    assert.equal((await readdir(directory)).length, 1);
  }));
test("feedback integration detects a server receipt whose persisted content is incorrect", () =>
  withSpool(async (directory) => {
    const server = simulatedFeedbackServer(directory, true);
    await assert.rejects(
      runFeedbackIntegration({
        env: {
          STRAHOV_TEST_URL: "http://127.0.0.1:2568",
          FEEDBACK_DIR: directory,
        },
        fetch: server.fetcher,
      }),
      /incorrect durable content/,
    );
  }));
