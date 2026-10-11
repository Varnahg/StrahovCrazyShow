import { DEFAULT_AVATAR, INTERESTS, type Profile, type Input } from "./types";
import { canonicalInput } from "./netcode";
export function cleanText(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : "";
}
export function sanitizeProfile(raw: any): Profile {
  const a = raw?.avatar ?? {};
  const color = (v: unknown, f: string) =>
    typeof v === "string" && /^#[\da-f]{6}$/i.test(v) ? v : f;
  return {
    nickname: cleanText(raw?.nickname, 24) || "Návštěvník",
    avatar: {
      preset: Math.max(0, Math.min(5, Math.floor(Number(a.preset) || 0))),
      skin: color(a.skin, DEFAULT_AVATAR.skin),
      hair: color(a.hair, DEFAULT_AVATAR.hair),
      shirt: color(a.shirt, DEFAULT_AVATAR.shirt),
      trousers: color(a.trousers, DEFAULT_AVATAR.trousers),
      glasses: !!a.glasses,
      beard: !!a.beard,
      face: Math.max(0, Math.min(1, Number(a.face) || 0)),
      badge: [
        "Průzkumník kopce",
        "Kvízový nadšenec",
        "Strahovský kurýr",
      ].includes(a.badge)
        ? a.badge
        : "",
    },
    interests: INTERESTS.filter(
      (x) => Array.isArray(raw?.interests) && raw.interests.includes(x),
    ),
    social: raw?.social === true,
    firstTime: raw?.firstTime === true,
  };
}
export function sanitizeInput(raw: any): Input | null {
  return canonicalInput(raw);
}
