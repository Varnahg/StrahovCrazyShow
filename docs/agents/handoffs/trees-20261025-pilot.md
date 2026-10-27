# Předání: trees-20261025-pilot — R4

- Vlastník `trees-pilot-01a16b37`, příjemce koordinátor `/root`. Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, základ `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek je připravený **pilot pro první herní A/B**, nikoli hotový katalog. Koordinátor prohlédl R4 summer snímky a přijal obě vlastní near anatomie pro tento krok. MTree je nevybraný comparator. Žádné změny legacy katalogu, stromových poloh, sdílené kolize, runtime materiálů či hry.
- Vlastní soubory: `scripts/trees-20261025/{skeleton,lod_geometry,mtree_adapter,build_pilot,add_foliage,freeze_inputs,freeze_references,probe_contract}.py`, `publish_contract.mjs`; `tests/tree-seasonal-assets.test.ts`; `assets/blender/vegetation/seasonal/tree-pilots.blend`; čtyři GLB, `pilot-manifest.json` a `runtime-contract.json` v `public/models/vegetation/seasonal/`; `docs/trees/20261025/model-pilot.md` a toto předání. Všechny pomocné logy, dependencies, reference a archivy jsou pouze v přidělené `.cache/trees-pilot-20261025/`.
- Cizí WIP materiálů, loaderu, opadu, Game/UI a QA zůstal nedotčený. Materiály převzaty až po doloženém immutable checkpointu. Žádný commit/staging.

## Skutečné výstupy

| GLB | Bytes | SHA-256 |
| --- | ---: | --- |
| own-broadleaf | 43 910 924 | `814af0881a54f5f82d101f29161be28e654320f1c09b1d71279981fa72b55d6e` |
| own-conifer | 30 764 028 | `bf76cab6f4c7054c23128a969968c9e5d275623ad930df031dddac082a5b3d84` |
| mtree-broadleaf | 18 132 976 | `9b7bac2cb10828e58d05e07e89ea37666cd119edbb29196bb94d6620e43a25bc` |
| mtree-conifer | 8 296 972 | `21827136a4f953e4d2688af63ea7dde29e14c2131c9b40496e0a08a01fe6137e` |

Native master: 87 456 896 B, SHA `9c1bf98aa696090ed13c824680e5b54ba9d0514ed5dccb75ba73acba9c4c422d`. Runtime contract SHA `cdffb0aded889938b58fa7a4a54a4f1297bb6e2518471323971c0bc98390d59f`. Definitivní immutable snapshot je `.cache/trees-pilot-20261025/r4-optimized/`; jeho `checkpoint.json` zahrnuje také skripty, testy, modelové poznámky, toto předání, rendery a logy. Samostatný digest tohoto manifestu se předává koordinátorovi po dokončení kopie, aby nevznikl kruhový hash dokumentu.

Vlastní listnáč má 82 100 fotografických listů / 16 019 malých rank skupin, jehličnan 18 138 fotografických větévek / skupin. Listnáč při 25/50/75 % fáze zachová 20 565 / 41 204 / 61 599 listů; žádný prostý rank `1..N`. Největší skupina vlastního listnáče má rozsah kotev 0,369 m, MTree 0,390 m, nejvýše šest listů. Zachované skupiny mají ve všech LOD stejný u16 rank.

| Vlastní varianta | Near wood / foliage tri | Mid wood / foliage tri | Far wood / foliage tri |
| --- | ---: | ---: | ---: |
| listnáč | 281 530 / 328 400 | 19 560 / 82 126 | 2 690 / 32 766 |
| jehličnan | 304 594 / 217 656 | 25 490 / 108 792 | 1 992 / 43 572 |

Wood redukce je skutečná, nikoli jen metadata LOD. Celkový far počet stále není přijatelný pro hromadný katalog. Nejbližší další kandidát je prostorově odvozený twig cluster nebo alfa obal stejné fyzické větévky, nikoli zvětšený jednotlivý list. Žádné FPS tvrzení bez herního profilu.

## Ověření a neúspěšné pokusy

- `build_pilot.py`, Blender 5.2.2 LTS, CPU 2 vlákna: exit 0, `skeleton-build-r7.log`. Před olistěním prohlédnuta skutečná holá kostra.
- `add_foliage.py`: exit 0, `foliage-build-r6.log`, všechny čtyři native GLB a čtyři nové summer/far-bare obrazy. Následný `foliage-build-r7.log` přidal přesný podpůrný radius do auditních dat a obnovil zdrojové hashe; jeho `--reuse-identical-renders` ověřil **byteově shodné všechny čtyři GLB** před opětovným použitím hotových snímků. Nejde o převzetí obrazu z jiné geometrie.
- `node node_modules/tsx/dist/cli.mjs --test tests/tree-seasonal-assets.test.ts`: **7/7 PASS**, exit 0, log `assets-tests-r4-final-v2.log`. Kontroly skutečných GLB: root radius do 1 mm vůči sdílené kolizi; metrické bounds všech LOD; UV/normály a geometry-only data; normalizované celé rank skupiny a čtvrtiny opadu; skutečná redukce wood; zdrojové/modelové hashe; nezávislé měření 64 kotev každé varianty proti exportovaným float32 wood trojúhelníkům.
- Původní R4 test odhalil MTree skupinu 0,510 m; opravena skutečným prostorovým limitem, bez přesouvání listů. Nezávislý distance tester narazil na degenerované terminální MTree trojúhelníky: nyní správně měří vzdálenost k jejich úsečkám, místo `0/0`. Další rozdíl 0,071 mm mezi předexportním BVH a exportovaným triangulovaným manifoldem vedl k testování skutečného fyzického limitu podpůrné větvičky; nikoli rovnosti dvou interních triangulací. Přímý limit < 4 cm a místní `max(8 mm, radius + 5 mm)` zůstal ověřený. Původní failure logy jsou zachované.
- MTree conifer má 103 zamítnutých kandidátů mimo podpůrný povrch; nejsou exportovaní jako plovoucí listí. Vlastní varianty mají 0 zamítnutí. Skutečné přijaté kotvy ověřuje samostatná GLB kontrola.
- První historický exporter probe mylně očekával float32 a selhal. Aktuální kontrakt prokazují všechny skutečné pilotní GLB jako normalized uint16. Historický failure není vydáván za PASS.
- Žádný plný build, celá sada testů, herní server, GPU render či benchmark. R4 summer = leafAmount 1; bare = 0; žádný jarní snímek. Vlevo vlastní, vpravo MTree.

## Refaktoring, zdroje a další krok

Adaptivní segmentace je samostatná čistá funkce `wood_lod`; připojení a velikost všech leaf/twig částí sdílí jedinou zdrojovou transformaci. LOD vybírá celé stabilní skupiny. Runtime nemusí míchat více materiálů ani dekódovat mapy vložené do každého modelu. Po importu se nesmí použít COLOR alpha jako průhlednost; loader dostal kontrakt a metriky. Varianty jsou oddělené ve masteru a root-local v GLB.

Plná provenience, kalibrace, licence a varianty jsou v `docs/trees/20261025/model-pilot.md`; nezměněné originály mají byte hash. Vlastní forma je autorská interpretace, nikoli dendrologické určení či nové zaměření. MTree core MIT, addon GPL se neinstaloval ani nekopíroval do runtime. Původní soubory/mapy jsou zachované.

Všechny vlastní nativní procesy skončily před předáním, nejsou žádné vlastní servery ani GPU scéna. Po vytvoření snapshotu se uvolní claim `trees-20261025-pilot` včetně `heavy-validation`; skutečný výsledek `release` je doložen zprávou koordinátorovi. Koordinátor převezme R4 pro immutable build a skutečné in-game A/B; během jeho GPU okna nebude tento agent spouštět Blender. Širší katalog a far twig řešení zůstávají otevřené.
