import type { AvatarConfig } from "../shared/types";

/** Generic fictional starting points. No scanned student likenesses. */
export const AVATAR_PRESETS = [
  {
    name: "Alex",
    detail: "Krátký střih · mikina",
    height: 1,
    build: 1,
    hairStyle: "crop",
    outfit: "hoodie",
    skin: "#d7a77f",
    hair: "#352823",
    shirt: "#657b67",
    trousers: "#273b40",
    glasses: false,
    beard: false,
    face: 0.45,
  },
  {
    name: "Robin",
    detail: "Vlnité vlasy · svetr",
    height: 1.04,
    build: 0.95,
    hairStyle: "wave",
    outfit: "sweater",
    skin: "#8f5c42",
    hair: "#241f1d",
    shirt: "#9b7258",
    trousers: "#343b48",
    glasses: true,
    beard: false,
    face: 0.25,
  },
  {
    name: "Eli",
    detail: "Dlouhé vlasy · bunda",
    height: 0.96,
    build: 0.91,
    hairStyle: "long",
    outfit: "jacket",
    skin: "#e9c4a6",
    hair: "#69513e",
    shirt: "#626e88",
    trousers: "#3d3c46",
    glasses: false,
    beard: false,
    face: 0.15,
  },
  {
    name: "Sam",
    detail: "Krátké vlasy · tričko",
    height: 1.02,
    build: 1.12,
    hairStyle: "close",
    outfit: "tee",
    skin: "#bc8662",
    hair: "#3f2c25",
    shirt: "#8c5555",
    trousers: "#34433d",
    glasses: false,
    beard: true,
    face: 0.85,
  },
  {
    name: "Mia",
    detail: "Mikádo · svetr",
    height: 0.98,
    build: 0.95,
    hairStyle: "bob",
    outfit: "sweater",
    skin: "#bf8f72",
    hair: "#211e1d",
    shirt: "#b3a374",
    trousers: "#334047",
    glasses: true,
    beard: false,
    face: 0.4,
  },
  {
    name: "Niki",
    detail: "Kudrny · mikina",
    height: 1.01,
    build: 1.04,
    hairStyle: "curls",
    outfit: "hoodie",
    skin: "#6b4636",
    hair: "#29221f",
    shirt: "#577b81",
    trousers: "#4f4542",
    glasses: false,
    beard: false,
    face: 0.65,
  },
] as const;

export const SKIN_TONES = [
  "#f0d2b4",
  "#e9c4a6",
  "#d7a77f",
  "#bf8f72",
  "#bc8662",
  "#8f5c42",
  "#6b4636",
  "#4c3027",
];
export const HAIR_TONES = [
  "#211e1d",
  "#352823",
  "#69513e",
  "#a17c4c",
  "#d4b77b",
  "#914f36",
  "#928c85",
  "#c8c5be",
];
export const CLOTHING_TONES = [
  "#657b67",
  "#577b81",
  "#626e88",
  "#8c5555",
  "#9b7258",
  "#b3a374",
  "#d4cbb4",
  "#303c3e",
];
export const TROUSER_TONES = [
  "#273b40",
  "#343b48",
  "#3d3c46",
  "#34433d",
  "#4f4542",
  "#7b776c",
];

export function avatarPreset(index: number) {
  return AVATAR_PRESETS[Math.max(0, Math.min(5, Math.floor(index) || 0))];
}

/** A deliberate preset selection resets appearance, preserving earned cosmetics. */
export function applyAvatarPreset(
  index: number,
  current: AvatarConfig,
): AvatarConfig {
  const preset = Math.max(0, Math.min(5, Math.floor(index) || 0));
  const source = avatarPreset(preset);
  return {
    ...current,
    preset,
    skin: source.skin,
    hair: source.hair,
    shirt: source.shirt,
    trousers: source.trousers,
    glasses: source.glasses,
    beard: source.beard,
    face: source.face,
  };
}
