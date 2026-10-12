/** Reconstruct a reduced, closed lip directly from retained source corners. */
import { createHash } from "node:crypto";
import { parseGlb } from "./car-glb-reader.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const SOURCE_SHA =
  "107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7";
export const NEAR_SHA =
  "7491240d9c5acc10375a394bc9b56a02f314da749dfb63e397506d90ae33c853";
const RATIO = 0.34 / 0.3161422610282898;
const AXES = [
  {
    source: [-2.11868, -1.68224, -0.78224, 0.9004, 1.8004, 2.14618],
    target: [
      -1.78,
      -1.05 - 0.45 * RATIO,
      -1.05 + 0.45 * RATIO,
      1.05 - 0.45 * RATIO,
      1.05 + 0.45 * RATIO,
      1.78,
    ],
  },
  {
    source: [0, 0.75, 1.5851422548294067],
    target: [0.02, 0.75 * RATIO + 0.02, 1.56],
  },
  {
    source: [-1.05846, -0.8875, 0, 0.8875, 1.05846],
    target: [-1.02, (-0.8875 * 0.85) / 0.775, 0, (0.8875 * 0.85) / 0.775, 1.02],
  },
];
function warp(p) {
  const out = p.map((v, k) => {
    const a = AXES[k];
    let i = 0;
    while (i < a.source.length - 2 && v >= a.source[i + 1]) i++;
    return (
      a.target[i] +
      ((v - a.source[i]) * (a.target[i + 1] - a.target[i])) /
        (a.source[i + 1] - a.source[i])
    );
  });
  return [out[2], out[1], -out[0]];
}
function mesh(g, name) {
  const n = g.json.nodes.find((n) => n.name === name),
    p = g.json.meshes[n.mesh].primitives[0];
  return {
    position: g.accessor(p.attributes.POSITION),
    uv: g.accessor(p.attributes.TEXCOORD_0),
    normal: g.accessor(p.attributes.NORMAL),
    indices: g.accessor(p.indices).flat(),
  };
}
export function createFarLipRecipe(nearBytes, sourceBytes) {
  if (sha(nearBytes) !== NEAR_SHA || sha(sourceBytes) !== SOURCE_SHA)
    throw Error("Source/near checkpoint changed");
  const sg = parseGlb(sourceBytes),
    ng = parseGlb(nearBytes),
    s = mesh(sg, "Rolled fender lip.003"),
    n = mesh(ng, "Body:paint"),
    root = sg.json.nodes.find(
      (n) => n.name === "Blue five-door compact hatchback",
    );
  if (
    JSON.stringify(root.translation) !== "[0,-0.0028577351476997137,0]" ||
    root.matrix ||
    root.rotation ||
    root.scale
  )
    throw Error("Source root transform changed");
  const byUV = new Map();
  n.uv.forEach((uv, i) => {
    const k = uv.join(",");
    if (!byUV.has(k)) byUV.set(k, []);
    byUV.get(k).push(i);
  });
  let maximumPositionError = 0;
  const mapping = s.position.map((p, i) => {
    const expected = warp(p.map((v, k) => v + root.translation[k])),
      choices = (byUV.get(s.uv[i].join(",")) ?? [])
        .map((id) => ({
          id,
          error: Math.hypot(...n.position[id].map((v, k) => v - expected[k])),
        }))
        .sort((a, b) => a.error - b.error);
    if (!choices.length || choices[0].error > 2e-6)
      throw Error("Normalized source corner absent");
    maximumPositionError = Math.max(maximumPositionError, choices[0].error);
    return choices[0].id;
  });
  const nearFaces = new Set();
  for (let i = 0; i < n.indices.length; i += 3) {
    const a = n.indices.slice(i, i + 3);
    for (let r = 0; r < 3; r++)
      nearFaces.add([...a.slice(r), ...a.slice(0, r)].join(","));
  }
  for (let i = 0; i < s.indices.length; i += 3)
    if (
      !nearFaces.has(
        s.indices
          .slice(i, i + 3)
          .map((id) => mapping[id])
          .join(","),
      )
    )
      throw Error("Source face absent from near");
  const unique = new Map(),
    geo = s.position.map((p) => {
      const k = p.join(",");
      if (!unique.has(k)) unique.set(k, unique.size);
      return unique.get(k);
    });
  if (unique.size !== 392 || s.indices.length !== 2340)
    throw Error("Source ring profile changed");
  for (let r = 0; r < 48; r++)
    for (let p = 0; p < 8; p++) {
      const a = r * 8 + p,
        b = r * 8 + ((p + 1) % 8),
        c = (r + 1) * 8 + ((p + 1) % 8),
        d = (r + 1) * 8 + p;
      if (
        s.indices
          .slice((r * 16 + p * 2) * 3, (r * 16 + p * 2 + 2) * 3)
          .map((i) => geo[i])
          .join(",") !== [a, b, c, a, c, d].join(",")
      )
        throw Error("Source cell order changed");
    }
  const faces = [];
  for (let r = 0; r < 48; r += 4)
    for (let p = 0; p < 8; p++) {
      const first = (r * 16 + p * 2) * 3,
        last = ((r + 3) * 16 + p * 2) * 3,
        a = s.indices[first],
        b = s.indices[first + 1],
        c = s.indices[last + 2],
        d = s.indices[last + 5];
      faces.push([a, b, c], [a, c, d]);
    }
  for (let t = 768; t < 780; t++) faces.push(s.indices.slice(t * 3, t * 3 + 3));
  const sourceIds = [...new Set(faces.flat())],
    indices = new Map(sourceIds.map((id, i) => [id, i]));
  return {
    removedTriangles: Array.from({ length: 129 }, (_, i) => 830 + i),
    indices: faces.flat().map((i) => indices.get(i)),
    sourceIds,
    positions: sourceIds.map((i) => n.position[mapping[i]]),
    normals: sourceIds.map((i) => n.normal[mapping[i]]),
    uv: sourceIds.map((i) => n.uv[mapping[i]]),
    retainedRings: Array.from({ length: 13 }, (_, i) => i * 4),
    sourceSha256: SOURCE_SHA,
    nearSha256: NEAR_SHA,
    maximumNormalizedPositionError: maximumPositionError,
    sourceTriangleCount: 780,
    sourceNode: "Rolled fender lip.003",
  };
}
