# Předání: trees-20261025-r5-bake

## Aktuální předání: full-coverage MID a oddělený multi-plane vzorek

Root po první whole revizi zadal plné LOD1. Po koordinovaném release R5 splitu byl znovu převzat stejný bake claim; postupně proběhl `multiplane.py` (~213 s, exit 0) a `full_coverage.py` (exit 0). Všechny procesy skončily. `validate_coverage.mjs`, `verify_full.py -- --full-coverage`, `verify_multiplane.py` a **10/10 cílených testů** prošly; log `tests-coverage-multiplane.log` má přibližně2,7s.

Aktuální integrovatelný manifest stále `public/models/vegetation/seasonal-r5/runtime-contract.json`, stabilní ID `own-broadleaf` a `own-conifer`, oba `lodProfile:"full-coverage"`. GLB nyní49 399 036 B /22 078 712 B, SHA `9113d99327c52fc7de197cf8857b562a8ad25fa375db39905299a4722b433df7` / `61511d8b276c30a5b70d1cada34052ba8c2abed4436011cae3ffe4bdbf241c3b`. Native `r5-full-coverage-pilots.blend`:90 612 393 B, SHA `9ac77f6b319de92d7dcb32e165e9ce59ad4e172507fcfa90bbec3c772e39d152`. LOD0/2 zůstaly byteově shodné s prvním frozen whole checkpointem. MID má82 100/18 138 fyzických částí,16 019/18 138 sourcegroups a164 200/108 828 foliage tri. Broadleaf rohy mají přesné near pozice/UV/ranky, Fir celé near raw accessors. Důkazy jsou přímo v `sourcePreservation` a logu `full-coverage-mid/validation.log`.

Oddělený nepřijatý vzorek: `public/models/vegetation/seasonal-r5/multiplane-v2/comparison-manifest.json`, tři malé GLB, čtyři atlasové mapy v `public/textures/trees/20261025-r5/multiplane-v2/`, native `r5-multiplane-v2.blend` (22 345 880 B, SHA `f04685f8beb2efbebe81828a0fee119557460c4cbe75c1a79a98071387c95a13`) a15 comparison PNG v `.cache/trees-r5-bake-20261025/multiplane-v2/`. Zůstává `accepted:false`. Yaw0/90 IoU≈0,9995/0,9992 prokazují správné mapování; yaw60 má IoU0,623 a22,93% extra/20,95% missing mimo1px. Třetí plocha elevated45/30 zhoršuje IoU na0,572 a přidává24,56%. Nepoužito v celých stromech, nevydáváno za far/GPU důkaz.

Aktuální skripty navíc: `multiplane.py`, `verify_multiplane.py`, `full_coverage.py`, `validate_coverage.mjs`, aktualizovaný output switch `verify_full.py`, `freeze_revision.mjs`. Nové cache podadresáře mají vlastní logy/readback/report a vlastní immutable `checkpoint/`; předchozí `native-checkpoint/` i `full-pilots/checkpoint/` jsou nedotčené. Předání těžkého zdroje rootovi následuje po zmrazení obou aktuálních checkpointů a ověření ukončených procesů. Bez stagingu/commitu.

## Navazující autorizovaná iterace: celé piloty

Původní vlastník převzal vlastní dirty výstupy pomocí `--adopt-dirty`, po rootově novém zadání a streamerově výslovném heavy release. První integrovatelný výstup je hotový: `public/models/vegetation/seasonal-r5/runtime-contract.json`, v2, pouze stabilní ID `own-broadleaf` a `own-conifer`. GLB mají 41 848 112 / 19 828 452 B; hashe `505d15bc27e95c21f625f9aad1b5a614cf62a690b75b62aa64057d90be286f3c` / `c03968b787a3b3ab46e526b75caf956ef4b4a68b7fb8bff92ac5627552e4a4a5`. Native `r5-runtime-pilots.blend`: 85 046 147 B, SHA `56d54767576dbf686d1da3c88ba841f0c25483495b1b6b5645a6855b8cd4f251`.

`full_pilots.py` mění pouze near wood na rootem přijatý profil B a všechny Fir obaly na A. Broadleaf foliage a nižší wood LOD mají byteově shodné atributy/indexy s R4; všechny původní ranky/source roots/radii jsou zachované. `verify_full.py` otevřel native a ověřil skutečnou geometrii. Osm cílených testů PASS. Logy `full-pilots/attempt1.log` (RNA reference chyba) a `attempt2.log` (opravený běh, exit 0) zůstávají zachované. Vstup pro streamer se zmrazuje v `.cache/trees-r5-bake-20261025/full-pilots/checkpoint/` včetně testu a skriptů. Před dalším sample bake následuje koordinovaný heavy release pro splitter.

Původní porovnávací checkpoint níže zůstává neměnný; jednoplošná karta ani kontaminovaný quad nebyly smazané nebo potichu přijaté.

- Vlastník: `trees-r5-bake-01a16b37`; autor skriptů: `trees-r5-authoring-01a16b37`; příjemce: root koordinátor.
- Cwd: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, branch `codex/trees-realism-20261025`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek: první nativní R5 porovnávací checkpoint hotový. Žádný runtime katalog, loader, R4 asset nebo fotografie se neměnily. CPU výsledky nejsou GPU přejímka.
- Rezervace: získána až po výslovném root release heavy-validation, vyprázdnění Edge QA a ukončení root sampleru. Blender používal pouze CPU se dvěma vlákny; žádná GPU scéna ani port.

## Přesné výstupy

