import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { createPhotogrammetryMaterial } from "../client/photogrammetry";
import {
  createPhotogrammetryLighting,
  PHOTOGRAMMETRY_WINDOW_FACADES,
  photogrammetryFacadesForNode,
  photogrammetryNightState,
  photogrammetryWindowMask,
} from "../client/photogrammetry-lighting";
import annotations from "../client/data/photogrammetry-lighting.json";
import raw from "../shared/data/photogrammetry.json";
import type { PhotogrammetryManifest } from "../shared/photogrammetry";

const manifest = raw as PhotogrammetryManifest;
const facade = PHOTOGRAMMETRY_WINDOW_FACADES.find((f) => f.id === "b6-edge12")!;
const pane = {
  x: facade.origin[0] + 8 * facade.tangent[0],
  y: facade.topWindowY - facade.rowPitch * 2,
  z: facade.origin[1] + 8 * facade.tangent[1],
};
const normal = { x: facade.normal[0], y: 0, z: facade.normal[1] };
const glass = [0.16, 0.18, 0.21] as const;

test("night annotations retain their original-source provenance and actual slope-dependent facade heights", () => {
  assert.equal(annotations.license, "CC BY");
  assert.equal(annotations.capture, "summer 2023");
  assert.equal(
    annotations.sourceManifestSha256,
    createHash("sha256")
      .update(
        readFileSync(
          new URL("../shared/data/photogrammetry.json", import.meta.url),
        ),
      )
      .digest("hex"),
  );
  assert.equal(PHOTOGRAMMETRY_WINDOW_FACADES.length, 15);
  assert.deepEqual(
    [...new Set(PHOTOGRAMMETRY_WINDOW_FACADES.map((f) => f.block))].sort(
      (a, b) => a - b,
    ),
    [2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  const b5 = PHOTOGRAMMETRY_WINDOW_FACADES.find((f) => f.id === "b5-edge18")!;
  const b10 = PHOTOGRAMMETRY_WINDOW_FACADES.find((f) => f.id === "b10-edge12")!;
  assert.ok(b5.topWindowY - b10.topWindowY > 7);
  for (const f of PHOTOGRAMMETRY_WINDOW_FACADES) {
    assert.equal(
      f.confidence,
      "interpreted-original-ipr2023-facade-projection-not-surveyed",
    );
    assert.ok(f.sourceNodeIds.length > 0);
    for (const id of f.sourceNodeIds)
      assert.ok(manifest.nodes.find((n) => n.id === id && n.level === 16));
    assert.ok(Math.abs(Math.hypot(...f.normal) - 1) < 1e-8);
    assert.ok(Math.abs(Math.hypot(...f.tangent) - 1) < 1e-8);
    assert.ok(f.rowPitch >= 2.9 && f.rowPitch <= 3.1);
  }
});

test("the source-fragment mask rejects roof, ground, wall bands, bright wall pixels, foliage and remote surfaces", () => {
  assert.equal(photogrammetryWindowMask(facade, pane, normal, glass), 1);
  assert.equal(
    photogrammetryWindowMask(facade, pane, { x: 0, y: 1, z: 0 }, glass),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(
      facade,
      { ...pane, y: facade.topWindowY + 1.6 },
      normal,
      glass,
    ),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(
      facade,
      { ...pane, y: facade.topWindowY - facade.rowPitch * 6 - 1 },
      normal,
      glass,
    ),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(
      facade,
      { ...pane, y: pane.y + 1.4 },
      normal,
      glass,
    ),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(facade, pane, normal, [0.9, 0.9, 0.88]),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(facade, pane, normal, [0.12, 0.3, 0.14]),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(facade, pane, normal, [0.6, 0.11, 0.08]),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(
      facade,
      { x: pane.x + normal.x, y: pane.y, z: pane.z + normal.z },
      normal,
      glass,
    ),
    0,
  );
  assert.equal(
    photogrammetryWindowMask(
      facade,
      { ...pane, x: 100, z: 100 },
      normal,
      glass,
    ),
    0,
  );
});

test("Prague fictional occupancy follows real UTC instants and source daytime has zero emission", () => {
  const evening = Date.parse("2026-10-10T19:00:00Z"); // 21:00 CEST
  const dawn = Date.parse("2026-10-11T02:00:00Z"); // 04:00 CEST
  assert.equal(photogrammetryNightState(1, evening).night, 0);
  assert.equal(photogrammetryNightState(0, evening).night, 1);
  assert.ok(
    photogrammetryNightState(0, evening).activity >
      photogrammetryNightState(0, dawn).activity,
  );
  assert.deepEqual(
    photogrammetryNightState(0, evening),
    photogrammetryNightState(0, evening),
  );
});

test("source tile broad phase never drops an annotated original leaf", () => {
  for (const f of PHOTOGRAMMETRY_WINDOW_FACADES)
    for (const id of f.sourceNodeIds) {
      const node = manifest.nodes.find((n) => n.id === id)!;
      assert.ok(
        photogrammetryFacadesForNode(node, manifest).includes(f),
        `${f.id}/${id}`,
      );
    }
  assert.equal(
    photogrammetryFacadesForNode(
      {
        center: [
          manifest.mercatorOrigin.x + 5000,
          manifest.mercatorOrigin.y,
          350,
        ],
        radius: 3,
      },
      manifest,
    ).length,
    0,
  );
});

test("material integration preserves source texture/UV color handling and adds no facade geometry", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const texture = new Texture(null, scene);
  texture.uOffset = 0.125;
  texture.vOffset = 0.25;
  const node = manifest.nodes.find((n) => n.id === facade.sourceNodeIds[0])!;
  const material = createPhotogrammetryMaterial(scene, node, texture, 0.2);
  const albedo = material.albedoColor.asArray();
  const lighting = createPhotogrammetryLighting(scene, { manifest });
  const plugin = lighting.attach(material, node)!;
  assert.ok(plugin);
  assert.equal(lighting.attach(material, node), plugin);
  assert.equal(material.albedoTexture, texture);
  assert.deepEqual(material.albedoColor.asArray(), albedo);
  assert.equal(texture.gammaSpace, true);
  assert.equal(texture.uOffset, 0.125);
  assert.equal(texture.vOffset, 0.25);
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.lights.length, 0);
  const fragment = plugin.getCustomCode("fragment")!;
  assert.match(
    fragment.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION,
    /photoSource = albedoTexture\.rgb/,
  );
  assert.match(
    fragment.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION,
    /finalEmissive \+=/,
  );
  assert.equal(plugin.getCustomCode("vertex"), null);
  assert.equal(plugin.getCustomCode("fragment", ShaderLanguage.WGSL), null);
  assert.equal(lighting.stats().activeMaterials, 1);
  material.dispose();
  assert.equal(lighting.stats().activeMaterials, 0);
  lighting.dispose();
  scene.dispose();
  engine.dispose();
});

