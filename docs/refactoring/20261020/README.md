# Refaktoring KEY-48: průzkum a rozhodnutí

Výchozí přijatý zdroj: db23fff93ad1a696f5089ae7f95051a75d317f3c, vlastní metadata b3ad9b134688f45b4e0f97d9e0db84b3ac2716c4. Průzkum z 20. 10. 2026. Stav provedení určují task JSON a předání; tento dokument eviduje důvody změn, nikoli druhý registr vlastníků.

## Rozsah a metoda

Inventář [inventory.json](inventory.json) pokrývá 548 vlastních TS/TSX/MJS/Python/CSS souborů: klient 133, skripty 135, server 8, shared 46, testový kód 226. U každého je zachycen SHA-256. AST průchod hledal importy, deklarace, délky a shodná těla funkcí; kandidáti byli následně prověřeni přes skutečné volající, testy, lifecycle a generované vstupy. To není tvrzení o řádkové ruční přejímce každého modelovacího skriptu nebo každého prvku geometrie. Katalogový průchod všech 55 Pythonů navíc prověřil jejich importy, transformační funkce a I/O/Blender volání; relevantní hranice byly dočteny v konkrétním kódu.

Vendored BMAD, původní assety, textury, naměřená data a historické snapshoty nejsou vlastní kód určený k přepisování. Starý datum není důvod smazat provenienci. Nepoužívaný veřejný export také není automaticky mrtvý kód: zachovávají se referenční photogrammetry moduly, loadEnvironment, regresní InputQueue i kompatibilní názvy.

Po instalaci přes frozen lockfile se přísnější noUnused diagnostika zúžila ze 64 na 53 položek; první výsledek navíc obsahoval chybějící závislosti nového prostředí. [Přesný novější výpis](unused-diagnostics.json) je diagnostika, nikoli změna compilerOptions nebo seznam automatických smazání. Nepoužívaná lokální hodnota může mít nutný konstrukční vedlejší efekt.

## Doložené celky a porovnané varianty

### Světový renderer

V client/world-renderer.ts jsou nevolané privátní kořeny building, b6 a stadium a jejich privátní podpůrný řetězec (491 řádků). Současný buildWorld používá aktuální kanonické továrny. Ponechání zachovává zbytečný druhý návrh světa; přesun do nového souboru ho pouze přemístí; opětovné zapojení by měnilo hru. Volba je odstranit pouze nevolaný řetězec, mrtvé barvy a následně nepoužívané importy.

FacadeEdges duplikuje architectureEdges. Nový geometrický modul by rozšířil scope a autorovací hashe; prostý alias by navíc přidal veřejné tx/tz. Volba je delegace do již používané architecture-reality s explicitní projekcí původních šesti polí. Zachovat a/b identity, pořadí, orientaci, hranici 0.08 a klasifikaci 0.88. Projekce přidává malé alokace kompatibilnímu exportu, který aktuální hra nevolá; netvrdí se zrychlení. BuildWorld, veřejné typy i modely zůstanou stejné. World-renderer není hashovaným vstupem export-building-assets; architecture-reality se v tomto celku nemění.

### Sdílená fyzika a data

Rotate/multiply v terrain-entities a vehicle mají shodné operace. Import z vehicle by zavlekl Rapier do dat; opačný import by zavlekl terénní grid do vozidlové matematiky. Náhrada externí matematickou knihovnou otevírá numerickou shodu. Nejmenší odpovědnost má čistý shared/quaternion.ts se zachovanými výrazy a obálkami starých typů/exportů. Žádná normalizace, cache ani mutace. Přidat nový vstup do obou přesných seznamů transit navigation a regenerovat pouze po rezervaci generátoru i dat; všechny části výstupu mimo sourceHashes musí zůstat shodné. GLB/Blender se nepřegenerují.

Actor.step po větvi vozidla vždy vrací. Zbytečné else a opakované kontroly !this.vehicle lze odstranit pouze v pěší větvi, se stejným pořadím Rapier volání, gravitace, vstupu a podpory podlahy. Je to samostatný integrační celek.

