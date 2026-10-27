# Předání: trees-20261025-r5-authoring

## Oprava přenositelnosti importu, 26. 10. 2026

Rootův immutable candidate-v4 odhalil `ENOENT` při pouhém importu `prepare.mjs`: jeho top-level čtení ignorovaného R4 checkpointu znemožnilo spuštění celého testového souboru v čistém snapshotu. Oprava ve vlastním znovu převzatém authoring scope přesunula toto čtení do `sourceFile()`. Konstanty a funkce jsou nyní importovatelné bez privátní cache; explicitní `prepare()` stále vyžaduje původní pinované vstupy a při jejich absenci řádně selže.

Nová regrese kopíruje pouze `prepare.mjs` a čisté `geometry.mjs` do nového dočasného kořene bez `.cache`, importuje je v samostatném Node procesu, ověří konstanty a absenci vedlejšího zápisu; následně ověří odmítnutí explicitní přípravy s chybějícím checkpointem. Fixture se po ověření přesného vlastního temp path uklidí. Žádný skip, změna CI ani kopírování autorovy cache do testu.

Celý `tests/tree-seasonal-lod.test.ts`: **11/11 PASS**, exit 0, přibližně 3,00 s. Log `.cache/trees-r5-authoring-20261025/tests-portable-import.log`. Změněné soubory pouze `prepare.mjs`, uvedený test, toto předání a popis v `model-r5.md`. Nový prepare SHA `44aa1eda660ddbd13736c4de98199f8928f9052353df4ec493ded9c8125298b2`.

Provenience byla výslovně prověřena: žádný aktuální asset manifest nepinoval SHA `prepare.mjs`; modely pinují výstupní `prepared.json` a své skutečné bake/export skripty. `prepared.json` zůstal byteově stejný (SHA `f1c66fb2fb8d392f0a6fb9f28a291d92930f37dac2dbe118d57adba91b484460`). Tři staré immutable snapshoty stále obsahují původní prepare SHA `5e691568a25bc72be8fc32b65bc88e503c745a858d2f4b2962808d1f614894ef`, jejich kopie byly ověřeny. Žádný starý asset/hash nebyl přerazítkován; geometrie se neregenerovala. Frozen v4 zůstal nedotčený. Nebyl držen heavy/GPU claim ani spuštěn Blender. Po tomto předání se authoring claim uvolňuje rootovi.

Aktuální navazující výsledek (26.10.): whole R5 má full-coverage MID, source LOD0/2 byteově zachované a10/10 cílených testů PASS. Samostatný2/3plane sample má nativní atlas,15 skutečných views a raw/tolerované coverage metriky; nebyl přijat pro whole-tree. Přibyly `multiplane.py`, `verify_multiplane.py`, `full_coverage.py`, `validate_coverage.mjs`, `freeze_revision.mjs`; změny testu a `verify_full.py` jsou vlastní pokračování. Další BMAD workflow se nespouštělo. Podrobný současný stav, přesné GLB/native hashe a checkpointy uvádí aktuální první část bake handoffu.

Navazující rootem objednaná iterace převzala vlastní dirty rozsah pod stejným ownerem. Přibyly `full_pilots.py` a `verify_full.py`; celé dva piloty se stabilními ID a testy jsou hotové, osm kontrol PASS. Přesné výstupy a koordinovaný heavy přechod viz aktualizovaný bake handoff. Původní immutable checkpoint se nepřepisuje. Další práce v tomto převzatém rozsahu je malý 2/3plane leafy sample, ne hromadný katalog.

- Vlastník: `trees-r5-authoring-01a16b37`; příjemce: root koordinátor stromového zadání.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Stav: první porovnávací checkpoint implementovaný, nativně vyrenderovaný a ověřený. Sedm cílených testů PASS. Fir quad je odmítnutý, jediná leafy karta není přijatá jako univerzální mid/near náhrada. Toto není finální přijetí runtime katalogu.
- Soubory: `scripts/trees-20261025-r5/geometry.mjs`, `prepare.mjs`, `bake.py`, `wood_preview.py`, `verify_native.py`, `finalize.mjs`, `snapshot.mjs`; `tests/tree-seasonal-lod.test.ts`; `docs/trees/20261025/model-r5.md`; toto předání; provozní `.cache/trees-r5-authoring-20261025/`. Nativní výstupy patří souběžnému bake tasku, viz jeho handoff.
- Cizí WIP: žádný převzatý. Runtime, staré skripty, fotografie, GLB, master a checkpoint R4 jsou pouze čtené. Cizí pracovní strom ani index se nečistí a nic se necommituje.

