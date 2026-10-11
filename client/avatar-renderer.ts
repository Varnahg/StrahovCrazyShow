import { Scene } from "@babylonjs/core/scene";
import "./render-shaders";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Engine } from "@babylonjs/core/Engines/engine";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Meshes/instancedMesh";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import type { AvatarConfig } from "../shared/types";
import { avatarPreset } from "./avatar-presets";
import geometry from "./data/character-geometry.json";
import anatomy from "./data/skinned-character-geometry.json";
import { installStudentGarments } from "./avatar-garments";
import { avatarFaceWidth, createAvatarEyes, eyeGeometry } from "./avatar-eyes";
import {
  createStudentHair,
  isStudentHairForm,
  studentHairGeometry,
  studentHairStyle,
  type StudentHairForm,
} from "./avatar-hair";
import {
  createSkinnedAvatarBody,
  type SkinnedAvatarBody,
} from "./avatar-skinned";
import {
  CharacterMaterials,
  type CharacterSurface,
} from "./character-materials";

export type AvatarRig = {
  /** Continuous CC0 anatomy, sharing the existing animation pivots. */
  skinnedBody?: SkinnedAvatarBody;
  /** Rest measurements from feet, in world metres; independent of gesture/IK. */
  eyeHeight: number;
  bodyHeight: number;
  root: TransformNode;
  hips: TransformNode;
  torso: TransformNode;
  head: TransformNode;
  left: TransformNode;
  right: TransformNode;
  leftKnee: TransformNode;
  rightKnee: TransformNode;
  leftFoot: TransformNode;
  rightFoot: TransformNode;
  arm: TransformNode;
  rightArm: TransformNode;
  leftElbow: TransformNode;
  rightElbow: TransformNode;
  measurements: {
    thigh: number;
    shin: number;
    hipHeight: number;
    ankleHeight: number;
    legSpacing: number;
  };
};

export type AvatarForm =
  | keyof typeof geometry.forms
  | "head-medium"
  | "glasses"
  | "eyes-near"
  | "eyes-medium"
  | StudentHairForm;

export type AvatarMeshFactory = {
  material?(
    color: string,
    surface: CharacterSurface,
  ): StandardMaterial | PBRMaterial;
  retainMaterial?(material: StandardMaterial | PBRMaterial): void;
  releaseMaterial?(material: StandardMaterial | PBRMaterial): void;
  box(
    name: string,
    color: string,
    surface?: CharacterSurface,
  ): Mesh | InstancedMesh;
  sphere(
    name: string,
    color: string,
    surface?: CharacterSurface,
  ): Mesh | InstancedMesh;
  form?(
    shape: AvatarForm,
    name: string,
    color: string,
    surface?: CharacterSurface,
  ): Mesh | InstancedMesh;
};

/** Closed, shared silhouette meshes: no disconnected ball-shaped limbs. */
function authoredForm(shape: AvatarForm) {
  return isStudentHairForm(shape)
    ? studentHairGeometry(shape)
    : shape === "eyes-near" || shape === "eyes-medium"
      ? eyeGeometry[shape === "eyes-near" ? "near" : "medium"]
      : shape === "head"
        ? anatomy.head
        : shape === "head-medium"
          ? anatomy.headMedium
          : shape === "glasses" || shape === "beard"
            ? anatomy.accessories[shape]
            : shape.startsWith("hair-")
              ? anatomy.hair[shape.slice(5) as keyof typeof anatomy.hair]
              : geometry.forms[shape as keyof typeof geometry.forms];
}

const hairHeights = new Map<keyof typeof anatomy.hair, number>();
function hairHeight(style: keyof typeof anatomy.hair) {
  let height = hairHeights.get(style);
  if (height !== undefined) return height;
  const positions = anatomy.hair[style].positions;
  height = -Infinity;
  for (let i = 1; i < positions.length; i += 3)
    height = Math.max(height, positions[i] * 0.235);
  hairHeights.set(style, height);
  return height;
}

