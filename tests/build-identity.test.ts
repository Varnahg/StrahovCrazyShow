import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("client identity hashes public inputs and ignores credentials, timestamps and server runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "feedback-build-"));
  const script = fileURLToPath(
    new URL("../scripts/build-identity.mjs", import.meta.url),
  );
  const identity = () =>
    execFileSync(process.execPath, [script, "--root", root], {
      encoding: "utf8",
      windowsHide: true,
    });
  try {
    for (const name of ["client", "shared", "server", ".cache"])
      await mkdir(join(root, name));
    const source = join(root, "client/a.ts");
    await writeFile(source, "export const visible = 1;");
    await writeFile(join(root, "shared/world.ts"), "export const x = 1;");
    const original = identity();
    assert.match(original, /^sha256-[a-f0-9]{64}$/);
    assert.equal(identity(), original);
    await writeFile(
      join(root, ".cache/private.env"),
      "LINEAR_API_KEY=private-test-value",
    );
    await writeFile(join(root, "server/runtime.ts"), "private-server-input");
    await utimes(source, 10, 20);
    assert.equal(identity(), original);
    await writeFile(source, "export const visible = 2;");
    assert.notEqual(identity(), original);
    const second = identity();
    await writeFile(join(root, "client/a.css"), "canvas { color: red; }");
    assert.notEqual(identity(), second);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
