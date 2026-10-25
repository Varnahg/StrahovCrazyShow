import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createCadDoorRenderer } from "../client/cad-doors";
import {
  cadDoorModelPoint,
  cadDoorPose,
  placeCadDoorDefinition,
  type CadDoorDefinition,
} from "../shared/cad-doors";
import { cadLocalToWorld } from "../shared/cad-building-geometry";

function fixture(t: TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const pivot = new TransformNode("cad-pivot", scene);
  const material = new StandardMaterial("native-wood", scene);
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return { engine, scene, pivot, material };
}
function definition(
  id = "A",
  floor = "n01",
  renderPartIds: readonly string[] = ["leaf-" + id],
): CadDoorDefinition {
  return {
    id: "b06:" + id,
    buildingId: "b06",
    floor,
    sourceDoorId: id,
    renderPartIds,
    collisionPartIds: [],
    hingeModel: { x: 3, y: 2, z: 4 },
    closedPose: { position: { x: 3.5, y: 3, z: 4 }, rotationY: 0.24 },
    collider: { halfExtents: { x: 0.5, y: 1, z: 0.019 } },
    handleModel: { x: 3.9, y: 3, z: 4.04 },
    openAngle: Math.PI / 2,
    defaultOpen: false,
  };
}
const sourcePositions = [3, 2, 4, 4, 2, 4, 4, 4, 4, 3, 4, 4];
const sourceNormals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
const sourceUvs = [0.1, 0.2, 0.9, 0.2, 0.9, 0.8, 0.1, 0.8];
function leaf(
  scene: Scene,
  pivot: TransformNode,
  material: StandardMaterial | MultiMaterial,
  def: CadDoorDefinition,
  name = def.renderPartIds[0],
) {
  const mesh = new Mesh(name, scene);
  mesh.parent = pivot;
  mesh.material = material;
  mesh.setVerticesData(VertexBuffer.PositionKind, sourcePositions);
  mesh.setVerticesData(VertexBuffer.NormalKind, sourceNormals);
  mesh.setVerticesData(VertexBuffer.UVKind, sourceUvs);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.receiveShadows = true;
  mesh.metadata = {
    assetKey: "osm:way:53929071",
    sourceId: "53929071",
    sourceGlbSha256: "fixture-glb",
    cadBuilding: "b06",
    shadowCaster: true,
    gltf: { extras: { doorId: def.id, floorId: def.floor, role: "door-leaf" } },
  };
  return mesh;
}
function batches(scene: Scene) {
  return scene.meshes.filter((mesh) => mesh.metadata?.cadDoorBatch) as Mesh[];
}
function vectorAt(data: ArrayLike<number>, i: number) {
  return { x: data[i * 3], y: data[i * 3 + 1], z: data[i * 3 + 2] };
}
function near(a: number, b: number, epsilon = 2e-5) {
  assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
}
function vecNear(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) {
  near(a.x, b.x);
  near(a.y, b.y);
  near(a.z, b.z);
}
function arraysNear(a: ArrayLike<number>, b: ArrayLike<number>) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) near(a[i], b[i]);
}

