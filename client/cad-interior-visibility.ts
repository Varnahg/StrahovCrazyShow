import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { cadSpaceAtLocalPosition, cadWorldToLocal, type CadBuildingSite, type CadPlacement, type CadPoint3 } from "../shared/cad-building-geometry";
import type { CadDoorDefinition, CadDoorState } from "../shared/cad-doors";

/** Herní výřez vstupu, nikoli změna zaměřené budovy nebo kolize. */
export const CAD_ENTRY_DEPTH = 4;
export type CadEntryZone = {
  id: string; center: CadPoint3; nx: number; nz: number; halfWidth: number; halfHeight: number;
};
export function cadInteriorAt(site: CadBuildingSite, point: CadPoint3) {
  const space = cadSpaceAtLocalPosition(site, point);
  return space && space.cover.role !== "canopy" ? space : undefined;
}

/** Normála míří dovnitř. Přístřešek nad venkovními schody není interiér. */
export function cadEntryZones(site: CadBuildingSite, doors: readonly CadDoorDefinition[]): CadEntryZone[] {
  return doors.flatMap(door => {
    const center = door.closedPose.position;
    const nx = Math.sin(door.closedPose.rotationY), nz = Math.cos(door.closedPose.rotationY);
    const side = (sign: number) => !!cadInteriorAt(site, { x: center.x + sign * nx, y: center.y, z: center.z + sign * nz });
    const positive = side(1), negative = side(-1);
    if (positive === negative) return [];
    const sign = positive ? 1 : -1;
    return [{ id: door.id, center, nx: nx * sign, nz: nz * sign,
      halfWidth: door.collider.halfExtents.x + 1, halfHeight: door.collider.halfExtents.y + 0.5 }];
  });
}

function inEntry(zone: CadEntryZone, point: CadPoint3) {
  const x = point.x - zone.center.x, z = point.z - zone.center.z;
  const depth = x * zone.nx + z * zone.nz;
  return depth >= -0.3 && depth <= CAD_ENTRY_DEPTH &&
    Math.abs(x * zone.nz - z * zone.nx) <= zone.halfWidth &&
    Math.abs(point.y - zone.center.y) <= zone.halfHeight;
}
function entryKey(zones: readonly CadEntryZone[], point: CadPoint3) {
  let key = "";
  for (const zone of zones) if (inEntry(zone, point)) key += (key ? "|" : "") + zone.id;
  return key;
}
export function cadDoorVisibilityGroup(zones: readonly CadEntryZone[], door: CadDoorDefinition) {
  return zones.some(zone => zone.id === door.id) ? "exterior" : entryKey(zones, door.closedPose.position);
}

/** PBR použije existující scene.environmentTexture; žádný další render pass. */
export function configureCadWindowGlass(material: Material) {
  if (!(material instanceof PBRMaterial) || !/\bglass\b/i.test(material.name)) return;
  material.alpha = 1;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  material.useAlphaFromAlbedoTexture = false;
  material.opacityTexture = null;
  material.subSurface.isRefractionEnabled = false;
  material.metallic = 0.15;
  material.roughness = 0.28;
  material.metadata = { ...material.metadata, exteriorOnlyGlass: true, cadOpaqueGlass: true };
}

type EntryMesh = { mesh: Mesh; doorIds: string[]; triangles: number };
type ManagedMesh = { mesh: AbstractMesh; enabled: boolean; triangles: number; entryIds?: string[] };

export function cadMeshRole(mesh: AbstractMesh, pivot?: TransformNode): string {
  for (let node: import("@babylonjs/core/node").Node | null = mesh; node && node !== pivot; node = node.parent) {
    const role = node.metadata?.gltf?.extras?.role;
    if (typeof role === "string") return role;
  }
  return "";
}

/** Jednorázové rozdělení indexů. Klony sdílejí GPU atributy i index buffer;
 * celé původní trojúhelníky se uvnitř stále kreslí právě jednou. */
