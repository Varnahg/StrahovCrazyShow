import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import earcut from "earcut";
import {TERRAIN_PATCH} from "../shared/terrain-patches";
import { chunkStaticMesh } from "./static-submesh-chunks";
import {
  createTerrainTiles,
  terrainMeshData,
  drapeTriangles,
  groundHeight,
  REALITY_GROUND,
  type GroundPoint,
  type GroundRect,
  type GroundBounds,
  type TerrainMeshData,
} from "../shared/terrain";

export function applyTerrainData(mesh: Mesh, data: TerrainMeshData) {
  const vertex = new VertexData();
  vertex.positions = data.positions;
  vertex.normals = data.normals;
  vertex.indices = data.indices;
  vertex.uvs = data.uvs;
  vertex.applyToMesh(mesh);
}

function authoredSurface(scene: Scene, name: string, color: string) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor.setAll(0.015);
  if (typeof document === "undefined") return material;
  const texture = new DynamicTexture(
    `${name}:grain`,
    { width: 256, height: 256 },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = "#dddcd4";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 10729;
  for (let i = 0; i < 12000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 130 + (seed % 100);
    ctx.fillStyle = `rgba(${value},${value},${value},.22)`;
    ctx.fillRect((seed >>> 7) % 256, (seed >>> 17) % 256, 1, 1);
  }
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  texture.update(false);
  material.diffuseTexture = texture;
  return material;
}

/** Replaces the flat ground render loop. Physics MUST call createTerrainTiles
 * with these same rects/bounds and use the supplied tile arrays verbatim.
 */
export function buildTerrain(context: {
  scene: Scene;
  rects: GroundRect[];
  bounds: GroundBounds;
}) {
  const tiles = createTerrainTiles(context.rects, context.bounds);
  const mesh = new Mesh("source-dmr5g-terrain", context.scene);
  applyTerrainData(mesh, terrainMeshData(tiles));
  mesh.material = authoredSurface(
    context.scene,
    "terrain:soil-grass-base",
    "#78866c",
  );
  mesh.material.metadata = {
    surfaceKind: "grass",
    uvMetresPerRepeat: 4,
    interpretation: "generic vegetated base; mapped surfaces overlay",
  };
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  mesh.metadata = {
    source: "ČÚZK DMR 5G",
    sourceStepMetres: 4,
    heightCRS: "Bpv",
    foundationAdaptation: "B6 schematic interior",
    localTerrainReconstruction:{id:TERRAIN_PATCH.id,classification:TERRAIN_PATCH.classification,measured:false,rawSourceUnchanged:true,apronWidthMetres:TERRAIN_PATCH.apronWidthMetres},
    depthCaster: false,
  };
  chunkStaticMesh(mesh);
  return { mesh, meshes: [mesh], tiles };
}

function meshForPolygon(
  scene: Scene,
  name: string,
  points: GroundPoint[],
  offset: number,
  material: StandardMaterial,
) {
  const mesh = new Mesh(name, scene);
  const data = drapeTriangles(points, earcut(points.flat(), [], 2), offset);
  applyTerrainData(mesh, data);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.metadata = { depthCaster: false };
  mesh.freezeWorldMatrix();
  return mesh;
}

/** Only interpreted central-court geometry, paint and representative bays from
 * the archived IPR ortho. Trees/grass must reject REALITY_GROUND.surfaces too.
 * No road/car collider is added: it is the same underlying terrain height.
 */
