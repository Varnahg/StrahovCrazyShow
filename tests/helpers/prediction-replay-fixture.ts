import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Game } from "../../client/game";
import { NetworkTimeline } from "../../client/network-timeline";
import {
  FIXED_DT,
  PredictionHistory,
  SnapshotBuffer,
  type ActorState,
  type Authority,
} from "../../shared/netcode";
import { Simulation } from "../../shared/simulation";
import { groundHeight } from "../../shared/terrain";
import type { Input } from "../../shared/types";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  CAD_DOOR_DEFINITIONS,
  CAD_DOOR_DEFINITION_HASH,
} from "../../shared/cad-buildings";
import { CadDoorPhysics } from "../../shared/cad-door-physics";
import { CadDoorStateStore, type CadDoorState } from "../../shared/cad-doors";
import { CadDoorTimeline } from "../../shared/cad-door-timeline";

export const REPLAY_AT = Date.parse("2026-10-11T06:15:00Z");
export const REPLAY_INPUTS = 18;

/** Initialize constructor-owned door state for deliberately partial Game
 * fixtures. No Game method or authority guard is replaced. Analytic motion
 * fixtures own a tiny real door-physics world; full Simulation owns its own. */
export function installFixtureDoorHistory(game: Game, inputTickBase = 0) {
  if (!game.sim.doorPhysics)
    assert.equal(
      game.sim.world,
      undefined,
      "a spatial fixture must provide its real shared door physics; only analytic motion owns a separate door world",
    );
  const identity = {
    worldEpoch: "prediction-fixture-world",
    definitionHash: CAD_DOOR_DEFINITION_HASH,
  };
  const timeline = new CadDoorTimeline(CAD_DOOR_DEFINITIONS, identity);
  const guest = new CadDoorStateStore(CAD_DOOR_DEFINITIONS, {
    worldEpoch: "guest-local",
    definitionHash: CAD_DOOR_DEFINITION_HASH,
  });
  assert.equal(
    timeline.acceptSnapshot({ ...guest.snapshot(0), ...identity }).status,
    "accepted",
  );
  const ownedWorld = game.sim.doorPhysics
    ? null
    : new RAPIER.World({ x: 0, y: -18, z: 0 });
  if (ownedWorld) {
    ownedWorld.timestep = FIXED_DT;
    Object.assign(game.sim, { walkingColliders: new Set<number>() });
    Object.assign(game.sim, {
      doorPhysics: new CadDoorPhysics(ownedWorld, CAD_DOOR_DEFINITIONS, {
        ignoredColliders: game.sim.walkingColliders,
      }),
    });
    ownedWorld.step();
  }
  const rendered = new Map<string, CadDoorState>(),
    revisions = new Map<number, number>();
  Object.assign(game, {
    guestDoors: guest,
    doorTimeline: null,
    doorSnapshot: null,
    doorStates: new Map<string, CadDoorState>(),
    predictionDoorRevisions: revisions,
    doorRequestId: 0,
    doorInputTickBase: inputTickBase,
    lastDoorResync: -Infinity,
    cadBuildings: {
      setDoorStates(states: readonly CadDoorState[]) {
        assert.equal(states.length, CAD_DOOR_DEFINITIONS.length);
        assert.equal(
          new Set(states.map((state) => state.id)).size,
          states.length,
        );
        rendered.clear();
        for (const state of states) {
          assert.equal(
            game.sim.doorPhysics.isOpen(state.id),
            state.open,
            "renderer receives the exact state already applied to shared physics",
          );
          rendered.set(state.id, { ...state });
        }
      },
    },
  });
  if (game.network) game.attachDoorTimeline(timeline);
  else Reflect.get(game, "applyDoorSnapshot").call(game, guest.snapshot());
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    timeline.dispose();
    guest.dispose();
    rendered.clear();
    revisions.clear();
    if (ownedWorld) {
      game.sim.doorPhysics.dispose();
      ownedWorld.free();
    }
  }
  const disposeSimulation = game.sim.dispose?.bind(game.sim);
  let simulationDisposed = false;
  game.sim.dispose = () => {
    if (simulationDisposed) return;
    simulationDisposed = true;
    dispose();
    disposeSimulation?.();
  };
  return {
    timeline,
    guest,
    rendered,
    revisions,
    dispose,
    /** Supply real V14 packet metadata without evaluating optional getters.
     * Tests still invoke the unmodified Game.reconcile themselves. */
    withAuthority<T extends Authority>(packet: T): T {
      const revision = timeline.revisionAt(packet.tick);
      assert.notEqual(
        revision,
        null,
        "fixture authority must have retained door history",
      );
      return Object.defineProperties(
        Object.create(Object.getPrototypeOf(packet)),
        {
          ...Object.getOwnPropertyDescriptors(packet),
          doorWorldEpoch: {
            value: identity.worldEpoch,
            enumerable: true,
            configurable: true,
            writable: true,
          },
          doorRevision: {
            value: revision,
            enumerable: true,
            configurable: true,
            writable: true,
          },
        },
      );
    },
    rememberPrediction() {
      for (const input of game.prediction.inputs) {
        const revision = timeline.revisionAt(inputTickBase + input.seq);
        assert.notEqual(revision, null);
        revisions.set(input.seq, revision!);
      }
    },
  };
}

