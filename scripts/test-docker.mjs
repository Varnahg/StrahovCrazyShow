import assert from "node:assert/strict";
import { spawn, fork } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export function disposableFeedbackVolumeName(project) {
  assert.match(project, /^strahov-docker-test-\d+-\d+$/);
  return project + "_feedback-data";
}
export function assertDockerFeedbackMounts(mounts, project) {
  assert.equal(mounts.length, 1, "Runtime má právě jeden feedback volume.");
  const mount = mounts[0];
  assert.equal(
    mount.Type,
    "volume",
    "Hostitelské bind mounty nejsou povolené.",
  );
  assert.equal(mount.Name, disposableFeedbackVolumeName(project));
  assert.equal(mount.Destination, "/data/feedback");
  assert.equal(mount.RW, true, "Feedback volume musí být zapisovatelný.");
}
export function assertDisposableFeedbackVolume(volume, project) {
  assert.equal(volume.Name, disposableFeedbackVolumeName(project));
  assert.equal(volume.Labels?.["com.docker.compose.project"], project);
  assert.equal(volume.Labels?.["com.docker.compose.volume"], "feedback-data");
  assert.equal(volume.Driver, "local");
  assert.equal(
    Object.keys(volume.Options ?? {}).length,
    0,
    "Named volume nesmí mapovat hostitelský adresář.",
  );
}

