import parameters from "./data/tree-phenology.json";

export const TREE_FAMILIES = ["deciduous-broadleaf", "evergreen-conifer", "deciduous-conifer", "reference-bare"] as const;
export type TreeFamily = typeof TREE_FAMILIES[number];
export type TreeSeasonSource = "regional-model" | "demo";
export type TreePhenology = Readonly<{
  leafAmount: number;
  maturity: number;
  senescence: number;
  /** Relative available litter source, not measured ground coverage. */
  litterPotential: number;
}>;
export type TreeSeasonState = Readonly<{
  model: string;
  source: TreeSeasonSource;
  /** The explicit UTC minute sample, not a replacement astronomy timestamp. */
  sampledAt: number;
  revision: number;
  year: number;
  /** Fractional UTC Gregorian year normalized to [0,365). */
  phaseDay: number;
  groups: Readonly<Record<TreeFamily, TreePhenology>>;
  ground: Readonly<{
    provenance: "authored-seasonal-model";
    flowerBloom: number;
    litterRetention: number;
  }>;
}>;

const MINUTE = 60_000, DAY = 86_400_000, MAX_DATE = 8.64e15;
const PERIOD = parameters.periodDays, art = parameters.art;
export const TREE_SEASON_CACHE_LIMIT = 8;
const cache = new Map<number, TreeSeasonState>();
// Only a finite set of family/offset slots per retained state. Weak ownership
// also lets evicted states disappear unless a consumer deliberately keeps one.
const profiles = new WeakMap<TreeSeasonState, (TreePhenology | undefined)[]>();
const calendar = new Date(0);
const bare: TreePhenology = Object.freeze({ leafAmount: 0, maturity: 0, senescence: 0, litterPotential: 0 });
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const wrap = (v: number) => ((v % PERIOD) + PERIOD) % PERIOD;
const leap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
function ramp(start: number, end: number, day: number) {
  const t = clamp((day - start) / (end - start));
  return t * t * (3 - 2 * t);
}
function window(day: number, points: readonly number[]) {
  return ramp(points[0], points[1], day) * (1 - ramp(points[2], points[3], day));
}
function tenth(day: number, start: number, end: number, lead: number) {
  return day < start ? .1 * ramp(start - lead, start, day) : .1 + .9 * ramp(start, end, day);
}
function sample(day: number, family: TreeFamily): TreePhenology {
  if (family === "reference-bare") return bare;
  if (family === "evergreen-conifer") {
    const spring = window(day, art.evergreenSpring), autumn = window(day, art.evergreenAutumn);
    return Object.freeze({ leafAmount: 1, maturity: 1 - art.evergreenMaturityDip * spring,
      senescence: art.evergreenSenescence * autumn,
      litterPotential: art.evergreenLitterBase + art.evergreenLitterPeak * autumn });
  }
  const a = parameters.anchors[family];
  const growth = tenth(day, a.PL10, a.LX, art.leafLead);
  const drop = tenth(day, a.OL10, a.OL100, art.leafLead);
  const cohort = 1 - ramp(a.OL100, a.OL100 + art.cohortReset, day);
  return Object.freeze({
    leafAmount: clamp(growth * (1 - drop)),
    maturity: ramp(a.PL10 - art.leafLead, a.LX + art.maturationLag, day) * cohort,
    senescence: tenth(day, a.ZL10, a.ZL100, art.senescenceLead) * cohort,
    litterPotential: clamp(drop + 1 - ramp(a.PL10 - art.previousLitterFadeLead, a.LX, day)),
  });
}
function groundState(day: number): TreeSeasonState["ground"] {
  const knots = art.litterRetention;
  let retention = knots[0][1];
  for (let i = 1; i < knots.length; i++) if (day <= knots[i][0]) {
    const before = knots[i - 1], after = knots[i];
    retention = before[1] + (after[1] - before[1]) * ramp(before[0], after[0], day);
    break;
  }
  return Object.freeze({ provenance: "authored-seasonal-model",
    flowerBloom: Math.max(window(day, art.flowerSpring), art.flowerAutumnPeak * window(day, art.flowerAutumn)),
    litterRetention: retention });
}
// Avoid Date.UTC's special handling of years 0..99 and its overflow at the
// extreme valid Date years. This is a proleptic Gregorian day count from 1970.
function yearStart(year: number) {
  const y = year - 1;
  return (365 * (year - 1970) + Math.floor(y / 4) - Math.floor(1969 / 4)
    - Math.floor(y / 100) + Math.floor(1969 / 100) + Math.floor(y / 400) - Math.floor(1969 / 400)) * DAY;
}

/** Pure UTC regional model. Repeated frames in one minute reuse immutable
 * objects. Invalid time/source throws rather than silently consulting a clock. */
export function getTreeSeasonState(instant: number, source: TreeSeasonSource = "regional-model"): TreeSeasonState {
  if (!Number.isFinite(instant) || Math.abs(instant) > MAX_DATE) throw new RangeError("Invalid tree-season UTC instant");
  if (source !== "regional-model" && source !== "demo") throw new RangeError("Invalid tree-season source");
  const minute = Math.floor(instant / MINUTE), revision = minute * 2 + (source === "demo" ? 1 : 0);
  const existing = cache.get(revision);
  if (existing) return existing;
  const sampledAt = minute * MINUTE;
  calendar.setTime(sampledAt);
  const year = calendar.getUTCFullYear(), phaseDay = (sampledAt - yearStart(year)) / DAY * PERIOD / (leap(year) ? 366 : 365);
  const groups = Object.freeze({
    "deciduous-broadleaf": sample(phaseDay, "deciduous-broadleaf"),
    "evergreen-conifer": sample(phaseDay, "evergreen-conifer"),
    "deciduous-conifer": sample(phaseDay, "deciduous-conifer"),
    "reference-bare": bare,
  });
  const state: TreeSeasonState = Object.freeze({ model: parameters.model, source, sampledAt, revision, year, phaseDay,
    groups, ground: groundState(phaseDay) });
  const slots: (TreePhenology | undefined)[] = new Array(TREE_FAMILIES.length * art.seedBuckets);
  for (let i = 0; i < TREE_FAMILIES.length; i++) slots[i * art.seedBuckets + (art.seedBuckets - 1) / 2] = groups[TREE_FAMILIES[i]];
  profiles.set(state, slots);
  cache.set(revision, state);
  if (cache.size > TREE_SEASON_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return state;
}

/** Art variation only: seed0 is neutral; finite numeric seeds are truncated to
 * uint32 and hashed into 17 offsets over +/-4 model days. No per-tree map grows. */
export function phenologyForTree(state: TreeSeasonState, family: TreeFamily, seed = 0): TreePhenology {
  const familyIndex = TREE_FAMILIES.indexOf(family), slots = profiles.get(state);
  if (familyIndex < 0 || !slots) throw new RangeError("Unknown tree family or season state");
  if (!Number.isFinite(seed)) throw new RangeError("Invalid tree phenology seed");
  let hash = Math.trunc(seed) >>> 0;
  const neutral = hash === 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash ^= hash >>> 16;
  const bucket = neutral ? (art.seedBuckets - 1) / 2 : (hash >>> 0) % art.seedBuckets;
  const index = familyIndex * art.seedBuckets + bucket;
  return slots[index] ??= sample(wrap(state.phaseDay - (bucket / (art.seedBuckets - 1) * 2 - 1) * art.seedOffsetDays), family);
}
