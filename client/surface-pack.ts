import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import manifest from "../shared/data/assets/surfaces-manifest.json";
import { campusSurfaceArt, CampusSurfaceArtPlugin } from "./cinematic-art";

type SurfaceMetadata = {
  surfaceKind?: string;
  surface?: string;
  uvMetresPerRepeat?: number;
  nightWindows?: boolean;
  containsWindows?: boolean;
  preserveAuthoredPavingJoints?: boolean;
};

const FAMILIES = new Map(manifest.assets.map((asset) => [asset.kind, asset]));
const SURFACE_ALIASES: Readonly<Record<string, string>> = {
  paving_stones: "paving",
  stone: "sett",
  cobblestone: "sett",
  compacted: "gravel",
};

/** Canonical family drives both the texture and its response to weather. */
const WET_RESPONSE: Readonly<Record<string, readonly [number, number]>> = {
  asphalt: [0.12, 0.46],
  concrete: [0.1, 0.23],
  paving: [0.1, 0.23],
  sett: [0.1, 0.23],
  gravel: [0.18, 0.04],
  grass: [0.05, 0.02],
};

/** Mesh UVs are authored in metres / uvMetresPerRepeat, not per object. */
export function surfaceTexturePlan(metadata?: SurfaceMetadata | null) {
  if (
    !metadata?.surfaceKind ||
    metadata.nightWindows ||
    metadata.containsWindows
  )
    return null;
  const rawKind = metadata.surface ?? metadata.surfaceKind;
  const kind = SURFACE_ALIASES[rawKind] ?? rawKind;
  const family =
    FAMILIES.get(kind) ??
    FAMILIES.get(SURFACE_ALIASES[metadata.surfaceKind] ?? metadata.surfaceKind);
  if (!family) return null;
  const uv =
    Number.isFinite(metadata.uvMetresPerRepeat) &&
    (metadata.uvMetresPerRepeat ?? 0) > 0
      ? metadata.uvMetresPerRepeat!
      : 1;
  const metresV = family.metresPerRepeatV ?? family.metresPerRepeat;
  return {
    family,
    kind: family.kind,
    uScale: uv / family.metresPerRepeat,
    vScale: uv / metresV,
    retainPavingJoints:
      metadata.preserveAuthoredPavingJoints === true &&
      (family.kind === "paving" || family.kind === "sett"),
  };
}

/** Original CC0 channels describe generic material families; geometry and
 * appearance evidence remain in the campus reference atlas. */
export class SurfacePack {
  private converted = new Map<Material, PBRMaterial>();
  private originals = new Map<PBRMaterial, Material>();
  private textures = new Map<string, Texture>();
  private dryAlbedos = new Map<PBRMaterial, Color3>();
  private pending = new Set<AbstractMesh>();
  private materialObservers = new Map<AbstractMesh, Observer<AbstractMesh>>();
  private added: Observer<AbstractMesh>;
  private removed: Observer<AbstractMesh>;
  private changingMaterial = false;
  private lastWet = NaN;
  private lastQuality = "";
  private fresh = new Set<PBRMaterial>();
  private timer = 1;
  private disposed = false;
  readonly stats = { meshVisits: 0, conversionPasses: 0, materialUpdates: 0 };

  constructor(private scene: Scene) {
    this.added = scene.onNewMeshAddedObservable.add((mesh) => this.track(mesh));
    this.removed = scene.onMeshRemovedObservable.add((mesh) => {
      this.pending.delete(mesh);
      const observer = this.materialObservers.get(mesh);
      if (observer) mesh.onMaterialChangedObservable.remove(observer);
      this.materialObservers.delete(mesh);
    });
    for (const mesh of scene.meshes) this.track(mesh);
  }

  private track(mesh: AbstractMesh) {
    if (this.disposed || mesh.isDisposed() || this.materialObservers.has(mesh))
      return;
    this.pending.add(mesh);
    this.materialObservers.set(
      mesh,
      mesh.onMaterialChangedObservable.add(() => {
        if (!this.changingMaterial) this.pending.add(mesh);
      }),
    );
  }

