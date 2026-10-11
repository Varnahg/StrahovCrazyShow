import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import earcut from "earcut";
import { buildLandcover } from "./vegetation";
import {
  BUILDINGS,
  B6_BOXES,
  MAP,
  PLACES,
  HUNT_POINTS,
  BOUNDS,
  GROUND_RECTS,
  STADIUM,
  buildingArchitecture,
  measuredFootprint,
  blockNumber,
} from "../shared/world";
import type { Building } from "../shared/types";
import { buildStreets } from "./streets-renderer";
import { buildRoadDetails } from "./road-details";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  buildTerrain,
  buildRealityGround,
  buildingFoundationData,
  applyTerrainData,
} from "./terrain-renderer";
import { groundHeight, buildingBaseHeight } from "../shared/terrain";
import { buildArchitectureReality } from "./architecture-reality";
import { B6_LAYOUT } from "../shared/b6-interior";
import { buildLandmarkReality } from "./landmark-reality";
import { LANDMARK_BUILDING_REPLACEMENTS } from "../shared/landmark-reality";
import { TERRAIN_COVERAGE } from "../shared/world";
import { buildPhotogrammetryEntranceRepair } from "./photogrammetry-repairs";
import { buildPhotogrammetryGroundRepairs } from "./photogrammetry-ground";
import { createCampusExterior } from "./campus-exterior";
import { buildCampusExteriorPlan } from "../shared/campus-exterior";
import {
  getWorldAssetRoot,
  attachWorldAssetNode,
} from "./world-asset-identity";
import { osmAssetIdentity } from "../shared/world-asset-identity";
import { createB6BoxFaceParts, createB6StairMeshes } from "./b6-reality";

export interface WorldBuildContext {
  scene: Scene;
  box: (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    staticGroup?: boolean,
    yaw?: number,
  ) => Mesh;
  sphere: (
    name: string,
    x: number,
    y: number,
    z: number,
    size: number,
    color: string,
  ) => Mesh;
  label: (
    text: string,
    x: number,
    y: number,
    z: number,
    width?: number,
  ) => void;
  polygonBuilding: (
    points: [number, number][],
    height: number,
    color: string,
  ) => Mesh;
  mat: (hex: string) => StandardMaterial;
  staticMeshes: Map<StandardMaterial, Mesh[]>;
  huntMeshes: Mesh[];
  clouds: Mesh[];
  lights: PointLight[];
}

const COLORS = {
  plaster: "#d3d1c7",
  concrete: "#929893",
  base: "#797c75",
  asphalt: "#666b68",
  paving: "#aba99f",
  grass: "#788268",
  foliage: "#556b4e",
  foliageLight: "#667653",
  glass: "#50656c",
  frame: "#675750",
  metal: "#555f5f",
  wood: "#8f7560",
  roof: "#696f6c",
};

function collect(context: WorldBuildContext, mesh: Mesh) {
  const material = mesh.material as StandardMaterial;
  const group = context.staticMeshes.get(material) ?? [];
  group.push(mesh);
  context.staticMeshes.set(material, group);
  mesh.isPickable = false;
}

