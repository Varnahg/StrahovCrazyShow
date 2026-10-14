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

export const REPLAY_AT = Date.parse("2026-10-11T06:15:00Z");
export const REPLAY_INPUTS = 18;

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
  const times: number[] = [],
    tick = sim.tick.bind(sim);
  sim.tick = (now) => {
    times.push(now ?? NaN);
    tick(now);
  };
  function authority(ack: number, state = authorities.get(ack)!): Authority {
    return {
      tick: ack,
      ack,
      inputEpoch: 1,
      inputTickBase: 0,
      receivedSeq: REPLAY_INPUTS,
      time: REPLAY_AT + ack * FIXED_DT * 1000,
      state: structuredClone(state),
    };
  }
  return { game, sim, actor, prediction, authorities, times, authority };
}
