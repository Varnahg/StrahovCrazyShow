import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import { PlayerFlashlight } from "../client/flashlight";
import "../client/render-shaders";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const pool = new AvatarPrimitivePool(scene);
  const rig = createAvatarRig(
    scene,
    applyAvatarPreset(0, DEFAULT_AVATAR),
    pool,
  );
  const camera = new FreeCamera("RH camera", new Vector3(0, 2, -4), scene);
  camera.minZ = 0.01;
  camera.setTarget(new Vector3(0, 1, 3));
  scene.activeCamera = camera;
  const torch = new PlayerFlashlight(scene);
  t.after(() => {
    torch.dispose();
    rig.root.dispose();
    pool.dispose();
    scene.dispose();
    engine.dispose();
  });
  return { engine, scene, pool, rig, camera, torch };
}

// Independent local TRS composition: deliberately does not read a cached
// world matrix, so a stale elbow/ancestor cache cannot validate itself.
function fk(node: TransformNode, input: Vector3, normal = false) {
  let result = input.clone();
  for (
    let joint: TransformNode | null = node;
    joint;
    joint = joint.parent as TransformNode | null
  ) {
    const rotation =
      joint.rotationQuaternion ??
      Quaternion.RotationYawPitchRoll(
        joint.rotation.y,
        joint.rotation.x,
        joint.rotation.z,
      );
    const matrix = Matrix.Compose(joint.scaling, rotation, joint.position);
    result = normal
      ? Vector3.TransformNormal(result, matrix)
      : Vector3.TransformCoordinates(result, matrix);
  }
  return normal ? result.normalize() : result;
}

test("third-person torch follows actual right-hand FK for six builds, all headings and parent transforms", (t) => {
  const { scene, pool, camera, torch } = fixture(t);
  // Babylon 9.30 standard spot falloff is pow(cos(angle), exponent) up to
  // its outer cutoff. Fade before that boundary instead of drawing the
  // former almost-full-brightness triangular edge on the road.
  assert.ok(
    Math.pow(Math.cos(torch.beam.light.angle / 2), torch.beam.light.exponent) <
      0.02,
  );
  const parent = new TransformNode("moving avatar parent", scene);
  parent.position.set(12, 2, -7);
  parent.rotation.y = 0.31;
  for (let preset = 0; preset < 6; preset++) {
    const rig = createAvatarRig(
      scene,
      applyAvatarPreset(preset, DEFAULT_AVATAR),
      pool,
    );
    rig.root.parent = parent;
    rig.root.position.set(3, 0.2, 5);
    const animation = new AvatarAnimator(rig);
    for (const yaw of [
      0,
      Math.PI / 4,
      Math.PI / 2,
      Math.PI,
      -Math.PI / 2,
      -Math.PI / 4,
    ]) {
      animation.reset();
      for (let frame = 0; frame < 90; frame++)
        animation.update(
          { position: rig.root.position, yaw, flashlight: true },
          1 / 60,
        );
      torch.update(rig, camera, true, false, "low");
      assert.ok(
        Vector3.Distance(
          torch.beam.light.position,
          fk(rig.rightElbow, new Vector3(0, -0.39, 0.02)),
        ) < 1e-5,
      );
      assert.ok(
        Vector3.Distance(
          torch.beam.light.direction,
          fk(rig.rightElbow, new Vector3(0, -1, 0), true),
        ) < 1e-6,
      );
      const body = scene.getMeshByName("torch casing")!;
      assert.equal(body.parent, rig.rightElbow);
      assert.deepEqual(body.position.asArray(), [0, -0.275, 0.02]);
      assert.equal(
        torch.beam.light.parent,
        null,
        "world socket pose must not inherit the rig twice",
      );
      // Moving an ancestor without a forced refresh must be visible immediately.
      parent.position.x += 0.3;
      torch.update(rig, camera, true, false, "low");
      assert.ok(
        Vector3.Distance(
          torch.beam.light.position,
          fk(rig.rightElbow, new Vector3(0, -0.39, 0.02)),
        ) < 1e-5,
      );
    }
    rig.root.dispose();
  }
});