## Výsledek a volba

Podrobná evidence a tradeoffs jsou v [model-r5](../../trees/20261025/model-r5.md). Pro Fir A byl nalezen adaptivní osmifacetový podpůrný obal: původních 12 tri → 6 tri při stejné fyzické větévce a přesné shodě původních alpha pixelů. Jeho průhledná plocha navíc je 0,14–5,53 %. Plain quad B přidává u lower-right 7 228 cizích opaque pixelů; nativní render také viditelně ukázal cizí kus kůry. Je explicitně odmítnutý produkční kandidát a zachovaný komparátor. Čistý quad by potřeboval nový nativní bake hullu a nový material key.

Leafy zdroj je celý původní rank 32722, šest listů/24tri na branch4120, parent4118, source `ipr-crown-014`. Žádný 50% subset ani nové listy. Frame zachovává source coordinates a fyzickou velikost. Parent4118 se svými třemi větvemi, 44 listy a devíti původními ranky je konkrétně evidovaný další zdroj, zatím bez exportu a bez sloučení ranků.

Near wood má dva oddělené kandidáty, oba bez odříznutí větví/junctions. Konzervativní: 259 862/275 472 tri. `projection075`: 209 074/210 180 tri. Druhý profil překračuje 0,75px radiální chybu u některých listnatých průřezů; tato mez se nevydává za celkovou chybu povrchu. Všech 82 100/18 138 původních kotev prošlo point-to-triangle kontrolou konkrétních kandidátních tube ploch pod existující mezí `max(8mm,supportRadius+5mm)`; žádný neúspěch.

## Refaktoring a ověření

Čisté clipping/triangulace/frame/wood funkce jsou společné v `geometry.mjs`. Příprava a nativní render jsou oddělené; Blender neimportuje starý build modul s vedlejšími zápisy. Nové deriváty mají vlastní output directories. Žádná runtime cache/observer/per-frame alokace nevzniká.

Po aktivaci D prostředí proběhlo:

- `node scripts/trees-20261025-r5/prepare.mjs`: exit0; přesná R4 source hash kontrola, všechny source anchors porovnané s osami, všechny čtyři wood kandidáty a Fir/shoot metadata. Log `.cache/trees-r5-authoring-20261025/prepare.log`, výsledky `prepared.json` a `preparation-summary.json`.
- `node node_modules/tsx/dist/cli.mjs --test tests/tree-seasonal-lod.test.ts`: **7/7 PASS**, exit 0, poslední běh přibližně 1,05 s. Log `.cache/trees-r5-authoring-20261025/tests-final.log`. Nezávislý 16bit PNG decoder ověřuje každou source-alpha pozici i skutečnou bake RGB masku; test povrchové vzdálenosti obsahuje záměrně odpojenou kotvu. Výstupní testy kontrolují skutečné GLB, počet šesti fotografických částí, uint16 ranky, fyzický frame a native hashe.
- Blender bundled Python spuštěný samostatně pouze k `ast.parse(bake.py)`: **AST PASS**. Blender ani renderer tím nebyl spuštěn.
- Plná sada/build/integrace/GPU se v authoring tasku nespouštěly. Rootův mid PNG byl pouze prohlédnut přes čtení souboru; nebyla otevřena další 3D scéna.

## Procesy, kontrakt a další krok

Blender byl spuštěn pouze pod souběžnou rezervací `trees-20261025-r5-bake` po skutečném root release. Hlavní PID 25160 a 49260 i následné readback procesy skončily exit 0, žádný Blender ani port nezůstal. Oba native mastery, čtyři mapy, devět GLB a 22 comparison PNG jsou hotové; podrobnosti a hashe jsou v [bake handoffu](trees-20261025-r5-bake.md).

Opacity bake explicitně zapisuje RGB luminanci, Raw a neprůhledný alpha kanál. Blender i nezávislý Node decoder potvrdily 353 640 nadprahových pixelů z 1 031 168. Nový `LeafSet024-shoot-r5` není přijatý v2 key. Samples nemají předstírat tři LOD kompletního runtime prototypu.

Neměnný checkpoint včetně source skriptů, testu, dokumentace, native výsledků, map, všech snímků a logů vzniká v `.cache/trees-r5-bake-20261025/native-checkpoint/`; `checkpoint.json` uvádí každou cestu, bajty a SHA-256. Snapshot odmítá přepsat existující adresář. Po jeho dokončení a opětovném ověření ukončených procesů uvolňuji oba claims; skutečný release potvrzuje registr a závěrečná zpráva koordinátorovi. Žádný commit/staging není proveden. Stav tasků a integraci mění root.
