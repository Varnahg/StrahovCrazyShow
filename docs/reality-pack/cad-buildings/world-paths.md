# Souvislé cesty CAD budov ve skutečné herní simulaci

`scripts/cad-buildings/verify_world_paths.ts` přehrává identifikované `proofSessions` z `verify_accessibility.mjs` pomocí skutečného `Actor` v celé `Simulation` a aktuálním umístění z `CAD_BUILDINGS`. Nevytváří druhý controller ani další stavební geometrii. Ověření je CPU; neprokazuje obraz, GPU výkon, síťovou hru ani všechny venkovní cesty před vstupem.

## Vstupy a spuštění

Nejprve vytvořte čerstvý lokální accessibility report s profilem **current**, aktuálním modelem a aktuálními zdroji. Historický `cad-compact` report se nepřijímá, ani když má stejné rozměry kapsle. CLI se spouští v kořeni rezervované pracovní kopie; plné přehrání celé Simulation patří pod `heavy-validation` koordinátora.

```powershell
pnpm exec tsx scripts/cad-buildings/verify_world_paths.ts `
  --building b01 `
  --trace .cache/cad-buildings-20261024/b01-accessibility/accessibility-current.json `
  --output .cache/cad-buildings-20261024/world-paths/b01-current.json
```

Budova musí být skutečně registrovaná v aktuálním `CAD_BUILDINGS`. Pro B6 se použije její vlastní registrované ID a vlastní čerstvý report po přijetí modelu; úspěch B1 není důkaz B6.

Před vytvořením světa se ověří collision JSON, nativní GLB, actor source, použitý accessibility validator/helper, profil a všechna nastavení kapsle. Počet výsledků a vyřazených bodů musí přesně pokrýt obě strany všech otevřených nativních dveřních ID; uzavřené fasádní výplně jsou vedené odděleně. Kontrolují se správné souřadnice/výšková oblast dveří, nativní waypointy schodišť, mřížkové souřadnice, návaznost `context.from/to`, počty sessions/legů a odkazy `proof.session/afterStep`. Chybějící body nebo zkrácené důkazy nejsou PASS. Hash manifestu `shared` zdrojů/dat a relevantních skriptů/testů se porovnává před a po přehrání; měnící se vstupy nelze přijmout.

## Skutečný průchod a jeho hranice

Každá session smí vytvořit nového Actora pouze na deklarovaném nativním vstupu. Přímé `setPosition`, `resetOnFoot`, `restore` a přepnutí do vozidla jsou během průchodu zakázány; případný fall recovery vyvolá chybu. Mezi cíli se používá jen `Actor.step` a `Simulation.tick`. Scéna i každý Actor se uklidí včetně chybových větví.

Dveřní vstup vyžaduje `accessConfirmed`. Schodišťový vstup vyžaduje přesnou nativní trasu, source route anotace a označení exteriérové trasy. Když `exterior.*` level key jednoznačně určuje venkovní konec, Actor začne tam a případný chybějící prefix k původnímu seedu skutečně projde před trace. U nejednoznačné šachty zůstává přesný deklarovaný konec a omezení je výslovně zapsané. `terrainValidationPending` samotné nikdy neznamená ověřený terén; report má `terrainApproachVerified:false` pro venkovní cestu před anotovaným vstupem. `entrySupportVerified` a `entryPrefixVerified` popisují pouze skutečně provedené části.

Podpora každého cíle se znovu měří paprskem a sweepem skutečné kapsle ve worldu. Hodnota `support` ze zdrojové trace není override výšky. Nesoulad zdrojové ray/capsule podpory přes 5 mm se hlásí; příchod používá world podporu, grounded stav a limity 10 cm v XZ / 14 cm ve výšce. Setup má vlastní 10cm limit a kontrolu překryvů. Tyto tolerance charakterizují test controlleru, ne přesnost historického zaměření.

U nativního dveřního cíle lze po neúspěšné chůzi ověřit skutečný skok. Vyžaduje přesné modelové `outsideTraversalStatus:requires-native-jump-validation`, nebo protější stranu vyřazenou ve validované source trace kvůli chybějící podpoře. Rozdíl skutečné world capsule podpory cíle a **aktuální** Actor paty po chůzi musí být větší než current autostep (0,22 m) a menší než 1 m. Actor pak pokračuje ze své polohy osm snímků s `jump:true` a nejvýše 180 snímků s `jump:false`. Mřížkové cíle, schodišťové waypointy a nedoložené prahy tuto větev nemají. Physics ani controller se nemění.

Leg report rozlišuje `traversal:walk|jump`, `heldFrames`, `walkFrames`, `jumpFrames` a `jumpEvidence` s nativním cílem, důvodem a skutečným převýšením. Podpora je změřená ve worldu. `sourcePassed` kroku i legu zůstává původní: fyzicky úspěšný skok nepřeznačuje neúspěšnou chůzi izolovaného source testeru. Blokovaná překážka nebo návrat stále znamenají partial, i když byly některé cílové body dříve dosažené.

## Vnější body chybějící v izolovaném modelu

Po skutečném dosažení jedné dveřní strany lze přidat pouze krátký navazující průchod na její protější native stranu, kterou source report výslovně vyřadil jako `missing-model-floor`, `unclassified-missing-support` nebo `external-pending-terrain`. Souřadnice určuje stejný `doorApproachGeometry`; podporu dodá world query. Actor musí fyzicky přejít a vrátit se. Nově dosažený bod má samostatný `proofKind:world-door-extension` s uloženou cestou tam a zpět. Původní trace ani native anotace se nemění. Selže-li návrat, session končí bez teleportu. Běžné nedosažené/blocked body se za chybějící terén automaticky nepovažují a žádný nový seed se nevymýšlí.

## Výsledek a dosavadní ověření

### Explicitně doložené místnosti přístupné pouze zvenčí

Volitelný argument `--exterior-doors config.json` přidává samostatné skutečné Actor sessions až po původní source trace. Koordinátor tento krok přidal po prvním current world replay B1: **570/574**, zbývající čtyři body patřily pouze 28D2/28EB. Native stěny a samostatný geometrický průzkum doložily vnější strany 28D2/0 a 28EB/1. Model a původní trace se nemění.

Konfigurace má přesně pole `schemaVersion:1`, `buildingId`, `modelCollisionSha256` a neprázdné `entries`. Každá položka má pouze `id` (native door ID), `outsideSide` (0 nebo 1), `sourceEntities` (přesně stejné door handles jako native anotace) a neprázdný text `provenance`. Další souřadnice či výšky jsou zakázané. Doklad souvisejících stěn patří do provenance, nikoli mezi sourceEntities dveří.

Validátor vyžaduje, aby vnější bod byl ve source excluded kvůli chybějící podpoře, skutečně ležel mimo native `terrainCutouts` polygon a neměl native podporu do ±0,65 m od úrovně dveří. Protější bod naopak musí být uvnitř a mít odpovídající native podlahu. Fixed glass, cizí hash/handles a libovolný vnitřní seed se odmítnou. Souřadnice vždy určí původní `doorApproachGeometry`.

Actor vznikne na nově změřené world podpoře vně, fyzicky projde prahem a vrátí se. **Oba body se přijmou až po úspěšném kompletním průchodu tam i zpět** jako `proofKind:configured-exterior-door`. Blokovaný práh, návrat nebo recovery znamenají partial. Bez konfigurace zůstává původní pravdivé pokrytí beze změny. Konfigurační hash je součástí reportu a soubor se kontroluje znovu po přehrání spolu s trace, world source manifestem a GLB.

Report uvádí všechny očekávané otevřené door-point IDs, skutečně pokryté body, nevyřešené body, zdrojové výjimky a celé world sessions včetně vložených průchodů. Jmenovatel je nativní model: u původního B1 R10 **574 bodů**, nikoli pouze 563 source cases. Návratový kód 0 znamená úplné deklarované pokrytí a úspěšné sessions, 2 částečný výsledek, 1 neplatný vstup nebo chyba běhu. I PASS zůstává omezen uvedeným rozsahem a neprohlašuje všechny komunikace kampusu za ověřené.

Implementační přejímka 24. 10. 2026 po doplnění explicitní konfigurace: **17/17 malých testů PASS**, včetně skutečného Actora nad jednoduchými collidery, schodišťového prefixu, překážky, odmítnutí recovery, podvržené podpory, neúplné trace, částečného pokrytí, konfigurační identity/native geometrie a venkovních průchodů s úspěšným i zablokovaným návratem. Cílený TypeScript check prošel. Testové reporty mají `runtimeScope:fixture`; teprve CLI používá `runtimeScope:full-game`. Root provedl výše uvedený první B1 replay; novou explicitní konfiguraci a výsledné úplné přehrání B1/B6 provede koordinátor samostatně.

Navazující přejímka held-jump větve: **22/22 malých testů PASS**, cílený TypeScript check PASS. Skutečný Actor vyšel přes 0,481m doložený práh i přes 0,333m návrat z chybějícího source terénu; negativní případy ověřují metadata, grid target, převýšení alespoň 1 m, vyšší stěnu a neprůchozí návrat. Koordinátor mezitím doložil úplné B1 pokrytí 574/574 a samostatných 1406 B6 dveřních směrů (1399 chůze, 7 skok) plus 74 schodišťových směrů. Tyto samostatné průchody nenahrazují čerstvý souvislý B6 replay, který po tomto předání provede koordinátor nad finální identitou.


## Finální source/Actor checkpoint

Po poslední terrain korekci byly oba route/door/accessibility reporty znovu vytvořeny s current profile a skutečným actor source hashem. b01-final-world.json:PASS574/574; b06-final-world.json:PASS1406/1406. Původní isolated-source failures zůstávají evidované; full-world podporu a bounded jump dokládá vlastní Actor pohyb. B6 spacing0,60 zachycuje0,935485m source chodbu bez zásahu do geometrie. [Celá herní přejímka](b01/runtime.md).