export function buildRealityGround({ scene }: { scene: Scene }) {
  const meshes: Mesh[] = [];
  const asphalt = authoredSurface(scene, "photo:central-asphalt", "#666b68");
  asphalt.metadata = { surfaceKind: "asphalt", uvMetresPerRepeat: 4 };
  asphalt.zOffset = -1;
  for (const surface of REALITY_GROUND.surfaces) {
    for (const [index, fill] of surface.fills.entries()) {
      const points = [...fill.outer] as GroundPoint[],
        holes: number[] = [];
      for (const ring of fill.holes) {
        holes.push(points.length);
        points.push(...(ring as GroundPoint[]));
      }
      const mesh = new Mesh(surface.id + ":" + index, scene);
      applyTerrainData(
        mesh,
        drapeTriangles(points, earcut(points.flat(), holes, 2), 0.011),
      );
      mesh.material = asphalt;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      mesh.metadata = {
        depthCaster: false,
        source: REALITY_GROUND.source,
        interpretation: surface.note,
      };
      meshes.push(mesh);
    }
  }
  const paint = new StandardMaterial("photo:central-faded-bay-paint", scene);
  paint.diffuseColor = Color3.FromHexString("#b6b5a9");
  paint.specularColor.setAll(0);
  paint.zOffset = -3;
  const pieces: Mesh[] = [];
  for (const line of REALITY_GROUND.paintLines) {
    const [a, b] = line.points as GroundPoint[],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 0.1) continue;
    const nx = ((-dz / length) * line.width) / 2,
      nz = ((dx / length) * line.width) / 2;
    const points: GroundPoint[] = [
      [a[0] + nx, a[1] + nz],
      [a[0] - nx, a[1] - nz],
      [b[0] - nx, b[1] - nz],
      [b[0] + nx, b[1] + nz],
    ];
    pieces.push(meshForPolygon(scene, line.id, points, 0.025, paint));
  }
  if (pieces.length) {
    const merged = Mesh.MergeMeshes(pieces, true, true);
    if (merged) {
      merged.name = "photo:central-bay-lines";
      merged.isPickable = false;
      merged.metadata = { depthCaster: false };
      merged.freezeWorldMatrix();
      meshes.push(merged);
    }
  }
  for (const entry of REALITY_GROUND.paint) {
    const points = entry.points as GroundPoint[];
    const data = drapeTriangles(points, earcut(points.flat(), [], 2), 0.029);
    const minX = Math.min(...points.map((p) => p[0])),
      maxX = Math.max(...points.map((p) => p[0])),
      minZ = Math.min(...points.map((p) => p[1])),
      maxZ = Math.max(...points.map((p) => p[1]));
    data.uvs = [];
    for (let i = 0; i < data.positions.length; i += 3)
      data.uvs.push(
        (data.positions[i] - minX) / (maxX - minX),
        (data.positions[i + 2] - minZ) / (maxZ - minZ),
      );
    const material = new StandardMaterial(entry.id + ":paint", scene);
    material.diffuseColor = Color3.FromHexString(entry.color);
    material.specularColor.setAll(0);
    material.zOffset = -4;
    material.transparencyMode = Material.MATERIAL_ALPHATEST;
    if (typeof document !== "undefined") {
      const texture = new DynamicTexture(
        entry.id + ":authored-lettering",
        { width: 1024, height: 256 },
        scene,
        true,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, 1024, 256);
      ctx.fillStyle = "rgba(245,244,230,.91)";
      ctx.strokeStyle = "rgba(245,244,230,.88)";
      ctx.lineWidth = 9;
      ctx.font = "bold 112px Arial, sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(entry.text, 196, 206, 815);
      // Authored outline interpretation of the clearly visible hill/tower mark.
      ctx.beginPath();
      ctx.moveTo(20, 210);
      ctx.quadraticCurveTo(95, 42, 180, 210);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(30, 190);
      ctx.quadraticCurveTo(102, 165, 160, 194);
      ctx.stroke();
      ctx.strokeRect(62, 94, 24, 50);
      ctx.strokeRect(128, 55, 19, 57);
      ctx.beginPath();
      ctx.moveTo(137, 55);
      ctx.lineTo(137, 24);
      ctx.moveTo(128, 36);
      ctx.lineTo(146, 36);
      ctx.stroke();
      texture.hasAlpha = true;
      texture.anisotropicFilteringLevel = 8;
      texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      texture.update(false);
      material.diffuseTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
    }
    const mesh = new Mesh(entry.id, scene);
    applyTerrainData(mesh, data);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.metadata = {
      depthCaster: false,
      source: REALITY_GROUND.source,
      interpretation: entry.note,
    };
    meshes.push(mesh);
  }
  return { meshes, parkingSlots: REALITY_GROUND.parkingSlots };
}

/** Vertical foundation skirt reconciles a horizontal building base with the
 * varying external terrain. It does not curve the facade/roof or hide stairs.
 */
export function buildingFoundationData(
  points: GroundPoint[],
  baseY: number,
): TerrainMeshData {
  const positions: number[] = [],
    indices: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  // Map rings may arrive in either direction. Match the facade's outward
  // normals and Babylon's native clockwise front faces, without moving the
  // existing perimeter or changing its terrain-following lower boundary.
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const orientation = area >= 0 ? 1 : -1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-5) continue;
    const count = Math.ceil(length / 4);
    for (let segment = 0; segment < count; segment++) {
      const from = segment / count,
        to = (segment + 1) / count,
        x1 = a[0] + (b[0] - a[0]) * from,
        z1 = a[1] + (b[1] - a[1]) * from,
        x2 = a[0] + (b[0] - a[0]) * to,
        z2 = a[1] + (b[1] - a[1]) * to,
        y1 = Math.min(baseY - 0.05, groundHeight(x1, z1) - 0.15),
        y2 = Math.min(baseY - 0.05, groundHeight(x2, z2) - 0.15),
        start = positions.length / 3;
      positions.push(x1, y1, z1, x2, y2, z2, x1, baseY, z1, x2, baseY, z2);
      const nx = orientation * (b[1] - a[1]) / length,
        nz = -orientation * (b[0] - a[0]) / length;
      for (let vertex = 0; vertex < 4; vertex++) normals.push(nx, 0, nz);
      // Matches the foundation material's uvMetresPerRepeat:4. Edge fractions
      // previously stretched one repeat over an entire building, while v=0..1
      // squeezed it differently at every sampled terrain height.
      uvs.push(
        from * length / 4, y1 / 4, to * length / 4, y2 / 4,
        from * length / 4, baseY / 4, to * length / 4, baseY / 4,
      );
      if (orientation > 0)
        indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
      else
        indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
  }
  return { positions, indices, normals, uvs };
}
