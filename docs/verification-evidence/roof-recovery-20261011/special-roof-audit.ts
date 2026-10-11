import { createHash } from "node:crypto";
import { buildLandmarkPlan } from "../../../shared/landmark-reality";
import { buildCampusExteriorPlan } from "../../../shared/campus-exterior";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const landmark = buildLandmarkPlan(), exterior = buildCampusExteriorPlan();
console.log(JSON.stringify({
  landmarks: {render: digest(landmark.parts), collision: digest(landmark.collision), renderTriangles: landmark.parts.reduce((n,p)=>n+p.indices.length/3,0), collisionTriangles: landmark.collision.indices.length/3},
  exterior: {render: digest(exterior.parts), collision: digest(exterior.collision), renderTriangles: exterior.parts.reduce((n,p)=>n+p.indices.length/3,0), collisionTriangles: exterior.collision.indices.length/3},
  b1: landmark.b1Roof,
  market: exterior.shopRoof,
},null,2));
