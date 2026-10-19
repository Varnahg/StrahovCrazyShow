import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolve the installed dependency, including pnpm's physical package layout.
export const candidate = createRequire(import.meta.url).resolve("@babylonjs/core/Materials/materialDefines.js");
export const oracle = fileURLToPath(new URL("./materialDefines.oracle.mjs", import.meta.url));
const provenance = JSON.parse(readFileSync(new URL("./provenance.json", import.meta.url), "utf8"));
assert.equal(createHash("sha256").update(readFileSync(oracle)).digest("hex"), provenance.oracleSha256);

export type Schema = { names: readonly string[]; order: readonly number[]; validNames: boolean };
export type InternEntry = { schema: Schema; units: number };
type Inspector = {
    MaterialDefines: new () => any;
    inspectSchema(key: object): Schema | undefined;
    inspectInterns(): { entries: InternEntry[]; units: number };
};

export async function inspectInstalledSchema(): Promise<Inspector> {
    const source = readFileSync(candidate, "utf8");
    // Private-state assertions use the exact installed bytes in an isolated module.
    // These exports are test-only; no package/dependency file is modified.
    const debug = source + "\nexport const inspectSchema = key=>defineSchemas.get(key); export const inspectInterns = ()=>({entries:defineSchemaInterns.slice(),units:defineSchemaInternUnits});";
    const inspected = await import("data:text/javascript;base64," + Buffer.from(debug).toString("base64")) as Inspector;
    const actual = await import(pathToFileURL(candidate).href);
    for (const value of [1, false, "1\n#define EXTRA 2"]) {
        const a = new actual.MaterialDefines(), b = new inspected.MaterialDefines();
        for (const d of [a, b]) { d._keys = ["Z", "A"]; d.Z = value; d.A = 1; }
        assert.equal(a.toString(), b.toString(), "Inspection copy must preserve installed public behavior");
    }
    return inspected;
}
