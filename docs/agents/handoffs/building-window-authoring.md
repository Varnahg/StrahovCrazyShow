# Předání: building-window-authoring

- Vlastník: `buildings-01a12b28-windows` (`/root/blender_windows`), doložený původní autor tohoto WIP; příjemce: koordinátor budov `buildings-01a12b28-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/visual-quality-jump/StrahovCrazyShow`, větev `codex/building-models`. Nová rezervace vychází z `de5647a3550f59af5eb48ecf4c2b2b16a4093bb7`; dosavadní herní základ modelářské práce byl `918a59ce63d7ba7c3a97c209a739cd59a4e00475`.
- Stav: **kód připravený, částečné předání**. Původní okenní kit je skutečně vytvořený a ověřený. Nové B4 panely mají generator, kontrakt, dokumentaci a testy; **první Blender export B4 ještě nebyl spuštěn a jeho data neexistují**.
- Převzetí rezervace: nový `AGENTS.md`, `docs/agents/README.md`, `current-work.md`, `architecture.md` a task JSON načtené; `claim --task building-window-authoring --owner buildings-01a12b28-windows --adopt-dirty` uspěl 12. 10. 2026 a převzal 20 vlastních rozpracovaných cest. Nejde o převzetí cizího kódu ani o povolení Blenderu.

## Změněné soubory a rozhraní

Přesné soubory, velikosti a SHA-256 jsou v [manifestu](../../reality-pack/b4-facade-panels-20261012/code-ready-manifest.json), který zahrnuje také oba testy. Tento manifest není hash celé produkční hry.

- `scripts/create-building-window-kit.py`
- `assets/blender/building-window-kit/building-window-kit.blend`
- `assets/blender/building-window-kit/highest-geometry.json`
- `public/models/building-window-kit/window-kit-profiles-highest.glb`
- `public/models/building-window-kit/window-kit-profiles-near.glb`
- `shared/data/building-window-kit.json`
- `tests/building-window-kit.test.ts`
- `docs/reality-pack/building-window-kit-20261012/` včetně zdrojů, native reopen auditu, profilu, CPU náhledu a zachované původní třísegmentové studie
- `scripts/create-b4-facade-panels.py`
- `tests/b4-facade-panels.test.ts`
- `docs/reality-pack/b4-facade-panels-20261012/README.md`, `pre-export-test.log`, `code-ready-manifest.json`
- tento handoff

Windowkit obsahuje skutečnou Blender geometrii `outerFrame/reveal/sill/sash/gasket/mullion/transom` s fixed-mm `resizeWeights`. Near má 484 a highest 1 028 trojúhelníků na standardní čtyřtabulové okno. Runtime JSON SHA je `b5f2e1a719b7bc4cb9b3cf11d838dd06d66bcae6b9b7a767f6a72271f195d6d3`.

B4 výstup je dohodnutý s integrátorem jako `shared/data/b4-panel-kit.json`: `faces[faceId].parts[{materialRole:'greyPanel',geometry:{positions,normals,uvs,indices}}]`. Highest protějšek bude `assets/blender/b4-panel-kit/highest-geometry.json`, master `b4-facade-panels.blend` a dva GLB v `public/models/architecture/b4-facade/`. **Tyto B4 výstupy jsou zatím nevygenerované.**

## Podklady a cizí práce

Okenní profily vycházejí z ČVUT exteriéru 20. 6. 2024 (autor Jiří Ryszawy; čtyřtabulová typologie není automaticky B4) a historického B12 detailu Ondrej.konicek z 6. 10. 2009, CC BY-SA 3.0. Poškození B12 se nekopíruje jako současný stav. Rozměry profilů jsou výslovně herní konstrukční odhad, ne zaměření.

B4 autoritativní `shared/data/b4-facade-plan.json`, jeho TS resolver a kopii v `assets/blender/b4-facade/source-plan.json` vlastní agent referencí. Generátor je pouze čte. Plan vychází z identifikovaných severních a severozápadních panoramat z května 2024 a září 2023, ČVUT fotografií 1/2/8 z června 2024 a původních OSM hran B4. Tři plochy mají 12/5/18 otvorů. Rozteč panelů, 6mm hloubka spáry, 12mm šířka a 1.5mm hranový bevel jsou odhady; složení šedého panelu je neznámé. B4 barvy panelů a rámů jsou neutrální umělecké hodnoty společného plánu, bez vymyšlené kresby dřeva či otisků bednění.

