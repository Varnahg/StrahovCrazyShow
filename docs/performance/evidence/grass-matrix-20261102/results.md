# Inkrementální CPU snapshoty trávy a květin · 2. 11. 2026

Schválený plán implementován přímo v jediném kanonickém checkoutu na `main`, proti baseline `21d24c5f1bb42c571d5c398d5e4a42aa472709b3`. **Výsledky níže jsou CPU měření konkrétní rutiny PhotoGrassBatch na NullEngine, nikoli měření GPU nebo FPS celé hry.** Předchozí stromový kandidát ani hraný Docker8080 se neměnily.

## Mechanismus a volba

Původní `flush` převáděl všechny CPU matice po každé změně počtu/obsahu dávky. Babylon9.30 navíc při matrix rebindu zruší svoji cache a getter všechny aktivní matice sám vytvoří, takže následoval druhý aplikační převod. Doloženo instalovaným `Meshes/thinInstanceMesh.pure.js` a [primární dokumentací thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/), načtenou2.11.2026.

Vybrána deduplikovaná fronta číselných slotů: Uint8 flags + Uint32 queue, tedy5B/kapacitní slot navíc. Oproti Set nepřidává položkové alokace při každé běžné editaci. Oproti inkrementálním bounds, partial uploadům a workeru zachovává přesně původní bounds a GPU cestu. Tyto alternativy by rozšířily lifecycle/synchronizační rizika a nejsou součástí změny.

Append označuje nový slot, swap-remove přepsaný cíl; tail-remove nevyžaduje převod zbývajících matic. Flags žijí do úspěšného flush, takže opakované použití tailu nezdvojí frontu. Vlastní rebound využije nativní matice, stabilní cache převádí jen dirty sloty a nečekaná identita/délka vůči poslední synchronizaci spustí úplný fallback. Reserve-only a dispose zahazují vlastní cache reference. Kapacita roste společně a `allocatedBytes` zahrnuje i nové buffery; samotné sledované instance buffery tedy rostou o6,25%, nejde o úsporu RAM/VRAM.

Přesné matice, fade/slot/count data, bounds, GPU uploady, hustota, geometrie a materiály zůstaly zachované. Stejný modul používá tráva i GroundFlowers, včetně recyklace root objektů. Celý flush stále O(N); pouze synchronizace snapshotů závisí na počtu změněných slotů.

## Výzkum výsledků a cílený refaktoring

První plná série `cpu-ab-01` měla správnou paritu a rychlejší sparse případy, ale podle předem uloženého pravidla neprošla: no-op256 +35,3% a fade-only2048 +40,9%. Tyto odečty s třemi časovači na operaci trvaly typicky0,13–1,30µs. Všechny původní vzorky a neúspěšné přijetí jsou zachované.

Proto vznikla samostatná kontrolní metodika: `--controls-only`, dva vnější časovače kolem65 536 operací,5 bloků/variantu/pár,8 192 rovnocenných warmup operací, střídání variant uvnitř párů i bloků. Nemá odvozený nested-flush údaj a netvrdí pokrytí všech7 scénářů. Kontroluje data před/po warmupu i měření. Není to změna přejímacího limitu ani vyřazování vzorků.

`control-ab-01` potvrdil no-op2048 +12,7% v4/5 párech, přibližně1ns na volání. Root proto oddělil malý veřejný idle guard od `flushPending`, ponechal původní hot-state pole před novým bookkeepingem a omezil úklid fronty na skutečnou synchronizaci. Vliv JIT/rozložení objektu je vysvětlující hypotéza, ne samostatně profilovaná příčina. Výsledkem tohoto společného refaktoringu je finální kandidát, ověřený novými sériemi `cpu-ab-02` a `control-ab-02`.

## Finální CPU porovnání

Intel Core i7-8750H,12 logických procesorů, Node24.22.1, Babylon9.30.0. Baseline i kandidát prošly stejným TypeScript/CJS/VM loaderem a používají stejné skutečné engine moduly. Fixture každé varianty vlastní své mutable rooty a scénu. Geometrie/příprava fixture jsou mimo měření; **primární interval obsahuje mutate+flush včetně dirty-bookkeepingu**, vnořený flush se k němu nesčítá. GPU ani scene.render neběží.

Pět párů pro každou velikost/scénář, střídání A/B a B/A, všechny raw hodnoty zachované. Tabulka je medián pěti poměrů průměrného CPU času kandidát/baseline, přepočtený na změnu času; záporné číslo znamená rychlejší operaci.

| Instance | Výměna1 trsu | Výměna32 trsů | Odebrání tailu | Celá obměna | Rebound |
| ---: | ---: | ---: | ---: | ---: | ---: |
|256|−76,2%|−52,6%|−84,6%|+3,5%|+10,5%|
|2048|−85,7%|−80,7%|−86,2%|+12,7%|+14,0%|
|8192|−89,4%|−86,8%|−88,3%|−0,8%|−6,0%|

