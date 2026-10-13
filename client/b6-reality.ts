import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Vector4, Matrix } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { attachWorldAssetNode } from "./world-asset-identity";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/loaders/glTF";
import {
  B6_LAYOUT,
  B6_REALITY_BOXES,
  B6_ROOM_AREAS,
  B6_STAIR_CORES,
  B6_STAIR_MESHES,
  B6_ENTRY_PACK,
  type B6Box,
} from "../shared/b6-interior";
import { B6_ASSET_MANIFEST, B6_PROP_PLACEMENTS } from "../shared/b6-props";
import type { Vec3 } from "../shared/types";
import { renderBudget } from "../shared/render-quality";
import { B6_STAIR_MATERIALS, b6StairUVs } from "../shared/b6-stair-materials";
import type { B6StairMaterial } from "../shared/b6-stairs";
import {b6FacadeOwnsBoxFace} from "../shared/b6-facade-plan";
import {createB6ExteriorConcreteMaterial} from "./b6-exterior-concrete";

export type B6BoxFacePart = {
  surface: "whole" | "top" | "underside" | "sides";
  level: number;
  data: {positions:number[];normals:number[];uvs:number[];indices:number[]};
};
/** One copy of each original box triangle, classified by its actual normal.
 * Floor finishes belong only to +Y faces. This factory is shared with the
 * editable B6 archive; no second ceiling shell or coplanar overlay is added.
 */
export function createB6BoxFaceParts(box:B6Box,foundationY=B6_LAYOUT.foundationOffset as number):B6BoxFacePart[] {
  const source=VertexData.CreateBox({width:box.w,height:box.h,depth:box.d});
  const positions=Array.from(source.positions!);
  for(let i=0;i<positions.length;i+=3){positions[i]+=box.x;positions[i+1]+=box.y;positions[i+2]+=box.z;}
  const normals=Array.from(source.normals!),uvs=b6StairUVs(positions,normals);
  for(let i=1;i<positions.length;i+=3)positions[i]+=foundationY;
  const groups=new Map<B6BoxFacePart["surface"],{part:B6BoxFacePart;remap:Map<number,number>}>();
  for(let i=0;i<source.indices!.length;i+=3){
    const first=source.indices![i],ny=normals[first*3+1];
    if(b6FacadeOwnsBoxFace(box,normals[first*3],normals[first*3+2],B6_LAYOUT))continue;
    const surface:B6BoxFacePart["surface"]=box.kind!=="floor"?"whole":ny>.5?"top":ny<-.5?"underside":"sides";
    const ceilingLevel=box.y+box.h/2>box.level*3+.1?box.level:Math.max(-1,box.level-1);
    const group=groups.get(surface)??{part:{surface,level:surface==="underside"?ceilingLevel:box.level,data:{positions:[],normals:[],uvs:[],indices:[]}},remap:new Map<number,number>()};
    for(const index of source.indices!.slice(i,i+3)){
      let mapped=group.remap.get(index);
      if(mapped===undefined){
        mapped=group.part.data.positions.length/3;group.remap.set(index,mapped);
        group.part.data.positions.push(...positions.slice(index*3,index*3+3));
        group.part.data.normals.push(...normals.slice(index*3,index*3+3));
        group.part.data.uvs.push(...uvs.slice(index*2,index*2+2));
      }
      group.part.data.indices.push(mapped);
    }
    groups.set(surface,group);
  }
  return [...groups.values()].map(group=>group.part);
}

