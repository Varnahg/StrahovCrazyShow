import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { buildArchitectureReality } from "../../../client/architecture-reality";
const engine = new NullEngine(),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
const pack = buildArchitectureReality({ scene });
const enabledGeometry = [];
for (const p of [
  { id: "spawn", x: 22, z: -14 },
  { id: "B6 reception", x: -8, z: -73 },
  { id: "central campus", x: 130, z: 12 },
  { id: "B12", x: 303, z: 43 },
]) {
  pack.update(p, "low");
  const enabled = scene.meshes.filter((m) => m.isEnabled());
  enabledGeometry.push({
    ...p,
    meshCount: enabled.length,
    triangleEstimate: enabled.reduce((s, m) => s + m.getTotalIndices() / 3, 0),
  });
}
const files = [
  "client/architecture-reality.ts",
  "shared/data/facade-reality.json",
  "tests/architecture-reality.test.ts",
  "scripts/create-architecture-reality.py",
  "shared/data/building-catalog.json",
  "shared/data/map.json",
  "shared/world.ts",
  ...fs
    .readdirSync("public/models/architecture/textures")
    .map((f) => "public/models/architecture/textures/" + f),
];
const sources = files.map((file) => ({
  file,
  sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex"),
}));
const manifest = JSON.parse(
  fs.readFileSync("public/models/architecture/manifest.json", "utf8"),
);
const modules = manifest.assets.map((asset: any) => {
  const bytes = fs.readFileSync("public" + asset.url);
  if (bytes.toString("ascii", 0, 4) !== "glTF")
    throw Error(asset.id + " not GLB");
  const length = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.toString("utf8", 20, 20 + length));
  const triangles = json.meshes.reduce(
    (s: number, m: any) =>
      s +
      m.primitives.reduce(
        (n: number, p: any) =>
          n +
          (p.indices === undefined ? 0 : json.accessors[p.indices].count / 3),
        0,
      ),
    0,
  );
  if (triangles !== asset.triangleCount)
    throw Error(asset.id + " triangle manifest mismatch");
  return {
    id: asset.id,
    triangleCount: triangles,
    byteLength: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
});
const output = {
  checkedAt: new Date().toISOString(),
  description:
    "Geometry/assets audit, not a GPU performance measurement. Browser visual checks recorded separately.",
  metrics: pack.metrics,
  enabledGeometry,
  sourceHash: crypto
    .createHash("sha256")
    .update(sources.map((s) => s.file + ":" + s.sha256).join("\n"))
    .digest("hex"),
  sources,
  modules,
};
fs.writeFileSync(
  path.join("docs/reality-pack/architecture", "audit.json"),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      metrics: pack.metrics,
      enabledGeometry,
      sourceHash: output.sourceHash,
      modules,
    },
    null,
    2,
  ),
);
pack.dispose();
scene.dispose();
engine.dispose();
