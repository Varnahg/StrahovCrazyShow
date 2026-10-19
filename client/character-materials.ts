import type { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { EYE_PALETTES } from "./avatar-eyes";
import {
  configureStudentHairMaterial,
  createStudentHairTextures,
  type StudentHairStyle,
  type StudentHairSurface,
  type StudentHairTextures,
} from "./avatar-hair";

export type CharacterSurface =
  | "skin"
  | "hair"
  | StudentHairSurface
  | "beard"
  | "cloth"
  | "denim"
  | "leather"
  | "eye"
  | "ocular"
  | "iris"
  | "metal"
  | "rubber";

/** Deterministic analytical microstructure, not a photograph of a real person. */
function microNormal(scene: Scene, kind: "skin" | "cloth" | "hair") {
  const size = 64;
  const bytes = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      heights[y * size + x] =
        kind === "cloth"
          ? Math.sin(u * tau * 16) * Math.sin(v * tau * 16) * 0.3 +
            Math.cos((u + v) * tau * 8) * 0.06
          : kind === "hair"
            ? Math.sin(u * tau * 22 + Math.sin(v * tau) * 0.7) * 0.3
            : Math.sin(u * tau * 19 + Math.sin(v * tau * 11)) *
              Math.cos(v * tau * 17 + Math.sin(u * tau * 13)) *
              0.1;
    }
  const at = (x: number, y: number) =>
    heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = at(x - 1, y) - at(x + 1, y);
      const dy = at(x, y - 1) - at(x, y + 1);
      const length = Math.hypot(dx, dy, 1),
        i = (y * size + x) * 4;
      bytes[i] = Math.round(((dx / length) * 0.5 + 0.5) * 255);
      bytes[i + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
      bytes[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      bytes[i + 3] = 255;
    }
  const texture = new RawTexture(
    bytes,
    size,
    size,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.name = `authored ${kind} analytical normal`;
  texture.gammaSpace = false;
  texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.level = kind === "skin" ? 0.035 : kind === "hair" ? 0.12 : 0.035;
  texture.uScale = texture.vScale =
    kind === "skin" ? 3 : kind === "cloth" ? 4 : 1;
  return texture;
}

/** One material per role/colour in a scene, three shared normal textures total. */
export class CharacterMaterials {
  private textures = new Map<"skin" | "cloth" | "hair", RawTexture>();
  private eyeTextures = new Map<string, Texture>();
  private hairTextures = new Map<StudentHairStyle, StudentHairTextures>();
  private materials = new Map<string, PBRMaterial>();
  constructor(private scene: Scene) {}

  get(color: string, surface: CharacterSurface) {
    const key = `${surface}:${color.toLowerCase()}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = new PBRMaterial(`character ${key}`, this.scene);
    // Configure this new material before sharing it with the cache or meshes.
    material.atomicMaterialsUpdate(() => {
      material.albedoColor = Color3.FromHexString(color).toLinearSpace();
      material.metallic = surface === "metal" ? 0.65 : 0;
      material.roughness = {
        skin: 0.53,
        hair: 0.54,
        "strands-short02": 0.76,
        "strands-short04": 0.76,
        beard: 0.9,
        cloth: 0.88,
        denim: 0.94,
        leather: 0.56,
        eye: 0.14,
        ocular: 0.3,
        iris: 0.22,
        metal: 0.37,
        rubber: 0.86,
      }[surface];
      material.environmentIntensity = surface === "eye" ? 0.9 : 0.65;
      material.metadata = { characterSurface: surface, paletteColor: color };
      if (surface === "strands-short02" || surface === "strands-short04") {
        const style = surface === "strands-short02" ? "short02" : "short04";
        let maps = this.hairTextures.get(style);
        if (!maps) {
          maps = createStudentHairTextures(this.scene, style);
          this.hairTextures.set(style, maps);
        }
        configureStudentHairMaterial(material, style, maps);
      }
      if (surface === "ocular") {
        const atlas =
          EYE_PALETTES.find((entry) => entry.color === color)?.atlas ?? "brown";
        let texture = this.eyeTextures.get(atlas);
        if (!texture) {
          texture = new Texture(
            `/models/characters/student-eyes/${atlas}.png`,
            this.scene,
            false,
            true,
            Texture.TRILINEAR_SAMPLINGMODE,
          );
          texture.gammaSpace = true;
          texture.hasAlpha = false;
          this.eyeTextures.set(atlas, texture);
        }
        material.albedoColor = Color3.White();
        material.albedoTexture = texture;
        material.indexOfRefraction = 1.376;
        material.clearCoat.isEnabled = true;
        material.clearCoat.intensity = 1;
        material.clearCoat.roughness = 0.08;
        material.clearCoat.indexOfRefraction = 1.376;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
        material.metadata.sourceLicense = "CC0-1.0";
        material.metadata.eyeAtlas = atlas;
      }
      if (surface === "beard") {
        // Stubble blends over an opaque head, never cuts a hole in skin.
        material.alpha = 0.42;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      }
      // No per-character screen-space scattering/prepass. Small highlights and
      // a broad skin lobe remain compatible with ordinary instanced PBR draws.
      if (surface === "skin") {
        material.clearCoat.isEnabled = true;
        material.clearCoat.intensity = 0.055;
        material.clearCoat.roughness = 0.5;
      }
      if (surface === "cloth" || surface === "denim") {
        material.sheen.isEnabled = true;
        material.sheen.intensity = 0.12;
        material.sheen.color = new Color3(0.38, 0.38, 0.38);
        material.sheen.roughness = 0.85;
      }
      const textureKind =
        surface === "skin" || surface === "beard"
          ? "skin"
          : surface === "hair"
            ? "hair"
            : surface === "cloth" || surface === "denim"
              ? "cloth"
              : undefined;
      if (textureKind) {
        let texture = this.textures.get(textureKind);
        if (!texture) {
          texture = microNormal(this.scene, textureKind);
          this.textures.set(textureKind, texture);
        }
        material.bumpTexture = texture;
      }
    });
    this.materials.set(key, material);
    return material;
  }

  prune(used: Set<PBRMaterial>) {
    for (const [key, material] of this.materials)
      if (!used.has(material)) {
        material.dispose(false, false);
        this.materials.delete(key);
      }
  }

  dispose() {
    for (const material of this.materials.values())
      material.dispose(false, false);
    for (const texture of this.textures.values()) texture.dispose();
    for (const texture of this.eyeTextures.values()) texture.dispose();
    for (const { albedo, normal } of this.hairTextures.values()) {
      albedo.dispose();
      normal?.dispose();
    }
    this.materials.clear();
    this.textures.clear();
    this.eyeTextures.clear();
    this.hairTextures.clear();
  }
}
