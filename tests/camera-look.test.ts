import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { nextCameraPitch, clampOrbitPitch } from "../client/camera-look";
import { movementFromKeys } from "../shared/controls";
import { Game } from "../client/game";

const RAD = Math.PI / 180;

test("first-person mouse look has constant angular speed and reaches both 85-degree limits without pole flips", () => {
  for (const angle of [-70, -30, 0, 30, 70]) {
    for (const deltaY of [-10, 10]) {
      const updated = nextCameraPitch(Math.tan(angle * RAD), deltaY, true);
      assert.ok(
        Math.abs(Math.atan(updated) - angle * RAD - deltaY * 0.002) < 1e-12,
      );
    }
  }
  for (const side of [-1, 1]) {
    const pitch = nextCameraPitch(0, side * 1e8, true);
    assert.ok(Number.isFinite(pitch));
    assert.ok(Math.abs(Math.atan(pitch) - side * 85 * RAD) < 1e-12);
    assert.equal(nextCameraPitch(pitch, side * 100, true), pitch);
    const returned = nextCameraPitch(pitch, -side * 100, true);
    assert.ok(
      Math.abs(returned) < Math.abs(pitch),
      "can look away from the limit immediately",
    );
  }
});

test("third-person drag retains the original height response and bounds", () => {
  for (const pitch of [-0.55, -0.1, 0.28, 1.1]) {
    for (const delta of [-5000, -80, 0, 30, 5000]) {
      assert.equal(
        nextCameraPitch(pitch, delta, false),
        Math.max(-0.55, Math.min(1.1, pitch + delta * 0.002)),
      );
    }
  }
  assert.equal(clampOrbitPitch(Number.NaN), 0.28);
  assert.ok(Number.isFinite(nextCameraPitch(Infinity, Number.NaN, true)));
});

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new UniversalCamera(
    "sky observer",
    new Vector3(0, 2, -8),
    scene,
  );
  camera.minZ = 0.08;
  const game = Object.assign(Object.create(Game.prototype), {
    camera,
    firstPerson: true,
    actor: { vehicle: false },
    yaw: 0,
    pitch: 0,
    distance: 8,
    cameraArm: 8,
    vehicleCameraSnap: false,
    sim: { cameraDistance: (a: Vector3, b: Vector3) => Vector3.Distance(a, b) },
  });
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return { game, camera };
}

test("actual Babylon first-person projection centers an 80-degree celestial body and keeps A left / D right at every yaw", (t) => {
  const { game, camera } = fixture(t);
  const viewport = new Viewport(0, 0, 800, 600);
  const pitch = nextCameraPitch(0, (-80 * RAD) / 0.002, true);
  for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
    game.yaw = yaw;
    game.pitch = pitch;
    game.updateCameraFollow(new Vector3(0, 1, 0), 1.63, 1 / 60);
    const matrix = camera
      .getViewMatrix(true)
      .multiply(camera.getProjectionMatrix(true));
    const body = camera.position.add(
      new Vector3(
        Math.sin(yaw) * Math.cos(80 * RAD),
        Math.sin(80 * RAD),
        Math.cos(yaw) * Math.cos(80 * RAD),
      ).scale(100),
    );
    const project = (point: Vector3) =>
      Vector3.Project(point, Matrix.Identity(), matrix, viewport);
    const center = project(body);
    assert.ok(
      Math.abs(center.x - 400) < 0.01,
      "body must be inside the actual rendered frustum",
    );
    assert.ok(
      Math.abs(center.y - 300) < 0.01,
      "body must be centered at its true altitude",
    );
    for (const side of [-1, 1]) {
      const step = movementFromKeys(0, side, yaw);
      const moved = project(body.add(new Vector3(step.x, 0, step.z)));
      assert.ok((moved.x - center.x) * side > 1, `yaw=${yaw}, side=${side}`);
    }
  }
});

test("switching an extreme sky look to walking orbit or vehicle follow clamps before solving the camera arm", (t) => {
  const { game, camera } = fixture(t);
  const renderPosition = new Vector3(10, 3, -7);
  for (const vehicle of [false, true]) {
    for (const side of [-1, 1]) {
      game.firstPerson = vehicle; // Vehicle mode overrides the walking preference.
      game.actor.vehicle = vehicle;
      game.yaw = 0.8;
      game.pitch = nextCameraPitch(0, side * 1e8, true);
      game.distance = 15; // Mouse-wheel zoom must not scale a steep look slope.
      game.cameraArm = 100;
      game.vehicleCameraSnap = true;
      game.updateCameraFollow(renderPosition, 1.63, 1 / 60);
      const expectedPitch = side < 0 ? -0.55 : 1.1;
      assert.equal(game.pitch, expectedPitch);
      const expected = renderPosition.add(
        new Vector3(
          -Math.sin(game.yaw) * game.distance,
          (vehicle ? 0.7 : 0.6) + 2 + expectedPitch * 4,
          -Math.cos(game.yaw) * game.distance,
        ),
      );
      assert.ok(Vector3.Distance(camera.position, expected) < 1e-9);
      assert.ok(
        camera.position.y > renderPosition.y,
        "extreme sky pitch cannot place orbit below the feet",
      );
      assert.ok(Number.isFinite(camera.getViewMatrix(true).determinant()));
    }
  }
});
