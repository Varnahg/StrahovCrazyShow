# B6 extraction: první spustitelný checkpoint

Owner `cad-buildings-01a16b37-b6-extraction`, task `cad-buildings-b6-extraction-20261024`. Před zápisem načteny AGENTS/policy, nový uživatelský scope B1+B6 a task; Git/status/registr ověřeny, claim úspěšný. Worktree `cad-building-models`, větev `codex/b1-playtest-20261024`, základ `6dd89606`. Žádný další BMAD, podagent, stage/commit nebo zápis do B1/helperu.

Předané soubory: `prepare_b06.py`, `test_prepare_b06.py`, `docs/reality-pack/cad-buildings/b06/preparation.md`, tato evidence a vlastní ignorovaná cache. Podrobné zdrojové rozhodnutí je v preparation.md. Originální DXF nebyly kopírovány. **Plný B6 převod, audit JSON, overlay ani model ještě nevznikly.** Root je provede pod svým heavy/GPU oknem po převzetí.

## Přímo spustitelné příkazy

Z kořene stejné worktree, po vlastním převzetí tasku/outputů:

```powershell
uv run --no-project --with ezdxf==1.4.5 --with shapely --with matplotlib python -B -X utf8 scripts/cad-buildings/prepare_b06.py --source "C:/Users/rezac/Downloads/strahov autocad/strahov autocad/strahov blok6"
$env:B06_RECIPE_ACCEPTANCE = '1'
uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b06.py
```

Výchozí recipe/overlay: `.cache/cad-buildings-20261024/b06-preparation/`. Audit: `docs/reality-pack/cad-buildings/b06/preparation-audit.json`. Oba příkazy vyžadují skutečný exit 0; proměnnou pro běžné volitelné lokální testy odebrat/nastavit na 0. Pokud source/dependency změna způsobí chybu, nepřepisovat provenienci staré recipe. Celé generování patří rootovi.

## Builder kontrakt

- `buildingId=b06`, `osmId=53929071`, `cadOrigin=[35,8]`; veškeré XY jsou původní CAD/1000. Nativní builder transformuje jednou.
- Osm floors P01/N01–N07; `floor.elevation` je main. `floor.levelElevations` obsahuje main a tam, kde existuje, mezzanine. N07 má navíc annexRoof, westHeadRoof, eastHeadRoof. `levelCeilings`, `levelRegions`, `rooms` a každý door/window `levelKey` používají stejný resolver. N06 nemá fiktivní mezzanine místnost; N07 je `levelKind=roof` se dvěma zdrojovými heads.
- `interiorStairPlans` má 36 jedinečných fyzických segmentů, každý s přesnými `frontEdgesCad`, `riserPositions`, oběma level keys, `ownerFloor`, `sourceFloor`, source handles a explicitním výškovým odhadem. U přerušené řady může `edgeSourceEntities` obsahovat více handles. `interiorStairObservations` eviduje P01 centre / N06 side projekce, které se znovu nestaví.
- Podesty se opakují v odkazu alternativních bočních tras se stejným ID a shodnými loops/triangles; builder musí deduplikovat podle ID, nikoli postavit druhé těleso. Hlavní `exteriorStairRoutes` obsahuje jediný doložený šikmý vstup s 12 hranami. `exteriorLevelAnchors` je pouze exterior.entry.lower. `terrainCutouts` je odvozený vstupní footprint s dosud neověřeným Z.
- `roofTransitions=[]` je záměrné. Vlastní N07 polyline `1036` je střechou přes main i přední annex ve shodné výšce 18. Dvě skutečné nástavby mají vlastní vršky 21,41 a 20,50; jejich footprint a původ jsou v N07 metadata. N07 stavební extruze je omezena na okolí těchto head rooms, nikoli veškerou slabou kresbu střechy.
- `generatorDependenciesSha256` v recipe i auditu zahrnuje aktuální bajty vlastního generátoru a čteného helperu. Jakákoli změna obou během přípravy ji odmítne. Strict cache acceptance vyžaduje tuto mapu i `heightModel.id=b06-cad2005-half-storey-hypothesis-v1`.

