# Předání: building-archive-export

- Vlastník a navazující příjemce: `buildings-01a12b28-root`.
- Worktree: `C:/Users/rezac/.codex/worktrees/visual-quality-jump/StrahovCrazyShow`, větev `codex/building-models`, výchozí HEAD `de5647a3550f59af5eb48ecf4c2b2b16a4093bb7`.
- Stav: **kód připravený; nové celé stavební archivy dosud nevygenerované a neověřené**. Tento handoff nepřebírá cizí změny počasí/outdoor ani jejich procesy.

## Výsledek a soubory

- `scripts/building-archive-transfer.ts`: společný převod world → local, inverse-transpose normály, outward CCW, zaokrouhlení souřadnic do 0,5 µm na osu a atomický zápis po jednotlivých budovách. Audit atributů rozlišuje coincident hard-edge rohy podle normály, UV a vertex tintu.
- `scripts/export-building-assets.ts`: explicitní highest vstupy tří autorských kitů, plné source hashes a nový převod bez per-triangle Vector alokací. Architektonické procedurální textury získá z metadat i bez DOM; SurfacePack má přednost, B6 vlastní tint zůstává.
- `scripts/create-building-assets.py`: custom normals, pojmenovaný vertex COLOR_0, bílé tints sdílených nebarvených částí, normal PNG a strength, plné sourcePartName, úklid orphan meshů a komprimované editable mastery. Export pojmenovaného atributu zabraňuje závislosti na heuristickém rozpoznání Multiply uzlu.
- `scripts/audit-building-assets.ts`: skutečné GLB identity, počty per part, normály, UV a COLOR_0, materiálové faktory a autorské texture bytes; source texture SHA cache brání opakovanému čtení stejného obrázku.
- `scripts/audit-building-blender.py`: skutečný native reopen, topologie, source UV, corner normals, vertex tints i shader linky, existující linked textures a authored normal strength.
- `tests/building-archive-transfer.test.ts` a evidence v `docs/reality-pack/separate-assets/archive-transfer-code-*`.
- Tento handoff. `.gitattributes`, staré `source-plan.json`, celé `.blend` a GLB se v code-only fázi nezměnily.

## Podklady a nezapisované závislosti

Primární runtime kontrakt čten z Babylon modulu a vlastní architektury, Blender glTF API přímo z instalované verze 5.2 (`io_scene_gltf2/__init__.py` a exportér). Reálné source kit .blend/JSON a jejich foto-provenienci dodali vlastníci window/reference tasků. B4 highest/runtime kit stále chybí. Architektonické PNG jsou původní procedurální mapy ze `scripts/create-architecture-reality.py`, nejsou fotografické skeny; B6 texture provenance je zvláštní případ. Geometrické rozměry kitů zůstávají dokumentovanou interpretací fotografií, ne zaměřením.

## Skutečné ověření 12. 10. 2026

- `pnpm exec tsx --test tests/building-archive-transfer.test.ts`: **3/3 PASS**, exit 0, 429,1459 ms. Ověřuje nerovnoměrnou škálu/reflexi, negativní kontrolu starého převodu normál, zachování starého souboru po chybě a detekci ztracených bevel normál/tmavých těsnění/UV švů. Log `docs/reality-pack/separate-assets/archive-transfer-code-tests.log`.
- Scoped TypeScript `--module ESNext --moduleResolution Bundler --target ES2022 --skipLibCheck`: exit 0; log `archive-transfer-code-types.log`. První pokus se špatně zvoleným NodeNext skončil chybami resolution/požadavkem na přípony; opraven příkaz dle bundler projektu, nikoli importy.
- Python AST obou skriptů: PASS; `bpy` ani generátory nebyly spuštěné.
- `git diff --check`: PASS. Prettier při přípravě zachytil špatné umístění pole reportu v argumentech assert; opraveno před tímto stavem.
- Nezávislý read-only review os/normál/tintů/lifecycle nezanechal prokazatelný otevřený nález. Poslední přenos architektonických PNG musí potvrdit skutečný export.

## Limity a pokračování

Žádný nový Blender, celkový source export, GLB/native audit, full suite, build, integrace ani GPU v této fázi neběžel. Vlastní živé procesy: 0. Kvůli weather/outdoor quiet window zůstává heavy práce pozastavena. Nejde o důkaz kvality obrazu nebo 60 FPS.

Po explicitním DONE a předání skutečného B4 kitu: navazující `building-archive-validation` převezme tento vlastní WIP, rezervuje heavy-validation a provede celý export/audit. Při source plánu nad 100 MiB přidá pouze jeho LFS atribut. Pak produkční checkpoint se všemi testy a skutečnou herní přejímkou. Release code-only rezervace neznamená dokončené modely; stav tasku mění koordinátor.

Manifest kódu včetně testů: `docs/reality-pack/separate-assets/archive-transfer-code-manifest.json`. Budoucí změny vyžadují nový manifest; není to identita celého herního checkpointu.
