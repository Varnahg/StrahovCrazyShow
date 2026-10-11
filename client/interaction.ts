import type { Vec3 } from "../shared/types";

export type WorldSelection = { kind: "player" | "place" | "hunt"; id: string };
export type PickTarget = WorldSelection & {
  feet: Vec3;
  height: number;
  radius: number;
};
export const EMOTES = [
  { emoji: "👋", label: "Pozdravit", key: "1" },
  { emoji: "❤️", label: "Poslat srdce", key: "2" },
  { emoji: "🎉", label: "Radovat se", key: "3" },
  { emoji: "👍", label: "Pochválit", key: "4" },
] as const;

/** Keyboard policy is shared by the world and modal shortcuts. */
export function textEntryTarget(target: EventTarget | null): boolean {
  return (
    typeof (target as Element | null)?.closest === "function" &&
    !!(target as Element).closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
    )
  );
}
export function worldKeyboardAllowed(options: {
  textEntry: boolean;
  modal: boolean;
  mapFocused: boolean;
}) {
  return !options.textEntry && !options.modal && !options.mapFocused;
}
export const POINTER_CLICK_SLOP = 5;
/** A short left press selects; dragging either main button orbits the camera. */
export function pointerOrbits(button: number, distance: number) {
  return button === 2 || (button === 0 && distance > POINTER_CLICK_SLOP);
}

function sphereDistance(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
) {
  const x = origin.x - center.x,
    y = origin.y - center.y,
    z = origin.z - center.z;
  const b = x * direction.x + y * direction.y + z * direction.z,
    c = x * x + y * y + z * z - radius * radius;
  if (c <= 0) return 0;
  const d = b * b - c;
  return d >= 0 && -b - Math.sqrt(d) >= 0 ? -b - Math.sqrt(d) : Infinity;
}

/** Ray/vertical capsule at the rendered position, independent of rig LOD/parts. */
export function capsuleRayDistance(
  origin: Vec3,
  direction: Vec3,
  target: PickTarget,
) {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-9) return Infinity;
  const d = {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
  const r = target.radius,
    low = target.feet.y + r,
    high = Math.max(low, target.feet.y + target.height - r);
  let distance = Math.min(
    sphereDistance(origin, d, { ...target.feet, y: low }, r),
    sphereDistance(origin, d, { ...target.feet, y: high }, r),
  );
  const x = origin.x - target.feet.x,
    z = origin.z - target.feet.z,
    a = d.x * d.x + d.z * d.z,
    b = x * d.x + z * d.z,
    c = x * x + z * z - r * r;
  if (c <= 0 && origin.y >= low && origin.y <= high) return 0;
  const discriminant = b * b - a * c;
  if (a > 1e-9 && discriminant >= 0) {
    const t = (-b - Math.sqrt(discriminant)) / a,
      y = origin.y + t * d.y;
    if (t >= 0 && y >= low && y <= high) distance = Math.min(distance, t);
  }
  return distance;
}

/** A selection never sends an action. Occlusion is checked at the ray hit. */
export function pickWorldTarget(
  origin: Vec3,
  direction: Vec3,
  targets: Iterable<PickTarget>,
  visible: (point: Vec3) => boolean,
  maxDistance = 65,
): WorldSelection | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-9) return null;
  let best: WorldSelection | null = null,
    bestDistance = maxDistance;
  for (const target of targets) {
    const distance = capsuleRayDistance(origin, direction, target);
    if (distance >= bestDistance) continue;
    const point = {
      x: origin.x + (direction.x / length) * distance,
      y: origin.y + (direction.y / length) * distance,
      z: origin.z + (direction.z / length) * distance,
    };
    if (!visible(point)) continue;
    best = { kind: target.kind, id: target.id };
    bestDistance = distance;
  }
  return best;
}

export type MapPlaceLike = { id: string; name: string; x: number; z: number };
/** Pixel distance, rather than map metres, keeps overlapping markers usable at every zoom. */
export function clusterMapPlaces<T extends MapPlaceLike>(
  places: readonly T[],
  scale: number,
  radiusPixels = 23,
): { id: string; x: number; z: number; places: T[] }[] {
  const groups: { id: string; x: number; z: number; places: T[] }[] = [];
  for (const place of [...places].sort((a, b) => a.id.localeCompare(b.id))) {
    const existing = groups.find(
      (group) =>
        Math.hypot(group.x - place.x, group.z - place.z) * scale < radiusPixels,
    );
    if (existing) {
      existing.places.push(place);
      const n = existing.places.length;
      existing.x += (place.x - existing.x) / n;
      existing.z += (place.z - existing.z) / n;
    } else
      groups.push({ id: place.id, x: place.x, z: place.z, places: [place] });
  }
  return groups;
}
