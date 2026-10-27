import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { getEventListeners } from "node:events";
import { setImmediate as nextTurn } from "node:timers/promises";
import { assetSha256 } from "../client/asset-sha256";

function cryptoRuntime(t: TestContext, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "crypto", previous); else Reflect.deleteProperty(globalThis, "crypto"); });
}
const reference = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => (Math.imul(i, 131) ^ (i >>> 8) ^ 0xa7) & 255);
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

test("přenosné SHA-256 odpovídá pevným standardním vektorům", async t => {
  cryptoRuntime(t, undefined);
  for (const [text, expected] of [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
  ]) assert.equal(await assetSha256(new TextEncoder().encode(text)), expected);
  assert.equal(await assetSha256(new Uint8Array(1_000_000).fill(0x61)),
    "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});

test("padding, bloky, slice hranice a offset pohledu zachovávají všechny vstupní bajty", async t => {
  cryptoRuntime(t, {});
  for (const length of [0,1,3,55,56,57,63,64,65,119,120,127,128,129,255,256,257,262143,262144,262145,524351]) {
    const backing = bytes(length + 23), before = backing.slice(), view = backing.subarray(11, 11 + length);
    assert.equal(await assetSha256(view), reference(view), String(length));
    assert.deepEqual(backing, before, "hash nesmí upravovat vstup ani jeho okolí");
  }
  const raw = bytes(131);
  assert.equal(await assetSha256(raw.buffer), reference(raw));
});

test("existující SubtleCrypto má přednost a dostane původní pohled bez kopie", async t => {
  const backing = bytes(155), input = backing.subarray(7, 141), controller = new AbortController();
  let calls = 0;
  cryptoRuntime(t, { subtle: { digest(algorithm: string, data: Uint8Array<ArrayBuffer>) {
    calls++; assert.equal(algorithm, "SHA-256");
    assert.equal(data.buffer, input.buffer); assert.equal(data.byteOffset, 7); assert.equal(data.byteLength, 134);
    return webcrypto.subtle.digest(algorithm, data);
  } } });
  assert.equal(await assetSha256(input, controller.signal), reference(input));
  assert.equal(calls, 1); assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("odmítnutí existujícího digestu se nezamění za fallback nebo úspěch", async t => {
  const failure = new Error("native digest odmítnut"), controller = new AbortController();
  let calls = 0;
  cryptoRuntime(t, { subtle: { digest() { calls++; return Promise.reject(failure); } } });
  await assert.rejects(assetSha256(bytes(70), controller.signal), error => error === failure);
  assert.equal(calls, 1); assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("abort ukončí native čekání a bezpečně zachytí i pozdní odmítnutí", async t => {
  const controller = new AbortController(); let reject!: (error: Error) => void, calls = 0;
  cryptoRuntime(t, { subtle: { digest() { calls++; return new Promise<ArrayBuffer>((_yes, no) => { reject = no; }); } } });
  const pending = assetSha256(bytes(32), controller.signal);
  await Promise.resolve(); assert.equal(calls, 1);
  controller.abort(); await assert.rejects(pending, isAbort);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  reject(new Error("pozdní odmítnutí opuštěného digestu")); await nextTurn();
  await assert.rejects(assetSha256(bytes(0), controller.signal), isAbort);
  assert.equal(calls, 1, "předem zrušená práce nesmí zahájit digest");
});

test("velký přenosný hash uvolňuje event loop a lze jej zrušit během výpočtu", async t => {
  cryptoRuntime(t, {});
  const input = bytes(2 * 1024 * 1024 + 59); let tick = false;
  const marker = setTimeout(() => { tick = true; }, 0);
  assert.equal(await assetSha256(input), reference(input)); clearTimeout(marker);
  assert.equal(tick, true, "výpočet nesmí zabrat celou úlohu event loopu");
  const controller = new AbortController(), pending = assetSha256(input, controller.signal);
  const cancel = setTimeout(() => controller.abort(), 0);
  try { await assert.rejects(pending, isAbort); } finally { clearTimeout(cancel); }
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  await assert.rejects(assetSha256(input, controller.signal), isAbort);
});

test("přenosný hash odmítne sdílený nebo během yield odpojený buffer", async t => {
  cryptoRuntime(t, {});
  await assert.rejects(assetSha256(new Uint8Array(new SharedArrayBuffer(64)) as unknown as Uint8Array<ArrayBuffer>), /nesdílený/);
  const input = bytes(1024 * 1024), pending = assetSha256(input);
  const detach = setTimeout(() => structuredClone(input.buffer, { transfer: [input.buffer] }), 0);
  try { await assert.rejects(pending, /během hashování změnil/); } finally { clearTimeout(detach); }
});
