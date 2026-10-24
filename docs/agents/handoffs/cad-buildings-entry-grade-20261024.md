# Předání: cad-buildings-entry-grade-20261024

- Vlastník: `cad-buildings-01a16b37-grade`; příjemce: root koordinátor.
- Cwd: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`; větev `codex/b1-playtest-20261024`, baseline `6dd89606b137ccf4ea156a4978b649a87c818b1e`.
- Výsledek: jednotný source-derived grade generátor, malé runtime TIN pro B1/B6 a společné API jsou hotové a prošly malou analytickou přejímkou. Skutečný Actor/world/GPU proof zůstává rootovi.
- Změny: `scripts/cad-buildings/export_grade.py`, `scripts/cad-buildings/test_export_grade.py`, `shared/terrain-patches.ts`, `shared/data/cad-buildings/b01-entry-grade.json`, `shared/data/cad-buildings/b06-entry-grade.json`, `tests/cad-entry-grade.test.ts`, `docs/reality-pack/cad-buildings/{b01,b06}/entry-grade.md`, tento handoff a vlastní ignorovaná cache `entry-grade/`.
- Vlastnictví: původní B6 práce byla na žádost koordinátora zastavena, manifestována a skutečně release. Rozšířený task byl následně převzat stejným ownerem s `--adopt-dirty`; manifest převodu je `entry-grade/wip-before-b01-extension.json`. Žádný cizí WIP nebyl převzat. Shared `terrain.ts`, původní terrain testy, native modely/placement a originální DMR/IPR biny nebyly měněny. Nic nestagováno ani necommitováno.

## Výzkum, volba a interpretace

B6 variantu A (jen source hull + DMR blend) a B (source hull + celá první fronta) dostal root s konkrétními world souřadnicemi a číselným rozdílem DMR/IPR. Root výslovně přijal B: zhruba 0,5 m dopředu ve střední části a 0,93 m k pravému šířkovému okraji mimo source. Neprovedl se posun budovy, nový schod ani plošná konstantní grade. Jádro 2,716 m² vzniká přímo z 16sample obálky a source fronty odvozené z CAD směru/šířky a photo pose. Původní source maska 0,979 m² je zachována; mimo ni je explicitní interpretace. Blend 0,5 m mění jen lokální apron, nikoli celé dvě zdrojové buňky.

Koordinátor následně doložil dva B1 prahy a rozšířil task. Primární IPR trojúhelníky `1127362:665` a `1127370:666/655` byly znovu dekódovány z hashově ověřených původních binů; vypočtené roviny souhlasí s předanými hodnotami. 30F4 používá přímý outside ground hit a oddělenou interpretaci u prahu. 312B je celý označen jako extrapolovaný historický/occlusion odhad, s plane jádrem omezeným na 1,051 m od source triangle. Apron 0,3 m interpoluje výšku nejbližšího schváleného okraje do DMR, takže plane se v přechodu dál neextrapoluje.

Kvantitativní rozsah:

| Dataset | Buňky | Vrcholy/trojúhelníky | Skutečně měněná plocha | Max rozdíl od DMR |
| --- | --- | --- | --- | --- |
| B6 | X[-8,0], Z[-84,-80], 2 buňky | 84 / 158 | 2,716 m² core + 4,993 m² blend | 0,1856124 m |
| B1 30F4 | X[-76,-72], Z[56,60], 1 buňka | společný B1 dataset | 0,397 m² core + 1,042 m² blend | dle source-TIN |
| B1 312B | X[-80,-72], Z[40,48], 4 buňky | společný B1 153 / 290 | 0,400 m² core + 1,042 m² blend | společné maximum 0,3831431 m |

Zbytek vlastněných buněk je nezměněný DMR. U B6 se ponechává skutečný sklon: plane firstfront left/center/right je 0,1608883 / 0,0587726 / −0,0433431 m. Pro native firsttread 0,2712777 to bez zohlednění spodní native podesty znamená 0,110 / 0,213 / 0,315 m. Pravý okraj proto není vydáván za automatický walking PASS. Root ověří skutečné podesty, oba kraje, oba směry a případně skok.

## Refaktoring a runtime kontrakt

Společný `triangulate_core` rozděluje každou původní NE–SW DMR trojúhelníkovou rovinu do explicitních vnořených convex blend zón. Plane v jádru zůstává přesná, vnější hrany mají původní F32 DMR, globální deduplikace XZ vrcholů zajišťuje shodné styky buněk. Souřadnice/identity/source RMS se kontrolují před publikací. Neslučitelné nezávislé entry planes ve stejné zdrojové buňce se odmítnou místo tichého překrytí.

`shared/terrain-patches.ts` zachovává `TERRAIN_PATCH` a původní tři API `terrainPatchHeight`, `terrainPatchCellTriangles`, `terrainPatchIntersects`. Přibyly `B1_ENTRY_GRADE`, `B6_ENTRY_GRADE` a čistý `createTerrainPatchLookup` pro jednorázovou indexaci a testování aktivace. North-court data a barycentrická pravidla zůstávají stejná. Pro nespojené B1 ostrovy je doplněn fallback na jejich vlastní buňku při přesném max grid okraji; jinak by globální bbox ukazoval do mezery mezi ostrovy. Normální north-court výsledek zůstává první a nezměněný.

B1 grade je aktivní pouze při `hasCadBuilding("53929063")`, B6 pouze při `hasCadBuilding("53929071")`. B6 předpokládá rootovu již připravenou native větev bez legacy flatten0 v `shared/terrain.ts`. Samotné API nepřidává jinou geometrii do scény a nevytváří druhý collider. Indexace proběhne jednou; lifecycle tvoří pouze běžná paměť module-level dat.

## Ověření a identita

- `uv run --no-project --with shapely==2.2.0 python -B -m unittest discover -s scripts/cad-buildings -p test_export_grade.py -v`: **10/10 PASS**, 0,460 s, exit 0; `entry-grade/python-tests-final.log`.
- `pnpm exec tsx --test tests/cad-entry-grade.test.ts`: **7/7 PASS**, 0,778 s, exit 0; `entry-grade/typescript-tests-final.log`.
- Cílený `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node --esModuleInterop --resolveJsonModule shared/terrain-patches.ts tests/cad-entry-grade.test.ts`: exit 0; `entry-grade/typecheck-final.log`.
- B1 runtime-sampler outside/threshold: 30F4 = 2,124462184 / 2,127047232 m; 312B = 2,178633780 / 2,202351387 m. Jde o malé samostatné dotazy do nové TIN, nikoli Actor proof.
- `entry-grade/source-manifest-final.json` obsahuje zdroje, oba JSON výstupy a oba testy. Hlavní hashe: generátor `d1d3166a7f120e43779f10a054631ae1231266771430e2ff84536cc7fa78e2b5`; shared helper `2ca8c2a70dfda39c59f71f3ba021a951dd4525abfff05c0c64f3b020e3120892`; B1 JSON `cde812cc2f00146a92c702ae54423fc9ce03d8ee9cbba4ccf339d5c0a571b605`; B6 JSON `d0c04b0a68ced82a692f8ba36de4623c40230a47a26e779695c11315663a7233`.

Testy dokládají orientaci a plnou plochu každé source buňky, nepřekročení diagonál, společné i vnější hrany včetně nespojených ostrovů, přesnou plane na vzorcích/frontě, nepozměněné DMR mimo aprony, source mask vs. interpolované díry vs. odhad, omezenou B1 extrapolaci, vazbu native dveří, determinismus, aktivaci podle registrace a zachování north-court dat. Cizí full terrain test ani celá Simulation nebyly spouštěny.

## Předání

Reprodukční CLI a zdrojové/odhadnuté oblasti jsou v obou reality-pack dokumentech. Po změně modelu, photo pose nebo zdrojů data znovu odvoďte; testy kontrolují fingerprinty i placement. Metadata nikdy neprohlašují uvedené výšky za survey. Původní CAD soubory ani jejich kopie nejsou součástí výsledku.

Všechny vlastní příkazy skončily; žádný server, Blender, GPU nebo fullsuite neběžel. Po GREEN předání se claim uvolňuje a veškerý zde identifikovaný vlastní WIP se výslovně předává rootovi k `--adopt-dirty`. Root následně provede skutečný Actor/world proof a případnou visuální přejímku; celek není označen Done jen podle těchto malých testů.
