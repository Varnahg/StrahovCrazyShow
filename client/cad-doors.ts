import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import { Material } from "@babylonjs/core/Materials/material";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  cadDoorDefinitionsById,
  cadDoorModelTransform,
  placeCadDoorDefinition,
  type CadDoorDefinition,
  type CadDoorState,
} from "../shared/cad-doors";

export type CadDoorRendererStats = Readonly<{
  doors: number;
  sourceMeshes: number;
  batches: number;
  materials: number;
  vertices: number;
  triangles: number;
  stateChanges: number;
  bufferUploads: number;
  verticesUpdated: number;
  bytesUploaded: number;
}>;
export type CadDoorRenderer = {
  /** Partial or complete states. Revision/epoch ordering belongs to the shared timeline. */
  setStates(states: readonly Pick<CadDoorState, "id" | "open">[]): void;
  dispose(): void;
  readonly stats: CadDoorRendererStats;
};
type Attribute = { size: number; data: Float32Array };
type Attributes = Map<string, Attribute>;
type Piece = {
  door: CadDoorDefinition;
  part: string;
  attributes: Attributes;
  indices: number[];
};
type Policy = ReturnType<typeof renderPolicy>;
type Group = {
  floor: string;
  material: Material;
  source: Mesh;
  policy: Policy;
  schema: string;
  pieces: Piece[];
};
type Range = { id: string; start: number; count: number };
type Batch = {
  mesh: Mesh;
  attributes: Attributes;
  closed: Attributes;
  ranges: Range[];
};
const dynamicKinds = new Set([
  VertexBuffer.PositionKind,
  VertexBuffer.NormalKind,
  VertexBuffer.TangentKind,
]);
const sizes = new Map<string, readonly number[]>([
  [VertexBuffer.PositionKind, [3]],
  [VertexBuffer.NormalKind, [3]],
  [VertexBuffer.TangentKind, [4]],
  [VertexBuffer.ColorKind, [3, 4]],
  ...[
    VertexBuffer.UVKind,
    VertexBuffer.UV2Kind,
    VertexBuffer.UV3Kind,
    VertexBuffer.UV4Kind,
    VertexBuffer.UV5Kind,
    VertexBuffer.UV6Kind,
  ].map((kind) => [kind, [2]] as const),
]);
function fail(message: string): never {
  throw new Error("CAD door renderer: " + message);
}