test("closed and open vertices agree with shared collision pose under building placement", (t) => {
  const { scene, pivot, material } = fixture(t),
    def = definition();
  const placement = { translation: { x: 12, y: 3, z: -8 }, yaw: 0.72 };
  pivot.position.copyFromFloats(12, 3, -8);
  pivot.rotation.y = placement.yaw;
  const source = leaf(scene, pivot, material, def),
    worldDef = placeCadDoorDefinition(def, placement);
  const renderer = createCadDoorRenderer(scene, pivot, [source], [def]);
  t.after(() => renderer.dispose());
  const batch = batches(scene)[0],
    closed = new Float32Array(batch.getVerticesData("position")!);
  arraysNear(closed, sourcePositions);
  assert.equal(source.isEnabled(false), false);
  for (const open of [true, false, true, false]) {
    renderer.setStates([{ id: def.id, open }]);
    const data = batch.getVerticesData("position")!,
      pose = cadDoorPose(worldDef, open);
    for (let i = 0; i < closed.length / 3; i++) {
      const original = vectorAt(closed, i),
        expected = cadDoorModelPoint(def, original, open);
      vecNear(vectorAt(data, i), expected);
      const actualWorld = Vector3.TransformCoordinates(
        Vector3.FromArray(data, i * 3),
        batch.computeWorldMatrix(true),
      );
      vecNear(actualWorld, cadLocalToWorld(expected, placement));
      // Independent rigid-body calculation: closed vertex in collider-local axes,
      // then the canonical physics pose (same hinge rotation, no extra placement).
      const dx = original.x - def.closedPose.position.x,
        dz = original.z - def.closedPose.position.z;
      const c0 = Math.cos(def.closedPose.rotationY),
        s0 = Math.sin(def.closedPose.rotationY);
      const lx = c0 * dx - s0 * dz,
        lz = s0 * dx + c0 * dz;
      const c = Math.cos(pose.rotationY),
        s = Math.sin(pose.rotationY);
      vecNear(actualWorld, {
        x: pose.position.x + c * lx + s * lz,
        y: pose.position.y + original.y - def.closedPose.position.y,
        z: pose.position.z - s * lx + c * lz,
      });
    }
    if (!open) assert.deepEqual(Array.from(data), Array.from(closed));
  }
  assert.equal(batch.parent, pivot);
  assert.equal(batch.material, material);
  assert.equal(batch.receiveShadows, true);
  assert.equal(batch.metadata.shadowCaster, true);
  assert.equal(batch.metadata.sourceGlbSha256, "fixture-glb");
  assert.equal(batch.metadata.gltf.extras.doorId, undefined);
  assert.equal(batch.metadata.gltf.extras.floorId, "n01");
});

test("nested glTF primitive transforms bake to pivot local; normals use inverse transpose", (t) => {
  const { scene, pivot, material } = fixture(t),
    def = definition();
  const world = new TransformNode("world-root", scene);
  world.position.set(40, 2, -15);
  world.rotation.y = -0.3;
  pivot.parent = world;
  pivot.position.set(12, 3, -8);
  pivot.rotation.y = 0.72;
  const object = new TransformNode(def.renderPartIds[0], scene);
  object.parent = pivot;
  object.position.set(2, 0.5, -3);
  object.rotation.set(0.13, -0.42, 0.21);
  object.scaling.set(1.3, 0.8, 0.6);
  object.metadata = {
    gltf: { extras: { doorId: def.id, floorId: def.floor } },
  };
  const source = leaf(scene, pivot, material, def, "primitive-0");
  source.parent = object;
  source.position.set(0.2, 0.1, 0.4);
  source.rotation.y = 0.2;
  pivot.computeWorldMatrix(true);
  const sourceWorld = source.computeWorldMatrix(true).clone();
  const local = sourceWorld.multiply(Matrix.Invert(pivot.getWorldMatrix()));
  const expectedNormal = Vector3.TransformNormal(
    new Vector3(0, 0, 1),
    Matrix.Transpose(Matrix.Invert(local)),
  ).normalize();
  const renderer = createCadDoorRenderer(scene, pivot, [source], [def]);
  t.after(() => renderer.dispose());
  const batch = batches(scene)[0],
    closed = new Float32Array(batch.getVerticesData("position")!);
  for (let i = 0; i < 4; i++) {
    vecNear(
      Vector3.TransformCoordinates(
        Vector3.FromArray(closed, i * 3),
        batch.computeWorldMatrix(true),
      ),
      Vector3.TransformCoordinates(
        Vector3.FromArray(sourcePositions, i * 3),
        sourceWorld,
      ),
    );
    vecNear(vectorAt(batch.getVerticesData("normal")!, i), expectedNormal);
  }
  renderer.setStates([{ id: def.id, open: true }]);
  for (let i = 0; i < 4; i++)
    vecNear(
      vectorAt(batch.getVerticesData("position")!, i),
      cadDoorModelPoint(def, vectorAt(closed, i), true),
    );
});