export function createB6StairMaterials(scene: Scene) {
  return new Map((Object.entries(B6_STAIR_MATERIALS) as [B6StairMaterial, typeof B6_STAIR_MATERIALS[B6StairMaterial]][]).map(([key, style]) => {
    const material = new PBRMaterial("b6 stair:" + key, scene);
    material.albedoColor = Color3.FromHexString(style.color);
    material.roughness = style.roughness;
    material.metallic = style.metallic;
    material.alpha=1;
    material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
    material.backFaceCulling=true;
    if(key==="entry-glass"){
      material.alpha=.28;
      material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.backFaceCulling=false;
      material.metadata={intentionalEntryGlass:true,sourceIds:B6_ENTRY_PACK.sourceIds};
    }
    if (style.texture) material.albedoTexture = new Texture(style.texture, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
    return [key, material] as const;
  }));
}

/** The same stepped top, continuous soffit and timber rail data as Rapier.
 * Batched by level/material, with independent floor culling in the controller.
 */
export function createB6StairMeshes(scene: Scene, foundationY = B6_LAYOUT.foundationOffset as number, materials = createB6StairMaterials(scene)) {
  const groups = new Map<string, {level:number; exteriorEntry:boolean; material:B6StairMaterial; ids:string[]; positions:number[]; indices:number[]}>();
  for (const source of B6_STAIR_MESHES) {
    const key = (source.exteriorEntry?"entry:":"")+source.level + ":" + source.material;
    const group = groups.get(key) ?? {level:source.level,exteriorEntry:!!source.exteriorEntry,material:source.material,ids:[],positions:[],indices:[]};
    const offset = group.positions.length / 3;
    for (let i = 0; i < source.positions.length; i += 3)
      group.positions.push(source.positions[i], source.positions[i+1] + foundationY, source.positions[i+2]);
    // Rapier's physical source is outward CCW. Babylon's authored mesh box
    // convention is clockwise; reverse winding only, never the geometry.
    for (let i=0;i<source.indices.length;i+=3)
      group.indices.push(source.indices[i]+offset,source.indices[i+2]+offset,source.indices[i+1]+offset);
    group.ids.push(source.id);
    groups.set(key,group);
  }
  return [...groups.values()].map(group => {
    const normals:number[] = [];
    VertexData.ComputeNormals(group.positions,group.indices,normals);
    const data = new VertexData();
    data.positions = group.positions; data.indices = group.indices; data.normals = normals;
    data.uvs = b6StairUVs(group.positions,normals,B6_STAIR_MATERIALS[group.material].metresPerRepeat);
    const mesh = new Mesh(`b6 dogleg floor ${group.level} ${group.material}`,scene);
    data.applyToMesh(mesh);
    mesh.material = materials.get(group.material)!;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.metadata = {b6Reality:true,level:group.level,visibilityGroup:group.exteriorEntry?"exterior-entry":"opaque-envelope",...(group.exteriorEntry?{interiorFloorCull:false,entryBounds:B6_ENTRY_PACK.bounds}:{}),sourceIds:group.ids,stairGeometry:true,castsShadow:true,dimensionsMeasured:false};
    mesh.freezeWorldMatrix();
    return mesh;
  });
}

type Managed = {
  mesh: AbstractMesh;
  level: number;
  x: number;
  z: number;
  prop: boolean;
  visibilityGroup: "exterior-entry" | "opaque-envelope" | "interior-detail";
  attached: boolean;
};
export type B6RealityInput = { player: Vec3; quality: string; floor?: number };
export type B6RealityOptions = {
  foundationY?: number;
  /** Also permits the actual GLB bytes in offline verification; production uses the URL. */
  assetSource?: (url:string)=>string|ArrayBufferView;
};
const B6_ENTRY_VISIBILITY_BOUNDS = B6_ENTRY_PACK.bounds;
const B6_CONSTRUCTION_BOUNDS = {
  minX:Math.min(B6_LAYOUT.bounds.minX,B6_LAYOUT.lobby.minX),maxX:B6_LAYOUT.bounds.maxX,
  minZ:Math.min(B6_LAYOUT.bounds.minZ,B6_LAYOUT.entry.stepsFromZ),maxZ:B6_LAYOUT.bounds.maxZ,
};
function distanceToBounds(p:Pick<Vec3,"x"|"z">,b:{minX:number;maxX:number;minZ:number;maxZ:number}){
  return Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ));
}
const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  T: ["111", "010", "010", "010", "010"],
  Y: ["101", "101", "010", "010", "010"],
  P: ["110", "101", "110", "100", "100"],
  W: ["101", "101", "101", "111", "101"],
  C: ["111", "100", "100", "100", "111"],
  S: ["111", "100", "111", "001", "111"],
  R: ["110", "101", "110", "101", "101"],
  H: ["101", "101", "111", "101", "101"],
};
function plateAtlas(scene: Scene, labels: string[]) {
  const width = 1024,
    height = 256,
    pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 218;
    pixels[i + 1] = 218;
    pixels[i + 2] = 205;
    pixels[i + 3] = 255;
  }
  labels.forEach((label, index) => {
    const ox = (index % 8) * 128 + 12,
      oy = Math.floor(index / 8) * 32 + 11;
    [...label].forEach((character, glyph) =>
      FONT[character]?.forEach((row, y) =>
        [...row].forEach((pixel, x) => {
          if (pixel !== "1") return;
          for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++) {
              const i =
                ((oy + y * 2 + dy) * width + ox + glyph * 9 + x * 2 + dx) * 4;
              pixels[i] = 33;
              pixels[i + 1] = 40;
              pixels[i + 2] = 36;
            }
        }),
      ),
    );
  });
  // Typed-array row zero is the GL bottom row. Flip authored top-down glyphs
  // explicitly instead of depending on browser image upload conventions.
  const flipped = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y++)
    flipped.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      (height - y - 1) * width * 4,
    );
  const texture = RawTexture.CreateRGBATexture(
    flipped,
    width,
    height,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = "authored illustrative room number atlas";
  return texture;
}

