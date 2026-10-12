import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { buildingRoofGeometry } from "../shared/building-roofs";
import evidence from "../shared/data/facade-reality.json";
import marketDetails from "../shared/data/market-detail-kit.json";
import b4Panels from "../shared/data/b4-panel-kit.json";
import { B4_FACADE_PLAN, b4FacadePlan } from "../shared/b4-facade-plan";
import { BUILDINGS, buildingArchitecture } from "../shared/world";
import type { Building, Vec3 } from "../shared/types";
import { renderBudget } from "../shared/render-quality";
import { entryForFacade } from "../shared/landmark-reality";
import { B6_LAYOUT } from "../shared/b6-interior";
import { B6_FACADE_PLAN, b6LongWindow } from "../shared/b6-facade-plan";
import { osmAssetIdentity } from "../shared/world-asset-identity";
import {
  getWorldAssetRoot,
  attachWorldAssetNode,
  disposeEmptyWorldAssetRoots,
} from "./world-asset-identity";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FACADE_DEPTH, metricFacadeFrame } from "./architecture-depth";
import { createB4PanelMaterial } from "./b4-panel-material";
import {
  appendBuildingDetailGeometry,
  createBuildingWindowModelCache,
  BUILDING_WINDOW_KIT,
  type WindowModelKit,
  type WindowModelGeometry,
} from "./building-window-model";

/** Window dimensions are photo interpretations, not a claim about room counts. */
export const FACADE_DIMENSIONS = evidence.dimensions;
export const B6_ENTRY_REFERENCE = evidence.b6Entry;
export const LANDMARK_ENTRANCES = evidence.landmarkEntrances;
type Point = [number, number, number];
export type RealityEdge = {
  a: [number, number];
  b: [number, number];
  length: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  long: boolean;
};
export type WindowOpening = {
  u: number;
  v: number;
  w: number;
  h: number;
  panes: number;
  transom?: number;
  style: "room" | "small" | "stair";
};

export function architectureEdges(points: [number, number][]): RealityEdge[] {
  const p = points.slice();
  if (p.length > 1 && p[0][0] === p.at(-1)![0] && p[0][1] === p.at(-1)![1])
    p.pop();
  let area = 0,
    longest = 0,
    ax = 1,
    az = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    area += a[0] * b[1] - b[0] * a[1];
    if (len > longest) {
      longest = len;
      ax = (b[0] - a[0]) / len;
      az = (b[1] - a[1]) / len;
    }
  }
  const sign = area >= 0 ? 1 : -1;
  return p.flatMap((a, i) => {
    const b = p[(i + 1) % p.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.08) return [];
    const tx = (b[0] - a[0]) / length,
      tz = (b[1] - a[1]) / length;
    return [
      {
        a,
        b,
        length,
        tx,
        tz,
        nx: tz * sign,
        nz: -tx * sign,
        long: Math.abs(tx * ax + tz * az) > 0.88,
      },
    ];
  });
}

/** Retains actual edges. The facade plan never moves an OSM building. */
export function planFacadeOpenings(
  edge: RealityEdge,
  height: number,
  type: string,
  block?: number | null,
): WindowOpening[] {
  const b4 = block === 4 ? b4FacadePlan(edge, height) : undefined;
  if (b4) return b4.openings;
  const low = type === "low",
    cell = type === "cell",
    module = low ? FACADE_DIMENSIONS.low : FACADE_DIMENSIONS.standard;
  const floors = Math.max(1, Math.round(height / 3)),
    result: WindowOpening[] = [];
  if (block === 6 && edge.nz < -0.8 && edge.length < 9) return [];
  if (["administration", "unknown", "service"].includes(type)) return result;
  if (
    block === 6 &&
    edge.nx < -0.8 &&
    edge.a[0] < -6.5 &&
    edge.length > 6 &&
    edge.length < 9
  ) {
    const band = B6_FACADE_PLAN.receptionWestBand;
    for (let row = 0; row < floors; row++)
      result.push({
        u: (edge.length - band.width) / 2,
        v: row * 3 + band.sill,
        w: band.width,
        h: band.height,
        panes: band.panes,
        style: band.style,
      });
    return result;
  }
  if (type === "commercial") {
    // Identified east end, Mapy panorama 101883310 (June 2023). These are
    // clerestory openings and barred vents, never a fabricated bar entrance.
    if (edge.nx < 0.8 || edge.length < 12) return [];
    for (let i = 0; i < 4; i++) {
      result.push({
        u: edge.length * 0.37 + i * 1.55,
        v: 1.82,
        w: 0.7,
        h: 0.62,
        panes: 1,
        style: "small",
      });
      result.push({
        u: edge.length * 0.37 + i * 1.55,
        v: 0.12,
        w: 0.65,
        h: 0.28,
        panes: 1,
        style: "small",
      });
    }
    return result.filter((w) => w.u + w.w < edge.length - 0.3);
  }
  if (type === "canteen") {
    // The north-facing campus front is an explicitly documented interpretation.
    if (edge.nz > -0.8 || edge.length < 12) return [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < Math.floor(edge.length / 2.8); col++)
        result.push({
          u: 0.3 + col * 2.8,
          v: 0.35 + row * 2.18,
          w: 2.58,
          h: 2.03,
          panes: 1,
          style: "stair",
        });
    return result.filter(
      (w) => w.u + w.w <= edge.length - 0.2 && w.v + w.h < height - 1.5,
    );
  }
  if (edge.long && edge.length > 10) {
    if (block === 6 && Math.abs(edge.tz) > 0.9) {
      const pitch = 70 / 22,
        minZ = Math.min(edge.a[1], edge.b[1]),
        maxZ = Math.max(edge.a[1], edge.b[1]);
      for (let row = 0; row < floors; row++)
        for (let col = 0; col < 22; col++) {
          const z = -90 + (col + 0.5) * pitch;
          // The west lobby interrupts the long facade; preserve its solid core
          // and clip the adjacent room opening to the same shared wall spans.
          if (
            edge.nx < -0.8 &&
            z > B6_LAYOUT.lobby.minZ &&
            z < B6_LAYOUT.lobby.maxZ
          )
            continue;
          if (z < minZ || z > maxZ) continue;
          const spec = b6LongWindow(
            edge.nx < -0.8 ? 0 : 16,
            z,
            B6_LAYOUT.window,
          );
          const a = Math.max(minZ, z - spec.width / 2),
            b = Math.min(maxZ, z + spec.width / 2);
          if (b - a < 0.3) continue;
          const u1 = (a - edge.a[1]) / edge.tz,
            u2 = (b - edge.a[1]) / edge.tz;
          result.push({
            u: Math.min(u1, u2),
            v: row * 3 + spec.sill,
            w: b - a,
            h: spec.height,
            panes: spec.panes,
            style: spec.style,
          });
        }
      return result;
    }
    const count = Math.max(1, Math.round(edge.length / module.bayPitch)),
      pitch = edge.length / count;
    for (let row = 0; row < floors; row++)
      for (let col = 0; col < count; col++) {
        const w = Math.min(
          module.windowWidth * (cell ? 0.91 : 1),
          pitch - 0.55,
        );
        result.push({
          u: (col + 0.5) * pitch - w / 2,
          v: row * 3 + module.sillHeight,
          w,
          h: module.windowHeight,
          panes: low ? 1 : cell ? 3 : 4,
          transom: low ? 0.55 : undefined,
          style: "room",
        });
      }
  } else if (edge.length >= 9 && edge.length <= 19 && !low) {
    // Broad concrete blank pier + recessed stair strip + paired small openings.
    // This replaces the previous identical grid across each entire end wall.
    const stair = edge.length * 0.49;
    const pair = edge.length * (edge.nz < -0.8 ? 0.16 : 0.73);
    for (let row = 0; row < floors; row++) {
      if (row > 0)
        result.push({
          u: stair - 1.05,
          v: row * 3 + 0.87,
          w: 2.1,
          h: 0.66,
          panes: 3,
          style: "stair",
        });
      for (let i = 0; i < 2; i++)
        result.push({
          u: pair + i * 0.91,
          v: row * 3 + 1.05,
          w: 0.72,
          h: 0.78,
          panes: 1,
          style: "small",
        });
    }
  } else if (edge.length > 4.5 && edge.length < 9 && !low) {
    for (let row = 1; row < floors; row++)
      for (let i = 0; i < 2; i++)
        result.push({
          u: edge.length * 0.43 + i * 0.92 - 0.7,
          v: row * 3 + 1.05,
          w: 0.72,
          h: 0.78,
          panes: 1,
          style: "small",
        });
  }
  return result.filter(
    (w) =>
      w.u >= 0.1 && w.u + w.w <= edge.length - 0.1 && w.v + w.h < height - 0.2,
  );
}

