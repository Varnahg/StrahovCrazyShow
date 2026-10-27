# Předání: trees-20261025-litter

- Vlastník: `trees-litter-01a16b37`; příjemce: root integrátor STROMY-20261025.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, výchozí commit `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek: implementace, cílený refaktoring a CPU ověření dokončené. Obrazová a výkonová přejímka celé hry zůstává integrátorovi.
- Změněné soubory: `client/tree-litter.ts`, `tests/tree-litter.test.ts`, `docs/trees/20261025/litter.md`, tento handoff a vlastní `.cache/trees-litter-20261025/`.
- Cizí WIP: žádný soubor mimo task nebyl změněn. Integraci Vegetation/TreeRenderer/Game a zdrojové mapy vlastní root a další přidělení autoři; nejsou součástí tohoto checkpointu.

## Rozhodnutí, API a vlastnictví

Použité podklady jsou stávající mapové koruny a výluky, skutečné `groundHeight`/`groundNormal`, komponentová metadata `shared/data/tree-leaf-components.json` a původ map v `shared/data/assets/tree-materials-manifest.json`. LeafSet024 pochází z ambientCG, drobné jehličnaté výřezy z Poly Haven fir_tree_01. Původní mapy ani jejich pixely se nemění. Množství, retence a rozmístění opadu jsou výslovně modelová interpretace, nikoli místní botanické měření. Výzkum ordinary PBR, Mesh/SubMesh bounds a disposal vycházel z lokálního Babylon 9.30.0 a existujícího projektového prewarm řetězce. Podrobnosti a porovnání částic, thin instances a statických patchů jsou v `docs/trees/20261025/litter.md`.

Veřejné API je `new TreeLitter(scene, {leafMaterial, twigMaterial?})`, `setTrees(sources)`, `update({time, quality, player, season?})`, `beginPreparation()`, `preparationRevision`, `stats`, `dispose()`. Source je `{id,x,z,crownRadius,family,seed}` dodaný skutečným TreeRendererem. Bez sezóny a pro referenčně holou skupinu nevzniká opad; evergreen používá pouze malé twig výřezy. Změna/removal source uvolní příslušný patch, stejné hodnoty neinvalidují cache.

Vlastní ordinary PBR sdílí přesné již načtené Texture reference. Neprovádí žádný texture load, nekopíruje wind plugin a nedisponuje zapůjčené mapy. Textury musí být přímé UV0/invertY=false s jednotkovou UV transformací; komponentové Blender UV se převádí na odpovídající top-left UV. Použitý season plugin tónuje mrtvý materiál při zachování fotografické textury. Source family zůstává samostatně v metadata, nejde o změnu skupiny živého stromu.

## Cache, geometrie a příprava

- Statické merged patche mají terrain-conforming komponenty a úplné footprint výluky budov, komunikací a pevných povrchů. Prefix indexů mění sezónní množství; `hasVertexAlpha=false`, explicitní CCW orientace, alpha test, žádné průhledné mizení a žádné nové wind větve.
- Low/medium/high jsou omezeny na 3/5/8 aktivních patchů, 128/384/768 komponent a 512/1536/3072 trojúhelníků. Cache má nejvýše 16 patchů, source katalog nejvýše 512 identit a cold generování nejvýše jeden patch za výběrový tick. Stabilní teplý snímek nevytváří geometrii ani nepřepisuje buffery.
- Prázdnost a zjištěná kapacita zůstávají jako malé source metadata i po eviction. Sezónní příspěvek pod jednu komponentu se negeneruje; nevzniká trvalá smyčka přípravy/eviction nulových prefixů.
- Nejvýše dva retained preparation meshe mají stejné NORMAL/UV/COLOR, alpha a material branches jako skutečný pozdější patch. Generovaný lease chrání proti starému cleanupu. Stabilní `preparationRevision` je po dispose undefined.
- Aktivní prep lease umísťuje helpery před skutečnou kameru už při begin a při update před cadence/readiness návraty. Mění pouze transform/bounds, nikoli buffery. To připravuje i skutečnou prostorovou receiver variantu svítilny; po cleanup se helpery vypnou a dále nepohybují.
- Source material, zapůjčené textury a scene mají dispose listenery. Partial constructor failure, pozdní readiness a opakovaný dispose uvolní vlastní zdroje, nikdy zapůjčené mapy.

## Skutečné ověření

- `node node_modules/tsx/dist/cli.mjs --test tests/tree-litter.test.ts`: **9/9 PASS**, exit 0, **3672.4276 ms**. Finální log `.cache/trees-litter-20261025/targeted-final.log`.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: **PASS**, exit 0. Log `.cache/trees-litter-20261025/typecheck-final.log` (bez diagnostiky).
- Testy používají skutečnou mapu, koruny, výluky, terén, Babylon Geometry/PBR a reálný `VehicleLighting("player")` s `GltfLightBudget`. Dokládají determinismus, UV/terrain vertex data, skutečné prefix caps, bounded cache a eviction, identické retained buffery, nulové texture requesty, transactional validaci a celý ownership/disposal lifecycle.
- Shader příprava ověřuje NORMAL/UV1/VERTEXCOLOR, vypnuté VERTEXALPHA/ALPHABLEND/INSTANCES, shodné helper/live defines a dvě prostorově odlišné kamery včetně kroku uvnitř cadence. Skutečný SPOTLIGHT receiver branch a in-frustum bounds jsou potvrzené CPU kontrolou.
- Původní neúspěšné logy jsou zachované: první typecheck odhalil použití Vector3 metody s plain Vec3; první přidaná prostorová testovací cesta chybějící Ray side effect. Obě příčiny opraveny před finálními výše uvedenými běhy.

## Identita a předání

Manifest `.cache/trees-litter-20261025/checkpoint.json` zahrnuje produkční modul, test a odborný dokument. Handoff se nevkládá do vlastního hashe.

- Source digest: `a9e0d76e22d6767f27f34f147371b8b1c219b196989894ca4958167e5f41ac6c`.
- SHA-256 manifestu: `f8e95b69177b05f10938d4376f6eecf9ce7d33726360c6ff5384207e09a98f6c`.
- Vlastní testovací a typecheck procesy skončily. Nebyl spuštěn server, build, fullsuite, Blender, GPU ani instalace. Hrané URL zůstaly nedotčené.
- Rezervace se uvolňuje po tomto předání; stav tasku a integrační záznam mění root. Žádný staging ani commit nebyl proveden.
- Root již samostatně oznámil actual Vegetation/litter wiring 5/5 PASS; tento údaj není vydáván za vlastní testovací běh. Root nyní vytvoří neměnný snapshot a provede úplnou integrační a obrazovou přejímku.

Aktivní počty jsou enabled prefixy, nikoli počet GPU viditelných komponent. Cache bytes jsou geometrický payload, nikoli naměřená VRAM. NullEngine nedokládá vzhled ani výkon. Zbývá skutečně posoudit čitelnost drobného opadu, alpha hrany, odstín mrtvých listů/větviček, souběh s trávou a terénem, a FPS/p95/p99 v celé hře na pevných pohledech.