ProjectLocalBenchmark má 278řádkovou projekci se soudržnými GPU, sceneView a renderCost bloky. Soukromé pomocníky ve stejném souboru lze oddělit bez nového API. Pořadí validace, chybové texty, truthiness, nullable pole, whitelist a pořadí klíčů jsou součástí zachovávaného výstupu. HTTP handlery s odlišným origin/preflight kontraktem se mechanicky nesjednocují.

Lazy cache Intl formatteru v events by ušetřila konstrukce, ale přidala stav a změnila lifecycle bez měření potřebnosti. Do behaviorálního refaktoringu se nepřidává jen podle domnělého výkonu.

### Avatar a auta

FaceSurfaceZ a shirtSurfaceZ sdílejí barycentrický průchod, ale mají různé tolerance, souřadnice, fallback a měřítko. Vhodný je malý neveřejný kernel se zachovanými obálkami. Sloučení bez těchto parametrů by změnilo vzhled; cache a prostorové indexy bez profilu nepřidávat. Dvě stejné šestibarevné palety aut lze sloučit do místní konstanty; odlišné loading/disposal cesty se neslučují.

### Skripty a testy

Autodev má soudržnou kontrolu zdrojového stromu a rozsahu, zatím ve velkém adapters.mjs. Prověřuje se úzký přesun do source.mjs při zachování dosavadních exportů, kanonizace a digestu. Kompletní rozdělení recovery state machine by bylo významně rizikovější. AssertStageScope opakuje stejný inScope/error; lze spojit změnu hodnoty i existence klíče, ale absence a explicitní null musí zůstat rozdílné.

Čtyři Game fixture sady opakují AST načtení třídy a výběr členů. Úzký helper má zachovat každý environment override, pořadí produkčních deklarací a lokální VM/orákulum. UI efekt v game-render-engine je odlišný a do helperu nepatří.

Reportéry používají různé definice kvantilů a přesných frekvenčních tabulek; podobný text není shodná metodika. Stejně tak různé GLB readery a atomické zápisy mají odlišné kontrakty. Tyto části se nesjednocují bez konkrétního důkazu.

## Dokumentace

Doložené rozpory: kořenové README označují D2/protokol 9/preview 4179 za současnost, ale netcode má protokol 11; acceptance označuje P5 za aktuální; výkonový index uvádí protokol 2. Oprava má zkrátit živé návody, sjednotit ověřitelné kontrakty a vést k existujícím důkazům. Historické výsledky zůstanou jasně datované v původní evidenci. Port není aktuální uživatelská testovací verze bez skutečné URL/identity. Architektonická mapa má být aktuální kódová mapa, current-work zůstává označeným bootstrap inventářem.

## Ověření a hranice

Závislosti odpovídají pnpm-lock.yaml, 12 původních LFS objektů je vybaleno a preflight prošel bez změny assetů. Běží celá nezměněná sada se sériovým souběhem kvůli již doložené lokální contention procesních fixtures; žádný test ani limit nebyl změněn. Výsledky teprve budou doplněny. Build, izolovaná integrace a skutečný produkční scénář následují nad stabilními checkpointy.

Pět cizích rezervací nad pozastaveným WIP je stále obsazených. Game/UI/session-diagnostics a tráva se do získání doloženého předání neupravují. Žádný výsledek CPU/NullEngine ani odstranění zdrojových řádků není GPU/FPS důkaz.


### Doplnění Pythonu a hranice autodev

Fetch-streets.ortho má jediného volajícího, který přepisuje module.DOCS; explicitní volitelný výstupní adresář může odstranit tuto skrytou vazbu při zachování výchozího chování. Create-north-court-style ihned přepisuje sourceSportTag na multi; přímá inicializace odstraní mezikrok se stejnými JSON bajty. Obě změny vyžadují vlastní úzký task, bez stažení či regenerace podkladů.

Přesun autodev/source musí zahrnout soukromé slash/overlap/git/nul/samePath, které používá i zbytek adapters. Normal a hashFile zůstanou soukromé; původních osm veřejných exportů se zachová přes adapters. Graf source→github→store a source→store nemá zpětný import do adapters. Přínosem je odpovědnost, nikoli automaticky méně závislostí.
