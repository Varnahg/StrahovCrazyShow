# Předání: gameplay-benchmark-export-20261103

Vlastník `smoothness-export-20261103-author`, příjemce `/root`. Canonical checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, main, výchozí `cdb3b8f774688e2fad3d75487de29a7b767379c8`. Cizí WIP nepřevzatý; scope pouze shared/local-benchmark.ts, tests/local-benchmarks.test.ts a vlastní evidence.

**Aktuální stav: hotové k integraci.** Pole intervalů i explicitní GPU scope přežijí oba projektory a skutečné HTTP uložení. Jde o opravu důkazů, nikoli prokázané zrychlení hry. Autor nic nestagoval ani necommitoval.

## Rozhodnutí před implementací

- Problém: klient už vytváří úplné frameIntervalsMs a main-pass GPU pole, ale společná projekce je zahazuje před HTTP i před diskem.
- Mechanismus: Game → UI saveLocalBenchmark → projectLocalBenchmark → local HTTP handler → stejná projekce. Příčinou ztráty jsou chybějící povolená pole, nikoli prokázaná nedostupnost GPU timestampu.
- Změna: bounded detached numerické pole s přesnou délkou; scoped main-pass čas zůstane oddělen od původního gpuMs. Legacy payloady bez nových polí se nemění.
- Metrika: byte/value zachování validních intervalů a scope přes oba projektory a skutečné HTTP uložení; ne FPS.
- Správnost: explicitní whitelist, konečné nezáporné hodnoty, cap8192, shoda sframes, odmítnutí sparse/malformed/oversized dat, stávající256KiB/origin/source/health ochrany. Nula GPU se normalizuje na null stejně jako čtečka vclient/gpu-diagnostics.ts.
- Přijetí: cílené regresní testy, HTTP cap/roundtrip, idempotence a scoped TypeScript; žádný nový profiler, build ani GPU měření.

Varianty: prosté přidání array bez limitu by odstranilo ochranu velikosti; truncation by porušilo úplnost; nový endpoint/kompresní formát není nutný. Cap8192 pokrývá HUD10s při vysoké obnovovací frekvenci a ponechá prostor v256KiB pro existující metadata. HTTP limit stále nezávisle platí pro celý dokument. Přesný adversarial fixture byte count bude zaznamenán v ověření.

RED: tři nové regrese reprodukovaly ztracené intervaly/GPU scope a chybějící odmítání malformed vstupů; `.cache/gameplay-benchmark-export-20261103/red.log`, exit1, před produkční změnou.

## Výsledek a ověření

- Změněné soubory: `shared/local-benchmark.ts`, `tests/local-benchmarks.test.ts`, toto předání. Přidané dva malé projektory sjednocují validaci a kopírování; žádná cache, timer, nový proces ani profiler. Nové array se vytváří pouze při projekci uživatelského benchmarku, ne v herním per-frame kódu.
- Optional `frameIntervalsMs` zachová každý prvek beze změny, délka přesně odpovídá `frames`, cap8192, rozsah0–1200000ms; žádné sparse/nenumerické/nonfinite/negative/oversized pole. Staré payloady bez pole zůstávají validní. Interval0 zůstává původní číselný údaj, nikoli tvrzení o plynulosti.
- `frameWork` zachová původní cpuMs/gpuMs a přidá pouze webgpuMainPassMs a pevný scope `main-render-pass-only`. Čas bez scope či chybný scope se odmítá;0 a null znamenají unknown/null. Samotný scope bez času zůstává bez času, nevzniká0. Výsledek je async dostupný vzorek hlavního průchodu; tento patch GPU timestampy nezapíná ani z nich nedělá celokaretní čas.
- Přesný payload na capu s dlouhými desetinnými čísly a třemi maximálními Unicode GPU texty: **210552B z262144B**, skutečný HTTP POST201 a přesné persisted values. Stávající oddělený limit256KiB dále odmítá příliš velké declared/chunked body; cap není výjimka z něj.
- `node --import tsx --test tests/local-benchmarks.test.ts`: **21/21 PASS**, exit0, finální log `.cache/gameplay-benchmark-export-20261103/verification.log`. Pokryta dvojí projekce, detached arrays, nulové/nenumerické časy, chybějící/smyšlený scope, legacy key order/error order, HTTP persistence, odmítnutí malformed záznamu a původní privacy/identity/origin/rate/size/health ochrany.
- Scoped TypeScript: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --allowImportingTsExtensions --resolveJsonModule --esModuleInterop --types node tests/local-benchmarks.test.ts` **PASS**, exit0, `types-final.log`. První průchod v`types.log` odhalil pouze úzkou literal-array inferenci nového testu; explicitní `number[]` ji opravilo. Původní selhání zachované.
- `git diff --check` nad oběma soubory PASS. SHA256 shared/local-benchmark.ts `5aa65bd531dadf9faaf60aa3a52a9666a908e42e6e000aa84443f3c30218f271`; tests/local-benchmarks.test.ts `53759af2fef374cc58a9529134122fe539c878ef1ea5dc23a903889ff19f03ca`.
- Unit HTTP fixtures byly na vlastních náhodných loopback portech, uzavřené vtest cleanupu, dočasné adresáře odstraněné. Žádný trvalý API/preview/sampler/3D proces nespouštěn, žádný proces nezůstává. Heavy-validation aniGPU se nepoužily.
- Root převezme scope podle tohoto předání, provede společné integrační ověření a nastaví stav tasku. Autor po předání uvolní rezervaci; release není výkonová přejímka.