class Batch {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  colors?: number[];
  constructor(
    readonly name: string,
    readonly material: Material,
  ) {}
  surface(a: Point, b: Point, c: Point, d: Point, outward: Point) {
    const { normal, uv } = metricFacadeFrame(a, b, c, outward);
    this.quad(a, b, c, d, normal, uv);
  }
  quad(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    normal: Point,
    uv = [0, 0, 1, 1],
  ) {
    const offset = this.positions.length / 3;
    this.positions.push(...a, ...b, ...c, ...d);
    if (this.colors) for (let i = 0; i < 16; i++) this.colors.push(1);
    for (let i = 0; i < 4; i++) this.normals.push(...normal);
    this.uvs.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    const ab = b.map((x, i) => x - a[i]),
      ac = c.map((x, i) => x - a[i]);
    const dot =
      (ab[1] * ac[2] - ab[2] * ac[1]) * normal[0] +
      (ab[2] * ac[0] - ab[0] * ac[2]) * normal[1] +
      (ab[0] * ac[1] - ab[1] * ac[0]) * normal[2];
    this.indices.push(
      offset,
      offset + (dot >= 0 ? 1 : 2),
      offset + (dot >= 0 ? 2 : 1),
    );
    // Roof triangulation supplies c=d through the quad interface. Preserve the
    // actual roof face without emitting a second, zero-area triangle.
    if (!c.every((value, i) => value === d[i]))
      this.indices.push(
        offset,
        offset + (dot >= 0 ? 2 : 3),
        offset + (dot >= 0 ? 3 : 2),
      );
  }
  mesh(scene: Scene) {
    if (!this.indices.length) return undefined;
    const mesh = new Mesh(this.name, scene),
      vd = new VertexData();
    vd.positions = this.positions;
    vd.normals = this.normals;
    vd.uvs = this.uvs;
    vd.indices = this.indices;
    if (this.colors) vd.colors = this.colors;
    vd.applyToMesh(mesh);
    // This builder explicitly emits counterclockwise triangles with outward
    // normals. Babylon's default RH mesh orientation is clockwise; leaving it
    // implicit culls the external shell and reveals the opposite interior wall.
    mesh.sideOrientation = 1;
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}
type Palette = ReturnType<typeof createMaterials>;
function canvasTexture(
  scene: Scene,
  name: string,
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
) {
  if (typeof document === "undefined") return null;
  const t = new DynamicTexture(
    name,
    { width: w, height: h },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  paint(t.getContext() as unknown as CanvasRenderingContext2D);
  // Mesh UV v=1 is the top edge. Flip the canvas upload so text, blinds and
  // brighter reflected sky retain their photographed upright orientation.
  t.update(true);
  t.anisotropicFilteringLevel = 4;
  return t;
}
function createMaterials(scene: Scene) {
  const solid = (
    name: string,
    color: string,
    texture?: string,
    bump = 0.16,
  ) => {
    const m = new StandardMaterial("reality " + name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.setAll(0.025);
    if (texture === "concrete" || texture === "plaster")
      m.metadata = { surfaceKind: texture, uvMetresPerRepeat: 3 };
    // Headless archive extraction reads this same authored recipe without
    // creating browser textures. A later surface-pack override takes priority.
    if (texture)
      m.metadata = {
        ...m.metadata,
        authoredArchitectureTexture: `/models/architecture/textures/${texture}-color.png`,
        authoredArchitectureNormal: `/models/architecture/textures/${texture}-normal.png`,
        authoredArchitectureNormalStrength: bump,
      };
    if (texture && typeof document !== "undefined") {
      m.diffuseTexture = new Texture(
        m.metadata.authoredArchitectureTexture,
        scene,
      );
      m.diffuseColor.setAll(1);
      const normal = new Texture(m.metadata.authoredArchitectureNormal, scene);
      normal.level = m.metadata.authoredArchitectureNormalStrength;
      m.bumpTexture = normal;
    }
    return m;
  };
  const plaster = solid("aged pale plaster", "#d9d7c9", "plaster", 0.12),
    concrete = solid("board concrete", "#92958b", "concrete", 0.23),
    roof = solid("flat weathered roof", "#737974", "roof", 0.1),
    frame = solid("brown timber frames", "#5e4737", "wood", 0.1),
    sill = solid("pale aluminum sill", "#b1b4a9"),
    base = solid("concrete plinth", "#747e74"),
    red = solid("B8 red entrance core", "#8f3c38"),
    metal = solid("entrance galvanized frame", "#6c7a76"),
    cream = solid("menza tile", "#cfbf89", "tile", 0.13);
  const greyPanel = createB4PanelMaterial(scene);
  const b4Frame = solid(
    "B4 dark window frames",
    B4_FACADE_PLAN.material.frameNeutralShadeHex,
  );
  const glass: StandardMaterial[] = [];
  for (let style = 0; style < 3; style++)
    for (let lit = 0; lit < 2; lit++) {
      const m = solid(
        `glass ${style} ${lit}`,
        style === 0 ? "#657e85" : style === 1 ? "#899b9a" : "#758782",
      );
      m.specularColor.set(0.37, 0.39, 0.4);
      m.specularPower = 100;
      m.diffuseTexture = canvasTexture(scene, m.name, 128, 128, (ctx) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 128);
        gradient.addColorStop(0, "#849ea7");
        gradient.addColorStop(0.45, "#5a7178");
        gradient.addColorStop(1, "#344849");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        if (style === 1) {
          ctx.fillStyle = "rgba(204,211,192,.39)";
          ctx.fillRect(0, 0, 128, 84);
          for (let y = 4; y < 84; y += 5) {
            ctx.fillStyle = "rgba(25,40,39,.12)";
            ctx.fillRect(0, y, 128, 1);
          }
        }
        if (style === 2) {
          ctx.fillStyle = "rgba(217,208,180,.5)";
          ctx.fillRect(0, 0, 29, 128);
          ctx.fillRect(104, 0, 24, 128);
          ctx.fillStyle = "rgba(46,44,35,.1)";
          for (let x = 0; x < 28; x += 7) ctx.fillRect(x, 0, 2, 128);
        }
        ctx.fillStyle = "rgba(227,237,234,.12)";
        ctx.fillRect(4, 0, 3, 128);
      });
      // The texture already contains its tint; multiplying the fallback swatch
      // made every window much darker than the photographed daylight glass.
      if (m.diffuseTexture) m.diffuseColor.setAll(1);
      if (lit) {
        // Interior light is added after the blue glass albedo; otherwise warm
        // light is multiplied by blue and incorrectly becomes green/gray.
        m.useEmissiveAsIllumination = true;
        m.emissiveTexture = canvasTexture(
          scene,
          "simulated occupied window",
          64,
          64,
          (ctx) => {
            ctx.fillStyle = "#d9b782";
            ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = "#6d6044";
            ctx.fillRect(7, 27, 12, 37);
            ctx.fillRect(42, 42, 13, 22);
          },
        );
        if (m.emissiveTexture) m.emissiveTexture.level = 0;
        m.metadata = { nightWindows: true, simulatedOccupancy: true };
      }
      m.metadata = {
        ...m.metadata,
        exteriorOnlyGlass: true,
        windowStyle: style === 0 ? "clear" : style === 1 ? "blinds" : "curtain",
      };
      glass.push(m);
    }
  const far = (type: string) => {
    const m = solid("far " + type, "#d7d5c8");
    const end = type === "end",
      low = type === "low",
      cell = type === "cell";
    m.diffuseTexture = canvasTexture(
      scene,
      "interpreted facade " + type,
      512,
      512,
      (ctx) => {
        ctx.fillStyle = end ? "#93958b" : "#d9d7c9";
        ctx.fillRect(0, 0, 512, 512);
        for (let row = 0; row < 4; row++)
          for (let col = 0; col < (end ? 1 : 4); col++) {
            const x = end ? 348 : col * 128 + 18,
              y = row * 128 + (low ? 27 : 30),
              w = low ? 53 : end ? 23 : 92,
              h = low ? 78 : end ? 33 : 64;
            if (end) {
              ctx.fillStyle = "#59646a";
              ctx.fillRect(236, y + 8, 62, 26);
            }
            ctx.fillStyle = "#77796b";
            ctx.fillRect(x - 4, y - 4, w + 8, h + 9);
            ctx.fillStyle = "#5f4938";
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = (row + col) % 3 ? "#647a7d" : "#8a9a97";
            ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
            ctx.fillStyle = "#5f4938";
            for (
              let pane = 1;
              pane < (low ? 1 : end ? 1 : cell ? 3 : 4);
              pane++
            )
              ctx.fillRect(x + (w * pane) / (cell ? 3 : 4) - 1, y, 2, h);
            if (low) ctx.fillRect(x, y + h * 0.61, w, 3);
            if (end) {
              ctx.fillStyle = "#5b4d3b";
              ctx.fillRect(x + 31, y, w, h);
              ctx.fillStyle = "#74878a";
              ctx.fillRect(x + 34, y + 3, w - 6, h - 6);
            }
            ctx.fillStyle = "#b9bdb2";
            ctx.fillRect(x - 3, y + h + 2, w + 6, 3);
            if (!end && !low) {
              ctx.fillStyle = "#bfc0b3";
              ctx.fillRect(col * 128, row * 128, 6, 128);
              ctx.fillStyle = "#ecebdd";
              ctx.fillRect(col * 128 + 6, row * 128, 3, 128);
            }
          }
      },
    );
    if (m.diffuseTexture) m.diffuseColor.setAll(1);
    m.emissiveTexture = canvasTexture(
      scene,
      "simulated distant occupied windows " + type,
      512,
      512,
      (ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 512, 512);
        if (end) return;
        for (let row = 0; row < 4; row++)
          for (let col = 0; col < 4; col++) {
            if ((row * 17 + col * 29) % 7 > 1) continue;
            const x = col * 128 + 21,
              y = row * 128 + (low ? 30 : 33),
              w = low ? 47 : 86,
              h = low ? 72 : 58;
            ctx.fillStyle = "#d5b583";
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = "#000";
            if (low) ctx.fillRect(x, y + h * 0.61, w, 3);
            else
              for (let pane = 1; pane < (cell ? 3 : 4); pane++)
                ctx.fillRect(x + (w * pane) / (cell ? 3 : 4) - 1, y, 2, h);
          }
      },
    );
    if (m.emissiveTexture) m.emissiveTexture.level = 0;
    m.useEmissiveAsIllumination = true;
    m.metadata = {
      photoInterpreted: true,
      nightWindows: true,
      simulatedOccupancy: true,
    };
    return m;
  };
  const b6Glass = glass.map((source, index) => {
    const material = source.clone(source.name + " B6 transparent room glass");
    // Babylon DynamicTexture.clone creates an empty canvas, not a pixel copy.
    // These immutable authored masks are intentionally shared between variants.
    if (
      material.diffuseTexture &&
      material.diffuseTexture !== source.diffuseTexture
    )
      material.diffuseTexture.dispose();
    if (
      material.emissiveTexture &&
      material.emissiveTexture !== source.emissiveTexture
    )
      material.emissiveTexture.dispose();
    material.diffuseTexture = source.diffuseTexture;
    material.emissiveTexture = source.emissiveTexture;
    material.alpha = index < 2 ? 0.32 : index < 4 ? 0.62 : 0.46;
    material.transparencyMode = 2;
    material.backFaceCulling = false;
    material.metadata = {
      ...source.metadata,
      realityGlass: true,
      exteriorOnlyGlass: false,
      block: 6,
      windowStyle: index < 2 ? "clear" : index < 4 ? "blinds" : "curtain",
    };
    return material;
  });
  const signs = new Map<string, StandardMaterial>();
  const sign = (text: string, blue = false) => {
    const key = text + blue;
    let material = signs.get(key);
    if (material) return material;
    material = solid("wall sign " + text, "#ffffff");
    material.diffuseTexture = canvasTexture(
      scene,
      "original lettering " + text,
      512,
      256,
      (ctx) => {
        ctx.fillStyle = blue ? "#175992" : "#93958b";
        ctx.fillRect(0, 0, 512, 256);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = text.length > 3 ? "bold 67px Arial" : "bold 200px Arial";
        ctx.fillStyle = "#f1f2e9";
        if (text.includes("\n")) {
          const lines = text.split("\n");
          ctx.fillText(lines[0], 256, 85);
          ctx.fillText(lines[1], 256, 177);
        } else ctx.fillText(text, 256, 137);
        if (blue && text.length < 3) {
          ctx.strokeStyle = "#e7e9de";
          ctx.lineWidth = 11;
          ctx.strokeRect(12, 12, 488, 232);
        }
      },
    );
    signs.set(key, material);
    return material;
  };
  const painted = solid("Potraviny painted east wall", "#ffffff");
  painted.diffuseTexture = canvasTexture(
    scene,
    "original painted-wall suggestion",
    512,
    512,
    (ctx) => {
      ctx.fillStyle = "#9baba7";
      ctx.fillRect(0, 0, 512, 512);
      // Broad original washes suggest a painted wall without copying the
      // reference mural, lettering or unidentified artist's artwork.
      for (const [color, points] of [
        [
          "#af9b72",
          [
            [0, 160],
            [140, 80],
            [370, 310],
            [512, 190],
            [512, 330],
            [220, 410],
          ],
        ],
        [
          "#7b939a",
          [
            [0, 80],
            [60, 30],
            [350, 430],
            [280, 450],
          ],
        ],
        [
          "#b3b5a4",
          [
            [80, 0],
            [145, 0],
            [400, 512],
            [330, 512],
          ],
        ],
      ] as const) {
        ctx.fillStyle = color;
        ctx.beginPath();
        points.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
        );
        ctx.closePath();
        ctx.fill();
      }
    },
  );
  return {
    plaster,
    concrete,
    roof,
    frame,
    sill,
    base,
    red,
    metal,
    cream,
    greyPanel,
    b4Frame,
    painted,
    glass,
    b6Glass,
    sign,
    far: {
      standard: far("standard"),
      cell: far("cell"),
      low: far("low"),
      end: far("end"),
    },
  };
}

