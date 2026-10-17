# KEY-31: izolovaná diagnostika dlouhých snímků

Root drží task webgpu-hitch-validation-20261017 a původní GPU/heavy reservations. Oddělená QA4194/API2589, source C5 c4e22edd…be6f5; chráněná4193 obnovena totožná a nemění se. [Průzkum, evidence a omezení](../../performance/evidence/webgpu-migration-20261016/hitches-v1/README.md).

Baseline/cadence/timingOFF a první fence služby byly ukončeny výhradně podle vlastních runtime records. Nyní běží4194/API2589 z nové QA kopie `gpu-fence-pending`, snapshot3cf48f74ff65aac859d5fa8869abd8da775cee66f85d2df5ff5ac4428d54507b, run `gpu-fence-pending-validation`. Game je po měření opuštěná, QA karta about:blank. Runtime record v `.cache/webgpu-hitch-validation-20261017/runs/gpu-fence-pending-validation/runtime.json`; root nadále vlastní služby a porty, release neproběhl.

[Druhá evidence](../../performance/evidence/webgpu-migration-20261016/hitches-v2/README.md) uchovává4úplné gzip logy, zdrojové identity/diffy, přesné counter páry a testové/build logy. TimestampOFF zásek neodstranilo. První fence sonda používala nesprávnou aggregate-health eligibility a nic nezměřila; nová actual RenderHealth regrese chybu odhalila a22/22 + scopedTS3361/0 i fullTS/Vite build prošly. Nejde o výkonovou opravu ani finální přejímku.

Session8716d28a-7a9b-4bac-bb9f-71dd189ee073: prvníF na prahuB6, zónaoutside,1,586sGameCPU/56programů/796Effect změn, poté8,568sRAFgap a8,7252s post-submit completion latency. Raw+1/process+1, queuewait+8507,4ms/CPU+60,5ms; uvnitř běží síťovéJS aHTTPflush. Závěrečný cleanup:0render/asset errors, profilertracked0. PřesnéGPU/driver místo neníprokázané; fenceobsahujecompletion i callbackdelivery. TrasaobsahovalapřerušenýCUAvstup a skutečnýnávrat, nenímatchedA/B.

Root přijímá childfence předání pouze jako QA nástroj. Kandidát runtime `webgpu-torch-receivers-20261017` a jeho ordering/Gamewiring jsou odděleně rozpracované, zatím bezplnépipeline/GPUdůkazu. Hraná4193C5 se nepřepisuje.
