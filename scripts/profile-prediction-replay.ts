/** Isolated CPU comparison: real Game.reconcile and Rapier, never browser FPS. */
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { initPhysics } from "../shared/simulation";
import {
  createReplayFixture,
  REPLAY_INPUTS,
} from "../tests/helpers/prediction-replay-fixture";

await initPhysics();
const results = [];
// Alternate modes to avoid attributing a first-run warmup to the repair.
for (const staleHistory of [true, false, false, true, true, false]) {
  const fixture = createReplayFixture("walking", staleHistory);
  try {
    const before = performance.now();
    for (let ack = 3; ack <= REPLAY_INPUTS; ack += 3)
      fixture.game.reconcile(fixture.authority(ack));
    results.push({
      mode: staleHistory ? "stale-history-baseline" : "corrected-history",
      milliseconds: performance.now() - before,
      fullWorldReplaySteps: fixture.times.length,
      authorities: REPLAY_INPUTS / 3,
      finalState: fixture.actor.capture(),
    });
  } finally {
    fixture.sim.dispose();
  }
}
const sources = [
  "client/game.ts",
  "shared/netcode.ts",
  "shared/simulation.ts",
  "tests/helpers/prediction-replay-fixture.ts",
  "scripts/profile-prediction-replay.ts",
];
console.log(
  JSON.stringify(
    {
      scope:
        "Node CPU component comparison; not a server-load, browser-FPS or GPU measurement",
      baseline:
        "Only replacement of existing prediction captures is suppressed; actual reconciliation and Rapier are shared",
      limitation:
        "One correction followed by six acknowledgments; no new input generation or moving-contact rollback",
      createdAt: new Date().toISOString(),
      node: process.version,
      cpu: cpus()[0]?.model,
      sourceSha256: Object.fromEntries(
        sources.map((path) => [
          path,
          createHash("sha256")
            .update(readFileSync(new URL(`../${path}`, import.meta.url)))
            .digest("hex"),
        ]),
      ),
      results,
    },
    null,
    2,
  ),
);