- `assets/blender/vegetation/seasonal-r5/r5-comparisons.blend`: 19 457 027 B, SHA `238ff1b094e925f470e7946e23415088692d1af6e55d6bffc5191f7c0aef5fcd`.
- `assets/blender/vegetation/seasonal-r5/r5-wood-comparisons.blend`: 55 354 565 B, SHA `6d9c339325f2c8d3c187bfd8e5d55faa5eef84e2a4de83554204e2106f5c88eb`.
- `public/models/vegetation/seasonal-r5/`: sedm `<Fir-part>-comparison.glb` (R4/8facet/rejected quad), `leafy-shoot-source.glb` (24 tri, šest částí), `leafy-shoot-card.glb` (2 tri). Přesné jednotlivé hashe jsou v manifestu.
- `public/textures/trees/20261025-r5/leafy-shoot-rank32722-{color,opacity,normalGL,roughness}.png`: čtyři oddělené nativní renderované mapy, 1024×1007, 16bit.
- `shared/data/assets/tree-r5-materials-manifest.json`: veřejná porovnávací evidence, source/master/generator/GLB/map hashe, frame, root/radius, source branch/rank, 22 obrazových srovnání a obě wood varianty.
- `.cache/trees-r5-bake-20261025/`: 22 comparison PNG, `bake-attempt1.log`, `wood-attempt1.log`, `bake-report.json`, `wood-report.json`, `native-readback*.log`, `native-readback.json` a neměnný `native-checkpoint/`.
- Toto předání. Skripty, testy a modelová dokumentace mají samostatné authoring vlastnictví.

## Konkrétní závěr z obrazů

Fir osmifacetový obal zachovává původní fotografickou část v čelním i 60° záběru. Plain bbox quad u lower-right ukazuje skutečný cizí kus kůry, odpovídající 7 228 dodatečným alpha pixelům. Quad je odmítnutý; jeho snímek zůstává jako důkaz.

Leafy bake zachoval celý rank 32722: šest původních listů z branch 4120, parent 4118. Čelně karta drží fotografický obrys, při 60° však výrazně ztrácí skutečnou hloubku a vzájemné překrytí listů. Není přijata jako univerzální mid/near náhrada. Source frame má 0,228 m hloubky; native readback potvrdil, že všechny source vertices při 60° leží uvnitř snímku (přibližně 4,7–95,3 %), rozdíl tedy není ořez.

Wood R4/A/B zachovávají v celých zimních pohledech hlavní siluetu a napojení. Close views mají přesné 2 m, vertikální FOV 0,85 a 1280×720. Listnatý detail je branch 10, depth 3, šest stran, nominální radiální chyba 2,23 px; jehličnatý branch 2087, depth 3, tři strany, 0,749 px. A má 259 862/275 472 tri, B 209 074/210 180. Oba ponechávají všechny větve a všechny původní kotvy prošly skutečným point-to-triangle limitem. Výběr pro hru a úplná GPU měření zůstávají rootovi.

## Ověření a procesy

1. `bake.py`, Blender 5.2.2 LTS `d13f752e3b9c`, CPU/2 vlákna: PID **25160**, 25. 10. 2026 přibližně 22:55:20–22:56:23 místního času, **exit 0**, přibližně 63 s. Všechny čtyři mapy a deset sample pohledů hotové.
2. `wood_preview.py`, stejný runtime: PID **49260**, přibližně 23:02:51–23:04:49 místního času, **exit 0**, přibližně 118 s. Dvanáct wood PNG a druhý native master hotové. Žádný wood runtime GLB export.
3. `verify_native.py`: oba uložené mastery skutečně otevřené, **exit 0**. Použité mapy packed: 12 v sample masteru, 3 ve wood masteru. Root-local origins zachované. Skutečné počty všech čtyř wood meshes odpovídají připraveným auditům.
4. `finalize.mjs`: spojení obou nativních etap s kontrolou skutečných generator/native hashů, **exit 0**.
5. `node node_modules/tsx/dist/cli.mjs --test tests/tree-seasonal-lod.test.ts`: **7/7 PASS**, poslední přibližně 1,05 s. Log v authoring cache. Nezávislý Node PNG decoder ověřil RGB masku a native GLB test všechny ranky, source roots/radii, šest listových částí, 24/2 tri a frame receiveru.

Opacity má `maskChannel=RGB-luminance`; žádná whiteRGB/transparentA záměna. Dekódované RGB je shodné, rozsah 0–1, alpha 1. Oba dekodéry potvrdily **353 640** pixelů při cutoff 0,5 a **677 528** pod ním. Normal je tangent OpenGL v bázi konkrétního receiveru; albedo je nativní emission render bez světel/AgX. Původní mapy zůstaly beze změny.

Blender ohlásil budoucí deprecation `use_nodes` a nepřevoditelné cesty dvou nepoužitých factory brush materiálů. Původní logy jsou zachované; všechny skutečně použité mapy jsou packed a oba mastery prošly readbackem. Cycles 12samples studio obsahuje renderový šum a není pixelově deterministické GPU srovnání.

## Předání a omezení

Snapshot `.cache/trees-r5-bake-20261025/native-checkpoint/checkpoint.json` zahrnuje source skripty, test, dokumentaci, modely, mapy, snímky a logy s SHA-256; původní R4 checkpoint je jen referencovaný a nezměněný. Po snapshotu a ověření, že neběží žádný vlastní Blender, uvolňuji heavy claim i authoring claim. Žádný staging/commit. Integrátor rozhodne o případném samostatném runtime výrobním celku a teprve pak o integraci.

Neprovedeno: nový katalog 110 stromů, streamování v3, runtime podpora baked key, multi-view leafy náhrada, herní GPU výkon a optimalita. Zdrojový parent subtree s 44 listy/devíti ranky je přesně identifikovaný plán dalšího kroku, nikoli skrytá změna tohoto výstupu.
