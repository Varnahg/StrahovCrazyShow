import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/instancedMesh";
import { ContactShadows } from "../client/contact-shadows";
import { groundHeight } from "../shared/terrain";
import { groundRotation } from "../shared/terrain-entities";

test("a never-visible crowd allocates no contact meshes and never reads a hidden pose", (t) => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const shadows = new ContactShadows(scene);
  t.after(() => {
    shadows.dispose();
    scene.dispose();
    engine.dispose();
  });
  const sources = [...scene.meshes];
  const hidden = {
    get x(): number {
      throw new Error("hidden x queried");
    },
    get y(): number {
      throw new Error("hidden y queried");
    },
    get z(): number {
      throw new Error("hidden z queried");
    },
  };
  for (let frame = 0; frame < 3; frame++)
    for (let avatar = 0; avatar < 100; avatar++)
      shadows.set(String(avatar), hidden, 0.95, 0.65, 0, false);
  assert.deepEqual(scene.meshes, sources);
  shadows.remove("42");
});

test("hidden contact shadows keep dormant transforms and restore terrain and airborne poses on reveal", (t) => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const shadows = new ContactShadows(scene);
  t.after(() => {
    shadows.dispose();
    scene.dispose();
    engine.dispose();
  });
  const feet = { x: 110, y: groundHeight(110, 12), z: 12 };
  shadows.set("subject", feet, 0.95, 0.65, 0.5);
  const mesh = scene.getMeshByName("contact subject")!;
  const originalPosition = mesh.position.asArray(),
    originalRotation = mesh.rotationQuaternion!.asArray();
  const originalCount = scene.meshes.length;
  for (let frame = 0; frame < 10; frame++) {
    feet.x += 0.5;
    feet.z += 0.25;
    feet.y = groundHeight(feet.x, feet.z);
    shadows.set("subject", feet, 2.3, 3.8, 1, false);
    assert.equal(mesh.isEnabled(), false);
    assert.deepEqual(mesh.position.asArray(), originalPosition);
    assert.deepEqual(mesh.rotationQuaternion!.asArray(), originalRotation);
  }
  shadows.set("subject", feet, 2.3, 3.8, 1, true);
  assert.equal(mesh.isEnabled(), true);
  assert.equal(scene.meshes.length, originalCount);
  assert.deepEqual(mesh.position.asArray(), [feet.x, feet.y + 0.006, feet.z]);
  assert.deepEqual(mesh.scaling.asArray(), [2.3, 1, 3.8]);
  const slope = groundRotation(feet.x, feet.z, 1, 3.8, 2.3);
  assert.deepEqual(mesh.rotationQuaternion!.asArray(), [
    slope.x,
    slope.y,
    slope.z,
    slope.w,
  ]);

  feet.y += 2;
  shadows.set("subject", feet, 0.95, 0.65, -0.2, false);
  shadows.set("subject", feet, 0.95, 0.65, -0.2, true);
  assert.deepEqual(mesh.position.asArray(), [feet.x, feet.y + 0.006, feet.z]);
  assert.deepEqual(
    mesh.rotationQuaternion!.asArray(),
    Quaternion.RotationAxis(Vector3.Up(), -0.2).asArray(),
  );
  shadows.remove("subject");
  assert.equal(mesh.isDisposed(), true);
  shadows.set("subject", feet, 0.95, 0.65, 0, false);
  assert.equal(scene.getMeshByName("contact subject"), null);
  shadows.set("subject", feet, 0.95, 0.65, 0, true);
  assert.notEqual(scene.getMeshByName("contact subject"), mesh);
});
