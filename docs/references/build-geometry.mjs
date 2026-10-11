// Read-only extraction from existing OSM inputs; writes only beside this script.
// Usage from repository root: node docs/references/build-geometry.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const xml = await readFile('.cache/osm.xml', 'utf8');
const mapText = await readFile('shared/data/map.json', 'utf8');
const map = JSON.parse(mapText);
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const tags = s => Object.fromEntries([...s.matchAll(/<tag\b([^>]+)\/>/g)].map(m => { const a=attrs(m[1]); return [a.k,a.v]; }));
const nodes = new Map([...xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)].map(m => {const a=attrs(m[1]); return [a.id,{...a,tags:tags(m[2]||''),point:[+a.lon,+a.lat]}];}));
const ways = [...xml.matchAll(/<way\b([^>]+)>([\s\S]*?)<\/way>/g)].map(m => ({...attrs(m[1]),tags:tags(m[2]),points:[...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(n=>nodes.get(n[1])?.point).filter(Boolean)}));
const chosen = {'53929071':'blok-6','53929068':'blok-7','7645350':'rko-building-shell'};
const project = ([lon,lat]) => [(lon-map.origin.lon)*111320*Math.cos(map.origin.lat*Math.PI/180),-(lat-map.origin.lat)*111320];
const metrics = points => {
  const p=points.map(project); let best={area:Infinity};
  for(let i=1;i<p.length;i++) {
    const a=Math.atan2(p[i][1]-p[i-1][1],p[i][0]-p[i-1][0]);
    const r=p.map(([x,z])=>[x*Math.cos(a)+z*Math.sin(a),-x*Math.sin(a)+z*Math.cos(a)]);
    const w=Math.max(...r.map(v=>v[0]))-Math.min(...r.map(v=>v[0]));
    const h=Math.max(...r.map(v=>v[1]))-Math.min(...r.map(v=>v[1]));
    if(w*h<best.area) best={area:w*h,long:Math.max(w,h),short:Math.min(w,h)};
  }
  let area=0; for(let i=1;i<p.length;i++) area+=p[i-1][0]*p[i][1]-p[i][0]*p[i-1][1];
  return {orientedEnvelopeM:[+best.long.toFixed(2),+best.short.toFixed(2)],polygonAreaM2:+(Math.abs(area)/2).toFixed(2)};
};
const features=[];
for(const w of ways.filter(w=>chosen[w.id])) {
  features.push({type:'Feature',id:`way/${w.id}`,properties:{placeId:chosen[w.id],name:w.tags.name||null,source:`https://www.openstreetmap.org/way/${w.id}`,osmVersion:+w.version,osmTimestamp:w.timestamp,license:'ODbL-1.0',tags:w.tags,...metrics(w.points),localPointsXZ:w.points.map(p=>project(p).map(v=>+v.toFixed(2))),scope:w.id==='7645350'?'Vnější obrys společné budovy; NE půdorys provozovny Recharging Bar.':'Vnější obrys budovy v OSM, bez ověření geodetickou dokumentací.'},geometry:{type:'Polygon',coordinates:[w.points]}});
}
for(const id of ['5508982945','1268889585']) {
  const n=nodes.get(id); if(!n) throw new Error(`Missing OSM node ${id}`);
  features.push({type:'Feature',id:`node/${id}`,properties:{placeId:id==='5508982945'?'rko':'klub-007',name:n.tags.name,source:`https://www.openstreetmap.org/node/${id}`,osmVersion:+n.version,osmTimestamp:n.timestamp,license:'ODbL-1.0',scope:'Bod provozovny v OSM; nepředstavuje zaměřený vstup.',localXZ:project(n.point).map(v=>+v.toFixed(2))},geometry:{type:'Point',coordinates:n.point}});
}
for(const w of ways.filter(w=>w.tags.highway && w.points.some(([x,y])=>x>=14.3913&&x<=14.3939&&y>=50.08075&&y<=50.08165))) {
  features.push({type:'Feature',id:`way/${w.id}`,properties:{placeId:'campus-paths',source:`https://www.openstreetmap.org/way/${w.id}`,osmVersion:+w.version,osmTimestamp:w.timestamp,license:'ODbL-1.0',tags:w.tags,scope:'Celý OSM úsek zasahující do výřezu, bez záruky průchodnosti nebo přesné šířky.'},geometry:{type:'LineString',coordinates:w.points}});
}
const result={type:'FeatureCollection',name:'Strahov – podklad pro modelování',checkedAt:'2026-10-10',license:'© OpenStreetMap contributors, ODbL 1.0',licenseUrl:'https://www.openstreetmap.org/copyright',origin:map.origin,localCoordinateSystem:'x východ, z jih, metry; stejný přibližný převod jako scripts/fetch-map.mjs',inputHashes:{osmXmlSha256:createHash('sha256').update(xml).digest('hex'),mapJsonSha256:createHash('sha256').update(mapText).digest('hex')},mapFetchedAt:map.fetchedAt,features};
await writeFile(new URL('./footprints-and-paths.geojson',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({features:features.length,buildings:features.filter(f=>f.geometry.type==='Polygon').map(f=>({id:f.id,placeId:f.properties.placeId,envelopeM:f.properties.orientedEnvelopeM,areaM2:f.properties.polygonAreaM2})),pois:features.filter(f=>f.geometry.type==='Point')},null,2));
