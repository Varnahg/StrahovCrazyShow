# Předání: webgpu-validation-overlap-20261016

- Vlastník: `webgpu-mig-01a14497-validation-overlap` (`render_diagnosis`); příjemce: root.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; výchozí čistý commit `7fcadeb`.
- Výsledek: typed primitive implementován a cíleně ověřen. Níže uvedené rozhodnutí bylo zapsané před runtime implementací. Game wiring a strict readiness vlastní root.
- Scope: `client/render-health.ts`, `client/webgpu-compilation-profile.ts`, `tests/render-health.test.ts`, `tests/webgpu-compilation-profile.test.ts`, `tests/render-startup.test.ts`, toto předání a `.cache/webgpu-migration-checks/validation-overlap/`.
- Žádný cizí WIP nebyl převzat. Primary checkout, hrané frozen snapshoty a dependencies-v5 jsou read-only.

## Důkazy a varianty před implementací (16. 10. 2026)

Aktivní V11 A/B/A relace `b50a667a-c13c-41fd-a70e-d814d4f6265a`, `a6340587-bc3f-42a5-880e-50433a5a24c6`, `4a12fea3-2d1f-47fc-97f7-f6d28e0b2a8b` skončily na 30s limitu při `night-2-on`. Celoživotní profiler při konci uvádí 580/578/576 shader module diagnostics, z toho 76/82/78 stále pending; nejdelší již dokončená latency 5570,6/5329,8/5318,1 ms. Nejde o CPU dobu kompilátoru a překrývající se async součty nelze sčítat jako dobu spuštění. `createRenderPipeline` měl 358 volání a jen 11,2/11,5/10,6 ms celkového synchronního času, max 0,2 ms. Tyto důkazy neprokazují příčinu každého dlouhého `scene.render` ani zrychlení navržené změny.

Primární podklady:

