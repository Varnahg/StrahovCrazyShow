# Předání: F3 materiálové CPU rutiny

- Task webgpu-f3-routine-profile-20261019, owner webgpu-01a15102-f3-routines, cwd29fa. Pouze nový izolovaný QA snapshot + evidence, bez změny nativního runtime.
- Výsledek: first-entry MaterialDefines.toString37,4ms/499, PBRprepareDefines20,5ms, getBindGroups12,2ms; další light revision24/10,4/10,1ms. Mesh preparation95,5/56,3ms. Nested walltime, nikoli GPU ani čistý FPS přínos.
- 32/32 cílených testů, fullTS/buildPASS. Source46dab140223f92cbf6df85fa01a164174fadcdcb8139dd9c939ffa1c2a3927bb, F3 payload3cc739…, 1actual/0ambient, Low1175×500. Health valid,0newprogram/module,2syncpipeline. Routine cleanup0/0, vlastní služby/karta ukončené, rozlišení obnoveno,4199 před/po shodná.
- Doložená přesná inverze QA Game/render-cost do současného F3, pět dalších helper/test souborů. Scope review bez nálezu; raw/evidence finální review připojeno při přijetí.
- Zbývající práce celé migrace není hotová. Další úzký kandidát serializeru musí mít vlastní průzkum variant/differential proof/produkční A/B. Žádné přepnutí defaultu ani zavření KEY31/32 z tohoto měření.
- Přesné podmínky, omezení a zachované neúspěchy: docs/performance/evidence/webgpu-migration-20261016/f3-routine-profile/README.md. Commit/integraci doplní protokol v lokální cache a Linear; cizí WIP se nestaguje.
