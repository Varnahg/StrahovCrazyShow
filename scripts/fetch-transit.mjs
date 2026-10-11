/** Stdlib launcher: reuse Python shipped with the user's existing Blender. */
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
let python = process.env.STRAHOV_PYTHON;
if (!python && process.platform === "win32") {
  const base = join(
    process.env.ProgramFiles || "C:/Program Files",
    "Blender Foundation",
  );
  if (existsSync(base))
    for (const folder of readdirSync(base).sort().reverse()) {
      const install = join(base, folder);
      if (!folder.startsWith("Blender ")) continue;
      for (const version of readdirSync(install)
        .filter((v) => /^\d+\.\d+$/.test(v))
        .sort()
        .reverse()) {
        const candidate = join(install, version, "python", "bin", "python.exe");
        if (existsSync(candidate)) {
          python = candidate;
          break;
        }
      }
      if (python) break;
    }
}
python ||= process.platform === "win32" ? "py" : "python3";
const args = [
  ...(python === "py" ? ["-3"] : []),
  join(root, "scripts", "fetch-transit.py"),
  ...process.argv.slice(2),
];
const result = spawnSync(python, args, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  windowsHide: true,
});
if (result.error) {
  console.error(
    "Python 3 není dostupný. Nastavte STRAHOV_PYTHON na cestu k Pythonu, nebo použijte nainstalovaný Blender.",
  );
  console.error(result.error.message);
}
if (result.status === 0) {
  // Entrances and routes come from the same TypeScript geometry as rendering
  // and collision. Never re-infer west-facing thresholds in the GTFS importer.
  const navigation = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(root, "scripts", "rebuild-campus-transit-navigation.ts"),
    ],
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  if (navigation.error) console.error(navigation.error.message);
  process.exitCode = navigation.status ?? 1;
} else process.exitCode = result.status ?? 1;