## Skutečné ověření

Čtecí metadata sonda načetla všech osm B6 výkresů, ověřila grafické stupnice 19 999,999553 jednotek/20 m a registraci obou jader N01–N05. Prošlo 392 source room polygonů, 703 dveří (52/125/106/106/106/106/102/0), 36 fyzických vnitřních ramen a 12 předních hran vnějšího vstupu. Každý parametr půdorysu pochází z B6; B2 sloužilo pouze dřívějším typologickým kontextem. Sonda nevolala párování všech stěn ani `prepare()`.

Lehká sada: `Ran 14 tests in 0.114s; OK (skipped=1)`, log `b06-preparation/tests-light.log`. Čtrnáct syntetických metod proběhlo; jedna celá třída se čtyřmi recipe metodami čeká na první fullprep. Pokryty dependency hashe, odmítnutí stale helperu/chybějícího zdroje, částečná křídla, duplicitní leaf, odmítnutí neznámého otvoru, skutečné pořadí nosing hran, chybějící hrana, source break bez zdvojení, unikátní fyzické segmenty a shodné sdílené podesty, chráněný obytný pokoj, IPR střešní interpretace a malý skutečně propojený wall/window/slab pipeline fixture. Neběžela celá sada hry, fullprep, Blender, Rapier ani render.

Čtecí odvozený polygon `.cache/cad-buildings-20261024/b06-preparation/roof-outline-source.json` je k dispozici foto agentovi pro rigid fit; jde o source geometrii bez vytvoření modelu. Koordinátorovy IPR hodnoty jsou zaznamenané jako interpretace, ne CAD svislé kóty. Nižší annex roof 16,5 byl podle nového primárního IPR důkazu odmítnut; současný kód jej neobsahuje.

| Soubor | SHA-256 |
| --- | --- |
| prepare_b06.py | `0343e45fb559f8f99da83c3b5f67885b7274fca8665fbb1e2f22390326a0c548` |
| test_prepare_b06.py | `05d17717d22bff2217e940757283034f69ba64eff521b0d31e6dd57c9141a154` |
| prepare_b01.py, pouze čtený | `942b9463f7f1f894a5fc61ba8b3caa91e3a38a7d061501d40ddbd7196f81588a` |

## Otevřená přejímka

Plný převod musí prověřit úplnost spárovaných fasád/příček a unresolved hran, source věrnost otvorů, nulové průniky konstrukcí do tras, skutečné podesty při rozdílu P01 east proti běžným patrům 0,165 m, nízké části pod suterénním středem a přístup přes skutečné křídlo do všech místností. Jiná vnější P01 otevření a oddělená místnost s201 vyžadují přesné usazení vůči terénu; nebyly jim přidány náhodné nové schody. Finální barvy, fotografické detaily a rigid fit čekají na root/foto přípravu. Žádný dílčí syntetický výsledek se nevydává za nativní nebo hráčské PASS.

Všechny vlastní krátké procesy skončily. Po tomto předání se claim uvolňuje; root smí převzít pouze doložený nový B6 přípravný WIP pomocí vlastního `--adopt-dirty`. Kód se po release nemění do dalšího konkrétního předání.

## Root první nativní přejímka a návrat přípravy

Root `cad-buildings-01a16b37-b6-acceptance` převzal scope. Fullprep s pinovaným ezdxf1.4.5/Shapely2.2.0/matplotlib3.11.2/numpy2.5.4 skončil exit0; receptura5 197 930B, všech8overlay a preparation-audit byly vytvořeny. Strict B06_RECIPE_ACCEPTANCE=1:18/18PASS. Logy fullprep-first.log/tests-strict-first.log ve vlastní b06-preparation cache.