test("lamp light budget uses mapped poles only, disables by day, changes quality, and disposes", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const lamps = [
    {
      id: "one",
      x: 0,
      z: 0,
      groundY: 1,
      height: 6,
      heightProvenance: "test-mapped-height",
      source: "https://www.openstreetmap.org/node/1",
    },
    {
      id: "two",
      x: 8,
      z: 0,
      groundY: 2,
      height: 5,
      heightProvenance: "test-mapped-height",
      source: "https://www.openstreetmap.org/node/2",
    },
    {
      id: "far",
      x: 100,
      z: 0,
      groundY: 2,
      height: 5,
      heightProvenance: "test-mapped-height",
      source: "https://www.openstreetmap.org/node/3",
    },
  ];
  const lighting = createPhotogrammetryLighting(scene, {
    manifest,
    lampLights: true,
    lamps,
  });
  const instant = Date.parse("2026-10-10T19:00:00Z");
  lighting.update({
    daylight: 0,
    quality: "high",
    player: { x: 0, z: 0 },
    instant,
  });
  assert.equal(scene.lights.length, 2);
  assert.deepEqual(lighting.stats().activeLampIds, ["one", "two"]);
  assert.equal(lighting.stats().lampLights, 2);
  assert.ok(scene.lights[0] instanceof PointLight);
  assert.equal(scene.lights[0].position.y, 6.8);
  lighting.update({
    daylight: 0,
    quality: "low",
    player: { x: 0, z: 0 },
    instant: instant + 1,
  });
  assert.equal(lighting.stats().lampLights, 1);
  lighting.update({
    daylight: 1,
    quality: "high",
    player: { x: 0, z: 0 },
    instant: instant + 2,
  });
  assert.equal(lighting.stats().lampLights, 0);
  assert.deepEqual(lighting.stats().activeLampIds, []);
  lighting.dispose();
  assert.equal(scene.lights.length, 0);
  lighting.dispose();
  scene.dispose();
  engine.dispose();
});