/** A visible, floor-culled reconstruction; no source photograph is used as a texture. */
export class B6RealityController {
  readonly stats = {
    structuralMeshes: 0,
    propInstances: 0,
    activeMeshes: 0,
    loadedAssets: 0,
    errors: [] as string[],
  };
  private managed: Managed[] = [];
  private sources: Mesh[] = [];
  private materials: (PBRMaterial | StandardMaterial)[] = [];
  private imported: Awaited<ReturnType<typeof LoadAssetContainerAsync>>[] = [];
  private light: PointLight;
  get interiorLightEnabled(){return this.light.isEnabled()&&this.light.intensity>0;}
  private disposed = false;
  private buildingRoot?: TransformNode;
  attachToBuilding(root: TransformNode) {
    this.buildingRoot = root;
    for (const entry of this.managed) attachWorldAssetNode(entry.mesh, root);
    this.light.parent = root;
    this.lastPlayer.set(Infinity,Infinity,Infinity);
  }
  private lastPlayer = new Vector3(Infinity, Infinity, Infinity);
  private lastQuality = "";
  private lastFloor?: number;
  constructor(
    private scene: Scene,
    private options: B6RealityOptions = {},
  ) {
    const material = (name: string, hex: string, texture?: string) => {
      const result = new PBRMaterial("b6:" + name, scene);
      result.albedoColor = Color3.FromHexString(hex);
      result.metallic = 0;
      result.roughness = 0.87;
      result.alpha=1;
      result.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
      result.backFaceCulling=true;
      if (texture) {
        result.albedoTexture = new Texture(
          "/models/b6/" + texture + "-authored.png",
          scene,
          false,
          false,
          Texture.TRILINEAR_SAMPLINGMODE,
        );
        result.albedoColor = Color3.White();
      }
      this.materials.push(result);
      return result;
    };
    const stairMaterials = createB6StairMaterials(scene);
    this.materials.push(...stairMaterials.values());
    const upper = material("aged white painted plaster", "#e4ded4"),
      lower = material("warm grey lower paint", "#c4b9af");
    const vinyl = material("historical room vinyl", "#a29670", "vinyl"),
      terrazzo = stairMaterials.get("striped-corridor")!;
    const ceramic = material("older cream sanitary tiles", "#d4d1c3", "tile"),
      concrete = createB6ExteriorConcreteMaterial(scene);
    this.materials.push(concrete);
    const ceiling = stairMaterials.get("painted-concrete")!,
      skirting = material("dark skirting", "#6e7067"),
      roof = material("roof", "#747873");
    const grouped = new Map<
      string,
      {
        level: number;
        visibilityGroup?: Managed["visibilityGroup"];
        material: PBRMaterial | StandardMaterial;
        meshes: Mesh[];
        vertices?: {
          positions: number[];
          normals: number[];
          uvs: number[];
          indices: number[];
        };
      }
    >();
    const add = (box: B6Box, mat: PBRMaterial, level = box.level) => {
      for(const part of createB6BoxFaceParts(box,options.foundationY??B6_LAYOUT.foundationOffset)) {
      const data=part.data;
      const faceMaterial=box.kind==="floor"&&part.surface!=="top"?ceiling:mat;
      const faceLevel=part.surface==="underside"?part.level:level;
      // All canonical exterior step boxes are source-defined in entry bounds;
      // no interior floor number may control their approach visibility.
      const exterior=box.role==="exterior-entry"||(box.kind==="stair"&&box.x===B6_LAYOUT.entry.x&&box.z>=B6_LAYOUT.entry.stepsFromZ&&box.z<=B6_LAYOUT.entry.landingMaxZ);
      const visibilityGroup:Managed["visibilityGroup"]=exterior?"exterior-entry":"opaque-envelope";
      const key = visibilityGroup+":"+faceLevel + ":" + faceMaterial.uniqueId;
      const group = grouped.get(key) ?? {
        level:faceLevel,
        visibilityGroup,
        material:faceMaterial,
        meshes: [],
        vertices: { positions: [], normals: [], uvs: [], indices: [] },
      };
      const vertices = group.vertices!,
        offset = vertices.positions.length / 3;
      vertices.positions.push(...data.positions!);
      vertices.normals.push(...data.normals!);
      vertices.uvs.push(...data.uvs!);
      for (const index of data.indices!) vertices.indices.push(offset + index);
      grouped.set(key, group);
      }
    };
    for (const box of B6_REALITY_BOXES) {
      if (box.kind === "glass"&&box.role!=="exterior-entry") continue;
      if (box.material) add(box,stairMaterials.get(box.material)!);
      else if (box.kind === "wall") {
        const bottom = box.y - box.h / 2,
          boundary = box.level * 3 + 1.1,
          top = box.y + box.h / 2;
        if (bottom < boundary && top > boundary) {
          add(
            { ...box, y: (bottom + boundary) / 2, h: boundary - bottom },
            lower,
          );
          add({ ...box, y: (top + boundary) / 2, h: top - boundary }, upper);
        } else add(box, bottom >= boundary ? upper : lower);
      } else if (box.kind === "floor") {
        add(
          box,
          box.level === 6
            ? roof
            : (box.x === 3 || box.x === 13) && box.level >= 0
              ? vinyl
              : terrazzo,
        );
      } else add(box, box.kind === "stair" ? concrete : skirting);
    }
    for (const area of B6_ROOM_AREAS.filter(
      (area) => area.kind === "bathroom",
    )) {
      const b = area.bounds;
      add(
        {
          x: (b.minX + b.maxX) / 2,
          y: area.level * 3 + 0.006,
          z: (b.minZ + b.maxZ) / 2,
          w: b.maxX - b.minX - 0.02,
          h: 0.012,
          d: b.maxZ - b.minZ - 0.02,
          kind: "floor",
          level: area.level,
        },
        ceramic,
      );
    }
    for (let level = 0; level <= 5; level++) {
      const areas = B6_ROOM_AREAS.filter((area) => area.level === level);
      const numbers = areas.map((area) =>
        area.kind === "bathroom"
          ? area.index === 0
            ? "WC"
            : "SPRCHY"
          : area.label,
      );
      const atlas = plateAtlas(scene, numbers),
        plaques = new StandardMaterial("b6:room plaques " + level, scene);
      plaques.diffuseTexture = atlas;
      plaques.specularColor.set(0.02, 0.02, 0.02);
      this.materials.push(plaques);
      const pieces: Mesh[] = [];
      areas.forEach((area, index) => {
        const col = index % 8,
          row = Math.floor(index / 8);
        const plaque = MeshBuilder.CreatePlane(
          "illustrative room plate",
          {
            width: 0.25,
            height: 0.075,
            frontUVs: new Vector4(
              col / 8,
              1 - (row + 1) / 8,
              (col + 1) / 8,
              1 - row / 8,
            ),
          },
          scene,
        );
        const normal = area.side === "west" ? 1 : -1;
        // frontUVs only crops Babylon DOUBLESIDE planes. These are single-sided
        // plaques, so set their actual UV buffer to one atlas cell explicitly.
        const u0 = col / 8,
          u1 = (col + 1) / 8,
          v0 = 1 - (row + 1) / 8,
          v1 = 1 - row / 8;
        plaque.setVerticesData("uv", [u0, v0, u1, v0, u1, v1, u0, v1]);
        plaque.position.set(
          area.door.x + normal * 0.1,
          level * 3 +
            1.62 +
            (options.foundationY ?? B6_LAYOUT.foundationOffset),
          area.door.z + 0.84,
        );
        plaque.rotation.y = area.door.yaw + Math.PI;
        plaque.material = plaques;
        plaque.isPickable = false;
        pieces.push(plaque);
      });
      grouped.set("plates:" + level, {
        level,
        visibilityGroup:"interior-detail",
        material: plaques,
        meshes: pieces,
      });
    }
    for (const group of grouped.values()) {
      let merged: Mesh | null;
      if (group.vertices) {
        merged = new Mesh("b6 shared floor batch", scene);
        const data = new VertexData();
        Object.assign(data, group.vertices);
        data.applyToMesh(merged);
        merged.material = group.material;
        merged.isPickable = false;
      } else
        merged = Mesh.MergeMeshes(
          group.meshes,
          true,
          true,
          undefined,
          false,
          false,
        );
      if (!merged) continue;
      merged.name = `b6 floor ${group.level} ${group.material.name}`;
      merged.metadata = {
        b6Reality: true,
        level: group.level,
        visibilityGroup:group.visibilityGroup??"opaque-envelope",
        ...(group.visibilityGroup==="exterior-entry"?{entryBounds:{...B6_ENTRY_VISIBILITY_BOUNDS},sourceIds:["b6-pano-2025-north","elsa-strahov-typical-entry"],interiorFloorCull:false}:{}),
        dimensionsMeasured: false,
      };
      merged.freezeWorldMatrix();
      this.managed.push({
        mesh: merged,
        level: group.level,
        x: 8,
        z: -55,
        prop: false,
        visibilityGroup:group.visibilityGroup??"opaque-envelope",
        attached: true,
      });
    }
    for (const mesh of createB6StairMeshes(scene, options.foundationY ?? B6_LAYOUT.foundationOffset, stairMaterials))
      this.managed.push({mesh,level:mesh.metadata.level,x:3,z:-55,prop:false,visibilityGroup:mesh.metadata.visibilityGroup,attached:true});
    this.stats.structuralMeshes = this.managed.length;
    this.light = new PointLight(
      "b6 nearest corridor fixture fill",
      new Vector3(8, 2.35, -73),
      scene,
    );
    this.light.diffuse = Color3.FromHexString("#fff3d9");
    this.light.falloffType=Light.FALLOFF_STANDARD;
    this.light.metadata={inferredCorridorFill:true,intensityUnits:"artist intensity, not measured luminous flux"};
    this.light.intensity = 0.9;
    this.light.range = 12;
    this.light.setEnabled(false);
  }

