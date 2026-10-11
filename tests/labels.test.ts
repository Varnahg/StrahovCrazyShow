import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ScreenLabels } from "../client/labels";
import type { Vec3 } from "../shared/types";
import { getLocale, setLocale } from "../client/i18n";

function setup(t: import("node:test").TestContext) {
  const previousDocument = globalThis.document;
  const elements: Array<{ style: Record<string, string> }> = [];
  globalThis.document = {
    documentElement: { lang: "cs" },
    removeEventListener() {},
    createElement() {
      const element = { dataset: {}, style: {}, textContent: "", remove() {} };
      elements.push(element);
      return element;
    },
  } as unknown as Document;
  const engine = new NullEngine({
    renderWidth: 800,
    renderHeight: 600,
    textureSize: 128,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new UniversalCamera("camera", new Vector3(0, 1, 0), scene);
  camera.minZ = 0.1;
  camera.maxZ = 250;
  camera.setTarget(new Vector3(0, 1, 20));
  scene.activeCamera = camera;
  scene.render();
  const container = {
    clientWidth: 800,
    clientHeight: 600,
    append() {},
  } as unknown as HTMLElement;
  const labels = new ScreenLabels(container, scene, camera, engine);
  const local = { x: 0, y: 1, z: 0 };
  t.after(() => {
    labels.dispose();
    scene.dispose();
    engine.dispose();
    globalThis.document = previousDocument;
  });
  const frames = (
    from: number,
    to: number,
    visible: (point: Vec3) => boolean = () => true,
  ) => {
    let maxCasts = 0;
    for (let now = from; now <= to; now += 1000 / 60) {
      let casts = 0;
      labels.render(
        local,
        (point) => {
          casts++;
          return visible(point);
        },
        now,
      );
      maxCasts = Math.max(maxCasts, casts);
    }
    return maxCasts;
  };
  return { labels, camera, scene, container, local, elements, frames };
}

test("new labels start hidden and names behind the camera do not consume visible slots", (t) => {
  const context = setup(t);
  for (let i = 0; i < 30; i++)
    context.labels.set(
      "behind" + i,
      "Behind",
      { x: 0, y: 2, z: -2 - i * 0.01 },
      true,
    );
  for (let i = 0; i < 5; i++)
    context.labels.set("front" + i, "Front", { x: i * 0.1, y: 2, z: 15 }, true);
  assert.ok(
    context.elements.every((element) => element.style.display === "none"),
  );
  assert.ok(context.frames(0, 250) <= 4);
  assert.equal(
    [...context.labels.entries.values()].filter(
      (label) => label.visible && label.player,
    ).length,
    5,
  );
  for (let i = 0; i < 30; i++)
    assert.equal(context.labels.entries.get("behind" + i)?.visible, false);
});

test("crowd labels have stable membership and range hysteresis without hiding avatars", (t) => {
  const context = setup(t);
  for (let i = 0; i < 17; i++)
    context.labels.set(
      "person" + i,
      "Person",
      { x: 0, y: 1, z: 20 + i * 0.01 },
      true,
    );
  context.frames(0, 500);
  const selected = [...context.labels.entries.values()]
    .filter((label) => label.visible)
    .map((label) => label.id);
  assert.equal(selected.length, 16);
  const challenger = [...context.labels.entries.values()].find(
    (label) => !label.visible,
  )!;
  context.labels.set(challenger.id, "Person", { x: 0, y: 1, z: 19.9 }, true);
  context.frames(520, 900);
  assert.equal(challenger.visible, false);
  context.labels.set(challenger.id, "Person", { x: 0, y: 1, z: 10 }, true);
  context.frames(920, 1300);
  assert.equal(challenger.visible, true);
  assert.equal(
    [...context.labels.entries.values()].filter((label) => label.visible)
      .length,
    16,
  );
  assert.equal(context.labels.entries.size, 17);
});

test("range and occlusion boundaries have hysteresis, and behind-camera labels hide immediately", (t) => {
  const context = setup(t);
  context.labels.set("person", "Person", { x: 0, y: 1, z: 44 }, true);
  context.frames(0, 200);
  const label = context.labels.entries.get("person")!;
  assert.equal(label.visible, true);
  context.labels.set("person", "Person", { x: 0, y: 1, z: 46 }, true);
  context.frames(220, 400);
  assert.equal(label.visible, true);
  context.frames(420, 500, () => false);
  assert.equal(label.visible, true);
  context.frames(520, 900, () => false);
  assert.equal(label.visible, false);
  context.frames(920, 1400);
  assert.equal(label.visible, true);
  context.labels.set("person", "Person", { x: 0, y: 1, z: -4 }, true);
  context.labels.render(context.local, () => true, 1410);
  assert.equal(label.visible, false);
});

test("100 LOS candidates are fairly refreshed with at most four casts per rendered frame", (t) => {
  const context = setup(t);
  for (let i = 0; i < 80; i++)
    context.labels.set(
      "wall" + i,
      "Occluded",
      { x: 0, y: 1, z: 10 + i * 0.1 },
      true,
    );
  for (let i = 0; i < 20; i++)
    context.labels.set(
      "visible" + i,
      "Visible",
      { x: 0, y: 1, z: 30 + i * 0.1 },
      true,
    );
  const checked = new Set<number>();
  const maxCasts = context.frames(0, 1500, (point) => {
    checked.add(point.z);
    return point.z > 25;
  });
  assert.equal(maxCasts, 4);
  assert.equal(checked.size, 100);
  const visible = [...context.labels.entries.values()].filter(
    (label) => label.visible,
  );
  assert.equal(visible.length, 16);
  assert.ok(visible.every((label) => label.id.startsWith("visible")));
});

test("label projection uses the rendered camera, CSS dimensions and subpixel deadzone", (t) => {
  const context = setup(t);
  context.labels.set("name", "Person", { x: 1, y: 2, z: 15 }, true);
  context.frames(0, 200);
  const label = context.labels.entries.get("name")!;
  const originalTransform = label.element.style.transform;
  context.camera.position.x += 0.00001;
  context.scene.render();
  context.labels.render(context.local, () => true, 220);
  assert.equal(label.element.style.transform, originalTransform);
  context.camera.position.x += 0.1;
  context.scene.render();
  context.labels.render(context.local, () => true, 240);
  assert.notEqual(label.element.style.transform, originalTransform);
  assert.equal(label.element.style.transition, undefined);
  assert.ok(label.element.style.transform.includes("translate3d("));
  const fullWidthX = label.screenX;
  Object.defineProperty(context.container, "clientWidth", { value: 400 });
  context.labels.render(context.local, () => true, 260);
  assert.ok(Math.abs(label.screenX - fullWidthX / 2) < 0.001);
});

test("nearby landmarks stay on the map while distant place names have a stable visibility band", (t) => {
  const context = setup(t);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 25 });
  context.frames(0, 250);
  const label = context.labels.entries.get("place:b6")!;
  assert.equal(label.visible, false);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 43 });
  context.frames(270, 550);
  assert.equal(label.visible, true);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 38 });
  context.frames(570, 850);
  assert.equal(label.visible, true);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 33 });
  context.frames(870, 1150);
  assert.equal(label.visible, false);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 38 });
  context.frames(1170, 1450);
  assert.equal(label.visible, false);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 179 });
  context.frames(1470, 1750);
  assert.equal(label.visible, true);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 190 });
  context.frames(1770, 2050);
  assert.equal(label.visible, true);
  context.labels.set("place:b6", "Blok 6", { x: 0, y: 2, z: 199 });
  context.frames(2070, 2350);
  assert.equal(label.visible, false);
});