function formMesh(shape: AvatarForm, name: string, scene: Scene) {
  const authored = authoredForm(shape);
  const mesh = new Mesh(name, scene),
    data = new VertexData();
  data.positions = authored.positions;
  data.normals = authored.normals;
  data.indices = authored.indices;
  data.uvs = authored.uvs;
  if ("colors" in authored) data.colors = authored.colors as number[];
  data.applyToMesh(mesh);
  // Blender/glTF authored CCW winding differs from Babylon's RH primitive
  // default. Explicit orientation prevents seeing the inside/back of a head.
  mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
  mesh.useVertexColors = "colors" in authored;
  mesh.hasVertexAlpha = shape === "beard";
  return mesh;
}

/** Fit small features to the actual authored face, rather than a guessed egg.
 * This runs only on creation/edit, never in the animation/render loop. */
function faceSurfaceZ(x: number, y: number, width: number) {
  const { positions, indices } = anatomy.head;
  const px = x / width,
    py = y / 0.235;
  let maximum = -Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    const ai = indices[i] * 3,
      bi = indices[i + 1] * 3,
      ci = indices[i + 2] * 3;
    const ax = positions[ai],
      ay = positions[ai + 1],
      bx = positions[bi],
      by = positions[bi + 1],
      cx = positions[ci],
      cy = positions[ci + 1];
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denominator) < 1e-12) continue;
    const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denominator;
    const b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denominator;
    if (a < -1e-6 || b < -1e-6 || a + b > 1 + 1e-6) continue;
    maximum = Math.max(
      maximum,
      a * positions[ai + 2] +
        b * positions[bi + 2] +
        (1 - a - b) * positions[ci + 2],
    );
  }
  return Number.isFinite(maximum) ? maximum * 0.195 : 0.082;
}

function shirtSurfaceZ(preset: number, x: number, y: number) {
  const { positions, indices } =
    anatomy.bodies[preset === 2 || preset === 4 ? "female" : "male"].near.shirt;
  let front = -Infinity;
  for (let i = 0; i < indices.length; i += 3) {
    const ai = indices[i] * 3,
      bi = indices[i + 1] * 3,
      ci = indices[i + 2] * 3;
    const ax = positions[ai],
      ay = positions[ai + 1],
      bx = positions[bi],
      by = positions[bi + 1],
      cx = positions[ci],
      cy = positions[ci + 1];
    const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denominator) < 1e-12) continue;
    const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator,
      b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
    if (a < 0 || b < 0 || a + b > 1) continue;
    front = Math.max(
      front,
      a * positions[ai + 2] +
        b * positions[bi + 2] +
        (1 - a - b) * positions[ci + 2],
    );
  }
  return Number.isFinite(front) ? front : 0.14;
}

/** Keep one pool per scene. Geometry is shared even across body shapes/presets. */
export class AvatarPrimitivePool implements AvatarMeshFactory {
  private sources = new Map<string, Mesh>();
  private geometries = new Map<string, Geometry>();
  private materials = new Map<string, StandardMaterial | PBRMaterial>();
  private materialUsers = new Map<StandardMaterial | PBRMaterial, number>();
  private characterMaterials: CharacterMaterials;
  constructor(
    private scene: Scene,
    private materialFactory?: (color: string) => StandardMaterial | PBRMaterial,
  ) {
    this.characterMaterials = new CharacterMaterials(scene);
  }

  material(color: string, surface: CharacterSurface) {
    const key = `${surface}:${color}`;
    let material = this.materials.get(key);
    if (!material) {
      material =
        this.materialFactory?.(color) ??
        this.characterMaterials.get(color, surface);
      this.materials.set(key, material);
    }
    return material;
  }

  retainMaterial(material: StandardMaterial | PBRMaterial) {
    this.materialUsers.set(
      material,
      (this.materialUsers.get(material) ?? 0) + 1,
    );
  }
  releaseMaterial(material: StandardMaterial | PBRMaterial) {
    const count = (this.materialUsers.get(material) ?? 0) - 1;
    if (count > 0) this.materialUsers.set(material, count);
    else this.materialUsers.delete(material);
  }