- Pinned dependencies-v5 Babylon 9.30: `webgpuEngine.pure.js:132` vrací z `areAllEffectsReady()` pouze true; `:1634` vytváří shader stages, zatímco skutečná draw pipeline jde přes `webgpuCacheRenderPipeline.js:142,964`.
- `standardMaterial.pure.js:1290` a `pbrBaseMaterial.pure.js:919` mohou při hot swapping použít předchozí ready effect. `effect.pure.js:215` čeká na `extraInitializationsAsync` před profiler hookem `_preparePipelineContextAsync`.
- [WebGPU specifikace, shader compilation information a promise ordering](https://raw.githubusercontent.com/gpuweb/gpuweb/main/spec/index.bs): `getCompilationInfo` se dokončí po vytvoření modulu, může úspěšně vrátit `messages.type === "error"`; pořadí vůči queue completion není obecně zaručené. Device loss zůstává samostatný health kanál.
- [Chromium getCompilationInfo](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/webgpu/gpu_shader_module.cc) předává completion callback a zajistí flush; samotná délka Promise není synchronní práce JavaScriptu.

Porovnané varianty:

1. Odstranit všechny per-stage pending bariéry: odmítnuto. Zachová finální chyby, ale dovolí překročit etapu před skutečným použitím nové varianty.
2. Explicitně rozdělit preparation a shader-validation: zvoleno pro tento úkol. Výchozí druh zůstává preparation; pouze konkrétní profiler phase `shaderValidation` dostane diagnostický druh. Celkový pending a konečná ready acceptance se nemění.
3. Odvozovat druh z labelu nebo obecného shader channel: odmítnuto. Stejný kanál obsahuje skutečnou přípravu i diagnostiku, text labelu není smlouva.
4. Dedup etap/cache nebo async pipeline prewarm: odloženo. Vyžaduje skutečné varianty/descriptory/cache keys a samostatný profil. Pinned public prewarm není automatický async režim rendereru a jeho convenience defaults nepokrývají všechny instance/pass varianty.
5. Prodloužit timeout nebo vypnout finální diagnostiku: odmítnuto, měnilo by akceptaci místo řešení řetězce.

Rozhodnutí: export `RenderOperationKind = "preparation" | "shader-validation"`; `track` přijme čtvrtý argument s default preparation. Snapshot přidá oba dílčí počty, původní celkový pending nadále zahrnuje vše. Pouze `inspectShader`/phase `shaderValidation` předá shader-validation. Chyby, rejection identity, generační reset, device loss a disposal zachovají původní chování. Konečný `waitForRenderStartup` se nemění a musí čekat na všechny druhy.

**Hranice záruky:** typed split sám není výkonová oprava ani důkaz prewarm coverage. I preparation counter může být nula během čekání na import před hookem. Root musí před per-stage wiring přidat strict kontrolu nové varianty (např. řízené vypnutí hot swapping s přesným obnovením), zachovat dvě ready draw a závěrečný submitted-frame gate. CPU/NullEngine test není GPU důkaz.

## Implementace, refaktoring a ověření

- `RenderHealth` drží pouze dva dílčí čítače v `pendingByKind`; total je jejich odvozený součet, nikoli třetí synchronizovaný stav. Jeden reset helper používá restore, device loss a disposal. Late settlements ponechávají původní výsledky/rejection identity a nemění čítače neplatné generace.
- Profiler předává čtvrtý argument `kind` pouze podle přesné phase. Type-only import nepřidává runtime závislost. Starý tříargumentový callback zůstává kompatibilní; dokud Game argument nepředá dál, výchozí preparation konzervativně zachová původní bariéru.
- `client/render-startup.ts` se vůbec nemění. Nová integrující regrese používá skutečné moduly profiler + RenderHealth + startup gate a fake GPU API na NullEngine: diagnostika vzniklá až ve finálním renderu blokuje ready, warning neinvaliduje renderer, pozdní fulfilled error invaliduje a samotné diagnostiky neprodlužují deadline.
- Testy dále pokrývají více současných diagnostik, smíšené druhy, default shader work s matoucím labelem, nezávislé čítače při rejection, snapshot isolation, dispose/loss/restore a late settlements. Existující regrese receiver/Promise identity, synchronních chyb a observer cleanup jsou součástí stejného běhu.

Vlastní izolovaný staging `.cache/webgpu-migration-checks/validation-overlap/` obsahuje kopie osmi zdrojů/testů, config a readonly `node_modules` junction do `dependencies-v5`. Žádná instalace ani změna dependencies/frozen hry. Všechny kontrolní procesy doběhly.

Příkazy spuštěné přímo Node v tomto stagingu, `TSX_DISABLE_CACHE=1` pro testy:

- RED před implementací: `node --import tsx --test tests/render-health.test.ts tests/webgpu-compilation-profile.test.ts tests/render-startup.test.ts` → exit 1, **41/50 PASS, 9 FAIL**, `targeted-red.log`. Fail jsou chybějící typed argument/počítadla. Tento první RED zachovává i následný unhandled AbortError z teardownu testu, který selhal před await finálního gate; není vydáván za další produkční bug.
- První GREEN stejného příkazu → exit 0, **50/50 PASS**, `targeted-green-v1.log`.
- Po cíleném refaktoringu a posílení více-pending/final-draw regrese → exit 0, **50/50 PASS**, `targeted-final.log`; žádná asynchronous-activity/unhandled warning.
- `node typecheck.mjs` nad pěti vlastními kořeny a skutečnými transitive dependencies → exit 0, **2960 souborů, 0 diagnostics**, `scoped-types-final.log` (první scoped běh byl také čistý).
- `git diff --check` → exit 0.
- Nezávislý read-only peer review `simulation_network`: bez konkrétního blockeru; ověřen derived total, guarded decrement/reset, sticky faults, type-only import a konzervativní kompatibilita starého callbacku. Reviewer nespouštěl další testy/GPU.

Manifest přesných konečných staging inputs včetně testů a SHA-256 logů: `.cache/webgpu-migration-checks/validation-overlap/manifest.json`, SHA-256 `c1a751dbb4c5c4f2225cc7d6c49bf2469ccd42be4dee99a074ef31347bee873b`. Všech osm kopií při kontrole odpovídalo pracovnímu stromu. Runtime source hashes: health `38fd546c1febd3a3f94b9a6c7c9cf66e76cb4afe3df8514b101a8bc49cdee9e0`, profiler `09520802ff1ddea488577e575cdaee4959259a64b6e252db250537d430ab58e5`.

Žádný build, full suite, instalace, server ani GPU nebyly spuštěné. Výsledky dokazují CPU kontrakt, ne rychlost spuštění ani first-F výkon.

## Předání a rezervace

- KEY-31 průběžně aktualizován po rozhodnutí a implementaci/ověření; celek zůstává otevřený pro Game integration a skutečnou přejímku.
- Commit obsahující toto předání zahrnuje pouze pět vlastních zdrojů/testů a toto předání. Root dostane přesný commit SHA zprávou; žádný primary WIP není přibalen.
- Vlastní procesy skončily, žádné porty ani GPU nebyly použité. Rezervace bude po commitu uvolněna; skutečné potvrzení release dostane root spolu s SHA.
- Další krok rootu: předat `kind` v Game callbacku, samostatně prokázat strict readiness skutečných Effectů (včetně pre-hook imports), teprve potom překrýt diagnostiky mezi etapami. Finální submitted-frame total gate a chyby zůstávají povinné. Stabilní úplný checkpoint/GPU porovnání není předmětem tohoto samostatného commitu.