Obě sparse operace byly rychlejší v5/5 párech při všech velikostech. Celá obměna a rebound mají smíšené výsledky; **univerzální zrychlení se netvrdí**. Kladné mediány nad10% nezamlčujeme: pro předem definovanou stabilní regresi bylo požadováno současně překročení1,1 v nejméně4/5 párech; uvedené případy ho měly jen ve2–3 párech. Nejistota těchto stresových scénářů zůstává součástí výsledku.

Finální delší kontrolní bloky: no-op čas −32,6/−36,0/−33,0% (vždy5/5 rychlejší); fade-only +3,4/+2,3/+3,3%. Žádná kontrola nesplnila kritérium stabilní regrese nad10%. Jde o tight-loop CPU čas, nikoli cenu izolovaného herního snímku.

Mechanický důkaz je samostatný: u8192 instancí sparse1 převádí2 namísto8192 slotů, sparse32 převádí33 namísto8192, tail0 namísto8191. Samotný append/swap regresní test převádí1 slot. Rebound64→128 má65 namísto130 převodů. Všechny16float hodnot, fade data, sloty/count, enable a bounds jsou přesně shodné; nešlo o zrychlení vynecháním obsahu.

## Ověření a reprodukce

- Cíleně photo-grass/ground-flowers/preparation:49/49 PASS. Finální sada včetně benchmarkových regresí po refaktoringu:58/58 PASS, bez skipů. Nezávislé review původní i finální runtime změny a obou měřicích režimů bez nálezu.
- První tsc našlo chybějící explicitní typy benchmarkových záznamů a testových callbacků/DataArray. Opraveno; následné TypeScript kontroly prošly. Původní log je zachován.
- Přípravný smoke harnessu zachytil záměnu počtu instancí za počet komponent v getFloatData; opraveno a přidána plná kapacitní regrese před měřením. Původní selhání není přepsáno.
- `pnpm build` včetně TypeScriptu a `pnpm test:integration` PASS/exit0; SDK integrace zahrnuje12 skutečných klientů v jednom světě. Dosavadní Vite warnings o velkých chunkech a neúčinných dynamických importech zůstaly.
- **Celá sada není zelená.** První `pnpm test`:2865 případů,2858 PASS /2 FAIL /5 SKIP, exit1. Jeden nezměněný RAG30ms timeout shodil subtest i jeho parent; izolovaný celý soubor pak67/67 PASS. Druhý úplný běh `pnpm exec tsx --test --test-concurrency=6 tests/*.test.ts`:2859 PASS /1 FAIL /5 SKIP, exit1; původní RAG případ v něm prošel.
- Druhé selhání je nezměněný test `blind authority repair resumes after-blind-authority-result...`. Primární log říká `Initial reservation heartbeat failed; worker was not started`; ENOENT při čtení verification výstupu je až následek. Izolovaný přesný případ1/1 PASS. Produkční review už používá Promise.allSettled; hypotéza předčasného fail-fast čtení byla čtecím průzkumem vyvrácena. Příčina heartbeat exit1 zůstává neprokázaná, protože stderr tohoto heartbeat volání není zachováno; nepřidával se spekulativní sleep ani změna řadiče.
- RAG fixture nastavuje skutečný performance.now deadline před synchronní přípravou/hashováním a rejection handler připojuje až po admission. Citlivost na zatížení je pravděpodobné vysvětlení, nikoli změřený profil příčiny. Pro případnou samostatnou testovou opravu byl identifikován společný mock setTimeout a performance.now, bez změny produkčního timeoutu; tento úkol RAG ani jeho test neměnil.
- [Strojový záznam](validation.json) obsahuje oba neúspěšné plné běhy, izolované přezkoušení, source/test manifest, všechny čtyři CPU kampaně a hashe raw logů. Izolovaný PASS nepřejmenovává původní plný běh na PASS. Implementace je zachována jako CPU ověřený celek; celoprojektová přejímka zůstává otevřená.

Reprodukce z kanonického main: `node --import tsx scripts/benchmark-grass-snapshots.ts --baseline 21d24c5f1bb42c571d5c398d5e4a42aa472709b3 --out <nový-absolutní-adresář-pod-.cache/grass-matrix-20261102/>`; pro dlouhé kontroly přidat `--controls-only`. Program nikdy nepřepisuje starší výstup a ověřuje vstupy po doběhnutí. Baseline se čte přes git show bez změny větve nebo kopie projektu. Vytvářejí se pouze kompilované benchmarkové artefakty.

Původní i finální kampaně jsou v `.cache/grass-matrix-20261102/root/{cpu-ab-01,control-ab-01,cpu-ab-02,control-ab-02}/`: metadata source/test/harness/dependency hashů, raw.jsonl, parita a souhrny. Předem uložené pravidlo `admission-policy.json` a oba `admission-*.json` zachovávají rozhodnutí včetně prvního neúspěchu. Limity: NullEngine neměří GPU/upload stall, Node není prohlížeč a nebylo měřeno FPS celé produkční hry. Obecný KEY-5 a obrazová přejímka předchozích stromů zůstávají otevřené.