  private create(
    shape: "box" | "sphere" | AvatarForm,
    name: string,
    color: string,
    surface: CharacterSurface = "cloth",
  ) {
    const materialKey = `${surface}:${color}`;
    const key = `${shape}:${materialKey}`;
    let source = this.sources.get(key);
    if (!source) {
      const sharedGeometry = this.geometries.get(shape);
      source =
        sharedGeometry && !sharedGeometry.isDisposed()
          ? new Mesh(`avatar source ${key}`, this.scene)
          : shape === "box"
            ? MeshBuilder.CreateBox(
                `avatar source ${key}`,
                { size: 1 },
                this.scene,
              )
            : shape === "sphere"
              ? MeshBuilder.CreateSphere(
                  `avatar source ${key}`,
                  { diameter: 1, segments: 6 },
                  this.scene,
                )
              : formMesh(shape, `avatar source ${key}`, this.scene);
      if (sharedGeometry && !sharedGeometry.isDisposed()) {
        sharedGeometry.applyToMesh(source);
        if (shape !== "box" && shape !== "sphere") {
          source.sideOrientation = Material.CounterClockWiseSideOrientation;
          source.useVertexColors = "colors" in authoredForm(shape);
          source.hasVertexAlpha = shape === "beard";
        }
      } else if (source.geometry) this.geometries.set(shape, source.geometry);
      const material = this.material(color, surface);
      source.material = material;
      source.isVisible = false;
      source.isPickable = false;
      source.doNotSyncBoundingInfo = true;
      this.sources.set(key, source);
    }
    const mesh = source.createInstance(name);
    mesh.isVisible = true;
    mesh.isPickable = false;
    return mesh;
  }

  box(name: string, color: string, surface?: CharacterSurface) {
    return this.create("box", name, color, surface);
  }
  sphere(name: string, color: string, surface?: CharacterSurface) {
    return this.create("sphere", name, color, surface);
  }
  form(
    shape: AvatarForm,
    name: string,
    color: string,
    surface?: CharacterSurface,
  ) {
    return this.create(shape, name, color, surface);
  }

  /** Useful after profile edits; keeps arbitrary colour sliders from growing the pool forever. */
  pruneUnused() {
    for (const [key, source] of this.sources) {
      if (source.instances.length === 0) {
        source.dispose(false, false);
        this.sources.delete(key);
      }
    }
    const usedMaterials = new Set(
      [...this.sources.values()].map((source) => source.material),
    );
    for (const [color, material] of this.materials) {
      if (!usedMaterials.has(material) && !this.materialUsers.has(material)) {
        this.materials.delete(color);
      }
    }
    if (!this.materialFactory)
      this.characterMaterials.prune(
        new Set(
          [...this.materials.values()].filter(
            (material): material is PBRMaterial =>
              material instanceof PBRMaterial,
          ),
        ),
      );
  }

  dispose() {
    for (const source of this.sources.values()) source.dispose(false, false);
    this.characterMaterials.dispose();
    this.sources.clear();
    this.geometries.clear();
    this.materials.clear();
    this.materialUsers.clear();
  }
}

