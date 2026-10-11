// Structured exploration of already documented, individually inspected panoramas.
// No images, API tokens, provider tiles or navigation graph are downloaded.
import { readFile, writeFile } from "node:fs/promises";
const atlas = JSON.parse(await readFile("docs/references/atlas.json", "utf8"));
const map = JSON.parse(await readFile("shared/data/map.json", "utf8"));
const facadeCoverage = {
  "b6-google-streetview-2025": { osmId: "53929071", facades: ["north-end"], features: ["Number 6", "Small end openings", "Entrance projection context"], occlusions: ["Parked cars", "No complete view of west/east long facade"] },
  "b6-mapy-panorama-2023": { osmId: "53929071", facades: ["north-end", "west-entrance-projection-context"], features: ["End wall", "Covered entrance side", "Paths/grass/parking"], occlusions: ["No complete view of south-end or east long facade"] },
  "seven-google-streetview-2024": { osmId: "53929068", facades: ["south-end", "east-southern-section"], features: ["Number 7", "Exterior staircase", "Basement entrance marked 007"], occlusions: ["Not the entire east facade", "Northern section and west facade unverified"] },
  "seven-mapy-sportbar-2022": { osmId: "53929068", facades: ["south-adjoining-structure"], features: ["Separate Sport bar", "Outdoor seating", "Paving and fence"], occlusions: ["Do not mistake this view for the Klub 007 door"] },
  "rko-mapy-panorama-2023": { osmId: "7645350", facades: ["east-end"], features: ["Painted facade", "Upper small windows", "Lower barred openings", "Flue and parcelbox", "Slope context"], occlusions: ["Exact Recharging Bar entrance not established", "Northern/southern long facades not fully covered"] },
};
const stations = atlas.references.filter((r) => r.kind === "panorama").map((r) => {
  const url = new URL(r.url);
  const fov = url.searchParams.get("fov");
  const isGoogle = r.source.includes("Google");
  const googleFov = r.url.match(/,(\d+(?:\.\d+)?)y,/);
  return {
    id: r.id, provider: r.source, panoramaId: r.panoramaId, url: r.url, checkedAt: r.checkedAt, captureDate: r.captureDate, captureDatePrecision: r.captureDatePrecision,
    camera: { lat: r.location.lat, lon: r.location.lon, localX: +((r.location.lon - map.origin.lon) * 111320 * Math.cos(map.origin.lat * Math.PI / 180)).toFixed(2), localZ: +(-(r.location.lat - map.origin.lat) * 111320).toFixed(2), height: null, positionSource: "existing-reviewed-atlas-provider-url-not-survey" },
    heading: r.heading, pitch: isGoogle ? { value: 0, unit: "degree", evidence: "pitch=0 encoded in existing panorama URL thumbnail reference" } : null,
    fov: fov ? { value: +fov, unit: "radian", evidence: "Original Mapy.com fov URL parameter" } : googleFov ? { value: +googleFov[1], unit: "degree", evidence: "Original Google panorama URL y parameter; not an on-site camera calibration" } : null,
    archiveAllowed: false, visuallyReviewed: "prior-reference-atlas", ...facadeCoverage[r.id],
    navigationLinks: [], navigationStatus: "provider-neighbour-links-not-yet-recorded", description: r.description,
  };
});
const result = {
  schemaVersion: 1, checkedAt: "2026-10-10", coordinateSystem: "WGS84 plus local x east/z south metres, origin from map.json", stations,
  plannedInspectionLinks: [
    { from: "b6-google-streetview-2025", to: "seven-google-streetview-2024", status: "inspection-itinerary-only-not-a-verified-panorama-edge", purpose: "Follow both long B6/B7 facades and the connecting pedestrian spaces, recording real provider steps." },
    { from: "seven-google-streetview-2024", to: "rko-mapy-panorama-2023", status: "inspection-itinerary-only-different-providers", purpose: "Cross-check B7, Potraviny/Recharging Bar and surrounding paths from several viewpoints." },
  ],
  requiredCoverage: [
    { osmId: "53929071", name: "B6", missing: ["Unobstructed west long facade", "Unobstructed east long facade", "South end", "Exact east-side basement doors", "Entrance/stair dimensions and height section"] },
    { osmId: "53929068", name: "B7 / 007", missing: ["North end", "West long facade", "Remaining east facade", "Exact boundary to separate Sport bar", "Measured basement plan"] },
    { osmId: "7645350", name: "Potraviny / Recharging Bar", missing: ["North long facade", "South long facade", "West end", "Exact bar door", "Store/bar internal division", "Terrain levels around all sides"] },
  ],
  workflow: [
    "Open an existing real station and record provider pano ID, camera coordinates, native heading/pitch/FOV and acquisition date before moving.",
    "Use normal provider arrows to move to the next connected station; save the new observed URL and the actual directed neighbour link. Never infer that two nearby panoramas are linked.",
    "Associate each observation with OSM building ID and a particular facade/entrance, not just a nearby map pin.",
    "Compare each wall from two or more distinct stations. Note cars, foliage, stitching distortions, date differences and reconstruction.",
    "Separate observed count/proportion/material from measured dimensions. Geodata anchors the footprint; photos are not a calibrated 3D survey.",
    "The GeoGuessr-like mechanism is movement through a graph of panoramic camera stations; it supplies a way to inspect the campus, not a downloadable 3D model.",
    "Keep Google/Mapy/GeoGuessr images on the original service. Use licensed originals or own photo sets for texture assets/photogrammetry.",
  ],
};
await writeFile("docs/world-architecture/panorama-survey.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ stations: stations.length, realNeighbourEdges: 0, note: "Existing individually reviewed points only; no invented connected panorama graph." }));
