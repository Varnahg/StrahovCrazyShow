// Reproducible catalogue from existing map inputs. No network and no map rewrite.
// Run from repository root: node docs/world-architecture/build-catalog.mjs
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const mapText = await readFile("shared/data/map.json", "utf8");
const xml = await readFile(".cache/osm.xml", "utf8");
const map = JSON.parse(mapText);
const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const tags = (s) => Object.fromEntries([...s.matchAll(/<tag\b([^>]+)\/>/g)].map((m) => { const a = attrs(m[1]); return [a.k, a.v]; }));
const nodes = new Map([...xml.matchAll(/<node\b([^>]*?)(?:\/>|>[\s\S]*?<\/node>)/g)].map((m) => { const a = attrs(m[1]); return [a.id, [+a.lon, +a.lat]]; }));
const ways = new Map([...xml.matchAll(/<way\b([^>]+)>([\s\S]*?)<\/way>/g)].map((m) => { const a = attrs(m[1]); return [a.id, { ...a, tags: tags(m[2]), refs: [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((n) => n[1]) }]; }));
const relations = new Map([...xml.matchAll(/<relation\b([^>]+)>([\s\S]*?)<\/relation>/g)].map((m) => { const a = attrs(m[1]); return [a.id, { ...a, tags: tags(m[2]), members: [...m[2].matchAll(/<member\b([^>]+)\/>/g)].map((n) => attrs(n[1])) }]; }));
const project = ([lon, lat]) => [+((lon - map.origin.lon) * 111320 * Math.cos(map.origin.lat * Math.PI / 180)).toFixed(2), +(-(lat - map.origin.lat) * 111320).toFixed(2)];
const source = (id, label, url, extra = {}) => ({ id, label, url, checkedAt: "2026-10-10", ...extra });
const sources = [
  source("osm", "OpenStreetMap contributors", "https://www.openstreetmap.org/copyright", { license: "ODbL-1.0", evidence: "Exact existing OSM IDs, footprints and tags; not an on-site survey." }),
  source("sh-campus", "Silicon Hill – Koleje Strahov", "https://www.siliconhill.cz/koleje-strahov"),
  source("sh-b6", "Silicon Hill Wiki – Blok 6", "https://wiki.sh.cvut.cz/kolej/bloky/blok_6"),
  source("sh-b6-plan", "Plán B6, wiki metadata 20. 3. 2023", "https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg", { license: "CC-BY-SA-4.0", localPath: "docs/references/media/blok-6-plan-2023.jpg" }),
  source("sh-map", "Silicon Hill – orientační mapa areálu", "https://www.siliconhill.cz/uploads/mapa3.jpg"),
  source("sh-galleries", "Silicon Hill – archiv fotogalerií", "https://www.siliconhill.cz/photogalleries", { coverage: "Discovery source; individual albums still need identification and permission review." }),
  source("ctu-exteriors-2024", "ČVUT – Exteriéry kolejí Strahov", "https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov", { captureDate: "2024-06-20", author: "Jiří Ryszawy", photoCount: 12, usage: "Reference links only. Outside ČVUT, reproduction requires written approval under the published rules." }),
  source("ctu-b4-2024", "ČVUT – Rekonstruovaný blok 4", "https://media.cvut.cz/cs/foto/20240620-rekonstruovany-blok-4-strahovskych-koleji", { captureDate: "2024-06-20", author: "Jiří Ryszawy", photoCount: 62, usage: "Reference links only." }),
  source("ctu-opening-2024", "ČVUT – Otevření bloku 4, návštěva bloku 3", "https://media.cvut.cz/cs/foto/20240620-slavnostni-otevreni-rekonstruovaneho-bloku-4", { captureDate: "2024-06-20", author: "Jiří Ryszawy", photoCount: 57, usage: "Mixed B3/B4 album. Do not assign all photos to B4." }),
  source("ctu-rooms-2016", "ČVUT – Pokoje na kolejích Strahov", "https://media.cvut.cz/cs/foto/20161116-pokoje-na-kolejich-strahov", { captureDate: "2016-11-16", photoCount: 15, usage: "Historical interior reference; individual block identification not supplied by album title." }),
  source("ctu-media-rules", "ČVUT – Pravidla používání Mediatéky", "https://media.cvut.cz/cs/pravidla-pouzivani"),
  source("ctu-menza", "SÚZ ČVUT – Menza Strahov, Jezdecká 1920/1", "https://www.suz.cvut.cz/cz/menzy-stravovani/menza-strahov"),
  source("ctu-block1", "SÚZ ČVUT – Bufet v přízemí budovy ředitelství, blok 1", "https://www.suz.cvut.cz/cz/menzy-stravovani"),
  source("commons-campus", "Wikimedia Commons – Koleje Strahov", "https://commons.wikimedia.org/wiki/Category:Koleje_Strahov", { photoCount: 22, usage: "Each file has its own licence, author and date." }),
  source("commons-b12", "Wikimedia Commons – Strahov, studentská kolej č.12", "https://commons.wikimedia.org/wiki/File:Strahov,_studentsk%C3%A1_kolej_%C4%8D.12.JPG", { captureDate: "2009-10-06", author: "Ondrej.konicek", license: "CC-BY-SA-3.0", usage: "Historical facade detail; not proof of 2026 condition." }),
  source("commons-stadium", "Wikimedia Commons – Praha Strahovsky stadion", "https://commons.wikimedia.org/wiki/File:Praha_Strahovsky_stadion.jpg", { captureDate: "2005-08-27", author: "che; image enhancement Miraceti", license: "CC-BY-SA-2.5", usage: "Historical broad spatial reference." }),
];
const exteriorBase = "https://media.cvut.cz/sites/media/files/content/photos/4747a232-056d-41a1-8baa-a2255d7d7efb/";
const photoReferences = [
  { id: "b4-end-small-windows", sourceId: "ctu-exteriors-2024", slide: 1, imageUrl: exteriorBase + "958a2185-7a8b-46e5-96f5-eddfdc1aa790.jpg", osmIds: ["53929057"], visuallyReviewed: true, identity: "confirmed-visible-number", observations: ["Grey panelled end wall", "Small paired openings", "Projecting blue-white number 4 sign"] },
  { id: "b4-entrance-wing", sourceId: "ctu-exteriors-2024", slide: 2, imageUrl: exteriorBase + "f3452ed9-9cab-4197-946b-b0c92ded8913.jpg", osmIds: ["53929057"], visuallyReviewed: true, identity: "confirmed-visible-number", observations: ["Offset projecting wing", "Small paired openings in grey panels", "Flat roofline"] },
  { id: "campus-long-facade", sourceId: "ctu-exteriors-2024", slide: 3, imageUrl: exteriorBase + "fe9b7d5b-facc-479d-9e50-1c07806041ce.jpg", osmIds: [], visuallyReviewed: true, identity: "typology-only-block-number-not-visible", observations: ["Off-white rendered long facade", "Regular wide three-part room windows", "Dark brown frames and recesses"] },
  { id: "b4-end-blank-panel", sourceId: "ctu-exteriors-2024", slide: 8, imageUrl: exteriorBase + "30144e31-7c32-46b1-bd71-1b5f45600249.jpg", osmIds: ["53929057"], visuallyReviewed: true, identity: "confirmed-visible-number", observations: ["Large blank grey panel face with white number 4", "Vertical strip of wider horizontal windows beside blank face", "No repetitive room-window grid over blank face"] },
  { id: "menza-front", sourceId: "ctu-exteriors-2024", slide: 9, imageUrl: exteriorBase + "f8f6ea08-e636-468c-a495-36ec03be3688.jpg", osmIds: ["8111356"], visuallyReviewed: true, identity: "confirmed-sign-and-official-address", observations: ["Readable Menza Strahov sign", "Large glazed entrance wall", "Cream/yellow small cladding panels", "Entrance stairs with white railing"] },
  { id: "campus-red-wing", sourceId: "ctu-exteriors-2024", slide: 10, imageUrl: exteriorBase + "4bf030d9-1afd-42de-971d-b9a7c177cd92.jpg", osmIds: [], visuallyReviewed: true, identity: "unresolved-no-visible-number", observations: ["White facade with red vertical wing", "Petřín tower behind trees", "Parking, pedestrian path and lawn"], warning: "Do not assign this to a block from colour alone." },
  { id: "b4-shared-bathroom-2024", sourceId: "ctu-b4-2024", slide: 1, imageUrl: "https://media.cvut.cz/sites/media/files/content/photos/1a9fbb77-c02d-4a25-97c7-4cdcb7049f52/13802908-16c1-4d11-8c1f-e05a12538c12.jpg", osmIds: ["53929057"], visuallyReviewed: true, identity: "source-labelled-b4-interior", observations: ["White walls and floor", "Large grey wall tiles", "Four wall-mounted washbasins", "Shower partition and curtain", "Exposed ventilation duct"], warning: "This reconstructed B4 interior does not establish B6 materials or layout." },
  { id: "b12-historical-numbered-detail", sourceId: "commons-b12", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/49/Strahov%2C_studentsk%C3%A1_kolej_%C4%8D.12.JPG", osmIds: ["53921168"], visuallyReviewed: true, identity: "confirmed-sign-12B", observations: ["12 B VCHOD sign", "Narrow vertically subdivided windows", "Off-white facade with weathering"], warning: "Historical 2009 condition; no inference of current damage." },
  { id: "stadium-historical-overview", sourceId: "commons-stadium", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/b0/Praha_Strahovsky_stadion.jpg", osmIds: [], landmarkId: "great-strahov-stadium", visuallyReviewed: true, identity: "source-labelled-and-distinct-sports-bowl", observations: ["Open stadium bowl", "Tiered stands", "Concrete support rhythm below elevated stands", "Dormitory slabs are separate foreground structures"], warning: "Historical 2005 skyline reference; not proof of 2026 finishes." },
  { id: "b6-plan", sourceId: "sh-b6-plan", osmIds: ["53929071"], imageUrl: "https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg", visuallyReviewed: true, identity: "source-labelled", observations: ["Axonometric floors and basement", "Rooms beside corridor", "Stair/entrance projection", "No dimensions or north arrow"], existingAtlasId: "b6-plan-2023" },
  { id: "b6-north-panorama", sourceId: "sh-b6", osmIds: ["53929071"], visuallyReviewed: false, identity: "previous-reference-atlas", existingAtlasId: "b6-google-streetview-2025", observations: ["See existing atlas for individually reviewed 2025 panorama, camera coordinates and original provider URL."] },
  { id: "b6-east-access", sourceId: "sh-b6", osmIds: ["53929071"], visuallyReviewed: false, identity: "previous-reference-atlas", existingAtlasId: "b6-cajovna-east-entrance", observations: ["East-side access between B6 and B7; exact basement doors not surveyed."] },
  { id: "b7-club-entry", sourceId: "sh-campus", osmIds: ["53929068"], visuallyReviewed: false, identity: "previous-reference-atlas", existingAtlasId: "seven-google-streetview-2024", observations: ["007 entrance in basement of B7; neighbouring Sport bar is a different venue."] },
  { id: "rko-east-wall", sourceId: "sh-campus", osmIds: ["7645350"], visuallyReviewed: false, identity: "previous-reference-atlas", existingAtlasId: "rko-mapy-panorama-2023", observations: ["Shared low building; exact bar/store division and entrance not surveyed."] },
];

function footprint(points) {
  let best = { area: Infinity };
  for (let i = 1; i < points.length; i++) {
    const [px, pz] = points[i - 1], [x, z] = points[i];
    if (Math.hypot(x - px, z - pz) < 0.05) continue;
    const angle = Math.atan2(z - pz, x - px), c = Math.cos(angle), s = Math.sin(angle);
    const rotated = points.map(([x, z]) => [c * x + s * z, -s * x + c * z]);
    const us = rotated.map((p) => p[0]), vs = rotated.map((p) => p[1]);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    if ((u1 - u0) * (v1 - v0) >= best.area) continue;
    const u = (u0 + u1) / 2, v = (v0 + v1) / 2;
    best = { area: (u1 - u0) * (v1 - v0), center: { x: +(c * u - s * v).toFixed(3), z: +(s * u + c * v).toFixed(3) }, width: +(u1 - u0).toFixed(3), depth: +(v1 - v0).toFixed(3), yaw: -angle };
  }
  let area = 0;
  for (let i = 1; i < points.length; i++) area += points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1];
  return { ...best, area: +(Math.abs(area) / 2).toFixed(3), envelopeArea: +best.area.toFixed(3), precision: "derived-from-osm-not-surveyed" };
}
function architecture(building) {
  const t = building.tags ?? {};
  const block = +(building.name.match(/blok\s+(\d+)/i)?.[1] ?? 0) || null;
  let kind = "unknown", facade = "none", confidence = "osm-typology-only", roof = t["roof:shape"] || "unverified";
  const characteristics = [];
  const sourceIds = ["osm"];
  if (block === 1) {
    kind = "administration"; facade = "administration"; confidence = "official-identity"; sourceIds.push("ctu-block1", "sh-campus");
    characteristics.push("Block 1 is the administration building with a buffet, not a six-storey accommodation slab.", "Preserve its compound OSM footprint; floors/height in OSM remain unverified.");
  } else if (block) {
    kind = "dormitory"; facade = block === 12 ? "dormitory-low" : block === 8 ? "dormitory-cell" : "dormitory-standard";
    confidence = block === 4 || block === 6 || block === 7 ? "identity-and-photo-features" : "osm-identity-typology";
    sourceIds.push("sh-campus");
    characteristics.push("Use the original irregular footprint with entrance projection, not an axis-aligned rectangle.", "Long facade room-window rhythm differs from sparse end-wall openings.", "Flat roof; glazing proportions and exact spacing need a per-facade survey.");
    if (block === 4) { sourceIds.push("ctu-exteriors-2024", "ctu-b4-2024", "ctu-opening-2024"); characteristics.push("B4 grey end panels include a large blank numbered face and a narrow strip of horizontal openings.", "Reconstructed interior shown in 2024 is not a template for all other blocks."); }
    if (block === 6) { sourceIds.push("sh-b6", "sh-b6-plan"); characteristics.push("B6 has a western entrance projection and eastern basement venue access; schematic game interior is approximate.", "Community rooms occupy mezzanines; do not equate wiki floor labels with evenly spaced game floors."); }
    if (block === 7) characteristics.push("Basement venue Klub 007; neighbouring Sport bar must not become the same entrance.");
    if (block === 8) characteristics.push("B8 has a cell-based interior arrangement; do not reuse the B6 corridor plan.");
    if (block === 11) characteristics.push("Shorter and wider irregular OSM volume; do not force the 70 m standard slab envelope.");
    if (block === 12) { sourceIds.push("commons-b12"); characteristics.push("Lower three-level OSM building; do not repeat six levels of windows.", "2009 facade reference is historical, current condition is not verified."); }
  } else if (building.id === "7645350") {
    kind = "commercial"; facade = "commercial-low"; confidence = "identity-and-photo-features";
    characteristics.push("Potraviny and Recharging Bar occupy the same low building shell.", "Not a dormitory; no multi-floor dormitory window grid.", "Bar POI is not a measured door and does not occupy the entire footprint by default."); sourceIds.push("sh-campus");
  } else if (building.id === "8111356") {
    kind = "canteen"; facade = "canteen-glazing"; confidence = "official-identity-and-photo";
    characteristics.push("Menza Strahov, Jezdecká 1920/1; separate from block 1 buffet.", "Large entrance glazing, cream/yellow panel cladding and white stair rails observed in 2024."); sourceIds.push("ctu-menza", "ctu-exteriors-2024");
  } else if (t.barrier === "city_wall" || t.man_made === "city_wall") {
    kind = "fortification"; facade = "stone-wall"; characteristics.push("Historic wall/bastion outline, not accommodation. Never add a dormitory window grid.");
  } else if (t.building === "garage") {
    kind = "garage"; facade = "industrial"; characteristics.push("Low garage/service volume; openings are not established by the footprint.");
  } else if (t.building === "shed" || t.building === "roof") {
    kind = "shed"; facade = "none";
  } else if (t.power === "substation" || t.building === "service" || t.building === "industrial") {
    kind = "service"; facade = "industrial";
  } else if (t.building === "office") {
    kind = "administration"; facade = "administration";
  } else if (t.building === "transportation") {
    kind = "transport"; facade = "none";
  } else if (["civic", "commercial", "retail"].includes(t.building)) {
    kind = "civic"; facade = "none";
  }
  const explicit = Number.parseFloat(t.height);
  const levels = Number.parseFloat(t["building:levels"]);
  let height = building.height, heightProvenance = "legacy-fallback-unverified";
  if (Number.isFinite(explicit) && explicit > 0) heightProvenance = "osm-height";
  else if (Number.isFinite(levels) && levels > 0) heightProvenance = "osm-levels-times-3m-approximate";
  else {
    const inferred = { garage: 3.6, service: 4.5, shed: 3.5 }[kind];
    if (inferred) { height = inferred; heightProvenance = "typology-inferred-approximate"; characteristics.push("Render/collision height is a clearly inferred low-rise fallback, not a measured dimension."); }
  }
  return { osmId: building.id, name: building.id === "8111356" ? "Menza Strahov" : building.name || "Neidentifikovaný objekt", kind, facade, roof, block, confidence, sourceIds, photoIds: photoReferences.filter((p) => p.osmIds.includes(building.id)).map((p) => p.id), characteristics, renderHeight: height, heightProvenance, sourceHeight: building.height, measuredHeight: null, entranceSurveyed: false, footprint: footprint(building.points) };
}

function stitchRings(members, role) {
  const pending = members.filter((m) => m.type === "way" && m.role === role).map((m) => {
    const w = ways.get(m.ref);
    if (!w) throw new Error(`Missing stadium way ${m.ref}`);
    const missing = w.refs.filter((ref) => !nodes.has(ref));
    if (missing.length) throw new Error(`Missing stadium nodes: ${missing.join(",")}`);
    return [...w.refs];
  });
  const rings = [];
  while (pending.length) {
    const refs = pending.shift();
    while (refs.at(-1) !== refs[0]) {
      const tail = refs.at(-1);
      const next = pending.findIndex((r) => r[0] === tail || r.at(-1) === tail);
      if (next < 0) throw new Error(`Open stadium ${role} ring at ${tail}`);
      const segment = pending.splice(next, 1)[0];
      if (segment[0] !== tail) segment.reverse();
      refs.push(...segment.slice(1));
    }
    rings.push(refs.map((ref) => project(nodes.get(ref))));
  }
  return rings;
}
const stadiumRelation = relations.get("1515034"), identityRelation = relations.get("1515375");
if (!stadiumRelation || !identityRelation) throw new Error("Missing stadium relations in existing OSM input");
const stadium = {
  id: "great-strahov-stadium", name: "Velký strahovský stadion", kind: "stadium", facade: "stadium-concrete", decorativeOnly: true, addedToCollisionWorld: false,
  source: "https://www.openstreetmap.org/relation/1515034", identitySource: "https://www.openstreetmap.org/relation/1515375", sourceIds: ["osm", "commons-stadium"],
  confidence: "osm-multipolygon-complete-and-historical-photo", height: +stadiumRelation.tags.height, heightProvenance: "osm-height", osmVersion: +stadiumRelation.version, osmTimestamp: stadiumRelation.timestamp,
  outerRings: stitchRings(stadiumRelation.members, "outer"), innerRings: stitchRings(stadiumRelation.members, "inner"),
  parts: [...ways.values()].filter((w) => w.tags["building:part"] === "stadium").map((w) => {
    if (w.refs.some((ref) => !nodes.has(ref))) throw new Error(`Incomplete stadium part ${w.id}`);
    return { osmId: w.id, points: w.refs.map((ref) => project(nodes.get(ref))), height: +(w.tags.height || stadiumRelation.tags.height), heightProvenance: w.tags.height ? "osm-height" : "parent-height-approximate", source: `https://www.openstreetmap.org/way/${w.id}` };
  }),
  characteristics: ["Open sports bowl with a real inner void, concrete tribunes and distinct taller stand parts.", "Never fill the inner sports field with a solid building roof.", "No accommodation facade or generic room-window grid.", "Imported geometry was previously absent because fetch-map imports only building ways, not building multipolygon relations.", "Backdrop west of current playable bounds; this does not enlarge the walkable area."],
};
const catalog = {
  schemaVersion: 1, checkedAt: "2026-10-10", origin: map.origin,
  coordinates: "Same local metre system as map.json: x east, z south. footprint.yaw is Babylon rotation.y (local x axis follows edge); envelope includes projections and is not a room plan.",
  license: "OSM-derived geometry © OpenStreetMap contributors, ODbL-1.0. Photographs are reference links with separate licences.",
  inputHashes: { mapSha256: createHash("sha256").update(mapText).digest("hex"), osmSha256: createHash("sha256").update(xml).digest("hex") },
  notes: ["Identity, observed features and dimensions have separate confidence. No entry claims measured door positions or on-site height.", "All existing map buildings are catalogued, including landmarks outside playable bounds.", "Generic window grids are permitted only on catalogued dormitories and must distinguish long and short facades.", "Existing reference atlas stores full Google/Mapy links. No provider imagery was copied into runtime assets."],
  sources, photoReferences, entries: map.buildings.map(architecture), landmarks: [stadium],
};
await writeFile("shared/data/building-catalog.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(JSON.stringify({ buildings: catalog.entries.length, photoReferences: photoReferences.length, stadiumOuterVertices: stadium.outerRings.map((r) => r.length), stadiumInnerVertices: stadium.innerRings.map((r) => r.length), stadiumParts: stadium.parts.length, inferredHeights: catalog.entries.filter((e) => e.heightProvenance === "typology-inferred-approximate").map((e) => ({ id: e.osmId, kind: e.kind, previous: e.sourceHeight, next: e.renderHeight })) }, null, 2));