/** Feet at y=0; face +Z. A closed articulated silhouette with seven-head proportions. */
export function createAvatarRig(
  scene: Scene,
  config: AvatarConfig,
  factory: AvatarMeshFactory,
  name = "avatar",
  options: { studentGarments?: boolean } = {},
): AvatarRig {
  const preset = avatarPreset(config.preset);
  const root = new TransformNode(name, scene);
  root.scaling.y = preset.height * 1.03;
  const build = preset.build;
  const continuousBody = !!factory.material;
  const anatomicalEyes = continuousBody && !!factory.form;
  const texturedHair =
    continuousBody && !!factory.form && studentHairStyle(config.preset);
  const studentGarments = continuousBody && options.studentGarments !== false;
  const measurements = {
    thigh: 0.42,
    shin: 0.42,
    hipHeight: 0.915,
    ankleHeight: 0.08,
    legSpacing: 0.105 * build,
  };
  const joint = (
    label: string,
    parent: TransformNode,
    x: number,
    y: number,
    z = 0,
  ) => {
    const node = new TransformNode(`${name} ${label}`, scene);
    node.parent = parent;
    node.position.set(x, y, z);
    return node;
  };
  const hips = joint("hips", root, 0, measurements.hipHeight);
  const torso = joint("spine", hips, 0, 0.14);
  const head = joint("head pivot", torso, 0, 0.51, continuousBody ? 0 : 0.005);
  const piece = (
    shape: "box" | "sphere" | AvatarForm,
    label: string,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    parent: TransformNode,
  ) => {
    const surface: CharacterSurface =
      label === "beard"
        ? "beard"
        : /(?:hair|crop|fringe|curl|eyebrow)/.test(label)
          ? "hair"
          : /^(?:face|face medium|neck|ear|nose bridge|nose tip|hand|thumb|lips)$/.test(
                label,
              ) ||
              (preset.outfit === "tee" &&
                /^(?:upper arm|forearm|elbow)$/.test(label))
            ? "skin"
            : label === "eye"
              ? "eye"
              : /^(?:iris|pupil)$/.test(label)
                ? "iris"
                : /^(?:trouser|trousers)/.test(label)
                  ? "denim"
                  : /^(?:trainer)$/.test(label)
                    ? "leather"
                    : /^(?:sole)$/.test(label)
                      ? "rubber"
                      : /(?:glasses|zip|badge)/.test(label)
                        ? "metal"
                        : "cloth";
    const mesh =
      shape === "box"
        ? factory.box(`${name} ${label}`, color, surface)
        : shape === "sphere"
          ? factory.sphere(`${name} ${label}`, color, surface)
          : (factory.form?.(shape, `${name} ${label}`, color, surface) ??
            factory.sphere(`${name} ${label}`, color, surface));
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.scaling.set(sx, sy, sz);
    mesh.metadata = {
      ...mesh.metadata,
      characterSurface: surface,
      avatarDetail:
        /^(?:eye|iris|pupil|ear|eyebrow|nose bridge|nose tip|lips|collar|shirt hem|hoodie pocket|drawstring|jacket zip|jacket collar|jacket pocket|sole|elbow|cuff|thumb|glasses rim|glasses side|glasses bridge|badge|seam)$/.test(
          label,
        )
          ? "micro"
          : "silhouette",
    };
    return mesh;
  };
  const oval = (
    label: string,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    parent: TransformNode,
  ) => piece("sphere", label, color, x, y, z, sx, sy, sz, parent);
  const box = (
    label: string,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    parent: TransformNode,
  ) => piece("box", label, color, x, y, z, sx, sy, sz, parent);
  if (!continuousBody) {
    piece(
      "pelvis",
      "trouser waist",
      config.trousers,
      0,
      0.005,
      0,
      0.35 * build,
      0.2,
      0.235,
      hips,
    );
    piece(
      "torso",
      "clothed torso",
      config.shirt,
      0,
      0.155,
      0,
      0.48 * build,
      0.43,
      0.235,
      torso,
    );
    oval("neck", config.skin, 0, 0.375, 0, 0.095, 0.14, 0.1, torso);
  }
  const faceWidth = avatarFaceWidth(config);
  const face = piece(
    "head",
    "face",
    config.skin,
    0,
    0,
    0,
    faceWidth,
    0.235,
    0.195,
    head,
  );
  if (continuousBody) {
    face.metadata.avatarBodyLod = "near";
    const mediumFace = piece(
      "head-medium",
      "face medium",
      config.skin,
      0,
      0,
      0,
      faceWidth,
      0.235,
      0.195,
      head,
    );
    mediumFace.metadata.avatarBodyLod = "medium";
    mediumFace.metadata.characterSurface = "skin";
    mediumFace.setEnabled(false);
  }
  for (const side of [-1, 1]) {
    const eyeX = side * 0.034;
    const eyeY = 0.009;
    if (!continuousBody)
      oval(
        "ear",
        config.skin,
        side * faceWidth * 0.49,
        -0.006,
        -0.008,
        0.028,
        0.056,
        0.027,
        head,
      );
    if (!anatomicalEyes) {
      const eyeSurface = faceSurfaceZ(eyeX, eyeY, faceWidth);
      oval(
        "eye",
        "#c8c4b5",
        eyeX,
        eyeY,
        eyeSurface - 0.001,
        0.025,
        0.0105,
        0.009,
        head,
      );
      oval(
        "iris",
        config.preset % 3 === 0
          ? "#6b4c36"
          : config.preset % 3 === 1
            ? "#52604d"
            : "#526575",
        eyeX,
        eyeY,
        eyeSurface + 0.0036,
        0.0085,
        0.0085,
        0.002,
        head,
      );
      oval(
        "pupil",
        "#121817",
        eyeX,
        eyeY,
        eyeSurface + 0.0046,
        0.0036,
        0.0042,
        0.001,
        head,
      );
    }
    const eyebrow = piece(
      "limb",
      "eyebrow",
      config.hair,
      side * 0.034,
      0.026,
      faceSurfaceZ(eyeX, 0.026, faceWidth) + 0.0015,
      0.0045,
      0.03,
      0.004,
      head,
    );
    eyebrow.rotation.z = Math.PI / 2 + side * -0.06;
  }
  // Nose, orbital rims, cheeks, chin and lips belong to the continuous head
  // surface, avoiding glued-on cylinders and a floating black mouth stripe.
  if (!texturedHair)
    piece(
      `hair-${preset.hairStyle}`,
      `${preset.hairStyle} hair`,
      config.hair,
      0,
      0,
      0,
      faceWidth,
      0.235,
      0.195,
      head,
    );

  // Real clothes have a neckline, hem and tapered limbs, rather than a stack
  // of equally rounded balls. Details stay broad enough to survive distance.
  if (!continuousBody) {
    oval("collar", config.shirt, 0, 0.355, -0.002, 0.15, 0.044, 0.14, torso);
    box(
      "shirt hem",
      config.shirt,
      0,
      -0.047,
      0.003,
      0.345 * build,
      0.022,
      0.178,
      torso,
    );
  }
  if (!studentGarments && preset.outfit === "hoodie") {
    oval("hood", config.shirt, 0, 0.3, -0.115, 0.24, 0.2, 0.12, torso);
    piece(
      "pelvis",
      "hoodie pocket",
      config.shirt,
      0,
      0.06,
      0.109,
      0.22 * build,
      0.075,
      0.025,
      torso,
    );
    for (const side of [-1, 1])
      box(
        "drawstring",
        "#c5c0b2",
        side * 0.043,
        0.27,
        0.115,
        0.005,
        0.11,
        0.006,
        torso,
      );
  } else if (!studentGarments && preset.outfit === "jacket") {
    box("jacket zip", "#9d9e93", 0, 0.15, 0.117, 0.009, 0.36, 0.008, torso);
    for (const side of [-1, 1]) {
      const lapel = box(
        "jacket collar",
        config.shirt,
        side * 0.055,
        0.32,
        0.105,
        0.07,
        0.1,
        0.025,
        torso,
      );
      lapel.rotation.z = side * 0.28;
      box(
        "jacket pocket",
        config.shirt,
        side * 0.115,
        0.06,
        0.109,
        0.08,
        0.013,
        0.015,
        torso,
      );
    }
  }

  const left = joint("hip L", hips, -measurements.legSpacing, 0);
  const right = joint("hip R", hips, measurements.legSpacing, 0);
  const leftKnee = joint("knee L", left, 0, -measurements.thigh);
  const rightKnee = joint("knee R", right, 0, -measurements.thigh);
  const leftFoot = joint("ankle L", leftKnee, 0, -measurements.shin);
  const rightFoot = joint("ankle R", rightKnee, 0, -measurements.shin);
  for (const [leg, knee, foot] of [
    [left, leftKnee, leftFoot],
    [right, rightKnee, rightFoot],
  ] as const) {
    if (!continuousBody) {
      piece(
        "limb",
        "trouser thigh",
        config.trousers,
        0,
        -measurements.thigh / 2,
        0,
        0.18 * build,
        measurements.thigh + 0.025,
        0.19,
        leg,
      );
      oval(
        "trouser knee",
        config.trousers,
        0,
        0,
        0,
        0.127 * build,
        0.125,
        0.132,
        knee,
      );
      piece(
        "limb",
        "trouser calf",
        config.trousers,
        0,
        -measurements.shin / 2,
        0,
        0.134 * build,
        measurements.shin + 0.018,
        0.144,
        knee,
      );
    }
    piece(
      "shoe",
      "trainer",
      "#343a36",
      0,
      -0.025,
      0.052,
      0.128 * build,
      0.11,
      0.273,
      foot,
    );
    piece(
      "shoe",
      "sole",
      "#a5a79c",
      0,
      -0.071,
      0.053,
      0.131 * build,
      0.018,
      0.276,
      foot,
    );
  }

  const arm = joint(
    "shoulder L",
    torso,
    -(continuousBody ? 0.19 : 0.232) * build,
    0.31,
  );
  const rightArm = joint(
    "shoulder R",
    torso,
    (continuousBody ? 0.19 : 0.232) * build,
    0.31,
  );
  const leftElbow = joint("elbow L", arm, 0, -0.255);
  const rightElbow = joint("elbow R", rightArm, 0, -0.255);
  for (const [shoulder, elbow, side] of [
    [arm, leftElbow, -1],
    [rightArm, rightElbow, 1],
  ] as const) {
    if (continuousBody) continue;
    const shortSleeve = preset.outfit === "tee";
    piece(
      "limb",
      "upper arm",
      shortSleeve ? config.skin : config.shirt,
      0,
      -0.128,
      0,
      shortSleeve ? 0.097 : 0.129,
      0.275,
      shortSleeve ? 0.104 : 0.14,
      shoulder,
    );
    if (shortSleeve)
      piece(
        "limb",
        "tee sleeve",
        config.shirt,
        0,
        -0.052,
        0,
        0.14,
        0.14,
        0.148,
        shoulder,
      );
    oval(
      "elbow",
      shortSleeve ? config.skin : config.shirt,
      0,
      0,
      0,
      0.085,
      0.09,
      0.09,
      elbow,
    );
    piece(
      "limb",
      "forearm",
      shortSleeve ? config.skin : config.shirt,
      0,
      -0.113,
      0,
      shortSleeve ? 0.078 : 0.105,
      0.24,
      shortSleeve ? 0.085 : 0.116,
      elbow,
    );
    if (!shortSleeve)
      piece(
        "limb",
        "cuff",
        config.shirt,
        0,
        -0.222,
        0,
        0.085,
        0.035,
        0.091,
        elbow,
      );
    piece(
      "hand",
      "hand",
      config.skin,
      0,
      -0.282,
      0.008,
      0.071,
      0.115,
      0.043,
      elbow,
    );
    oval(
      "thumb",
      config.skin,
      side * -0.033,
      -0.267,
      0.023,
      0.026,
      0.058,
      0.027,
      elbow,
    );
  }
  if (config.glasses) {
    const glasses = piece(
      "glasses",
      "glasses frames",
      "#343d39",
      0,
      0,
      0,
      faceWidth,
      0.235,
      0.195,
      head,
    );
    // Eyewear carries identity at conversational distance. Keep the original
    // shared frame through medium LOD, then omit it from the solid far proxy.
    glasses.metadata.avatarDetail = "identity";
    glasses.metadata.avatarFarProxy = false;
  }
  if (config.beard)
    piece(
      "beard",
      "beard",
      config.hair,
      0,
      0,
      0,
      faceWidth,
      0.235,
      0.195,
      head,
    );
  if (config.badge)
    box(
      "badge",
      config.badge === "Kvízový nadšenec" ? "#bca4da" : "#c6a56b",
      -0.09 * build,
      0.225,
      continuousBody
        ? shirtSurfaceZ(
            config.preset,
            -0.09,
            measurements.hipHeight + torso.position.y + 0.225,
          ) + 0.006
        : 0.116,
      0.036,
      0.039,
      0.008,
      torso,
    );
  const rig: AvatarRig = {
    eyeHeight:
      (measurements.hipHeight + torso.position.y + head.position.y + 0.009) *
      root.scaling.y,
    bodyHeight:
      (measurements.hipHeight +
        torso.position.y +
        head.position.y +
        hairHeight(preset.hairStyle)) *
      root.scaling.y,
    root,
    hips,
    torso,
    head,
    left,
    right,
    leftKnee,
    rightKnee,
    leftFoot,
    rightFoot,
    arm,
    rightArm,
    leftElbow,
    rightElbow,
    measurements,
  };
  if (anatomicalEyes) createAvatarEyes(rig, config, factory);
  if (texturedHair) createStudentHair(rig, config, factory);
  rig.skinnedBody = createSkinnedAvatarBody(scene, rig, config, factory, {
    parts: studentGarments
      ? preset.outfit === "tee"
        ? ["skin", "sleeves"]
        : ["skin"]
      : undefined,
  });
  if (studentGarments) installStudentGarments(scene, rig, config);
  // Preview and the synchronous fallback start with the same relaxed pose as
  // the controller: slightly unlocked knees, flat soles, bent elbows.
  const restHip = Math.acos(
    (measurements.hipHeight - measurements.ankleHeight) /
      (measurements.thigh + measurements.shin),
  );
  for (const [hip, knee, foot] of [
    [left, leftKnee, leftFoot],
    [right, rightKnee, rightFoot],
  ] as const) {
    hip.rotation.x = -restHip;
    knee.rotation.x = restHip * 2;
    foot.rotation.x = -restHip;
  }
  arm.rotation.z = -0.04;
  rightArm.rotation.z = 0.04;
  leftElbow.rotation.x = rightElbow.rotation.x = -0.12;
  return rig;
}
export type AvatarPreviewController = {
  update(config: AvatarConfig): void;
  rotate(radians: number): void;
  focus(detail: "body" | "face"): void;
  resetView(): void;
  dispose(): void;
};