function splitEntryMesh(mesh: Mesh, pivot: TransformNode, zones: readonly CadEntryZone[]): EntryMesh[] {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind), indices = mesh.getIndices();
  if (!positions || !indices?.length || !zones.length) return [];
  if (mesh.subMeshes.length !== 1 || mesh.skeleton || mesh.morphTargetManager || mesh.hasThinInstances || mesh.instances.length)
    throw new Error(`Nepodporovaná struktura CAD interiéru: ${mesh.name}`);
  const relative = mesh.computeWorldMatrix(true).multiply(Matrix.Invert(pivot.computeWorldMatrix(true)));
  const local = new Float32Array(positions.length), point = new Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i + 1], positions[i + 2], relative, point);
    local[i] = point.x; local[i + 1] = point.y; local[i + 2] = point.z;
  }
  const groups = new Map<string, number[]>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    // Celý trojúhelník; žádné nové hrany, interpolace UV ani úprava normál.
    point.set((local[a] + local[b] + local[c]) / 3,
      (local[a + 1] + local[b + 1] + local[c + 1]) / 3,
      (local[a + 2] + local[b + 2] + local[c + 2]) / 3);
    const key = entryKey(zones, point);
    let group = groups.get(key);
    if (!group) groups.set(key, group = []);
    group.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  if (![...groups.keys()].some(Boolean)) return [];
  // Sdílený import může mít další instance, jejich původní pořadí se nesmí změnit.
  if ((mesh.geometry?.meshes.length ?? 0) > 1) mesh.makeGeometryUnique();
  const reordered = new Uint32Array(indices.length);
  let offset = 0;
  const ranges: { key: string; start: number; count: number }[] = [];
  for (const [key, group] of groups) {
    reordered.set(group, offset);
    if (key) ranges.push({ key, start: offset, count: group.length });
    offset += group.length;
  }
  mesh.setIndices(reordered);
  const entries: EntryMesh[] = [];
  try {
    for (const [i, range] of ranges.entries()) {
      const clone = mesh.clone(`${mesh.name}:entry:${i}`, mesh.parent, true);
      clone.releaseSubMeshes();
      new SubMesh(0, 0, clone.getTotalVertices(), range.start, range.count, clone);
      clone.metadata = { ...mesh.metadata, cadEntrySlice: true, cadEntryDoors: range.key.split("|") };
      clone.isPickable = false;
      clone.setEnabled(false);
      entries.push({ mesh: clone, doorIds: range.key.split("|"), triangles: range.count / 3 });
    }
    return entries;
  } catch (error) {
    for (const entry of entries) entry.mesh.dispose(false, false);
    throw error;
  }
}

export function createCadInteriorVisibility(
  pivot: TransformNode, meshes: readonly AbstractMesh[], site: CadBuildingSite,
  placement: CadPlacement, zones: readonly CadEntryZone[], doorMeshes: readonly AbstractMesh[],
) {
  const managed: ManagedMesh[] = [], entries: EntryMesh[] = [];
  try {
    for (const mesh of meshes) {
      if (!(mesh instanceof Mesh) || !cadMeshRole(mesh, pivot).startsWith("interior-")) continue;
      managed.push({ mesh, enabled: mesh.isEnabled(false), triangles: mesh.getTotalIndices() / 3 });
      entries.push(...splitEntryMesh(mesh, pivot, zones));
    }
    for (const mesh of doorMeshes) {
      const group: string = mesh.metadata.cadVisibilityGroup;
      if (group === "exterior") continue;
      managed.push({ mesh, enabled: mesh.isEnabled(false), triangles: mesh.getTotalIndices() / 3,
        entryIds: group ? group.split("|") : [] });
    }
  } catch (error) {
    for (const entry of entries) entry.mesh.dispose(false, false);
    throw error;
  }
  const open = new Set<string>();
  const stats = { buildingId: site.id, inside: false, portals: zones.length,
    interiorMeshes: managed.length, interiorTriangles: managed.reduce((sum, m) => sum + m.triangles, 0),
    enabledMeshes: 0, enabledPotentialTriangles: 0, entryMeshes: entries.length };
  let disposed = false, dirty = true;
  const apply = (inside: boolean) => {
    if (!dirty && stats.inside === inside) return;
    dirty = false; stats.inside = inside;
    stats.enabledMeshes = 0; stats.enabledPotentialTriangles = 0;
    for (const item of managed) {
      const enabled = item.enabled && (inside || !!item.entryIds?.some(id => open.has(id)));
      item.mesh.setEnabled(enabled);
      if (enabled) { stats.enabledMeshes++; stats.enabledPotentialTriangles += item.triangles; }
    }
    for (const entry of entries) {
      const enabled = !inside && entry.doorIds.some(id => open.has(id));
      entry.mesh.setEnabled(enabled);
      if (enabled) { stats.enabledMeshes++; stats.enabledPotentialTriangles += entry.triangles; }
    }
  };
  apply(false);
  return {
    stats,
    update(camera: CadPoint3) {
      if (!disposed) apply(!!cadInteriorAt(site, cadWorldToLocal(camera, placement)));
    },
    setDoorStates(states: readonly Pick<CadDoorState, "id" | "open">[]) {
      if (disposed) return;
      for (const zone of zones) {
        const state = states.find(item => item.id === zone.id);
        if (!state || open.has(zone.id) === state.open) continue;
        if (state.open) open.add(zone.id); else open.delete(zone.id);
        dirty = true;
      }
      apply(stats.inside);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries) entry.mesh.dispose(false, false);
      for (const item of managed) if (!item.mesh.isDisposed()) item.mesh.setEnabled(item.enabled);
      entries.length = managed.length = 0;
      open.clear();
    },
  };
}
