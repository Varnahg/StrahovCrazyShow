# Předání: webgpu-garment-init-helper-20261019

- Vlastník: `webgpu-01a15102-garment-init-helper`; příjemce: koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow`, detached HEAD `289d173f696c28f2e40c94bf8bb14af7cb768bc1` při zadání. Vstupem je explicitní čistý snapshot `.cache/webgpu-shadow-share-native-qa-20261019/clean` (source8fb), nikoli dirty strom.
- Výsledek: izolovaný copied kandidát a přenositelná CPU regrese připravené pro vlastní QA/integraci koordinátora. Není integrováno do main ani přijato jako oprava FPS.
- Změněné soubory: jen prefix `.cache/webgpu-garment-init-helper-20261019/` a tento handoff. Integrátor přebírá pouze `candidate/client/avatar-garments.ts` a `candidate/tests/student-garment-init.test.ts`; přesných 50 podpůrných artefaktů a tři readonly borrowed junctions vypisuje manifest. Ostatní copied source/data jsou byte-exact podklady, nikoli runtime diff.
- Cizí WIP: nic nepřevzato, žádné změny kořenových client/tests/package/lock/patch/node_modules ani hraných snapshotů. Bez stagingu/commitu.

## Výzkum a rozhodnutí

`RESEARCH.md` odděluje skutečnou stack presence od nezměřené CPU share: TextureDirty → setter → garment materialFor → install → createAvatarRig → TransitRenderer.update. Předchozí UVcapture měl nula UV událostí; tento zásah není UV oprava. Primární připnutý Babylon 9.30.0 byl čten přímo z instalovaného material.pure.js (veřejný atomicMaterialsUpdate/blockDirtyMechanism, markDirty a dirty scany), PBR sheen konfigurace a scene.addMaterial. Oficiální odpovídající zdroj: https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Materials/material.pure.ts .

Veřejná atomická aktualizace blokuje pouze dirty mechanismus daného materiálu; finally obnoví flag a zavolá markDirty(false), nikoli AllFlags. Proto se použije jen pro prvotní konfiguraci právě nového PBRMaterial, než jej aplikace vloží do cache a přiřadí prvnímu meshi. V tu chvíli nemá vlastní compiled submesh defines, které by bylo nutné znovu označit AllFlags. SDK přidá materiál do scene.materials už v konstruktoru, ale added observable je deferred; aktuální project observers jen frontují/trackují/capturují. Nejde o obecný kontrakt pro libovolné synchronní cizí observery nebo již sdílené/compiled materiály.

Porovnány a odmítnuty: scene-global block (zasahuje unrelated materiály/reentranci), nová cache/předvýroba palet (už existuje family/part/color cache a libovolné barvy, širší paměť/lifecycle), vendor material-to-mesh index (mnohem širší pass/ownership API), přímé private flagy nebo změny hodnot/shaderů. Veřejná lokální batch je nejmenší zásah do doložené cesty.

## Implementace a identita

Jediná runtime změna je obalení původního doslovného pořadí konfigurace nového materiálu do `material.atomicMaterialsUpdate(() => { ... })` a komentář. Text vnitřních příkazů je zachován s odsazením. Konstruktor, texture map creation/options, barvy, PBR/sheen hodnoty, metadata, geometrie, mesh assignment, cache keys/users a dispose callbacky zůstávají beze změny. Cache hit se nedávkuje ani jinak nemění. Žádný private SDK stav nebo scene-global block v runtime.

- Preimage avatar-garments.ts: `40173ae81387516755d96b8097b0b331dd1e96b5d3cf183a85b8462eed4f8f6d`.
- Finální runtime: `068dc194c63ad686269f80f4b55bb177cb6e16eac67e284a4544cd92b8d604e1`.
- Přenositelný test: `a8817fe6f5cdd9e2cd881670b3cb6bfbbbd2bbad4f12f72dd6b8c0d3e3fa721a`.
- Finální manifest: `d1c36201247f87a008584879bd5785b0e75672ff2004e7a50124bc29014fd63b`.
- Source inverse + ordered inner statement exact roundtrip ověřen `source-inverse.json` a samostatně freeze.mjs proti skutečnému obsahu kandidáta. `runtime.diff` obsahuje pouze tento vlastní delta.

## Praktické ověření

`node .cache/webgpu-garment-init-helper-20261019/run.mjs` konečný přijatý běh 2026-10-19 14:06:43.097–14:06:50.888 UTC, `jobs.json`/`results.json`:

- Stock A očekávaný RED exit1 výhradně na traversal-bound assertion; kandidát P GREEN exit0.
- Šest presetů, vždy 16 cizích skutečných Babylon box meshů, každý se skutečným submesh draw wrapperem: A **352** versus P **32** skutečných foreign SubMesh.getMaterial návštěv při install. Dva nové garment materiály/preset: 11 versus 1 průchod na materiál. Cache hit návštěvy **0** v obou.
- Finální A/P reporty mají přesnou shodu materiálových/texturových hodnot, metadata, mesh flags/bounds, indexů a hashů všech vertex dat. Ověřeny near/medium a opakované rigy sdílející materiály/geometrii, zachování po prvním release, právě jeden dispose každého materiálu po posledním release, zachování family map a jejich opětovné použití novým materiálem. App materiály jsou instanceof stejná fyzická PBRMaterial třída jako fixture.
- Dvě nezměněné existující student-garments.test.ts fixture zvolené přes `opt-in clothing|production creates`: A **2/2 PASS**, P **2/2 PASS**, exit0. Zahrnují šest presetů, hlavu/skeleton/oči, LOD, badge a animaci. Žádná změna těchto převzatých testů.

Následně běžný přenositelný `candidate/tests/student-garment-init.test.ts`, bez absolutních cest, env či QAloaderu v testu: `node .../run-portable.mjs` spouští borrowed standardní tsx --test v owncandidate. Finální běh 14:10:21.248–14:10:23.654 UTC, **2/2 PASS**, exit0 (`portable.log`, `portable-result.json`). Používá actual copied candidate a readonly připnuté závislosti. Regrese vyžaduje nejvýše 32 foreign visits, přesné finální hodnoty všech šesti presetů a shared/last-release lifecycle. Nevyžaduje zbytečné návštěvy, pokud se později odstraní i finální scan. První portable verze s exact32 také prošla a je zachována v portable-initial-exact32 logu; runtime nebyl měněn.

## Zachované neúspěchy a omezení

První vlastní assembler chybně zacházel s LF jako CRLF a vytvořil prázdný config block (early edc09e hash). Actual CPU test to zachytil před předáním/build/GPU; failed payload zachován a koordinátor byl ihned varován. Oprava zachovává newline a ověřuje skutečný ordered inner body i inverzi. Dále jsou zachované failed-import logy (Windows --import potřebuje file URL) a failed-identity/fixture logy (pnpm symlink a fyzická core URL původně vytvořily dvě SDK identity; opraveno canonical realpath a ověřeno instanceof). Tyto pokusy nejsou přijatý RED ani performance evidence. `assembly-incident.md` rozlišuje původní raw logy od ručně sepsaného záznamu prvního selhání.

Portable setup nemohl vytvořit file symlinks bez Windows admin privilege; místo toho převzal byte-exact potřebné runtime zdroje a použil readonly directory junctions pro deps/shared/data. Žádná elevace, instalace ani zápis do borrowed cílů. Manifest má samostatné source witnesses a junction targets.

Counterproof dokládá menší počet konkrétních CPU traversals, nikoli CPU čas/share, odstranění všech hitchů nebo FPS přínos. NullEngine neověřuje GPU shaders, skutečné načtení PNG, texturový vzhled ani pipeline readiness. Zůstávají konstruktorové a ostatní avatar factory náklady. Child nespouštěl fullsuite, TS fullcheck, build, integration, install, renderer ani GPU; tyto gaty a produkční měření patří koordinátorovi.

## Procesy a převzetí

Všechny lehké subprocessy skončily, žádný server/port nebyl spuštěn. Parent dostal CPU done signál s časem 14:10:23.654 UTC a finálními hashi; další testy se nespustí. Při předání žádný živý vlastní proces ani převáděný resource nezůstává.

- Rezervace: handoff dokončen pod vlastní rezervací; po jeho zápisu následuje release a výsledek je předán koordinátorovi v závěrečné zprávě. Release neznamená přijetí integrace.
- Integrátor: `/root` přebírá pouze runtime068 + portable testa881, provede vlastní izolovaný QA checkpoint/acceptance. Task status, Linear, commit/main a případnou produkční přejímku mění až on.
