import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../client/game";
import { HUNT_POINTS } from "../shared/world";
import { vehicleCameraCanFollow } from "../shared/controls";

function withInputFixture(
  run: (
    game: Game,
    counts: { locks: number; unlocks: number },
    documentStub: any,
  ) => void,
) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "document");
  const counts = { locks: 0, unlocks: 0 };
  const documentStub: any = {
    pointerLockElement: null,
    exitPointerLock() {
      counts.unlocks++;
      this.pointerLockElement = null;
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  const canvas: any = {
    style: {},
    focus() {},
    closest() {
      return null;
    },
    hasPointerCapture() {
      return false;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    requestPointerLock() {
      counts.locks++;
      documentStub.pointerLockElement = canvas;
    },
  };
  const game = Object.assign(Object.create(Game.prototype), {
    canvas,
    ready: true,
    uiModal: false,
    firstPerson: true,
    orbiting: false,
    yaw: Math.PI,
    pitch: 0.28,
    distance: 8,
    keys: new Set(),
    lastCameraInput: 0,
    actor: {
      vehicle: true,
      speed: 4,
      yaw: 0.4,
      position: { ...HUNT_POINTS[0], y: 1 },
    },
  }) as Game;
  try {
    run(game, counts, documentStub);
  } finally {
    if (prior) Object.defineProperty(globalThis, "document", prior);
    else Reflect.deleteProperty(globalThis, "document");
  }
}
test("saved walking first person does not disable the exterior car orbit path", () =>
  withInputFixture((game) => {
    assert.equal(game.firstPerson, true);
    assert.equal(game.footFirstPerson, false);
    game.actor.vehicle = false;
    assert.equal(game.footFirstPerson, true);
    game.actor.vehicle = true;
    assert.equal(game.footFirstPerson, false);
    assert.equal(
      vehicleCameraCanFollow({
        driving: true,
        speed: 4,
        nowMs: 10000,
        lastLookMs: 0,
        orbiting: true,
        uiModal: false,
      }),
      false,
    );
  }));
test("entry releases existing walking mouse lock while preserving the walking view preference", () =>
  withInputFixture((game, counts, documentStub) => {
    documentStub.pointerLockElement = game.canvas;
    game.alignVehicleCamera();
    assert.equal(counts.unlocks, 1);
    assert.equal(documentStub.pointerLockElement, null);
    assert.equal(game.yaw, 0.4);
  }));
test("E prioritises safe vehicle exit over a collectible at the identical position", () =>
  withInputFixture((game) => {
    const actions: string[] = [],
      notices: string[] = [];
    game.network = true;
    game.onAction = (action) => actions.push(action);
    game.onNotice = (notice) => notices.push(notice);
    game.found = new Set();
    Object.defineProperty(game.actor, "speed", {
      configurable: true,
      value: 0,
    });
    game.interact();
    assert.deepEqual(actions, ["vehicle"]);
    actions.length = 0;
    Object.defineProperty(game.actor, "speed", {
      configurable: true,
      value: 5,
    });
    game.interact();
    assert.deepEqual(actions, []);
    assert.match(notices.at(-1)!, /zastav/);
  }));
