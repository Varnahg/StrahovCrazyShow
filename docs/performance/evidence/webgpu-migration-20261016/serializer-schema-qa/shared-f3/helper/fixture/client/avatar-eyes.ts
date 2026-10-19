import type { AvatarConfig } from "../shared/types";
import type { AvatarMeshFactory, AvatarRig } from "./avatar-renderer";
import eyes from "./data/student-eyes.json";

/** Identity palette retained from the former iris layers. Each licensed atlas
 * contains both sclerae and irises; tinting the whole atlas would colour skin-white sclerae. */
export const EYE_PALETTES = [
  { color: "#6b4c36", atlas: "brown" },
  { color: "#52604d", atlas: "green" },
  { color: "#526575", atlas: "blue" },
] as const;

export function avatarFaceWidth(config: AvatarConfig) {
  return 0.173 + Math.max(0, Math.min(1, config.face)) * 0.016;
}

/** Same immutable authored data for every avatar; width is a mesh transform. */
export const eyeGeometry = eyes.levels;

export function createAvatarEyes(
  rig: AvatarRig,
  config: AvatarConfig,
  factory: AvatarMeshFactory,
) {
  if (!factory.form) return;
  for (const level of ["near", "medium"] as const) {
    const mesh = factory.form(
      `eyes-${level}`,
      `${rig.root.name} anatomical eyes ${level}`,
      EYE_PALETTES[config.preset % EYE_PALETTES.length].color,
      "ocular",
    );
    mesh.parent = rig.head;
    mesh.scaling.set(avatarFaceWidth(config), 0.235, 0.195);
    mesh.metadata = {
      avatarBodyLod: level,
      avatarDetail: "silhouette",
      anatomicalEye: true,
      characterSurface: "ocular",
      source: "MakeHuman system eyes fitted to Blender Human Base Mesh sockets",
      sourceLicense: "CC0-1.0",
    };
    mesh.setEnabled(level === "near");
  }
}

/** Original atlas pupil landmarks transported through the measured socket fit.
 * Used by geometry/ray verification, not recomputed in the render loop. */
export function irisLandmarks(level: "near" | "medium", config: AvatarConfig) {
  return eyes.landmarks[level].map(({ side, normalizedHeadLocal: point }) => ({
    side,
    point: [
      point[0] * avatarFaceWidth(config),
      point[1] * 0.235,
      point[2] * 0.195,
    ],
  }));
}
