import surfaces from "./data/assets/surfaces-manifest.json";
/** Original pixel patterns interpreted from the supplied B3 photograph.
 * No photographic pixels, room identities or B6 measured finishes are copied.
 */
export const B6_STAIR_MATERIALS = {
  "striped-corridor": { color: "#ffffff", roughness: 0.68, metallic: 0, texture: "/models/b6/striped-corridor-authored.png", metresPerRepeat: 1.28 },
  "terrazzo-tread": { color: "#ffffff", roughness: 0.8, metallic: 0, texture: "/models/b6/stair-terrazzo-authored.png", metresPerRepeat: 1.28 },
  "painted-concrete": { color: "#e1d8cb", roughness: 0.9, metallic: 0, texture: null, metresPerRepeat: 1.28 },
  "black-metal": { color: "#252523", roughness: 0.48, metallic: 0.55, texture: null, metresPerRepeat: 1.28 },
  "wood-handrail": { color: "#70482e", roughness: 0.42, metallic: 0, texture: "/models/b6/wood-authored.png", metresPerRepeat: 1.28 },
  "entry-metal":{color:"#b6bab7",roughness:.43,metallic:.65,texture:null,metresPerRepeat:1.28},
  "entry-dark-metal":{color:"#30271f",roughness:.5,metallic:.45,texture:null,metresPerRepeat:1.28},
  "entry-glass":{color:"#4c625c",roughness:.18,metallic:0,texture:null,metresPerRepeat:1.28},
} as const;

const exteriorConcreteFamily=surfaces.assets.find(asset=>asset.id==="Concrete034")!;
/** Generic original CC0 concrete channels, interpreted from the typical-block
 * entrance photo. Neither this material nor its tint is a measured B6 scan. */
export const B6_EXTERIOR_CONCRETE_MATERIAL={
  name:"b6:concrete stair treads",
  colorSRGB:"#b7b6ad",
  roughness:1,
  metallic:0,
  normalStrength:.27,
  specularIntensity:.52,
  environmentIntensity:.7,
  sourceUVMetresPerRepeat:1.28,
  metresPerRepeat:exteriorConcreteFamily.metresPerRepeat,
  metresPerRepeatV:exteriorConcreteFamily.metresPerRepeatV??exteriorConcreteFamily.metresPerRepeat,
  family:exteriorConcreteFamily,
  source:"https://ambientcg.com/a/Concrete034",
  license:"CC0-1.0",
  checkedAt:"2026-10-11",
  classification:"generic-CC0-surface-photo-interpreted-tint-not-B6-scan",
  measured:false,
}as const;

export function b6AuthoredStairPixels(kind: "striped-corridor" | "terrazzo-tread", size = 512) {
  const pixels = new Uint8Array(size * size * 4);
  const random = (x: number, y: number) => {
    let value = Math.imul(x + 653, 374761393) ^ Math.imul(y + 127, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, noise = random(x, y);
    let value: number;
    if (kind === "striped-corridor") {
      const row = Math.floor(y / size * 16), rowPosition = (y / size * 16) % 1;
      const colPosition = ((x / size * 4) + (row % 2) * 0.5) % 1;
      const grout = rowPosition < 0.027 || colPosition < 0.008;
      value = grout ? 159 : [78, 107, 87, 146][row % 4] + noise * 10;
      pixels[i] = value; pixels[i + 1] = value + 2; pixels[i + 2] = value + 1;
    } else {
      const grain = noise > 0.94 ? 61 : noise < 0.16 ? -37 : 0;
      value = 159 + grain + random(x >> 1, y >> 1) * 14;
      pixels[i] = value + 8; pixels[i + 1] = value + 5; pixels[i + 2] = value;
    }
    pixels[i + 3] = 255;
  }
  return pixels;
}

/** Identical UV convention for runtime and editable building archive. */
export function b6StairUVs(positions: ArrayLike<number>, normals: ArrayLike<number>, repeat = 1.28) {
  const uvs: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const nx = normals[i], ny = normals[i + 1];
    uvs.push((Math.abs(nx) > 0.5 ? positions[i + 2] : positions[i]) / repeat,
      (Math.abs(ny) > 0.5 ? positions[i + 2] : positions[i + 1]) / repeat);
  }
  return uvs;
}
