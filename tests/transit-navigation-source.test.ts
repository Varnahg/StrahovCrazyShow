import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import navigation from "../shared/data/transit-navigation.json";
import {B6_ENTRY_PAVING,streetSurfaceAt} from "../shared/streets";

test("baked passenger navigation identifies current composed paths, terrain patch and actual entrance sources",()=>{
  const required=[
    "shared/data/map.json","shared/world.ts","shared/data/building-catalog.json",
    "shared/data/streets.json","shared/streets.ts","shared/data/b6-entry-paving.json","shared/campus-routes.ts",
    "shared/data/terrain-grid.json","shared/data/reality-ground.json","shared/terrain.ts","shared/terrain-patches.ts",
    "shared/data/north-court-terrain-patch.json","shared/data/north-court-style.json","shared/campus-exterior.ts",
    "shared/b6-interior.ts","shared/b6-stairs.ts","shared/b6-entry.ts","shared/b6-facade-plan.ts",
    "shared/landmark-reality.ts","shared/transit.ts","shared/terrain-entities.ts","shared/data/transit.json",
    "scripts/rebuild-campus-transit-navigation.ts",
  ];
  assert.deepEqual(Object.keys(navigation.sourceHashes).sort(),required.sort(),"new derived surfaces must not be covered by stale raw-map hashes alone");
  for(const[path,hash]of Object.entries(navigation.sourceHashes))
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),hash,`Regenerate passenger navigation after changing ${path}`);
  assert.match(navigation.sourceHashesScope,/not a complete game snapshot/);
});

test("both baked B6 passenger journeys follow the explicit diagonal paved approach instead of a grass shortcut",()=>{
  const journeys=navigation.journeys.filter(j=>j.buildingId==="53929071");
  assert.equal(journeys.length,2);
  for(const journey of journeys){
    assert.equal(journey.interpretedConnectorId,B6_ENTRY_PAVING.id);
    for(const point of B6_ENTRY_PAVING.points)
      assert.ok(journey.points.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-7),`B6 route omitted paved turn ${point}`);
    const points=B6_ENTRY_PAVING.points;
    for(let segment=1;segment<points.length;segment++)for(let sample=0;sample<=20;sample++){
      const t=sample/20,x=points[segment-1][0]*(1-t)+points[segment][0]*t,z=points[segment-1][1]*(1-t)+points[segment][1]*t;
      assert.ok(streetSurfaceAt(x,z),`Actual pavement missing under B6 passenger at ${x},${z}`);
    }
  }
});
