import { mkdir, writeFile, readFile } from "node:fs/promises";
const coverage=JSON.parse(await readFile('shared/data/campus-coverage.json','utf8'));
const {south,west,north,east}=coverage.osmBBox;
const query =
  `[out:json][timeout:35];(way["building"](${south},${west},${north},${east});way["highway"](${south},${west},${north},${east}););out tags geom;`;
let payload;
for (const endpoint of process.argv.includes('--cached-xml')?[]:[
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
]) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw new Error(String(response.status));
    payload = await response.json();
    break;
  } catch (error) {
    console.error(endpoint, String(error));
  }
}
if (!payload) {
  let xml;
  try {
    xml = await readFile(".cache/osm.xml", "utf8");
  } catch {
    const response = await fetch(
      `https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`,
      { headers: { "User-Agent": "StrahovCrazyShow/0.1 local demo" } },
    );
    if (!response.ok)
      throw new Error(`OSM map download failed: ${response.status}`);
    xml = await response.text();
  }
  const attrs = (source) =>
    Object.fromEntries(
      [...source.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [
        m[1],
        m[2].replaceAll("&amp;", "&").replaceAll("&quot;", '"'),
      ]),
    );
  const nodes = new Map(
    [...xml.matchAll(/<node\b([^>]*?)(?:\/>|>[\s\S]*?<\/node>)/g)].map((m) => {
      const a = attrs(m[1]);
      return [a.id, { lat: Number(a.lat), lon: Number(a.lon) }];
    }),
  );
  payload = {
    elements: [...xml.matchAll(/<way\b([^>]+)>([\s\S]*?)<\/way>/g)].map(
      (m) => ({
        id: attrs(m[1]).id,
        tags: Object.fromEntries(
          [...m[2].matchAll(/<tag\b([^>]+)\/>/g)].map((t) => {
            const a = attrs(t[1]);
            return [a.k, a.v];
          }),
        ),
        geometry: [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)]
          .map((n) => nodes.get(n[1]))
          .filter(Boolean),
      }),
    ),
  };
}
const origin = coverage.origin;
const project = (p) => [
  Number(
    (
      (p.lon - origin.lon) *
      111320 *
      Math.cos((origin.lat * Math.PI) / 180)
    ).toFixed(2),
  ),
  Number((-(p.lat - origin.lat) * 111320).toFixed(2)),
];
const buildings = [],
  paths = [];
for (const way of payload.elements) {
  if (!way.geometry?.length) continue;
  const points = way.geometry.map(project),
    tags = way.tags || {};
  if (tags.building)
    buildings.push({
      id: String(way.id),
      name: tags.name || tags["addr:housenumber"] || "",
      points,
      height:
        Number.parseFloat(tags.height) ||
        Number(tags["building:levels"] || 5) * 3,
      source: `https://www.openstreetmap.org/way/${way.id}`,
      tags,
    });
  else if(tags.highway)paths.push({ id: String(way.id), points, kind: tags.highway });
}
await mkdir("shared/data", { recursive: true });
await writeFile(
  "shared/data/map.json",
  JSON.stringify(
    {
      origin,
      buildings,
      paths,
      source: "© OpenStreetMap contributors · ODbL 1.0",
      fetchedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  `Saved ${buildings.length} buildings and ${paths.length} paths from real OSM geometry.`,
);
