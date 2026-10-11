import {
  STREET_FEATURES,
  type StreetPoint,
  type StreetFeature,
} from "../shared/streets";
import { CampusRouteQueue } from "../shared/campus-routes";
import { BUILDINGS, BOUNDS, PLACES } from "../shared/world";
import {
  COMMON_DORM_ENTRANCES,
  isClosedStadiumInterior,
  STADIUM_CLOSED_BOUNDARY,
} from "../shared/landmark-reality";
import { B6_LAYOUT } from "../shared/b6-interior";
import type { MapPoint } from "./minimap-math";
import type { NavigationClearance } from "./navigation-physics";

export type NavigationTarget = MapPoint & { id?: string };
export type MapNavigation = {
  status: "route" | "arrived" | "unavailable";
  points: MapPoint[];
  distance: number;
  endpoint: MapPoint;
  toEntrance: boolean;
};
export type PlanMapRoute = (
  start: MapPoint,
  target: NavigationTarget,
) => MapNavigation | Promise<MapNavigation>;
type Edge = { to: string; length: number; key: string };
type Node = { point: MapPoint; edges: Edge[] };
type Segment = { a: string; b: string; length: number; key: string };
type NavigationWay = Pick<StreetFeature, "nodeIds" | "points" | "tags">;
type Attachment = Segment & { point: MapPoint; distance: number };
type NavigationWork = Generator<void, MapNavigation>;
type PendingNavigation = {
  key: string;
  start: MapPoint;
  latestStart: MapPoint;
  target: NavigationTarget;
  work: NavigationWork;
  promise: Promise<MapNavigation>;
  resolve: (value: MapNavigation) => void;
};
export type NavigationScheduling = {
  now: () => number;
  /** Schedule a later task and return its cancellation callback. */
  defer: (work: () => void) => () => void;
};
const browserScheduling: NavigationScheduling = {
  now: () => performance.now(),
  defer: (work) => {
    const timer = setTimeout(work, 0);
    return () => clearTimeout(timer);
  },
};
const targetKey = (target: NavigationTarget) =>
  `${target.id ?? ""}:${target.x}:${target.z}`;
const unavailable = (target: MapPoint): MapNavigation => ({
  status: "unavailable",
  points: [],
  distance: 0,
  endpoint: copyPoint(target),
  toEntrance: false,
});
const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const point = (p: StreetPoint): MapPoint => ({ x: p[0], z: p[1] });
const copyPoint = (p: MapPoint): MapPoint => ({ x: p.x, z: p.z });
const outsideStadiumBounds = (p: MapPoint) =>
  p.x < stadiumBounds.minX ||
  p.x > stadiumBounds.maxX ||
  p.z < stadiumBounds.minZ ||
  p.z > stadiumBounds.maxZ;
const validMapPoint = (p: MapPoint) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.z) &&
  p.x >= BOUNDS.minX &&
  p.x <= BOUNDS.maxX &&
  p.z >= BOUNDS.minZ &&
  p.z <= BOUNDS.maxZ &&
  (outsideStadiumBounds(p) || !isClosedStadiumInterior(p));
const routePoints = (points: MapPoint[]) =>
  points
    .filter((p, i) => !i || distance(p, points[i - 1]) > 0.01)
    .map(copyPoint);
const routeLength = (points: MapPoint[]) =>
  points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
const permitsWalking = ({ tags }: NavigationWay) =>
  !["no", "private"].includes(tags.foot) &&
  (["yes", "designated", "permissive"].includes(tags.foot) ||
    !["no", "private"].includes(tags.access));
