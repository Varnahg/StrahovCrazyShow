# Předání: cad-buildings-world-paths-20261024

Root14:45UTC: B1 novýcurrenttrace/exteriorconfig aactualreplay574/574PASS. B6runtimeR4 actualActor74stairs a1406door směryPASS;7up směry (6declaredterrace doors +P01externaldoor2552) potřebují skutečný jump držený8frames, ostatních1399 směrůwalkPASS. Nebyla změněna výškaautostep aniportály. Nativeisolatedwalker neumískákat, protojehoR4doorreport má6blockedupterrace/2missingfloor proP01, sourcewalkingtrace budepravdivěpartial/failreturn. Rootvracíscopeautorovi proúzký actualActor jump při taktoidentifikovaném návratu/výstupu, soddělenoutraversalproveniencí a sourcePassed nezměněným. RootreplayprocesySTOP, bodyconfigmodel/trace se nepřepisuje ani sourcefail nepřeznačuje. Po předáníopětrootfullreplay nafinálníchphotoassets.

- Vlastník: `cad-buildings-01a16b37-paths`; příjemce: root koordinátor.
- Cwd: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`; větev `codex/b1-playtest-20261024`, baseline `6dd89606b137ccf4ea156a4978b649a87c818b1e`.
- Výsledek: CLI pro souvislé world přehrání je implementované a ověřené malými fixtures. Celý B1/B6 replay nebyl spuštěn a zůstává úkolem koordinátora po finální modelové/foto identitě a fresh current trace.
- Vlastní změny: `scripts/cad-buildings/verify_world_paths.ts`, `tests/cad-world-paths.test.ts`, `docs/reality-pack/cad-buildings/world-paths.md`, tento handoff a ignorovaná `.cache/cad-buildings-20261024/world-paths/`.
- Cizí WIP: žádný převzatý; shared simulation/registry, původní world testy i accessibility validator byly pouze čtené. Nic nestagováno ani necommitováno.

## Mechanismus a volba

Pouhá kontrola výsledků lokálních dveří/schodů nedokládá souvislé spojení od vstupu. Kopie controlleru by neodhalila rozdíl Actoru, world umístění a okolních kolizí. Proto CLI vytváří skutečnou `Simulation` a používá pouze `Actor.step`; nová postava smí vzniknout jen na začátku deklarované exteriérové session. Teleport/recovery metody jsou během cesty blokované. Při jednoznačném nativním venkovním endpointu se chybějící vstupní schodišťový prefix skutečně přehraje. Nejednoznačnost u šachet je omezení reportu, nikoli nová nativní anotace.

Před replay se ověří identity modelu/GLB/actor source/helperů, current profil, úplnost všech door-side IDs, context kontinuita a vazba výsledku na konkrétní navštívený bod. Vlastní world ray a capsule sweep znovu změří podporu; source support nesmí určovat cílovou výšku. Podpora se kontroluje i na vstupu, takže podvržený seed support nezíská pokrytí.

Podle následného výslovného pokynu koordinátora přibyly omezené world-door-extension důkazy: jen při již dosažené source straně a jen pro protější stranu vyřazenou kvůli chybějící podpoře. Actor na ni přejde a fyzicky se vrátí; každý krok má nový world důkaz. Žádné modelové flagy ani nové seedy se nedoplňují. Zablokovaný návrat ukončí session bez recovery. Denominator zůstává počet obou stran všech otevřených native door IDs; malý počet úspěšných sessions nebo 561 source návštěv nemůže vydat allPASS pro 574 bodů.

Refaktoring: společná validace bodů/identity, sdílená kontrola source/world podpory, jedna query kapsle pro celý replay, samostatná příprava native entry plánu, oddělená čistá validace trace od skutečného přehrání. Cleanup pokrývá výjimky a chyby. Malé testy injektují pouze jednoduchou geometrii worldu; pohyb stále vykonává produkční Actor, nikoli nový controller. Metadata fixture a full-game jsou zřetelně odlišená.

## Ověření a snapshot

- `pnpm exec tsx --test tests/cad-world-paths.test.ts`: **14/14 PASS**, exit 0, 2,206 s. Log `.cache/cad-buildings-20261024/world-paths/fixture-tests-final.log`.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node --esModuleInterop --resolveJsonModule scripts/cad-buildings/verify_world_paths.ts tests/cad-world-paths.test.ts`: exit 0. Log `typecheck-final.log` ve stejné cache.
- Helper SHA-256: `4d5d6ac79f1d40495ce2b2348d3b45f0819e4859efe0e0d5b091b7ab7cf1dd39`.
- Test SHA-256: `4aa70a78d1732c9d2a5b000eea66ba0f490a1266a19682cf58ab48acf74d39c7`.
- `source-manifest.json` v vlastní cache obsahuje oba soubory i přesné read-only závislosti v okamžiku přejímky. Žádné původní CAD dokumenty nebo jejich kopie se nevkládají do Gitu.

