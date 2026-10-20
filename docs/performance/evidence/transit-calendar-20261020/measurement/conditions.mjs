// Pure gates shared by the injected UI and offline evidence inspection.
export function assertSame(value, expected, label) {
  if (value === undefined || expected === undefined || JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error('Missing or changed ' + label);
}
export function assertNear(value, expected, tolerance, label) {
  if (!Number.isFinite(value) || !Number.isFinite(expected) || Math.abs(value - expected) > tolerance)
    throw new Error('Missing or changed ' + label);
}
export function assertScene(snapshot, scenario) {
  if (snapshot.ready !== true || snapshot.disposed !== false || snapshot.preparingRenderQuality !== false ||
      snapshot.health?.valid !== true || snapshot.health.phase !== 'ready' || snapshot.health.pendingOperations !== 0 ||
      snapshot.pendingData !== 0 || snapshot.renderErrors !== 0 || snapshot.assetErrors !== 0)
    throw new Error('Renderer not completely ready or required health evidence missing');
  if (snapshot.network !== true || !Array.isArray(snapshot.avatars) || snapshot.avatars.length < 3)
    throw new Error('Need main UI multiplayer and two actual SDK peers');
  if (snapshot.avatars.some(a => !a.id || !a.nickname || !a.avatar || !a.position) ||
      new Set(snapshot.avatars.map(a => JSON.stringify(a.avatar))).size < 3)
    throw new Error('Need complete evidence of three distinct avatars');
  assertSame(snapshot.quality, scenario.quality, 'quality');
  assertSame(snapshot.backend, scenario.backend, 'backend');
  assertSame(snapshot.lightingInstant, scenario.instant, 'lighting time');
  assertSame(snapshot.transitInstant, scenario.instant, 'transit time');
  assertSame(snapshot.ambient?.passengers, scenario.expectedPassengers, 'passenger cohort count');
  assertSame(snapshot.transitStatus?.state, 'scheduled', 'feed validity');
  assertSame(snapshot.visibilityState, 'visible', 'page visibility');
  for (const [key, value] of Object.entries(scenario.weather)) assertSame(snapshot.weather?.[key], value, 'weather.' + key);
  assertNear(snapshot.yaw, scenario.yaw, 1e-8, 'yaw');
  assertNear(snapshot.pitch, scenario.pitch, 1e-8, 'pitch');
  assertNear(snapshot.distance, scenario.distance, 1e-8, 'camera distance');
  assertNear(snapshot.actor?.x, scenario.spawn.x, .8, 'main spawn x');
  assertNear(snapshot.actor?.z, scenario.spawn.z, .8, 'main spawn z');
  if (!snapshot.camera || !Number.isInteger(snapshot.camera.activeId) || snapshot.camera.activeId !== snapshot.camera.gameCameraId ||
      !Array.isArray(snapshot.camera.view) || snapshot.camera.view.length !== 16 ||
      !Array.isArray(snapshot.camera.projection) || snapshot.camera.projection.length !== 16)
    throw new Error('Missing actual active camera identity/matrices');
  for (const key of ['width', 'height']) {
    if (!(snapshot.viewport?.[key] > 0) || !(snapshot.backbuffer?.[key] > 0)) throw new Error('Missing actual resolution');
  }
  if (!snapshot.gpu?.renderer || !snapshot.gpu?.vendor || !snapshot.gpu?.backend) throw new Error('Missing actual GPU/backend evidence');
  if (!snapshot.passengers?.some(p => p.projectedInside)) throw new Error('No passenger projects into camera view');
}
export function assertStableScene(before, after) {
  for (const key of ['viewport', 'backbuffer', 'gpu', 'backend', 'quality', 'weather', 'ambient', 'pool', 'scene'])
    assertSame(after[key], before[key], key);
  assertSame(after.health.generation, before.health.generation, 'render generation');
  assertSame(after.camera.activeId, before.camera.activeId, 'active camera');
  assertSame(after.avatars.map(a => ({id: a.id, nickname: a.nickname, avatar: a.avatar, lod: a.lod})),
    before.avatars.map(a => ({id: a.id, nickname: a.nickname, avatar: a.avatar, lod: a.lod})), 'actual player population');
  for (const key of ['x', 'y', 'z']) {
    assertNear(after.actor[key], before.actor[key], .01, 'actor.' + key);
    assertNear(after.camera.position[key], before.camera.position[key], .01, 'camera.' + key);
    after.avatars.forEach((avatar, index) => assertNear(avatar.position[key], before.avatars[index].position[key], .03, 'peer position'));
  }
  assertNear(after.camera.fov, before.camera.fov, 1e-8, 'camera FOV');
  for (let n = 0; n < 16; n++) {
    assertNear(after.camera.view[n], before.camera.view[n], .02, 'view matrix');
    assertNear(after.camera.projection[n], before.camera.projection[n], 1e-6, 'projection matrix');
  }
}

/** Across independent real server/Game starts only generated player, camera and
 * renderer generation identities change; physical conditions remain bounded. */
export function assertComparableScenes(before, after) {
  const reference = structuredClone(before), candidate = structuredClone(after);
  candidate.camera.activeId = reference.camera.activeId;
  candidate.health.generation = reference.health.generation;
  const ids = new Map(reference.avatars.map(avatar => [avatar.nickname, avatar.id]));
  for (const avatar of candidate.avatars) {
    if (!ids.has(avatar.nickname)) throw new Error('Different actual avatar population across starts');
    avatar.id = ids.get(avatar.nickname);
  }
  assertStableScene(reference, candidate);
}