function texture(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const result = new DynamicTexture(
    name,
    { width, height },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  draw(result.getContext() as unknown as CanvasRenderingContext2D);
  result.anisotropicFilteringLevel = 4;
  result.update(false);
  return result;
}

/** Authored trim atlases; no photographs from Google/Mapy/ČVUT become textures. */
function facadeMaterials(scene: Scene) {
  function make(name: string, end = false, cell = false) {
    const mat = new StandardMaterial("facade:" + name, scene);
    mat.specularColor.set(0.025, 0.025, 0.025);
    mat.backFaceCulling = false;
    const width = end ? 512 : 384,
      height = 256;
    mat.diffuseTexture = texture(
      scene,
      "atlas:" + name,
      width,
      height,
      (ctx) => {
        ctx.fillStyle = end ? COLORS.concrete : COLORS.plaster;
        ctx.fillRect(0, 0, width, height);
        // Large quiet panels survive mipmapping; avoid high-frequency striping.
        ctx.fillStyle = end ? "rgba(35,42,40,.035)" : "rgba(110,109,97,.045)";
        ctx.fillRect(0, 0, width, 17);
        ctx.fillStyle = "rgba(255,255,244,.11)";
        ctx.fillRect(0, height - 3, width, 3);
        const windows = end
          ? [
              { x: width * 0.17, y: 104, w: 40, h: 47 },
              { x: width * 0.17 + 49, y: 104, w: 40, h: 47 },
            ]
          : [{ x: cell ? 85 : 77, y: 79, w: cell ? 214 : 230, h: 125 }];
        for (const w of windows) {
          ctx.fillStyle = "rgba(34,42,40,.18)";
          ctx.fillRect(w.x - 7, w.y - 6, w.w + 14, w.h + 17);
          ctx.fillStyle = end ? "#b3b8b1" : "#b9bab1";
          ctx.fillRect(w.x - 5, w.y - 4, w.w + 10, w.h + 8);
          ctx.fillStyle = COLORS.frame;
          ctx.fillRect(w.x, w.y, w.w, w.h);
          const glass = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
          glass.addColorStop(0, "#6e8288");
          glass.addColorStop(0.45, "#50656c");
          glass.addColorStop(1, "#3e5054");
          ctx.fillStyle = glass;
          ctx.fillRect(w.x + 5, w.y + 5, w.w - 10, w.h - 10);
          if (!end) {
            ctx.fillStyle = COLORS.frame;
            for (const f of [1 / 3, 2 / 3])
              ctx.fillRect(w.x + w.w * f - 2, w.y + 2, 4, w.h - 4);
            ctx.fillStyle = "rgba(207,214,207,.18)";
            ctx.fillRect(w.x + 6, w.y + 6, 3, w.h - 12);
          }
          ctx.fillStyle = "#c0bfb3";
          ctx.fillRect(w.x - 8, w.y + w.h + 2, w.w + 16, 5);
        }
      },
    );
    // Eight rooms by six storeys prevent a single repeated glowing window.
    // This is simulated occupancy, not information about real residents.
    const emission = texture(
      scene,
      "occupied rooms:" + name,
      1024,
      768,
      (ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 1024, 768);
        for (let row = 0; row < 6; row++)
          for (let col = 0; col < 8; col++) {
            const seed = ((row * 71 + col * 43 + (end ? 19 : 5)) * 16807) % 101;
            if (seed > 34) continue;
            const ox = col * 128,
              oy = row * 128;
            ctx.fillStyle = seed % 3 ? "#edc997" : "#c7d9da";
            const windows = end
              ? [
                  { x: 0.17, y: 104 / 256, w: 40 / 512, h: 47 / 256 },
                  {
                    x: 0.17 + 49 / 512,
                    y: 104 / 256,
                    w: 40 / 512,
                    h: 47 / 256,
                  },
                ]
              : [
                  {
                    x: (cell ? 85 : 77) / 384,
                    y: 79 / 256,
                    w: (cell ? 214 : 230) / 384,
                    h: 125 / 256,
                  },
                ];
            for (const w of windows) {
              const x = ox + (w.x + 5 / width) * 128,
                y = oy + (w.y + 5 / height) * 128,
                ww = (w.w - 10 / width) * 128,
                hh = (w.h - 10 / height) * 128;
              ctx.fillRect(x, y, ww, hh);
              ctx.fillStyle = "rgba(43,31,20,.44)";
              ctx.fillRect(x + ww * 0.6, y, ww * 0.17, hh);
              ctx.fillStyle = "#000";
              if (!end)
                for (const f of [1 / 3, 2 / 3])
                  ctx.fillRect(ox + (w.x + w.w * f) * 128 - 1, y, 2, hh);
            }
          }
      },
    );
    emission.uScale = 1 / 8;
    emission.vScale = 1 / 6;
    emission.level = 0;
    mat.emissiveTexture = emission;
    mat.emissiveColor.set(0, 0, 0);
    mat.metadata = { nightWindows: true };
    return mat;
  }
  return {
    long: make("long"),
    end: make("sparse-end", true),
    cell: make("cell", false, true),
  };
}

