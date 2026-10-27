import type { Vec3 } from "../shared/types";
import type { TreePilotOptions } from "../shared/tree-asset-types";

export const TERRAIN_REVIEW_QUERY = "terrainReview";
export type TerrainReviewId =
  | "b6-rear-path"
  | "b6-front-lawn"
  | "osm-grass-control"
  | "b6-far-context"
  | "b6-tree-near"
  | "b5-tree-near"
  | "b5-tree-mid"
  | "b5-tree-far"
  | "b5-tree-ground"
  | "b5-tree-hero"
  | "small-tree-close"
  | "b6-tree-far-upper";
export type TerrainReviewPreset = Readonly<{
  id: TerrainReviewId;
  label: Readonly<{ cs: string; en: string }>;
  spawnXZ: readonly [number, number];
  lookAtXZ: readonly [number, number];
  /** Metres above the same sampled terrain as the source root. */
  targetHeight?: number;
  sourceTreeId?: "ipr-crown-014" | "ipr-b6-north-conifer" | "4314257232";
  source: string;
}>;

function preset(value: TerrainReviewPreset): TerrainReviewPreset {
  Object.freeze(value.label);
  Object.freeze(value.spawnXZ);
  Object.freeze(value.lookAtXZ);
  return Object.freeze(value);
}

/** Camera positions are authored inspection choices, not surveyed locations.
 * Surface evidence: docs/terrain/20261025/research.md. No source-photo pixels
 * or arbitrary URL coordinates are included in these local QA starts. */
export const TERRAIN_REVIEW_PRESETS: Readonly<Record<TerrainReviewId, TerrainReviewPreset>> = Object.freeze({
  "b6-rear-path": preset({
    id: "b6-rear-path", label: { cs: "B6 · zadní pěšina", en: "B6 · rear path" },
    spawnXZ: [36, -64], lookAtXZ: [29.24, -64],
    source: "User B6 rear reference (capture date unknown); IPR 2024-06-08; OSM dirt path 25920436",
  }),
  "b6-front-lawn": preset({
    id: "b6-front-lawn", label: { cs: "B6 · přední trávník", en: "B6 · front lawn" },
    spawnXZ: [-14, -64], lookAtXZ: [-13, -59],
    source: "User B6 front reference (capture date unknown); IPR 2024-06-08",
  }),
  "osm-grass-control": preset({
    id: "osm-grass-control", label: { cs: "Mapovaný trávník · kontrola", en: "Mapped lawn · control" },
    spawnXZ: [-103, -65], lookAtXZ: [-100, -60],
    source: "Archived OSM grass polygon 1059554109; IPR 2024-06-08",
  }),
  "b6-far-context": preset({
    id: "b6-far-context", label: { cs: "B6 · vzdálenější pohled", en: "B6 · distant view" },
    spawnXZ: [40, -75], lookAtXZ: [28, -32],
    source: "B6 east lawn and paths, IPR 2024-06-08; authored distant inspection view",
  }),
  "b6-tree-near": preset({
    id: "b6-tree-near", label: { cs: "B6 · koruna jehličnanu zblízka", en: "B6 · conifer crown close view" },
    spawnXZ: [-14, -61], lookAtXZ: [-10.5, -76.5], targetHeight: 6, sourceTreeId: "ipr-b6-north-conifer",
    source: "shared/data/cad-buildings/b06-tree-placement.json; reference-interpreted source ipr-b6-north-conifer; authored crown inspection camera",
  }),
  "b5-tree-near": preset({
    id: "b5-tree-near", label: { cs: "B5 · koruna listnáče zblízka", en: "B5 · broadleaf crown close view" },
    spawnXZ: [-85, -61], lookAtXZ: [-67.59, -60.96], targetHeight: 7, sourceTreeId: "ipr-crown-014",
    source: "shared/data/tree-reconstruction.json; IPR 2023/2024 source ipr-crown-014; authored crown inspection camera",
  }),
  "b5-tree-mid": preset({
    id: "b5-tree-mid", label: { cs: "B5 · koruna listnáče LOD 1", en: "B5 · broadleaf crown LOD 1" },
    spawnXZ: [-115, -61], lookAtXZ: [-67.59, -60.96], targetHeight: 7, sourceTreeId: "ipr-crown-014",
    source: "shared/data/tree-reconstruction.json; IPR 2023/2024 source ipr-crown-014; authored static LOD 1 inspection camera",
  }),
  "b5-tree-far": preset({
    id: "b5-tree-far", label: { cs: "B5 · vzdálená koruna LOD 2", en: "B5 · distant crown LOD 2" },
    spawnXZ: [-170.5, -202.5], lookAtXZ: [-67.59, -60.96], targetHeight: 7, sourceTreeId: "ipr-crown-014",
    source: "IPR 2023/2024 source ipr-crown-014; OSM asphalt service 1214796112; authored static LOD 2 view outside the stadium footprint",
  }),
  "b5-tree-ground": preset({
    id: "b5-tree-ground", label: { cs: "B5 · listí na zemi", en: "B5 · fallen leaves" },
    spawnXZ: [-85, -61], lookAtXZ: [-67.59, -60.96], targetHeight: .05, sourceTreeId: "ipr-crown-014",
    source: "IPR 2023/2024 source ipr-crown-014; same validated near station, authored ground-level litter inspection",
  }),
  "b5-tree-hero": preset({
    id: "b5-tree-hero", label: { cs: "B5 · detail listů a větví", en: "B5 · leaf and branch detail" },
    spawnXZ: [-73.6, -61], lookAtXZ: [-67.59, -60.96], targetHeight: 5.5, sourceTreeId: "ipr-crown-014",
    source: "IPR 2023/2024 source ipr-crown-014; OSM grass 1059554109 beside footway 55830418; authored ground-based hero inspection",
  }),
  "small-tree-close": preset({
    id: "small-tree-close", label: { cs: "Malý listnáč · pohled zblízka", en: "Small broadleaf · close view" },
    spawnXZ: [-65.87, 258.62], lookAtXZ: [-58.97, 258.45], targetHeight: 2.6, sourceTreeId: "4314257232",
    source: "Source tree 4314257232; OSM footway 432351715; authored ground-based view of the complete catalogue tree",
  }),
  "b6-tree-far-upper": preset({
    id: "b6-tree-far-upper", label: { cs: "B6 · vzdálená horní koruna jehličnanu", en: "B6 · distant conifer upper crown" },
    spawnXZ: [-70.914, 121.584], lookAtXZ: [-10.5, -76.5], targetHeight: 9.5, sourceTreeId: "ipr-b6-north-conifer",
    source: "OSM node 7725186095, footway 25920429 / sidewalk 827456376; reference-interpreted B6 conifer; upper-crown context, foreground canopy edges may overlap",
  }),
});

