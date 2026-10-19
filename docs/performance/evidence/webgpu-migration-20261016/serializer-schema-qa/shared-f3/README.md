# Shared immutable serializer schema F3: promising production pilot, not accepted

This checkpoint implements and tests a private candidate; **native runtime/default migration is not accepted or changed**. F1 and F2 negative results are retained. The next step is independent repeated production runs with a controlled post-ready schedule, then a native patch only if overall benefit is reproduced. KEY-31/32 remain open.

## Mechanism and alternatives

F1 warm serialization was faster but new actual defines over retained already-warm Effects were slower. Six fresh-process A/F1/M/M/F1/A CPU runs reproduced cold PBR14.339/23.862/11.122ms and Standard8.801/14.587/7.430ms. This supports a Node first-use metadata cost; it does not identify the browser peak or GC.

F2 shares only immutable primitive names/order/validNames for an exactly equal observed complete sequence. Per-defines WeakMap has one metadata pointer. A strong FIFO index holds at most32 entries/262144 total name units; per entry1024names/32768units. No values, fragments, results, engines, devices or GPU resources are retained. All original getter/key/value/coercion/throw order and canonical fallback stay intact. Live weak-key pointers can retain evicted metadata: these bounds are not total heap/GC guarantees.

F2 wholewarm improved and cold PBR pooled10.869ms beat A13.444ms, but96unique long-common-prefix shapes took72.863ms versus A32.942ms. F3 adds only count/first/last rejection before the unchanged full equality loop. A new Map/hash index would add key allocations/state/eviction complexity; endpoint-only hits would be incorrect. A same-endpoint/count/different-middle regression verifies full equality. F3 improves that churn78.672→46.929ms in its separate focused window, **still slower than A33.465ms**. No universal speedup is claimed.

## Correctness, CPU and build

- Frozen final payload3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768; helper manifest e898c89f0f9c5e32d7c2d61fb6df4cd9cf0e07004d81293739b83e4ed97a1492. F1e4f6 and F2330085 are preserved separately. Exact source inverses reproduce previous versions.
- Final13differential/shared tests PASS, current A18/F318, sixwarm5/5 and sixcold2/2:91cases including controls, not91independent F3 tests. ScopedTS3174/0. Entire11WGSL result objects/55states exactly equal without result normalization; only top-level timestamp lies outside results. Root separate52case/156call+2partial-init injections PASS, not universal cyclic-module proof. Source review F2[]/F3[] completed independently.
- Focus A/F2/F3 wholewarm pooled PBR7.671/4.699/4.819ms, Standard5.597/4.091/4.101ms, Surface8.120/5.062/5.122ms. Cold PBR13.311/10.752/11.001ms, Standard8.619/7.321/7.390ms. F3 firstPBR[18.278,13.588] versus A[15.531,15.300] does not improve every peak. Only two processes per variant; Node/NullEngine IO is not GPU/FPS acceptance.
- First F2 proof stopped at a type error in the new cold-test Effect options. Three required null fields added only in the fixture; failed logs retained. Subsequent F2 and F3 runners passed all25/20jobs. F3 public source unchanged after freezing. Inherited warm report.input.afterSha e4f6 describes original fixture provenance; actual selected F3 module is pinned by loader receipts3cc739. Raw reports were not rewritten.
- Private603file candidate source193477b9df5b54d3256ee8cf8285344ebd76dd55aeb929a7f5bfbd0d6b43ccab, baseline595file909ebf8a019b26aff5561a0aaba97b976a26d033746da85ae958c6f4034589a5. App source remains unchanged; extra files are test/provenance. Full1448/1448 tests, full TypeScript/Vite build PASS. No F3 isolated integration, fresh production patch install or combined checkpoint yet.
- Only root private working dependency slot switched F1→F3. Existing compiled F1 dist remains F1; any F1 Node rerun through that slot requires explicit restoration from archived F1 payload. Shared/played dependencies were not edited. All pnpm runs use verify-deps-before-run=false following the prior recorded F1 pnpm incident.

## Production Edge

GTX1060/driver582.28, native compatibility, Low77%, CSS1528x650/internal1175x500, one actual Alex, zero simulated ambient, fixed night1792447200000 and controlled weather. Same S1900/E marker then benchmark/E/W8000/space2500. No detailed profiler. All four valid runs have correct UI/server source, continuous seq0, one full UI/raw frame-array match, focused/visible state, valid health/pending0, zero new programs/modules and two sync pipelines. Driver snapshots are not per-frame clock guarantees. Primary triad:

|Run|FPS|p95 ms|p99 ms|max ms|>=100 ms|
|---|---:|---:|---:|---:|---:|
|A3|56.7|20.2|23.8|168.3|4|
|F3 B2|57.0|19.8|29.7|139.3|3|
|A4|55.2|22.9|42.1|179.3|5|

Auxiliary early A1:55.6FPS/p9522.1/p9933.1/max163.4ms/4>=100, with a much longer ready idle. B2 reduces max against both controls; p99 is worse than A3 and better than A4. This is mixed evidence, not a percentage guarantee. First previous-frame CPU/render162.8/152→134.7/124.7→175.3/161.1ms; later render101.4→75→101.6ms. It supports replication without identifying a specific function or GPU cause. GPU clocks, idle and final trajectories differ. A4 after snapshot P5/810memory is retained; it does not prove benchmark clocks or justify excluding A4.

**Invalid B1:** root initially omitted VITE_SOURCE_SNAPSHOT_ID at build. Server header and dist-byte manifest identified the candidate but public client benchmark ID was null, so the collector rejected it. Its57.2FPS/p9925/max140ms are preserved and excluded from acceptance. Exact unchanged source was rebuilt with the required env; compiled embedded ID is now checked before the pilot. Valid B2 client ID is193477b9. A2 services were stopped before any new client/benchmark while repairing this issue. The invalid result and aborted attempt are never counted as successful repetitions. Old and repaired build logs/dist manifests are both retained; no client ID was patched into raw data.

Independent raw review[] confirmed classification/identities/continuity/UI match and previous-frame attribution. One valid F3 sample at differing clocks is insufficient for repeatability/native acceptance. Low single-session evidence does not replace Medium/three-session, image/shadow/lifecycle or final WebGL2/WebGPU matrix.

Own4200/2595 services stopped, own measurement tab closed, viewport reset. Protected4199 all17code files and served HTML exactly unchanged; older played snapshots were not rebuilt. Runtime PID receipts stay local. artifact-manifest.json pins encoded/decoded SHA and byte lengths; large artifacts are losslessly gzip-compressed. Baseline source/assets provenance remains in ../f1/source/baseline-manifest.json and the accepted native checkpoint.
