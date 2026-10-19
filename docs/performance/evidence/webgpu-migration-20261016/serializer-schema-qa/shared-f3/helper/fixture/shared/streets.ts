import raw from "./data/streets.json";
import roadCalibrationRaw from "./data/road-calibration.json";
import photoLampsRaw from "./data/photo-lamps.json";
import entryPavingRaw from "./data/b6-entry-paving.json";
import { groundHeight } from "./terrain";

export type StreetPoint = [number, number];
export type StreetMaterial = "asphalt" | "sett" | "paving" | "gravel";
export type StreetPolygon = {
  outer: StreetPoint[];
  holes: StreetPoint[][];
  area: number;
};
export type StreetFeature = {
  id: string;
  nodeIds: string[];
  points: StreetPoint[];
  tags: Record<string, string>;
  width: number;
  widthProvenance: string;
  isArea: boolean;
  source: string;
  kind: "road" | "sidewalk" | "footway" | "steps" | "pedestrian-area";
  surface: string;
  surfaceProvenance: string;
  material: StreetMaterial;
  renderArea: number;
  length: number;
  sourceOsmWayId?: string;
  interpretationId?: string;
};
export type StreetSource = {
  schemaVersion: number;
  origin: { lat: number; lon: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  source: string;
  sourceSha256: string;
  attribution: string;
  terrain: string;
  features: StreetFeature[];
  surfaces: { material: StreetMaterial; polygons: StreetPolygon[] }[];
  parking: {
    id: string;
    points: StreetPoint[];
    tags: Record<string, string>;
    source: string;
  }[];
  lamps: {
    id: string;
    x: number;
    z: number;
    height: number;
    heightProvenance: string;
    provenance: "mapped-osm-node";
    tags: Record<string, string>;
    source: string;
  }[];
  crossings: {
    id: string;
    x: number;
    z: number;
    tags: Record<string, string>;
    source: string;
  }[];
  excludedWays: {
    osmId: string;
    reason: string;
    tags: Record<string, string>;
  }[];
};
export const B6_ENTRY_PAVING=entryPavingRaw;
const sourceStreets=raw as unknown as StreetSource;
const connectorPoints=entryPavingRaw.points as StreetPoint[];
const connectorPolygons:StreetPolygon[]=entryPavingRaw.polygons.map(polygon=>({outer:polygon.outer.map(p=>[p[0],p[1]]as StreetPoint),holes:polygon.holes.map((ring:number[][])=>ring.map(p=>[p[0],p[1]]as StreetPoint)),area:polygon.area}));
const connector:StreetFeature={id:entryPavingRaw.id,nodeIds:[],points:connectorPoints,tags:{highway:"footway","source:geometry":entryPavingRaw.classification},width:entryPavingRaw.widthMetres,widthProvenance:"photo-informed-native-entry-adaptation-not-surveyed",isArea:false,source:entryPavingRaw.sourcePhotoUrl,kind:"footway",surface:"paving_stones",surfaceProvenance:"photo-informed-grey-paving-typology; exact slab pattern unmeasured",material:"paving",renderArea:entryPavingRaw.polygons.reduce((sum,p)=>sum+p.area,0),length:connectorPoints.slice(1).reduce((sum,p,index)=>sum+Math.hypot(p[0]-connectorPoints[index][0],p[1]-connectorPoints[index][1]),0),sourceOsmWayId:entryPavingRaw.sourceOsmWayId};
export const STREETS:StreetSource={...sourceStreets,features:[...sourceStreets.features,connector],surfaces:sourceStreets.surfaces.map(surface=>surface.material==="paving"?{...surface,polygons:[...surface.polygons,...connectorPolygons]}:surface)};
export const STREET_FEATURES = STREETS.features;
export const STREET_SURFACES = STREETS.surfaces;
export const STREET_SURFACE_Y = 0.018;
/** Source image interpretation, not a claim of surveyed road dimensions. The
 * generator partitions its footprint into the SAME final runtime surfaces. */
export const ROAD_CALIBRATION = roadCalibrationRaw as unknown as {
  classification: "photo-interpreted-not-surveyed";
  estimatedBoundaryUncertaintyMetres: number;
  origin: { lat: number; lon: number };
  photoFootprint: StreetPolygon[];
  features: StreetFeature[];
  sources: {
    image: string;
    sha256: string;
    captureDate: string;
    provider: string;
  }[];
};
export const CALIBRATED_ROAD_FEATURES = STREET_FEATURES.filter(
  (feature) => feature.interpretationId !== undefined,
);

type RingEdge = {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  dx: number;
  dz: number;
  length2: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
const RING_BUCKET_METRES = 8;
const EDGE_CANDIDATE_PADDING = 2e-7;
// Only immutable downloaded source rings are indexed. Arbitrary caller-owned
// polygons retain the original uncached predicate, including mutation semantics.
const sourceRingRows = new WeakMap<StreetPoint[], Map<number, RingEdge[]>>();
function indexSourceRing(ring: StreetPoint[]) {
  if (sourceRingRows.has(ring)) return;
  const rows = new Map<number, RingEdge[]>();
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i],
      [bx, bz] = ring[j],
      dx = bx - ax,
      dz = bz - az;
    const edge: RingEdge = {
      ax,
      az,
      bx,
      bz,
      dx,
      dz,
      length2: dx * dx + dz * dz,
      minX: Math.min(ax, bx),
      maxX: Math.max(ax, bx),
      minZ: Math.min(az, bz),
      maxZ: Math.max(az, bz),
    };
    for (
      let row = Math.floor(
        (edge.minZ - EDGE_CANDIDATE_PADDING) / RING_BUCKET_METRES,
      );
      row <=
      Math.floor((edge.maxZ + EDGE_CANDIDATE_PADDING) / RING_BUCKET_METRES);
      row++
    ) {
      const bucket = rows.get(row) ?? [];
      bucket.push(edge);
      rows.set(row, bucket);
    }
  }
  sourceRingRows.set(ring, rows);
}

