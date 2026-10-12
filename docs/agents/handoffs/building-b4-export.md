# Předání: building-b4-export

- Vlastník: `buildings-01a12b28-b4-export` (`/root/b4_blender_export`); příjemce: koordinátor `buildings-01a12b28-root` a runtime integrátor `/root/building_pipeline`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/visual-quality-jump/StrahovCrazyShow`, větev `codex/building-models`, výchozí HEAD `de5647a3550f59af5eb48ecf4c2b2b16a4093bb7`.
- Výsledek: **B4 model a cílené ověření hotové**. Skutečně vytvořené tři editable fasády ve dvou LOD, 12/5/18 otvorů. Near má 21 840 a highest 69 104 trojúhelníků. Runtime integrace a herní přejímka jsou oddělený úkol.

## Převzaté soubory a výstup

Původní WIP byl výslovně předaný rootem z [building-window-authoring](building-window-authoring.md). První dva pokusy o claim byly správně odmítnuté, protože task zůstával `blocked`; nic se tehdy nezměnilo. Po výslovném DONE počasí, GO roota a změně tasku na `ready` proběhl úspěšný `claim --task building-b4-export --owner buildings-01a12b28-b4-export --adopt-dirty`. Převzalo se pět existujících vlastních/předaných cest, nikoli cizí runtime WIP.

- `scripts/create-b4-facade-panels.py`: skutečný export a rozšířená native reopen kontrola.
- `assets/blender/b4-panel-kit/b4-facade-panels.blend`: editable šest objektů, obě LOD, UV, materiál a původ plánu.
- `assets/blender/b4-panel-kit/highest-geometry.json`: nejvyšší lokální geometrie.
- `shared/data/b4-panel-kit.json`: lokální near geometrie pro runtime.
- `public/models/architecture/b4-facade/b4-facade-panels-highest.glb` a `b4-facade-panels-near.glb`.
- `tests/b4-facade-panels.test.ts`: zdrojový plán, 35 průchozích otvorů, okolní stěna, projektovaná plocha, přesné rozměry, normály, native master a GLB normal/UV/triangle parity.
- `docs/reality-pack/b4-facade-panels-20261012/`: README, exportní audit/log, zachované negativní pokusy, konečný log testů, scoped TS a manifest.
- Tento handoff. Úplný seznam bajtů včetně testů je v [manifestu](../../reality-pack/b4-facade-panels-20261012/export-handoff-manifest.json).

Autoritativní `shared/data/b4-facade-plan.json` ani jeho resolver, runtime, reference, stavební archiv, primary/main a task metadata nebyly změněné. Zdrojový hash je `fa9343fdb925c5f670dab75e8c86bf99fa4eb9100c7df7246156a77171c21172`.

## Podklady a konstrukce

Plán byl již identifikovaný referenčním agentem podle severního panoramatu z května 2024, severozápadního photosphere ze září 2023 (upload říjen 2023), ČVUT fotografií Jiřího Ryszawyho z 20. 6. 2024 a OSM 53929057. Zdrojové odkazy, data a provenience jsou zachované v [README](../../reality-pack/b4-facade-panels-20261012/README.md) a plánu. Složení šedých panelů je neznámé. Otvory, 1.5m spárový rastr a barva jsou interpretace, nikoli zaměření. Spára 12mm široká/6mm hluboká, rameno 2mm a obvodový bevel 1.5mm jsou herní konstrukční odhady.

Přední rovina zůstává Z=0 a zadní Z=−0.02m v lokálním rámci plánu. Všech 35 otvorů prochází oběma stranami. Žádná další stěna, vymyšlený větrací otvor, dveře ani druhý ústup před již odsazenou OSM hranou nevznikly. Ve scéně musí tento kit nahradit původní stěnu, nikoli ji překrývat.

## Refaktoring a ověření

Stejná funkce `export_geometry` získává geometrii při exportu a znovu po otevření uloženého masteru, společná `audit` kontroluje topologii před i po. Objekt nese explicitní `detailLevel` a `faceId`. Testy párují plné rohové atributy přes lokální pozici, takže nespoléhají na shodné pořadí vertexů a zachovávají oddělené normály/UV švy. Odstraněný nepoužitý import nemění generaci. Bmesh se vždy uvolní; nejsou per-frame výpočty, runtime cache, observers ani síťový proces.

- Blender 5.2.2 LTS, `--background --threads 2 --python scripts/create-b4-facade-panels.py`, 12. 10. 2026 kolem 12:30 UTC, exit 0. [Log](../../reality-pack/b4-facade-panels-20261012/blender-export.log). Proces skončil po cca 14.5s, skutečný save a reopen úspěšný. GPU nepoužito.
- Všech šest objektů po reopen: **přesná shoda positions/normals/UVs/indices**, 0 boundary edges, 0 nonmanifold edges, 0 degenerate triangles. [Audit](../../reality-pack/b4-facade-panels-20261012/blender-export-audit.json).
- `pnpm exec tsx --test tests/b4-facade-panels.test.ts tests/building-window-kit.test.ts`: konečných **9/9 PASS**, exit 0, 3332.6117ms. [Log](../../reality-pack/b4-facade-panels-20261012/targeted-tests-verified.log).
- `pnpm exec tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --esModuleInterop --skipLibCheck tests/b4-facade-panels.test.ts`: exit 0. [Log](../../reality-pack/b4-facade-panels-20261012/scoped-types.log).
- První nové testy měly 8/9 PASS a selhaly na přísném GLB normal porovnání; logy se zachovaly. Příčina byla ověřena v lokálním primárním zdroji Blender exporteru: normály před normalizací zaokrouhluje na čtyři desetinná místa s NumPy float32 ties-to-even. Test nyní modeluje skutečný převod, drží původní toleranci 2e-6 a kontroluje i UV převod V→1−V. Nedošlo k povolení tolerance či nahrazení geometrie.

## Hashe, procesy a další krok

- Native master SHA-256: `92a540a1795e5fbdebf70b29c60a2b95f045c047fb766de4ba098a7bea8aa1d7`.
- Near runtime SHA-256: `6513ff48c1628eaace4705cd69e6e1f5f946a39ef9d08aa1b83bb6e5f4a790a6`.
- Highest JSON SHA-256: `f0d9209d47056d5bd5138c896fc52fd243b9c097fb2c6694ebe1efe19cf78019`.
- Oba GLB a všechny ostatní soubory mají hashe v auditu/manifestu. To není hash celé produkční hry.
- Blender byl spuštěný přímo přes krátce běžící tool session `23975` z uvedené worktree; PID se samostatně nezaznamenal. Session skončila exit 0 a následná kontrola `Win32_Process` neukázala žádný běžící `blender.exe`. Všechny vlastní testy/TS skončily; nevznikly porty, GPU scény či background services.
- `heavy-validation` a claim se po zápisu předání uvolní příkazem CLI. Data jsou stabilní a root/runtime integrátor o jejich předání dostali zprávu. Stav tasku mění až koordinátor.
- Celá testovací sada, build, integrace, gameplay fotografie a GPU/FPS nebyly v tomto tasku spuštěné; patří společnému stabilnímu checkpointu. Předání je připravené pro archive exporter a runtime přejímku, nikoli tvrzení 60 FPS.
