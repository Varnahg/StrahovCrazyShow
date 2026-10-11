/** Documentation validation runs against the publication checkout, separately
 * from immutable gameplay snapshots whose evolving evidence/docs are excluded. */
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const reports = [];
for (const name of ["README.md", "README.cs.md"]) {
  const bytes = await readFile(resolve(root, name));
  const source = bytes.toString("utf8");
  let links = 0;
  for (const [, target] of source.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(target)) continue;
    const file = resolve(root, target.split("#")[0]);
    assert.ok(
      file.startsWith(root + sep),
      `README link escapes repository: ${target}`,
    );
    await access(file);
    links++;
  }
  if (name === "README.md")
    assert.match(source, /\[Česká verze \/ Czech version\]\(README.cs.md\)/);
  reports.push({
    name,
    localLinks: links,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
console.log(
  JSON.stringify({
    status: "passed",
    scope:
      "Publication README files and their existing local link targets; separate from runtime performance source ID.",
    reports,
  }),
);