const stadiumBounds = STADIUM_CLOSED_BOUNDARY.reduce(
  (b, p) => ({
    minX: Math.min(b.minX, p[0]),
    maxX: Math.max(b.maxX, p[0]),
    minZ: Math.min(b.minZ, p[1]),
    maxZ: Math.max(b.maxZ, p[1]),
  }),
  { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
);
function crossesClosedStadium(a: MapPoint, b: MapPoint) {
  if (
    Math.max(a.x, b.x) < stadiumBounds.minX ||
    Math.min(a.x, b.x) > stadiumBounds.maxX ||
    Math.max(a.z, b.z) < stadiumBounds.minZ ||
    Math.min(a.z, b.z) > stadiumBounds.maxZ
  )
    return false;
  if (isClosedStadiumInterior(a) || isClosedStadiumInterior(b)) return true;
  const dx = b.x - a.x,
    dz = b.z - a.z;
  for (
    let i = 0, j = STADIUM_CLOSED_BOUNDARY.length - 1;
    i < STADIUM_CLOSED_BOUNDARY.length;
    j = i++
  ) {
    const p = STADIUM_CLOSED_BOUNDARY[j],
      q = STADIUM_CLOSED_BOUNDARY[i],
      ex = q[0] - p[0],
      ez = q[1] - p[1];
    const cross = dx * ez - dz * ex;
    if (Math.abs(cross) < 1e-10) continue;
    const px = p[0] - a.x,
      pz = p[1] - a.z,
      t = (px * ez - pz * ex) / cross,
      u = (px * dz - pz * dx) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}
export function insideMapPolygon(
  p: MapPoint,
  ring: readonly (readonly number[])[],
) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p.z !== b[1] > p.z &&
      p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function projection(p: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return { x: a.x + dx * t, z: a.z + dz * t };
}
export function resolveNavigationTarget(target: NavigationTarget) {
  if (!validMapPoint(target)) return undefined;
  const place = PLACES.find((p) => p.id === target.id);
  const building = BUILDINGS.find((b) => insideMapPolygon(target, b.points));
  if (
    target.id === "b6" ||
    target.id === "club6" ||
    building?.name.endsWith("blok 6")
  )
    return { point: point(B6_LAYOUT.approachRoute[0]), toEntrance: true };
  const entrance =
    building && COMMON_DORM_ENTRANCES.find((e) => e.buildingId === building.id);
  if (entrance)
    return {
      point: {
        x: entrance.x + entrance.nx * 4.8,
        z: entrance.z + entrance.nz * 4.8,
      },
      toEntrance: true,
    };
  // An arbitrary marker cannot fabricate a route into an unmodelled interior.
  // Named indoor destinations are approached from the nearest mapped way below.
  if (building && !place) return undefined;
  return {
    point: { x: target.x, z: target.z },
    toEntrance: !!building || place?.floor != null,
    snapOutside: !!building,
  };
}

/** One graph per Game, one collision-check cache per static edge, no path search
 * in the render loop. Endpoint connectors are validated against the actual
 * physics world. This is a virtual walking route, not a real-world access claim. */
export class MapNavigator {
  private nodes = new Map<string, Node>();
  private segments: Segment[] = [];
  private edgeClear = new Map<string, boolean>();
  private cached?: { key: string; start: MapPoint; result: MapNavigation };
  private graphBuild?: Generator<void, void>;
  private graphReady = false;
  private pending?: PendingNavigation;
  private cancelScheduled?: () => void;
  private disposed = false;
  readonly chunkProfile = {
    budgetMs: 3,
    chunks: 0,
    totalWorkMs: 0,
    maxChunkMs: 0,
    maxUnitMs: 0,
  };
  searches = 0;
  graphSearches = 0;
  clearanceChecks = 0;
  cacheHits = 0;
  prunes = 0;
  constructor(
    private clear: NavigationClearance,
    private features: readonly NavigationWay[] = STREET_FEATURES,
    private scheduling: NavigationScheduling = browserScheduling,
  ) {}
  private *buildGraph(): Generator<void, void> {
    for (const feature of this.features) {
      if (!permitsWalking(feature)) continue;
      for (let i = 1; i < feature.points.length; i++) {
        const a = feature.nodeIds[i - 1],
          b = feature.nodeIds[i];
        if (!a || !b || a === b) continue;
        for (const [id, p] of [
          [a, feature.points[i - 1]],
          [b, feature.points[i]],
        ] as const)
          if (!this.nodes.has(id))
            this.nodes.set(id, { point: point(p), edges: [] });
        const length = distance(
          this.nodes.get(a)!.point,
          this.nodes.get(b)!.point,
        );
        if (length < 0.01) continue;
        const key = `${a}:${b}`;
        this.nodes.get(a)!.edges.push({ to: b, length, key: `${a}>${b}` });
        this.nodes.get(b)!.edges.push({ to: a, length, key: `${b}>${a}` });
        this.segments.push({ a, b, length, key });
        yield;
      }
    }
    this.graphReady = true;
  }
  private *ensureGraph(): Generator<void, void> {
    this.graphBuild ??= this.buildGraph();
    while (!this.graphReady) {
      this.graphBuild.next();
      yield;
    }
  }
  private *canTravel(a: MapPoint, b: MapPoint): Generator<void, boolean> {
    this.clearanceChecks++;
    if (!validMapPoint(a) || !validMapPoint(b) || crossesClosedStadium(a, b))
      return false;
    if (this.clear.steps) return yield* this.clear.steps(a, b);
    const result = this.clear(a, b);
    yield;
    return result;
  }
  private *attachments(
    p: MapPoint,
    snap = false,
  ): Generator<void, Attachment[]> {
    const candidates: Attachment[] = [];
    for (const segment of this.segments) {
      const projected = projection(
        p,
        this.nodes.get(segment.a)!.point,
        this.nodes.get(segment.b)!.point,
      );
      const separation = distance(p, projected);
      if (separation <= 40)
        candidates.push({ ...segment, point: projected, distance: separation });
      yield;
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const result: typeof candidates = [];
    for (const c of candidates) {
      if (snap) {
        if (
          !validMapPoint(c.point) ||
          BUILDINGS.some((b) => insideMapPolygon(c.point, b.points))
        )
          continue;
      } else if (!(yield* this.canTravel(p, c.point))) continue;
      result.push(c);
      if (result.length === 8) break;
    }
    return result;
  }
  private *search(start: MapPoint, target: NavigationTarget): NavigationWork {
    if (!validMapPoint(start))
      return {
        status: "unavailable",
        points: [],
        distance: 0,
        endpoint: copyPoint(target),
        toEntrance: false,
      };
    const key = targetKey(target);
    const previous = this.cached;
    if (previous?.key === key) {
      if (distance(previous.start, start) < 0.15) {
        this.cacheHits++;
        return previous.result;
      }
      if (previous.result.status === "route") {
        let best = Infinity,
          index = 0,
          nearest: MapPoint = start;
        const points = previous.result.points;
        for (let i = 1; i < points.length; i++) {
          const projected = projection(start, points[i - 1], points[i]),
            gap = distance(start, projected);
          if (gap < best) {
            best = gap;
            index = i;
            nearest = projected;
          }
          yield;
        }
        if (best < 2.5 && (yield* this.canTravel(start, nearest))) {
          // Preserve the validated connector. Dropping this projection joined
          // the new start directly to the next vertex and could cut a corner.
          const remaining = routePoints([
            start,
            nearest,
            ...points.slice(index),
          ]);
          const result = {
            ...previous.result,
            points: remaining,
            distance: routeLength(remaining),
          };
          if (
            distance(start, result.endpoint) < 2 &&
            (yield* this.canTravel(start, result.endpoint))
          ) {
            result.status = "arrived";
            result.points = [];
            result.distance = 0;
          }
          this.cached = { key, start: { ...start }, result };
          this.prunes++;
          return result;
        }
      } else if (
        previous.result.status === "unavailable" &&
        distance(previous.start, start) < 0.5
      ) {
        this.cacheHits++;
        return previous.result;
      }
    }
    this.searches++;
    const resolved = resolveNavigationTarget(target);
    const failed: MapNavigation = {
      status: "unavailable",
      points: [],
      distance: 0,
      endpoint: copyPoint(target),
      toEntrance: !!resolved?.toEntrance,
    };
    const store = (result: MapNavigation) => {
      this.cached = { key, start: { ...start }, result };
      return result;
    };
    if (!resolved) return store(failed);
    const end = resolved.point;
    if (
      !resolved.snapOutside &&
      distance(start, end) < 2 &&
      (yield* this.canTravel(start, end))
    )
      return store({ ...failed, status: "arrived", endpoint: end });
    // Short clear open-space links keep the central asphalt walkable instead of
    // drawing a hundreds-of-metres detour between nearby virtual activities.
    if (
      !resolved.snapOutside &&
      distance(start, end) < 60 &&
      (yield* this.canTravel(start, end))
    )
      return store({
        status: "route",
        points: routePoints([start, end]),
        distance: distance(start, end),
        endpoint: copyPoint(end),
        toEntrance: resolved.toEntrance,
      });
    yield* this.ensureGraph();
    const first = yield* this.attachments(start),
      last = yield* this.attachments(end, resolved.snapOutside);
    if (!first.length || !last.length) return store(failed);
    // Two interior attachments on one mapped segment need not detour through
    // either source endpoint. The connector and subsegment still get checked.
    let sameSegment: MapPoint[] | undefined,
      sameDistance = Infinity;
    for (const a of first)
      for (const b of last) {
        if (a.key !== b.key || !(yield* this.canTravel(a.point, b.point)))
          continue;
        const points = routePoints([
          start,
          a.point,
          b.point,
          ...(resolved.snapOutside ? [] : [end]),
        ]);
        const length = routeLength(points);
        if (length < sameDistance) {
          sameSegment = points;
          sameDistance = length;
        }
      }
    if (sameSegment)
      return store({
        status: "route",
        points: sameSegment,
        distance: sameDistance,
        endpoint: copyPoint(sameSegment.at(-1)!),
        toEntrance: resolved.toEntrance,
      });
    const finishes = new Map<string, { point: MapPoint; cost: number }>();
    for (const attachment of last)
      for (const id of [attachment.a, attachment.b]) {
        if (
          !(yield* this.canTravel(this.nodes.get(id)!.point, attachment.point))
        )
          continue;
        const cost =
          distance(this.nodes.get(id)!.point, attachment.point) +
          (resolved.snapOutside ? 0 : attachment.distance);
        if (cost < (finishes.get(id)?.cost ?? Infinity))
          finishes.set(id, { point: attachment.point, cost });
      }
    if (!finishes.size) return store(failed);
    const estimates = new Map<string, number>();
    const estimate = (id: string) => {
      let value = estimates.get(id);
      if (value === undefined) {
        const p = this.nodes.get(id)!.point;
        value = Math.min(
          ...last.map(
            (a) =>
              distance(p, a.point) + (resolved.snapOutside ? 0 : a.distance),
          ),
        );
        estimates.set(id, value);
      }
      return value;
    };
    const costs = new Map<string, number>(),
      previousNode = new Map<string, string>();
    const starts = new Map<string, MapPoint>(),
      queue = new CampusRouteQueue();
    let choice: { id: string; projection: MapPoint; cost: number } | undefined;
    this.graphSearches++;
    for (const attachment of first)
      for (const id of [attachment.a, attachment.b]) {
        const node = this.nodes.get(id)!.point;
        if (!(yield* this.canTravel(attachment.point, node))) continue;
        const cost = attachment.distance + distance(attachment.point, node);
        if (cost >= (costs.get(id) ?? Infinity)) continue;
        costs.set(id, cost);
        starts.set(id, attachment.point);
        queue.push({ id, distance: cost + estimate(id) });
      }
    while (queue.values.length) {
      const current = queue.pop();
      const currentCost = costs.get(current.id)!;
      if (current.distance !== currentCost + estimate(current.id)) continue;
      if (choice && current.distance >= choice.cost) break;
      const finish = finishes.get(current.id);
      if (finish && (!choice || currentCost + finish.cost < choice.cost))
        choice = {
          id: current.id,
          projection: finish.point,
          cost: currentCost + finish.cost,
        };
      const node = this.nodes.get(current.id)!;
      for (const edge of node.edges) {
        const next = node.point,
          to = this.nodes.get(edge.to)!.point;
        let clear = this.edgeClear.get(edge.key);
        if (clear === undefined) {
          clear = yield* this.canTravel(next, to);
          this.edgeClear.set(edge.key, clear);
        }
        if (!clear) continue;
        const cost = currentCost + edge.length;
        if (cost >= (costs.get(edge.to) ?? Infinity)) continue;
        costs.set(edge.to, cost);
        previousNode.set(edge.to, current.id);
        queue.push({ id: edge.to, distance: cost + estimate(edge.to) });
      }
      yield;
    }
    if (!choice) return store(failed);
    const tail = resolved.snapOutside ? choice.projection : end;
    const reverse: MapPoint[] = [tail, choice.projection];
    let id = choice.id;
    while (previousNode.has(id)) {
      reverse.push(this.nodes.get(id)!.point);
      id = previousNode.get(id)!;
    }
    reverse.push(this.nodes.get(id)!.point, starts.get(id)!, start);
    const points = routePoints(reverse.reverse());
    return store({
      status: "route",
      points,
      distance: routeLength(points),
      endpoint: copyPoint(tail),
      toEntrance: resolved.toEntrance,
    });
  }
  /** Deterministic synchronous adapter for tests/offline validation. */
  plan = (start: MapPoint, target: NavigationTarget): MapNavigation => {
    if (this.disposed) return unavailable(target);
    this.cancel();
    const iterator = this.search(copyPoint(start), { ...target });
    let result = iterator.next();
    while (!result.done) result = iterator.next();
    return result.value;
  };
  /** One shared request for both map views, yielding between bounded units. */
  planAsync = (
    start: MapPoint,
    target: NavigationTarget,
  ): Promise<MapNavigation> => {
    if (this.disposed) return Promise.resolve(unavailable(target));
    const key = targetKey(target);
    if (this.pending?.key === key) {
      this.pending.latestStart = copyPoint(start);
      return this.pending.promise;
    }
    this.cancel();
    let resolve!: (value: MapNavigation) => void;
    const promise = new Promise<MapNavigation>((done) => {
      resolve = done;
    });
    const initial = copyPoint(start),
      destination = { ...target };
    const pending: PendingNavigation = {
      key,
      start: initial,
      latestStart: initial,
      target: destination,
      work: this.search(initial, destination),
      promise,
      resolve,
    };
    this.pending = pending;
    this.runChunk(pending);
    return promise;
  };
  private runChunk(request: PendingNavigation) {
    if (this.disposed || this.pending !== request) return;
    this.cancelScheduled = undefined;
    const began = this.scheduling.now();
    let now = began;
    let completed: MapNavigation | undefined;
    try {
      do {
        const unitBegan = now;
        const result = request.work.next();
        now = this.scheduling.now();
        this.chunkProfile.maxUnitMs = Math.max(
          this.chunkProfile.maxUnitMs,
          now - unitBegan,
        );
        if (result.done) {
          if (distance(request.start, request.latestStart) >= 0.15) {
            request.start = request.latestStart;
            request.work = this.search(request.start, request.target);
          } else {
            completed = result.value;
            break;
          }
        }
      } while (now - began < this.chunkProfile.budgetMs);
    } catch {
      // A destroyed/invalid physics context must fail closed, not leave a
      // map forever pending or schedule another native query.
      completed = unavailable(request.target);
    }
    const elapsed = this.scheduling.now() - began;
    this.chunkProfile.chunks++;
    this.chunkProfile.totalWorkMs += elapsed;
    this.chunkProfile.maxChunkMs = Math.max(
      this.chunkProfile.maxChunkMs,
      elapsed,
    );
    if (completed) {
      if (this.pending === request) this.pending = undefined;
      request.resolve(completed);
    } else
      this.cancelScheduled = this.scheduling.defer(() =>
        this.runChunk(request),
      );
  }
  cancel() {
    this.cancelScheduled?.();
    this.cancelScheduled = undefined;
    const request = this.pending;
    this.pending = undefined;
    request?.work.return(unavailable(request.target));
    request?.resolve(unavailable(request.target));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.graphBuild?.return();
    this.nodes.clear();
    this.segments.length = 0;
    this.edgeClear.clear();
    this.cached = undefined;
  }
}
