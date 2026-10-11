import {
  STREETS,
  STREET_FEATURES,
  type StreetFeature,
  type StreetPoint,
} from "./streets";

export type CampusWalkSegment = {
  from: StreetPoint;
  to: StreetPoint;
  length: number;
  /** Null only for the short first/last link from a selected point to a way. */
  featureId: string | null;
  source: "osm-way" | "endpoint-connector";
};
export type CampusWalkRoute = {
  points: StreetPoint[];
  segments: CampusWalkSegment[];
  length: number;
  startConnector: number;
  endConnector: number;
};
type Edge = { to: string; featureId: string; length: number };
type Node = { point: StreetPoint; edges: Edge[] };
type WaySegment = {
  a: string;
  b: string;
  featureId: string;
  length: number;
};
type Attachment = WaySegment & {
  point: StreetPoint;
  fraction: number;
  distance: number;
};

/** Only explicit pedestrian ways; nearby, disconnected ways are never joined.
 * Vehicle oneway tags do not change walking direction. An explicit foot access
 * tag can override the general access tag, as in the source OSM convention.
 */
function walkable(feature: StreetFeature) {
  const foot = feature.tags.foot;
  if (foot === "no" || foot === "private") return false;
  if (feature.kind === "road") return false;
  return (
    foot === "yes" ||
    foot === "designated" ||
    foot === "permissive" ||
    !["no", "private"].includes(feature.tags.access)
  );
}
const distance = (a: StreetPoint, b: StreetPoint) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A small binary heap keeps a route search off the per-frame rendering path. */
export class CampusRouteQueue {
  values: { id: string; distance: number }[] = [];
  push(value: { id: string; distance: number }) {
    const entries = this.values;
    let i = entries.length;
    entries.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (entries[parent].distance <= value.distance) break;
      entries[i] = entries[parent];
      i = parent;
    }
    entries[i] = value;
  }
  pop() {
    const entries = this.values,
      result = entries[0],
      last = entries.pop();
    if (last && entries.length) {
      let i = 0;
      while (i * 2 + 1 < entries.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < entries.length &&
          entries[child + 1].distance < entries[child].distance
        )
          child++;
        if (entries[child].distance >= last.distance) break;
        entries[i] = entries[child];
        i = child;
      }
      entries[i] = last;
    }
    return result;
  }
}

/** Build once, then request a route when the map destination changes. This is
 * source topology, not a navigation mesh or a claim that every mapped way is
 * accessible in the physical world. Actual game collision traversal is tested
 * separately. The helper deliberately cannot invent shortcuts over grass,
 * across a bus turning loop, or between grade-separated nearby ways.
 */
