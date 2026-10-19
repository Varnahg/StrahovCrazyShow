/** Local dither transitions keep one geometry/draw per tile. The replacement
 * becomes active only after the previous representation reaches zero. */
export const GRASS_FADE_SECONDS = 0.15;
export type GrassFade = { from: number; to: number; startedAt: number };

export function grassVisibility(fade: GrassFade, time: number): number {
  const progress = Math.max(
    0,
    Math.min(1, (time - fade.startedAt) / GRASS_FADE_SECONDS),
  );
  return (
    fade.from + (fade.to - fade.from) * progress * progress * (3 - 2 * progress)
  );
}

export function setGrassVisibility(
  fade: GrassFade,
  target: 0 | 1,
  time: number,
) {
  if (fade.to === target) return;
  fade.from = grassVisibility(fade, time);
  fade.to = target;
  fade.startedAt = time;
}
