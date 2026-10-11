import fs from "node:fs";
import crypto from "node:crypto";
const files = [
  "AGENTS.md",
  "tests/physics.test.ts",
  "tests/stability.test.ts",
  "tests/netcode.test.ts",
  "shared/simulation.ts",
  "shared/vehicle.ts",
  "shared/netcode.ts",
  "shared/terrain.ts",
  "shared/terrain-entities.ts",
  "shared/world.ts",
  "shared/b6-interior.ts",
  "shared/b6-props.ts",
  "shared/streets.ts",
  "shared/transit.ts",
  "shared/data/map.json",
  "shared/data/terrain-grid.json",
  "shared/data/reality-ground.json",
  "shared/data/transit-navigation.json",
  "public/models/b6/manifest.json",
  "public/models/environment/manifest.json",
];
const sources = files.map((file) => ({
  file,
  sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex"),
}));
const report = {
  capturedAt: new Date().toISOString(),
  scope:
    "Targeted physics-validation context, including tests. This is not a production GPU performance snapshot and does not replace the coordinator's final full test/build/integration run.",
  sourceHash: crypto
    .createHash("sha256")
    .update(sources.map((f) => f.file + ":" + f.sha256).join("\n"))
    .digest("hex"),
  sources,
};
fs.writeFileSync(
  "docs/reality-pack/physics-validation/source-snapshot.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      capturedAt: report.capturedAt,
      sourceHash: report.sourceHash,
      files: files.length,
    },
    null,
    2,
  ),
);