První nativní kandidát vznikl v root-owned b06-build/first/staging/b06-1yamampt, ale předpublikační audit jej odmítl: p01-east-left/right, krok9, headroom0.15m, kolize s p01 stair-landing. Geometrie103částí/58kolizníchčástí prošla ostatní numerické kontroly. Model není publikovaný. Dále je nutné ověřit příčky běžných pokojů (např.14/15,40/41) vůči skutečné CAD kresbě; první overlay ukazuje souvislé šedé room hranice bez zjevné plné tmavé výplně. Původní B1titulek reusable overlay není správný pro B6. Audit uvádí8 unresolved/2conflicts P01,4 unresolved běžnýchpater,6 N07; konkrétní entities vyžadují posouzení.

Root ukončil všechny přípravné procesy a vrací doložené přípravné WIP původnímu agentovi pro tyto konkrétní opravy+regrese. První nepřijaté výstupy/logy se zachovají. Blender, model builder a modelové assety zůstávají vlastnictvím root tasku. Žádný root ani agent proces není převáděn za běhu.

## Opravená podesta, source spoje, IPR bočnice a N05/N06 portály

Původní owner `cad-buildings-01a16b37-b6-extraction` převzal scope vlastním claimem s doloženým `--adopt-dirty`. Před úpravou uchoval první generátor/testy, recipe/audit, osm overlay a všechny tehdejší přípravné logy v `b06-preparation/first-before-landing-fix/` včetně manifestu. Root staging ani nativní soubory se neměnily. Všechny osm overlay byly vizuálně prohlédnuty; konkrétní problematické konstrukce se porovnaly s vlastními zdrojovými B6 entities.

### Provedené opravy

1. **P01 východní mezipodesta:** první deska začínala po celé šířce už na Y 14,499404, ačkoli oba skutečné boční lety končí až na 14,664404. Fyzicky prořízla jejich poslední nášlapy. `mezzanine_landing_shape` nyní ponechává širokou podestu od 14,664404 a přidává ke 14,499404 jen prostřední spojku X 52,085303–55,368803 k příchozímu N01 středu. Obě trasy dále sdílejí jedinou identickou podestu. XY ramen, počty, výšky a sousední podlahy se nemění.
2. **Malé skutečné wall joins:** doplňují se pouze explicitně vybrané B6 rohy, každý omezený dvěma vnějšími a dvěma skutečně měřenými vnitřními silnými hranami. Obě vnější hrany se musí setkat v toleranci 2 mm; doplněk smí mít nejvýše 0,25 m² a nesmí vstupovat do source interiéru. T doplňky vyžadují dvě skutečné příčné branch hrany pokračující do budovy a spojitou vnější fasádu. Žádná broad morphology, rozšíření celé stěny ani plnění libovolných děr. Dveřní/okenní řezy se aplikují až následně.
3. **Jediná nízká opěrná bočnice:** podle nového IPR důkazu je N01 `1072/1073/1066` vyjmutý z plných stěn i z N01 envelope a modelovaný jako vlastní `retaining-wall`, bottom `p01.main=-3`, cap local −1,05. Není přidána visící podlaha. Evidence a interpretace jsou v `sourceStructure` a auditu; jiné venkovní stěny tímto pravidlem nejsou sníženy.
4. **Vnější vstupní výška:** `exterior.entry.lower=-0.60`, dvanáct skutečných hran tedy překonává 2,10 m při stoupání 0,175 m. IPR první nášlap world 0,19–0,345 podporuje zvolených přibližně 0,271278 při root pracovní translaci +0,696278. XY, 12 hran a horní vstup 1,5 zůstávají. Vše je výslovná interpretace, nikoli CAD Z.
5. **Čtyři N05 portály přes N06:** source lower dveře `4D34/4D3E/4D61/4D77`, floor 13,5 / head 15,6, se střetly s N06 source plnou stěnou `970/971` a deskou 14,8–15. Source stěna je v Y −0,085594–0,164403, tedy před původním dveřním prahem Y 0,264402; kapsle do ní zasahovala, i když její střed zůstal v annexu. Nový `upper_annex_portals` zachovává jejich přesné X rozsahy a odstraňuje pouze horní překryv wall/slab do stávajícího head 15,6; prahový maskovaný pás pokračuje jen k hraně již existující core díry Y 0,364404. Boky, střední mezisloupek i vyšší nadpraží zůstávají. Targety ani dveře nejsou posunuty. Floor/audit mají `crossFloorPortals` se source handles a odvozenými loops.
6. **Pravdivý audit a overlay:** `earlyBoundaryCandidates` uchovává původní varování, `unresolvedStrongEdges` a `resolvedByLaterConstruction` již porovnávají finální XY projekci skutečných wall solids. N07 všech šest kandidátů mělo už před touto opravou nulovou chybějící délku; není jim přidána nová geometrie. B6 má vlastní `draw_overlay`, správný titulek/legendu, viditelně ohraničené úzké stěny, sloupy/nízké bočnice a N07 skutečný úplný roof outline. B1 helper nebyl editován.

