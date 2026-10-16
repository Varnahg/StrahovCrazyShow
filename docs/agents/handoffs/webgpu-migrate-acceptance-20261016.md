# Předání implementace: webgpu-migrate-acceptance-20261016

- Vlastník: `webgpu-mig-01a14497-acceptance`; koordinátor: `webgpu-migration-01a14497-root`.
- Worktree: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; výchozí commit `076e124571a32e64d194d979d72baed089826fd1`.
- Vývoj byl na výslovný pokyn uživatele pozastaven pro rychlé spuštění hrané verze. Uživatel následně výslovně obnovil cíl; při obnovení HEAD `2f4170afa3255e3254eb6f1c5c9aeca63e8c3480`, zachované vlastní WIP a aktivní stejná rezervace. Reporter je nyní implementovaný a cíleně ověřený. **KEY-34 jako celek není hotové ani přijaté.**
- Přesný verzovaný rozsah: `scripts/webgpu-migration-report.mjs`, `tests/webgpu-migration-report.test.ts`, `docs/performance/webgpu-acceptance.md`, tento handoff. Cizí změny nebyly přebírány ani editovány.
- Vlastní check staging `.cache/webgpu-migration-checks/acceptance/` obsahuje kopii skriptu/testu/protokolu a read-only `node_modules` junction na starý `.cache/webgpu-comparison/frozen/node_modules`. Jen přímé Node CLI, žádná instalace nebo změna dependencies. Node `24.19.0`, tsx `4.23.15`, TypeScript `5.9.3`. Kořenový nový node_modules nebyl použit.
- Hraný native-v3 na4192/API2587, jeho dependencies a dist, historický4188 i starý34run reporter zůstaly nedotčené. Tento offline nástroj nemění runtime hry ani žádný spuštěný snapshot.
- Všechny krátké vlastní kontroly skončily; build, GPU, fullsuite, server ani dlouhožijící pomocný proces nebyl spuštěn. Žádný proces nezůstává.
- Po samostatném commitu pouze čtyř vyjmenovaných verzovaných souborů se rezervace uvolní; SHA a úspěšný release dostane koordinátor. Přijetí celku a změnu task statusu provádí koordinátor.

## Výsledek a rozhodnutí

Koordinátor schválil manifestv1 pro libovolné runs, explicitní expectedPairs, konzoli a JSONL se session/seq hranicemi. Reporter je samostatný od historického `webgpu-report.mjs`, který zůstal beze změny. Implementace přepočítává raw frame statistiky, drží valid/invalid/unverified a odděluje cíle od relativních tvrzení; požaduje nejméně tři proložené/counterbalanced páry se shodnými checkpointy a podmínkami. Shader/pipeline/health důkazy, thermal/cache metadata, počáteční stav z `benchmark-start` a tolerance kamery jsou součást kontraktu; projectionMatrix se záměrně neporovnává. Známé rozdílné pozorované GPU třídy také blokují srovnání, i kdyby manifest omylem uvedl stejné GPU ID.

Domluvené doplnění: `attachedAfterDeviceCreation:true` samo nezneplatní ověřený FPS interval. Reporter rozlišuje částečné startup phase coverage od wall startup doby z JSONL. `webgpu-work` bez skutečné chyby je diagnostika pomalé práce, nikoli důvod vyřadit pomalý platný běh. Nový `benchmark-start` v koordinátorově Game obsahuje avatars; starší frozen native-v1 bez něj zůstane pouze diagnostický a nesmí se přepisovat.

Odmítnuté varianty: změnit historický report (znehodnocení původní metodiky), přijmout nulové summary counters bez logů (může skrýt compiler rejection), počítat jeden rychlý vzorek či vybrané úspěšné běhy (chybějící opakování/selection bias). Zvoleno oddělené fail-closed hodnocení jednotlivých intervalů a srovnatelnosti celé předem deklarované skupiny. Špatný nebo chybějící důkaz nevymaže diagnostická raw čísla, pokud jsou sama spočitatelná.