/** Single, on-demand rendered canvas; no render loop or per-avatar engine. */
export function createAvatarPreview(
  canvas: HTMLCanvasElement,
  initial: AvatarConfig,
): AvatarPreviewController {
  const engine = new Engine(
    canvas,
    true,
    {
      preserveDrawingBuffer: false,
      stencil: false,
      powerPreference: "high-performance",
    },
    false,
  );
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  const camera = new ArcRotateCamera(
    "avatar preview",
    Math.PI * 0.41,
    1.41,
    3.65,
    new Vector3(0, 0.75, 0),
    scene,
  );
  camera.minZ = 0.05;
  camera.maxZ = 15;
  camera.fov = 0.62;
  const sky = new HemisphericLight(
    "preview ambient",
    new Vector3(0, 1, 0),
    scene,
  );
  sky.intensity = 0.95;
  sky.groundColor = Color3.FromHexString("#61665a");
  const key = new DirectionalLight(
    "preview key",
    new Vector3(-0.5, -0.8, -0.6),
    scene,
  );
  key.intensity = 1.05;
  sky.intensity = 0.65;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = 1;
  scene.imageProcessingConfiguration.exposure = 1.1;
  const pool = new AvatarPrimitivePool(scene);
  let rig = createAvatarRig(scene, initial, pool, "preview");
  let disposed = false;
  let detail: "body" | "face" = "body";
  const frame = () => {
    camera.radius = detail === "face" ? 0.9 : 3.65;
    camera.target.set(
      0,
      (detail === "face" ? 1.565 : 0.75 / 1.03) * rig.root.scaling.y,
      0.015,
    );
    camera.beta = detail === "face" ? 1.46 : 1.41;
  };
  frame();
  let request: number | undefined;
  const render = () => {
    if (disposed || request !== undefined || document.hidden) return;
    request = requestAnimationFrame(() => {
      request = undefined;
      if (!disposed) scene.render();
    });
  };
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    // Tiny editor previews do not need a full native-DPR framebuffer.
    const density = Math.min(1.5, window.devicePixelRatio || 1);
    engine.setSize(
      Math.max(1, Math.round(bounds.width * density)),
      Math.max(1, Math.round(bounds.height * density)),
    );
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const visible = () => {
    if (!document.hidden) render();
  };
  document.addEventListener("visibilitychange", visible);
  resize();
  // On-demand previews still need a frame after asynchronous shader compilation.
  scene.executeWhenReady(render);
  return {
    update(config) {
      if (disposed) return;
      rig.root.dispose(false, false);
      rig = createAvatarRig(scene, config, pool, "preview");
      pool.pruneUnused();
      frame();
      render();
      scene.executeWhenReady(render);
    },
    rotate(radians) {
      camera.alpha += radians;
      render();
    },
    focus(value) {
      detail = value;
      frame();
      render();
    },
    resetView() {
      camera.alpha = Math.PI / 2;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (request !== undefined) cancelAnimationFrame(request);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visible);
      rig.root.dispose(false, false);
      pool.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
