# Offline shader compiler fixtures

Root owner webgpu-migration-01a14497-fixtures-integration integrated five exact files from the reviewed native checkpoint dacb5dd into primary main b758c0a. The already integrated atmosphere-webgpu test loads these local JS/WASM files; without them the committed test suite would be incomplete. They originated in57460fe and retain the official Babylon9.30 CDN URLs, sizes and SHA256 in provenance.json. No download, version change or compiler execution was added by this integration.

The production engine's native-WGSL guard still rejects runtime GLSL translation before loading a compiler. Keeping the pinned offline regression fixtures does not restore that runtime path. Both native-v7 (1150/1150) and combined-v1 (1210/1210) complete test/build/integration checkpoints include the same bytes.

Before copying, root verified the native-v3 and historical A/B public junctions target the migration worktree public directory, whereas primary destination files were absent. Original4188 public is physical. Only primary received the files; protected snapshot bytes were not changed. Git stores these five files as ordinary100644 blobs, not LFS pointers.

Integration used a private index while holding an owned canonical index lock. Full native commit tree, sole parent, exact delta paths, physical working outputs and all unrelated132dirty files were checked. Normal commit hooks remained enabled. Record: .cache/webgpu-migration/fixtures-overlay-main-integration.json. The isolated Git publication probe and independent script review are recorded in the root handoff; no reset/stash/restore/clean was used. This task has no processes or GPU work; reservation is released after this handoff.
