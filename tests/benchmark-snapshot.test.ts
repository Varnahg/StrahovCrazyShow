import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhotographicGrass } from "../client/photographic-grass";
import { acquireGrassResources } from "../client/photo-grass-resources";
import { AdaptiveQualityController } from "../client/adaptive-quality";
import { snapshotBenchmarkDiagnostics } from "../client/benchmark-snapshot";
import { captureModelReview } from "../client/model-review";
import { captureRenderCostInventory } from "../client/render-cost";
import { groundHeight } from "../shared/terrain";

test("completed benchmark survives real grass update, quality change and disposal without freezing live statistics", () => {
  const engine = new NullEngine({
      renderWidth: 1280,
      renderHeight: 720,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    }),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const x = 110.5,
    z = 34.5,
    y = groundHeight(x, z),
    camera = new UniversalCamera(
      "benchmark lifecycle",
      new Vector3(x, y + 1.7, z - 1.5),
      scene,
    );
  camera.minZ = 0.05;
  camera.fov = 0.8;
  camera.setTarget(new Vector3(x, y, z + 2));
  scene.render();
  const pack = JSON.parse(
      readFileSync("public/models/vegetation/grass/geometry.json", "utf8"),
    ),
    recipe = JSON.parse(
      readFileSync("public/models/vegetation/grass/material.json", "utf8"),
    ),
    resources = acquireGrassResources(
      scene,
      pack,
      recipe,
      1024,
      () => new Texture(null, scene),
    ),
    grass = new PhotographicGrass(scene, pack, recipe, resources),
    adaptive = new AdaptiveQualityController({ mode: "medium" });
  try {
    grass.update({ time: 1, quality: "medium", wind: { x: 0, z: 0 } });
    assert.ok(grass.stats.ready && grass.stats.draws > 0);
    const originalStats = grass.stats;
    const live = {
      renderer: { renderer: "fixture", vendor: "fixture", version: "1" },
      ambient: { buses: 1, passengers: 3, cars: 4 },
      realityPack: {
        architecture: { loaded: 3, errors: [] as string[] },
        campusExterior: { visible: [1, 2] },
        landmarks: { loaded: 2 },
        b6: { errors: [] as string[] },
      },
      renderCost: {
        shadows: { shadowCasters: 5 },
        surfaces: { materialUpdates: 7 },
        vegetation: {
          visibleGrassClumps: grass.stats.instances,
          photographicGrass: grass.stats,
          treeDetailCounts: [1, 2, 3],
        },
      },
      rendering: adaptive.state,
      gpu: { warnings: [] as string[], context: { samples: 1 } },
      presentationRate: { observedBrowserHz: 60, reliable: true },
    };
    const captured = snapshotBenchmarkDiagnostics(live),
      modelReview = captureModelReview(scene),
      inventory = captureRenderCostInventory(scene),
      frameIntervalsMs = [16.2, 18.4, 17.1],
      result = {
        ...captured,
        modelReview,
        renderCost: { ...captured.renderCost, inventory },
        frameIntervalsMs,
      },
      completedJson = JSON.stringify(result);
    assert.equal(result.modelReview, modelReview);
    assert.equal(result.renderCost.inventory, inventory);
    assert.equal(result.frameIntervalsMs, frameIntervalsMs);

    camera.position.x += 0.35;
    camera.getViewMatrix(true);
    grass.update({ time: 2, quality: "low", wind: { x: 3, z: 1 } });
    live.rendering = adaptive.setMode("low");
    live.renderer.version = "changed";
    live.ambient.passengers++;
    live.realityPack.architecture.errors.push("later load failure");
    live.realityPack.campusExterior.visible.push(3);
    live.realityPack.landmarks.loaded++;
    live.realityPack.b6.errors.push("later B6 failure");
    live.renderCost.shadows.shadowCasters++;
    live.renderCost.surfaces.materialUpdates++;
    live.renderCost.vegetation.treeDetailCounts[0]++;
    live.gpu.warnings.push("later context warning");
    live.gpu.context.samples = 0;
    live.presentationRate.reliable = false;
    assert.equal(grass.stats, originalStats);
    assert.equal(grass.stats.drawLimit, 8, "live quality still updates");
    assert.equal(adaptive.state.quality, "low");
    assert.equal(
      JSON.stringify(result),
      completedJson,
      "later updates must not rewrite the completed export",
    );

    const second = snapshotBenchmarkDiagnostics(live);
    assert.equal(second.rendering.quality, "low");
    assert.equal(second.renderCost.vegetation.photographicGrass.drawLimit, 8);
    grass.dispose();
    assert.equal(grass.stats, originalStats);
    assert.equal(grass.stats.ready, false);
    assert.equal(
      grass.stats.draws,
      0,
      "original teardown statistics still work",
    );
    scene.dispose();
    assert.equal(
      JSON.stringify(result),
      completedJson,
      "disposal must not rewrite a delayed JSON download",
    );
    assert.equal(second.renderCost.vegetation.photographicGrass.ready, true);
    assert.ok(result.renderCost.vegetation.photographicGrass.draws > 0);
    assert.equal(result.renderCost.vegetation.photographicGrass.ready, true);
  } finally {
    grass.dispose();
    scene.dispose();
    engine.dispose();
  }
});
