# Candidate boundary after current-source audit

19 October 2026. Read-only delegated audit `grass_worker_design`; this is a prototype proposal, not a measured performance result.

## Alternatives

1. Persistent tile-only worker: same deterministic `prepareTile(x,z)` generator, terrain/classifier modules and Float32 matrix calculation. Moves classification, terrain normals and matrix construction. Leaves cached root selection, hysteresis, fades, batch copying and GPU upload on main. Smallest independently verifiable boundary.
2. Tile plus selection worker: potentially removes frustum scanning and ranking too, but transfers preference/history and larger results (up to 174528/407232/814528 matrix bytes by quality). Latest-sequence rejection can starve selection while moving; must preserve existing 3m/forward-dot/FOV/resolution tolerances. Not first prototype.
3. Static numeric visibility candidate worker: recurring enclosing active-mesh cost exists, but this includes mutable scene/LOD/skeleton operations. No measured removable pure-query share yet.
4. Whole renderer worker: supported by Babylon OffscreenCanvas, but scene.render stays serial and input/network/resize/HUD bridges are broad changes. No evidence it fixes throughput by itself.
5. Physics worker: current measured average around0.4ms, too small to prioritize. Pure transit schedule computation is a narrower fraction of an envelope containing live Rapier ground queries and Babylon object creation/disposal; stack attribution required.

## Tile-only prototype contract if selected

One persistent worker per grass controller, at most two in-flight requests and at most two accepted completions/update under existing tile-management2ms budget. Module worker imports exact build modules; no substituted classifier or matrix algorithm. Existing cached-only selection2ms/256-step budget remains separate. CommitSelection/fillVacancies/PhotoGrassBatch.flush are outside both existing budgets and are not solved by the worker.

Messages carry epoch, request ID and coordinates; results contain identical PhotoGrassTile matrices. Handler only queues bounded results; update owns cache/revision/render state. Camera changes alone do not invalidate deterministic tiles. Explicit capsule cancellation/resource generation/disposal invalidate requests; stale/duplicate results are inert. Yield between generator slices so cancellation can run.

Main keeps existing FIFO1536 cache. Worker removes a completed tile from its own cache before transfer, preventing future detached-buffer cache hits. Maximum160 roots×16×4 =10240B/tile,20480B for two completions; maximum main matrix cache15MiB plus other selection/batch references. FIFO hits must not become LRU. No SAB/cross-origin isolation required.

Constructor/load/message failure or measured stall falls back to original bounded generator without concurrent duplicate producers or losing roots/fades/cache. Worker readiness must not redefine existing render-resource `stats.ready`; pending state includes in-flight and queued results. Dispose terminates worker, removes handlers and discards inbox.

## Source and lifecycle risks

Terrain/classifier exports are mutable but no current runtime update API/writes were found. Terrain arrays, triangle sets and spatial bounds are imported snapshots; mutation is already unsupported/inconsistent. Future world edits need explicit epoch/invalidation. Placement imports shared/world, including TREES=createMappedTrees, so worker duplicates startup/data memory: measure, do not silently refactor world.

Current Babylon9.30/application default uses Float32 matrices. Retain ComposeToRef and local tile coordinates, adding tile center only in PhotoGrassBatch.add. No arithmetic reordering or world-coordinate Float32 conversion. If selection moves later, camera/frustum snapshots retain JS-number/Float64 precision.

## Decision evidence required

Current production CPU stack capture and/or narrow placement timing must show meaningful removable work. Existing profiler samples show presence, not duration. Accept worker only after actual browser bundling/transfer smoke, deterministic settled hash/1916 roots, cancellation/teleport/quality/fades/current-frustum coverage and bounded cache/lifecycle tests; then comparable production A/B without detailed diagnostics, including cold convergence and message/apply costs. Reject no-benefit or visual/coverage/lifecycle regressions. Merely creating a worker does not complete KEY-40.
