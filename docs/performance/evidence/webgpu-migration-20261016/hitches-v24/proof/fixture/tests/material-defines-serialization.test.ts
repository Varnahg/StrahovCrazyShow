import "../../scope-hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import * as publicModule from "@babylonjs/core/Materials/materialDefines";

const MAX_CHARS = 32768, MAX_DEFINES = 1024;
// Craft an exact completed block through the ORIGINAL serializer's permitted
// property-name interpolation. No copied canonicalizer or prototype hook.
function emit(text: string) {
  const defines: any = new MaterialDefines();
  if (!text) return defines.toString();
  assert.ok(text.startsWith("#define ") && text.endsWith("\n"));
  const key = text.slice(8, -1);
  Object.defineProperty(defines, key, { value: true, enumerable: true });
  defines._keys = [key];
  return defines.toString();
}

test("actual MaterialDefines distribution canonicalizes complete literal blocks without a new public API", () => {
  assert.deepEqual(Object.keys(publicModule), ["MaterialDefines"]);
  const d: any = new MaterialDefines(); d.Z = true; d.NUM_SAMPLES = "0"; d.ALPHATESTVALUE = "0.5"; d.INDEX = -1; d.EXP = "1.25e+2"; d.rebuild();
  const expected = "#define ALPHATESTVALUE 0.5\n#define EXP 1.25e+2\n#define INDEX -1\n#define NUM_SAMPLES 0\n#define Z\n";
  assert.equal(d.toString(), expected); assert.equal(emit(expected), expected);
  d.ALPHATESTVALUE = "0.4"; assert.notEqual(d.toString(), expected);
  assert.equal(emit("#define Z -0\n#define A +1.00e-2\n"), "#define A +1.00e-2\n#define Z -0\n");
  assert.equal(emit(""), "");
});

test("actual serializer preserves complete unknown blocks and reserved names byte for byte", () => {
  const invalid = ["#define A 1+2\n", "#define A B\n", "#define A 0x10\n", "#define A 1u\n", "#define A 01\n", "#define A Infinity\n", "#define A NaN\n", "#define A 1e999\n", "#define A(x) x\n", "#define A 1 // comment\n", "#define A /*x*/1\n", "#define A\r\n", "#define A\u2028#define B\n", "#define A\u2028\n", "#define A\u2029\n", "#define A\u0085\n", "#define A\u000c\n", "#define Ä 1\n", "#define A 1\\\n", "#define A\n#define A\n", "#if A\n#define B\n#endif\n", "#undef A\n", "#define __LINE__ 1\n", "#define GL_TEST 1\n", "#define a__b\n", "#define constructor 1\n", "#define WEBGPU 1\n", "#define IS_NDC_HALF_ZRANGE\n", "#define USE_REVERSE_DEPTHBUFFER\n", "#define defined 1\n", "#define A 1\t\n", "#define A\n\n"];
  for (const bad of invalid) { const text = "#define Z\n" + bad; assert.equal(emit(text), text, JSON.stringify(bad)); }
});

test("actual serializer caps chars and define rows exactly", () => {
  const atLimit = Array.from({ length: MAX_DEFINES }, (_, i) => `#define M${MAX_DEFINES - i}\n`).join("");
  assert.notEqual(emit(atLimit), atLimit); assert.equal(emit(atLimit + "#define EXTRA\n"), atLimit + "#define EXTRA\n");
  const exact = "#define Z\n#define " + "A".repeat(MAX_CHARS - 19) + "\n";
  assert.equal(exact.length, MAX_CHARS); assert.notEqual(emit(exact), exact);
  const over = exact.replace("Z", "ZZ"); assert.equal(emit(over), over);
});

test("actual clone/equality/reset and mutable key order remain untouched", () => {
  const d: any = new MaterialDefines(); d.Z = true; d.A = "0.5"; d.COUNT = 4; d.rebuild();
  const clone: any = new MaterialDefines(); d.cloneTo(clone);
  const before = Object.getOwnPropertyDescriptors(d), keys = d._keys.slice(), cloneKeys = clone._keys.slice();
  assert.ok(d.isEqual(clone)); assert.equal(d.toString(), clone.toString());
  assert.deepEqual(Object.getOwnPropertyDescriptors(d), before); assert.deepEqual(d._keys, keys); assert.deepEqual(clone._keys, cloneKeys);
  d.reset(); assert.equal(d.Z, false); assert.equal(d.A, ""); assert.equal(d.COUNT, 0); assert.deepEqual(d._keys, keys);
  assert.equal(d.toString(), "#define A \n#define COUNT 0\n", "empty string preserves original insertion-order result through whole-block fallback");
});

test("actual getter order, receiver, original throws and later unsafe mutation stay observable", () => {
  const reads: string[] = [], d: any = new MaterialDefines(); let value: any = "0.5";
  const sentinel = new Error("original getter failure");
  Object.defineProperty(d, "Z", { enumerable: true, get() { assert.equal(this, d); reads.push("Z"); return true; } });
  Object.defineProperty(d, "A", { enumerable: true, get() { assert.equal(this, d); reads.push("A"); if (value === "throw") throw sentinel; return value; } });
  d.rebuild(); const keys = d._keys.slice();
  assert.equal(d.toString(), "#define A 0.5\n#define Z\n"); assert.deepEqual(reads.splice(0), ["Z", "A"]);
  value = "expression(1)"; assert.equal(d.toString(), "#define Z\n#define A expression(1)\n"); assert.deepEqual(reads.splice(0), ["Z", "A"]);
  value = "throw"; assert.throws(() => d.toString(), error => error === sentinel); assert.deepEqual(reads.splice(0), ["Z", "A"]); assert.deepEqual(d._keys, keys);
  const receiver = { _keys: ["Z", "A"], Z: true, A: 2 };
  assert.equal(Reflect.apply(MaterialDefines.prototype.toString, receiver, ["ignored", 3]), "#define A 2\n#define Z\n");
});

test("flat-result contract does not claim to reject every multiline property by origin", () => {
  const d: any = new MaterialDefines(); d.Z = "1\n#define A 2"; d.rebuild();
  assert.equal(d.toString(), "#define A 2\n#define Z 1\n");
});