  private texture(url: string, gamma: boolean, u: number, v: number) {
    const key = `${url}:${gamma}:${u}:${v}`;
    let texture = this.textures.get(key);
    if (!texture) {
      texture = new Texture(
        url,
        this.scene,
        false,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.name = url;
      texture.gammaSpace = gamma;
      texture.uScale = u;
      texture.vScale = v;
      texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.anisotropicFilteringLevel = 4;
      this.textures.set(key, texture);
    }
    return texture;
  }

  private replace(original: Material | null): Material | null {
    if (!original) return null;
    if (original instanceof MultiMaterial) {
      for (let i = 0; i < original.subMaterials.length; i++)
        original.subMaterials[i] = this.replace(original.subMaterials[i]);
      return original;
    }
    if (!(original instanceof StandardMaterial)) return original;
    const existing = this.converted.get(original);
    if (existing) return existing;
    const plan = surfaceTexturePlan(original.metadata);
    if (!plan || original.alpha < 0.99) return original;
    const { family, kind, uScale, vScale } = plan;
    const art = campusSurfaceArt(family.kind)!;
    const material = new PBRMaterial(original.name, this.scene);
    original.name += ":legacy";
    material.metadata = {
      ...original.metadata,
      physicallyBased: true,
      materialFamily: family.id,
      materialSurfaceKind: kind,
      textureSource: family.source,
      textureLicense: manifest.license,
      authoredPavingJoints: plan.retainPavingJoints,
      wettable: kind in WET_RESPONSE,
      surfaceScaleProvenance: family.scaleProvenance,
    };
    if (plan.retainPavingJoints && original.diffuseTexture) {
      material.albedoTexture = original.diffuseTexture;
      material.albedoColor.copyFrom(original.diffuseColor);
    } else {
      material.albedoTexture = this.texture(
        family.channels.color.url,
        true,
        uScale,
        vScale,
      );
      // The generic concrete scan is paler than the reference end walls. Keep
      // their muted gray/olive family distinct from adjoining pale plaster.
      material.albedoColor = new Color3(...art.tint);
    }
    material.bumpTexture = this.texture(
      family.channels.normalgl.url,
      false,
      uScale,
      vScale,
    );
    material.bumpTexture.level = art.normalStrength;
    material.metallicTexture = this.texture(
      family.channels.roughness.url,
      false,
      uScale,
      vScale,
    );
    // A grayscale roughness map is not ORM: its blue channel must never turn
    // asphalt and plaster into metallic surfaces.
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = false;
    material.useAmbientOcclusionFromMetallicTextureRed = false;
    material.metallic = 0;
    material.roughness = 1;
    material.environmentIntensity = 0.7;
    material.directIntensity = 1;
    material.specularIntensity = art.specularIntensity;
    material.enableSpecularAntiAliasing = true;
    material.backFaceCulling = original.backFaceCulling;
    material.zOffset = original.zOffset;
    material.zOffsetUnits = original.zOffsetUnits;
    material.sideOrientation = original.sideOrientation;
    new CampusSurfaceArtPlugin(material, art, plan.retainPavingJoints);
    this.converted.set(original, material);
    this.originals.set(material, original);
    this.dryAlbedos.set(material, material.albedoColor.clone());
    this.fresh.add(material);
    return material;
  }

  update(dt: number, quality: string, rain: number) {
    if (this.disposed || this.scene.isDisposed) return;
    this.timer += Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (this.timer > 0.5) {
      this.timer = 0;
      // Scene/material observables catch async loads and existing meshes whose
      // material changes. A steady world needs no repeated full-scene scan.
      this.stats.conversionPasses++;
      this.changingMaterial = true;
      try {
        for (const mesh of this.pending) {
          this.stats.meshVisits++;
          if (!mesh.isDisposed() && mesh.material)
            mesh.material = this.replace(mesh.material);
        }
      } finally {
        this.changingMaterial = false;
        this.pending.clear();
      }
    }
    const wet = Math.max(
      0,
      Math.min(1, (Number.isFinite(rain) ? rain : 0) / 2),
    );
    const changed = wet !== this.lastWet || quality !== this.lastQuality;
    if (!changed && this.fresh.size === 0) return;
    const updates = changed ? this.converted.values() : this.fresh.values();
    for (const material of updates) {
      this.stats.materialUpdates++;
      if (material.metadata.wettable) {
        const [darken, smooth] =
          WET_RESPONSE[material.metadata.materialSurfaceKind];
        material.roughness = 1 - wet * smooth;
        material.albedoColor
          .copyFrom(this.dryAlbedos.get(material)!)
          .scaleInPlace(1 - wet * darken);
      }
      material.disableBumpMap =
        quality === "low" &&
        material.metadata.materialSurfaceKind === "plaster";
    }
    this.fresh.clear();
    this.lastWet = wet;
    this.lastQuality = quality;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.onNewMeshAddedObservable.remove(this.added);
    this.scene.onMeshRemovedObservable.remove(this.removed);
    for (const [mesh, observer] of this.materialObservers)
      mesh.onMaterialChangedObservable.remove(observer);
    this.materialObservers.clear();
    this.pending.clear();
    for (const mesh of this.scene.meshes)
      mesh.material = this.originalMaterial(mesh.material);
    for (const [original, material] of this.converted) {
      original.name = material.name;
      material.dispose(false, false);
    }
    for (const texture of this.textures.values()) texture.dispose();
    this.converted.clear();
    this.originals.clear();
    this.textures.clear();
    this.dryAlbedos.clear();
    this.fresh.clear();
  }

  private originalMaterial(material: Material | null): Material | null {
    if (material instanceof MultiMaterial) {
      for (let i = 0; i < material.subMaterials.length; i++)
        material.subMaterials[i] = this.originalMaterial(
          material.subMaterials[i],
        );
      return material;
    }
    return material instanceof PBRMaterial
      ? (this.originals.get(material) ?? material)
      : material;
  }
}