function ringContains(x: number, z: number, ring: StreetPoint[]) {
  let inside = false;
  const rows = sourceRingRows.get(ring);
  if (rows) {
    for (const edge of rows.get(Math.floor(z / RING_BUCKET_METRES)) ?? []) {
      const { ax, az, bx, bz, dx, dz, length2 } = edge;
      if (
        x >= edge.minX - EDGE_CANDIDATE_PADDING &&
        x <= edge.maxX + EDGE_CANDIDATE_PADDING &&
        z >= edge.minZ - EDGE_CANDIDATE_PADDING &&
        z <= edge.maxZ + EDGE_CANDIDATE_PADDING
      ) {
        const t = length2
          ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2))
          : 0;
        if (Math.hypot(x - ax - t * dx, z - az - t * dz) < 1e-7) return true;
      }
      if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
        inside = !inside;
    }
    return inside;
  }
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i],
      [bx, bz] = ring[j];
    // Only numerical edge tolerance; a millimetre tolerance would erase valid
    // narrow triangles along a hole boundary when testing their centroids.
    const dx = bx - ax,
      dz = bz - az;
    const length2 = dx * dx + dz * dz;
    const t = length2
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2))
      : 0;
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < 1e-7) return true;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}

export function streetPolygonContains(
  polygon: StreetPolygon,
  x: number,
  z: number,
) {
  return (
    ringContains(x, z, polygon.outer) &&
    !polygon.holes.some((ring) => ringContains(x, z, ring))
  );
}

export function isCalibratedRoadFootprint(x: number, z: number) {
  return ROAD_CALIBRATION.photoFootprint.some((polygon) =>
    streetPolygonContains(polygon, x, z),
  );
}

