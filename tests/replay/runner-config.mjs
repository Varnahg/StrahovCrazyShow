import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createIsolatedIntegrationEnvironment } from "../../scripts/test-integration.mjs";

/** Reuse the integration provider isolation; a replay must never serve an
 * inherited production dist or connect its browser to an external endpoint. */
export function createReplayEnvironment(environment, feedbackDirectory) {
  return createIsolatedIntegrationEnvironment(
    Object.fromEntries(Object.entries(environment).filter(([key]) =>
      !/^(?:STATIC_DIR$|VITE_)/i.test(key))),
    feedbackDirectory,
  );
}

export function parseReplayArguments(arguments_) {
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0]))
    return { help: true, buildOnly: false, skipBuild: false };
  const args = new Set(arguments_);
  if (args.size !== arguments_.length ||
      [...args].some(arg => !["--build-only", "--skip-build"].includes(arg)) ||
      (args.has("--build-only") && args.has("--skip-build")))
    throw new Error("Usage: node tests/replay/run.mjs [--build-only|--skip-build|--help]");
  return { help: false, buildOnly: args.has("--build-only"), skipBuild: args.has("--skip-build") };
}

function replaceOnce(source, before, after, contract) {
  if (source.split(before).length !== 2)
    throw new Error(contract + " changed; test injection refused");
  return source.replace(before, after);
}

/** The isolated build uses the public solo action and replaces its bootstrap. */
export function createReplayBuildPlugin(root, sourceHash) {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error("Invalid replay source hash");
  const welcome = resolve(root, "client/welcome-screen.tsx").replaceAll("\\", "/");
  return {
    name: "recorded-walkthrough-test-only",
    enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0].replaceAll("\\", "/") !== welcome) return null;
      replaceOnce(code, 'enter("guest")', 'enter("guest")', "Guest entry");
      return null;
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const bootstrap = replaceOnce(html, 'src="/client/main.tsx"',
          'src="/tests/replay/browser-entry.ts"', "Production bootstrap");
        return replaceOnce(bootstrap, "</head>",
          '<meta name="replay-source" content="' + sourceHash + '"></head>', "Document head");
      },
    },
  };
}

export async function readReplaySourceManifest(root) {
  if (
    execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--ignored=matching", "--", "public"],
      { cwd: root, encoding: "utf8" },
    ).trim()
  )
    throw new Error(
      "Public assets differ from the pinned Git tree; replay refused",
    );
  const publicGitTree = execFileSync("git", ["rev-parse", "HEAD:public"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const names = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "client",
      "server",
      "shared",
      "scripts",
      "tests",
      "patches",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".npmrc",
      ".gitattributes",
      "tsconfig.json",
      "vite.config.ts",
      "index.html",
      "docs/reality-pack/landmarks/geometry-source.json",
      // Regression evidence consumed by gameplay-acceptance.test.ts is an
      // actual test input, even though it lives beside the performance report.
      "docs/performance/evidence/gameplay-frame-cost-20261103/user-playtest-20261104/recording.jsonl.gz",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const files = {};
  for (const name of names)
    files[name] = createHash("sha256")
      .update(await readFile(resolve(root, name)))
      .digest("hex");
  return {
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    publicGitTree,
    sourceHash: createHash("sha256")
      .update(JSON.stringify({ files, publicGitTree }))
      .digest("hex"),
    files,
  };
}

/** Source/public inputs are served from the checkout. Revalidate at the report
 * boundary so a run cannot be accepted under an obsolete client source hash. */
export async function saveVerifiedReplayReport(root, expected, report, filename) {
  if (report.sourceHash !== expected.sourceHash) throw new Error("Invalid report source identity");
  const current = await readReplaySourceManifest(root);
  if (current.sourceHash !== expected.sourceHash || current.publicGitTree !== expected.publicGitTree)
    throw new Error("Replay sources or public assets changed during the run; report refused");
  await writeFile(filename, JSON.stringify({ ...report, sourceRevalidated: true, publicGitTree: current.publicGitTree }, null, 2) + "\n", { flag: "wx" });
}
