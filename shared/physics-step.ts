import type RAPIER from "@dimforge/rapier3d-compat";

/**
 * Advance the unchanged Rapier physics pipeline at the world's configured step.
 *
 * Rapier 0.21 World.step also enumerates every collider/body wrapper to discover
 * pieces created or removed by soft-body tears. Our rigid bodies and colliders
 * are created/removed through public World methods, which update their wrappers
 * immediately. With no soft bodies, that extra traversal has no work to do.
 * Keep the standard World.step path whenever a soft body exists, so tearing and
 * its automatically created proxies remain supported. No physics query, solver
 * setting, collider, transform or timestep is changed here.
 */
export function stepRigidWorld(world: RAPIER.World) {
  if (world.softBodies.len() > 0) {
    world.step();
    return;
  }
  world.physicsPipeline.step(
    world.gravity,
    world.integrationParameters,
    world.islands,
    world.broadPhase,
    world.narrowPhase,
    world.bodies,
    world.colliders,
    world.softBodies,
    world.impulseJoints,
    world.multibodyJoints,
    world.ccdSolver,
  );
}
