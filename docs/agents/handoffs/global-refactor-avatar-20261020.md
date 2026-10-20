# Předání: global-refactor-avatar-20261020

- Vlastník: `refactor-01a15658-avatar`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`.
- Výchozí commit: `1701bd07ad330df038d9b2b30489ab3560be1090`.
- Výsledek: implementace a cílené CPU ověření dokončené, připravené k review a samostatnému integračnímu commitu. Tento handoff není přijetí celého KEY-48.

## Soubory a vlastnictví

Změněny pouze `client/avatar-renderer.ts`, `client/assets.ts`, `tests/student-eyes.test.ts`, `tests/student-garments.test.ts` a tento handoff. Žádné staging/commity, task/spec úpravy, nové veřejné API ani generování assetů.

Před prvním zápisem byly přečteny AGENTS, architecture, README koordinace, current-work, BMAD policy, šablona předání, výzkum a maintenance spec. Ověřeny `git status --short`, `git worktree list`, HEAD, živý registr i katalog. CLI `validate` a `status` potřebovaly eskalaci kvůli krátkému mutexu ve společném `.git`; po opakování prošly. Task scope byl beze změn a bez kolize. Claim získán bez `--adopt-dirty`; žádné cizí WIP nebylo převzato. Výchozí cizí změny světového rendereru, jeho testů/handoffu a koordinačních/BMAD podkladů zůstaly mimo tento task. Další souběžné disjunktní tasky nejsou součástí diffu.

## Podklady, řetězec a rozhodnutí

Primární zdroje z 20. 10. 2026: skutečný kód výchozího commitu, `docs/refactoring/20261020/README.md`, task JSON, maintenance spec a šest cílených testových souborů. Geometrie `client/data/skinned-character-geometry.json` má SHA-256 `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`; zůstala nezměněná. Nebyly použity nové externí podklady ani odhadovaná geometrie.

`createAvatarRig` volá fit obličeje pro původní oči a obočí, fit trička pro odznak; v produkční variantě následně `installStudentGarments` přemístí odznak na skutečný šitý panel. Preview rig vytváří při vzniku a každé editaci, předchozí rig likviduje a pool prořeže. Hra a LOD používají stejné rigy/pooly. Fit není součástí animačního průchodu. Stávající konstrukce, materiálové vlastnictví, LOD i likvidace jsou zachovány.

Porovnané varianty:

| Varianta | Náklady a rizika | Rozhodnutí |
| --- | --- | --- |
| Ponechat oba průchody | Bez změny dnes, ale dvojí implementace stejného numerického algoritmu a riziko odlišných budoucích oprav | Nevybráno |
| Malý privátní skalární kernel a původní obálky | Jeden dodatečný call při fitu, bez alokace v trojúhelníku; dovoluje výslovně uchovat odlišné meze i souřadnice | Vybráno |
| Nový obecný/shared modul nebo veřejná matematická knihovna | Rozšiřuje API a závislosti bez dalšího doloženého užití, zvyšuje riziko jiného pořadí výpočtů | Nevybráno |
| Babylon raycast nebo jiná projekce | Odlišné souřadnice, tolerance, matice a výběr plochy; další objekty a závislost na scéně | Nevybráno |
| Cache/prostorový index | Nový stav, invalidace a lifecycle bez profilu prokazujícího potřebnost | Nevybráno |

`frontSurfaceZ` zachovává původní pořadí vrcholů, výrazy denominator/a/b/interpolace a `Math.max`. Parametry jsou přímo dolní mez váhy a horní mez součtu: obličej `-1e-6` a `1 + 1e-6`, tričko `0` a `1`. Obličej nadále normalizuje `x / width`, `y / 0.235`, škáluje `0.195` a používá fallback `0.082`. Tričko zachovává výběr female pouze pro preset 2/4, původní souřadnice, surovou hloubku bez násobení a fallback `0.14`. Determinant se přeskočí pouze pod `1e-12`. Žádný cache, stav, per-triangle objekt, callback ani nové public API.

V `assets.ts` jsou dvě totožné šestibarevné palety nahrazené místním readonly `PARKING_COLOURS`. Zachováno pořadí barev a modulo indexů. Pole nyní vzniká jednou při načtení modulu; nic ho nemutuje. Samostatný offline GLB `AssetContainer` s template/paint zdroji a produkční `acquireCarPack` s rigy a refcount release mají nadále samostatné load/error/dispose cesty. Tyto cesty se neslučují. Není tvrzeno měřitelné zrychlení ani FPS přínos.

## Ověření

Všechny příkazy v uvedené pracovní kopii, 20. 10. 2026. Výstupy jsou zachyceny v tomto předání a tool transcriptu; nebyl založen další soubor mimo scope.

1. Výchozí přesný task příkaz, přibližně `07:00 UTC`, exit 0: **36 PASS, 0 FAIL**, 17 245 ms.
2. Nové testy před implementací: `node --import tsx --test --test-name-pattern="surface fitting|production creates sewn" tests/student-eyes.test.ts tests/student-garments.test.ts`, přibližně `07:02 UTC`, exit 0: **3 PASS, 0 FAIL**, 6 811 ms. Tím byly očekávané hrany i zlaté hodnoty ověřené proti nezměněnému algoritmu.
3. Přesný task příkaz po dokončení implementace a formátování, přibližně `07:04 UTC`, exit 0: **38 PASS, 0 FAIL**, 14 123 ms:

```text
node --import tsx --test tests/student-eyes.test.ts tests/student-garments.test.ts tests/skinned-avatar.test.ts tests/student-garment-init.test.ts tests/animation.test.ts tests/native-car-models.test.ts
```

Nové testy načítají privátní produkční deklarace přes TypeScript AST a spouštějí je ve VM se syntetickou geometrií; nekopírují interpolaci jako oracle. Pokrývají souřadnicové převody, skutečné hrany a vrcholy, tolerantní/přísný okraj, skloněnou plochu, přední vrstvu nezávisle na pořadí/orientaci, female preset výběr, přesný determinantový cutoff, prázdnou/degenerovanou geometrii, NaN/nekonečné hodnoty, body mimo plochu a zápornou platnou hloubku. Existující výrobní test oděvů nyní ověřuje přesnou původní finální hloubku odznaku u všech šesti presetů.

4. Jednorázový diferenciální `node --input-type=module` běh, přibližně `07:03 UTC`, exit 0. Oracle byl skutečný původní zdroj načtený pomocí `git show 1701bd07ad330df038d9b2b30489ab3560be1090:client/avatar-renderer.ts`, nikoli ručně přepsaný algoritmus. Původní i nový kód byly samostatně vybrané přes AST/transpilované a spuštěné ve VM se stejnou geometrií. Porovnání pomocí `Object.is`:

```json
{
  "faceCases": 2146,
  "shirtCases": 4781,
  "exactMismatches": 0,
  "paletteComparisons": 2
}
```

Vstupy: mřížka XY, tři běžné šířky obličeje, nulové/záporné/nekonečné šířky a NaN, všech šest běžných i neplatné presety, vrcholy/středy hran/těžiště přibližně stovky skutečných trojúhelníků každého povrchu a syntetické mezní determinanty, tolerance, signed zero a NaN/nekonečné hloubky/body. Obě původní lokální palety byly rovněž načtené z původního AST a porovnané s jedinou novou konstantou: přesná shoda všech šesti barev.

5. Porovnání AST veřejných deklarací obou produkčních modulů se stejným výchozím commitem: **unchanged**, exit 0. Exportované funkce mají stejné názvy, parametry, generika a návratové typy; ostatní exportované deklarace jsou doslova shodné.
6. `git diff --check -- client/avatar-renderer.ts client/assets.ts tests/student-eyes.test.ts tests/student-garments.test.ts`: exit 0, bez výstupu.

NullEngine/regresní testy ověřují numeriku, vazby rigů, LOD, materiály a cleanup. Nejsou GPU důkaz ani měření výkonu. Plná sada, build, izolovaná integrace a praktická produkční přejímka nebyly spuštěny: jsou výslovně přidělené koordinátorovi pod samostatnou rezervací. Produkční reviewed-car loading nebyl znovu otevřen v prohlížeči; změna jeho palety je pokrytá přesným porovnáním hodnot a úzkým diffem, taskové native-car testy používají skutečný offline GLB.

## Identita předávaného diffu

Manifest vytvořen `2026-10-20T07:05:58.382Z`, zahrnuje také oba změněné testy. Toto je identita tasku, nikoli tvrzení o neměnnosti celého souběžně měněného checkoutu. Handoff se do vlastního manifestu nezahrnuje.

| Soubor | SHA-256 |
| --- | --- |
| `client/assets.ts` | `dca408e834febe58a2fe027b64de6af70c6d10e5cbc5d3650ca9c53d7a968550` |
| `client/avatar-renderer.ts` | `41d42f0a2b48178575054772948533efc2507c28b5bd11fed190fd437120ff31` |
| `tests/student-eyes.test.ts` | `5c021063a7ea6f1466d6ccbc752b5374d2f80d9df645b881e6c8482137a7f92b` |
| `tests/student-garments.test.ts` | `b4b71260f05f21332dd3c5bdf8c758878a0f6198570fedc99368a5b16dc1a394` |

Manifest SHA-256: `29a4c75737ad0c11ec3ea484f8913666a7b2e3bbb1c997104ca1c301b1f02331`. Formát payloadu: uvedené řádky v pořadí tabulky, každý `path + NUL + sha256`, spojené LF bez finální LF.

SHA-256 přesných bajtů `git diff --binary -- client/assets.ts client/avatar-renderer.ts tests/student-eyes.test.ts tests/student-garments.test.ts`: `0611ccc8a75f9aefa2c97d346b350ac81d4fd79899444a9cbb3f2e86566e7e6e`.

Původní avatar zdroj SHA-256: `62586721221fb2715a1fe4712406995d644c2490c2eaebd55e3c65f0c7f6b680`.

## Procesy, rezervace a převzetí

Žádné servery, porty, preview, Blender nebo GPU scény nebyly spuštěny. Všechny vlastní testovací/VM procesy doběhly s exit 0; počáteční odmítnutí koordinačního CLI a úspěšná opakování jsou uvedena výše. Žádný vlastní pomocný proces nezůstává. Po sepsání a předání tohoto souboru se rezervace uvolní příkazem `node scripts/agent-tasks.mjs release --task global-refactor-avatar-20261020 --owner refactor-01a15658-avatar`; skutečný výsledek uvolnění předám koordinátorovi v závěrečné zprávě. Uvolnění není stav Done ani integrační přijetí.

Integrátor: zkontrolovat úzký diff a manifest, provést požadované review, samostatný commit a následné společné ověření. Stav tasku, Linear, společné `docs/verification.md` a integraci spravuje `refactor-01a15658-audit`; tento agent do těchto výstupů nezapisoval.