### Konkrétní source spoje a příčky

Read-only sonda nového helperu proti skutečným zdrojům a prvnímu hotovému wall footprintu přidala P01 **0,612000 m²** v šesti místních dílech a každé N01–N06 **0,350926 m²** ve čtyřech dílech. Přesné per-floor handles/bounds jsou v `source-join-candidates.json`; source room interiéry nebyly zasaženy.

- P01: SW `38F/3EF/390/38E`; NE `57B/66C/57A/608`; dvě pravé niky `6E3/6E0/6E2/6E1` a `705/6E0/706/6E1`; T `66C/795/794`; krátký 40mm frame return `609/60A/66C`, který generic 80mm overlap threshold sám nepároval.
- N01: SW `7E6/963/7E2/7E5`; NE `3F0/29C/10D/29D`; spodní NE návrat `28D/29C/28E/290`; T `29C/203/205`. N02–N06 používají konkrétní odpovídající entities svých souborů, nikoli N01 kopii.
- Dříve podezřelé N01 příčky **nechyběly**: 14/15 mají `620/621`, witness (29,979; 3,374; Z 1,3) uvnitř wall solidu; 40/41 mají `4AC/4AD`, witness (32,427; 13,284; Z 1,3) uvnitř skutečné příčky. U 31a/31c je otvor přesně mezi Y 13,645389–14,445389 (`4629` je jeho kreslená zavřená hranice); nad/pod ním příčka je. Regrese chrání stěny i volný otvor. Žádné pokoje nebyly sloučeny ani přeskládány.
- P01 dvě room conflicts `285/3A8` a `286/3A9` jsou 100mm bočnice vedle podschodové s120. Zachovány; samotný room účetní polygon není důvod vymazat dvojici skutečných silných hran.
- Zbylý P01 kandidát `4A4` obsahuje jinak nepárovaný interval u Y 0,385–1,032. Tato oprava ho bez dalšího důkazu nevyplňuje jako širokou stěnu. Ostatní venkovní weak obrysy mimo panel `1072/1073` nezdědily jeho novou výšku.

### Skutečné regrese a hranice ověření

- Poslední malý běh: **25/25 PASS, bez skip, 0,130 s**, `tests-source-fixes-light.log`; spuštěna pouze `test_prepare_b06.B6SourcePrimitiveTests`, žádná širší sada nebo plný převod.
- `landing-regression.json`: skutečný první last-tread overlap P01 east left **0,2762245 m²**, right **0,2761746 m²**; opravený helper dává **0,0006747 / 0,0006746 m²**. Zbytek je pouze 0,404mm kvantizační lem při 1mm modelové přesnosti, ne původní 165mm překrytí. Nativní clearance se musí znovu spustit.
- `upper-annex-portals-candidate.json`: na každém ze čtyř skutečných prahů původně zasahovaly `n06-wall-15.000-0000` i `n06-slab-14.800-0000`; lokální provedení nových řezů nad těmito skutečnými solids dává nula zbývajících překážek ve zkoumaném výškovém pásu. Nejde o tvrzení, že již proběhl Rapier nové receptury.
- Syntetické testy chrání mezipodestu versus oba poslední nášlapy, prostřední spojku, vyžadování měřených L/T hran, odmítnutí doplňku do místnosti/šachty, jen jednu nízkou bočnici, novou IPR kotvu, zachované N06 nadpraží/boky a nemožnost odstranit jinou vyšší desku. Finální audit nepřekládá XY krytí jako vertikální clearance.
- Devět recipe metod nyní čeká na přepočet s novým SHA. Původní root první strict 18 PASS, native RED, Rapier 72/74 route směrů a 1368/1406 dveřních směrů jsou historické výsledky prvního kandidáta; nejsou to nové výsledky této opravy. Třicet missing-model-floor směrů souvisí s terénem a zůstává rootovi.