test("stacked place names do not overlap or consume player-name slots", (t) => {
  const context = setup(t);
  for (let i = 0; i < 10; i++)
    context.labels.set("landmark" + i, "Landmark " + i, {
      x: 0,
      y: 1,
      z: 60 + i,
    });
  for (let i = 0; i < 16; i++)
    context.labels.set(
      "person" + i,
      "Person",
      { x: i * 0.1, y: 1, z: 20 },
      true,
    );
  assert.ok(context.frames(0, 700) <= 4);
  const visible = [...context.labels.entries.values()].filter((l) => l.visible);
  assert.equal(visible.filter((l) => !l.player).length, 1);
  assert.equal(visible.filter((l) => l.player).length, 16);
});

test("remote/off-floor labels skip camera projections without changing name/LOS budgets", (t) => {
  const context = setup(t);
  for (let i = 0; i < 100; i++)
    context.labels.set("remote" + i, "Remote place", {
      x: 500 + i,
      y: 2,
      z: 500,
    });
  context.labels.set("otherfloor", "5 NP", { x: 8, y: 15, z: -55 });
  context.labels.set("person", "Person", { x: 0, y: 2, z: 15 }, true);
  context.frames(0, 250);
  assert.equal(context.labels.stats.projections, 1);
  assert.ok(context.labels.stats.losCasts <= 4);
  assert.equal(context.labels.entries.get("person")!.visible, true);
});

test("compact game labels skip every static projection and keep six nearby names", (t) => {
  const c = setup(t);
  c.labels.placeLimit = 0;
  c.labels.playerLimit = 6;
  c.labels.playerRange = 18;
  for (let i = 0; i < 30; i++)
    c.labels.set("place" + i, "Place", { x: 0, y: 1, z: 60 + i });
  for (let i = 0; i < 12; i++)
    c.labels.set("near" + i, "Nickname", { x: i * 0.1, y: 1, z: 10 }, true);
  c.labels.set("far", "Far nickname", { x: 0, y: 1, z: 30 }, true);
  c.frames(0, 1000);
  assert.equal(
    [...c.labels.entries.values()].filter((l) => l.visible).length,
    6,
  );
  assert.equal(c.labels.stats.projections, 12);
  assert.equal(c.labels.entries.get("far")!.visible, false);
  assert.ok(c.labels.stats.losCasts <= 4);
});

test("language changes update known place captions without translating identical player names", (t) => {
  const c = setup(t),
    old = getLocale();
  setLocale("cs");
  c.labels.set("static", "Blok 6", { x: 0, y: 1, z: 60 });
  c.labels.set("player", "Blok 6", { x: 0, y: 1, z: 12 }, true);
  c.frames(0, 200);
  setLocale("en");
  c.frames(250, 500);
  assert.equal(c.labels.entries.get("static")!.element.textContent, "Block 6");
  assert.equal(c.labels.entries.get("player")!.element.textContent, "Blok 6");
  assert.equal(c.labels.entries.get("static")!.text, "Blok 6");
  setLocale(old);
});