function renderPolicy(mesh: Mesh) {
  return {
    receiveShadows: mesh.receiveShadows,
    isVisible: mesh.isVisible,
    visibility: mesh.visibility,
    layerMask: mesh.layerMask,
    renderingGroupId: mesh.renderingGroupId,
    alphaIndex: mesh.alphaIndex,
    sideOrientation: mesh.sideOrientation,
    useVertexColors: mesh.useVertexColors,
    hasVertexAlpha: mesh.hasVertexAlpha,
    applyFog: mesh.applyFog,
    shadowCaster: mesh.metadata?.shadowCaster ?? true,
    cadBuilding: mesh.metadata?.cadBuilding,
    assetKey: mesh.metadata?.assetKey,
    sourceId: mesh.metadata?.sourceId,
    sourceGlbSha256: mesh.metadata?.sourceGlbSha256,
  };
}
function inheritedExtras(mesh: AbstractMesh, pivot: TransformNode) {
  let doorId: unknown, floorId: unknown;
  for (
    let node: Node | null = mesh;
    node && node !== pivot;
    node = node.parent
  ) {
    const extras = node.metadata?.gltf?.extras;
    for (const [key, old] of [
      ["doorId", doorId],
      ["floorId", floorId],
    ] as const) {
      const value = extras?.[key];
      if (value !== undefined && old !== undefined && value !== old)
        fail("conflicting " + key + " on " + mesh.name);
      if (value !== undefined) {
        if (key === "doorId") doorId = value;
        else floorId = value;
      }
    }
  }
  return { doorId, floorId };
}
function readAttributes(mesh: Mesh, relative: Matrix): Attributes {
  if (
    mesh.skeleton ||
    mesh.morphTargetManager ||
    mesh.hasThinInstances ||
    mesh.instances.length ||
    mesh.renderOutline ||
    mesh.renderOverlay ||
    !mesh.isEnabled(false)
  ) {
    fail("unsupported deformation/instances/render policy on " + mesh.name);
  }
  const count = mesh.getTotalVertices(),
    attributes: Attributes = new Map();
  const normalMatrix = Matrix.Transpose(Matrix.Invert(relative));
  const determinant = relative.determinant(),
    vector = new Vector3();
  for (const kind of mesh.getVerticesDataKinds().sort()) {
    const buffer = mesh.getVertexBuffer(kind),
      size = buffer?.getSize();
    if (
      !buffer ||
      !size ||
      !sizes.get(kind)?.includes(size) ||
      buffer.getIsInstanced()
    ) {
      fail("unsupported vertex attribute " + kind + " on " + mesh.name);
    }
    const original = buffer.getFloatData(count, true);
    if (
      !original ||
      original.length !== count * size ||
      !Array.from(original).every(Number.isFinite)
    ) {
      fail("invalid vertex data " + kind + " on " + mesh.name);
    }
    const data = new Float32Array(original);
    if (dynamicKinds.has(kind)) {
      for (let i = 0; i < data.length; i += size) {
        vector.set(data[i], data[i + 1], data[i + 2]);
        if (kind === VertexBuffer.PositionKind)
          Vector3.TransformCoordinatesToRef(vector, relative, vector);
        else {
          Vector3.TransformNormalToRef(
            vector,
            kind === VertexBuffer.NormalKind ? normalMatrix : relative,
            vector,
          );
          if (vector.lengthSquared() < 1e-20)
            fail("zero direction on " + mesh.name);
          vector.normalize();
        }
        data[i] = vector.x;
        data[i + 1] = vector.y;
        data[i + 2] = vector.z;
        if (kind === VertexBuffer.TangentKind && determinant < 0)
          data[i + 3] *= -1;
      }
    }
    if (!data.every(Number.isFinite))
      fail("nonfinite transformed attribute " + kind + " on " + mesh.name);
    attributes.set(kind, { size, data });
  }
  if (
    !attributes.has(VertexBuffer.PositionKind) ||
    !attributes.has(VertexBuffer.NormalKind)
  )
    fail("positions/normals required on " + mesh.name);
  return attributes;
}
function compactPiece(
  door: CadDoorDefinition,
  part: string,
  attributes: Attributes,
  indices: number[],
  reflected: boolean,
): Piece {
  const remap = new Map<number, number>(),
    compact: Attributes = new Map();
  for (const index of indices)
    if (!remap.has(index)) remap.set(index, remap.size);
  for (const [kind, { size, data }] of attributes) {
    const values = new Float32Array(remap.size * size);
    for (const [old, index] of remap)
      values.set(data.subarray(old * size, (old + 1) * size), index * size);
    compact.set(kind, { size, data: values });
  }
  const mapped = indices.map((index) => remap.get(index)!);
  if (reflected)
    for (let i = 0; i < mapped.length; i += 3)
      [mapped[i + 1], mapped[i + 2]] = [mapped[i + 2], mapped[i + 1]];
  return { door, part, attributes: compact, indices: mapped };
}

