/** Deterministic Blender input copy; shared/data/b4-facade-plan.json is authoritative. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const source = new URL("../shared/data/b4-facade-plan.json", import.meta.url);
const destination = new URL("../assets/blender/b4-facade/source-plan.json", import.meta.url);
mkdirSync(fileURLToPath(new URL(".", destination)), { recursive: true });
writeFileSync(destination, readFileSync(source));
console.log("B4_FACADE_PLAN_EXPORTED", fileURLToPath(destination));