| Soubor | SHA-256 |
| --- | --- |
| prepare_b06.py | `0595d078957a7cfae01c8d2063a7f689da6894e979e12c3a4d1452a0aba52cd4` |
| test_prepare_b06.py | `8b1c3afe7bb1c7ca488d3a57ee1b20675b34a672b16e48d489f37ebecf0bc8e7` |
| recipe.json, stále první kandidát | `04ebc8d8563f54d20d9f6d6db925de1a42583b9257d5da43cf77d3dfe71870d8` |
| preparation-audit.json, stále první kandidát | `bd6bc5a0fe372b5083824ef89d493676454c9bf788700e672ab1e0557d9fb4ae` |

Původní recipe/audit zůstaly byteově totožné se zmrazenými kopiemi. Neběžel nový fullprep, overlay, Blender, GPU ani modelová fyzika. Příkaz generování/strict přejímky z předchozí sekce platí; root nyní provede jeden nový úplný běh a skutečnou nativní/Rapier přejímku. Vlastní procesy skončily, nic se nestagovalo/commitovalo. Po tomto předání se scope uvolňuje pro rootův doložený `--adopt-dirty`.

## Root R2 a poslední doložené exteriéry

Root provedl R2 fullprep exit0,34/34strict přípravných testů, Blender native/GLB audit PASS104parts/59collisionparts/195900triangles,372clearance samples bez blokací/chybějící podpory.74/74lokálních schodišťových směrů PASS,1376door směrů PASS,30 dalších je missing-model-floor (15vnějšíchvýplní); žádný invalid-start/blocked. R2 je v b06-build/r2, původníR1staging zůstává. Celkový +všech8floor renderů vytvořen; root již prohlédl overall/P01/N01/N05, zbytek čeká na vlastní vizuální přečtení.

Primární source exteriéry jsou v photogrammetry/b06-source-exteriors (5PNG+views.json). Ukazují kryt hlavního vstupu, zvýšená koncová portika a východní betonový kryt/terasu nad P01; S201 leží pod souvislým trávníkem/svahem, ne jako otevřená jáma. Tyto obrazy nepodporují změnu3m podlažního rastru; dřívější hypotéza3.1m byla zvažována a nepřijata, protože ground versus portiko/kryt nejsou shodné referenční plochy.

Po dalším cíleném source čtení je zbylá P01hrana4A4 doloženou375mmfasádou s malým chybějícím pokračováním u spodního rohu; doporučená přesná maskaX67.439303–67.814304,Y0.384403–1.034403,bezdoorarc. Doplnění vnitřního líce v tomto intervalu je lokální interpretace navazující683/703/70A/6EA, ne zaměření. Root vrací přípravný scope pro tuto opravu a konkrétní externí opory podle následného přímého zadání. R2výstupy nejprve uchovat, novou fullprep zase spustí root. Všechny root přípravné/renderové procesy jsou ukončené, žádný helper se nepředává za běhu.

## Exteriéry připravené pro nový root přepočet

Owner `cad-buildings-01a16b37-b6-extraction` převzal předaný scope a uchoval kompletní R2 recipe/audit/kód/testy/osm overlay/logy v `b06-preparation/r2-before-exteriors/` s manifestem. Upravené jsou pouze vlastní prepare/test, přípravná evidence a cache. Původní R2 recipe a audit nebyly přegenerovány ani přerazítkovány.

Provedeno všech pět konkrétních oprav: source pokračování `4A4` (0,24375 m²); vstupní canopy s dvěma měřenými rámovými pásy; nižší východní betonový kryt/terasa se šesti otevíravými prosklenými křídly; dvě koncová portika s fyzickými plinty; schválený uzavřený s201 pod zachovaným terénem. Přesné source handles a výškové interpretace shrnuje `docs/reality-pack/cad-buildings/b06/preparation.md` a lehký odvozený `exterior-source-candidate.json`. Nebyly přidány další schody, opakované sloupky ani změna podlažního rastru.

