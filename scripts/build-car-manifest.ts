import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const output = [];
const audit = JSON.parse(
  await readFile(
    "assets/blender/vehicles/innerscene-hatchback/runtime-pack-audit.json",
    "utf8",
  ),
);
for (const level of ["near", "medium", "far"]) {
  const path = "public/models/vehicles/campus-hatchback-" + level + ".glb",
    bytes = await readFile(path),
    json = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
  output.push({
    level,
    url: "/models/vehicles/campus-hatchback-" + level + ".glb",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    triangles: json.meshes.reduce(
      (sum: number, m: any) =>
        sum +
        m.primitives.reduce(
          (n: number, p: any) => n + json.accessors[p.indices].count / 3,
          0,
        ),
      0,
    ),
    parts: json.meshes.length,
  });
}
const manifest = {
  schemaVersion: 1,
  assetId: "campus-hatchback",
  license: "CC0",
  source:
    "https://www.innerscene.com/tools/library/3d-parts/blue-five-door-compact-hatchback-5b95b2a0",
  sourceSha256:
    "107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7",
  sourceFile:
    "assets/blender/vehicles/innerscene-hatchback/original-source.glb",
  editableMaster:
    "assets/blender/vehicles/innerscene-hatchback/campus-hatchback-master.blend",
  classification: "generic-normalized-game-car-not-a-surveyed-Strahov-vehicle",
  units: "metres",
  dimensions: { width: 2.04, height: 1.56, length: 3.56 },
  wheelRadius: 0.34,
  wheelCentres: [
    [-0.85, 0.36, 1.05],
    [0.85, 0.36, 1.05],
    [-0.85, 0.36, -1.05],
    [0.85, 0.36, -1.05],
  ],
  groundOriginOffset: -0.0112,
  paintMaterial: "Campus enamel",
  glassMaterial: "Window glass",
  lights: {
    frontLensMaterial: "Front headlamp lens",
    rearLensMaterial: "Rear position lamp lens",
    brakeLensMaterial: "Rear brake strip lens",
    frontCentres: audit.lightGeometry.front.centresGameMetres,
    rearCentres: audit.lightGeometry.rear.centresGameMetres,
    provenance:
      "centres derived from actual CC0 source lens meshes through the documented normalization; not surveyed lamp photometry",
    brightnessProvenance:
      "simulated artistic emissive intensity, not measured lumens or candela",
  },
  lods: output,
  lodDistances: { low: [10, 36], medium: [16, 55], high: [24, 75] },
  nearGeometryRepair: {
    id: "inner-shell-diagonal-20261011",
    sourceObject: "Watertight 14-station body shell",
    runtimePart: "Body:black",
    triangles: [18116, 18117],
    changedIndexCount: 6,
    maximumVertexDisplacementMetres: 0,
    vertexAttributesMaterialsImagesAndNodeTransformsUnchanged: true,
    editableMasterAndGeneratorVerified: true,
    evidence: "docs/vehicles/inner-shell-repair-audit.json",
    visualAcceptance: "pending whole-game GPU check for this repaired asset",
  },
  limitations: [
    "Near inner-shell fold is repaired by rotating one coplanar diagonal; CPU source/export checks passed, new whole-game visual acceptance is pending.",
    "Frozen J far body coverage remains limited: the coarse body-ray grid has 22 caliper misses, 5 wheelhouse-liner misses, 1 fender-lip miss, and 8 recesses (7 lip, 1 shell). These are not 28 proven exterior holes.",
    "Medium/far wheel shells are unchanged from K and closed after weld-before-decimate; far tyres retain four whole radial-extremum tread blocks and omit other entire tiny blocks.",
    "Small panel gaps can alias at subpixel size; reviewed close-up continuous geometry is retained.",
    "Generic CC0 design and simulated paint/parking occupancy; not a claim about specific real cars.",
    "Alpha dielectric glazing approximates the source transmission without a refraction render target.",
  ],
};
const text = JSON.stringify(manifest, null, 2) + "\n";
await writeFile("public/models/vehicles/manifest.json", text);
await writeFile("shared/data/assets/vehicles-manifest.json", text);
console.log(JSON.stringify(output));