`client/architecture-reality.ts`, `client/building-window-model.ts` a jejich integrační testy vlastní jiný agent. Market/fluekit vlastní reference agent; stavební archivní exporty vlastní root. Tyto soubory jsem neupravoval. Primary/main, porty a cizí procesy jsem nepřevzal.

## Refaktoring a životnost

Windowkit sjednocuje parametrické profilové prstence, export evaluated geometrie, UV, resize kotvy a topologickou kontrolu. Nejvyšší neúčelný třísegmentový bevel byl nahrazen jediným chamferem na viditelných hranách; původní studie zůstala zachovaná. Broad planar surfaces mají správné oddělené normály.

B4 generator používá jedinou parametrickou mřížku z plánu pro wall/slupku, otvory a spáry, poté skutečně trianguluje editable mesh před exportem normál. Nejvyšší i near data sdílejí stejný source hash a výřezy. Neobsahuje runtime observer, cache nebo práci po snímcích; nespouští žádné síťové služby. Pro světové umístění zůstávají pouze lokální souřadnice a explicitní source edge ID.

## Skutečné ověření

**Dokončené dříve, před nynějším quiet window:**

- Windowkit Blender 5.2.2 LTS: CPU dva threads, export obou GLB, save a skutečný native reopen — PASS. [Audit](../../reality-pack/building-window-kit-20261012/blender-export-audit.json).
- Windowkit CPU inspection: 1280×960, 32 Cycles samples, dva threads — render dokončen a přímo prohlédnut. Je to offline náhled modelu, nikoli herní screenshot.
- `node node_modules/tsx/dist/cli.mjs --test tests/building-window-kit.test.ts` — 4/4 PASS, exit 0. Obsahuje přesnou triangle parity obou GLB s JSON, validní normály/topologii, fixed-mm resize a hashe native masteru.
- Scoped TypeScript nad `tests/building-window-kit.test.ts` — exit 0.
- Samplované obousměrné vzdálenosti a řezy profilů study/highest/near — max 0.660426 mm proti limitu 0.7 mm, PASS. [Důkaz](../../reality-pack/building-window-kit-20261012/profile-distance-audit.json). Není to matematický důkaz spojité Hausdorffovy vzdálenosti ani GPU výkon.

**Lehké kontroly B4 během registrace nového tasku, 12. 10. 2026:**

- Python `ast.parse` nového generatoru — exit 0; `bpy` nebylo importováno, generátor neběžel.
- Scoped `tsc --noEmit` nad `tests/b4-facade-panels.test.ts` — exit 0.
- `node node_modules/tsx/dist/cli.mjs --test tests/b4-facade-panels.test.ts` — **exit 1, ENOENT** pro dosud nevygenerovaný `shared/data/b4-panel-kit.json`; 0 PASS / 1 load failure, 253.9155 ms. [Původní log](../../reality-pack/b4-facade-panels-20261012/pre-export-test.log). Testy nebyly oslabeny ani přeskočeny, samotné geometrické assertions ještě neběžely.
- První B4 Blender export, jeho topology/opening/GLB assertions, skutečný native reopen a herní vzhled: **pending**.

Celá testovací sada, build, integrace, nová herní GPU kontrola a FPS měření nebyly v tomto tasku spuštěny.

## Procesy, rezervace a pokračování

Všechny mé dřívější Blender/CPU/test procesy skončily. Žádný server, browserová 3D scéna, port ani živý pomocný proces nezůstává. Běžící cizí procesy nebyly ukončeny. Task má prázdné `resources`, takže neopravňuje nový Blender/export.

Root výslovně zastavil heavy/Blender/GPU práci kvůli koordinovanému ověřování mobiliáře a počasí. Další krok je samostatný navazující task se stejnými potřebnými write paths a rezervovaným `heavy-validation`, až root potvrdí konec aktuálního okna. Ten spustí skutečný B4 export, zachová případný negativní log, opraví nalezené chyby a provede cílené testy bez oslabování. Teprve poté lze B4 přijmout do společného checkpointu.

Rezervace bude po zápisu tohoto předání uvolněna CLI; release **neznamená hotový B4 model**. Stav tasku a přijetí výsledku mění koordinátor. Neřešené B4 výstupy zůstávají označené jako pending a nejsou volnou prací pro náhodného dalšího autora.
