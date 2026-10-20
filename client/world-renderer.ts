import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { buildLandcover } from "./vegetation";
import {
  BUILDINGS,
  B6_BOXES,
  PLACES,
  HUNT_POINTS,
  GROUND_RECTS,
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
import {
  architectureEdges,
  buildArchitectureReality,
} from "./architecture-reality";
import { B6_LAYOUT } from "../shared/b6-interior";
import { buildLandmarkReality } from "./landmark-reality";
import { LANDMARK_BUILDING_REPLACEMENTS } from "../shared/landmark-reality";
import { TERRAIN_COVERAGE } from "../shared/world";
import { buildPhotogrammetryEntranceRepair } from "./photogrammetry-repairs";
import { buildPhotogrammetryGroundRepairs } from "./photogrammetry-ground";
import { createCampusExterior } from "./campus-exterior";
import { createOutdoorArtifacts } from "./outdoor-artifacts";
import { buildOutdoorWorldPlan } from "../shared/outdoor-world";
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
  base: "#797c75",
};

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
  return architectureEdges(points).map(({ a, b, length, nx, nz, long }) => ({
    a,
    b,
    length,
    nx,
    nz,
    long,
  }));
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
  const outdoorArtifacts = options.photogrammetry
    ? undefined
    : createOutdoorArtifacts(context.scene, buildOutdoorWorldPlan());
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
  return {
    architecture,
    b6Fallback,
    b6Root,
    landmarks,
    campusExterior,
    outdoorArtifacts,
  };
}
