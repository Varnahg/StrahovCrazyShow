import type { Vec3 } from "../shared/types";

export const TERRAIN_REVIEW_QUERY = "terrainReview";
export type TerrainReviewId =
  | "b6-rear-path"
  | "b6-front-lawn"
  | "osm-grass-control"
  | "b6-far-context";
export type TerrainReviewPreset = Readonly<{
  id: TerrainReviewId;
  label: Readonly<{ cs: string; en: string }>;
  spawnXZ: readonly [number, number];
  lookAtXZ: readonly [number, number];
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
 * or arbitrary URL coordinates are included in these four local QA starts. */
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
  const ground = surfaceHeight(x, z), targetY = surfaceHeight(tx, tz) + 0.05;
  const distance = Math.hypot(tx - x, tz - z);
  if (![x, z, tx, tz, ground, targetY, eyeAboveGround, distance].every(Number.isFinite) ||
      distance < 0.1 || eyeAboveGround <= 0) throw new Error("Invalid terrain review pose/support");
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
  } : null;
}
