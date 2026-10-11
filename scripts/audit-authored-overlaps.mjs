/** Exact opaque surface duplicates in the actual authored building source plan.
 * Partial polygon overlaps and opaque surfaces hidden inside solids require a
 * separate visual/spatial review; this audit never deletes geometry itself.
 */
import fs from "node:fs";
import crypto from "node:crypto";
const file = "assets/blender/buildings/source-plan.json",
  bytes = fs.readFileSync(file),
  plan = JSON.parse(bytes);
const precision = 1e-5,
  models = [],
  sameFacing = [],
  oppositeFacing = [];
for (const model of plan.models) {
  const triangles = new Map();
  let checked = 0,
    skipped = 0;
  for (const part of model.parts) {
    if (
      part.material.alpha < 0.999 ||
      /glass|glazing|window|sign|plaque/i.test(part.material.name)
    ) {
      skipped += part.indices.length / 3;
      continue;
    }
    for (let i = 0; i < part.indices.length; i += 3) {
      const ids = part.indices.slice(i, i + 3),
        points = ids.map((index) =>
          part.positions.slice(index * 3, index * 3 + 3),
        );
      const key = points
        .map((p) => p.map((v) => Math.round(v / precision)).join(","))
        .sort()
        .join(";");
      const normal = [0, 1, 2].map((axis) =>
        ids.reduce((sum, index) => sum + part.normals[index * 3 + axis], 0),
      );
      const length = Math.hypot(...normal);
      if (length < 1e-10) continue;
      for (let axis = 0; axis < 3; axis++) normal[axis] /= length;
      const prior = triangles.get(key);
      if (prior) {
        const dot = normal.reduce(
          (sum, value, axis) => sum + value * prior.normal[axis],
          0,
        );
        const record = {
          model: model.identity.key,
          a: prior.part,
          b: part.name,
          triangle: i / 3,
          normalDot: dot,
          worldCentroid: [0, 1, 2].map(
            (axis) =>
              points.reduce((sum, p) => sum + p[axis], 0) / 3 +
              [model.origin.x, model.origin.y, model.origin.z][axis],
          ),
        };
        if (dot > 0.99) sameFacing.push(record);
        else if (dot < -0.99) oppositeFacing.push(record);
      } else triangles.set(key, { part: part.name, normal });
      checked++;
    }
  }
  models.push({
    id: model.identity.key,
    checkedTriangles: checked,
    excludedTransparentOrLabelTriangles: skipped,
  });
}
const report = {
  createdAt: new Date().toISOString(),
  scope:
    "exact opaque triangle duplicates in 121 authored building models, no automatic repairs",
  sourcePlanSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  precisionMetres: precision,
  models,
  counts: {
    sameFacing: sameFacing.length,
    oppositeFacingContacts: oppositeFacing.length,
  },
  sameFacing,
  oppositeFacingContacts: oppositeFacing,
  limitations: [
    "Different triangulation or partial coplanar overlap is not detected.",
    "Opposite-facing coincident solid joints can be legitimate internal construction contacts.",
    "Does not audit raw IPR reference, vegetation alpha cards or mobile cars.",
    "Not a GPU/FPS measurement.",
  ],
};
fs.writeFileSync(
  "docs/model-review/exact-surface-overlaps.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    models: models.length,
    checkedTriangles: models.reduce((sum, m) => sum + m.checkedTriangles, 0),
    ...report.counts,
    examples: sameFacing.slice(0, 12),
  }),
);
