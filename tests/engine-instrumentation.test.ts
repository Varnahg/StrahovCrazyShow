import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "@babylonjs/core/Engines/engine";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
// Import the production module: this must register both timer extension layers.
import { Game } from "../client/game";

test("production Game import registers the complete Babylon GPU timer contract without needing GPU support", () => {
  assert.equal(typeof Game, "function");
  assert.equal(typeof Engine.prototype.getGPUFrameTimeCounter, "function");
  assert.equal(typeof Engine.prototype.captureGPUFrameTime, "function");
  const engine = new NullEngine();
  const instrumentation = new EngineInstrumentation(engine);
  assert.equal(instrumentation.captureGPUFrameTime, false);
  assert.equal(instrumentation.gpuFrameTimeCounter.current, 0);
  instrumentation.dispose();
  engine.dispose();
});
