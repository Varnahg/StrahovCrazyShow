import rawFeed from "./data/transit.json";
import rawNavigation from "./data/transit-navigation.json";
import { groundHeight } from "./terrain";
import { groundRotation, rotateGroundVector } from "./terrain-entities";
import { b6EntranceHeight } from "./b6-interior";
import {commonEntranceHeight} from './landmark-reality';
import type { Vec3, AvatarConfig } from "./types";

export type TransitPoint = [number, number];
type ShapePoint = [number, number, number];
type StopTime = [string, number, number, number, number];
export type TransitTrip = {
  id: string;
  route: string;
  service: string;
  headsign: string;
  direction: number;
  shape: string;
  stops: StopTime[];
};
export type TransitFeed = {
  start: string;
  end: string;
  downloadedAt: string;
  source: string;
  publisher: string;
  calendar: Record<string, { start: string; end: string; week: number[] }>;
  exceptions: { service: string; date: string; type: number }[];
  shapes: Record<string, ShapePoint[]>;
  trips: TransitTrip[];
  stops: Record<string, { name: string; x: number; z: number }>;
};
export const TRANSIT_FEED = rawFeed as unknown as TransitFeed;
export const TRANSIT_NAVIGATION = rawNavigation;
export type TransitBus = {
  id: string;
  sourceTripId: string;
  route: string;
  direction: number;
  headsign: string;
  position: Vec3;
  yaw: number;
  speed: number;
  doorsOpen: boolean;
  stopId?: string;
};
export type TransitPassenger = {
  id: string;
  tripId: string;
  destination: string;
  stopId: string;
  position: Vec3;
  yaw: number;
  speed: number;
  atEntrance: boolean;
  opacity: number;
  avatar: AvatarConfig;
};
export type TransitCar = {
  id: string;
  position: Vec3;
  yaw: number;
  speed: number;
};
export type TransitFrame = {
  buses: TransitBus[];
  passengers: TransitPassenger[];
  traffic: TransitCar[];
  status: ReturnType<typeof transitStatus>;
};
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function dateParts(now: number) {
  return Object.fromEntries(
    dateFormatter
      .formatToParts(new Date(now))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
}
export function pragueDate(now: number) {
  const p = dateParts(now);
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}
export function shiftServiceDate(date: string, days: number) {
  const d = new Date(
    Date.UTC(
      +date.slice(0, 4),
      +date.slice(4, 6) - 1,
      +date.slice(6, 8) + days,
    ),
  );
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}
/** GTFS reference: elapsed seconds from local noon minus twelve hours, including DST. */
export function serviceDayEpoch(date: string) {
  const noon = Date.UTC(
    +date.slice(0, 4),
    +date.slice(4, 6) - 1,
    +date.slice(6, 8),
    12,
  );
  let utc = noon;
  for (let i = 0; i < 2; i++) {
    const p = dateParts(utc);
    utc +=
      noon - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  }
  return utc - 12 * 3600000;
}
export function parseGtfsTime(time: string) {
  if (!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(time))
    throw new Error("Invalid GTFS time");
  const [h, m, s] = time.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
export function serviceRuns(
  feed: Pick<TransitFeed, "calendar" | "exceptions">,
  service: string,
  date: string,
) {
  const exception = feed.exceptions.find(
    (e) => e.service === service && e.date === date,
  );
  if (exception) return exception.type === 1;
  const c = feed.calendar[service];
  if (!c || date < c.start || date > c.end) return false;
  const day = new Date(
    Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)),
  ).getUTCDay();
  return c.week[(day + 6) % 7] === 1;
}
export function transitStatus(now: number) {
  const today = pragueDate(now),
    feed = TRANSIT_FEED;
  return {
    source: feed.source,
    publisher: feed.publisher,
    validFrom: feed.start,
    validUntil: feed.end,
    downloadedAt: feed.downloadedAt,
    state:
      today < feed.start
        ? "not-yet-valid"
        : today > feed.end
          ? "expired"
          : "scheduled",
    realtime: false as const,
    label:
      today > feed.end
        ? "Jízdní řády PID vypršely – obnovte místní data"
        : today < feed.start
          ? "Jízdní řády zatím neplatí"
          : "PID 143 / 149 · plánované spoje, bez živého zpoždění",
  };
}
export type TransitArrival = {
  at: number;
  route: string;
  headsign: string;
  direction: number;
  stopId: string;
  stopName: string;
  sourceTripId: string;
  serviceDate: string;
  passengerCount: number;
};
export function nextArrivals(now: number, limit = 6): TransitArrival[] {
  const arrivals: TransitArrival[] = [],
    date = pragueDate(now);
  for (const serviceDate of [
    shiftServiceDate(date, -1),
    date,
    shiftServiceDate(date, 1),
  ]) {
    if (serviceDate < TRANSIT_FEED.start || serviceDate > TRANSIT_FEED.end)
      continue;
    const epoch = serviceDayEpoch(serviceDate);
    for (const trip of TRANSIT_FEED.trips) {
      if (!serviceRuns(TRANSIT_FEED, trip.service, serviceDate)) continue;
      for (const stop of trip.stops) {
        const meta = TRANSIT_FEED.stops[stop[0]],
          at = epoch + stop[1] * 1000;
        if (meta.name !== "Koleje Strahov" || at < now) continue;
        arrivals.push({
          at,
          route: trip.route,
          headsign: trip.headsign,
          direction: trip.direction,
          stopId: stop[0],
          stopName: meta.name,
          sourceTripId: trip.id,
          serviceDate,
          passengerCount: passengerCount(
            trip.id,
            serviceDate,
            stop[0],
            stop[1],
          ),
        });
      }
    }
  }
  return arrivals
    .sort((a, b) => a.at - b.at || a.sourceTripId.localeCompare(b.sourceTripId))
    .slice(0, Math.max(0, Math.min(1000, limit)));
}
/** Explicit developer/demo preview only; may use a historical feed date if stale. */
export function getPreviewArrival(now: number): TransitArrival | undefined {
  let candidates = nextArrivals(now, 1000);
  if (!candidates.length)
    candidates = nextArrivals(serviceDayEpoch(TRANSIT_FEED.start), 1000);
  return candidates.find((a) => a.passengerCount >= 4) ?? candidates[0];
}
const hypot = (a: TransitPoint, b: TransitPoint) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);
function alongShape(shape: ShapePoint[], distance: number) {
  for (let i = 1; i < shape.length; i++)
    if (distance <= shape[i][2]) {
      const a = shape[i - 1],
        b = shape[i],
        t = Math.max(
          0,
          Math.min(1, (distance - a[2]) / Math.max(0.000001, b[2] - a[2])),
        );
      return {
        position: {
          x: a[0] + (b[0] - a[0]) * t,
          y: groundHeight(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t),
          z: a[1] + (b[1] - a[1]) * t,
        },
        yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
  const a = shape.at(-2)!,
    b = shape.at(-1)!;
  return {
    position: { x: b[0], y: groundHeight(b[0], b[1]), z: b[1] },
    yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
  };
}
const dwell = (stop: StopTime) => Math.max(stop[2], stop[1] + 14);
/** Planned arrivals remain exact. A 14 s visual dwell is added where GTFS has zero dwell. */
export function sampleTrip(
  trip: TransitTrip,
  seconds: number,
  feed: TransitFeed = TRANSIT_FEED,
): Omit<TransitBus, "id"> | undefined {
  const stops = trip.stops,
    shape = feed.shapes[trip.shape];
  if (!shape?.length || seconds < stops[0][1] || seconds > dwell(stops.at(-1)!))
    return;
  let distance = stops[0][3],
    doorsOpen = false,
    stopId: string | undefined,
    speed = 0;
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i],
      next = stops[i + 1];
    if (seconds >= a[1] && seconds <= dwell(a)) {
      distance = a[3];
      doorsOpen = Boolean(feed.stops[a[0]]);
      stopId = a[0];
      break;
    }
    if (next && seconds > dwell(a) && seconds < next[1]) {
      const t = (seconds - dwell(a)) / Math.max(1, next[1] - dwell(a));
      distance = a[3] + (next[3] - a[3]) * t;
      // PID shape distances in this feed are kilometres. Geometry establishes speed without assuming its unit.
      const p = alongShape(shape, distance),
        q = alongShape(
          shape,
          distance + (next[3] - a[3]) / Math.max(1, next[1] - dwell(a)),
        );
      speed = Math.hypot(
        q.position.x - p.position.x,
        q.position.z - p.position.z,
      );
      break;
    }
  }
  if (distance < shape[0][2] || distance > shape.at(-1)![2]) return;
  return {
    sourceTripId: trip.id,
    route: trip.route,
    direction: trip.direction,
    headsign: trip.headsign,
    ...alongShape(shape, distance),
    speed,
    doorsOpen,
    stopId,
  };
}
export function stableSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function passengerCount(
  tripId: string,
  serviceDate: string,
  stopId: string,
  arrivalSeconds: number,
) {
  const hour = (arrivalSeconds / 3600) % 24,
    r = random(stableSeed(`${serviceDate}:${tripId}:${stopId}`));
  // Fictional ambient attendance, never an inference about real passengers.
  const maximum =
    hour >= 15 && hour <= 23 ? 10 : hour >= 6 && hour <= 9 ? 5 : 7;
  return Math.floor(r() * (maximum + 1));
}
export function sampleWalkingPath(points: TransitPoint[], distance: number) {
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = hypot(a, b);
    if (remaining <= length) {
      const t = length ? remaining / length : 0;
      return {
        position: {
          x: a[0] + (b[0] - a[0]) * t,
          y: Math.max(
            groundHeight(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t),
            b6EntranceHeight(
              a[0] + (b[0] - a[0]) * t,
              a[1] + (b[1] - a[1]) * t,
            ) ?? -Infinity,
            commonEntranceHeight(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)??-Infinity,
          ),
          z: a[1] + (b[1] - a[1]) * t,
        },
        yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
        atEntrance: false,
      };
    }
    remaining -= length;
  }
  const a = points.at(-2)!,
    b = points.at(-1)!;
  return {
    position: {
      x: b[0],
      y: Math.max(
        groundHeight(b[0], b[1]),
        b6EntranceHeight(b[0], b[1]) ?? -Infinity,
        commonEntranceHeight(b[0],b[1])??-Infinity,
      ),
      z: b[1],
    },
    yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
    atEntrance: true,
  };
}
type DaySchedule = { date: string; epoch: number; trips: TransitTrip[] };
let scheduleKey = "",
  schedule: DaySchedule[] = [];