const indexedPolygons = STREET_SURFACES.flatMap((surface) =>
  surface.polygons.map((polygon) => ({
    polygon,
    material: surface.material,
    minX: Math.min(...polygon.outer.map((p) => p[0])),
    maxX: Math.max(...polygon.outer.map((p) => p[0])),
    minZ: Math.min(...polygon.outer.map((p) => p[1])),
    maxZ: Math.max(...polygon.outer.map((p) => p[1])),
  })),
);
const POLYGON_BUCKET_METRES = 16;
const polygonCells = new Map<string, typeof indexedPolygons>();
const EDGE_BUCKET_METRES=8;
const pavementEdgeCells=new Map<string,RingEdge[]>();
for (const entry of indexedPolygons) {
  indexSourceRing(entry.polygon.outer);
  for (const ring of entry.polygon.holes) indexSourceRing(ring);
  for(const ring of [entry.polygon.outer,...entry.polygon.holes])for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const[ax,az]=ring[j],[bx,bz]=ring[i],dx=bx-ax,dz=bz-az,length2=dx*dx+dz*dz;if(length2<1e-18)continue;
    const edge:RingEdge={ax,az,bx,bz,dx,dz,length2,minX:Math.min(ax,bx),maxX:Math.max(ax,bx),minZ:Math.min(az,bz),maxZ:Math.max(az,bz)};
    for(let column=Math.floor(edge.minX/EDGE_BUCKET_METRES);column<=Math.floor(edge.maxX/EDGE_BUCKET_METRES);column++)for(let row=Math.floor(edge.minZ/EDGE_BUCKET_METRES);row<=Math.floor(edge.maxZ/EDGE_BUCKET_METRES);row++){
      const key=column+":"+row,bucket=pavementEdgeCells.get(key)??[];bucket.push(edge);pavementEdgeCells.set(key,bucket);
    }
  }
  for (
    let column = Math.floor(entry.minX / POLYGON_BUCKET_METRES);
    column <= Math.floor(entry.maxX / POLYGON_BUCKET_METRES);
    column++
  )
    for (
      let row = Math.floor(entry.minZ / POLYGON_BUCKET_METRES);
      row <= Math.floor(entry.maxZ / POLYGON_BUCKET_METRES);
      row++
    ) {
      const key = column + ":" + row,
        bucket = polygonCells.get(key) ?? [];
      bucket.push(entry);
      polygonCells.set(key, bucket);
    }
}

/** The SAME joined surfaces used by the renderer, including mapped parking.
 * Use for grass/tree rejection instead of the former universal road widths.
 * This returns a material, not a claim about surveyed pavement or elevation.
 */
export function streetSurfaceAt(
  x: number,
  z: number,
): StreetMaterial | undefined {
  for (const entry of polygonCells.get(
    Math.floor(x / POLYGON_BUCKET_METRES) +
      ":" +
      Math.floor(z / POLYGON_BUCKET_METRES),
  ) ?? []) {
    if (x < entry.minX || x > entry.maxX || z < entry.minZ || z > entry.maxZ)
      continue;
    if (streetPolygonContains(entry.polygon, x, z)) return entry.material;
  }
  return undefined;
}
/** Optional conservative grass/prop clearance against actual surface edges.
 * margin0 is exactly the prior indexed polygon predicate. Outer and hole edges
 * share one small-cell edge index: no second point-in-polygon pass is added.
 */
export function isStreetSurface(x:number,z:number,margin=0){
  if(streetSurfaceAt(x,z)!==undefined)return true;
  if(!(margin>0)||!Number.isFinite(margin))return false;
  const limit=margin*margin;
  for(let column=Math.floor((x-margin)/EDGE_BUCKET_METRES);column<=Math.floor((x+margin)/EDGE_BUCKET_METRES);column++)for(let row=Math.floor((z-margin)/EDGE_BUCKET_METRES);row<=Math.floor((z+margin)/EDGE_BUCKET_METRES);row++)for(const edge of pavementEdgeCells.get(column+":"+row)??[]){
    if(x<edge.minX-margin||x>edge.maxX+margin||z<edge.minZ-margin||z>edge.maxZ+margin)continue;
    const t=Math.max(0,Math.min(1,((x-edge.ax)*edge.dx+(z-edge.az)*edge.dz)/edge.length2));
    const dx=x-edge.ax-t*edge.dx,dz=z-edge.az-t*edge.dz;if(dx*dx+dz*dz<=limit)return true;
  }
  return false;
}

