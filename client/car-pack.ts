import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import manifest from "../shared/data/assets/vehicles-manifest.json";
import { CarShadowProxyPack } from "./car-shadow-proxy";
import { disableZeroWeightCarClearCoat } from "./car-material-budget";
import {
  CAR_PAINT_COLOR_BUFFER,
  carPaintColor,
  installCarPaintInstances,
} from "./car-paint-instances";

export const CAR_PACK_MANIFEST = manifest;
export type CarLod = "near" | "medium" | "far";
export type CarPackOptions = {
  assetSources?: Partial<
    Record<CarLod, Parameters<typeof LoadAssetContainerAsync>[0]>
  >;
  /** Explicit compatibility/dispatch A/B switch. Unsupported shader languages retain
   * the original per-colour materials regardless of this option. */
  paintInstancing?: boolean;
};
type Part = { key: string; wheel?: number; source: Mesh };
export type CarRig = {
  root: TransformNode;
  wheels: TransformNode[];
  dispose(): void;
};
type Entry = { promise: Promise<CarPack>; references: number };
const shared = new WeakMap<Scene, Entry>();

/** One upload/geometry family per scene, shared by driving/parking/transit rigs.
 * Native Babylon instance LODs keep one instance per part, not three per car. */
export class CarPack {
  readonly templates = new Map<CarLod, Map<string, Part>>();
  private containers: AssetContainer[] = [];
  private root: TransformNode;
  private variants = new Map<string, Map<CarLod, Map<string, Part>>>();
  private paints = new Map<string, PBRMaterial>();
  private darkLensMaterials = new Map<string, PBRMaterial>();
  private darkFamily?: Map<CarLod, Map<string, Part>>;
  private frontLenses: PBRMaterial[] = [];
  private rearLenses: PBRMaterial[] = [];
  private night = -1;
  private quality = "";
  private disposed = false;
  private basePaint?: PBRMaterial;
  private instancePaintColor?: Color3;
  private shadowProxies?: CarShadowProxyPack;
  private constructor(private readonly scene: Scene) {
    this.root = new TransformNode("shared campus hatchback templates", scene);
    this.root.metadata = {
      kind: "asset-templates",
      assetId: manifest.assetId,
      depthCaster: false,
    };
  }
  static async load(scene: Scene, options: CarPackOptions = {}) {
    const pack = new CarPack(scene);
    try {
      for (const definition of manifest.lods) {
        const level = definition.level as CarLod;
        const container = await LoadAssetContainerAsync(
          options.assetSources?.[level] ?? definition.url,
          scene,
          {
            pluginExtension: ".glb",
            name: "campus-hatchback-" + level + ".glb",
          },
        );
        pack.containers.push(container);
        if (scene.isDisposed)
          throw new Error("Car pack scene was disposed during loading");
        container.addAllToScene();
        const parts = new Map<string, Part>();
        for (const material of container.materials) {
          if (!(material instanceof PBRMaterial)) continue;
          disableZeroWeightCarClearCoat(material);
          material.metadata = {
            ...material.metadata,
            assetId: manifest.assetId,
            sourceLicense: manifest.license,
          };
          if (material.name === manifest.lights.frontLensMaterial) {
            material.metadata.vehicleLensRole = "front";
            pack.frontLenses.push(material);
          } else if (material.name === manifest.lights.rearLensMaterial) {
            material.metadata.vehicleLensRole = "rear";
            pack.rearLenses.push(material);
          }
          if (material.name === manifest.paintMaterial) {
            material.metadata.vehiclePaint = true;
            pack.basePaint ??= material;
          }
          if (material.name === manifest.glassMaterial) {
            material.metallic = 0;
            material.alpha = 0.34;
            material.backFaceCulling = true;
            material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
            material.metadata.vehicleGlass = true;
            material.metadata.glazing =
              "alpha-dielectric-with-modelled-interior";
          }
        }
        for (const mesh of container.meshes) {
          if (!(mesh instanceof Mesh) || !mesh.getTotalVertices()) continue;
          const match = /^Wheel([0-3]):/.exec(mesh.name),
            wheel = match ? Number(match[1]) : undefined;
          const key = mesh.name;
          if (parts.has(key))
            throw new Error("Duplicate hatchback part " + key);
          const world = mesh.computeWorldMatrix(true).clone();
          mesh.parent = null;
          mesh.position.setAll(0);
          mesh.scaling.setAll(1);
          mesh.rotationQuaternion = Quaternion.Identity();
          mesh.bakeTransformIntoVertices(world);
          if (wheel !== undefined) {
            const p = manifest.wheelCentres[wheel];
            mesh.bakeTransformIntoVertices(
              Matrix.Translation(-p[0], -p[1], -p[2]),
            );
          }
          mesh.parent = pack.root;
          mesh.name = "hatchback template:" + level + ":" + key;
          mesh.isVisible = false;
          mesh.isPickable = false;
          mesh.metadata = {
            ...mesh.metadata,
            kind: "asset-template",
            assetId: manifest.assetId,
            lod: level,
            partId: key,
            wheelIndex: wheel,
            depthCaster: false,
          };
          mesh.computeWorldMatrix(true);
          parts.set(key, { key, wheel, source: mesh });
        }
        if (parts.size !== definition.parts)
          throw new Error(
            "Hatchback pack has unexpected part count " + parts.size,
          );
        pack.templates.set(level, parts);
      }
      const keys = [...pack.templates.get("near")!.keys()];
      for (const level of ["medium", "far"] as const)
        if (keys.some((key) => !pack.templates.get(level)!.has(key)))
          throw new Error("Hatchback LOD part identity mismatch");
      pack.shadowProxies = new CarShadowProxyPack(
        scene,
        pack.templates.get("far")!.values(),
        pack.root,
      );
      const paintSources = [...pack.templates.values()].flatMap((parts) =>
        [...parts.values()]
          .filter((part) => part.source.material?.metadata?.vehiclePaint)
          .map((part) => part.source),
      );
      if (
        options.paintInstancing !== false &&
        scene.getEngine().getCaps().instancedArrays &&
        // Both plugin recipes use Babylon's same native instance stream.
        // Inspect the material's captured language, never a mutable ForceGLSL.
        paintSources.every((source) => {
          const language = source.material?.shaderLanguage;
          return (
            language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL
          );
        })
      ) {
        pack.instancePaintColor = installCarPaintInstances(paintSources);
      }
      pack.setQuality("medium");
      pack.updateLighting(0);
      return pack;
    } catch (error) {
      pack.dispose();
      throw error;
    }
  }
  private family(colour?: string) {
    if (!colour || this.instancePaintColor) return this.templates;
    const canonical = Color3.FromHexString(colour).toHexString().toLowerCase();
    let family = this.variants.get(canonical);
    if (family) return family;
    if (!this.basePaint)
      throw new Error("Hatchback has no editable paint material");
    let paint = this.paints.get(canonical);
    if (!paint) {
      paint = this.basePaint.clone("shared campus enamel " + canonical)!;
      paint.albedoColor = Color3.FromHexString(canonical).toLinearSpace();
      paint.metadata = {
        ...paint.metadata,
        vehiclePaint: true,
        paletteColour: canonical,
      };
      this.paints.set(canonical, paint);
    }
    family = new Map();
    for (const [level, base] of this.templates) {
      const parts = new Map<string, Part>();
      for (const [key, part] of base) {
        if (part.source.material?.metadata?.vehiclePaint) {
          const source = part.source.clone(
            "hatchback paint template:" + canonical + ":" + level,
            this.root,
            true,
          )!;
          source.material = paint;
          source.isVisible = false;
          source.metadata = { ...part.source.metadata };
          parts.set(key, { ...part, source });
        } else parts.set(key, part);
      }
      family.set(level, parts);
    }
    this.variants.set(canonical, family);
    this.configureFamily(family);
    return family;
  }
  private configureFamily(family: Map<CarLod, Map<string, Part>>) {
    const quality =
      this.quality === "high"
        ? "high"
        : this.quality === "medium"
          ? "medium"
          : "low";
    const [mediumDistance, farDistance] = manifest.lodDistances[quality];
    for (const [key, part] of family.get("near")!) {
      const medium = family.get("medium")!.get(key)!.source,
        far = family.get("far")!.get(key)!.source;
      // Shared unpainted parts are configured once through the base family only.
      if (
        family !== this.templates &&
        part.source === this.templates.get("near")!.get(key)!.source
      )
        continue;
      for (const lod of [...part.source.getLODLevels()])
        part.source.removeLODLevel(lod.mesh);
      part.source.addLODLevel(mediumDistance, medium);
      part.source.addLODLevel(farDistance, far);
    }
  }
  setQuality(quality: string) {
    if (this.disposed || quality === this.quality) return;
    this.quality = quality;
    this.shadowProxies?.setEnabled(quality !== "medium" && quality !== "high");
    this.configureFamily(this.templates);
    for (const family of this.variants.values()) this.configureFamily(family);
    if (this.darkFamily) this.configureFamily(this.darkFamily);
  }
  updateLighting(night: number) {
    const value = Number.isFinite(night) ? Math.max(0, Math.min(1, night)) : 0;
    if (this.disposed || Math.abs(value - this.night) < 0.0001) return;
    this.night = value;
    // Source lens meshes only. These are art intensities, not measured lumens;
    // glazing, paint, fog/reversing lamps and the brake strip stay nonemissive.
    for (const material of this.frontLenses)
      material.emissiveColor.set(1.5 * value, 1.425 * value, 1.26 * value);
    for (const material of this.rearLenses)
      material.emissiveColor.set(0.8 * value, 0.018 * value, 0.006 * value);
  }
  private lightsOff() {
    if (this.darkFamily) return this.darkFamily;
    const family = new Map<CarLod, Map<string, Part>>();
    for (const [level, base] of this.templates) {
      const parts = new Map<string, Part>();
      for (const [key, part] of base) {
        if (part.source.material?.metadata?.vehicleLensRole) {
          const original = part.source.material as PBRMaterial;
          let material = this.darkLensMaterials.get(original.name);
          if (!material) {
            material = original.clone("parked dark lens " + original.name)!;
            material.emissiveColor.setAll(0);
            material.metadata = {
              ...material.metadata,
              vehicleLampsEnabled: false,
            };
            this.darkLensMaterials.set(original.name, material);
          }
          const source = part.source.clone(
            "dark lens template:" + level + ":" + key,
            this.root,
            true,
          )!;
          source.material = material;
          source.isVisible = false;
          source.metadata = { ...part.source.metadata };
          parts.set(key, { ...part, source });
        } else parts.set(key, part);
      }
      family.set(level, parts);
    }
    this.darkFamily = family;
    this.configureFamily(family);
    return family;
  }
  createRig(entityId: string, colour?: string, lightingEnabled = true): CarRig {
    if (this.disposed) throw new Error("Hatchback pack is disposed");
    const root = new TransformNode("vehicle:" + entityId, this.scene);
    root.id = entityId;
    root.metadata = {
      kind: "vehicle",
      entityId,
      assetId: manifest.assetId,
      simulatedVehicle: true,
      vehicleLampsEnabled: lightingEnabled,
    };
    const wheels = manifest.wheelCentres.map((point, index) => {
      const pivot = new TransformNode(
        entityId + ":wheel-pivot:" + index,
        this.scene,
      );
      pivot.parent = root;
      pivot.position.set(point[0], point[1], point[2]);
      pivot.metadata = { kind: "vehicle-wheel", entityId, wheelIndex: index };
      return pivot;
    });
    const dark = lightingEnabled ? undefined : this.lightsOff().get("near")!;
    const visibleParts = [];
    for (const original of this.family(colour).get("near")!.values()) {
      const part = dark?.get(original.key)?.source.material?.metadata
        ?.vehicleLensRole
        ? dark.get(original.key)!
        : original;
      const mesh = part.source.createInstance(entityId + ":" + part.key);
      if (
        this.instancePaintColor &&
        part.source.material?.metadata?.vehiclePaint
      )
        mesh.instancedBuffers[CAR_PAINT_COLOR_BUFFER] = carPaintColor(
          this.instancePaintColor,
          colour,
        );
      mesh.parent = part.wheel === undefined ? root : wheels[part.wheel];
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.metadata = {
        kind: "vehicle-part",
        entityId,
        assetId: manifest.assetId,
        partId: part.key,
        wheelIndex: part.wheel,
        depthCaster: part.source.material?.alpha === 1 ? "opaque" : false,
        sourceLicense: manifest.license,
      };
      visibleParts.push(mesh);
    }
    const shadow = this.shadowProxies!.createRig(
      entityId,
      root,
      wheels,
      visibleParts,
    );
    let disposed = false;
    return {
      root,
      wheels,
      dispose() {
        if (disposed) return;
        disposed = true;
        shadow.dispose();
        root.dispose(false, false);
      },
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.shadowProxies?.dispose();
    this.root.dispose(false, false);
    // PBR.clone creates texture wrapper clones with shared GPU references.
    // Dispose those wrappers too; original container textures retain ownership.
    for (const material of this.paints.values()) material.dispose(false, true);
    for (const material of this.darkLensMaterials.values())
      material.dispose(false, true);
    this.paints.clear();
    for (const container of this.containers) container.dispose();
    this.containers = [];
    this.templates.clear();
    this.variants.clear();
  }
}

/** Each consumer must release only after disposing its own independent rigs. */
export async function acquireCarPack(
  scene: Scene,
  options: CarPackOptions = {},
) {
  let entry = shared.get(scene);
  if (!entry) {
    entry = { promise: CarPack.load(scene, options), references: 0 };
    shared.set(scene, entry);
  }
  entry.references++;
  try {
    const pack = await entry.promise;
    let released = false;
    return {
      pack,
      release() {
        if (released) return;
        released = true;
        entry!.references--;
        if (entry!.references === 0) {
          pack.dispose();
          if (shared.get(scene) === entry) shared.delete(scene);
        }
      },
    };
  } catch (error) {
    entry.references--;
    if (shared.get(scene) === entry) shared.delete(scene);
    throw error;
  }
}