Refaktoring: sdílená klasifikace důvodů, samostatná validace health/profilu/logů/podmínek, bounded 32MiB cache zdrojového textu, malé trvalé identity vstupů a kontrola jejich stability na konci analýzy. Opakované run/order lookupy jsou mapy. Žádný polling, stav na pozadí ani změna vstupních logů. Konzolové zprávy se interpretují jako data, nikdy jako instrukce.

Kontroly navíc zachovávají konfliktní error records, rozeznávají JSONL null/chybné obálky, explicitní recording gaps, truncated console a neúplný tail. Start-state musí obsahovat potřebnou kameru/populaci; copied raw artifact pod různými run ID nemůže vytvořit tři opakování. Výstup chrání původní cesty/symlink cíle i hardlinky. Prostorová tolerance je explicitní, yaw respektuje plný obrat, projectionMatrix se neporovnává. V targets i paired stats jsou startup a stalls oddělené od relative FPS/percentilů; celý report ponechává approval jako `not-decided`.

## Skutečné ověření

- Finální `node node_modules/tsx/dist/cli.mjs --test tests/webgpu-migration-report.test.ts`: **19/19 PASS, exit 0**, `targeted-v4.log` ve vlastní check kopii. Fixtures v testu jsou výslovně **syntetické**, nikoli měření hry.
- Scoped strict TS: `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --esModuleInterop --types node tests/webgpu-migration-report.test.ts`: **PASS, exit 0**, `types-v4.log`. To je kontrola TS testu; JavaScript CLI byl odděleně parsován/executován Node testy a `node --check scripts/webgpu-migration-report.mjs` také prošel.
- Zachován původní `targeted-v1.log`: **11/12 PASS**, missing-health případ byl nesprávně označen invalid porovnáním proti neexistujícímu renderer ID. Oprava rozlišuje chybějící důkaz (unverified) od prokázaného jiného rendereru (invalid). První scoped TS prošel. Rozšířený v2 běh pak **18/18 PASS**; v3 **19/19 PASS** navíc odmítá duplikovaný raw artefakt jako nové opakování. Finální v4 rozšiřuje stejnou matici o známý nesoulad pozorovaných GPU tříd.
- Read-only replay skutečných historických `failed-webgpu-smoke.json` + `.jsonl`: výstup `historical-failure-report.json` uchoval **3 raw failure záznamy**, **1 invalid run**, `metrics:null`, **0 comparable groups**, bez jakéhokoli FPS tvrzení. Neznámé podmínky a neúplná console provenance byly označené jako neověřené. `historical-failure-check.json` potvrzuje stejné SHA obou původních vstupů před/po.
- Ověřená kopie: `source-manifest.json`, SHA **`9b442ceaddd1d514cc490cc2f5742213145fcec7e2a53f9696fff7e802313ad0`**, šest vstupů (skript, test, protokol, package/lock/TS config). Hash živého skriptu/testu/protokolu souhlasí s testovanou kopií. **Není to produkční herní snapshot.** Závislosti byly jen čteny ze staré junction; nový lock zde dokládá repo vstup, nikoli novou instalaci.

## Omezení a další krok

Reporter neověřuje skutečný obraz, shader driver, fyziku ani hardware; nedokáže objevit pokusy zamlčené mimo manifest nebo autentizovat ručně podvržené čítače/completeness flags. Třídy valid/invalid/unverified platí pro dostupné intervalové důkazy, nikoli dokončení migrace. U měnících se archivů vyžaduje jejich nejprve zafixovanou kopii. Final acceptance/default, cílové FPS, startup nehorší než WebGL, paměť/teardown a funkční/GPU matice zůstávají koordinátorovi.

Linear KEY-34 průběžně aktualizován při převzetí, pauze, obnovení, implementaci a ověření. Implementační commit a release se doplní do závěrečného předání; issue **neoznačovat Done** jen podle tohoto CPU výsledku.