type FacadeEdge = {
  a: [number, number];
  b: [number, number];
  length: number;
  nx: number;
  nz: number;
  long: boolean;
};

/** Actual polygon edges, not the enclosing rectangle, place all facade pieces. */
export function facadeEdges(points: [number, number][]): FacadeEdge[] {
  const unique = points.slice();
  if (
    unique.length > 1 &&
    unique[0][0] === unique.at(-1)![0] &&
    unique[0][1] === unique.at(-1)![1]
  )
    unique.pop();
  let area = 0,
    longest = 0,
    axisX = 1,
    axisZ = 0;
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i],
      b = unique[(i + 1) % unique.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    area += a[0] * b[1] - b[0] * a[1];
    if (length > longest) {
      longest = length;
      axisX = (b[0] - a[0]) / length;
      axisZ = (b[1] - a[1]) / length;
    }
  }
  const sign = area >= 0 ? 1 : -1;
  return unique.flatMap((a, i) => {
    const b = unique[(i + 1) % unique.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.08) return [];
    const dx = (b[0] - a[0]) / length,
      dz = (b[1] - a[1]) / length;
    return [
      {
        a,
        b,
        length,
        nx: dz * sign,
        nz: -dx * sign,
        long: Math.abs(dx * axisX + dz * axisZ) > 0.88,
      },
    ];
  });
}

function facadePlane(
  context: WorldBuildContext,
  edge: FacadeEdge,
  bottom: number,
  top: number,
  material: StandardMaterial,
  module: number,
  offset = 0.045,
) {
  const { a, b, nx, nz } = edge;
  const ax = a[0] + nx * offset,
    az = a[1] + nz * offset;
  const bx = b[0] + nx * offset,
    bz = b[1] + nz * offset;
  const mesh = new Mesh("facade atlas", context.scene);
  const data = new VertexData();
  data.positions = [ax, bottom, az, bx, bottom, bz, bx, top, bz, ax, top, az];
  data.indices = [0, 1, 2, 0, 2, 3];
  data.normals = [nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz];
  data.uvs = [
    0,
    bottom / 3,
    edge.length / module,
    bottom / 3,
    edge.length / module,
    top / 3,
    0,
    top / 3,
  ];
  data.applyToMesh(mesh);
  mesh.material = material;
  collect(context, mesh);
}

function edgeStrip(
  context: WorldBuildContext,
  edge: FacadeEdge,
  y: number,
  height: number,
  color: string,
  depth = 0.08,
  offset = 0,
) {
  context.box(
    "facade trim",
    (edge.a[0] + edge.b[0]) / 2 + edge.nx * offset,
    y,
    (edge.a[1] + edge.b[1]) / 2 + edge.nz * offset,
    depth,
    height,
    edge.length,
    color,
    true,
    Math.atan2(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]),
  );
}

function flatRoof(
  context: WorldBuildContext,
  points: [number, number][],
  height: number,
  color = COLORS.roof,
  holes: [number, number][][] = [],
) {
  const rings = [points, ...holes].map((ring) =>
    ring.slice(
      0,
      ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]
        ? -1
        : undefined,
    ),
  );
  const flat = rings.flat().flat(),
    holeIndices: number[] = [];
  let count = rings[0].length;
  for (let i = 1; i < rings.length; i++) {
    holeIndices.push(count);
    count += rings[i].length;
  }
  const mesh = new Mesh(
    holes.length ? "stadium open-ring roof" : "flat roof",
    context.scene,
  );
  const data = new VertexData();
  data.positions = rings.flat().flatMap(([x, z]) => [x, height, z]);
  data.indices = earcut(flat, holeIndices);
  data.normals = rings.flat().flatMap(() => [0, 1, 0]);
  data.uvs = rings.flat().flatMap(([x, z]) => [x / 16, z / 16]);
  data.applyToMesh(mesh);
  mesh.material = context.mat(color);
  (mesh.material as StandardMaterial).backFaceCulling = false;
  collect(context, mesh);
}

