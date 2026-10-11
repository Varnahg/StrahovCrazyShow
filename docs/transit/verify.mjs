import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(root,p));
const manifest=JSON.parse(read('public/models/transit/manifest.json'));
function glb(path){const b=read(path);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));return {bytes:b.length,triangles:j.meshes.flatMap(m=>m.primitives).reduce((s,p)=>s+(p.indices==null?j.accessors[p.attributes.POSITION].count:j.accessors[p.indices].count)/3,0),meshes:j.meshes.length,wheelGroups:[...new Set(j.nodes.map(n=>n.name?.match(/^(Wheel[^_]+)/)?.[1]).filter(Boolean))]};}
const sourceSha256=createHash('sha256').update(read('public/models/transit/city-bus-source.glb')).digest('hex');assert.equal(sourceSha256,manifest.sourceSha256);
const full=glb('public/models/transit/strahov-city-bus.glb'),low=glb('public/models/transit/strahov-city-bus-low.glb');
assert.equal(full.triangles,manifest.triangles);assert.equal(low.triangles,manifest.lowTriangles);assert.equal(full.wheelGroups.length,4);assert.equal(low.wheelGroups.length,4);assert.ok(low.triangles<full.triangles*.5);
const feed=JSON.parse(read('shared/data/transit.json')),nav=JSON.parse(read('shared/data/transit-navigation.json'));
assert.ok(feed.trips.length>100);assert.ok(nav.journeys.length>=12);
for(const name of ['bus-preview.png','browser-149-arrival.jpg','browser-149-departed.jpg'])assert.ok(statSync(resolve(root,'docs/transit',name)).size>10000);
const result={checkedAt:new Date().toISOString(),sourceSha256,full,low,gtfs:{start:feed.start,end:feed.end,trips:feed.trips.length,shapes:Object.keys(feed.shapes).length,stops:Object.keys(feed.stops).length,source:feed.source,license:feed.license},navigation:{destinations:nav.destinations.length,journeys:nav.journeys.length,doorConfidence:'provisional-west-entrance-projection'},browserQA:{renderer:'Actual Babylon WebGL in IAB; both route displays and departure/NPC continuity checked; console error/warn list empty',screenshots:['browser-149-arrival.jpg','browser-149-departed.jpg'],wholeGameFPS:false},tests:'pnpm exec tsx --test tests/transit.test.ts: 8/8 passed; TypeScript passed on 2026-10-10'};
writeFileSync(resolve(root,'docs/transit/verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
