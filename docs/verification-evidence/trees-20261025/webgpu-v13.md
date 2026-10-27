# Katalog110 · candidate-v13 · průběžné ověření

27. 10. 2026. Snapshot `d381c244f9e667ebfe85c420133effbca0fa0c4b9326d27f8593cd148a13a9f7` obsahuje 9 444 hashovaných vstupů včetně zdrojů, modelů a testů. Před/po kopírování i zmrazené soubory jsou shodné. Výběr katalogových výstupů určuje accepted release SHA `791523688bb546022a87c40bb28a5d8b4e60525369a9c6ec2b0d6fb93fe940a4`; odmítnuté pokusy zůstávají mimo snapshot. Produkční build včetně TypeScriptu PASS. Celá sada a izolovaná integrace navazují.

## Doložené před GPU

- Produkční dekodéry všech110 modelů PASS; native reopen a podpěry doložené ve [výrobním předání](../../agents/handoffs/trees-20261026-catalog-export.md).
- Tři skutečné Game startup regrese PASS. Jeden release test proudově ověřil všech588 souborů, 110 unikátních native modelů, soulad s native katalogem a relativní knihovny: PASS,16,03s.
- Výchozí Game používá úplný katalog; platná výslovná QA dvojice zůstává oddělená. V13 první URL je `http://127.0.0.1:4182/?terrainReview=b5-tree-hero`, bez pilotního parametru.

## První pokus v Edge

Klient `sha256-65449663f93c68c6fc2787d0643b5a198d1923e42cb42284910d8a87942284b7`, diagnostická relace `7d9f6f4e-810f-4493-91ff-31d3b7b8e553`. Skutečný backend WebGPU, vendor NVIDIA/Pascal; současná telemetrie GTX1060, driver582.28. Druhá herní scéna ani Blender neběžely.

Start skončil po30,04s přípravy světel na timeoutu. Vehicle0:15ticků/15,01s; vehicle1:10ticků/11,18s; current-off:3ticky/3,40s. CPU součty těchto renderů jsou1,407/1,352/0,850s. Dokument hlásil `visibilityState=visible`, ale callbacky přesto přicházely přibližně1Hz. To je důvod zopakovat stejný neměnný build s potvrzeným oknem v popředí; není doložená chyba shaderového kódu ani platné měření FPS. Přípravný timeout a health kontroly se nemění.

Původní session log i snímek chyby jsou zachované v lokální cache. Renderer se po chybě správně zrušil. Tento pokus není přijetí vizuální kvality všech110 stromů, LOD/mipů, sezón ani výkonu.

## Kapacita a přenositelnost

Druhý start přes přímé ovládání browserové karty měl před render loopem spolehlivých59,9Hz/83vzorků, ale v přípravě znovu přibližně1Hz: vehicle0 17ticků/16,31s, vehicle1 11ticků/12,19s, current-off 1tick/1,95s. Timeout30,93s, stejná relace, záznam seq257. Samotná aktivace karty tedy trvalé podmínky měření nezajistila. Oba běhy zůstávají neúspěšné a vyžadují opakování s lidsky potvrzeným viditelným oknem. Samplery obou pokusů jsou ukončené.

## Závěrečná CPU sada a oprava testovací fixture

Celá sada v13: **2 345 testů, 2 337 PASS, 5 FAIL, 3 SKIP**, exit1,1 156,25s. Všech pět selhání pochází z `performance-snapshot.test.ts`: jeho malá filesystem fixture neobsahovala nově povinný release seznam a `.gitattributes`. Produkční freezer správně vyžadoval tyto vstupy. Oprava přidala oba do společného seznamu fixture předpokladů; zachovala kontroly integrity, změny identity, neměnnosti a odmítnutí mutace. Samostatně celý dotčený soubor **5/5 PASS**, exit0,3,27s. Původní neúspěšný běh zůstává zachovaný.

Audit všech9 444 frozen vstupů po opravě našel jedinou změnu: tento test, SHA `7d317af5c4708a66cb366e245ffc482e5771e071d4f4cbe5001666eefcfa46ce`. Runtime, modely i buildové vstupy jsou byteově stejné. Samostatný snapshot opravené fixture a manifest je v `.cache/trees-validation-20261025/v13-fixture-correction/`.

Izolovaný `pnpm test:integration` nad v13 **PASS**, exit0. Logy a identita: `.cache/trees-validation-20261025/{full-pipeline-v13.json,integration-result-v13.json}`. GPU přijetí, závěrečné review, commity a main integrace zůstávají otevřené.

## Uchování modelů

Shodné public soubory immutable snapshotu a jeho dist používají po ověření obou SHA read-only hardlinky. Kompilovaný kód zůstal beze změny; žádný odkaz nevede do proměnlivého pracovního stromu. Tím se uvolnilo5 010 212 532B duplicit. První pokus narazil na read-only atribut kopie zVite, před náhradou jednotlivého souboru se nyní řízeně obnoví oprávnění zápisu a po ní read-only; oba logy zůstaly zachované.

Modely mají přenosné native knihovny. Úplná regenerace z čistého klonu zatím nebyla ověřena: autorovací pipeline používá připnuté cache plány a receipts. To se nesmí zaměnit za ověřené otevření dodaných `.blend` souborů.