export function createCampusWalkRouter(
  features: StreetFeature[],
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  const nodes = new Map<string, Node>(),
    segments: WaySegment[] = [];
  for (const feature of features) {
    if (!walkable(feature)) continue;
    for (let i = 0; i < feature.points.length; i++) {
      const id = feature.nodeIds[i];
      if (!id) continue;
      if (!nodes.has(id))
        nodes.set(id, { point: feature.points[i], edges: [] });
      if (!i) continue;
      const a = feature.nodeIds[i - 1],
        b = id;
      if (!a || !nodes.has(a) || a === b) continue;
      if (
        bounds &&
        [nodes.get(a)!.point, nodes.get(b)!.point].some(
          ([x, z]) =>
            x < bounds.minX ||
            x > bounds.maxX ||
            z < bounds.minZ ||
            z > bounds.maxZ,
        )
      )
        continue;
      const length = distance(nodes.get(a)!.point, nodes.get(b)!.point);
      if (length < 1e-7) continue;
      nodes.get(a)!.edges.push({ to: b, featureId: feature.id, length });
      nodes.get(b)!.edges.push({ to: a, featureId: feature.id, length });
      segments.push({ a, b, length, featureId: feature.id });
    }
  }

  function attach(point: StreetPoint, maxDistance: number) {
    let result: Attachment | undefined;
    for (const segment of segments) {
      const a = nodes.get(segment.a)!.point,
        b = nodes.get(segment.b)!.point,
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        fraction = Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
              segment.length ** 2,
          ),
        ),
        projected: StreetPoint = [a[0] + dx * fraction, a[1] + dz * fraction],
        separation = distance(point, projected);
      if (separation > maxDistance) continue;
      if (!result || separation < result.distance - 1e-9)
        result = {
          ...segment,
          point: projected,
          fraction,
          distance: separation,
        };
    }
    return result;
  }

  return {
    nodeCount: nodes.size,
    segmentCount: segments.length,
    findRoute(
      start: StreetPoint,
      end: StreetPoint,
      maxConnectorDistance = 4,
    ): CampusWalkRoute | undefined {
      if (!start.every(Number.isFinite) || !end.every(Number.isFinite))
        return undefined;
      const first = attach(start, maxConnectorDistance),
        last = attach(end, maxConnectorDistance);
      if (!first || !last) return undefined;
      const route: CampusWalkSegment[] = [];
      function add(
        from: StreetPoint,
        to: StreetPoint,
        featureId: string | null,
      ) {
        const length = distance(from, to);
        if (length < 1e-7) return;
        route.push({
          from: [...from],
          to: [...to],
          length,
          featureId,
          source: featureId === null ? "endpoint-connector" : "osm-way",
        });
      }
      add(start, first.point, null);
      if (
        first.featureId === last.featureId &&
        first.a === last.a &&
        first.b === last.b
      ) {
        add(first.point, last.point, first.featureId);
      } else {
        const distances = new Map<string, number>(),
          previous = new Map<string, { from: string; featureId: string }>(),
          queue = new CampusRouteQueue();
        for (const id of [first.a, first.b]) {
          const length = distance(first.point, nodes.get(id)!.point);
          distances.set(id, length);
          queue.push({ id, distance: length });
        }
        while (queue.values.length) {
          const current = queue.pop();
          if (current.distance !== distances.get(current.id)) continue;
          for (const edge of nodes.get(current.id)!.edges) {
            const total = current.distance + edge.length;
            if (total >= (distances.get(edge.to) ?? Infinity)) continue;
            distances.set(edge.to, total);
            previous.set(edge.to, {
              from: current.id,
              featureId: edge.featureId,
            });
            queue.push({ id: edge.to, distance: total });
          }
        }
        const endNodes = [last.a, last.b]
          .filter((id) => distances.has(id))
          .sort(
            (a, b) =>
              distances.get(a)! +
              distance(nodes.get(a)!.point, last.point) -
              distances.get(b)! -
              distance(nodes.get(b)!.point, last.point),
          );
        if (!endNodes.length) return undefined;
        let current = endNodes[0];
        const reversed: { from: string; to: string; featureId: string }[] = [];
        while (previous.has(current)) {
          const edge = previous.get(current)!;
          reversed.push({
            from: edge.from,
            to: current,
            featureId: edge.featureId,
          });
          current = edge.from;
        }
        add(first.point, nodes.get(current)!.point, first.featureId);
        for (const edge of reversed.reverse())
          add(
            nodes.get(edge.from)!.point,
            nodes.get(edge.to)!.point,
            edge.featureId,
          );
        add(nodes.get(endNodes[0])!.point, last.point, last.featureId);
      }
      add(last.point, end, null);
      return {
        points: route.length
          ? [route[0].from, ...route.map((s) => s.to)]
          : [[...start]],
        segments: route,
        length: route.reduce((sum, segment) => sum + segment.length, 0),
        startConnector: first.distance,
        endConnector: last.distance,
      };
    },
  };
}

let campusRouter: ReturnType<typeof createCampusWalkRouter> | undefined;
/** Lazy cache: no graph rebuild during rendering or map panning. */
export const findCampusWalkRoute = (
  start: StreetPoint,
  end: StreetPoint,
  maxConnectorDistance = 4,
) =>
  (campusRouter ??= createCampusWalkRouter(
    STREET_FEATURES,
    STREETS.bounds,
  )).findRoute(start, end, maxConnectorDistance);