test("MultiMaterial submeshes preserve actual material, UV sets, color, normals and tangents", (t) => {
  const { scene, pivot, material } = fixture(t),
    def = definition();
  const second = new StandardMaterial(material.name, scene),
    multi = new MultiMaterial("native-multi", scene);
  multi.subMaterials = [material, second];
  const source = leaf(scene, pivot, multi, def);
  source.setVerticesData(
    "uv2",
    sourceUvs.map((value) => value * 2),
  );
  source.setVerticesData(
    "color",
    [1, 0.2, 0.3, 1, 0.4, 1, 0.6, 0.8, 0.7, 0.8, 1, 1, 0.1, 0.2, 0.3, 0.5],
  );
  source.setVerticesData(
    "tangent",
    [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
  );
  source.releaseSubMeshes();
  new SubMesh(0, 0, 4, 0, 3, source);
  new SubMesh(1, 0, 4, 3, 3, source);
  const renderer = createCadDoorRenderer(scene, pivot, [source], [def]);
  t.after(() => renderer.dispose());
  assert.equal(renderer.stats.batches, 2);
  assert.equal(renderer.stats.materials, 2);
  for (const [index, batch] of batches(scene).entries()) {
    assert.equal(batch.material, index === 0 ? material : second);
    const originals = index === 0 ? [0, 1, 2] : [0, 2, 3];
    assert.deepEqual(Array.from(batch.getIndices()!), [0, 1, 2]);
    for (const kind of [
      "position",
      "normal",
      "uv",
      "uv2",
      "color",
      "tangent",
    ]) {
      const size = source.getVertexBuffer(kind)!.getSize(),
        data = source.getVerticesData(kind)!;
      const expected = originals.flatMap((i) =>
        Array.from(data.slice(i * size, (i + 1) * size)),
      );
      arraysNear(batch.getVerticesData(kind)!, expected);
    }
  }
  renderer.setStates([{ id: def.id, open: true }]);
  for (const batch of batches(scene)) {
    arraysNear(
      batch.getVerticesData("tangent")!,
      [0, 0, -1, 1, 0, 0, -1, 1, 0, 0, -1, 1],
    );
    arraysNear(batch.getVerticesData("normal")!, [1, 0, 0, 1, 0, 0, 1, 0, 0]);
  }
});

test("reflected source transform preserves winding and tangent handedness", (t) => {
  const { scene, pivot, material } = fixture(t),
    def = definition(),
    source = leaf(scene, pivot, material, def);
  source.scaling.x = -1;
  source.setVerticesData(
    "tangent",
    [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
  );
  const renderer = createCadDoorRenderer(scene, pivot, [source], [def]);
  t.after(() => renderer.dispose());
  const batch = batches(scene)[0];
  assert.deepEqual(Array.from(batch.getIndices()!), [0, 2, 1, 0, 3, 2]);
  arraysNear(
    batch.getVerticesData("tangent")!,
    [-1, 0, 0, -1, -1, 0, 0, -1, -1, 0, 0, -1, -1, 0, 0, -1],
  );
});

test("475 leaves batch by floor/material rather than object, and share no original ownership", (t) => {
  const { scene, pivot, material } = fixture(t);
  const definitions = Array.from({ length: 475 }, (_, i) =>
    definition(String(i).padStart(3, "0"), "n0" + ((i % 6) + 1)),
  );
  const sources = definitions.map((def) => leaf(scene, pivot, material, def));
  const renderer = createCadDoorRenderer(scene, pivot, sources, definitions);
  t.after(() => renderer.dispose());
  assert.equal(renderer.stats.doors, 475);
  assert.equal(renderer.stats.sourceMeshes, 475);
  assert.equal(renderer.stats.batches, 6);
  assert.equal(renderer.stats.materials, 1);
  assert.equal(renderer.stats.vertices, 475 * 4);
  assert.equal(renderer.stats.triangles, 475 * 2);
  assert.ok(sources.every((mesh) => !mesh.isEnabled(false)));
});

test("only changed ranges upload; complete CPU arrays, UV and indices survive updates", (t) => {
  const { scene, engine, pivot, material } = fixture(t),
    a = definition("A"),
    b = definition("B");
  const sources = [a, b].map((def) => leaf(scene, pivot, material, def));
  const renderer = createCadDoorRenderer(scene, pivot, sources, [a, b]);
  t.after(() => renderer.dispose());
  const batch = batches(scene)[0],
    positions = batch.getVerticesData("position")!,
    uv = batch.getVerticesData("uv")!,
    indices = batch.getIndices();
  const closed = Array.from(positions),
    uploads: { offset: number; length: number; values: number[] }[] = [];
  const original = engine.updateDynamicVertexBuffer.bind(engine);
  engine.updateDynamicVertexBuffer = (buffer, data, offset, length) => {
    uploads.push({
      offset: offset!,
      length: length!,
      values: Array.from(data as Float32Array),
    });
    original(buffer, data, offset, length);
  };
  renderer.setStates([{ id: b.id, open: true }]);
  assert.equal(uploads.length, 2);
  assert.ok(
    uploads.every(
      (upload) => upload.offset === 4 * 3 * 4 && upload.length === 4 * 3 * 4,
    ),
  );
  assert.equal(batch.getVerticesData("position"), positions);
  assert.equal(batch.getVertexBuffer("position")!.getData(), positions);
  assert.equal(batch.getVerticesData("uv"), uv);
  assert.equal(batch.getIndices(), indices);
  assert.deepEqual(Array.from(positions.slice(0, 12)), closed.slice(0, 12));
  assert.notDeepEqual(Array.from(positions.slice(12)), closed.slice(12));
  renderer.setStates([
    { id: a.id, open: false },
    { id: b.id, open: true },
  ]);
  assert.equal(uploads.length, 2);
  assert.equal(renderer.stats.stateChanges, 1);
  assert.equal(renderer.stats.verticesUpdated, 4);
  assert.equal(renderer.stats.bytesUploaded, 96);
  const before = Array.from(positions);
  assert.throws(
    () =>
      renderer.setStates([
        { id: a.id, open: true },
        { id: "missing", open: false },
      ]),
    /unknown/,
  );
  assert.throws(
    () =>
      renderer.setStates([
        { id: a.id, open: true },
        { id: a.id, open: false },
      ]),
    /duplicate/,
  );
  assert.deepEqual(Array.from(positions), before);
  assert.equal(uploads.length, 2);
  const box = batch.getBoundingInfo().boundingBox;
  for (const def of [a, b])
    for (let i = 0; i < 4; i++)
      for (const open of [false, true]) {
        const p = cadDoorModelPoint(def, vectorAt(sourcePositions, i), open);
        assert.ok(p.x >= box.minimum.x - 1e-6 && p.x <= box.maximum.x + 1e-6);
        assert.ok(p.z >= box.minimum.z - 1e-6 && p.z <= box.maximum.z + 1e-6);
      }
});

test("exact glTF parent object owns multiple primitive children once", (t) => {
  const { scene, pivot, material } = fixture(t),
    def = definition();
  const object = new TransformNode(def.renderPartIds[0], scene);
  object.parent = pivot;
  object.metadata = {
    gltf: { extras: { doorId: def.id, floorId: def.floor } },
  };
  const a = leaf(scene, pivot, material, def, "primitive-a"),
    b = leaf(scene, pivot, material, def, "primitive-b");
  a.parent = object;
  b.parent = object;
  delete a.metadata.gltf;
  delete b.metadata.gltf;
  const renderer = createCadDoorRenderer(scene, pivot, [a, b, a], [def]);
  t.after(() => renderer.dispose());
  assert.equal(renderer.stats.sourceMeshes, 2);
  assert.equal(renderer.stats.batches, 1);
  assert.deepEqual(batches(scene)[0].metadata.cadDoorRanges, [
    { id: def.id, start: 0, count: 8 },
  ]);
  assert.equal(object.isEnabled(false), true);
});

for (const fault of [
  "missing",
  "unknown",
  "mismatch",
  "duplicate-name",
  "unsupported-attribute",
  "missing-normal",
  "bad-indices",
  "overlap",
  "uncovered",
  "mixed-layout",
  "singular",
] as const) {
  test("invalid native source fails atomically: " + fault, (t) => {
    const { scene, pivot, material } = fixture(t),
      def = definition(),
      source = leaf(scene, pivot, material, def);
    const sources = [source];
    let definitions = [def];
    switch (fault) {
      case "missing":
        definitions = [{ ...def, renderPartIds: ["absent"] }];
        break;
      case "unknown":
        sources.push(leaf(scene, pivot, material, definition("unknown")));
        break;
      case "mismatch":
        source.metadata.gltf.extras.doorId = "wrong-id";
        break;
      case "duplicate-name":
        sources.push(leaf(scene, pivot, material, def));
        break;
      case "unsupported-attribute":
        source.setVerticesData(
          "matricesWeights",
          new Float32Array(16),
          false,
          4,
        );
        break;
      case "missing-normal":
        source.removeVerticesData("normal");
        break;
      case "bad-indices":
        source.setIndices([0, 1, 99]);
        break;
      case "overlap":
        new SubMesh(0, 0, 4, 0, 3, source);
        break;
      case "uncovered":
        source.subMeshes[0].indexCount = 3;
        break;
      case "mixed-layout": {
        const b = definition("B");
        definitions.push(b);
        const m = leaf(scene, pivot, material, b);
        m.removeVerticesData("uv");
        sources.push(m);
        break;
      }
      case "singular":
        source.scaling.x = 0;
        break;
    }
    assert.throws(
      () => createCadDoorRenderer(scene, pivot, sources, definitions),
      /CAD door renderer/,
    );
    assert.equal(batches(scene).length, 0);
    assert.ok(sources.every((mesh) => mesh.isEnabled(false)));
    assert.ok(scene.materials.includes(material));
  });
}

test("part claimed twice and nested part ambiguity fail before hiding originals", (t) => {
  const { scene, pivot, material } = fixture(t),
    a = definition("A"),
    b = definition("B", "n01", a.renderPartIds);
  const source = leaf(scene, pivot, material, a);
  assert.throws(
    () => createCadDoorRenderer(scene, pivot, [source], [a, b]),
    /Shared movable/,
  );
  const object = new TransformNode("outer-leaf", scene);
  object.parent = pivot;
  source.parent = object;
  assert.throws(
    () =>
      createCadDoorRenderer(
        scene,
        pivot,
        [source],
        [{ ...a, renderPartIds: [...a.renderPartIds, object.name] }],
      ),
    /ambiguous/,
  );
  assert.equal(source.isEnabled(false), true);
});

test("dispose restores native meshes, releases batches and never disposes shared materials", (t) => {
  const { scene, pivot, material } = fixture(t),
    def = definition(),
    source = leaf(scene, pivot, material, def);
  let materialDisposals = 0,
    sourceDisposals = 0;
  material.onDisposeObservable.add(() => materialDisposals++);
  source.onDisposeObservable.add(() => sourceDisposals++);
  const before = scene.onDisposeObservable.observers.length;
  const renderer = createCadDoorRenderer(scene, pivot, [source], [def]);
  const batch = batches(scene)[0];
  renderer.dispose();
  renderer.dispose();
  assert.equal(batch.isDisposed(), true);
  assert.equal(source.isEnabled(false), true);
  assert.equal(materialDisposals, 0);
  assert.equal(sourceDisposals, 0);
  assert.equal(
    scene.onDisposeObservable.observers.filter(
      (observer) => !observer._willBeUnregistered,
    ).length,
    before,
  );
  assert.throws(
    () => renderer.setStates([{ id: def.id, open: true }]),
    /disposed/,
  );
  const second = createCadDoorRenderer(scene, pivot, [source], [def]);
  scene.dispose();
  assert.doesNotThrow(() => second.dispose());
  assert.equal(materialDisposals, 1);
  assert.equal(sourceDisposals, 1);
});

test("empty definitions are valid only without unclaimed interactive source meshes", (t) => {
  const { scene, pivot, material } = fixture(t);
  const renderer = createCadDoorRenderer(scene, pivot, [], []);
  t.after(() => renderer.dispose());
  assert.equal(renderer.stats.batches, 0);
  renderer.setStates([]);
  assert.throws(
    () => createCadDoorRenderer(scene, pivot, [], [definition()]),
    /missing render part/,
  );
  assert.throws(
    () =>
      createCadDoorRenderer(
        scene,
        pivot,
        [leaf(scene, pivot, material, definition())],
        [],
      ),
    /unclaimed/,
  );
});

test("normalized interleaved imported attributes retain decoded shader values", (t) => {
  const { scene, engine, pivot, material } = fixture(t),
    def = definition(),
    source = leaf(scene, pivot, material, def);
  const packed = new Uint8Array([
    99, 0, 255, 77, 99, 64, 128, 77, 99, 255, 32, 77, 99, 16, 200, 77,
  ]);
  source.setVerticesBuffer(
    new VertexBuffer(engine, packed, "uv", {
      size: 2,
      stride: 4,
      offset: 1,
      useBytes: true,
      type: VertexBuffer.UNSIGNED_BYTE,
      normalized: true,
    }),
  );
  const expected = Array.from(source.getVertexBuffer("uv")!.getFloatData(4)!);
  const renderer = createCadDoorRenderer(scene, pivot, [source], [def]);
  t.after(() => renderer.dispose());
  arraysNear(batches(scene)[0].getVerticesData("uv")!, expected);
  renderer.setStates([{ id: def.id, open: true }]);
  arraysNear(batches(scene)[0].getVerticesData("uv")!, expected);
  assert.equal(source.getVertexBuffer("uv")!.type, VertexBuffer.UNSIGNED_BYTE);
});

test("batch allocation failure rolls back created geometry and leaves native ownership intact", (t) => {
  const { scene, pivot, material } = fixture(t),
    a = definition("A"),
    b = definition("B", "n02");
  const sources = [a, b].map((def) => leaf(scene, pivot, material, def));
  const original = Mesh.prototype.setIndices;
  Mesh.prototype.setIndices = function (...args) {
    if (this.name.startsWith("cad-door-batch:n02:"))
      throw new Error("fixture allocation failure");
    return original.apply(this, args);
  };
  try {
    assert.throws(
      () => createCadDoorRenderer(scene, pivot, sources, [a, b]),
      /fixture allocation/,
    );
  } finally {
    Mesh.prototype.setIndices = original;
  }
  assert.equal(batches(scene).length, 0);
  assert.equal(scene.meshes.length, 2);
  assert.ok(
    sources.every((mesh) => mesh.isEnabled(false) && !mesh.isDisposed()),
  );
  assert.ok(scene.materials.includes(material));
});

test("disabled ancestor cannot silently become visible when primitive is rebatch-parented", (t) => {
  const { scene, pivot, material } = fixture(t),
    def = definition();
  const object = new TransformNode(def.renderPartIds[0], scene);
  object.parent = pivot;
  object.setEnabled(false);
  const source = leaf(scene, pivot, material, def, "primitive");
  source.parent = object;
  assert.throws(
    () => createCadDoorRenderer(scene, pivot, [source], [def]),
    /disabled imported hierarchy/,
  );
  assert.equal(batches(scene).length, 0);
  assert.equal(source.isEnabled(false), true);
});