test("first-person hidden rig uses the displayed RH camera direction and a projected lower-right origin", (t) => {
  const { rig, camera, torch, scene } = fixture(t);
  torch.update(rig, camera, true, false, "low");
  rig.root.setEnabled(false);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
    for (const pitch of [-0.65, 0, 0.65]) {
      const forward = new Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      );
      camera.position.set(15, 3, -8);
      const target = camera.position.add(forward);
      camera.setTarget(target);
      // TargetCamera.setTarget offsets position.z by Babylon Epsilon at an
      // exact side view. Compare the actual displayed target ray, not the
      // pre-call request vector (which then differs by about 0.001 rad).
      const displayedDirection = target.subtract(camera.position).normalize();
      torch.update(rig, camera, true, true, "low");
      assert.ok(torch.beam.light.isEnabled());
      assert.ok(
        Vector3.Distance(torch.beam.light.direction, displayedDirection) < 1e-5,
        `yaw=${yaw}, pitch=${pitch}, actual=${torch.beam.light.direction}, expected=${displayedDirection}`,
      );
      const projected = Vector3.Project(
        torch.beam.light.position,
        Matrix.Identity(),
        camera.getViewMatrix().multiply(camera.getProjectionMatrix()),
        new Viewport(0, 0, 800, 600),
      );
      assert.ok(
        projected.x > 400 && projected.y > 300,
        `camera socket must project lower-right: ${projected}`,
      );
      assert.equal(
        scene.getMeshByName("torch casing")!.isEnabled(false),
        false,
      );
    }
  rig.root.setEnabled(true);
  torch.update(rig, camera, true, false, "low");
  assert.equal(scene.getMeshByName("torch casing")!.isEnabled(), true);
});

test("steady torch updates reuse the prop/light and do not repeat enabled or light-source resynchronization", (t) => {
  const { scene, rig, camera, torch } = fixture(t);
  torch.update(rig, camera, false, false, "low");
  assert.equal(scene.getMeshByName("torch casing"), null);
  assert.ok(torch.beam.light.getShadowGenerator(), "OFF prepares the real local shadow map without creating a visible prop");
  assert.equal(torch.beam.light.isEnabled(), false);
  assert.equal(torch.beam.light.intensity, 0);
  assert.equal(torch.beam.light.shadowEnabled, false);
  torch.update(rig, camera, true, false, "low");
  const body = scene.getMeshByName("torch casing")!;
  const meshes = scene.meshes.length,
    materials = scene.materials.length;
  let bodyEnables = 0,
    lightEnables = 0;
  const bodyEnable = body.setEnabled.bind(body),
    lightEnable = torch.beam.light.setEnabled.bind(torch.beam.light);
  body.setEnabled = (value) => {
    bodyEnables++;
    bodyEnable(value);
  };
  torch.beam.light.setEnabled = (value) => {
    lightEnables++;
    lightEnable(value);
  };
  for (let frame = 0; frame < 40; frame++)
    torch.update(rig, camera, true, false, "low");
  assert.equal(bodyEnables, 0);
  assert.equal(lightEnables, 0);
  assert.equal(scene.meshes.length, meshes);
  assert.equal(scene.materials.length, materials);
  assert.equal(scene.lights.length, 1);
  assert.equal(torch.beam.light.range, 24);
  torch.update(rig, camera, false, false, "low");
  assert.equal(bodyEnables, 1);
  assert.equal(lightEnables, 1);
  for (let frame = 0; frame < 40; frame++)
    torch.update(rig, camera, false, false, "high");
  assert.equal(bodyEnables, 1);
  assert.equal(lightEnables, 1);
  assert.equal(torch.beam.light.shadowEnabled, true);
  assert.ok(
    scene.meshes.every((mesh) => !mesh.lightSources.includes(torch.beam.light)),
  );
});