function removeOriginalRoof(
  mesh: Mesh,
  points: [number, number][],
  replacedEdges = new Set<number>(),
) {
  // The context's polygonBuilding already supplies a top face. Keep the wall
  // triangles only before adding the distinct roof material: a 1–2 cm offset
  // alone would still shimmer at a distance with a perspective depth buffer.
  const indices = mesh.getIndices();
  if (indices) {
    const walls: number[] = [];
    for (let edge = 0; edge < points.length - 1; edge++)
      if (!replacedEdges.has(edge))
        walls.push(...Array.from(indices).slice(edge * 6, (edge + 1) * 6));
    mesh.setIndices(walls);
  }
}

function removeBoxFace(mesh: Mesh, x: number, z: number) {
  const normals = mesh.getVerticesData("normal");
  const indices = mesh.getIndices();
  if (!normals || !indices) return;
  const remaining: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const vertex = indices[i] * 3;
    if (normals[vertex] * x + normals[vertex + 2] * z < 0.9)
      remaining.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  mesh.setIndices(remaining);
}

function building(
  context: WorldBuildContext,
  b: Building,
  atlases: ReturnType<typeof facadeMaterials>,
) {
  const architecture = buildingArchitecture(b),
    envelope = measuredFootprint(b);
  if (architecture?.block === 6) return;
  const dormitory = architecture?.kind === "dormitory";
  const color =
    architecture?.kind === "canteen"
      ? "#cbc6a7"
      : architecture?.kind === "fortification"
        ? "#8c8b7d"
        : ["garage", "service", "shed"].includes(architecture?.kind ?? "")
          ? "#a8aaa1"
          : COLORS.plaster;
  const edges = facadeEdges(b.points);
  const cladEdges = dormitory
    ? edges.filter((edge) => edge.length > (edge.long ? 12 : 9))
    : [];
  const replaced = new Set<number>();
  for (let index = 0; index < b.points.length - 1; index++)
    if (cladEdges.some((edge) => edge.a === b.points[index]))
      replaced.add(index);
  const body = context.polygonBuilding(b.points, b.height, color);
  removeOriginalRoof(body, b.points, replaced);
  body.metadata = {
    solid: true,
    osmId: b.id,
    kind: architecture?.kind ?? "unknown",
  };
  collect(context, body);
  for (const edge of edges) {
    edgeStrip(context, edge, 0.26, 0.52, COLORS.base, 0.09, -0.005);
    edgeStrip(
      context,
      edge,
      b.height - 0.08,
      0.16,
      COLORS.concrete,
      0.13,
      -0.025,
    );
    if (dormitory && edge.length > (edge.long ? 12 : 9)) {
      // Main room rhythm on long walls only; sparse pairs leave most end walls blank.
      facadePlane(
        context,
        edge,
        0,
        b.height,
        edge.long
          ? architecture.facade === "dormitory-cell"
            ? atlases.cell
            : atlases.long
          : atlases.end,
        edge.long ? 5.4 : 15.5,
        0,
      );
    }
  }
  flatRoof(context, b.points, b.height + 0.015);
  if (architecture?.block && envelope)
    context.label(
      "B" + architecture.block,
      envelope.center.x,
      b.height + 1.1,
      envelope.center.z,
      4,
    );
}

