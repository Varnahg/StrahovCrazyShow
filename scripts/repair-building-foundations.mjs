/** Surgical derivative sync: normals/index winding only; no Blender re-export. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = process.cwd(),
  cache = path.resolve(".cache/ground-layer-study/foundation-sync");
const sourcePath = "assets/blender/buildings/source-plan.json",
  manifestPath = "public/models/buildings/manifest.json";
const planPath = path.join(cache, "plan.json"),
  reportPath =
    "docs/verification-evidence/ground-flicker-20261011/foundation-archive-sync.json";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  json = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
};
const safe = (p) => {
  const r = path.resolve(p);
  assert(r.startsWith(root + path.sep), "outside workspace: " + p);
  return r;
};
const area = (p) =>
  p.reduce((sum, a, i) => {
    const b = p[(i + 1) % p.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
function classify(part, origin, ring) {
  const sign = area(ring) >= 0 ? 1 : -1;
  const edges = ring.flatMap((a, i) => {
    const b = ring[(i + 1) % ring.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return length < 1e-5
      ? []
      : [
          {
            a,
            length,
            tx: (b[0] - a[0]) / length,
            tz: (b[1] - a[1]) / length,
            nx: (sign * (b[1] - a[1])) / length,
            nz: (-sign * (b[0] - a[0])) / length,
          },
        ];
  });
  let inwardNormals = 0,
    inwardFaces = 0;
  for (let i = 0; i < part.indices.length; i += 3) {
    const p = part.indices
      .slice(i, i + 3)
      .map((index) => part.positions.slice(index * 3, index * 3 + 3));
    const x = (p[0][0] + p[1][0] + p[2][0]) / 3 + origin.x,
      z = (p[0][2] + p[1][2] + p[2][2]) / 3 + origin.z;
    const edge = edges.find((e) => {
      const dx = x - e.a[0],
        dz = z - e.a[1],
        along = dx * e.tx + dz * e.tz;
      return (
        along >= -0.0001 &&
        along <= e.length + 0.0001 &&
        Math.abs(dx * e.nx + dz * e.nz) < 0.0001
      );
    });
    assert(edge, "foundation triangle not on source perimeter");
    const n = part.normals.slice(part.indices[i] * 3, part.indices[i] * 3 + 3);
    const ux = p[1][0] - p[0][0],
      uy = p[1][1] - p[0][1],
      uz = p[1][2] - p[0][2],
      vx = p[2][0] - p[0][0],
      vy = p[2][1] - p[0][1],
      vz = p[2][2] - p[0][2];
    if (n[0] * edge.nx + n[2] * edge.nz < 0) inwardNormals++;
    if ((uy * vz - uz * vy) * edge.nx + (ux * vy - uy * vx) * edge.nz < 0)
      inwardFaces++;
  }
  const triangles = part.indices.length / 3;
  assert(
    inwardNormals === 0 || inwardNormals === triangles,
    "mixed normal orientations",
  );
  assert(
    inwardFaces === 0 || inwardFaces === triangles,
    "mixed face orientations",
  );
  return {
    triangles,
    flipNormals: inwardNormals > 0,
    flipIndices: inwardFaces > 0,
  };
}
function glbFoundation(bytes, id) {
  const length = bytes.readUInt32LE(12),
    spec = JSON.parse(bytes.subarray(20, 20 + length));
  const mesh = spec.meshes.find((m) => m.name === "building foundation " + id);
  assert(mesh);
  assert.equal(mesh.primitives.length, 1);
  const read = (id) => {
    const a = spec.accessors[id],
      v = spec.bufferViews[a.bufferView],
      width = a.type === "VEC3" ? 3 : 1,
      size = a.componentType === 5123 ? 2 : 4,
      start = 20 + length + 8 + (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      values = [];
    for (let i = 0; i < a.count; i++)
      for (let j = 0; j < width; j++) {
        const at = start + i * (v.byteStride ?? width * size) + j * size;
        values.push(
          a.componentType === 5126
            ? bytes.readFloatLE(at)
            : size === 2
              ? bytes.readUInt16LE(at)
              : bytes.readUInt32LE(at),
        );
      }
    return values;
  };
  const p = mesh.primitives[0];
  return {
    positions: read(p.attributes.POSITION),
    normals: read(p.attributes.NORMAL),
    indices: read(p.indices),
  };
}
function patchGlb(bytes, id) {
  const out = Buffer.from(bytes),
    len = bytes.readUInt32LE(12),
    spec = JSON.parse(bytes.subarray(20, 20 + len).toString()),
    base = 20 + len + 8;
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(20 + len + 4), 0x004e4942);
  const mesh = spec.meshes.find((m) => m.name === "building foundation " + id);
  assert(mesh, "foundation mesh " + id);
  const ranges = [];
  let triangles = 0,
    normalVertices = 0;
  const access = (id) => {
    const a = spec.accessors[id],
      v = spec.bufferViews[a.bufferView];
    assert(!a.sparse);
    return { a, v, offset: base + (v.byteOffset ?? 0) + (a.byteOffset ?? 0) };
  };
  for (const primitive of mesh.primitives) {
    const normal = access(primitive.attributes.NORMAL);
    assert.equal(normal.a.componentType, 5126);
    assert.equal(normal.a.type, "VEC3");
    assert(!normal.a.min && !normal.a.max, "unexpected normal bounds");
    for (const m of spec.meshes)
      for (const p of m.primitives)
        if (p !== primitive)
          assert.notEqual(
            p.attributes.NORMAL,
            primitive.attributes.NORMAL,
            "shared foundation normals",
          );
    for (let i = 0; i < normal.a.count; i++)
      for (let axis = 0; axis < 3; axis++) {
        const offset =
          normal.offset + i * (normal.v.byteStride ?? 12) + axis * 4;
        out.writeFloatLE(-bytes.readFloatLE(offset), offset);
        ranges.push([offset, offset + 4]);
      }
    normalVertices += normal.a.count;
    const index = access(primitive.indices),
      width =
        index.a.componentType === 5123
          ? 2
          : index.a.componentType === 5125
            ? 4
            : 0;
    assert(width);
    assert.equal(index.a.type, "SCALAR");
    assert.equal(index.a.count % 3, 0);
    assert(!index.v.byteStride);
    for (const m of spec.meshes)
      for (const p of m.primitives)
        if (p !== primitive)
          assert.notEqual(
            p.indices,
            primitive.indices,
            "shared foundation indices",
          );
    for (let i = 0; i < index.a.count; i += 3) {
      const b = index.offset + (i + 1) * width,
        c = b + width;
      if (width === 2) {
        out.writeUInt16LE(bytes.readUInt16LE(c), b);
        out.writeUInt16LE(bytes.readUInt16LE(b), c);
      } else {
        out.writeUInt32LE(bytes.readUInt32LE(c), b);
        out.writeUInt32LE(bytes.readUInt32LE(b), c);
      }
      ranges.push([b, c + width]);
    }
    triangles += index.a.count / 3;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let end = 0;
  for (const [start, to] of ranges) {
    assert(
      bytes.subarray(end, start).equals(out.subarray(end, start)),
      "changed non-foundation buffer bytes",
    );
    end = to;
  }
  assert(
    bytes.subarray(end).equals(out.subarray(end)),
    "changed trailing non-foundation buffer bytes",
  );
  assert(
    bytes.subarray(0, base).equals(out.subarray(0, base)),
    "GLB JSON/header changed",
  );
  return {
    bytes: out,
    triangles,
    normalVertices,
    protectedBytes: bytes.length - ranges.reduce((s, r) => s + r[1] - r[0], 0),
  };
}
if (process.argv[2] === "prepare") {
  assert(
    !fs.existsSync(planPath),
    "sync already prepared; use finalize after Blender",
  );
  const source = json(sourcePath),
    manifest = json(manifestPath),
    map = json("shared/data/map.json");
  assert.equal(sha(fs.readFileSync(sourcePath)), manifest.sourcePlanSha256);
  const rings = new Map(map.buildings.map((b) => [b.id, b.points])),
    affected = [],
    sourceRepairs = [],
    orientationAudit = [];
  for (const model of source.models) {
    const parts = model.parts.filter(
      (p) => p.sourcePack === "terrain-foundation",
    );
    if (!parts.length) continue;
    assert.equal(parts.length, 1);
    const id = model.identity.sourceId,
      ring = rings.get(id),
      flags = classify(parts[0], model.origin, ring);
    const glb = classify(
      glbFoundation(
        fs.readFileSync(
          "public/models/buildings/osm-" +
            model.identity.sourceType +
            "-" +
            id +
            ".glb",
        ),
        id,
      ),
      model.origin,
      ring,
    );
    orientationAudit.push({ id, source: flags, glb });
    if (flags.flipNormals || flags.flipIndices)
      sourceRepairs.push({ id, ...flags });
    if (glb.flipNormals || glb.flipIndices) {
      assert(
        glb.flipNormals && glb.flipIndices,
        "partial GLB mismatch needs a separate repair",
      );
      affected.push(id);
    }
  }
  assert.equal(affected.length, 16, "unexpected affected derivative count");
  const selected = new Set(affected),
    files = [sourcePath, manifestPath],
    models = [];
  for (const model of manifest.models) {
    const glb = "public/" + model.url.slice(1),
      blend = model.blend;
    assert.equal(sha(fs.readFileSync(glb)), model.sha256);
    models.push({
      id: model.identity.sourceId,
      key: model.identity.key,
      glb,
      blend,
      beforeGlbSha: model.sha256,
      beforeBlendSha: sha(fs.readFileSync(blend)),
      affected: selected.has(model.identity.sourceId),
    });
    if (selected.has(model.identity.sourceId)) files.push(glb, blend);
  }
  for (const file of files) {
    const target = path.join(cache, "backup", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.copyFileSync(safe(file), target);
    assert.equal(sha(fs.readFileSync(target)), sha(fs.readFileSync(file)));
  }
  const textureHashes = manifest.textures.map((t) => ({
    path: "public/" + t.url.slice(1),
    sha: sha(fs.readFileSync("public/" + t.url.slice(1))),
  }));
  const sourceBefore = sha(fs.readFileSync(sourcePath)),
    glbProof = [];
  for (const model of source.models) {
    const flags = sourceRepairs.find((r) => r.id === model.identity.sourceId);
    if (flags) {
      const part = model.parts.find(
          (p) => p.sourcePack === "terrain-foundation",
        ),
        before = structuredClone(part);
      if (flags.flipNormals) part.normals = part.normals.map((n) => -n);
      if (flags.flipIndices)
        for (let i = 0; i < part.indices.length; i += 3)
          [part.indices[i + 1], part.indices[i + 2]] = [
            part.indices[i + 2],
            part.indices[i + 1],
          ];
      const protectedPart = (p) => {
        const copy = structuredClone(p);
        delete copy.normals;
        delete copy.indices;
        return copy;
      };
      assert.deepEqual(protectedPart(part), protectedPart(before));
    }
    if (selected.has(model.identity.sourceId)) {
      const row = models.find((m) => m.id === model.identity.sourceId),
        result = patchGlb(fs.readFileSync(row.glb), row.id);
      fs.writeFileSync(row.glb, result.bytes);
      glbProof.push({
        id: row.id,
        triangles: result.triangles,
        normalVertices: result.normalVertices,
        protectedBytes: result.protectedBytes,
        afterSha: sha(result.bytes),
        jsonHeaderAndAllNonFoundationBytesIdentical: true,
        sourcePositionsUvsMaterialOtherFieldsIdentical: true,
      });
    }
  }
  // The preceding single-building update is retained in the backup/history;
  // it cannot truthfully describe this later foundation-only synchronization.
  delete source.partialUpdate;
  source.sourceHashes["client/terrain-renderer.ts"] = sha(
    fs.readFileSync("client/terrain-renderer.ts"),
  );
  source.foundationRepair = {
    kind: "outward-foundation-winding",
    affectedSourceIds: sourceRepairs.map((r) => r.id),
    derivativeSourceIds: affected,
    sourceNormalRepairIds: sourceRepairs
      .filter((r) => r.flipNormals)
      .map((r) => r.id),
    sourceIndexRepairIds: sourceRepairs
      .filter((r) => r.flipIndices)
      .map((r) => r.id),
    previousSourcePlanSha256: sourceBefore,
    scope:
      "Only foundation normals and index winding changed; positions, UVs, materials, all other parts and raw source masters preserved.",
  };
  write(sourcePath, source);
  for (const model of manifest.models)
    if (selected.has(model.identity.sourceId)) {
      const row = models.find((m) => m.id === model.identity.sourceId);
      model.sha256 = sha(fs.readFileSync(row.glb));
      model.bytes = fs.statSync(row.glb).size;
    }
  manifest.sourcePlanSha256 = sha(fs.readFileSync(sourcePath));
  manifest.sourceHashes = source.sourceHashes;
  manifest.foundationRepair = {
    kind: "outward-foundation-winding",
    affectedSourceIds: affected,
    evidence: reportPath,
  };
  write(manifestPath, manifest);
  write(planPath, {
    root,
    cache,
    sourcePath,
    manifestPath,
    sourceBefore,
    sourceAfter: manifest.sourcePlanSha256,
    models,
    textureHashes,
    glbProof,
    sourceRepairs,
    orientationAudit,
    preparedAt: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      status: "prepared",
      affected: affected.length,
      unchanged: models.length - affected.length,
      backup: path.join(cache, "backup"),
      planPath,
    }),
  );
} else if (process.argv[2] === "finalize") {
  const plan = json(planPath),
    blender = json(path.join(cache, "blender-audit.json"));
  assert.equal(blender.status, "passed");
  assert.equal(blender.models.length, plan.glbProof.length);
  const source = json(sourcePath),
    oldSource = json(path.join(cache, "backup", sourcePath));
  for (const model of source.models) {
    const old = oldSource.models.find(
        (m) => m.identity.key === model.identity.key,
      ),
      flags = plan.sourceRepairs.find((m) => m.id === model.identity.sourceId);
    if (!flags) assert.deepEqual(model, old);
    else {
      assert.equal(model.parts.length, old.parts.length);
      for (let i = 0; i < model.parts.length; i++) {
        const part = model.parts[i],
          prior = old.parts[i];
        if (part.sourcePack !== "terrain-foundation")
          assert.deepEqual(part, prior);
        else {
          assert.deepEqual(part.positions, prior.positions);
          assert.deepEqual(part.uvs, prior.uvs);
          assert.deepEqual(part.material, prior.material);
          assert.deepEqual(
            part.normals,
            flags.flipNormals
              ? prior.normals.map((n) => (n === 0 ? 0 : -n))
              : prior.normals,
          );
          for (let j = 0; j < part.indices.length; j += 3)
            assert.deepEqual(
              part.indices.slice(j, j + 3),
              flags.flipIndices
                ? [prior.indices[j], prior.indices[j + 2], prior.indices[j + 1]]
                : prior.indices.slice(j, j + 3),
            );
        }
      }
    }
  }
  const retained = [];
  for (const row of plan.models)
    if (!row.affected) {
      assert.equal(sha(fs.readFileSync(row.glb)), row.beforeGlbSha);
      assert.equal(sha(fs.readFileSync(row.blend)), row.beforeBlendSha);
      retained.push(row.id);
    }
  for (const t of plan.textureHashes)
    assert.equal(sha(fs.readFileSync(t.path)), t.sha);
  const models = plan.models
    .filter((m) => m.affected)
    .map((m) => ({
      ...m,
      afterGlbSha: sha(fs.readFileSync(m.glb)),
      afterBlendSha: sha(fs.readFileSync(m.blend)),
    }));
  const report = {
    status: "passed",
    generatedAt: new Date().toISOString(),
    affectedModels: plan.glbProof.length,
    sourceNormalRepairs: plan.sourceRepairs.filter((r) => r.flipNormals).length,
    sourceIndexRepairs: plan.sourceRepairs.filter((r) => r.flipIndices).length,
    unchangedModels: retained.length,
    retainedSourceIds: retained,
    backup: path
      .relative(root, path.join(cache, "backup"))
      .replaceAll("\\", "/"),
    sourcePlanBefore: plan.sourceBefore,
    sourcePlanAfter: sha(fs.readFileSync(sourcePath)),
    manifestSha256: sha(fs.readFileSync(manifestPath)),
    runtimeFactorySha256: sha(fs.readFileSync("client/terrain-renderer.ts")),
    checks: [
      "all originals backed up before first mutation",
      "actual source and actual exported GLB orientation audited independently before mutation",
      "source positions/UV/material/all other parts identical",
      "GLB JSON/header and every non-foundation byte identical",
      "all105 unselected GLB and blend file hashes identical",
      "all shared texture bytes identical",
      "Blender meshes reopened and checked; foundation vertex-UV binding preserved; custom split normals handled",
    ],
    glbProof: plan.glbProof,
    orientationAuditBefore: plan.orientationAudit,
    blender,
    models,
  };
  write(reportPath, report);
  console.log(
    JSON.stringify({
      status: "passed",
      affected: plan.glbProof.length,
      unchanged: retained.length,
      reportPath,
    }),
  );
} else throw Error("Use prepare or finalize");