/** Original batched geometry replaces legacy exterior skins. Do not overlay both. */
export function buildArchitectureReality(context: {
  scene: Scene;
  /** Return the complete foundation elevation once, including B6's interpreted
   * entrance rise when used. The renderer never adds a second hidden offset. */
  baseElevation?: (x: number, z: number, building: Building) => number;
  buildings?: Building[];
  /** Archive exporters inject the highest Blender kit. It is deliberately not
   * imported by the browser bundle; normal gameplay uses the near kit. */
  authoredDetail?: "near" | "highest";
  authoredWindowKit?: WindowModelKit;
  authoredMarketKit?: {
    parts: { materialRole: string; geometry: WindowModelGeometry }[];
  };
  authoredB4PanelKit?: {
    faces: Record<
      string,
      { parts: { materialRole: string; geometry: WindowModelGeometry }[] }
    >;
  };
}) {
  if (
    context.authoredDetail === "highest" &&
    context.authoredWindowKit?.level !== "highest"
  )
    throw new Error(
      "Highest architecture export requires the highest Blender window kit",
    );
  if (context.authoredDetail === "highest" && !context.authoredMarketKit)
    throw new Error(
      "Highest architecture export requires the highest Blender market kit",
    );
  if (context.authoredDetail === "highest" && !context.authoredB4PanelKit)
    throw new Error(
      "Highest architecture export requires the highest Blender B4 panel kit",
    );
  const { scene } = context,
    palette = createMaterials(scene),
    windowModels = createBuildingWindowModelCache(context.authoredWindowKit),
    assetRoots: TransformNode[] = [],
    lods: {
      near: Mesh[];
      far: Mesh[];
      center: Vec3;
      active: boolean;
      radius: number;
    }[] = [];
  let windows = 0,
    detailTriangles = 0,
    farTriangles = 0;
  const buildingList = context.buildings ?? BUILDINGS;
  for (const building of buildingList) {
    const catalog = buildingArchitecture(building),
      block = catalog?.block;
    const type =
      evidence.phenotypes.find((p) => p.osmId === building.id)?.type ??
      (catalog?.kind === "dormitory" ? "standard" : "unknown");
    const center = catalog?.footprint.center ?? {
      x: building.points.reduce((s, p) => s + p[0], 0) / building.points.length,
      z: building.points.reduce((s, p) => s + p[1], 0) / building.points.length,
    };
    const baseY = context.baseElevation?.(center.x, center.z, building) ?? 0;
    const assetRoot = getWorldAssetRoot(
      scene,
      osmAssetIdentity("building", "way", building.id),
      { ...center, y: baseY },
    );
    assetRoots.push(assetRoot);
    const buckets = new Map<Material, Batch>(),
      distant = new Map<Material, Batch>();
    const batch = (material: Material, far = false) => {
      const map = far ? distant : buckets;
      let b = map.get(material);
      if (!b) {
        b = new Batch(
          `reality ${building.id} ${far ? "far" : "near"} ${material.name}`,
          material,
        );
        map.set(material, b);
      }
      return b;
    };
    const edges =
      block === 6 ? b6ExteriorEdges() : architectureEdges(building.points);
    const point = (e: RealityEdge, u: number, v: number, depth = 0): Point => [
      e.a[0] + e.tx * u + e.nx * depth,
      baseY + v,
      e.a[1] + e.tz * u + e.nz * depth,
    ];
    const rect = (
      target: Batch,
      e: RealityEdge,
      u: number,
      v: number,
      w: number,
      h: number,
      depth = 0,
      normalized = false,
    ) => {
      if (w < 0.001 || h < 0.001) return;
      target.quad(
        point(e, u, v, depth),
        point(e, u + w, v, depth),
        point(e, u + w, v + h, depth),
        point(e, u, v + h, depth),
        [e.nx, 0, e.nz],
        // Polygon edge tangent runs screen-left when viewed from outside.
        // Flip normalized UVs so facade lettering is never mirrored.
        normalized ? [1, 0, 0, 1] : [u / 3, v / 3, (u + w) / 3, (v + h) / 3],
      );
    };
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const e = edges[edgeIndex],
        height = building.height;
      const photoFacade = block === 4 ? b4FacadePlan(e, height) : undefined;
      const concrete = !e.long && ["standard", "cell"].includes(type),
        material = photoFacade
          ? palette.greyPanel
          : concrete
            ? type === "cell" && e.length < 9
              ? palette.red
              : palette.concrete
            : type === "commercial" && e.nx > 0.8
              ? palette.painted
              : type === "canteen"
                ? palette.cream
                : palette.plaster;
      let opening = planFacadeOpenings(e, height, type, block);
      const typicalEntry = entryForFacade(building.id, e.a, e.b);
      const typicalEntranceFront = !!typicalEntry;
      if (typicalEntry && !photoFacade)
        opening = opening.filter(
          (w) =>
            w.v >=
            Math.max(
              4.6,
              typicalEntry.baseY + typicalEntry.rise + 2.65 - baseY,
            ),
        );
      // North reception face below the first slab is owned by interior/physics.
      const lobbyFront = block === 6 && isB6EntranceEdge(e);
      if (lobbyFront) opening = opening.filter((w) => w.v > 3);
      const bottom = lobbyFront ? 3 : 0;
      const coreBand =
        !photoFacade && concrete && e.length >= 9 && e.length <= 19
          ? { from: e.length * 0.49 - 1.2, to: e.length * 0.49 + 1.2 }
          : undefined;
      const wallRect = (u: number, v: number, w: number, h: number) => {
        if (!coreBand) {
          rect(batch(material), e, u, v, w, h);
          return;
        }
        const cuts = [u, coreBand.from, coreBand.to, u + w]
          .filter((x) => x >= u && x <= u + w)
          .sort((a, b) => a - b);
        for (let i = 0; i < cuts.length - 1; i++) {
          const a = cuts[i],
            b = cuts[i + 1],
            mid = (a + b) / 2;
          rect(
            batch(material),
            e,
            a,
            v,
            b - a,
            h,
            mid > coreBand.from && mid < coreBand.to ? -0.23 : 0,
          );
        }
      };
      if (photoFacade) {
        const kit = context.authoredB4PanelKit ?? b4Panels;
        const face = kit.faces[photoFacade.id as keyof typeof kit.faces];
        if (!face)
          throw new Error("Missing Blender B4 panel face: " + photoFacade.id);
        const { a, b } = photoFacade.anchor;
        const placement = {
          x: a[0],
          y: baseY,
          z: a[1],
          tx: (b[0] - a[0]) / photoFacade.width,
          tz: (b[1] - a[1]) / photoFacade.width,
          nx: e.nx,
          nz: e.nz,
        };
        for (const part of face.parts)
          appendBuildingDetailGeometry(
            batch(material),
            part.geometry,
            placement,
            undefined,
            FACADE_DEPTH.metresPerRepeat,
          );
      } else {
        // Split planes around each hole; there is no opaque backing wall at the glass.
        const ys = [
          ...new Set(
            [
              bottom,
              height,
              ...opening.flatMap((w) => [w.v, w.v + w.h]),
            ].filter((y) => y >= bottom && y <= height),
          ),
        ].sort((a, b) => a - b);
        for (let row = 0; row < ys.length - 1; row++) {
          const y0 = ys[row],
            y1 = ys[row + 1],
            mid = (y0 + y1) / 2;
          const rowWindows = opening
            .filter((w) => mid > w.v && mid < w.v + w.h)
            .sort((a, b) => a.u - b.u);
          let cursor = 0;
          for (const w of rowWindows) {
            wallRect(cursor, y0, w.u - cursor, y1 - y0);
            cursor = w.u + w.w;
          }
          wallRect(cursor, y0, e.length - cursor, y1 - y0);
        }
      }
      if (!lobbyFront) {
        const farMaterial =
          !photoFacade &&
          !typicalEntranceFront &&
          opening.length &&
          ["standard", "cell", "low"].includes(type)
            ? e.long
              ? type === "low"
                ? palette.far.low
                : type === "cell"
                  ? palette.far.cell
                  : palette.far.standard
              : palette.far.end
            : material;
        const f = batch(farMaterial, true),
          repeats = e.long
            ? e.length /
              ((type === "low" ? 2.65 : FACADE_DIMENSIONS.standard.bayPitch) *
                4)
            : 1;
        f.quad(
          point(e, 0, 0),
          point(e, e.length, 0),
          point(e, e.length, height),
          point(e, 0, height),
          [e.nx, 0, e.nz],
          [0, 0, repeats, height / 12],
        );
      } else rect(batch(material, true), e, 0, 3, e.length, height - 3);
      if (coreBand)
        for (const [u, sign] of [
          [coreBand.from, 1],
          [coreBand.to, -1],
        ])
          batch(material).quad(
            point(e, u, 0),
            point(e, u, height),
            point(e, u, height, -0.23),
            point(e, u, 0, -0.23),
            [e.tx * sign, 0, e.tz * sign],
          );
      for (let index = 0; index < opening.length; index++) {
        const w = opening[index],
          frontDepth = coreBand && w.style === "stair" ? -0.23 : 0,
          depth = (w.style === "room" ? 0.18 : 0.2) - frontDepth,
          frameWidth = BUILDING_WINDOW_KIT.construction.outerFrameWidth,
          frameMaterial = photoFacade
            ? palette.b4Frame
            : type === "commercial" || type === "canteen"
              ? palette.metal
              : palette.frame;
        const localDepth = w.style === "room" ? 0.18 : 0.2;
        const placement = {
          x: e.a[0] + e.tx * w.u + e.nx * frontDepth,
          y: baseY + w.v,
          z: e.a[1] + e.tz * w.u + e.nz * frontDepth,
          tx: e.tx,
          tz: e.tz,
          nx: e.nx,
          nz: e.nz,
        };
        for (const part of windowModels.get({ ...w, depth: localDepth }))
          appendBuildingDetailGeometry(
            batch(
              part.role === "reveal"
                ? material
                : part.role === "sill"
                  ? palette.sill
                  : frameMaterial,
            ),
            part,
            placement,
            part.role === "gasket" ? [0.22, 0.24, 0.22] : undefined,
            FACADE_DEPTH.metresPerRepeat,
          );
        const glassBack = -depth + FACADE_DEPTH.glassBack;
        const seed =
            (Number(building.id.slice(-4)) * 17 + edgeIndex * 71 + index * 43) %
            101,
          lit = w.style === "room" && seed < 30 ? 1 : 0,
          style = Math.floor(seed / 34);
        rect(
          batch(
            (block === 6 && w.style === "room"
              ? palette.b6Glass
              : palette.glass)[Math.min(2, style) * 2 + lit],
          ),
          e,
          w.u + frameWidth,
          w.v + frameWidth,
          w.w - frameWidth * 2,
          w.h - frameWidth * 2,
          glassBack,
          true,
        );
        if (photoFacade) {
          // The distant silhouette keeps this exact asymmetric source plan.
          // Flat patches share the building's material batches; no generic grid.
          rect(batch(frameMaterial, true), e, w.u, w.v, w.w, w.h, 0.006);
          rect(
            batch(palette.glass[Math.min(2, style) * 2 + lit], true),
            e,
            w.u + frameWidth,
            w.v + frameWidth,
            w.w - frameWidth * 2,
            w.h - frameWidth * 2,
            0.008,
            true,
          );
          for (let pane = 1; pane < w.panes; pane++)
            rect(
              batch(frameMaterial, true),
              e,
              w.u + (w.w * pane) / w.panes - 0.018,
              w.v,
              0.036,
              w.h,
              0.009,
            );
        }
        if (type === "commercial" || type === "canteen")
          rect(
            batch(palette.glass[Math.min(2, style) * 2], true),
            e,
            w.u,
            w.v,
            w.w,
            w.h,
            0.008,
            true,
          );
        if (type === "commercial") {
          for (let i = 1; i < 4; i++)
            rect(
              batch(palette.metal),
              e,
              w.u + (w.w * i) / 4 - 0.012,
              w.v,
              0.024,
              w.h,
              0.01,
            );
          rect(
            batch(palette.metal),
            e,
            w.u,
            w.v + w.h * 0.52,
            w.w,
            0.025,
            0.012,
          );
        }
        windows++;
      }
      if (
        building.id === marketDetails.placement.buildingId &&
        e.nx > 0.8 &&
        e.length > 12
      ) {
        // Source-identified metalwork replaces the old cylinder in both LODs.
        // Its entire silhouette remains inside the same collision footprint.
        const u = e.length * marketDetails.placement.alongFraction;
        const placement = {
          x: e.a[0] + e.tx * u + e.nx * marketDetails.placement.outwardOffset,
          y: baseY,
          z: e.a[1] + e.tz * u + e.nz * marketDetails.placement.outwardOffset,
          tx: e.tx,
          tz: e.tz,
          nx: e.nx,
          nz: e.nz,
        };
        for (const far of [false, true]) {
          const kit = far
            ? marketDetails.kits.flue.far
            : (context.authoredMarketKit ?? marketDetails.kits.flue.near);
          for (const part of kit.parts)
            appendBuildingDetailGeometry(
              batch(palette.metal, far),
              part.geometry,
              placement,
              part.materialRole === "darkMetal" ? [0.4, 0.39, 0.38] : undefined,
            );
        }
      }
      if (
        !photoFacade &&
        e.long &&
        opening.some((w) => w.style === "room") &&
        type !== "low"
      ) {
        const pitch =
          e.length /
          Math.max(
            1,
            Math.round(e.length / FACADE_DIMENSIONS.standard.bayPitch),
          );
        const pilasters =
          block === 6 && Math.abs(e.tz) > 0.9
            ? Array.from(
                { length: 23 },
                (_, i) => (-90 + (i * 70) / 22 - e.a[1]) / e.tz,
              ).filter((u) => u >= 0 && u <= e.length)
            : Array.from(
                { length: Math.floor(e.length / pitch) + 1 },
                (_, i) => i * pitch,
              );
        for (const x of pilasters) {
          const width = Math.min(0.18, e.length - x);
          if (width < 0.01) continue;
          rect(batch(palette.plaster), e, x, 0, width, height, 0.075);
          const plaster = batch(palette.plaster);
          plaster.surface(
            point(e, x + width, 0),
            point(e, x + width, 0, 0.075),
            point(e, x + width, height, 0.075),
            point(e, x + width, height),
            [e.tx, 0, e.tz],
          );
          plaster.surface(
            point(e, x, 0, 0.075),
            point(e, x, 0),
            point(e, x, height),
            point(e, x, height, 0.075),
            [-e.tx, 0, -e.tz],
          );
          plaster.surface(
            point(e, x, height),
            point(e, x + width, height),
            point(e, x + width, height, 0.075),
            point(e, x, height, 0.075),
            [0, 1, 0],
          );
        }
      }
      // Foot/base and roof cap follow each original edge; no random balconies.
      batch(palette.sill).surface(
        point(e, 0, height),
        point(e, e.length, height),
        point(e, e.length, height, 0.03),
        point(e, 0, height, 0.03),
        [0, 1, 0],
      );
      for (const far of [false, true]) {
        if (lobbyFront) {
          const from = (B6_ENTRY_REFERENCE.passage.fromX - e.a[0]) / e.tx;
          const to = (B6_ENTRY_REFERENCE.passage.toX - e.a[0]) / e.tx;
          rect(
            batch(palette.base, far),
            e,
            0,
            0,
            Math.min(from, to),
            0.36,
            0.004,
          );
          rect(
            batch(palette.base, far),
            e,
            Math.max(from, to),
            0,
            e.length - Math.max(from, to),
            0.36,
            0.004,
          );
        } else rect(batch(palette.base, far), e, 0, 0, e.length, 0.36, 0.004);
        rect(
          batch(palette.sill, far),
          e,
          0,
          height - 0.11,
          e.length,
          0.11,
          0.03,
        );
      }
      if (
        block &&
        block !== 6 &&
        !photoFacade?.suppressGenericSign &&
        !e.long &&
        e.length >= 9 &&
        e.length <= 19 &&
        (e.nz < -0.8 || (block === 7 && e.nz > 0.8))
      ) {
        const blue = block === 4 || block === 7;
        for (const far of [false, true])
          rect(
            batch(palette.sign(String(block), blue), far),
            e,
            e.length * 0.23,
            height * 0.47,
            blue ? 1.25 : 0.9,
            blue ? 0.85 : 1.15,
            0.025,
            true,
          );
      }
      if (block === 6 && e.nz < -0.8 && e.length > 5 && e.length < 9)
        for (const far of [false, true])
          rect(
            batch(palette.sign("6"), far),
            e,
            e.length * 0.25,
            10.6,
            0.9,
            1.15,
            0.025,
            true,
          );
      if (type === "canteen" && e.nz < -0.8 && e.length > 12) {
        for (const far of [false, true])
          rect(
            batch(palette.metal, far),
            e,
            0,
            height - 1.85,
            e.length * 0.74,
            1.74,
            0.012,
          );
        for (const far of [false, true])
          rect(
            batch(palette.sign("MENZA\nSTRAHOV", true), far),
            e,
            e.length * 0.74,
            3.1,
            Math.min(4.1, e.length * 0.2),
            1.65,
            0.025,
            true,
          );
      }
    }
    if (block === 6) {
      const e = edges.find(isB6EntranceEdge)!;
      // North-facing frames leave the shared 2.4 m gameplay opening free.
      const passage = B6_ENTRY_REFERENCE.passage;
      for (const far of [false, true]) {
        for (const [x, sign] of [
          [passage.fromX, -1],
          [passage.toX, 1],
        ]) {
          const u = (x - e.a[0]) / e.tx;
          rect(
            batch(palette.metal, far),
            e,
            u + sign * 0.045 - 0.045,
            0,
            0.09,
            B6_LAYOUT.doorHeight,
            0.015,
          );
        }
        rect(
          batch(palette.metal, far),
          e,
          0,
          B6_LAYOUT.doorHeight,
          e.length,
          0.15,
          0.018,
        );
        rect(
          batch(palette.sign("BLOK 6", true), far),
          e,
          (B6_LAYOUT.entry.x - e.a[0]) / e.tx - 1.25,
          2.35,
          2.5,
          0.48,
          0.025,
          true,
        );
      }
    }
    if (block === 7) {
      const east = edges
        .filter((e) => e.nx > 0.8 && e.long)
        .sort((a, b) => b.length - a.length)[0];
      if (east) {
        const entry = LANDMARK_ENTRANCES.find((p) => p.id === "seven-club")!,
          u = Math.max(
            0.3,
            Math.min(
              east.length - 2.5,
              (entry.x - east.a[0]) * east.tx + (entry.z - east.a[1]) * east.tz,
            ),
          );
        for (const far of [false, true]) {
          rect(batch(palette.frame, far), east, u, 0.36, 2.3, 2.03, 0.007);
          rect(
            batch(palette.sign("KLUB 007", true), far),
            east,
            u,
            2.4,
            2.3,
            0.48,
            0.025,
            true,
          );
        }
      }
    }
    const sharedRoof = buildingRoofGeometry(building, baseY);
    if (sharedRoof) {
      const p = sharedRoof.points;
      const triangles = sharedRoof.triangles;
      for (const far of [false, true]) {
        const target = batch(palette.roof, far);
        for (let i = 0; i < triangles.length; i += 3) {
          const a = p[triangles[i]],
            b = p[triangles[i + 1]],
            c = p[triangles[i + 2]];
          // Degenerate fourth corner maintains the same batched format.
          target.quad(
            [a[0], sharedRoof.y, a[1]],
            [b[0], sharedRoof.y, b[1]],
            [c[0], sharedRoof.y, c[1]],
            [c[0], sharedRoof.y, c[1]],
            [0, 1, 0],
            [a[0] / 4, a[1] / 4, c[0] / 4, c[1] / 4],
          );
        }
      }
    }
    const near = [...buckets.values()].flatMap((b) => {
      const mesh = b.mesh(scene);
      if (mesh) {
        mesh.metadata = {
          sourcePack: "architecture-reality",
          lod: "near",
          sourceMeasured: false,
        };
        attachWorldAssetNode(mesh, assetRoot);
      }
      detailTriangles += b.indices.length / 3;
      return mesh ? [mesh] : [];
    });
    const far = [...distant.values()].flatMap((b) => {
      const mesh = b.mesh(scene);
      if (mesh) {
        mesh.metadata = {
          sourcePack: "architecture-reality",
          lod: "far",
          sourceMeasured: false,
        };
        attachWorldAssetNode(mesh, assetRoot);
      }
      farTriangles += b.indices.length / 3;
      return mesh ? [mesh] : [];
    });
    const active = block === 6;
    for (const mesh of near) mesh.setEnabled(active);
    for (const mesh of far) mesh.setEnabled(!active);
    lods.push({
      near,
      far,
      center: { ...center, y: baseY },
      active,
      radius: Math.min(
        48,
        Math.max(
          catalog?.footprint.width ?? 20,
          catalog?.footprint.depth ?? 20,
        ) / 2,
      ),
    });
  }
  windowModels.clear();
  return {
    assetRoots,
    metrics: {
      buildings: buildingList.length,
      windows,
      detailTriangles,
      farTriangles,
      source: "shared/data/facade-reality.json",
      windowModelSource: "shared/data/building-window-kit.json",
      marketModelSource: "shared/data/market-detail-kit.json",
      b4PanelModelSource: "shared/data/b4-panel-kit.json",
      authoredDetail: context.authoredDetail ?? "near",
      measured: false,
    },
    /** Call each frame (internally inexpensive); hysteresis prevents facade popping. */
    update(
      position: Pick<Vec3, "x" | "z">,
      quality: "low" | "medium" | "high" = "low",
    ) {
      const distance = renderBudget(quality).architectureDetailMetres;
      for (const lod of lods) {
        const d =
          Math.hypot(position.x - lod.center.x, position.z - lod.center.z) -
          lod.radius;
        const active = d < distance + (lod.active ? 9 : 0);
        if (active === lod.active) continue;
        lod.active = active;
        for (const mesh of lod.near) mesh.setEnabled(active);
        for (const mesh of lod.far) mesh.setEnabled(!active);
      }
    },
    dispose() {
      for (const lod of lods)
        for (const mesh of [...lod.near, ...lod.far]) mesh.dispose();
      disposeEmptyWorldAssetRoots(assetRoots);
    },
  };
}

