# B6 interactive door core

Date: 2026-10-25. User feedback: ordinary B6 doors start closed and E opens/closes them. A bedroom's second paired leaf remains a fixed collision panel. B1 is unchanged. This document covers the shared core and its small real-physics fixtures; it does not claim integrated multiplayer, native asset, visual or full-building acceptance.

## Evidence and choice

The production `Actor` uses Rapier's kinematic capsule (radius 0.25 m, half-height 0.55 m, skin 0.02 m). Actor, camera and most navigation queries exclude handles in `Simulation.walkingColliders`; that set already contains player colliders. This set cannot serve as the occupancy test: players would be excluded. Door requests therefore pass all current and next player capsule positions explicitly.

Three discrete physical implementations were considered:

| Variant | Evidence / trade-off |
| --- | --- |
| Move one kinematic/static collider then propagate positions | Rejected. In pinned Rapier, `propagateModifiedBodyPositionsToColliders` updates collider translation but a ray at the new pose misses until a real `world.step`. A hidden step would also advance players/car/time and invalidate reconciliation. |
| Remove/recreate or enable/disable each pose | Rejected for immediate restoration: it changes query registration and adds native lifecycle work at each interaction. |
| Two registered, always-enabled static poses; change only sensor/group/query filters | Selected. Immediate filtered raycasts and the production Actor's controller see open, closed and restored states without any added physics tick. No per-toggle collider allocation; two colliders per movable leaf. |

The probes are recorded in `.cache/b6-door-runtime-20261024/rapier-query-probe.log` and `rapier-groups-probe.log`; portable regression tests are `tests/cad-door-physics.test.ts`. Both poses must be created before the normal initial physics step, which registers their broad-phase bounds. This is not a zero-tick constructor query guarantee.

Synchronized animation would require authoritative transition times, intermediate moving collision and replay support. The accepted behavior is an instantaneous state change shared by physics and rendering. There is no visual easing against a stationary collider.

## Native and spatial contract

`CadDoorDefinition` contains `id`, `buildingId: "b06"`, `floor`, `sourceDoorId`, exact `renderPartIds`, exact `collisionPartIds`, `hingeModel`, `closedPose:{position,rotationY}`, `collider:{halfExtents}`, `openAngle`, `handleModel`, and `defaultOpen:false`. All positions are model-local metres, Y up. The closed cuboid's width is along its local X axis, thickness along Z. The hinge and handle already include the native frame's normal offset; runtime must not calculate that offset again.

The builder can export movable render parts with `collision:false`; then `collisionPartIds` is empty. Otherwise the static importer excludes exactly the listed part IDs. It must not strip all door roles, fixed paired leaves or facade glazing. Import-time/native audit must verify referenced part identity, bounds and matching model definition hash. The helper rejects duplicate door IDs and shared moving part IDs, but does not parse or attest the GLB itself.

`placeCadDoorDefinition(definition, placement)` uses the existing CAD placement. `cadDoorPose(worldDefinition, open)` returns the world cuboid position/quaternion and handle point. For batched render vertices, `cadDoorModelTransform(definition, open)` gives a rigid affine delta `R * closedModelVertex + translation`, applied before the building placement. `cadDoorModelPoint` provides the same transformation for individual points. Always transform the saved closed vertices, not previously transformed vertices, to avoid accumulated drift. Restore bounding/shadow data from those same resulting vertices.

Root selected a functional opening of ±90 degrees in the source swing direction. CAD's measured opening angles (including ~26 degrees) remain source metadata; extending them to 90 degrees is an explicit gameplay articulation, not a claim that the plan measured that angle. Closed placement stays exact. Native open-pose overlap and real passages still need full-building validation.

## Physics ownership and query filters

```ts
const physics = new CadDoorPhysics(world, definitions, {
  ignoredColliders: simulation.walkingColliders,
});
// Create before the existing normal initialization world.step().
physics.apply(id, open);                 // no physics tick / no allocation
physics.applyStates(snapshot.states);    // complete snapshot, validate before any mutation
```

The inactive pose stays enabled with `collisionGroups=0`, `sensor=true`, and its handle in the shared ignore set. The active pose has groups `0xffffffff`, is not a sensor, and is removed from that set. Actors already use the shared set. Vehicles already exclude sensors. All other queries (including camera, LOS and vehicle exit) must use the shared ignore predicate, `EXCLUDE_SENSORS`, or explicit `CAD_DOOR_QUERY_GROUPS`. A raw query with undefined groups and flags sees the inactive sensor; the regression deliberately proves this hazard. Moving physical bodies interact only with the active groups. Do not disable inactive colliders later.

`lineOfSight(eye,id,currentOpen,actorCollider?)` excludes the target door's two colliders, the requesting actor, inactive poses and shared ignored handles. It still tests other active doors and walls. The target is the current posed handle.

`guardChange(id,targetOpen,capsules,obstacles?)` checks all supplied current-to-next capsule trajectories against the whole swept leaf. Capsules use their centre, radius, cylindrical half-height and optional skin (default 0.02 m). It rejects malformed input and reports blocking actor IDs. Angular OBB samples include a conservative displacement expansion, so thin leaves between sampled angles cannot slip through the guard. Vertical and path bounds are conservative: an uncertain near-contact can reject the interaction rather than move a player. Root must supply every relevant live on-foot actor, including the requester, regardless of ignored collision handles. Do not collect players from a scene query that filters them out.

