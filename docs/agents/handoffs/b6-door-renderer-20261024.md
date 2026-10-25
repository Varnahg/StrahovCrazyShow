# Předání: b6-door-renderer-20261024

- Vlastník: `b6-renderer-r2`; příjemce: root koordinátor.
- Worktree: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, výchozí commit `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- Změněné soubory: `client/cad-doors.ts`, `tests/cad-door-renderer.test.ts`, tento handoff a vlastní `.cache/b6-door-renderer-20261024/`. Žádný cizí WIP převzat ani upraven. Bez stage/commitu, Blenderu, serveru, buildu, celé sady testů či GPU práce.

## Výsledek a zapojení

`createCadDoorRenderer(scene, pivot, meshes, defs)` vrací `{setStates, dispose, stats}`. `defs` jsou modelové `CadDoorDefinition`, nikoli již umístěné world definitions. Volat po připojení importovaných kořenů pod pivot. Přesné `renderPartIds` se hledají v názvu meshe nebo jeho glTF předka; extras `doorId`/`floorId` se kontrolují, pokud existují. Geometrie se převede `sourceWorld * inverse(pivotWorld)` do modelového prostoru. Otevření používá sdílený `cadDoorModelTransform`, tedy stejný pant a rotaci jako `cadDoorPose` fyziky.

`setStates(readonly {id, open}[])` přijímá úplný i částečný seznam. Kontrola všech ID/duplicit proběhne před změnou; revize a epochy nadále spravuje společný timeline. Nezměněný stav nic nenahrává. Změněné dveře přepočtou z uzavřeného základu pouze vlastní souvislé rozsahy pozic, normál a případných tangentů. Uzavření kopíruje původní Float32 hodnoty, nehromadí numerické rotace. UV, barvy a indexy se nemění.

Nové meshe jsou pod pivotem a mají `metadata.cadDoorBatch=true`, `floorId`, `cadDoorIds`, `cadDoorSourcePartIds`, `cadDoorRanges` a zachovanou identitu assetu/zdroje včetně `shadowCaster`; dědí render flags a skutečný material object. Původní individuální `gltf.extras.doorId` není nepravdivě přiřazen celé dávce. Loader či shadow registr pracující s uzavřeným původním seznamem meshů musí zahrnout nové děti pivotu. Statické bounds pokrývají uzavřenou i otevřenou polohu; křídla se nyní pohybují diskrétně, bez animace.

`dispose()` je idempotentní, odstraní vlastní meshe/observer a obnoví původní lokální enabled flags. **Volat před `AssetContainer.dispose()`.** Importované meshe, materiály a textury zůstávají vlastnictvím containeru. `setStates` po dispose selže; upstream musí zrušit odběr. Stats obsahují `doors`, `sourceMeshes`, `batches`, `materials`, `vertices`, `triangles`, `stateChanges`, `bufferUploads`, `verticesUpdated`, `bytesUploaded`; upload čítače nezahrnují konstrukci.

## Průzkum a volba

Primární podklady: aktuální `shared/cad-doors.ts`, loader `client/cad-buildings.ts`, nativní zápis `build_model.py` (objektové extras a přesné renderPartIds) a instalovaný Babylon 9.30.0, zejména VertexBuffer/Geometry, glTF hierarchie a dynamické buffer API. Nativní nový GLB v této práci ještě nebyl generován ani ověřen.

- Samostatný mesh/pivot pro každý list by zachoval import přímo, ale počet draw submissions by rostl s počtem dveří a jejich materiálových primitiv.
- Instance nepokrývají libovolnou odlišnou nativní geometrii a UV bez sjednocení tvarů, které nemáme podloženo.
- Zvolená dávka podle podlaží a **identity skutečného materiálu** zachová přesné trojúhelníky. MultiMaterial se rozdělí podle submesh materialIndex; stejné jméno dvou různých materiálů je nesloučí. Opakované souřadnice napříč materiály zůstávají oddělené, jejich hodnoty se nemění.
- Jednorázově se zachovají podporované position/normal/tangent, UV1–6 a RGB/RGBA atributy včetně dekódování normalizovaných/prokládaných bufferů. Neznámé atributy, deformace, instance, chybějící části, rozdílné layouty či render policy v jedné dávce selžou před skrytím originálů. Nejsou tiše zahazovány.
- Přímý engine range upload zachová úplnou CPU kopii VertexBuffer pro obnovu kontextu; `VertexBuffer.updateDirectly` by ji při dílčí změně zrušil/zkrátil. Indexový/layout stav se nemění, nevzniká potřeba přestavovat VAO/material varianty. Výběr/kolize dávky jsou vypnuté, společné fyzické dveře mají vlastní přesné těleso.

## Ověření

- `pnpm exec tsx --test tests/cad-door-renderer.test.ts`: **24/24 PASS**, exit 0, 1.294 s (runner), 2026-10-24 22:47 UTC přibližně. Log `.cache/b6-door-renderer-20261024/target-tests.log`.
- Cílený TypeScript program s root soubory jen `client/cad-doors.ts` a `tests/cad-door-renderer.test.ts`, nastavení z `tsconfig.json`, syntaktické a sémantické diagnostiky těchto dvou souborů: **0 diagnostik**, exit 0. Log `typecheck.log` v téže cache. Nejde o celoprojektový typecheck cizího WIP.
- `git diff --check -- client/cad-doors.ts tests/cad-door-renderer.test.ts`: exit 0. Oba nové soubory formátovány samostatně Prettierem.
- Fixture 475 listů, šest podlaží, jeden sdílený materiál: šest dávek, 1900 vrcholů a 950 trojúhelníků; je to CPU strukturální důkaz, **nikoli měření GPU výkonu**.
- Ověřeny všechny uzavřené/otevřené vrcholy proti sdílenému physics pose pod posunutým/otočeným pivotem, vnořený import s neuniformním měřítkem, inverse-transpose normály, zrcadlení a tangent handedness, přesné MultiMaterial/UV/barvy, dílčí upload offsety, žádné uploady pro nezměněný stav, atomická odmítnutí neplatných vstupů, rollback selhání alokace, bounds obou stavů a disposal bez zničení sdílených materiálů.

SHA-256 checkpointu:

- `client/cad-doors.ts`: `ef40e7ba8e633f8115c584072ebbbaeba5dbb89ce80582331a0f31fbbcfde5fd`
- `tests/cad-door-renderer.test.ts`: `341b36e0bdf2876c4e6a00862d828909b555acf0948ea21587c51fc6e15ec193`
- Čtená společná dependency `shared/cad-doors.ts`: `0a3fb6789f781148fbcac262b0495709df336d3958f5fd3f4904cbc28f4e5d8b`

## Hranice předání

Vlastní příkazy skončily, žádný pomocný proces/port nezůstává. Root následně ověří přesný nový native GLB, počty materiálových dávek, loader/shadow registr, vzdálené změny stavů, kolize a praktický pohled v celé hře. Tyto výsledky se neodvozují ze syntetických fixtures. Claim je po zápisu předání uvolněn; integrátor rozhodne přijetí a stav tasku.
