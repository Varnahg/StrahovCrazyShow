# Předání: b6-photo-interiors-20261024

- Vlastník `b6-photo-01a16b37-interiors`; příjemce root koordinátor.
- Cwd `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline `ed52896aa83e4f18cffb162a9b12b100712d341c`.
- Vlastní soubory: nový `scripts/cad-buildings/b6_furnishings.py`, `test_b6_furnishings.py`, `docs/reality-pack/cad-buildings/b06/photo-interiors.md`, tento handoff a `.cache/b6-photo-interiors-20261024/`. Žádný zápis do builderu, původní přípravy, shared runtime, nativního assetu ani cizí cache.
- Výsledek: čisté API pro plánování a emitování B6 nábytku/sanity přes skutečnou Geometry; **17 testů PASS**. Staticky zařízeno všech **228 potvrzených bedrooms +12 bathrooms +24 WC**, 0 skips/omissions. Všech 264 room audits obsahuje souvislý kandidátní walkPath a jasně oddělené neověřené sprchové vnitřky.

## Primární podklady a spolupráce

Všech šest user PNG bylo vizuálně prohlédnuto z rootem poskytnutých nezměněných references; raw přílohy se necommitují. Photo SHA/provenience a odhadované rozměry jsou v photo-interiors.md. Cad_b1_geometry_research potvrdil použití 228 pokojových polygonů a předal `.cache/b6-photo-shell-20261024/source-contract.json` s usage/sourceBasis i skutečnými 2-ZARIZENI symboly. Konkrétní N01 jiné počty byly zachovány. Cad_runtime_research potvrdil všech 11 material keys uvedených v dokumentaci; root zapojí oba helpery.

Varianty, rozhodnutí a technické limity jsou v photo-interiors.md. Nejpodstatnější: nevybavovat všech392 room polygonů jako bedrooms, nevymýšlet hygienické pozice podle jediné fotografie, neodvozovat postele z širšího koncového window bbox. Půdorysy jsou celé uvnitř skutečných concave polygons/holes. Dveřní approach r=0,27 +2cm rezerva se nezužuje; střední fyzická mezera mezi dvojicí .75m postelí je0.699–0.701m.

Jedinou source kolizi prvního N06/544b shower symbolu s rohovým sloupkem geometrický agent výslovně potvrdil: source9FA/7BB/7BC. Vanička/bočnice jsou oříznuty podle room polygonu, zdrojový center/bbox zůstává, audit uvádí interpretaci. Nevytváří se širší místnost ani laxní tolerance. Všech291 skutečných sanitárních symbolů se zachovalo (72toilets,12service-sinks,116basins,36showers,55urinals).

## API / integrační krok

Import `add_b06_furnishings` a zavolat pouze pro b06 před `geometry.groups`→objects. Vrácený audit uložit společně s nativním modelem/auditem. `plan_b06_furnishings(recipe,walk_paths=False)` je levný čistý placement průzkum; výchozí `True` doplní room cesty. Root musí předem mít usage/sanitaryFixtures v každém příslušném floor.rooms a aktualizované fixed-paired-door-leaf anotace. Cizí metadata ani vstupní recepturu helper nemění.

Role jsou explicitní `interior-furniture/...` / `interior-sanitary/...`; group klíč přesně `(floor,role,material,collision)`. Žádný objekt na šroub. Curved basin/toilet/urinal shell není jednobarevný box; profil je uzavřený, se skutečnou dutinou a kladným orientovaným objemem. Jemné látky, nohy, baterie a zrcadla nekolidují. Místnosti s jiným užitím se reportují v unfurnishedUsageCounts (95other,33corridor).

Rootem vyžádaný `audit.rooms[].walkPath` má CAD XY, referenční height, start sourceDoorId, průběžné body a návrat do stejného startu. Statická clearance nevytváří druhý controller. `walkPathStatus` je vždy candidate-only, `requiresActualController` true; support se musí ve světě změřit znovu. `walkPathUnresolved` je na potvrzených264rooms prázdné. **36 shower tray centers je pouze walkExtraTargets**: původní CAD T-partitions mají0.50m hrdla, statický .54m průměr tam není prokázaně průchozí. Neprohlašovat přístup před sprchu za PASS uvnitř. Root tuto stavební návaznost vlastní a může skutečně změřit.

## Ověření, snapshot a uvolnění

- `uv run --no-project --offline python -B -m unittest discover -s scripts/cad-buildings -p test_b6_furnishings.py -v`: **17/17 PASS**, poslední zaznamenaný běh0.582s; log `unit-tests-final.log` ve vlastní cache. Nový helper je standardní Python bez bpy, numpy/shapely a bez instalace závislostí.
- Malá fixture načítá AST skutečné Geometry třídy z build_model.py a skutečný quantized_face; ověřila prism/face/at/počty/batching bez importu Blenderu. Druhý test kontroluje uzavření/winding dutého polygonového profilu. Fixtures pro explicitní usage, mirrored room, konkávní notch/díru, width/door/aisle, fixed leaf, sanitary counts a tenkou bariéru jsou zelené.
- `plan-source.py` ve vlastní cache aplikuje source kontrakt na read-only recipe pouze v paměti a ve vlastní ignorované diagnostické kopii; žádný fullprep. Výsledek `source-plan.json`:264rooms,13639items,0skips/omissions,264walkPaths a0unresolved route targets. `room-walk-paths.json` má1940candidate points a36extra probes. `plan-metrics.json`:168batches,3244collision items,13639unique IDs,minBedGap0.699m.
- `source-manifest.json` zaznamená kód, testy, dokumentaci, přesné read-only vstupy a fotografie. RawCAD/foto soubory zůstávají ignorované, součástí Gitu je pouze zdrojový helper/test/doc dle task scope.
- Žádný Blender, GPU, server, native export, build, fullsuite ani další agent/workflow. Neměnný uživatelský server2590 zůstal nedotčen. Plná fotovizuální a Actor přejímka a jediné nezávislé review patří rootovi po integraci.
- Po poslední levné kontrole předávám tyto čtyři nové soubory rootovi k `--adopt-dirty`; vlastní procesy jsou ukončené a claim se uvolňuje. Stav tasku/přijetí určuje koordinátor, podúkol netvrdí hotový herní model.