function sourceGroups(
  scene: Scene,
  pivot: TransformNode,
  meshes: readonly AbstractMesh[],
  definitions: readonly CadDoorDefinition[],
) {
  const identity = { translation: { x: 0, y: 0, z: 0 }, yaw: 0 };
  const doors = cadDoorDefinitionsById(
    definitions.map((def) => placeCadDoorDefinition(def, identity)),
  );
  const parts = new Map<string, CadDoorDefinition>();
  for (const { definition } of doors.values())
    for (const part of definition.renderPartIds) parts.set(part, definition);
  const found = new Map<string, Node>(),
    sources = new Set<Mesh>(),
    groups: Group[] = [];
  const grouped = new Map<string, Map<Material, Group>>();
  const pivotWorld = pivot.computeWorldMatrix(true);
  if (
    !Number.isFinite(pivotWorld.determinant()) ||
    Math.abs(pivotWorld.determinant()) < 1e-12
  )
    fail("singular pivot transform");
  const inversePivot = Matrix.Invert(pivotWorld);
  for (const candidate of new Set(meshes)) {
    if (!candidate.getTotalVertices()) continue;
    const matches: { part: string; node: Node }[] = [];
    for (
      let node: Node | null = candidate;
      node && node !== pivot;
      node = node.parent
    ) {
      if (parts.has(node.name)) matches.push({ part: node.name, node });
    }
    const extras = inheritedExtras(candidate, pivot);
    if (!matches.length) {
      if (extras.doorId !== undefined)
        fail("unclaimed imported door part " + candidate.name);
      continue;
    }
    if (matches.length !== 1)
      fail("ambiguous render part on " + candidate.name);
    if (
      !(candidate instanceof Mesh) ||
      candidate.getScene() !== scene ||
      !candidate.isDescendantOf(pivot)
    )
      fail("render part is not a mesh under the CAD pivot: " + candidate.name);
    for (
      let node: Node | null = candidate;
      node && node !== pivot;
      node = node.parent
    ) {
      if (!node.isEnabled(false))
        fail("disabled imported hierarchy on " + candidate.name);
    }
    const { part, node } = matches[0],
      door = parts.get(part)!;
    if (found.has(part) && found.get(part) !== node)
      fail("duplicate named render part " + part);
    if (extras.doorId !== undefined && extras.doorId !== door.id)
      fail("unknown/mismatched doorId on " + part);
    if (extras.floorId !== undefined && extras.floorId !== door.floor)
      fail("mismatched floorId on " + part);
    found.set(part, node);
    sources.add(candidate);
    const relative = candidate.computeWorldMatrix(true).multiply(inversePivot),
      determinant = relative.determinant();
    if (
      !Array.from(relative.asArray()).every(Number.isFinite) ||
      Math.abs(determinant) < 1e-12
    )
      fail("singular/nonfinite mesh transform " + part);
    const attributes = readAttributes(candidate, relative);
    const schema = [...attributes]
      .map(([kind, a]) => kind + ":" + a.size)
      .join("|");
    const allIndices = candidate.getIndices();
    if (
      !allIndices?.length ||
      allIndices.length % 3 ||
      !Array.from(allIndices).every(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < candidate.getTotalVertices(),
      )
    )
      fail("invalid triangle indices on " + part);
    const coverage = new Uint8Array(allIndices.length),
      policy = renderPolicy(candidate);
    for (const sub of candidate.subMeshes) {
      const material = sub.getMaterial(false);
      if (
        !material ||
        material.fillMode !== Material.TriangleFillMode ||
        sub.indexStart < 0 ||
        sub.indexCount <= 0 ||
        sub.indexStart % 3 ||
        sub.indexCount % 3 ||
        sub.indexStart + sub.indexCount > allIndices.length
      )
        fail("invalid material/submesh on " + part);
      for (let i = sub.indexStart; i < sub.indexStart + sub.indexCount; i++)
        if (coverage[i]++) fail("overlapping submeshes on " + part);
      let floor = grouped.get(door.floor);
      if (!floor) grouped.set(door.floor, (floor = new Map()));
      let group = floor.get(material);
      if (!group) {
        group = {
          floor: door.floor,
          material,
          source: candidate,
          policy,
          schema,
          pieces: [],
        };
        floor.set(material, group);
        groups.push(group);
      } else if (
        group.schema !== schema ||
        JSON.stringify(group.policy) !== JSON.stringify(policy)
      ) {
        fail(
          "incompatible vertex layout/render policy within floor/material batch " +
            door.floor +
            "/" +
            material.name,
        );
      }
      group.pieces.push(
        compactPiece(
          door,
          part,
          attributes,
          Array.from(
            allIndices.slice(sub.indexStart, sub.indexStart + sub.indexCount),
          ),
          determinant < 0,
        ),
      );
    }
    if (coverage.some((count) => count !== 1))
      fail("uncovered indices on " + part);
  }
  for (const part of parts.keys())
    if (!found.has(part)) fail("missing render part " + part);
  return { groups, sources, doors };
}