/** An absent, duplicate, unknown, remote or multiplayer request is inert. */
export function resolveTerrainReview(
  location: Pick<Location, "hostname" | "search">,
  network: boolean,
): TerrainReviewPreset | null {
  if (network || !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) return null;
  const values = new URLSearchParams(location.search).getAll(TERRAIN_REVIEW_QUERY);
  if (values.length !== 1 || !Object.hasOwn(TERRAIN_REVIEW_PRESETS, values[0])) return null;
  return TERRAIN_REVIEW_PRESETS[values[0] as TerrainReviewId];
}

const TREE_PILOTS: Readonly<Record<"own" | "mtree", TreePilotOptions>> = Object.freeze({
  own: Object.freeze({ manifestUrl: "/models/vegetation/seasonal-r6-far/runtime-contract.json", selections: Object.freeze({
    "ipr-crown-014": "own-broadleaf", "ipr-b6-north-conifer": "own-conifer",
  }) }),
  mtree: Object.freeze({ manifestUrl: "/models/vegetation/seasonal-streamed/runtime-contract.json", selections: Object.freeze({
    "ipr-crown-014": "mtree-broadleaf", "ipr-b6-north-conifer": "mtree-conifer",
  }) }),
});

/** Only a valid local static guest view can select one immutable pilot pair.
 * Other query fields never become model URLs, source IDs or coordinates. */
export function resolveTreePilot(location: Pick<Location, "hostname" | "search">, network: boolean): TreePilotOptions | undefined {
  const view = resolveTerrainReview(location, network);
  if (!view) return undefined;
  const values = new URLSearchParams(location.search).getAll("treePilot");
  if (values.length !== 1 || !Object.hasOwn(TREE_PILOTS, values[0])) return undefined;
  const selected = TREE_PILOTS[values[0] as "own" | "mtree"];
  // A two-source comparison must not silently leave a catalogue-only target
  // on legacy geometry while its view appears to claim the selected pilot.
  if (view.sourceTreeId && !Object.hasOwn(selected.selections, view.sourceTreeId)) return undefined;
  return selected;
}

/** The same nominal-ground start clearance as ordinary SPAWN. The actual
 * Actor settles through its normal idle physics; no post-add correction or
 * alternate controller is performed. eyeAboveGround comes from its real skin
 * and the selected avatar's eye height, matching Game.updateCameraFollow. */
export function terrainReviewPose(
  view: TerrainReviewPreset,
  surfaceHeight: (x: number, z: number) => number,
  eyeAboveGround = 1.65,
) {
  const [x, z] = view.spawnXZ, [tx, tz] = view.lookAtXZ;
  const targetHeight = view.targetHeight ?? .05;
  const ground = surfaceHeight(x, z), targetY = surfaceHeight(tx, tz) + targetHeight;
  const distance = Math.hypot(tx - x, tz - z);
  if (![x, z, tx, tz, ground, targetY, eyeAboveGround, distance].every(Number.isFinite) ||
      distance < 0.1 || eyeAboveGround <= 0 || targetHeight < 0 || targetHeight > 100) throw new Error("Invalid terrain review pose/support");
  return {
    position: { x, y: ground + 1, z } satisfies Vec3,
    yaw: Math.atan2(tx - x, tz - z),
    // First-person pitch is a slope, not an angle.
    pitch: (ground + eyeAboveGround - targetY) / distance,
  };
}

/** Detached evidence cannot be changed by a later Game or UI lifecycle. */
export function terrainReviewIdentity(view: TerrainReviewPreset | null) {
  return view ? {
    version: 1 as const, id: view.id, scope: "static-guest-start" as const,
    spawnXZ: [...view.spawnXZ], lookAtXZ: [...view.lookAtXZ], source: view.source,
    ...(view.targetHeight === undefined ? {} : { targetHeight: view.targetHeight }),
    ...(view.sourceTreeId === undefined ? {} : { sourceTreeId: view.sourceTreeId }),
  } : null;
}
