/** Explicit root-run clock server bootstrap. Importing this module in a unit
 * test NEVER imports server/index or starts a listener. No global clock patch. */
import { readFile, mkdir } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBuild } from './harness.mjs';
import { createTransitClock, installSimulationClock } from './transit-clock.mjs';
import { backendPort, inside, sha256, verifySnapshot } from './common.mjs';

/** Pure launch policy; it does not read inherited credentials or mutate cwd/env.
 * The executable applies only this explicit list before snapshot server imports. */
export function createServerLaunchPlan(identity, proofDirectory, portInput) {
  const port = backendPort(String(portInput));
  return Object.freeze({ cwd: identity.snapshot,
    setEnv: Object.freeze({ HOST: '127.0.0.1', PORT: String(port), LINEAR_API_KEY: '',
      FEEDBACK_DIR: join(proofDirectory, 'feedback'), NODE_ENV: 'production',
      STRAHOV_SOURCE_SNAPSHOT_ID: identity.sourceSnapshotId }),
    unsetEnv: Object.freeze(['STATIC_DIR']),
    evidence: Object.freeze({ cwd: identity.snapshot, sourceSnapshotId: identity.sourceSnapshotId, apiPort: port,
      linearCredentialCleared: true, apiOnly: true, productionMode: true,
      feedbackDirectory: join(proofDirectory, 'feedback'),
      permittedDiagnosticsDirectory: join(identity.snapshot, '.cache/game-diagnostics'),
      diagnosticsOutputException: 'Coordinator permits only normal production diagnostics under owned immutable candidate cache; source inputs stay unchanged' }),
  });
}
export async function bootstrap(buildInput, proofInput, portInput) {
  const { directory, identity } = await loadBuild(buildInput);
  if (!identity.clock) throw new Error('Clock bootstrap requires an explicit clock build; default-off uses the normal server');
  const port = backendPort(portInput ?? process.env.PORT ?? '2597');
  if ([2596, 2567, 2568].includes(port)) throw new Error('Clock bootstrap cannot replace baseline/dev/integration server');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const proofDirectory = inside(join(root, '.cache/webgpu-completion-20261021/validation'), resolve(proofInput));
  await mkdir(proofDirectory);
  const launch = createServerLaunchPlan(identity, proofDirectory, port);
  const simulationURL = pathToFileURL(join(identity.snapshot, 'shared/simulation.ts')).href;
  const simulationSha = sha256(await readFile(join(identity.snapshot, 'shared/simulation.ts')));
  writeFileSync(join(proofDirectory, 'bootstrap-input.json'), JSON.stringify({ schemaVersion: 1, sourceSnapshotId: identity.sourceSnapshotId,
    buildId: identity.buildId, helperSha256: identity.helperSha256, clock: identity.clock, apiPort: port,
    simulationModule: simulationURL, simulationSourceSha256: simulationSha, launchPolicy: launch.evidence,
    capturedAtUTC: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  if (simulationSha !== identity.clock.simulationSourceSha256) throw new Error('Bootstrap Simulation source mismatch');
  if (Date.now() >= identity.clock.config.armAtUTC) throw new Error('Clock server start missed the immutable arm deadline');
  process.chdir(launch.cwd);
  for (const key of launch.unsetEnv) delete process.env[key];
  for (const [key, value] of Object.entries(launch.setEnv)) process.env[key] = value;
  // The process must be launched with --import tsx. Native import and the
  // server's extensionless import then use the same registered module graph.
  const { Simulation } = await import(simulationURL);
  if (Date.now() >= identity.clock.config.armAtUTC) throw new Error('Clock server module import missed immutable arm deadline');
  const clock = createTransitClock(identity.clock.config, identity.clock.configId);
  const hook = installSimulationClock(Simulation, clock);
  let sequence = 0, finalized = false, pendingInput = '';
  const proof = reason => {
    const state = hook.snapshot();
    const value = { schemaVersion: 1, reason, capturedAtUTC: new Date().toISOString(), sequence,
      sourceSnapshotId: identity.sourceSnapshotId, buildId: identity.buildId, helperSha256: identity.helperSha256,
      configId: identity.clock.configId, configSha256: identity.clock.configSha256, config: identity.clock.config,
      simulationModule: simulationURL, simulationSourceSha256: simulationSha, apiPort: port, launchPolicy: launch.evidence, hook: state,
      observedServerHook: state.calls > 0 && state.instancesObserved === 1 && state.unexpectedReceivers === 0 && state.methodOwned,
      scope: 'Only Simulation.tick transit argument mapped; Authority/Motion/Timeline/Date/input timestamps unchanged. No packet rewrite.' };
    writeFileSync(join(proofDirectory, String(sequence++).padStart(4, '0') + '-' + reason + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    return value;
  };
  const terminal = reason => { if (finalized) return; finalized = true; proof(reason); hook.dispose(); };
  const input = chunk => {
    pendingInput += String(chunk);
    if (pendingInput.length > 1024) { pendingInput = ''; return; }
    let newline;
    while ((newline = pendingInput.indexOf('\n')) >= 0) {
      const command = pendingInput.slice(0, newline).trim(); pendingInput = pendingInput.slice(newline + 1);
      if (command === 'proof') console.log(JSON.stringify(proof('requested')));
    }
  };
  process.stdin.on('data', input);
  process.once('exit', () => terminal('exit'));
  proof('installed');
  try {
    await import(pathToFileURL(join(identity.snapshot, 'server/index.ts')).href);
    await verifySnapshot(identity.snapshot);
    proof('server-imported');
    console.log(JSON.stringify({ clockServerReady: true, apiPort: port, proofDirectory, buildDirectory: directory,
      configId: clock.configId, instructions: 'Root may send proof newline on this owned process stdin OUTSIDE measurement intervals. Terminal proof is also immutable. Root owns API shutdown.' }));
  } catch (error) { terminal('startup-failed'); throw error; }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await bootstrap(...process.argv.slice(2));