Fixtures dokládají current/hash mismatch, změnu XY/patra, zkrácení trace, vymyšlený setup-only visit, zakázaný vnitřní seed, správný exteriérový prefix, skutečného Actora, částečné 2/4 pokrytí, reálnou překážku, support override v cíli i setupu, recovery zákaz a cleanup. World extension má variantu průchodu a návratu, překážky před průchodem a nově zavřené překážky bránící návratu; poslední varianta zůstává partial i po dosažení obou bodů.

## Integrace a omezení

Příkaz a kontrakt jsou v `docs/reality-pack/cad-buildings/world-paths.md`. CLI přijímá `--building`, `--trace`, `--output`; ostatní argumenty odmítá. Budova musí být aktuálně v `CAD_BUILDINGS`. B6 tak nedostane předčasný výsledek z testu B1. Historický `accessibility-r10-entries.json` s profilem cad-compact byl jen čtecí zdroj struktury; plná aktuální identita se nesmí obejít přejmenováním profilu.

Root dodá nový current trace po foto/model změnách a provede celé přehrání pod vlastní heavy rezervací. Script kontroluje hash manifestu sdílených world zdrojů/dat před/po a také aktuální GLB. Venkovní cesta před anotovaným endpointem, dynamicky proměnlivá doprava, server a GPU zůstávají mimo tento důkaz; `tick` používá deterministický čas 0. Nedoložené vnější seedy přístavby 28D2/28EB se automaticky nepřidávají.

Root14:05UTC skutečný current B1 trace a celý world replay provedl:570/574 bodů,4nevyřešené jsou přesně obě strany28D2/28EB. Konfigurace se nepřeznačovala; nové model/GLB/actor/helper hashe jsou ověřené. Výstup world-paths/b01-world-first.json. Root zvlášť spočítal native site:28D2 side0 a28EB side1 jsou mimo skutečný terrainCutouts polygon i bez native podpory do0.65m; protější body jsou uvnitř se skutečnou podlahou. Zdrojové stěny160A/1698 vR10 dokládají připojenou místnost přístupnou právě zvenčí. Aktuální všech574door směry v celéSimulation jižPASS s fotogrammetrickougrade.

Root ukončil replay a vrací scope původnímu autorovi pro úzký explicitní exterior-door-seed config s kontrolou modelové identity, source handles, skutečného native exterior/interior rozlišení a novou souvislou Actor session od země přes práh a zpět. Nejde o změnu source trace nebo doplnění ručního vnitřního seedu. Bez takové konfigurace zůstane dosavadní570/574pravdivé partial. Doklady tohoto převodu jsou v této sekci; všechny root procesy tohoto tasku skončily.

Procesy: pouze ukončené malé test/typecheck příkazy. Žádný celý Simulation replay, server, Blender, GPU nebo fullsuite nebyl spuštěn. Po tomto GREEN předání vlastník uvolňuje rezervaci a výslovně předává vlastní untracked WIP root koordinátorovi k `--adopt-dirty`. Stav tasku a přijetí celého výsledku patří integrátorovi.

## Vrácený scope: explicitní exteriérové vstupy

Vlastník `cad-buildings-01a16b37-paths` převzal rootem výslovně vrácený WIP s `--adopt-dirty`; výše uvedená root sekce a důkazy 570/574 zůstaly zachovány. Implementován volitelný `--exterior-doors` a čistý `validateExteriorDoorConfig`.

Schema 1 přijímá pouze buildingId/modelCollisionSha256 a entries `{id,outsideSide,sourceEntities,provenance:string}`. Prázdná provenance, libovolné XY/Z, cizí či duplicitní handles, fixed glass a neodpovídající native footprint/podpora jsou odmítnuté. Vnější bod musí být výslovně source-excluded pro chybějící podporu, mimo skutečný native terrainCutouts polygon a bez native podlahy ±0,65 m; vnitřní bod musí mít opačné doložené vlastnosti. Bod vždy pochází ze stejného doorApproachGeometry. Modelové flagy ani source trace se neupravují.