function b6(
  context: WorldBuildContext,
  atlases: ReturnType<typeof facadeMaterials>,
) {
  for (const b of B6_BOXES) {
    const mesh = context.box(
      "B6 " + b.kind,
      b.x,
      b.y,
      b.z,
      b.w,
      b.h,
      b.d,
      b.kind === "floor"
        ? b.y >= 18
          ? COLORS.roof
          : "#b3aea0"
        : b.kind === "stair"
          ? "#a4aaa4"
          : b.kind === "base"
            ? COLORS.base
            : COLORS.plaster,
    );
    // Replace visible outside faces, retain the wall thickness and inside faces.
    // The separate Rapier colliders are untouched.
    if (b.kind === "wall") {
      if (b.x === 16 && b.w === 0.35) removeBoxFace(mesh, 1, 0);
      if (b.x === 0 && b.w === 0.35) removeBoxFace(mesh, -1, 0);
      if (b.z === -90 && b.d === 0.35) removeBoxFace(mesh, 0, -1);
      if (b.z === -20 && b.d === 0.35) removeBoxFace(mesh, 0, 1);
    }
  }
  const east: FacadeEdge = {
    a: [16.175, -90],
    b: [16.175, -20],
    length: 70,
    nx: 1,
    nz: 0,
    long: true,
  };
  facadePlane(context, east, 0, 18, atlases.long, 5.4, 0);
  // Do not cover the real demo lobby opening (-76..-70) with a cosmetic facade.
  for (const [from, to] of [
    [-90, -76],
    [-70, -22],
  ]) {
    const edge: FacadeEdge = {
      a: [-0.175, to],
      b: [-0.175, from],
      length: to - from,
      nx: -1,
      nz: 0,
      long: true,
    };
    facadePlane(context, edge, 0, 18, atlases.long, 5.4, 0);
  }
  for (const z of [-90.175, -19.825]) {
    const edge: FacadeEdge = {
      a: [0, z],
      b: [16, z],
      length: 16,
      nx: 0,
      nz: z < -50 ? -1 : 1,
      long: false,
    };
    facadePlane(context, edge, 0, 18, atlases.end, 16, 0);
  }
  const west: FacadeEdge = {
    a: [-0.175, -90],
    b: [-0.175, -20],
    length: 70,
    nx: -1,
    nz: 0,
    long: true,
  };
  for (const edge of [east, west]) {
    edgeStrip(context, edge, 0.28, 0.55, COLORS.base, 0.1);
    edgeStrip(context, edge, 17.91, 0.18, COLORS.concrete, 0.15);
  }
  // Lobby retains its actual schematic outline and the open entry collision path.
  context.box(
    "B6 lobby roof fascia",
    -3.5,
    18.04,
    -70,
    7,
    0.22,
    0.11,
    COLORS.concrete,
  );
  for (let floor = 0; floor <= 5; floor++) {
    context.label(floor + " NP", -5, floor * 3 + 1.7, -73, 1.7);
    if (floor > 0)
      context.box("light", 8, floor * 3 + 2.6, -47, 0.4, 0.08, 2, "#f7d590");
  }
  context.label("B6", 8, 19.1, -55, 5);
  context.label("KLUBOVNA", -3.5, 15.9, -73, 3);
  context.label("VSTUP B6", -8, 3, -73, 3);
}

function stadium(context: WorldBuildContext) {
  // Stadium is a separate open-air structure. A roof polygon with holes explicitly
  // preserves the field void, unlike polygonBuilding on the outer footprint.
  const baseY = buildingBaseHeight(STADIUM.outerRings.flat());
  for (const outer of STADIUM.outerRings) {
    flatRoof(
      context,
      outer,
      baseY + STADIUM.height,
      "#858a84",
      STADIUM.innerRings,
    );
    for (const edge of facadeEdges(outer)) {
      if (edge.length < 0.5) continue;
      edgeStrip(
        context,
        edge,
        baseY + STADIUM.height / 2,
        STADIUM.height,
        "#929893",
        0.3,
        -0.15,
      );
      edgeStrip(context, edge, baseY + 1.1, 0.8, COLORS.base, 0.35, -0.12);
      edgeStrip(
        context,
        edge,
        baseY + STADIUM.height - 0.1,
        0.22,
        COLORS.concrete,
        0.4,
        -0.1,
      );
    }
  }
  for (const inner of STADIUM.innerRings) {
    for (const edge of facadeEdges(inner))
      edgeStrip(
        context,
        edge,
        baseY + STADIUM.height / 2,
        STADIUM.height,
        "#858a84",
        0.18,
      );
  }
  for (const part of STADIUM.parts) {
    const mesh = context.polygonBuilding(part.points, part.height, "#929893");
    mesh.position.y = baseY;
    removeOriginalRoof(mesh, part.points);
    mesh.metadata = {
      decorativeOnly: true,
      kind: "stadium",
      osmId: part.osmId,
    };
    collect(context, mesh);
    flatRoof(context, part.points, baseY + part.height + 0.025, "#6e7777");
  }
}

