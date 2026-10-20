import {
  PhotoGrassWind,
  createPhotoGrassWindState,
  type PhotoGrassWindState,
} from "./photo-grass-wind";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Material } from "@babylonjs/core/Materials/material";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { GRASS_LEVELS, type CandidateLevel } from "./photo-grass-budget";
import {
  configureSourceGrassMaterial,
  type SourceGrassRecipe,
  type SourceGrassMaps,
} from "./photo-grass-source-material";

export type RenderLevel = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  triangles: number;
  leafCount: number;
  materialChannel?: "flat" | "bent";
};
export type GrassTextureChannel = keyof SourceGrassMaps | "normalBent";
export type RenderPack = {
  sourceGeometrySha256: string;
  runtimeGeometryId?: string;
  levels: Record<string, RenderLevel>;
  textures: {
    width: number;
    height: number;
    files: Record<
      GrassTextureChannel,
      { file: string; sha256: string; bytes: number }
    >;
  };
};
export type GrassTextureLoad =
  Texture | { texture: Texture; ready: Promise<void> };
export type GrassResources = {
  material: PBRMaterial;
  materials: Readonly<Record<CandidateLevel, PBRMaterial>>;
  maps: SourceGrassMaps & { normalBent: Texture };
  ready: Promise<void>;
  wind: PhotoGrassWindState;
  textureSize: number;
  textureHeight: number;
  sources: ReadonlyMap<string, Mesh>;
  clone(level: string, name: string): Mesh;
  release(): void;
};
type Shared = Omit<GrassResources, "release"> & {
  references: number;
  destroy(): void;
};
const scenes = new WeakMap<Scene, Map<string, Shared>>();

/** Five actual 1024×512 maps, two PBR materials and three immutable LOD buffers.
 * Texture dimensions belong to the verified asset pack, not a quality label. */
export function acquireGrassResources(
  scene: Scene,
  pack: RenderPack,
  recipe: SourceGrassRecipe,
  _legacyRequestedSize: 1024 | 2048,
  loadTexture: (
    channel: GrassTextureChannel,
    gamma: boolean,
  ) => GrassTextureLoad,
): GrassResources {
  if (scene.isDisposed) throw Error("Cannot load grass into a disposed scene");
  let cache = scenes.get(scene);
  if (!cache) scenes.set(scene, (cache = new Map()));
  const key = pack.runtimeGeometryId ?? pack.sourceGeometrySha256;
  let shared = cache.get(key);
  if (!shared) {
    const maps = {} as GrassResources["maps"],
      loaded: Texture[] = [],
      pending: Promise<void>[] = [],
      sources = new Map<string, Mesh>(),
      ownedMaterials: PBRMaterial[] = [];
    const disposeOwnedAssets = () => {
      for (const mesh of sources.values()) mesh.dispose(false, false);
      for (const material of ownedMaterials) material.dispose(false, false);
      for (const texture of loaded) texture.dispose();
    };
    try {
      for (const channel of [
        "albedo",
        "alpha",
        "normal",
        "normalBent",
        "arm",
      ] as const) {
        const value = loadTexture(channel, channel === "albedo"),
          texture = value instanceof Texture ? value : value.texture;
        maps[channel] = texture;
        loaded.push(texture);
        if (!(value instanceof Texture)) pending.push(value.ready);
      }
      const flat = new PBRMaterial(
          "photographic leaves · shared flat PBR",
          scene,
        ),
        bent = new PBRMaterial("photographic leaves · shared bent PBR", scene);
      ownedMaterials.push(flat, bent);
      configureSourceGrassMaterial(flat, maps, recipe, "author-material");
      configureSourceGrassMaterial(
        bent,
        { ...maps, normal: maps.normalBent },
        recipe,
        "author-material",
      );
      const wind = createPhotoGrassWindState(),
        materials = { near: bent, medium: flat, far: flat };
      for (const material of ownedMaterials) {
        material.metadata = {
          vegetation: "grass",
          photographicSource: "https://polyhaven.com/a/grass_medium_01",
          originalSourcePixelsModified: false,
          sourceDerivedLeafAtlas: true,
        };
        new PhotoGrassWind(material, wind);
      }
      for (const level of GRASS_LEVELS) {
        const g = pack.levels[level];
        if (!g) throw Error("Missing photographic leaf LOD " + level);
        const mesh = new Mesh("photographic leaf source " + level, scene),
          data = new VertexData();
        sources.set(level, mesh);
        data.positions = g.positions;
        data.normals = g.normals;
        data.uvs = g.uvs;
        data.indices = g.indices;
        data.applyToMesh(mesh);
        mesh.material = materials[level];
        mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
        mesh.isVisible = false;
        mesh.isPickable = false;
        mesh.metadata = {
          vegetation: "grass",
          sourceLevel: level,
          sourceTriangles: g.triangles,
          sourceLeaves: g.leafCount,
          shadowCaster: false,
          depthCaster: false,
        };
      }
      const ready = Promise.all(pending).then(() => {});
      void ready.catch(() => {});
      let destroyed = false,
        disposeObserver: Observer<Scene> | null = null;
      shared = {
        material: flat,
        materials,
        maps,
        wind,
        textureSize: pack.textures.width,
        textureHeight: pack.textures.height,
        sources,
        ready,
        references: 0,
        clone(level, name) {
          if (scene.isDisposed || destroyed)
            throw Error("Grass resources were disposed");
          const source = sources.get(level);
          if (!source) throw Error("Unknown grass LOD " + level);
          const mesh = source.clone(name, null, true)!;
          mesh.isVisible = true;
          mesh.isPickable = false;
          return mesh;
        },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          if (disposeObserver) {
            scene.onDisposeObservable.remove(disposeObserver);
            disposeObserver = null;
          }
          disposeOwnedAssets();
          cache!.delete(key);
        },
      };
      const owned = shared;
      disposeObserver = scene.onDisposeObservable.addOnce(() =>
        owned.destroy(),
      );
      cache.set(key, shared);
    } catch (error) {
      disposeOwnedAssets();
      void Promise.allSettled(pending);
      throw error;
    }
  }
  shared.references++;
  let released = false;
  const owned = shared,
    clones = new Set<Mesh>(),
    wind = createPhotoGrassWindState();
  return {
    material: owned.material,
    materials: owned.materials,
    maps: owned.maps,
    ready: owned.ready,
    wind,
    textureSize: owned.textureSize,
    textureHeight: owned.textureHeight,
    sources: owned.sources,
    clone(level, name) {
      if (released) throw Error("Grass lease released");
      const mesh = owned.clone(level, name);
      mesh.metadata = { ...mesh.metadata, photoGrassWind: wind };
      clones.add(mesh);
      mesh.onDisposeObservable.addOnce(() => clones.delete(mesh));
      return mesh;
    },
    release() {
      if (released) return;
      released = true;
      for (const mesh of clones) mesh.dispose(false, false);
      clones.clear();
      if (--owned.references === 0) owned.destroy();
    },
  };
}
