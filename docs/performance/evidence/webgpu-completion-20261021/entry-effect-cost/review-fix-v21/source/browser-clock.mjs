import { createTransitClock, installSimulationClock, installRenderClock } from './transit-clock.mjs';

/** The dynamic import resolves through Vite to the exact same snapshot module
 * Game imports. Default-off does not import/patch the physics implementation. */
export async function installBrowserClock(game, specification, dependencies = {}) {
  if (!specification) return undefined;
  const retiredError = () => {
    if (dependencies.signal?.aborted && dependencies.signal.reason !== undefined) return dependencies.signal.reason;
    const error = new Error('Clock QA owner retired during installation'); error.name = 'AbortError'; return error;
  };
  const checkOwner = () => {
    if (dependencies.signal?.aborted || dependencies.isRetired?.() || game.disposed === true || game.scene?.isDisposed === true)
      throw retiredError();
  };
  checkOwner();
  if (game.network !== true) throw new Error('Clock QA requires multiplayer; guest start refused');
  if ((dependencies.nowUTC ?? Date.now)() >= specification.config.armAtUTC)
    throw new Error('Clock QA Game started after static arm deadline');
  const { Simulation } = await (dependencies.loadSimulation ?? (() => import('virtual:webgpu-completion-simulation')))();
  checkOwner();
  if ((dependencies.nowUTC ?? Date.now)() >= specification.config.armAtUTC)
    throw new Error('Clock QA module import missed static arm deadline');
  const clock = createTransitClock(specification.config, specification.configId);
  const physics = installSimulationClock(Simulation, clock);
  let rendering;
  try { checkOwner(); rendering = installRenderClock(game, clock); checkOwner(); }
  catch (error) { try { rendering?.dispose(); } finally { physics.dispose(); } throw error; }
  let active = true;
  const abort = () => owner.dispose();
  const owner = {
    snapshot: () => ({ configId: specification.configId, configSha256: specification.configSha256,
      simulationSourceSha256: specification.simulationSourceSha256, active,
      actualSimulationMatches: game.sim === undefined ? null : game.sim instanceof Simulation,
      physics: physics.snapshot(), rendering: rendering.snapshot() }),
    dispose() {
      if (!active) return;
      active = false; dependencies.signal?.removeEventListener('abort', abort);
      try { rendering.dispose(); } finally { physics.dispose(); }
    },
  };
  // Stop can win after this async function resolves but before its caller's
  // await continuation publishes the owner. The signal still owns cleanup.
  dependencies.signal?.addEventListener('abort', abort, { once: true });
  try { checkOwner(); } catch (error) { owner.dispose(); throw error; }
  return owner;
}
