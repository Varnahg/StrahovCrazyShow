# KEY-72: průběžné integrační předání

Práce probíhá pouze na main v `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, podle schváleného plánu a SPEC v `_bmad-output/implementation-artifacts/discord-kb-20261103/`. Cizí render WIP se nepřebírá. Původní exporty jsou pouze čtené; neveřejný audit zůstává v `.cache/discord-kb-20261103/`.

## Mechanismus kurace

Explicitní `knowledge-curation` union a aditivní SQL003 zachovávají dokumentovou extrakci, staré identity a cache. Oficiální podpůrná evidence a komunitní zkušenosti jsou samostatné jednotky. Importní preview počítá skutečně chybějící vstupy bez placeného volání. Runtime filtruje datum kontroly i platnost podpory. UI zobrazuje anonymizovaný původ, období, ověření a omezení.

Generování při kuraci používá části `supported` s platnými ID a homogenním druhem podpory. Server doplňuje komunitní označení a období; model nesmí obejít označení prázdným seznamem. `gap` přijímá pouze prázdný obsah a server vytvoří lokalizované odmítnutí. Původní dokumentové odpovědi zachovávají starý kontrakt. Bootstrap přijímá union a stále kontroluje schválený text/profil cache.

Nezávislý review našel a opravil mezery v navázání publikačního potvrzení na skutečný obsah a úplný audit, možnost neoznačeného `gap` textu a bootstrap dispatcher. Následná čtecí kontrola je čistá. Cílený refaktoring sdílí validaci podpory, source varianty a pravidla fresh/current bez druhého úložiště či změny embedding modelu.

## Dosavadní ověření

- Foundation CPU: 83 PASS; skutečná PostgreSQL regrese: 20 PASS.
- Runtime/provider/UI/bootstrap/citační politika: 170 PASS, 1 volitelný source-report SKIP.
- TypeScript a Vite build: PASS, obvyklá varování o velikosti chunků a existujících dynamických importech.
- První plná sada před závěrečnými review opravami: 2923 PASS, 5 SKIP. Není vydávána za finální release test.
- Reálná stage obnovená z read-only exportu produkce: všech 15 přenesených datových tabulek odpovídá; původních 101 cache entries, 45 legacy chunks a 56 document chunks zachováno. Produkce beze změny.

Logy jsou v `.cache/discord-kb-20261103/validation/`. Finální obsah, live evaluace, opakovaný import, neměnný release checkpoint a praktické klientské ověření stále probíhají. Tento průběžný handoff neoznačuje celé zadání za hotové.
