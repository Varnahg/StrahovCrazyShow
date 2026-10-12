# Předání: building-model-integration

- Vlastník: `buildings-01a12b28-pipeline` (`/root/building_pipeline`); příjemce: root chatu `01a12b28-f5be-74b0-868c-6c1b0d667685`.
- Worktree: `C:/Users/rezac/.codex/worktrees/visual-quality-jump/StrahovCrazyShow`, `codex/building-models`. Herní základ `918a59ce63d7ba7c3a97c209a739cd59a4e00475`; koordinační základ `de5647a3550f59af5eb48ecf4c2b2b16a4093bb7`.
- Výsledek: aktuální integrace skutečných Blender oken, market detailu a tří fasád B4 je dokončená a zmrazená pro navazující export. CPU kontroly prošly. Celkový produkční checkpoint ani GPU přejímka tím nejsou dokončené.

## Přesný rozsah

Vlastní implementace: `client/architecture-reality.ts`, `client/building-window-model.ts`.

Vlastní testy: `tests/building-window-model.test.ts`, `tests/b4-facade-rendering.test.ts`, `tests/architecture-reality.test.ts`, `tests/architecture-depth.test.ts`.

Dokumentace: `docs/reality-pack/building-window-integration-20261012.md`, `docs/verification-evidence/building-window-integration-20261012/`, tento handoff. Kity, jejich generátory, fotografie, sdílený plán B4 a hlavní archivní exportéry jsou pouze čtené výstupy jiných přidělených vlastníků. Primární WIP počasí/mobiliáře ani jiné soubory nebyly převzaty.

## Chování a refaktoring

Skutečné Blender profily nahradily původní pásky a parapety. Rohové kotvy zachovávají pevné profilové rozměry, normály používají inverzní transpozici deformace a UV metrické gradienty. Jediný `appendBuildingDetailGeometry` skládá okna, komín i B4 panely do batchů jednotlivých budov a materiálů. Barvy těsnění/kovu používají RGBA s bílým doplněním ostatních vertices. Cache sdílených tvarů se po stavbě vyprázdní; nevzniká observer, asynchronní image request ani mesh na každé okno.

B4 panely nahrazují tři wallRect oblasti bez překryvu. Plán obsahuje 12 severních malých oken, 5 schodišťových pásů na západě severního výklenku a 18 malých oken západního návratu. Far používá stejnou asymetrickou kompozici. Zůstává původní OSM půdorys a výška; nevzniká druhé coreBand odsazení ani nové dveře. Nedoložená dřevokresba a plochý štítek přes schodišťová okna na těchto fasádách zmizely. Podklady, data pořízení, neznámé materiálové složení a nezaměřené proporce jsou v autoritativním společném plánu.

`solid()` vždy před kontrolou `document` ukládá `authoredArchitectureTexture`, `authoredArchitectureNormal`, `authoredArchitectureNormalStrength`; browser čte stejné hodnoty. Runtime bílý multiplier a Node fallback barva zůstávají. Exportér vlastní root: fyzický surface override má přednost, jinak architektonická textura vyžaduje efektivní `[1,1,1]`; B6 má vlastní tint. Highest data se předávají přes `authoredWindowKit`, `authoredMarketKit`, `authoredB4PanelKit` a nejsou součástí klientského importu.

## Aktuální ověření

Dne 12. 10. 2026 po skutečném B4 exportu:

- 17/17: window model, B4 rendering, architecture reality/depth včetně nového headless texture kontraktu. Log `b4-integration-first-tests.log`, exit 0.
- 7/7: cílené B6 dveře, okna, actual GLB, KCC příjezd/výjezd a identity. Log `b4-b6-entry-identity-tests.log`, exit 0.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0, `b4-integration-types.log`.
- `git diff --check` vlastněných runtime/testů: exit 0.
- Hashované porovnání všech 120 budov: pouze B4 se změnila, ostatních 119 má shodné názvy materiálů/meshů a všechny position/normal/UV/color/index hodnoty. `b4-before.json`, `b4-after.json`, `b4-comparison.json`.

B4 near 129687→140995 trojúhelníků, far 133→291, meshes 19→24. Campus nyní 3242 oken, 1326031 near trojúhelníků, 11661 far trojúhelníků, 1109 meshů. Počet meshů není GPU draw-call měření.

Veškeré příkazy, výsledky a SHA zdrojů včetně testů a highest kitů jsou v `docs/verification-evidence/building-window-integration-20261012/b4-final-integration.json`. Architecture SHA `cff6d34d82c51319ce6bb7d4f2817f0f9860ca9fb2e4b6fef631455a0338989c`; adapter `3d7290ffdd33ea704d094fac735856c2ec56600f78d03655dd3268735901bff2`; near B4 kit `6513ff48c1628eaace4705cd69e6e1f5f946a39ef9d08aa1b83bb6e5f4a790a6`. SHA společného plánu přesně odpovídá odkazu v panelovém kitu.

Dřívější 46/46 a původní neúspěšná mezikola zůstávají historicky zachované v `integration.json` a zprávě; nejsou vydávána za výsledky tohoto aktuálního běhu. Nezávislý read-only reviewer našel před exportem nulové konkrétní problémy, ale sám nevalidoval generated data ani GPU.

## Procesy, rezervace a přijetí

Vlastní testy, typecheck i jednorázový NullEngine hash audit skončily. Žádný vlastní server, preview, Blender ani GPU scéna nebyly spuštěny a žádný pomocný proces neběží. Root dostal aktuální freeze a může regenerovat samostatné nejvyšší archivy, následně provést celý produkční checkpoint a skutečnou vizuální přejímku pod vlastními zdroji.

Claim `building-model-integration` pro `buildings-01a12b28-pipeline` se po tomto předání uvolňuje na výslovný pokyn koordinátora. Release není potvrzení celého herního cíle; stav tasku a převzetí do `docs/verification.md` aktualizuje integrátor. Bez skutečné GPU kontroly se netvrdí lepší FPS ani finální vzhled.