/** B6 currently uses a documented schematic traversable shell, not rotated OSM. */
export function b6ExteriorEdges(): RealityEdge[] {
  const body = B6_LAYOUT.bounds,
    lobby = B6_LAYOUT.lobby;
  const edges = architectureEdges([
    [body.minX, body.minZ],
    [body.maxX, body.minZ],
    [body.maxX, body.maxZ],
    [body.minX, body.maxZ],
    [body.minX, lobby.maxZ],
    [lobby.minX, lobby.maxZ],
    [lobby.minX, lobby.minZ],
    [body.minX, lobby.minZ],
    [body.minX, body.minZ],
  ]);
  // The old boxes have a 0.35 m wall centred on these coordinates.
  return edges.map((e) => ({
    ...e,
    a: [e.a[0] + e.nx * 0.175, e.a[1] + e.nz * 0.175],
    b: [e.b[0] + e.nx * 0.175, e.b[1] + e.nz * 0.175],
  }));
}

function isB6EntranceEdge(edge: RealityEdge): boolean {
  return (
    edge.nz < -0.8 &&
    edge.a[0] < 0 &&
    edge.b[0] <= 0 &&
    Math.abs(edge.a[1] - (B6_LAYOUT.lobby.minZ - 0.175)) < 0.01
  );
}
