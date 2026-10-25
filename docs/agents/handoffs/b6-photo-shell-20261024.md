# Předání: b6-photo-shell-20261024

- Owner `cad-buildings-01a16b37-b6-photo-shell`, příjemce root; worktree `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline `ed52896a`.
- Upraveny jen `scripts/cad-buildings/prepare_b06.py`, `test_prepare_b06.py`, `docs/reality-pack/cad-buildings/b06/photo-shell.md`, tento handoff a `.cache/b6-photo-shell-20261024/`. Claim vlastní, heartbeat obnovován. Žádný staging, commit, cizí soubor nebo raw source kopie do Gitu.
- Výzkum/varianty/source mechanismus jsou stručně v photo-shell.md. Podstatné: původní plný 4,4m výřez skutečně vymazal 100mm konec příčky; `normalOffset` není source rovina okna. Výšková hypotéza a hlavní obrys B6 zůstávají.

## Implementace a kontrakt

1. Source window bay se dělí jen při dvou skutečných úzkých příčkových lících s doloženým čelem nebo zakončením na měřené frame čáře a dvěma rozdílnými sousedními bedrooms. Cut uchovává přesný source profil. Výsledné children mají `parentWindowId`, `partitionSourceEntities`, `roomId`, `roomSourceEntity`, `paneCount=2`, `windowPlaneNormalOffset=0` a vysvětlení roviny. `normalOffset` nadále popisuje surrounding wall/reveal span. Silné pilastry nejsou opakované příčky.
2. Každá doložená pokojová dvojice má cross-reference `pairedDoorId`, `pairedDoorRole`, `roomId`/`roomSourceEntity` a `sourceSwingDegrees`. Jen menší source úhel je `openingClassification=fixed-paired-door-leaf`; druhé zůstává aktivní. Kresba a oba deskriptory jsou zachovány. Root builder/probes musí tuto výslovnou uživatelskou změnu uplatnit.
3. Room usage má explicitní pětiprvkový kontrakt a source evidence. Sanitary fixtures obsahují konkrétní measured XY/signature/handles, ne opakované počty nebo náhodné rozmístění. `size` je šířka kolmo k facing, hloubka podél facing; facing míří od zadní strany do místnosti. Neznámý význam či neznámý rozměr symbolu se nevymýšlí.
4. `room.finishTriangles`/`finishAreaM2` jsou přesně room∩actual same-height floor slab, s constrained triangulací. Stair/landing/canopy a jiné výšky jsou vyloučeny. Origin ani transformace se neopakují. Root řeší vlastní schody/podesty jejich rolemi.
5. Refaktoring sdílí usage/parser, symbol grouping, pair selection, window source split a cached floor support podle výšky. Nevzniká druhé modelovací pravidlo v exportu ani runtime výpočet. Overlay označí skutečný okenní cut včetně zachované příčky.

## Skutečné výsledky a převzetí

- `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest test_prepare_b06.B6SourcePrimitiveTests test_prepare_b06.B6PhotoShellTests` z `scripts/cad-buildings`: **41/41 PASS**, exit 0, 0,146 s. Log `tests-shell-final.log`. Předchozí malé RED a GREEN logy ponechány; nález s uzavřeným obrysem opravil membership symbolů z centroidu na celý source stroke.
- Čtecí source sonda všech 8 DXF: 228 bedrooms a 228 neaktivních párových křídel; každé N01–N06 má 18 dělených bayů a 38 pokojových oken. Přesné sanitary počty jsou per-floor; N01 se záměrně liší. Room/source kontrakt převzali read-only agents `cad_b1_probe_review` a `cad_runtime_research`.
- Na přijaté staré recipe `f3cd31d0f91460740b5b543b9e8067c5ba50949774a7ba8b92514a0114900d61` bylo read-only doloženo chybějící zdivo v N02 CAD [29,978803; 0,214403], Z 4,5. Malá source-coordinate regrese nyní prokazuje zachování tohoto profilu bez zaplnění sousedních oken. Nejde o tvrzení, že již vznikl nový model.
- `git diff --check` PASS. **14 local recipe testů čeká na nový root fullprep**. Stará receptura/audit nebyly přerazítkovány, regenerovány ani použity pro falešný PASS. Žádný fullprep/Blender/GPU/fullsuite neběžel; oba vlastní metadata procesy skončily.

| Soubor | SHA-256 |
| --- | --- |
| prepare_b06.py | `6ab2158d94e3f3cd3c91ce12992af0c1abef058bc34fd969ddb35594d118d9ad` |
| test_prepare_b06.py | `d97752ff77e02c8e6d8e7437c070fecf33f0628e8fff320f71ea0a696e23da19` |
| čtený prepare_b01.py | `942b9463f7f1f894a5fc61ba8b3caa91e3a38a7d061501d40ddbd7196f81588a` |
| source-contract.json | `5694dbd38b46929e40a38e00c39bf6df6d80d22333c610132775a5b180a35b48` |

Root může převzít doložený WIP a spustit dosavadní `prepare_b06.py --source "C:/Users/rezac/Downloads/strahov autocad/strahov autocad/strahov blok6"`, potom `B06_RECIPE_ACCEPTANCE=1` a příslušné testy. Je třeba ověřit související nový model, fotografie, průchod jediným aktivním pokojovým křídlem a N06 sprchový source konflikt. Frozen uživatelský snapshot/server se v tomto tasku neměnil. Po předání se claim uvolňuje; finální integraci a task status řídí root.

## Předání zadního přístupu a capů sprch

Owner `b6-photo-01a16b37-shell-rear` převzal s `--adopt-dirty` vlastní shell WIP i výslovně předané root doplnění: clipping obou P01 floor-finish překryvů, `B06_RECIPE_PATH` a příslušnou regresi. Tyto změny zůstaly zachovány. Root před předáním skutečně provedl 56 strict testů nad recipe `.cache/b6-photo-refinement-20261024/preparation/recipe.json`, SHA `b6ca86bb802afe2950d450a7d14b8e42d63f767d120e7dd9eac8b92e12685765`. Tento soubor nebyl v nové iteraci přepsán.

Zadní route `b06-rear-entry` obsahuje dvě fyzická ramena, každé s 8 výslovně odhadnutými stoupáními, dolní a prostřední podestu. Upper support je již existující a rozšířený `b06-east-mezz-terrace` canopy, bez duplikované třetí podesty. `exteriorLevelAnchors` přibyly `exterior.rear.lower=-1.7617777093`, `.mid=-0.3762777093`, `.upper=1.0187223`. Modelová šířka 1,50 m a počty nejsou vydávané za změřené; source manifest/triangle IDs a původ kotvení jsou v segmentech. Fyzický horní práh zůstává otevřenou otázkou, žádné nové prahové schody. Terrain cutout zahrnuje pouze vlastní schody/podesty; nikoli celý kryt nebo okolí.

Sign config `exteriorSigns` má a=[55.293123,20.184315], b=[50.760817,17.705821], bottom=1.2687223, top=1.9687223, dva textové řádky `Klub Čajovna` / `Klub STOH`. Orientace je zvenčí zleva doprava. Z a panel jsou odhad podle fotografie, nikoli kalibrované logo. Role/kolizi sign zajišťuje root builder.

Zdrojová sonda `rear-dividers-probe.json` prokázala čtyři konkrétní T příčky na každém N01–N06. Jen jejich source footprint se oddělí od plně vysokých stěn a ukončí ve výšce room floor +2,05 m. `showerPartitionCaps` a jednotlivé `sourceStructure` mají skutečné handles, bounds, výškový basis a SHA uživatelské fotografie. Půdorysná místa, mezery, perimetry a místnosti se nemění. Root source-finish oprava zůstává.

`uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest test_prepare_b06.B6SourcePrimitiveTests test_prepare_b06.B6PhotoShellTests test_prepare_b06.B6RearSourceTests`: **46/46 PASS**, exit 0, 0,165 s; log `tests-rear-caps.log`. Čtecí source sonda všech šesti pater skončila exit 0 bez wall pairing/fullprep. `git diff --check` PASS. Actual recipe testy nyní očekávají 39 fyzických segmentů, z nichž dva jsou explicitně reconstructed; čekají na nový root přepočet. Žádný Blender/GPU/fullsuite/render ani nový model se zde nespouštěl.

Finální SHA: prepare `1c2e3e3f26d6e6421fb637c80a96cfe80d87e38664a913065ffc8f575120fbc2`, test `cadb44e27337709018cd65b9831a2961d12b217026cc94538f186a8986de61a5`. Vlastní procesy skončily. Předávám pouze povolené soubory/cache a uvolňuji rezervaci pro root; nejsou staged/commitnuté.

## R2 po ručních nálezech: konstrukční vlastnictví a přesné povrchy

Owner `b6-shell-r2` získal čistý claim nad baseline `e7ef3ff6`. Předchozí prepare/test je zachovaný ve vlastní `revision2-before/`; ostatní soubory ani hraný `2591/source-v4` nebyly upraveny. Původní aktuální recipe stále má SHA `e533bb5d7df909746f4f0dc171de8cc332b85ba10e25f4b76958e9f53db8dee8`.

Provedené změny v prepare/test jsou popsány v poslední části photo-shell.md: odstraněn pouze rear terrain cutout; obě source řady oken posledního east pole řežou všechny dotčené N05/N06 wall/slab objemy, N05 má unikátní vlastnictví skutečně sdíleného zdiva; každý parapet nahrazuje svůj přesný objem ve zdivu; krátké západní annex jamby jsou oddělené od vzdálených weak projekcí. Ani všechny Z, ani room.loops, ani aktivní schodiště se neposunuly. N06 nepřibyl žádný mezz floor. Zůstaly source provenance, podschodové floor-finish opravy, zadní ramena, higienické capy i původní hlavní vstup.

**Builder kontrakty schválené rootem:**

- `window.sill` je objekt `{a,b,width,role:'window-sill',material:'concrete',collision:true,bottom,top,loops,triangles,sourceEntities,basis}`. Loops/triangles jsou autoritativní a shodné s wall cutem; a/b už jsou umístěné CAD XY. Root použije closed solid. Pouze N06 CE6/CE8/CEA mají explicitní `None` + `sillOmissionBasis`; žádný default fallback. Tyto stohy mají také `stackedWindowId` a `facadeOwnerFloor`.
- `frameJamb` je samostatný measured return span; legacy depth/normalOffset zůstávají reveal. Při sill výběru se pro doloženou západní annex fasádu použijí skutečné 118/125mm end returns. Nejde o posun source okenní roviny.
- **Každý** role=slab solid má `topSurfacePartitions=[{material,role,triangles,...}]`. Pokojové části mají role `floor-finish`, roomId, roomSourceEntity a usage; remainder původní role/material. Stejný structural slab mesh/collision, pouze jeden top; spodní a boční faces zůstávají. Root odstraní plovoucí finish prisms. Příprava žádné další finish solidy nepřidala. Skutečné konflikty přijatých room profilů se odmítnou, nevítězí náhodné pořadí materiálu.

Refaktoring vyčlenil přesné volume subtraction, source jamb/sill tvorbu, shared facade resolution a top-only constrained partitioning. Podpůrné plochy se seskupují podle výšky; práce je jen během přípravy, bez runtime cache/lifecycle změn. Sill source/profile i slab top triangulace sdílejí původní CAD rámec, transformace se neopakují.

Ověření: `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest test_prepare_b06.B6SourcePrimitiveTests test_prepare_b06.B6PhotoShellTests test_prepare_b06.B6RearSourceTests test_prepare_b06.B6ShellRevision2Tests` z `scripts/cad-buildings`: **53/53 PASS**, exit 0, 0,204 s, `tests-r2-final.log`. Předchozí 50testový log ponechán. Čtecí N02–N05 jamb sonda exit 0 u všech 12 front windows (`revision2-jamb-source.json`); aktuální accepted finish metadata bez pozitivních překryvů různých místností ve stejné úrovni. `git diff --check` PASS. **17 actual recipe testů čeká na fresh přepočet**, žádný stale-cache PASS. Fullprep, Blender, GPU, fullsuite ani nové model/site exporty zde neběžely.

Finální SHA prepare: `bfcd87f4dbc2bf64acb3a869f50c2e79ba0e40806906ddaf60667031a8c08084`; test: `72cdf534997f37d2931df641f0dd8b6dbf8293167a632065a7467bc76dd5c5df`. Předání obsahuje pouze prepare/test, photo-shell.md, vlastní cache a tento soubor. Žádný staging/commit, žádný živý vlastní proces. Po předání release; root převezme a spustí nový B6 fullprep/native/site/grade podle skutečné potřeby a novou vizuální/hráčskou přejímku. Dřívější úspěch analytických/native kontrol není přijetí ručně odmítnutého modelu.

## R3 předání: přesné vlastnictví zárubní

Owner `b6-shell-frame-r3`, příjemce root. Claim `b6-photo-shell-20261024` s doloženým `--adopt-dirty` převzal celý předchozí prepare/test/photo-shell/handoff WIP včetně root cross-floor sill opravy. Výchozí HEAD `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`, větev `codex/b6-photo-refinement-20261024`. Starý kód, testy a receptura jsou v `.cache/b6-photo-shell-20261024/frame-r3-before/`; původní publikované modely ani root receptura se nepřepsaly.

Změněné soubory: `scripts/cad-buildings/prepare_b06.py`, `test_prepare_b06.py`, `docs/reality-pack/cad-buildings/b06/photo-shell.md`, tento handoff a pouze vlastní cache. Varianty a source mechanismus uvádí R3 část photo-shell.md. Výstupní kontrakt je `door.frameOwnership='recipe-solids'` a `frameSolidIds`; odkazované solids mají `role='door-frame'`, `material='frame'`, `collision=true`, `sourceDoorIds`, `sourceEntities`, `frameBasis`, `ownerFloor`. Builder pro tento flag vynechá legacy tři rámové hranoly. Leaf/handle ani interaktivní ID se nemění.

Refaktoring sjednotil přesný cross-floor výřez pro parapety a rámy. Zdrojové profily rámů jsou před odečtením z wall/slab unionované po Z pásmech, tedy mají disjunktní objem i v projekcích mezi patry. 228 výslovných pokojových párů a 20 dalších jednoznačných source párů má pouze vnější jamby a společný header; nepřibyl kolizní prostřední sloupek. Mezipodlažní výřezy obnoví room finish metadata před jediným slab top partitioning. Souřadnice všech 703 dveřních záznamů a všechny ostatní top-level metadata se proti předanému vstupu nezměnily (kromě generator SHA a dvou nových frame polí dveří).

Fresh příprava proběhla po výslovném root povolení, exit 0, bez overlay/Blenderu/GPU:
`uv run --no-project --with ezdxf==1.4.5 --with shapely python -B scripts/cad-buildings/prepare_b06.py --source "C:/Users/rezac/Downloads/strahov autocad/strahov autocad/strahov blok6" --output .cache/b6-photo-shell-20261024/frame-r3-preparation --audit .cache/b6-photo-shell-20261024/frame-r3-preparation/preparation-audit.json --no-overlays`

Ověření: z `scripts/cad-buildings`, `B06_RECIPE_ACCEPTANCE=1` a `B06_RECIPE_PATH=C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow/.cache/b6-photo-shell-20261024/frame-r3-preparation/recipe.json`, příkaz `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest test_prepare_b06`: **78/78 PASS**, exit 0, 8,154 s. Zachovány všechny původní 70 testy; přibylo 6 source/syntetických a 2 actual recipe regrese. Samostatných 59 malých fixture také PASS. Přímá původní 12E1 reprodukce: header area 0,310267705 m², původní wall/slab overlap 0,306968120 m² (98,9365 %); nový overlap 7,17e-16 m², tj. numerická nula. `git diff --check` PASS.

Manifest `.cache/b6-photo-shell-20261024/frame-r3-checkpoint.json` obsahuje zdrojové souřadnice/handles, skutečné hodnoty a SHA kódu, testů, helperu, receptury, auditu a strict logu. Hlavní SHA: prepare `c4a79396bfad993e799e5081d1a9f9e82713b6832f9e3cb541032681e155a0ed`; test `a4ceeebec7be399176c77bb7a8cb5bd97bf3de60eb51c378ab987412fe4f6bcb`; recipe `14bfbffadd7a7d96729d9fb5205b54b8dbcccc87153b807621280a8550949275`; audit `1f94b0e53a992f26a5ef7e976b3961cdc6a3103530491414443a8c0844cb64e9`. B1 helper zůstal `942b9463f7f1f894a5fc61ba8b3caa91e3a38a7d061501d40ddbd7196f81588a`.

Vlastní procesy skončily, žádný server/Blender/GPU/fullsuite/staging/commit neběžel. Po předání release; root provede nový native build a modelovou/hráčskou přejímku včetně nově skutečně kolizních vnějších jambů. Fresh recipe green není tvrzení o hotovém nativním modelu nebo přijatém hraném snapshotu. Zadní výška/práh, B1 a frozen v4 nebyly změněny.