  async loadProps() {
    // Load one asset at a time to bound decoding/upload spikes; instances share it.
    for (const asset of B6_ASSET_MANIFEST.assets) {
      if (this.disposed || this.scene.isDisposed) return;
      try {
        const sourceData=this.options.assetSource?.(asset.url)??asset.url;
        const container = await LoadAssetContainerAsync(sourceData, this.scene,typeof sourceData==="string"?undefined:{pluginExtension:".glb"});
        if (this.disposed || this.scene.isDisposed) {
          container.dispose();
          return;
        }
        this.imported.push(container);
        const groups = new Map<unknown, Mesh[]>();
        for (const mesh of container.meshes) {
          if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
          mesh.computeWorldMatrix(true);
          const group = groups.get(mesh.material) ?? [];
          group.push(mesh);
          groups.set(mesh.material, group);
        }
        const sources: Mesh[] = [];
        for (const group of groups.values()) {
          const source = Mesh.MergeMeshes(
            group,
            true,
            true,
            undefined,
            false,
            false,
          );
          if (!source) continue;
          source.name = "b6 shared asset " + asset.id;
          source.isVisible = false;
          source.isPickable = false;
          sources.push(source);
          this.sources.push(source);
        }
        for (const placement of B6_PROP_PLACEMENTS.filter(
          (placement) => placement.asset === asset.id,
        ))
          for (const source of sources) {
            const instance = source.createInstance("b6 prop " + placement.id);
            instance.position.set(
              placement.x,
              placement.y +
                (this.options.foundationY ?? B6_LAYOUT.foundationOffset),
              placement.z,
            );
            instance.rotation.y = placement.yaw;
            instance.isVisible = true;
            instance.isPickable = false;
            instance.metadata = {
              b6Reality: true,
              visibilityGroup:"interior-detail",
              sourceId: placement.id,
              confidence: placement.confidence,
            };
            instance.freezeWorldMatrix();
            if(this.buildingRoot)attachWorldAssetNode(instance,this.buildingRoot);
            instance.setEnabled(false);
            this.scene.removeMesh(instance);
            this.managed.push({
              mesh: instance,
              level: placement.level,
              x: placement.x,
              z: placement.z,
              prop: true,
              visibilityGroup:"interior-detail",
              attached: false,
            });
          }
        this.stats.loadedAssets++;
        this.lastPlayer.set(Infinity,Infinity,Infinity);
      } catch (error) {
        this.stats.errors.push(
          `${asset.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    this.stats.propInstances = this.managed.filter(
      (entry) => entry.prop,
    ).length;
  }

  update(input: B6RealityInput) {
    if (this.disposed || this.scene.isDisposed) return;
    const p = input.player;
    if (
      Math.hypot(
        p.x - this.lastPlayer.x,
        p.y - this.lastPlayer.y,
        p.z - this.lastPlayer.z,
      ) < 0.25 &&
      input.quality === this.lastQuality &&
      input.floor === this.lastFloor
    )
      return;
    this.lastPlayer.set(p.x, p.y, p.z);
    this.lastQuality = input.quality;
    this.lastFloor = input.floor;
    const foundation = this.options.foundationY ?? B6_LAYOUT.foundationOffset;
    const floor =
      input.floor ??
      Math.max(-1, Math.min(5, Math.round((p.y - foundation - 0.8) / 3)));
    const budget=renderBudget(input.quality);
    // A transparent near facade needs its opaque room/slab/roof envelope.
    // Half the 70m building length conservatively covers the facade renderer's
    // centroid-radius LOD, without tying the doorway to that distant centroid.
    const constructionNear=distanceToBounds(p,B6_CONSTRUCTION_BOUNDS)<=budget.architectureDetailMetres+35+9;
    const exteriorNear=distanceToBounds(p,B6_ENTRY_VISIBILITY_BOUNDS)<=Math.max(80,budget.architectureDetailMetres+9);
    const near=distanceToBounds(p,B6_CONSTRUCTION_BOUNDS)<=24;
    const shell = B6_LAYOUT.bounds,
      lobby = B6_LAYOUT.lobby;
    const inside =
      (p.x > shell.minX &&
        p.x < shell.maxX &&
        p.z > shell.minZ &&
        p.z < shell.maxZ) ||
      (p.x > lobby.minX &&
        p.x < lobby.maxX &&
        p.z > lobby.minZ &&
        p.z < lobby.maxZ);
    const atStairs = p.x > -7.5 && p.x < 7.5 && B6_STAIR_CORES.some(core => p.z > core.minZ - 1 && p.z < core.maxZ + 1);
    const range = budget.b6PropRadiusMetres;
    this.stats.activeMeshes = 0;
    for (const entry of this.managed) {
      const visible =entry.visibilityGroup==="exterior-entry"?exteriorNear:entry.visibilityGroup==="opaque-envelope"?constructionNear:
        near &&
        (entry.level === floor ||
          (atStairs && Math.abs(entry.level - floor) <= 1)) &&
        (!entry.prop || Math.hypot(entry.x - p.x, entry.z - p.z) < range);
      if (visible !== entry.attached) {
        if (visible) {
          this.scene.addMesh(entry.mesh);
          entry.mesh.setEnabled(true);
        } else {
          entry.mesh.setEnabled(false);
          this.scene.removeMesh(entry.mesh);
        }
        entry.attached = visible;
      }
      if (visible) this.stats.activeMeshes++;
    }
    this.light.position.set(
      8,
      floor * 3 + foundation + 2.35,
      Math.max(-86, Math.min(-24, p.z)),
    );
    if (this.buildingRoot)
      this.light.position.copyFrom(
        Vector3.TransformCoordinates(
          this.light.position,
          Matrix.Invert(this.buildingRoot.computeWorldMatrix(true)),
        ),
      );
    // Babylon rescans every scene mesh even for an unchanged Light.setEnabled.
    // Walking updates this fixture's position, not its light membership.
    if (this.light.isEnabled(false) !== inside) this.light.setEnabled(inside);
    this.light.intensity = input.quality === "low" ? 0.65 : 0.9;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.managed) entry.mesh.dispose(false, false);
    for (const source of this.sources) source.dispose(false, false);
    for (const material of this.materials) material.dispose(false, true);
    for (const container of this.imported) container.dispose();
    this.light.dispose();
    this.managed = [];
    this.sources = [];
    this.imported = [];
  }
}
export async function loadB6Reality(
  scene: Scene,
  options: B6RealityOptions = {},
) {
  const controller = new B6RealityController(scene, options);
  await controller.loadProps();
  return controller;
}
