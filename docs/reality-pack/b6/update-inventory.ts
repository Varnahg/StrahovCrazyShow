/** Run from repository root: pnpm exec tsx docs/reality-pack/b6/update-inventory.ts */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { B6_LAYOUT, B6_REALITY_BOXES, B6_ROOM_AREAS, B6_STAIR_MESHES } from "../../../shared/b6-interior";
import { B6_PROP_COLLISIONS, B6_PROP_PLACEMENTS, B6_ASSET_MANIFEST } from "../../../shared/b6-props";
import {B6_EXTERIOR_CONCRETE_MATERIAL} from "../../../shared/b6-stair-materials";
const path = "docs/reality-pack/b6/inventory.json";
const inventory = JSON.parse(readFileSync(path, "utf8"));
inventory.recordedAt = new Date().toISOString();
inventory.layout = B6_LAYOUT;
inventory.structuralColliders = B6_REALITY_BOXES.length;
inventory.glassColliders = B6_REALITY_BOXES.filter(b => b.kind === "glass").length;
inventory.residentialRooms = B6_ROOM_AREAS.filter(r => r.kind === "bedroom").length;
inventory.propPlacements = B6_PROP_PLACEMENTS.length;
inventory.propCollisionBoxes = B6_PROP_COLLISIONS.length;
inventory.totalAssets = B6_ASSET_MANIFEST.assets.length;
inventory.stairSourceMeshParts = B6_STAIR_MESHES.length;
inventory.stairTriangles = B6_STAIR_MESHES.reduce((sum,mesh)=>sum+mesh.indices.length/3,0);
inventory.exteriorConcreteRecipe=B6_EXTERIOR_CONCRETE_MATERIAL;
for (const file of [...Object.keys(inventory.sourceSha256), "shared/b6-stairs.ts", "shared/b6-stair-materials.ts", "shared/b6-entry.ts", "shared/b6-facade-plan.ts", "scripts/create-b6-stair-textures.ts", "public/models/b6/striped-corridor-authored.png", "public/models/b6/stair-terrazzo-authored.png", "client/architecture-reality.ts", "shared/data/facade-reality.json", "tests/b6-reality.test.ts", "tests/physics.test.ts", "tests/architecture-reality.test.ts", "client/b6-exterior-concrete.ts", "tests/b6-exterior-concrete.test.ts", "shared/data/assets/surfaces-manifest.json"])
  inventory.sourceSha256[file] = createHash("sha256").update(readFileSync(file)).digest("hex");
writeFileSync(path, JSON.stringify(inventory, null, 2) + "\n");
console.log(JSON.stringify({ recordedAt: inventory.recordedAt, structuralColliders: inventory.structuralColliders, glassColliders: inventory.glassColliders, residentialRooms: inventory.residentialRooms, propPlacements: inventory.propPlacements, propCollisionBoxes: inventory.propCollisionBoxes }));