Po source sessions následuje samostatný Actor na skutečné world podpoře vně. Oba body se přičtou pouze po úspěšném průchodu dovnitř a zpět. Návrat bez recovery je povinný; blokace nechá výsledek partial. Společný `walkActorLeg` nyní obsluhuje původní trace i explicitní sessions a sdílený `forbidRecovery` zachovává zákaz teleportů. Aktuální source manifest/GLB kontroly zůstaly a přibylo before/after ověření trace a volitelného configu.

Ověření: **17/17 malých testů PASS**, 2,910 s, exit 0; `.cache/cad-buildings-20261024/world-paths/exterior-config-tests.log`. Cílený tsc stejným příkazem jako výše PASS, exit 0; `exterior-config-typecheck.log`. Nové negativní fixtures zahrnují uzavřenou místnost, nesprávné native patro, hash/handles/provenance/XY mismatch, blokovaný práh a zablokovaný návrat. Report i source trace zůstávají při fixture ověřeně oddělené; cleanup odstraní oba vytvořené Actory. Manifest aktuálního kódu a testů: `exterior-config-manifest.json`.

Žádný plný nový replay zde neběžel. Root napíše konkrétní source-backed konfiguraci pro 28D2/28EB a spustí celý world. Předávám executable a vlastní WIP zpět, po GREEN uvolňuji claim; všechny vlastní procesy jsou ukončené.

## Vrácený scope: skutečný skok přes doložené dveřní prahy

Převzal jsem zpět čtyři vlastní/rootem doplněné WIP soubory s `--adopt-dirty`; root sekce 14:45 UTC zůstává zachovaná. Primární mechanismus je v produkčním `Actor.step`: jump získá počáteční rychlost 6 m/s pouze při grounded, takže jednosnímkový impuls při tlačení na hranu není spolehlivý. Root doložil sedm skutečných B6 skoků s držením osm snímků. Izolovaný source walker tento vstup nemá a jeho neúspěšné návraty se nepřeznačují.

Porovnané varianty: ponechat pravdivý partial by nedoložilo dostupný herní pohyb; všeobecné skákání v routing mřížce by rozšířilo význam důkazu; změna autostep/geometrie nebo reset Actora by změnila ověřovanou hru. Zvolena úzká větev společného `walkActorLeg`, použitá source legs, missing-support extensions i explicitními exterior sessions. Nejprve celý dosavadní walking budget. Teprve po selhání musí existovat nativní dveřní target a buď přesný `outsideTraversalStatus:requires-native-jump-validation`, nebo missing-support protějšek. Aktuální foot → změřená cílová capsule podpora musí mít převýšení >0,22 m a <1 m. Následuje osm držených jump snímků a nejvýše 180 release snímků ze skutečné pozice, bez resetu/recovery. Prefix/grid/route body nezískávají jump povolení. Controller, timestep a fyzika jsou beze změny.

Refaktoring sjednocuje steering a kontrolu cíle v jednom helperu; jednorázová malá mapa native door evidence se sestaví před sessions. Report přidává traversal/heldFrames/walkFrames/jumpFrames a důvod v jumpEvidence včetně fromFoot/targetFloor/rise. Skutečná podpora je zapsaná i u explicitních exterior legs. Původní sourcePassed zůstává na kroku a nyní výslovně i na každém přehrávaném source legu. Cleanup se nemění. Žádné nové geometrie, druhé controllery ani cache světů nevznikají.

Ověření: **22/22 malých fixtures PASS**, exit 0, 2,310 s; `jump-fixture-tests.log` ve vlastní cache. Přímé produkční Actor fixtures dokazují 0,481m deklarovaný návrat a 0,333m missing-support návrat. Zdrojový failed návrat i původní trace zůstanou identické. Bez metadata, pro grid target, při převýšení 1,05 m a při skutečně zablokovaném návratu zůstává partial; 3m zeď neprojde ani po skutečném jump pokusu. Předchozích 17 regresí včetně identity, teleport zákazu, konfigurace, cleanup a denominatoru zůstává GREEN. Cílený TypeScript check stejným příkazem jako výše PASS (`jump-typecheck.log`). Aktuální kód/test/read-only závislosti zaznamenává `jump-manifest.json`.

Vlastní upravené soubory jsou stále pouze verify_world_paths.ts, cad-world-paths.test.ts, world-paths.md, tento handoff a vlastní cache. Žádný plný model/world replay, server, Blender, GPU, build nebo celá suite v tomto podúkolu neběžely. Root provede souvislý B6 replay s finálními photo assety a čerstvým source reportem; fixture PASS nenahrazuje tento důkaz. Všechny vlastní procesy končí před release. Předávám celý tento WIP root koordinátorovi k `--adopt-dirty`, bez stagingu nebo commitu.
