import test from "node:test";
import assert from "node:assert/strict";
import { observeInputModality } from "../client/input-modality";

function documentFixture(previous: string | null = null) {
  const target = new EventTarget();
  const attributes = new Map<string, string>();
  if (previous !== null) attributes.set("data-input-modality", previous);
  const documentElement = {
    getAttribute: (key: string) => attributes.get(key) ?? null,
    setAttribute: (key: string, value: string) => {
      attributes.set(key, value);
    },
    removeAttribute: (key: string) => {
      attributes.delete(key);
    },
  };
  Object.assign(target, { documentElement });
  return {
    target: target as unknown as Document,
    mode: () => attributes.get("data-input-modality"),
    key(key: string) {
      const event = new Event("keydown");
      Object.defineProperty(event, "key", { value: key });
      target.dispatchEvent(event);
    },
  };
}

test("pointer typing stays quiet; Tab navigation has a stable focus cue until a pointer action", () => {
  const f = documentFixture();
  const stop = observeInputModality(f.target);
  assert.equal(f.mode(), "pointer");
  f.key("A");
  f.key("Enter");
  assert.equal(f.mode(), "pointer");
  f.key("Tab");
  assert.equal(f.mode(), "keyboard");
  f.key("a");
  assert.equal(f.mode(), "keyboard");
  f.target.dispatchEvent(new Event("pointerdown"));
  assert.equal(f.mode(), "pointer");
  stop();
  assert.equal(f.mode(), undefined);
  f.key("Tab");
  assert.equal(f.mode(), undefined, "cleanup removes listeners");
});

test("modality cleanup restores the previous page attribute during HMR", () => {
  const f = documentFixture("keyboard");
  const stop = observeInputModality(f.target);
  assert.equal(f.mode(), "pointer");
  stop();
  assert.equal(f.mode(), "keyboard");
});