async function main() {
  if (!existsSync(chromium.executablePath()))
    throw new Error(
      "Chybí testovací Chromium. Spusť pnpm exec playwright install chromium (na Linuxu případně --with-deps).",
    );

  const port = Number(process.env.STRAHOV_DOCKER_TEST_PORT || 18080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Neplatný STRAHOV_DOCKER_TEST_PORT.");
  const project = "strahov-docker-test-" + process.pid + "-" + Date.now();
  const env = {
    ...process.env,
    BIND_ADDRESS: "127.0.0.1",
    HTTP_PORT: String(port),
    STRAHOV_TEST_URL: "http://127.0.0.1:" + port,
    LINEAR_API_KEY: "",
    LINEAR_ACCESS_TOKEN: "",
    LINEAR_TEAM_ID: "",
    LINEAR_PROJECT_ID: "",
    LINEAR_STATUS_ID: "",
    FEEDBACK_ALLOWED_ORIGINS: "",
  };
  const compose = [
    "compose",
    "--project-name",
    project,
    "--file",
    "compose.yaml",
  ];
  const cancellation = new AbortController();
  let client;
  function terminateOwned(child, signal = "SIGTERM") {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
      return;
    if (process.platform === "win32") {
      // docker.exe launches Compose/Buildx plugins. Killing only the wrapper
      // leaves their pipes open and the build running after the timeout.
      const killer = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          windowsHide: true,
          stdio: "ignore",
        },
      );
      killer.on("error", () => child.kill(signal));
    } else {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
  const interrupt = () => {
    process.exitCode = 130;
    cancellation.abort();
    terminateOwned(client);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  function run(command, args, options = {}) {
    if (!options.cleanup && cancellation.signal.aborted)
      return Promise.reject(new Error("Docker test byl přerušen."));
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: options.env || env,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: options.capture
          ? ["ignore", "pipe", "pipe"]
          : ["ignore", "inherit", "inherit"],
      });
      let output = "";
      let stderr = "";
      let failure;
      let forceKill;
      const stop = (reason) => {
        if (failure) return;
        failure = reason;
        terminateOwned(child);
        forceKill = setTimeout(() => terminateOwned(child, "SIGKILL"), 5000);
      };
      const aborted = () => stop(new Error("Docker test byl přerušen."));
      if (!options.cleanup)
        cancellation.signal.addEventListener("abort", aborted, { once: true });
      const timeout = setTimeout(
        () =>
          stop(new Error("Časový limit: " + command + " " + args.join(" "))),
        options.timeoutMs ?? 120_000,
      );
      if (options.capture) {
        child.stdout.on("data", (data) => (output += data));
        child.stderr.on("data", (data) => (stderr += data));
      }
      child.once("error", (error) => {
        failure = error;
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        clearTimeout(forceKill);
        cancellation.signal.removeEventListener("abort", aborted);
        if (failure) reject(failure);
        else if (code === 0) {
          if (stderr.trim()) console.error(stderr.trim());
          resolve(output.trim());
        } else
          reject(
            new Error(
              command +
                " " +
                args.join(" ") +
                " skončil " +
                code +
                "\n" +
                output +
                stderr,
            ),
          );
      });
    });
  }
  const dc = (...args) => run("docker", [...compose, ...args]);
  await run("docker", ["info", "--format", "{{.OSType}}"], {
    capture: true,
  }).then((value) => {
    assert.equal(value, "linux", "Test vyžaduje běžící Linux Docker engine.");
  });
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
  });
  let clientClosed;
  let clientDeadline;
  let upAttempted = false;
  try {
    await dc("config", "--quiet");
    upAttempted = true;
    await run(
      "docker",
      [
        ...compose,
        "up",
        "--detach",
        "--build",
        "--wait",
        "--wait-timeout",
        "180",
      ],
      { timeoutMs: 20 * 60_000 },
    );
    const id = await run("docker", [...compose, "ps", "--quiet", "game"], {
      capture: true,
    });
    assert.ok(id && !id.includes("\n"), "Právě jeden kontejner.");
    const inspect = JSON.parse(
      await run("docker", ["inspect", id], { capture: true }),
    )[0];
    assert.equal(inspect.Config.User, "node");
    assertDockerFeedbackMounts(inspect.Mounts, project);
    assert.equal(inspect.State.Health.Status, "healthy");
    await run(process.execPath, [
      "--import",
      "tsx",
      "scripts/integration-docker.ts",
      "--browser",
    ]);
    await run(process.execPath, ["--import", "tsx", "scripts/integration.ts"]);
    let readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const timer = setTimeout(
      () => readyReject(new Error("Lifecycle klient se nepřipravil.")),
      45_000,
    );
    client = fork(
      new URL("./integration-docker.ts", import.meta.url),
      ["--lifecycle"],
      {
        execArgv: ["--import", "tsx"],
        env,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      },
    );
    let observedClose = false;
    // A child-side timeout cannot bound a stuck SDK cleanup. The parent owns
    // a hard deadline for the entire fork, including readiness and shutdown.
    clientDeadline = setTimeout(() => {
      console.error(
        "Časový limit lifecycle klienta; ukončuji vlastní podproces.",
      );
      terminateOwned(client, "SIGKILL");
    }, 90_000);
    client.on("message", (message) => {
      if (message.kind === "ready") readyResolve(message);
      if (message.kind === "closed") observedClose = true;
    });
    clientClosed = new Promise((resolve) => {
      client.once("error", (error) => {
        readyReject(error);
        resolve({ error });
      });
      client.once("exit", (code) => {
        if (code !== 0)
          readyReject(new Error("Lifecycle klient skončil " + code));
        resolve({ code });
      });
    });
    const old = await ready.finally(() => clearTimeout(timer));
    await dc("stop", "--timeout", "30", "game");
    const result = await clientClosed;
    assert.equal(result.code, 0);
    assert.ok(observedClose, "SIGTERM musí odpojit připojené klienty.");
    const stopped = JSON.parse(
      await run("docker", ["inspect", id], { capture: true }),
    )[0];
    assert.equal(
      stopped.State.ExitCode,
      0,
      "Kontejner musí skončit bez SIGKILL.",
    );
    assert.equal(stopped.State.OOMKilled, false);
    await run(
      "docker",
      [...compose, "up", "--detach", "--wait", "--wait-timeout", "180"],
      { timeoutMs: 210_000 },
    );
    await run(
      process.execPath,
      ["--import", "tsx", "scripts/integration-docker.ts"],
      {
        env: {
          ...env,
          STRAHOV_OLD_WORLD: old.worldId,
          STRAHOV_OLD_ID: old.id,
          STRAHOV_OLD_TOKEN: old.token,
        },
      },
    );
    console.log(
      "PASS Docker image, Compose, skutečná herní integrace, SIGTERM a restart.",
    );
  } finally {
    clearTimeout(clientDeadline);
    if (client && client.exitCode === null && client.signalCode === null) {
      terminateOwned(client);
      await clientClosed;
    }
    if (upAttempted) {
      await run("docker", [...compose, "logs", "--no-color", "--tail", "70"], {
        cleanup: true,
        timeoutMs: 30_000,
      }).catch((error) => console.error(error.message));
      await run("docker", [...compose, "down", "--timeout", "30"], {
        cleanup: true,
        timeoutMs: 60_000,
      });
      // Only this unique disposable project's exact volume is eligible. Never
      // use volume prune or compose down --volumes against user configuration.
      const volumeName = disposableFeedbackVolumeName(project);
      const existingVolume = await run(
        "docker",
        ["volume", "ls", "--quiet", "--filter", "name=^" + volumeName + "$"],
        {
          cleanup: true,
          capture: true,
          timeoutMs: 30_000,
        },
      );
      if (existingVolume) {
        assert.equal(existingVolume, volumeName);
        const volume = JSON.parse(
          await run("docker", ["volume", "inspect", volumeName], {
            cleanup: true,
            capture: true,
            timeoutMs: 30_000,
          }),
        )[0];
        assertDisposableFeedbackVolume(volume, project);
        await run("docker", ["volume", "rm", volumeName], {
          cleanup: true,
          timeoutMs: 30_000,
        });
      }
    }
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
