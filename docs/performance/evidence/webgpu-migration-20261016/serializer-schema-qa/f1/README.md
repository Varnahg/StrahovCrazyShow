# Serializer schema F1: CPU benefit, production hold

F1 is **not accepted into the native runtime**. This checkpoint preserves a tested experiment and its negative production result; KEY-31/32 and the migration remain open. No game source, patch or lockfile is changed by this evidence commit.

One physically private Babylon9.30 MaterialDefines module stores bounded immutable names/order metadata in a per-instance WeakMap. It retains no values, fragments, results, engines or GPU resources. Per entry:1024 names/32768 name units; this is not a total heap or zero-retention guarantee. Original getter/coercion order, exceptions and exact canonical fallback are preserved. Original shared dependency bytes and played4199 code/HTML were verified unchanged. Older played snapshots were not rebuilt.

## Correctness and build

- Frozen helper payload e4f6ef0b87f24c9c482705ed1dab46b4853ededb3eb97e040e66c7dab258c3e0, manifest c6180d745280a9118322b8c2a8622f2a0d3821378b1db89e90d5ae63d584a29d. Helper74/74 CPU tests, scopedTS3173/0,11 whole WGSL result objects/55 states exactly equal. Root independent52-case/156-call corpus plus two partial-initialization probes PASS; these probes are not universal cyclic-module proof.
- Candidate602 files, source604293f79a2f76d77eb291a617471ee6176b481ad65770d1763bd22ee034bc4c, baseline595 files909ebf8a019b26aff5561a0aaba97b976a26d033746da85ae958c6f4034589a5. Only seven QA/test/provenance files added to app source. Portable test and exact oracle/license included.
- Full1448/1448 tests, full TypeScript/build and all four original isolated integration scenarios PASS. Exact logs and commands: root/validation-f1.json. These validate a private physical dependency override, not a fresh production patch install or combined-source pipeline.
- First bare pnpm test triggered pnpm11 automatic dependency installation and failed before tests on the private package-map junction. It relinked the private Babylon aliases. Retained physical copies were restored, core/loaders identity checked, and all10860 original plus10860 private files matched their expected bytes. Failed log and repair receipt are retained. Successful subsequent commands explicitly use --config.verify-deps-before-run=false; repository/global configuration was not changed.
- Six interleaved CPU jobs A/F/M/M/F/A found pooled warm whole-chain medians PBR7.639/5.396/4.446ms, Standard5.982/4.285/3.983ms and Surface8.000/5.185/4.770ms. F1 beats original CPU, but memo remains faster. Two processes per variant, NullEngine harness, not GPU acceptance. Independent F1 code review and five-run raw audit completed without findings, with the limits below.

## Production Edge pilot

All runs: native WebGPU compatibility, Low77%, CSS1528x650/internal1175x500, one actual Alex session, fixed night/controlled weather, same E/W/space procedure. No detailed sampler/timers;0 new programs/modules,2 synchronous pipelines, valid render health/pending0, focused and visible. M1/M2 denote two browser runs of the same F1 implementation, not separate code versions.

|Run|FPS|p95 ms|p99 ms|max ms|>=100 ms|simulated passengers|
|---|---:|---:|---:|---:|---:|---:|
|A1|55.3|21.5|33.1|165.3|4|0|
|F1 M1|55.4|21.4|30.7|228.8|3|2|
|A2|56.5|20.4|26.4|158.9|4|0|
|F1 M2|56.5|20.9|25.7|223.9|1|0|
|A3|56.5|19.9|26.0|167.1|4|0|

M1 is retained but **not comparable** because ambient passenger count differs. Matching triad A2/M2/A3 has fewer >=100ms intervals but a worse maximum. Previous-frame CPU/render for the first interval is156.6/146.8ms in A2 versus220/209.5ms in M2; later render peak96.6 versus78.2ms. This locates a CPU render phase; it does not prove a serializer cold miss, GC or a specific function caused the first regression. Different idle times, trajectories and recorded GPU clocks/temperatures limit causality. Full raw/UI arrays match after telemetry rounding, sequences are continuous. Render health is not full image/GPU-memory acceptance. Low single-session pilots do not replace the final Medium/three-session matrix.

root/comparison.json includes raw-derived conditions, exclusions, startup, hitches and GPU before/after. All five continuous session logs, UI benchmark results and screenshots are retained. Process PID records are omitted; run identity is preserved. Own4200/2595/2568 services stopped, measurement tab closed and viewport reset.

## Decision and next step

Keep F1 out of main runtime. First test whether new real defines/submeshes over retained warm Effects reproduce cold overhead. A shared immutable schema variant is conditional on that evidence; no value/result cache is authorized by this checkpoint. Existing accepted native behavior and user builds remain unchanged.

artifact-manifest.json records exact encoded and decoded bytes. Large artifacts are losslessly gzip-compressed; helper fixture/source closure and candidate delta are included. Unchanged baseline sources are referenced by the accepted baseline manifest.