test("profile replacement and missing/disposed rigs do not recreate orphan props or lose controller-owned materials", (t) => {
  const { scene, rig, pool, camera, torch } = fixture(t);
  torch.update(rig, camera, true, false, "medium");
  const body = scene.getMeshByName("torch casing")!,
    casing = body.material!;
  const lens = scene.getMeshByName("torch lens")!,
    glass = lens.material!;
  const next = createAvatarRig(
    scene,
    applyAvatarPreset(2, DEFAULT_AVATAR),
    pool,
  );
  torch.update(next, camera, true, false, "medium");
  assert.equal(scene.getMeshByName("torch casing"), body);
  assert.equal(body.parent, next.rightElbow);
  rig.root.dispose();
  assert.equal(
    body.isDisposed(),
    false,
    "reparented prop must survive the previous avatar",
  );
  next.root.dispose();
  assert.ok(body.isDisposed() && lens.isDisposed());
  torch.update(next, camera, true, false, "medium");
  assert.equal(torch.beam.light.isEnabled(), false);
  assert.equal(
    scene.getMeshByName("torch casing"),
    null,
    "dead rig must not receive a new prop",
  );
  assert.ok(
    scene.materials.includes(casing) && scene.materials.includes(glass),
  );
  const replacement = createAvatarRig(
    scene,
    applyAvatarPreset(3, DEFAULT_AVATAR),
    pool,
  );
  torch.update(replacement, camera, true, false, "medium");
  assert.equal(scene.getMeshByName("torch casing")!.material, casing);
  torch.update(undefined, camera, true, false, "medium");
  assert.equal(torch.beam.light.isEnabled(), false);
  torch.dispose();
  torch.dispose();
  torch.update(replacement, camera, true, false, "medium");
  assert.ok(
    !scene.materials.includes(casing) && !scene.materials.includes(glass),
  );
  assert.equal(scene.getMeshByName("torch casing"), null);
  assert.equal(scene.getMeshByName("torch lens"), null);
  assert.equal(scene.lights.length, 0);
  replacement.root.dispose();
});

test("128/256/512 torch shadows share one generator and real scene scheduling emits zero shadow passes while off", async (t) => {
  const { scene, rig, camera, torch } = fixture(t);
  // CPU render dispatch only. The NullEngine cannot prove pixels/occlusion.
  scene.texturesEnabled = false;
  rig.root.setEnabled(false);
  camera.position.set(0, 1, -4);
  camera.setTarget(new Vector3(0, 1, 5));
  const caster = MeshBuilder.CreateBox(
    "opaque torch occluder",
    { size: 1 },
    scene,
  );
  caster.position.set(0, 1, 5);
  caster.material = new StandardMaterial("torch test opaque", scene);
  caster.metadata = { depthCaster: "opaque" };
  torch.update(rig, camera, true, true, "low");
  const shadow = torch.beam.light.getShadowGenerator() as ShadowGenerator;
  assert.equal(shadow.mapSize, 128);
  for (const [quality, size] of [
    ["medium", 256],
    ["high", 512],
    ["low", 128],
  ] as const) {
    const previousMap = shadow.getShadowMap()!;
    torch.update(rig, camera, true, true, quality);
    assert.equal(torch.beam.light.getShadowGenerator(), shadow);
    assert.equal(shadow.mapSize, size);
    assert.ok(shadow.getShadowMap()!.getCustomRenderList);
    assert.ok(
      !scene.textures.includes(previousMap),
      "a resized shadow target must release the previous map",
    );
  }
  let passes = 0,
    draws = 0;
  shadow.getShadowMap()!.onBeforeBindObservable.add(() => passes++);
  shadow.onBeforeShadowMapRenderMeshObservable.add(() => draws++);
  for (let frame = 0; frame < 4; frame++) {
    scene.render();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(
    passes > 0 && draws > 0,
    "the enabled fixture must actually schedule and dispatch a shadow caster",
  );
  passes = draws = 0;
  // Game supplies false when entering a vehicle; the actor's carry animation
  // independently exits its hold pose (covered by animation.test.ts).
  torch.update(rig, camera, false, true, "low");
  for (let frame = 0; frame < 3; frame++) scene.render();
  assert.equal(passes, 0);
  assert.equal(draws, 0);
  assert.equal(torch.beam.light.intensity, 0);
  assert.equal(torch.beam.light.shadowEnabled, true);
  assert.ok(!caster.lightSources.includes(torch.beam.light));
  torch.update(rig, camera, true, true, "low");
  scene.render();
  assert.ok(
    passes > 0 && draws > 0,
    "returning on must reuse a functional map",
  );
  const map = shadow.getShadowMap()!;
  torch.dispose();
  assert.ok(!scene.textures.includes(map));
});