/** Actual Game.reconcile and current Rapier world, without browser/WebGL setup.
 * Stale-history mode suppresses only replacement of existing prediction captures:
 * it retains the old bug while all physics and authority inputs stay identical. */
export function createReplayFixture(
  movement: "walking" | "stationary" | "vehicle" = "walking",
  staleHistory = false,
  wrongModeSeqs: number[] = [],
) {
  const sim = new Simulation(),
    actor = sim.add("local", {
      x: 180,
      y: groundHeight(180, 20) + 1,
      z: 20,
    }),
    prediction = new PredictionHistory(),
    authorities = new Map<number, ActorState>(),
    input: Input = {
      x: movement === "walking" ? 0.7 : 0,
      z: movement === "stationary" ? 0 : 0.2,
      yaw: 0,
      jump: false,
      seq: 0,
      vehicle: movement === "vehicle",
    };
  if (input.vehicle) actor.setVehicle(true);
  for (let tick = -60; tick < 0; tick++) {
    actor.step({ ...input, x: 0, z: 0 });
    sim.tick(REPLAY_AT + tick * FIXED_DT * 1000);
  }
  const networkTimeline = new NetworkTimeline();
  networkTimeline.acceptAuthority(
    { inputEpoch: 1, inputTickBase: 0, tick: 0, ack: 0, time: REPLAY_AT },
    0,
    { vehicle: actor.vehicle, yaw: actor.yaw },
  );
  for (const now of [0, 100, 200])
    networkTimeline.advance(
      now,
      (seq) => ({
        ...input,
        seq,
        vehicle: wrongModeSeqs.includes(seq) ? !input.vehicle : input.vehicle,
      }),
      ({ input: command, time }) => {
        const seq = command.seq;
        actor.step(command);
        sim.tick(time);
        const state = actor.capture();
        authorities.set(seq, state);
        // Represent captures from before a server correction. The tested replay
        // must replace them with its actual resulting physics states.
        prediction.push(command, {
          ...structuredClone(state),
          position: { ...state.position, x: state.position.x - 0.1 },
        });
      },
    );
  if (staleHistory) {
    const set = prediction.states.set.bind(prediction.states);
    prediction.states.set = (seq, state) =>
      prediction.states.has(seq) ? prediction.states : set(seq, state);
  }
  const game = Object.create(Game.prototype) as Game;
  Object.assign(game, {
    sim,
    actor,
    ready: true,
    network: true,
    localId: "local",
    diagnosticNetwork: {
      motionPackets: 0,
      authorityPackets: 0,
      corrections: 0,
      resyncs: 0,
      lastCorrectionMetres: 0,
      lastMotionAtMs: 0,
    },
    lastAuthorityTick: -1,
    minimumMotionTick: -1,
    respawnPending: false,
    prediction,
    networkTimeline,
    snapshots: new SnapshotBuffer(),
    seq: REPLAY_INPUTS,
    accumulator: 0,
    visualOffset: new Vector3(),
    previousPosition: new Vector3(),
    carSnapshots: [],
    onPredictionReset() {},
  });
  const doors = installFixtureDoorHistory(game);
  doors.rememberPrediction();
  const times: number[] = [],
    tick = sim.tick.bind(sim);
  sim.tick = (now) => {
    times.push(now ?? NaN);
    tick(now);
  };
  function authority(ack: number, state = authorities.get(ack)!): Authority {
    return doors.withAuthority({
      tick: ack,
      ack,
      inputEpoch: 1,
      inputTickBase: 0,
      receivedSeq: REPLAY_INPUTS,
      time: REPLAY_AT + ack * FIXED_DT * 1000,
      state: structuredClone(state),
    });
  }
  return { game, sim, actor, prediction, authorities, times, authority, doors };
}