function daysFor(now: number) {
  const date = pragueDate(now);
  if (date === scheduleKey) return schedule;
  scheduleKey = date;
  schedule = [shiftServiceDate(date, -1), date]
    .filter((d) => d >= TRANSIT_FEED.start && d <= TRANSIT_FEED.end)
    .map((date) => ({
      date,
      epoch: serviceDayEpoch(date),
      trips: TRANSIT_FEED.trips.filter((t) =>
        serviceRuns(TRANSIT_FEED, t.service, date),
      ),
    }));
  return schedule;
}
const journeysByStop = new Map<string, typeof rawNavigation.journeys>();
for (const journey of rawNavigation.journeys) {
  const list = journeysByStop.get(journey.stopId) || [];
  list.push(journey);
  journeysByStop.set(journey.stopId, list);
}
const boardingPaths = new Map<
  string,
  { points: TransitPoint[]; length: number }
>();
export function passengerWalkingRoute(
  trip: TransitTrip,
  stop: StopTime,
  journey: (typeof rawNavigation.journeys)[number],
) {
  const key = `${trip.shape}:${stop[0]}:${journey.buildingId}`;
  const cached = boardingPaths.get(key);
  if (cached) return cached;
  const bus = sampleTrip(trip, stop[1])!;
  // The physical right-hand front door is local -X with a +Z nose in this
  // right-handed scene. Stop poles and GTFS road shapes have lateral offsets.
  const door: TransitPoint = [
    bus.position.x - Math.cos(bus.yaw) * 1.7 + Math.sin(bus.yaw) * 4.55,
    bus.position.z + Math.sin(bus.yaw) * 1.7 + Math.cos(bus.yaw) * 4.55,
  ];
  const points = [door, ...(journey.points as TransitPoint[])],
    length = journey.length + hypot(door, points[1]);
  const route = { points, length };
  boardingPaths.set(key, route);
  return route;
}
const shirts = [
  "#354658",
  "#627260",
  "#8e4c3c",
  "#bb9a61",
  "#4b425d",
  "#687a82",
];
const skins = ["#e5bd9a", "#c89572", "#926343", "#f0d0b1"];
function avatarFor(seed: number): AvatarConfig {
  const r = random(seed);
  return {
    preset: Math.floor(r() * 6),
    skin: skins[Math.floor(r() * skins.length)],
    hair: ["#342b25", "#574332", "#887250", "#161c20"][Math.floor(r() * 4)],
    shirt: shirts[Math.floor(r() * shirts.length)],
    trousers: "#283641",
    glasses: r() > 0.8,
    beard: r() > 0.85,
    face: Math.floor(r() * 2),
  };
}
export function sampleTransit(now: number): TransitFrame {
  const buses: TransitBus[] = [],
    passengers: TransitPassenger[] = [];
  for (const day of daysFor(now)) {
    const seconds = (now - day.epoch) / 1000;
    for (const trip of day.trips) {
      const bus = sampleTrip(trip, seconds);
      if (bus) buses.push({ ...bus, id: `${day.date}:${trip.id}` });
      for (const stop of trip.stops) {
        const paths = journeysByStop.get(stop[0]);
        if (!paths?.length || stop[4] === 1) continue;
        const elapsed = seconds - stop[1];
        if (elapsed < 0 || elapsed > 600) continue;
        const seed = stableSeed(`${day.date}:${trip.id}:${stop[0]}`),
          r = random(seed),
          count = passengerCount(trip.id, day.date, stop[0], stop[1]);
        for (let i = 0; i < count; i++) {
          const journey = paths[Math.floor(r() * paths.length)],
            route = passengerWalkingRoute(trip, stop, journey),
            speed = 1.05 + r() * 0.35,
            age = elapsed - 1 - i * 0.85;
          if (age < 0 || age > route.length / speed + 3) continue;
          const pose = sampleWalkingPath(
              route.points as TransitPoint[],
              age * speed,
            ),
            at = age - route.length / speed;
          passengers.push({
            id: `npc:${day.date}:${trip.id}:${stop[0]}:${i}`,
            tripId: trip.id,
            destination: journey.buildingId,
            stopId: stop[0],
            ...pose,
            speed: pose.atEntrance ? 0 : speed,
            opacity: pose.atEntrance ? Math.max(0, 1 - (at - 1) / 2) : 1,
            avatar: avatarFor(seed + i * 131),
          });
        }
      }
    }
  }
  return {
    buses,
    passengers,
    traffic: sampleAmbientTraffic(now),
    status: transitStatus(now),
  };
}
/** Fictional background traffic on the actual road centre lines, independent of GTFS service validity. */
export function sampleAmbientTraffic(now: number): TransitCar[] {
  const output: TransitCar[] = [],
    t = now / 1000;
  const shapes = [TRANSIT_FEED.shapes.L143V1, TRANSIT_FEED.shapes.L143V2];
  for (let direction = 0; direction < shapes.length; direction++) {
    const shape = shapes[direction];
    if (!shape) continue;
    const duration = 75,
      period = 135,
      slot = Math.floor((t - direction * 43) / period),
      age = t - direction * 43 - slot * period;
    if (age > duration) continue;
    const distance =
      shape[0][2] + ((shape.at(-1)![2] - shape[0][2]) * age) / duration;
    output.push({
      id: `traffic:${direction}:${slot}`,
      ...alongShape(shape, distance),
      speed:
        shape
          .slice(1)
          .reduce(
            (sum, p, i) =>
              sum + Math.hypot(p[0] - shape[i][0], p[1] - shape[i][1]),
            0,
          ) / duration,
    });
  }
  return output;
}
/** Shared kinematic obstacle contract for the root simulation; NPCs remain social, nonblocking walkers. */
export function transitObstacles(frame: TransitFrame) {
  const obstacle = (
    vehicle: TransitCar | TransitBus,
    dimensions: { x: number; y: number; z: number },
  ) => {
    const rotation = groundRotation(
        vehicle.position.x,
        vehicle.position.z,
        vehicle.yaw,
        dimensions.z,
        dimensions.x,
      ),
      offset = rotateGroundVector(rotation, {
        x: 0,
        y: dimensions.y / 2,
        z: 0,
      });
    return {
      id: vehicle.id,
      position: {
        x: vehicle.position.x + offset.x,
        y: vehicle.position.y + offset.y,
        z: vehicle.position.z + offset.z,
      },
      yaw: vehicle.yaw,
      rotation,
      dimensions,
    };
  };
  return [
    ...frame.buses.map((b) => obstacle(b, { x: 2.5, y: 3, z: 11.8 })),
    ...frame.traffic.map((c) => obstacle(c, { x: 2.04, y: 1.56, z: 3.56 })),
  ];
}
