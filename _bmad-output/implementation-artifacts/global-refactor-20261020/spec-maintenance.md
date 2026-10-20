---
title: 'KEY-48: sdílená logika, odpovědnosti a aktuální dokumentace'
type: 'refactor'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: '1701bd07ad330df038d9b2b30489ab3560be1090'
review_loop_iteration: 0
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Uživatel výslovně požaduje celkový behaviorální refaktoring a sjednocení dokumentace. Doložené další celky jsou přesná quaternion matematika, barycentrický průchod avatara a paleta aut, source/scope odpovědnost autodev, zanoření Actor.step a benchmark projekce, opakované testové fixture a skrytý Python výstup. Živé návody musí odpovídat současné hře, historické důkazy zůstanou datované.

## Boundaries & Constraints

Zachovat veřejná API, pořadí výpočtů/validací a chybové zprávy, výstupy, provenienci, kolize, vzhled, ovládání a lifecycle. Žádné nové produktové funkce, závislosti, cache, plošné formátování, asset download nebo Blender. Každý celek má vlastní task/claim, testy, handoff a oddělený commit. Cizí WIP zůstává chráněný. Game/UI, native grass a snapshot lze měnit pouze v přidělených scopes po doloženém předání a vlastní rezervaci; uživatel20.10 výslovně autorizoval domluvu předání pro původní celkový refaktoring. Workerexperiment a primaryGame/UIWIP se nepřebírají.

## I/O & Edge-Case Matrix

| Oblast | Vstupy a očekávání | Zachované hrany |
| --- | --- | --- |
| Quaternion | Vec3/quaternion; stejné rotate/multiply výsledky a veřejné obálky | nulové/ne-normalizované/nekonečné hodnoty; bez změny výrazů |
| Avatar | body a trojúhelníky; stejná hloubka povrchu | tolerance -1e-6 vs 0, fallback .082/.14, scale .195 vs 1 |
| Autodev | strom, scope a snapshoty; stejné exporty, digest a chyby | absence vs null, symlinky, ignorované soubory, traversal, stage omezení |
| Fyzika | pěší/vozidlo; stejné Rapier pořadí | auto větev return, jump/gravity/floor/recovery |
| Benchmark | příchozí diagnostika; stejný veřejný whitelist | nullable, truthiness, chyby i pořadí validace/klíčů |
| Fixture/Python | skutečný zdroj, env override, výstupní adresář | AST pořadí, nezměněné VM/orákulum, dynamický původní DOCS default |
| Dokumentace | současné zdroje a historické důkazy | protokol11, WebGL2 default, explicitní QA WebGPU, žádné neověřené live/FPS tvrzení |

</frozen-after-approval>

## Code Map a rozhodnutí

Primární průzkum a porovnání rozumných variant v docs/refactoring/20261020/README.md a inventory.json. Přímé volání/importy, zdrojové hash seznamy i relevantní testy byly dohledány před implementací. Čistý quaternion modul brání zatažení Rapieru či terrain grid do nesouvisejícího modulu. Privátní kernel avatara odstraňuje opakovaný algoritmus se zachováním specifických obálek. Source modul autodev má jasnou odpovědnost a orientovaný graf source→github→store bez cyklu. Lokální benchmark pomocníky nemá důvod vyvádět do nového souboru. Historii nepřepisovat podle stáří.

## Tasks & Acceptance

Každý následující task má přesné writePaths, acceptance, verification a handoff v docs/agents/tasks/; tyto definice určují skutečný rozsah.

- [x] global-refactor-quaternion-20261020: čistá společná matematika, obě původní obálky, konzistentní generátor/hash test, navigační payload mimo sourceHashes shodný.
- [x] global-refactor-avatar-20261020: jeden lokální barycentrický kernel a paleta, stejné numerické výsledky a loading/disposal.
- [x] global-refactor-autodev-source-20261020: úzký přesun do source.mjs a zachování přesné původní export surface adapters; žádné recovery změny.
- [x] global-refactor-documentation-20261020: aktuální EN/CZ návody, index, architecture a současný přehled verification; zachované historické kotvy/evidence.
- [x] global-refactor-simulation-benchmark-20261020: early return pěší větve, soudržné privátní benchmark projekce ve stejném souboru.
- [x] global-refactor-fixtures-python-20261020: úzký testový helper a explicitní Python výstup bez změny dat/downloadu.

- [x] global-refactor-bindings-runtime-20261020 a bindings-tests: odstranit doložené nepoužité bindingy; zachovat konstrukční sideeffecty a aritu veřejných/mock parametrů. Čtyři hashované authoringkosmetiky záměrně ponechat bez GLBpipeline.
- [x] global-refactor-grass-resources-20261020: tři identické disposal smyčky sjednotit lokálně se stejným pořadím a chybami, bez workeraktivace.
- [x] global-refactor-snapshot-20261020: doplnit doložené chybějící patch/test prerequisites do budoucích immutable snapshotů; staré kopie se nemění.

- [x] global-refactor-entrypoints-20261020:2stejnécar pose bloky a5stejnýchdiagnostic reset trojic ve stávajících místech bez změny alokací/pořadí/reflookup/lifecycle.