The fourth argument supplies explicit known vehicle/traffic colliders as `CadDoorObstacleProbe = {id, collider, next:{position,rotation}, skin?}`. `next` is the world **collider** pose, including its local offset from the body origin. The current shape and pose come directly from that collider. Include the shared player car even when parked: `VehicleEntity.park()` changes its body to Fixed, so a dynamic-body-only scene filter would miss it. Disabled bodies/colliders and sensors are excluded; body type alone is never grounds for excluding a known obstacle. Known vehicle/traffic shapes are Cuboids; an invalid or unsupported active probe returns `invalid-obstacle`, not a false PASS.

The obstacle check uses actual Rapier shape contacts without changing collider poses or advancing the world. It reconstructs the body pivot and the collider's offset, then samples the linear body-origin path and shortest quaternion rotation. This preserves the offset chassis's arc during pitch/roll instead of interpolating its centre across a straight chord. Every door angle is checked against every sampled obstacle phase. Nearest-sample bounds add `translation/(2*n) + 2*bodyRadius*sin(angle/(4*n))` plus the door angular displacement and skin to the contact distance. Sampling caps keep work bounded without removing the conservative padding. Far objects are rejected using rotation-invariant swept bounds first; stationary objects have one sample. Temporary query objects are event-only, with no new world colliders/bodies or per-frame state.

The caller must supply the actual predicted next pose. Traffic is updated inside Simulation.tick after the server door flush, so simply taking the previous tick's `nextTranslation()` is insufficient; the Simulation integration must extrapolate its known traffic velocity/pose before the guard. Authority rewind applies accepted states directly and does not rerun occupancy against a different prediction world.

Authoritative state restoration applies snapshots without rerunning the current occupancy guard; replay may restore an earlier world while current predicted actors are elsewhere. The authoritative server runs the guard before the original interaction. `dispose()` removes only owned colliders and ignore handles and is idempotent; call it before `world.free()`. Other Actor handles remain intact.

## Authority, request and history API

`CadDoorStateStore(definitions,{worldEpoch,definitionHash})` owns closed default state for one world only. Identity uses a nonempty world epoch and a lowercase SHA-256 definition hash. Each request contains only that identity plus `requestId`, `doorId`, `expectedRevision` (per-door), and desired boolean `open`. Explicit desired state and expected revision prevent duplicated E packets from toggling twice.

`request(raw,{actor,tick,nowMs,canSee,canChange,apply})` uses the server-resolved actor centre/eye/vehicle flag. It validates identity, schema, monotonic per-actor request ID and time, expected revision, distance ≤2 m to the current handle, LOS and all-player occupancy. Rate is four new attempts per second per connected actor. `apply(id,open)` runs synchronously before committing state. If it throws, state/revision remain unchanged; the consumed request ID is not retried as a new action. A duplicate reply reports current state and is not a second success or a new delta. The outer server message limit also bounds duplicate/invalid packet traffic.

Changed results contain a global revision, authoritative tick, and one door state with its own revision/changed tick. `snapshot(tick)` always includes every door, including unchanged closed ones. Snapshot validation rejects incomplete IDs, bad identity, non-finite ticks, inconsistent global revision totals and impossible open/revision parity. `forgetActor(id)` clears request/rate state on disconnect without resetting world doors. A guest/offline world owns a separate store; no module-global door state exists.

`CadDoorTimeline(definitions,identity,{historyTicks:128,maxEvents:1024})` starts uninitialized. `acceptSnapshot` / `acceptDelta` return `accepted`, `duplicate`, `stale`, `rejected`, or `resync` with an optional reason. A missing global revision latches `needsResync`; no later delta is applied until a complete compatible snapshot arrives. A foreign epoch cannot switch this timeline to another world. Reconnect/world reset creates a new instance.

`snapshotAt(tick,requiredRevision?)` returns a complete post-tick state or null. Pass the authority's required global door revision during reconciliation; an unresolved revision must not replay with guessed doors. A future local predicted tick can retain the last known state, with no speculative E transition. Newer complete snapshots establish their own baseline and discard unknown intermediate history. Retention advances only over complete tick groups and has both tick and event caps. `currentSnapshot`, `revision`, `oldestTick`, `eventCount`, `initialized`, `needsResync` expose integration state. Dispose clears maps/history. The client must restore the latest state after any historical replay.

## Validation and remaining integration

Targeted tests cover native validation, render/physics transforms under rotated placement, exact collision IDs, authority rejection/dedupe/rate, separate host worlds, complete snapshots, late join, gaps/resync, bounded history, actual immediate Rapier ray/controller state changes, production Actor passage, explicit second-player next-position protection, timeline-to-physics rewind, LOS walls and cleanup. They use a small real Rapier world and production Actor, not a copied controller.

The root integration still owns native leaf/handle export and bounds audit, shared Simulation filters, renderer batch updates/bounds, E UI, server connection authority, protocol identity, reliable events/full snapshots, prediction/reconciliation integration, complete building tests and live multiplayer/GPU validation. Passing this core suite does not establish those results.