function makeBatch(
  scene: Scene,
  pivot: TransformNode,
  group: Group,
  index: number,
): Batch {
  // Contiguous ranges per door let one state upload only that door's data.
  const pieces = [...group.pieces].sort((a, b) =>
    a.door.id.localeCompare(b.door.id),
  );
  const vertices = pieces.reduce(
    (sum, p) =>
      sum + p.attributes.get(VertexBuffer.PositionKind)!.data.length / 3,
    0,
  );
  const attributes: Attributes = new Map(),
    closed: Attributes = new Map(),
    indices: number[] = [],
    ranges: Range[] = [];
  for (const [kind, { size }] of pieces[0].attributes)
    attributes.set(kind, { size, data: new Float32Array(vertices * size) });
  const minimum = new Vector3(Infinity, Infinity, Infinity),
    maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  let offset = 0;
  for (const piece of pieces) {
    const positions = piece.attributes.get(VertexBuffer.PositionKind)!.data,
      count = positions.length / 3;
    for (const [kind, { size, data }] of piece.attributes)
      attributes.get(kind)!.data.set(data, offset * size);
    for (const i of piece.indices) indices.push(i + offset);
    const previous = ranges.at(-1);
    if (previous?.id === piece.door.id) previous.count += count;
    else ranges.push({ id: piece.door.id, start: offset, count });
    const transform = cadDoorModelTransform(piece.door, true),
      c = Math.cos(transform.rotationY),
      s = Math.sin(transform.rotationY);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i],
        y = positions[i + 1],
        z = positions[i + 2];
      minimum.minimizeInPlaceFromFloats(x, y, z);
      maximum.maximizeInPlaceFromFloats(x, y, z);
      const ox = c * x + s * z + transform.translation.x,
        oz = -s * x + c * z + transform.translation.z;
      minimum.minimizeInPlaceFromFloats(ox, y, oz);
      maximum.maximizeInPlaceFromFloats(ox, y, oz);
    }
    offset += count;
  }
  const mesh = new Mesh("cad-door-batch:" + group.floor + ":" + index, scene);
  try {
    mesh.parent = pivot;
    mesh.material = group.material;
    mesh.isPickable = false;
    const {
      receiveShadows,
      isVisible,
      visibility,
      layerMask,
      renderingGroupId,
      alphaIndex,
      sideOrientation,
      useVertexColors,
      hasVertexAlpha,
      applyFog,
    } = group.policy;
    Object.assign(mesh, {
      receiveShadows,
      isVisible,
      visibility,
      layerMask,
      renderingGroupId,
      alphaIndex,
      sideOrientation,
      useVertexColors,
      hasVertexAlpha,
      applyFog,
    });
    const extras = {
      ...group.source.metadata?.gltf?.extras,
      role: "door-batch",
      floorId: group.floor,
    };
    delete extras.doorId;
    mesh.metadata = {
      ...group.source.metadata,
      gltf: { ...group.source.metadata?.gltf, extras },
      shadowCaster: group.policy.shadowCaster,
      cadDoorBatch: true,
      floorId: group.floor,
      cadDoorIds: ranges.map((range) => range.id),
      cadDoorSourcePartIds: [...new Set(pieces.map((piece) => piece.part))],
      cadDoorRanges: ranges.map((range) => ({ ...range })),
    };
    for (const [kind, attribute] of attributes) {
      if (dynamicKinds.has(kind))
        closed.set(kind, {
          size: attribute.size,
          data: attribute.data.slice(),
        });
      mesh.setVerticesData(
        kind,
        attribute.data,
        dynamicKinds.has(kind),
        attribute.size,
      );
    }
    mesh.setIndices(indices);
    // Discrete closed/open bounds are fixed; no per-update batch scan or stale closed culling.
    mesh.setBoundingInfo(new BoundingInfo(minimum, maximum));
    mesh.computeWorldMatrix(true);
    return { mesh, attributes, closed, ranges };
  } catch (error) {
    mesh.dispose(false, false);
    throw error;
  }
}

/** Replace native CLOSED leaves with exact floor/material batches. Call after import
 * roots are parented to pivot. The container still owns every source mesh/material.
 * Dispose this controller before disposing that container. No scene observer per door. */