Přijetí: všechny veřejné kontrakty a deklarované hrany zachovány, relevantní testy PASS; per-cell review a samostatné ověřené commity. Plná sada/build/izolovaná integrace nad stabilním checkpointem, produkční praktická přejímka se skutečnou identitou klienta. CPU důkaz se nevydává za GPU/performance výsledek.

## Implementation Notes

Výchozí plná sada1671 PASS,0 FAIL,1 platformní skip; build/integrace PASS. Renderer světa má samostatnou specifikaci a neměnné baseline/candidate kopie, takže souběžné disjunktní zápisy nemění hranou verzi. První výchozí produkční načtení mělo přípravný timeout; jeho příčina a opakování se evidují před přijetím vizuálního celku.

## Spec Change Log

20.10.2026 lidské upřesnění: uživatel na otázku o bezpečném předání pro refaktoring odpověděl „Ano, domluv předání (doporučeno)“. Původní celkový codebase scope pokračuje po doloženém release diary0a598a6a a grass manifest330b0732. Podmínka původně chráněných cest v Boundaries výslovně zpřesněna podle tohoto vstupu; žádné oprávnění k cizímuWIP nebo workerfeature nevzniká. Následný úplný Game/UI/session audit doložil pouze2carpose a5diagnosticreset duplicity; podobné kvantily/phase/engine/transport větve zůstávají kvůli odlišným kontraktům.

20.10.2026: po explicitním povolení uživatele oběma vlastníkům domluveno bezpečné předání Game/UI/sessiondiagnostics/snapshot a nativegrass cest; cizí primary WIP ani workerexperiment se nepřebírají. Úplný audit53diagnostik dává7jižvyřešených,31minimálních nehashovaných a11Game/UI cleanup položek;4kosmetiky v authoringhashes se ponechají. Přečten celý native grass řetězec: sjednocují se jen shodné disposal smyčky, odlišné selection/cold/FAR/wind/cache lifecycle zůstávají. Pět konkrétních snapshotprerequisites bylo reprodukovaně potřeba již při baseline buildu a jsou doložené sidecary. Frozen intent se nemění.

## Review Triage Log

20. 10. 2026: všechny tři nezávislé vrstvy dokončily celý diff o70souborech/5545řádcích, SHA-25677f5db1bf42cde382e631aa67b98ac7f6f44f13b02b168a7b356e4039e5b8a80. Blind hunter: []; edge-case hunter: []; verification-gap: No verification gaps found. Žádné nálezy k opravě, odmítnutí či odložení. Čistý výsledek není nahrazením následující plné validace.

## Verification

Přesné cílené příkazy jsou v task JSON. Plná sada serializovaně kvůli doložené lokální contention; build a test:integration pod heavy-validation/workspace-build/port2568. Žádné testové limity se kvůli refaktoringu nezvětšují. Doklad skutečných výsledků, hashů a procesního cleanupu v handoffech a docs/verification.md; celek nebude Done podle dílčího testu.

## Audit před společným review

Všech11implementačních scopes předalo implementaci/refaktoring/cílenétesty i přesnéhashové handoffy a uvolnilo claims/procesy. Starší per-cell manifesty jsou historické předávací checkpointy; pozdější výslovně předaný bindingcleanup je navazuje, aktuální celek váže maintenance-review-01-input.json. Matice: přesnáquaternion aavatar numerika, Actortrace a benchmarkvalidation/JSONorder, source/scope/export/digest, fixtureenvvarianty/PythonI/O, resourceexception/disposal a2+5entrypointcallorder/currentref byly doložené. SnapshotCLI má REDna původním programu a6PASS po doplnění staticprerequisites. Fullfinálnítypy/sada/build/integrace a praktická přejímka nového celkového checkpointu ještě následují; prvníworldIAB/CI se nevydává za přijetí dalšího runtime.

## Dokončené lokální přijetí · 20. 10. 2026

Kódový checkpoint7712edb5, frozen-b66d1cf97…: celá sada1708testů/1707PASS/0FAIL/1platformnískip, TypeScript/build a všechny4SDK scénáře PASS. Ve viditelném IAB prošly avatary/editor, host i multiplayer, fyzické auto, terén/B6/schody/lobby/kamera, leave/rejoin a izolace souběžného hosta. Oba klienty ready,0renderovýchchyb, konzolewarn/error prázdné. Po ukončení obou vlastních karet a ověřenéhoPID47628 jsou porty2568/4290 volné;8528frozenvstupů a9patchedinstalledsouborů zůstalo shodných. Přesné rawlogy/hash/omezení v final-validation.json. Stav done znamená dokončenou implementaci a lokální přejímku specifikace; celkový uživatelský cíl a Linear se uzavřou až po skutečné PR/main CI a integraci.

Závěrečné nezávislé dokumentační review doložilo dvě opravené položky: chybějící explicitní cwd snapshotu a předčasné přítomné tvrzení o finální CI. Doplněny přesné přechody build/server/preview/network/report a procesní formulace o KEY-48. Runtime ani testy se neměnily; cílené potvrzení reviewerů následuje před publikací.

Všechny tři závěrečné dokumentační vrstvy potvrdily opravy bez zbývajících nálezů. Cílené doc SHA/link/history kontroly PASS; zdrojové vstupy/runtime se po úplné pipeline nezměnily.