function clouds(context: WorldBuildContext) {
  const tex = texture(context.scene, "authored soft cloud", 256, 128, (ctx) => {
    // A single shared mipmapped alpha texture replaces 96 intersecting spheres.
    // Two altitude bands provide depth, no volumetric raymarching or particles.
    const blobs = [
      [52, 72, 43],
      [88, 57, 47],
      [128, 57, 52],
      [171, 66, 47],
      [208, 77, 35],
    ];
    for (const [x, y, r] of blobs) {
      const gradient = ctx.createRadialGradient(x, y, r * 0.12, x, y, r);
      gradient.addColorStop(0, "rgba(244,245,238,.75)");
      gradient.addColorStop(0.6, "rgba(237,240,235,.44)");
      gradient.addColorStop(1, "rgba(229,235,233,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  tex.hasAlpha = true;
  const material = new StandardMaterial("art:clouds", context.scene);
  material.diffuseTexture = tex;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.emissiveColor.set(0.85, 0.88, 0.88);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  for (let i = 0; i < 24; i++) {
    const site = (i * 7) % 24;
    const cloud = MeshBuilder.CreatePlane(
      "soft cloud",
      {
        width: 78 + (i % 4) * 14,
        height: 40 + (i % 3) * 8,
      },
      context.scene,
    );
    cloud.rotation.x = Math.PI / 2;
    cloud.rotation.y = ((i * 7) % 11) * 0.19;
    cloud.position.set(
      -220 + (site % 6) * 125,
      88 + (i % 2) * 23,
      -190 + Math.floor(site / 6) * 125,
    );
    cloud.material = material;
    cloud.isPickable = false;
    cloud.applyFog = false;
    context.clouds.push(cloud);
  }
}

export function buildWorld(
  context: WorldBuildContext,
  options: { photogrammetry?: boolean } = {},
) {
  const exteriorPlan = options.photogrammetry
    ? undefined
    : buildCampusExteriorPlan();
  if (options.photogrammetry) {
    buildPhotogrammetryEntranceRepair(context.scene);
    buildPhotogrammetryGroundRepairs(context.scene);
  }
  if (!options.photogrammetry) {
    buildTerrain({
      scene: context.scene,
      rects: GROUND_RECTS,
      bounds: TERRAIN_COVERAGE,
    });
    buildLandcover(
      context.scene,
      new Set(exteriorPlan!.courts.map((court) => court.osmId)),
    );
    buildStreets(context);
    buildRoadDetails(context.scene);
    buildRealityGround({ scene: context.scene });
  }
  const base = (b: Building) =>
    blockNumber(b.name) === 6
      ? B6_LAYOUT.foundationOffset
      : buildingBaseHeight(b.points);
  const architecture = options.photogrammetry
    ? undefined
    : buildArchitectureReality({
        scene: context.scene,
        baseElevation: (_x, _z, b) => base(b),
        buildings: BUILDINGS.filter(
          (b) => !LANDMARK_BUILDING_REPLACEMENTS.has(b.id),
        ),
      });
  const foundation = context.mat("#797c75");
  foundation.metadata = { surfaceKind: "concrete", uvMetresPerRepeat: 4 };
  for (const b of options.photogrammetry ? [] : BUILDINGS) {
    const mesh = new Mesh("building foundation " + b.id, context.scene);
    applyTerrainData(mesh, buildingFoundationData(b.points, base(b)));
    mesh.material = foundation;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.metadata = { shadowCaster: true };
    attachWorldAssetNode(
      mesh,
      getWorldAssetRoot(
        context.scene,
        osmAssetIdentity("building", "way", b.id),
        { x: b.points[0][0], y: base(b), z: b.points[0][1] },
      ),
    );
  }
  const b6Fallback = new TransformNode("B6 structural fallback", context.scene);
  const b6Root = getWorldAssetRoot(
    context.scene,
    osmAssetIdentity("building", "way", "53929071"),
    { x: 8, y: B6_LAYOUT.foundationOffset, z: -55 },
  );
  const fallbackGroups = new Map<
    string,
    {
      positions: number[];
      normals: number[];
      uvs: number[];
      indices: number[];
    }
  >();
  for (const b of B6_BOXES) {
    if ((b.kind as string) === "glass") continue;
    const color =
      b.kind === "floor"
        ? "#b3aea0"
        : b.kind === "base"
          ? COLORS.base
          : COLORS.plaster;
    const group = fallbackGroups.get(color) ?? {
      positions: [],
      normals: [],
      uvs: [],
      indices: [],
    };
    // The preload fallback shares the exact same omitted exterior faces as
    // the final controller and editable GLB, instead of recreating full boxes.
    for (const { data } of createB6BoxFaceParts(b)) {
      const offset = group.positions.length / 3;
      group.positions.push(...data.positions);
      group.normals.push(...data.normals);
      group.uvs.push(...data.uvs);
      for (const index of data.indices) group.indices.push(offset + index);
    }
    fallbackGroups.set(color, group);
  }
  for (const [color, group] of fallbackGroups) {
    const mesh = new Mesh(
      "B6 canonical structural fallback " + color,
      context.scene,
    );
    const data = new VertexData();
    Object.assign(data, group);
    data.applyToMesh(mesh);
    mesh.material = context.mat(color);
    mesh.isPickable = false;
    mesh.metadata = {
      b6Fallback: true,
      canonicalFaceFactory: true,
      shadowCaster: true,
    };
    mesh.parent = b6Fallback;
  }
  for (const mesh of createB6StairMeshes(
    context.scene,
    B6_LAYOUT.foundationOffset,
  ))
    mesh.parent = b6Fallback;
  attachWorldAssetNode(b6Fallback, b6Root);
  context.label("B6", 8, 19.1 + B6_LAYOUT.foundationOffset, -55, 5);
  context.label(
    "VSTUP B6",
    B6_LAYOUT.entry.x,
    3 + B6_LAYOUT.foundationOffset,
    B6_LAYOUT.entry.z,
    3,
  );
  const landmarks = options.photogrammetry
    ? undefined
    : buildLandmarkReality({
        scene: context.scene,
        buildings: BUILDINGS,
        baseElevation: base,
      });
  const campusExterior = exteriorPlan
    ? createCampusExterior(context.scene, exteriorPlan)
    : undefined;
  for (const p of PLACES)
    if (p.worldLabel !== false && p.id !== "club6" && p.id !== "b6")
      context.label(p.name, p.x, groundHeight(p.x, p.z) + 3.4, p.z, 5.5);
  for (const [i, p] of HUNT_POINTS.entries()) {
    const m = MeshBuilder.CreatePolyhedron(
      "hunt" + i,
      { type: 1, size: 0.4 },
      context.scene,
    );
    m.position.set(p.x, groundHeight(p.x, p.z) + 1.2, p.z);
    m.metadata = { groundY: groundHeight(p.x, p.z) };
    m.material = context.mat("#c5d989");
    m.isPickable = false;
    context.huntMeshes.push(m);
  }
  for (const meshes of context.staticMeshes.values()) {
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
    if (merged) {
      merged.metadata = { solid: true, artStatic: true };
      merged.isPickable = false;
      merged.freezeWorldMatrix();
    }
  }
  context.staticMeshes.clear();
  for (const material of context.scene.materials) {
    if (
      material instanceof StandardMaterial &&
      material.name !== "art:lamp-pool"
    )
      material.specularColor.set(0.025, 0.025, 0.025);
  }
  clouds(context);
  return { architecture, b6Fallback, b6Root, landmarks, campusExterior };
}
