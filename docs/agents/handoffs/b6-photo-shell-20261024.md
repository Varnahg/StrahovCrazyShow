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