Kontrakt: `floor.exteriorFeatures` obsahuje osm prvků včetně jejich `loops`, role, výšek a source provenance. Jejich solids mají stejné údaje v `sourceStructure`. Vstupní kryt, dva rámové pásy i east terrace používají roli `canopy`, ostatní čtyři prvky jsou portikové `slab`/plinty. `terrainPreservationAreas` je na úrovni floor i recipe, přesný CAD XY obrys s201 včetně stěn, `role=buried-chamber`, `floor=p01`, `sourceEntity=A5A`, cover top −2,29627770931185. Export musí tuto masku transformovat jednou a zachovat zem. Šest východních křídel má `openingClassification=openable-glazing`, `fixedGlazing=false`, `leafMaterial=glass`, `outsideSupportId=b06-east-mezz-terrace`, `outsideSupportTop=1.0187223`, `outsideStepEstimate=0.4812777` a `outsideTraversalStatus=requires-native-jump-validation`.

Refaktoring sjednotil exteriérové descriptors/solid serialization a odečet shodných podlahových opor; canopy půdorys nemaže běžnou podlahu ani zem. Source podklad přednostně zachovává CAD: vstupní kryt 21,99919 m² se nerozšířil na bočně odlišnou IPR obálku 26,607 m². Východní terasa má 10,8644965 m² podle CAD, nikoli vyhlazených 19,2 m² skenu. Vybrané výšky, tloušťky a portikové plinty jsou explicitní konstrukční interpretace. S201 není hráčská místnost: kryt world −1,60 zůstává pod nejnižším IPR vzorkem −1,439 a pod DMR povrchem.

Skutečné ověření: **31/31 lehkých syntetických testů PASS, 0,137 s, žádný skip**; log `tests-exteriors-light.log`. Příkaz spuštěný z `scripts/cad-buildings`: `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest test_prepare_b06.B6SourcePrimitiveTests`. Nové regrese chrání source okno/místnost u 4A4, výšku krytu nad vstupem, prostor nad P01 dveřmi pod nižší terasou, neduplikované portikové podlahy a uzavřenou izolovanou s201 bez rozšíření preserve masky do hlavní budovy. Dvanáct skutečných recipe testů čeká na nový root fullprep. Žádný nový fullprep, render, Blender, GPU, modelový probe ani širší sada nebyly spuštěny; R2 historické nativní a hráčské PASS zůstávají jen důkazem R2.

| Soubor | SHA-256 |
| --- | --- |
| prepare_b06.py | `717b389f1b8534034f1ba8aba91f93993f2575f00f5647dd5731cb17a2b2c36c` |
| test_prepare_b06.py | `147b751fa8b12b3cb64beccf4c886ec6934ea8b6f3a9c87bb68e769a6397b5ae` |
| prepare_b01.py, pouze čtený | `942b9463f7f1f894a5fc61ba8b3caa91e3a38a7d061501d40ddbd7196f81588a` |
| recipe.json, stále R2 | `3c31e58f46f37a7fe41b748839d6d85cfa79f7e66a86b55fba375f22b8fbf23c` |
| preparation-audit.json, stále R2 | `91248a5efea4e7a0ab441d1cc0400cd3c3592061db78f062abe943231e9c0210` |

Spustitelný fullprep a `B06_RECIPE_ACCEPTANCE=1` příkaz v úvodu předání se nemění. Root po převzetí provede jeden nový úplný přepočet, strict testy a vlastní native/runtime přejímku; zejména musí skutečně ověřit skok z mezipatra na o 0,481 m nižší east terrace, terénní přístupy portik a zachování s201 trávníku. Není deklarován herní PASS těchto nových cest. Vlastní procesy skončily, nic nebylo staged/commit. Po tomto předání se rezervace uvolňuje pro doložené převzetí rootem.
