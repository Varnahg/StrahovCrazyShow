# Building roof collision and explicit recovery — 2026-10-11

The generic architecture renderer drew a flat roof for OSM building `53921692`, but the corresponding Simulation branch constructed only perimeter walls. A CPU test with the real `VehicleEntity` reproduces a drop through that missing surface and prevents it after adding the matching roof collider. The live incident trajectory was not recorded, so this establishes a concrete collision defect consistent with the reported incident rather than reconstructing the entire drive.

## Sources and unchanged geometry

- [OSM way 53921692](https://www.openstreetmap.org/way/53921692), preserved in `shared/data/map.json`, fetched `2026-10-10T19:22:25.150Z`; its tags identify a commercial building, `building:levels=1`, `source=cuzk:ruian`, and RÚIAN building `25472721`.
- Its 3 m height is the existing game estimate from one OSM level × 3 m in `scripts/fetch-map.mjs`, **not a surveyed roof elevation**. The terrain-derived base remains `-4.930610074996948 m`; roof Y remains `-1.930610074996948 m`.
- The prior `client/architecture-reality.ts` roof triangulation has moved into `shared/building-roofs.ts`. Renderer and Simulation consume the same outline, height and earcut triangulation. Original corner order for roof UVs, material, near/far geometry and renderer winding treatment remain unchanged.
- The helper excludes B6, market `7645350`, and `LANDMARK_BUILDING_REPLACEMENTS`, preserving their authored roof/opening plans. It adds no stadium cap, courtyard fill, surveyed thickness or new footprint. The photogrammetry Simulation branch remains separate.
- The installed primary Rapier 0.21 API (`node_modules/@dimforge/rapier3d-compat/dist/geometry/shape.d.ts`) documents `FIX_INTERNAL_EDGES_TWO_SIDED` as retaining back-face contacts while constraining their normals. This is used for the zero-thickness roof. Ordinary `FIX_INTERNAL_EDGES` rejected the actual car from above but let an upward chassis through; the two-sided mode passes both. No duplicate faces or speculative CCD tuning was introduced.

## Before/after reproduction

At X `154.1723175048828`, Z `-125.22493743896484`, the test resets the real chassis to roof Y + 2 m with downward velocity 8 m/s and runs 90 shared simulation ticks. Removing only the previously missing roof collider reproduces the original behavior within the same test.

| State after 90 ticks | X (m) | Chassis origin Y (m) | Z (m) |
| --- | ---: | ---: | ---: |
| Roof collider absent | 154.17221069335938 | -5.010554790496826 | -125.2276611328125 |
| Matching roof present | 154.17056274414062 | -1.9418113231658936 | -125.22510528564453 |

The chassis origin is the model bottom origin, not the roof contact surface. The small Y difference between the origin and roof is expected from the existing wheel/suspension setup.

The archived [targeted test log](verification-evidence/roof-recovery-20261011/targeted-tests.log) includes these numbers. [Source hashes](verification-evidence/roof-recovery-20261011/source-hashes.json) identify the tested changes and preserved map input.

## Explicit recovery contract

`Simulation.respawnActor(id): boolean` resets an existing actor on foot independently of its previous pose, pending kinematic target, velocity or vehicle exit-speed rule. It also recovers a car owned by that actor (including a stale owner ID), while leaving another driver's car untouched. The car returns to the same terrain-aware canonical spawn used at construction. A missing actor returns `false`.

`Actor.restore(state, hard = false)` uses the independent on-foot recovery path for an explicit hard respawn update, avoiding `setVehicle(false)` reading a damaged local car pose. The client must select this path only for `Authority.respawn === true`: an ordinary `resync` retains normal `restore(state, false)` so stale client driving mode cannot relocate a legitimately parked car. The client/server agents separately implement queued-input, interpolation, camera and authority resynchronization.

`VehicleEntity.recover` recreates the native body and raycast vehicle controller, clears wheel/dynamics state, and parks in the independently supplied valid pose. The JS vehicle identity remains stable. Actor native body/controller creation is likewise shared between construction and recovery; eight repeated resets preserve native body/collider/controller and walking-collider counts. `validVehicleState` now checks parking pose, normalized quaternion and Float32-safe finite dynamics before restore mutation.

The injected invalid-state tests corrupt native translation/velocity and parking **before the next world step**. They are robustness tests, not evidence that NaN caused the user's incident; the observed parked pose was finite. The user confirmed both R and the respawn button already worked again before this hardening.

## Verification and limits

`pnpm exec tsx --test tests/building-roofs.test.ts tests/recovery-physics.test.ts tests/vehicle.test.ts tests/physics.test.ts tests/architecture-reality.test.ts`: **39/39 PASS**. This covers:

- The actual missing-roof drop reproduction, top and underside rays, actual chassis approaches from below at 25 m/s (straight and oblique), plus a synthetic 300 m/s CCD stress case.
- Both ray directions at offsets on both sides of all eight slanted outline edges, including the small source recesses; collider eligibility for all catalogued buildings and special replacements.
- Actual Babylon NullEngine vertex/index buffers versus shared roof triangles and the existing UV corner mapping. NullEngine verifies geometry data only.
- Invalid/stale recovery state, protection of another driver, repeated reset resource counts, existing car driving/parking/replay, 4,309 outdoor DEM samples and B6 walking/stair/window/roof regressions.

The initial `pnpm exec tsc --noEmit` caught one roof test typed-array mapping type error and two concurrent client test type errors. The roof test now explicitly converts the index buffer to a number array; its final eight roof/recovery tests pass again ([final log](verification-evidence/roof-recovery-20261011/final-targeted-tests.log)). Client errors were handed to that owner. Complete checkpoint TypeScript verification remains with root; this document does not claim it has passed yet.

No GPU, Blender, live N/4179 change, production FPS claim or actual camera-input walkthrough is included in this subtask. Root owns the complete checkpoint test/build/integration and visual checks. The roof collision changes CPU physics and camera query behavior; its rendered geometry is preserved.

## Completion audit: B1 and market special roofs

The follow-up read-only audit found that two generic-roof exceptions also lacked collision in their own render plans: B1 called `Geometry.roof` with its previous implicit `collision=false`, and market `7645350` appended `roofData` only to its render part. Both are now explicitly included through a separate `twoSidedRoofCollision` stream. Simulation applies the same two-sided roof collider helper to these streams and generic roofs; existing wall, stadium, fence and other closed-mesh streams retain their previous `FIX_INTERNAL_EDGES` semantics.

The landmark roof builder now requires an explicit collision destination. B1 selects the new stream, while existing stadium roofs explicitly retain the original collision stream. Market returns its existing `roofData` as the new stream, without regenerating geometry. No roof plane, polygon, UV, material or source height was changed. This adds two static colliders, with no new render draws or triangles.

The B1 surface remains the original concave Z outline at `buildingBaseHeight + B1_RENDER_HEIGHT` (9.6 m height, an existing ELSA/photo interpretation, sources checked 2026-10-10 in `LANDMARK_SOURCE`). Both external courtyards remain open. Market remains its existing OSM outline and IPR flat-roof interpretation at `buildingBaseHeight + source height + 0.025`. These are model/source interpretations, not new surveys.

The B6 upper slabs already use the same `B6_BOXES` cuboids for rendering and physics. Stadium north/south stand roofs already emit collidable upper and lower faces; the east cantilever uses closed collidable boxes. Its annulus triangulation preserves the central field and re-entrant notches, and the service portal remains physically open. Those geometries and collider semantics were not changed.

Evidence for this completion is archived separately to preserve the initial generic-roof checkpoint above:

- [Before](verification-evidence/roof-recovery-20261011/special-roofs-before.json) and [after](verification-evidence/roof-recovery-20261011/special-roofs-after.json) contain **identical** SHA-256 hashes of the complete landmark/exterior render buffers and their original collision streams, along with unchanged triangle counts, roof metadata and source provenance. The added two-sided streams are intentionally separate from those original streams.
- [Special roof test log](verification-evidence/roof-recovery-20261011/special-roof-tests.log): **30/30 PASS** for building-roofs, landmark-reality, stadium-photo-reality, campus-exterior and recovery-physics. New assertions compare every B1/market roof position, normal, index and UV against the actual render plan; actual Simulation cars collide from above and below; roof rays miss both B1 courtyards and the stadium center. Existing tests exercise the production KCC through the stadium covered service portal and exterior stairs.
- Targeted TypeScript using the archived [scoped configuration](verification-evidence/roof-recovery-20261011/tsconfig.scoped.json), which includes the changed shared modules and roof/recovery tests with their transitive dependencies: **PASS**. This is separate from root's full-project check.
- [Completion source hashes](verification-evidence/roof-recovery-20261011/special-roofs-source-hashes.json) identify these final sources; the earlier hash file remains the initial generic-roof checkpoint.

This completion likewise includes no GPU/FPS measurement or live N/4179 modification.
