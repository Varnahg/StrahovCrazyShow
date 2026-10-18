# Předání: webgpu-material-switch-cost-proof-20261018

Evidence V2 po read-only review: opraveny odkazy/SHA na actual `.pure.js` implementace engine, SubMesh, plugin manager/base a WGSL processor. Upřesněno, že `nativeCreateEffectInclusive` kromě skutečného volání zahrnuje následnou observer klasifikaci/count/ownership check; pouze vstupní Set je mimo tento časovač. **Trace/test/runtime ani raw05–07 se nemění, žádné nové testy/TS/měření.** Původní manifest SHA `364ae602b493919f2759fd3d9802e9418487922cacb1eedd7caed33d005b1d47`, report, source-evidence a tento handoff jsou zachovány v cache `review-v1/`. Nový `manifest-v2.json`/`manifest.json` mapuje nové i historické artefakty a potvrzuje nezměněné měřené SHA.

- Vlastník `webgpu-material-switch-proof-01a14497`; příjemce `/root`.
- WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, claim base `c18844f2264dd773269406346e62318d0dee3338`.
- Výsledek: dokončený izolovaný CPU proof a rozhodovací podklad. **Žádná produkční změna ani commit**, renderer/Game/dependencies/hraný build zůstávají nedotčené. Výkon celé hry není tímto proofem přijatý.
- Vlastní soubory: pouze tento handoff a `.cache/webgpu-migration-checks/material-switch-cost-proof-20261018/`. Uvnitř `proof.test.ts`, `trace.ts`, přesný adapter `native-engine.ts`, `setup.mjs`, `types.mjs`, `run-final.mjs`, `analyze.mjs`, `freeze.mjs`, `decision.md`, `report.md`, input/source/final manifesty, raw reporty a zachované logy. Přesný seznam/hash/velikost každého artefaktu je v `manifest.json`; node_modules je pouze readonly junction na existující fyzické QA dependencies.
- Cizí práce: nic nepřevzato, nic nestagováno. Root/functional_record samostatně mění day13 kandidáta; mimo moje dva writePaths se nezapisovalo.

## Důkaz

Actual PBR, Standard a PBR+CampusSurfaceArt, 12 skutečných meshes × 3 submeshes, skutečné světlo3→4→3 a actual GltfLightBudget/StableLightState. Před měřením jsou obě varianty dokončené skutečnými draw calls/readiness. Pro každý druh 48 warm přepnutí a48 nezměněných snímků ve3 samostatných procesech. Warm přepnutí: přesně36 actual native cache hitů,36 serializer/onEffectCreated/Effect changes/setEffect/reset a0 nových programů. Nezměněný draw má tyto počty0. Skutečná změna define hodnoty vytvoří1 program, návrat znovu použije původní Effect.

Medián pro36 submeshes v jednom warm snímku: PBR readiness7,381ms, serializer4,566, defines1,211, options0,880, native cache0,279; Standard5,165/2,835/širší defines1,188/options0,736/cache0,183; PBR+plugin7,258/4,540/1,176/0,802/0,265. Scopes jsou vnořené, **nesčítat**. Serializer zahrnuje původní text loop i canonicalResult; jejich cenu tento proof neoddělil. Prázdný WebGPUDrawContext reset0,009–0,026ms není důkaz ceny skutečných GPU bindings/owner slots. Žádný přepočet na794 produkčních změn.

Shodné full defines, key/Effect, zpracované WGSL bytes, processing metadata/layout a skutečné delegované uniform update hodnoty při každém warm návratu. Plugin má navíc actual samostatný UniformBuffer se12 floats. WGSL material buffer správně používá non-UBO forwarding do Effect leftovers, jeho getData není skutečné GPU úložiště. GPU leftovers/slot pressure nejsou zde k dispozici. Ověřené native refcount increments, original observer throw identity, receiver/arguments/returns/then nedotčené, foreign later owner zachovaný, cleanup všech vlastních resources i po chybě.

## Ověření a limity

- Finální source `proof.test.ts` SHA `55a496df3f93e14124f459334c98b1b482c0d51de16b0ec2a2da25003b59e824`, `trace.ts` SHA `b8ec1d9ee56e2f0e5a405d715ebeaa1e9dd0097476821ca14d74c3f996de75d0`.
- `run-05`, `06`, `07`: každý5/5 PASS, exit0, bez skipu, 18.10.2026 07:03:44.633–07:03:58.790UTC. `types-02`:2963/0, exit0,07:03:58.807–07:04:04.300UTC. Exact commands/source/log/report SHA v `final-runs.json`.
- Bounded direct Node/tsx, test concurrency1, test timeout30s, runner timeout60s. Reprodukční příkazy jsou v `report.md`. Žádné pnpm/install/fullsuite/build/GPU/server.
- Časovací okno bylo koordinovaně výhradní; po07:04:04 root dostal potvrzení uvolnění a žádný vlastní proces už neběží. Žádné porty nebyly otevřené. Dokončení metadat pouze lehké čtení/hash/analýza již vzniklých souborů.
- Native WGSL processor a WebGPUEngine.createEffect jsou skutečné. Pipeline/backend draw je NullEngine; main perspektiva, stíny vypnuté, neinstancované boxy bez externích textur. Není to GPU WGSL kompilace, obrazová shoda, produkční frustum/LOD/avatar/shadow matice ani odhad celé hry.
- Předchozí run01/02/03 a types01 zachované jako **chyby fixture**, nikoli runtime RED: adapter cleanup, chybný předpoklad material UBO data, hardcoded návrat alphaCutOff a dva TS problémy. Run04 byl mezikrok PASS. Finální zdroj/refcount/sync intervals jsou ověřeny05–07; staré logy se nepřepisovaly.
- Refaktoring: společné OwnedHooks/Trace, přesné native delegation, jednou vytvořené časovací wrappery, sdílený render interval, zachycení původní hodnoty pro restore a jedno cleanup místo. Žádná druhá shader/Effect cache.

## Podklady, rozhodnutí a předání

Frozen V6 `fc6efd2bcf91bd2b1720b35f090d74656352486ea7f09a2199dc69d14c61d525`, QA manifest `37b2d5e1c31f62d4f4d0cdebaaf3063cd1ad8f3e64156ddf58a2a99563fbb228`, dependency manifest `3e17ecf7339436c13929edb3706955c1f33f1ee13f3401f14d433da273df7970`; jedna fyzická readonly core/loaders identity. Původní V6/raw hitches-v19 a pinované soubory/řádky jsou v `report.md`/`source-evidence.json`.

Největší zde přímo měřený úzký scope je celé toString; pouhý cache lookup je výrazně menší. Rozumné varianty a jejich rizika porovnány: čistý serializer, dřívější existing-cache lookup, sdílená material příprava, stabilní sloty, další prewarm a žádná změna. **Žádná varianta implementace ani nová cache není vybraná.** Případný další samostatný výzkum může porovnat levnější čistou serializaci a omezené memo hotového původního stringu při zachování getter/throw reads, paměti a lifecycle. Root nejprve ověří day13 se současným serializerem, aby neměnil dva faktory najednou.

Rezervace bude uvolněna po odeslání tohoto frozen předání a kontrole ukončených vlastních procesů; potvrzení release je v koordinačním registru/zprávě rootu. Task stav a nezávislé přijetí náleží integrátorovi. Žádný nový BMAD workflow ani Linear zápis od podagenta.