export function createCadDoorRenderer(
  scene: Scene,
  pivot: TransformNode,
  meshes: readonly AbstractMesh[],
  definitions: readonly CadDoorDefinition[],
): CadDoorRenderer {
  if (
    !scene.useRightHandedSystem ||
    pivot.getScene() !== scene ||
    pivot.isDisposed()
  )
    fail("right-handed live CAD pivot required");
  const { groups, sources, doors } = sourceGroups(
      scene,
      pivot,
      meshes,
      definitions,
    ),
    batches: Batch[] = [];
  try {
    for (const [index, group] of groups.entries())
      batches.push(makeBatch(scene, pivot, group, index));
  } catch (error) {
    for (const batch of batches) batch.mesh.dispose(false, false);
    throw error;
  }
  const enabled = new Map(
    [...sources].map((mesh) => [mesh, mesh.isEnabled(false)]),
  );
  for (const mesh of sources) mesh.setEnabled(false);
  const state = new Map([...doors.keys()].map((id) => [id, false]));
  const locations = new Map<string, { batch: Batch; range: Range }[]>();
  for (const batch of batches)
    for (const range of batch.ranges) {
      let list = locations.get(range.id);
      if (!list) locations.set(range.id, (list = []));
      list.push({ batch, range });
    }
  const stats = {
    doors: doors.size,
    sourceMeshes: sources.size,
    batches: batches.length,
    materials: new Set(groups.map((group) => group.material)).size,
    vertices: batches.reduce(
      (n, batch) => n + batch.mesh.getTotalVertices(),
      0,
    ),
    triangles: batches.reduce(
      (n, batch) => n + batch.mesh.getTotalIndices() / 3,
      0,
    ),
    stateChanges: 0,
    bufferUploads: 0,
    verticesUpdated: 0,
    bytesUploaded: 0,
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.onDisposeObservable.remove(observer);
    for (const { mesh } of batches) mesh.dispose(false, false);
    for (const [mesh, wasEnabled] of enabled)
      if (!mesh.isDisposed()) mesh.setEnabled(wasEnabled);
    locations.clear();
    state.clear();
    doors.clear();
    batches.length = 0;
    enabled.clear();
  };
  const observer = scene.onDisposeObservable.add(dispose);
  return {
    stats,
    dispose,
    setStates(next) {
      if (disposed) fail("renderer disposed");
      const seen = new Set<string>();
      for (const item of next) {
        if (
          !item ||
          !state.has(item.id) ||
          typeof item.open !== "boolean" ||
          seen.has(item.id)
        )
          fail("unknown/duplicate/invalid door state");
        seen.add(item.id);
      }
      for (const item of next) {
        if (state.get(item.id) === item.open) continue;
        const transform = cadDoorModelTransform(
          doors.get(item.id)!.definition,
          item.open,
        );
        const c = Math.cos(transform.rotationY),
          s = Math.sin(transform.rotationY);
        for (const { batch, range } of locations.get(item.id)!) {
          for (const [kind, { size, data: base }] of batch.closed) {
            const data = batch.attributes.get(kind)!.data,
              start = range.start * size,
              end = (range.start + range.count) * size;
            if (!item.open) data.set(base.subarray(start, end), start);
            else
              for (let i = start; i < end; i += size) {
                const x = base[i],
                  z = base[i + 2],
                  position = kind === VertexBuffer.PositionKind;
                data[i] =
                  c * x + s * z + (position ? transform.translation.x : 0);
                data[i + 1] = base[i + 1];
                data[i + 2] =
                  -s * x + c * z + (position ? transform.translation.z : 0);
              }
            // Keep the complete CPU array owned by VertexBuffer (context rebuilds).
            // VertexBuffer.updateDirectly would discard/replace that CPU copy.
            scene
              .getEngine()
              .updateDynamicVertexBuffer(
                batch.mesh.getVertexBuffer(kind)!.getBuffer()!,
                data.subarray(start, end),
                start * 4,
                (end - start) * 4,
              );
            stats.bufferUploads++;
            stats.bytesUploaded += (end - start) * 4;
          }
          stats.verticesUpdated += range.count;
        }
        state.set(item.id, item.open);
        stats.stateChanges++;
      }
    },
  };
}
