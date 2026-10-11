// Collect only publicly displayed photo URLs and gallery metadata, never ČVUT images.
// The two separately licensed Commons originals may be archived with attribution.
// Run: node docs/world-architecture/collect-photo-links.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const catalog = JSON.parse(await readFile("shared/data/building-catalog.json", "utf8"));
const galleryIds = ["ctu-exteriors-2024", "ctu-b4-2024", "ctu-opening-2024", "ctu-rooms-2016"];
const galleries = await Promise.all(galleryIds.map(async (id) => {
  const source = catalog.sources.find((s) => s.id === id);
  const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Gallery ${id}: ${response.status}`);
  const html = await response.text();
  const photos = [...html.matchAll(/<li\s+data-src="([^"]+)"\s+data-download-url="([^"]+)"/g)].map((m, index) => {
    const reviewed = catalog.photoReferences.find((p) => p.imageUrl === m[2]);
    return { slide: index + 1, photoId: m[2].split("/").at(-1).replace(/\.jpg$/i, ""), previewUrl: m[1].replaceAll("&amp;", "&"), imageUrl: m[2], galleryUrl: `${source.url}#lg=1&slide=${index}`, archiveAllowed: false, visuallyReviewed: reviewed?.visuallyReviewed ?? false, identity: reviewed?.identity ?? "not-reviewed", osmIds: reviewed?.osmIds ?? [], ...(reviewed ? { referenceId: reviewed.id } : {}) };
  });
  if (!photos.length) throw new Error(`No displayed gallery photos found for ${id}`);
  return { ...source, photoCount: photos.length, photos };
}));
const commons = [
  { id: "commons-b12", url: "https://upload.wikimedia.org/wikipedia/commons/4/49/Strahov%2C_studentsk%C3%A1_kolej_%C4%8D.12.JPG", file: "b12-detail-2009.jpg" },
  { id: "commons-stadium", url: "https://upload.wikimedia.org/wikipedia/commons/b/b0/Praha_Strahovsky_stadion.jpg", file: "stadium-and-campus-2005.jpg" },
];
await mkdir("docs/world-architecture/media", { recursive: true });
const archived = [];
for (const item of commons) {
  const response = await fetch(item.url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Commons ${item.id}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.headers.get("content-type")?.startsWith("image/")) throw new Error("Expected image");
  const localPath = `docs/world-architecture/media/${item.file}`;
  await writeFile(localPath, bytes);
  archived.push({ ...catalog.sources.find((s) => s.id === item.id), imageUrl: item.url, localPath, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, visuallyReviewed: true, modifications: "None; original JPEG retained." });
}
const index = { schemaVersion: 1, checkedAt: "2026-10-10", galleryPhotoCount: galleries.reduce((n, g) => n + g.photos.length, 0), notes: ["This is a link index, not permission to redistribute the ČVUT photo files.", "visuallyReviewed false is deliberate: an extracted URL does not prove the individual photo was inspected or localised.", "The opening album mixes B3 and B4; the 2016 album is historical and block identity is unresolved.", "Google and Mapy.com reference URLs remain in docs/references/atlas.json; their images are not archived."], galleries, archived };
await writeFile("docs/world-architecture/photo-index.json", JSON.stringify(index, null, 2) + "\n");
console.log(JSON.stringify({ galleries: galleries.map((g) => ({ id: g.id, count: g.photos.length })), galleryPhotos: index.galleryPhotoCount, archivedCommons: archived.map((a) => ({ id: a.id, bytes: a.bytes })), b4InteriorFirst: galleries.find((g) => g.id === "ctu-b4-2024").photos[0].previewUrl }, null, 2));
