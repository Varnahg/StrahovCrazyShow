# Strict readiness, overlapping diagnostics and matched source pilots

Native-v12 (dc29390, snapshotcbbca97e…) passed1195/1195 tests, build/TypeScript and isolated integration. Combined-v4 (1383fc92…) passed1255/1255, build/TypeScript and integration and preserves30previous working overlays. Its build explicitly embeds VITE_SOURCE_SNAPSHOT_ID; build provenance includes HTML and JavaScript hashes. Main integrations are a7ac024 (typed operation tracking),6f5a747 (requested-effect guard) andc33127d (Game wiring). Clean runtime matches dc29390;546physical source/test files match combined-v4, with foreign WIP retained solely in the working tree.

The WebGPU readiness stub and material hot swapping could accept an old ready Effect while a requested replacement still awaited its initializer. The new read-only cache guard catches the replacement without mutating material flags. Only compilation-info observations can overlap stages; real preparation remains blocking and the final gate still requires all pending operations, a submitted real frame, validation scope and completed queue. Original deadlines were not increased. Separate RED/green regressions and private-index integration receipts are preserved here.

All C4 runs used the same full production source, one real multiplayer session, Alex preset, medium100%,1514×643 CSS/render and the same fixed night instant1792188000000 with the controlled weather fixture. The Edge tab/window was active and unfrozen. The detailed profile flag was absent. FirstF was pressed after the10second UI benchmark visibly became active and the settings panel was closed. Raw JSON was copied unchanged from the full visible JSON export.

| Backend pilot | FPS | p95 ms | p99 ms | Maximum ms | Mode→ready s |
| --- | ---: | ---: | ---: | ---: | ---: |
| WebGPU compatibility |53.5|26.5|31.2|82.6|45.718|
| WebGPU render bundles |54.2|26.4|40.3|88.4|45.930|
| WebGL2 |53.3|25.6|28.9|75.4|32.396|

All three had complete preparation, valid render health and no renderer faults. Both WebGPU runs created zero new shader modules/preparations in the first-F window. This does not mean zero pipeline creation. The NCM counter confirmed452 reused bundles but its single pilot did not establish a reliable overall win.

**These are pilots, not completed acceptance:** one run per mode, not counterbalanced repeated pairs; natural resolution differs from the intended final acceptance size; only one avatar; no per-run thermal/takt control. The difference in FPS is not proof of improvement. WebGPU startup is materially longer and remains open for optimization. A native-v12 diagnostic run is also archived: it had detailed profiling and a missing raw source tag, so is not a valid formal performance sample. Its original JSON is preserved rather than corrected retrospectively.

The native diagnostic reached ready54.876s after mode entry, with29.314s lighting and another13.103s after the lighting event. C4 WebGPU used17.398s lighting plus8.920s tail; NCM15.175s plus12.131s; WebGL12.324s plus0.018s. Tails are measured from the lighting event, not from the later optional profile snapshot. Stage-only elapsed cannot be presented as total startup speed.

`pilot-summary.json` contains exact derived values and session IDs; originals, manifests, composition/resolutions, validation logs and receipts remain separately inspectable. `artifact-sha256.json` identifies archived bytes. Next investigation measures exact WGSL raw/body duplicates before changing shader cache behavior. Default/public WebGPU rollout and the remaining functional/performance matrix are not yet accepted.
