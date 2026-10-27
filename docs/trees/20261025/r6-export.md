# R6 přesný export herního pilotu

26. 10. 2026, KEY-62. Koordinátor po prohlédnutí celé nativní koruny 0°/45° přijal model jako další herní pilot. Zdroj je `r6-b5-crown-three-lods.blend`, SHA `1c212a55abf286894c874cd1da1b8f20b0ba30a59d02317c4180ba4580ce596c`. Původní soubory a v9 hra zůstávají neměnné; runtime/Game zde nejsou měněné.

## Průzkum a volba

Čtení současného parseru/decoderu a čistého stream exporteru potvrdilo geometry-only flat GLB, přesné canonical názvy, samostatné wood/foliage, uint16 normalized COLOR_0 a možnost odkazovat z nového manifestu na staré R5 conifer URL. `exportSeasonalTrees` by vytvořil také zbytečné conifer kopie; použity budou pouze pure `splitSeasonalGlb`/`verifySeasonalSplit` pro B5.

Primární zdroj instalovaného Blender 5.2.2, `io_scene_gltf2/blender/exp/primitive_extract.py::__get_normals`, čte corner normals a zaokrouhluje je na `ROUNDING_DIGIT=4`, potom normalizuje. Běžný exporter proto není byteově přesný vůči raw native normálám. Porovnáno: standardní export s touto odchylkou (nesplňuje přesné zadání), následný patch normál (riziko, že dedup po zaokrouhlení sloučí rozlišitelné rohy), a úzký přesný geometry-only packer. Zvolena poslední varianta; nezavádí nový runtime formát nebo loader, ale vyžaduje nezávislé porovnání každého exportovaného rohu s native daty.

Extractor bere skutečné `mesh.calc_loop_triangles().loops` a `mesh.corner_normals`. Bitově deduplikuje úplný Float32 position/normal/UV a uint16 color záznam. Převod `[x,z,-y]` má determinant +1, pořadí rohů a winding se neobrací. UV je Float32 `[u,1-v]`; normály se nezaokrouhlují ani znovu nenormalizují. Původní `FLOAT_COLOR` rank se obnoví jako `round(alpha*65535)`, RGB zůstává 65535. Žádný mezikrok BYTE_COLOR, změna materiálu, atlasu nebo leaf populace.

V2 nový B5 whole a V3 nové B5 chunky dostanou samostatné adresáře. Oba conifer prototypy se kopírují pouze jako JSON descriptor z původních R5 kontraktů; samotné GLB/mapy se nekopírují a mají stejné URL/bytes/SHA. Odhadované nominal rozměry zůstávají zdrojovou interpretací; nové skutečné bounds jsou v POSITION accessorech a exportní evidenci. `full-coverage` dále označuje jen plný MID, FAR zůstává původní řídká populace.

## Ověřený export

Nezávislý Blender reopen znovu přečetl přijatý native soubor a GLB. U všech šesti meshů porovnal **každý indexovaný trojúhelníkový roh**: POSITION, raw NORMAL, UV a uint16 COLOR jsou bitově shodné s native po uvedeném převodu souřadnic. Shodné pořadí rohů současně dokládá winding; nepoužívá se vlastní fan triangulace. Nativní zdroj i všech 18 zdrojových/kandidátních meshů a 14 packed images jsou nezměněné. Největší odchylka délky samotné původní Float32 normály od 1 je `1.79e-7`; export ji nezvětšuje.

| LOD / role | Export vertexů | Trojúhelníků | Ranků |
| --- | ---: | ---: | ---: |
| Near wood | 145 958 | 209 074 | — |
| Near foliage | 492 600 | 328 400 | 16 019 |
| MID wood | 13 898 | 19 560 | — |
| MID foliage | 328 400 | 164 200 | 16 019 |
| FAR wood | 2 015 | 2 690 | — |
| FAR foliage | 65 532 | 32 766 | 3 214 |

Rozdělení wood vertexů proti native 116 267 / 10 980 / 1 563 je způsobené glTF corner atributy/UV švy, nikoli novou geometrií. Foliage stále obsahuje 82 100 / 82 100 / 16 383 původních fotografických listů. Nové skutečné bounds jsou přesně přepočtené a zkontrolované vůči POSITION datům v každém accessoru; všechny source identity/root/radius souhlasí.

V3 B5 split má **27/27 byteově shodných accessorů a sémantických metadat** vůči novému whole GLB. Dalších 27/27 porovnání ověřilo stávající R5 conifer whole/split. Conifer URL/SHA/bytes i placement zůstaly doslova stejné; v R6 složkách nejsou žádné conifer modelové kopie.

Přenosný `tests/tree-r6-export.test.ts`: **4/4 PASS**, 0 skip/fail, exit 0. Ověřuje oba typy kontraktů, produkční decoder, nezměněné reference, sousední ranky 42000/42001, raw normálu menší než 4desetinné zaokrouhlení, winding indexy, bounds a odmítnutí 8bit ranku/ne-bílého RGB/smíšeného ranku/stale bounds. Nečte ignorovanou cache při importu ani běhu fixtures. Úzký TypeScript a JS syntax check PASS.

Samostatný skutečný produkční `parseTreePilotManifest` + `decodeTreePrototype` načetl **8 assetů / 24 primitiv PASS**: oba whole piloty a všech šest per-LOD souborů včetně původního conifer. Nejde o NullEngine ani GPU obrazový důkaz. Read-only nezávislá kontrola kódu/evidence nenašla materiální chybu.

| Výstup B5 | Bajtů | SHA-256 |
| --- | ---: | --- |
| Whole | 49 398 860 | `7c699d67bf12e4b54b76d147f9db92f7628cab7090361bd159c36ed67c960e98` |
| LOD0 | 30 827 004 | `d5e3f12ec51ccca625085896ad0bbb08481ba41abb7f8593a167529a0cd472e1` |
| LOD1 | 15 671 144 | `681bcd75bcf04bf7899e36f96b9f942096c3d564e70dd6c9bec775cde4cc1a59` |
| LOD2 | 2 901 116 | `cf317cb3549da9c3c688d66b2bb300feac25f9c2eddfafc6ff7bbd395912664e` |

Whole kontrakt `/models/vegetation/seasonal-r6/runtime-contract.json` má SHA `e3122361447d63c32dbf8460fa227feb18f25216d2c2a0b9f3412d7073594757`; streamovaný `/models/vegetation/seasonal-r6-streamed/runtime-contract.json` SHA `5491f9ea14e2ecd3d314f5e3a591b5c70e15a08029395c063d63ceb16e5981ea`.

První publish skončil před zápisy kvůli překlepu v ručně přepsaném pinu R5 kontraktu (jeden znak navíc); chyba je zachovaná v `publish-failed1-pin-typo.log`. Pin byl opraven na předem skutečně změřený hash, zdroj se nezměnil. Finální publish, native roundtrip a decoder mají exit 0.

Omezení: jde o dva piloty, nadále existuje řídký FAR a původní pruned jemné dřevo nižších LOD. Tento task neřeší celý katalog ani nepřináší FPS/GPU důkaz. Modely/kontrakty jsou připravené pro rootovo zapojení do nové QA cesty; v9 server a Game se nezměnily. [Předání](../../agents/handoffs/trees-20261026-r6-export.md) obsahuje příkazy a snapshot včetně testu.