export function nearestStreet(x: number, z: number, roadsOnly = false) {
  let nearest:
    | {
        feature: StreetFeature;
        distance: number;
        x: number;
        z: number;
        dx: number;
        dz: number;
      }
    | undefined;
  // Within the explicitly traced footprint, use its local interpreted axis
  // and width, not the displaced raw OSM centreline's 7 m class estimate.
  // The raw feature remains available unchanged everywhere in source data.
  const features =
    roadsOnly && isCalibratedRoadFootprint(x, z)
      ? CALIBRATED_ROAD_FEATURES
      : STREET_FEATURES;
  for (const feature of features) {
    if (roadsOnly && feature.kind !== "road") continue;
    for (let i = 1; i < feature.points.length; i++) {
      const a = feature.points[i - 1],
        b = feature.points[i];
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        length2 = dx * dx + dz * dz;
      if (length2 < 1e-8) continue;
      const t = Math.max(
        0,
        Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2),
      );
      const px = a[0] + t * dx,
        pz = a[1] + t * dz;
      const distance = Math.hypot(x - px, z - pz);
      if (!nearest || distance < nearest.distance)
        nearest = {
          feature,
          distance,
          x: px,
          z: pz,
          dx: dx / Math.sqrt(length2),
          dz: dz / Math.sqrt(length2),
        };
    }
  }
  return nearest;
}

export const PHOTO_LAMPS = photoLampsRaw;
const sourceLamps = [
  ...STREETS.lamps.map((lamp) => ({
    ...lamp,
    modelStyle: "generic-street-pole",
  })),
  ...PHOTO_LAMPS.placements.map((lamp) => ({
    ...lamp,
    tags: { highway: "street_lamp" },
    source: PHOTO_LAMPS.source,
  })),
];
export const LAMP_PLACEMENTS = sourceLamps
  .filter(
    (lamp) =>
      lamp.x >= STREETS.bounds.minX &&
      lamp.x <= STREETS.bounds.maxX &&
      lamp.z >= STREETS.bounds.minZ &&
      lamp.z <= STREETS.bounds.maxZ,
  )
  .map((lamp) => {
    const street = nearestStreet(lamp.x, lamp.z);
    return {
      ...lamp,
      groundY: groundHeight(lamp.x, lamp.z),
      yaw: street ? Math.atan2(street.x - lamp.x, street.z - lamp.z) : 0,
      lightRangeMetres: 22,
      lightingProvenance: "simulated-bounded-art-light-not-measured-lumens",
      modelProvenance: "generic-fixture-not-a-surveyed-luminaire",
      orientationProvenance: "inferred-facing-nearest-mapped-path",
    };
  });

/** Full box dimensions, equal to the rendered pole/base. No fictional curbs
 * or unknown stair elevations are inserted into the navigable network.
 */
export const STREET_COLLISIONS = LAMP_PLACEMENTS.flatMap((lamp) => [
  {
    id: `lamp:${lamp.id}:pole`,
    kind: "lamp" as const,
    x: lamp.x,
    y: lamp.groundY + lamp.height / 2,
    z: lamp.z,
    w: 0.16,
    h: lamp.height,
    d: 0.16,
    yaw: 0,
  },
  {
    id: `lamp:${lamp.id}:base`,
    kind: "lamp" as const,
    x: lamp.x,
    y: lamp.groundY + 0.09,
    z: lamp.z,
    w: 0.28,
    h: 0.18,
    d: 0.28,
    yaw: 0,
  },
]);

/** OSM's legacy uncontrolled means marked without signals, not unmarked.
 * An explicit crossing:markings=no takes precedence over that legacy tag.
 * Source: https://wiki.openstreetmap.org/wiki/Tag:crossing=uncontrolled */
export function crossingHasMarkings(tags: Record<string, string>) {
  const explicit = tags["crossing:markings"];
  if (explicit === "no") return false;
  if (["yes", "zebra"].includes(explicit)) return true;
  return ["marked", "zebra", "uncontrolled"].includes(tags.crossing);
}

export const CROSSING_MARKINGS = STREETS.crossings.flatMap((crossing) => {
  const marked = crossingHasMarkings(crossing.tags);
  const road = marked ? nearestStreet(crossing.x, crossing.z, true) : undefined;
  if (!road || road.distance > road.feature.width / 2 + 1) return [];
  return [
    {
      ...crossing,
      roadWidth: road.feature.width,
      dx: road.dx,
      dz: road.dz,
      geometryProvenance: "mapped-marking-existence-generic-stripe-dimensions",
    },
  ];
});
