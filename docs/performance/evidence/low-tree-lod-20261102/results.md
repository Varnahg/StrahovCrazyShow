# Low: dřívější vzdálené koruny stromů · 2. 11. 2026

Implementace kandidáta je v jediném kanonickém checkoutu na `main`. Cílem je snížit množství stromové geometrie a zbytečné žádosti o detail v úsporné kvalitě. **Zisk FPS a obrazová přejímka zatím nejsou doložené.** Tento záznam nezavírá celkovou plynulost KEY-5.

## Průzkum a rozhodnutí

Výchozí zdroje `6f26342736b5e285429379847e4ea7e4801173c9`, následný čistě dokumentační commit `3ffaab5f0015cee45cbc336e6ca8bb753a4a63bd`. Uživatel zadal jeden konkrétní optimalizační postup přímo na main, bez kopie projektu nebo worktree. Původní `http://127.0.0.1:8080/` a jeho serve rezervace se neměnily; identita klienta před změnou byla `sha256-3a1a6137047f4aa316184695493a73783eff50f1c297ed0ee9f5254e06767a13`.

Aktuální katalog 110 stromů používá profil `full-coverage`. Ten pro Low držel střední model do 75 normalizovaných metrů. Dva přímo spočítané produkční modely měly MID/FAR 113 446/17 228 a 136 804/22 242 trojúhelníků; FAR součet zahrnuje clusterové karty, ne pouze GLB dřeva. Jde o mechanismus a vzorek, nikoli FPS měření ani souhrn celého katalogu.

| Varianta | Rozhodnutí a kompromis |
| --- | --- |
| Zachovat FAR75 | Bez změny obrazu; zachovává náklady MID v pásmu 45–75. |
| Low/full-coverage FAR45 | Vybraný měřený kandidát: úzká změna, existující autorské koruny, žádné nové materiály/assety. Dřívější přechod může být viditelný, proto zbývá obrazová kontrola; případná kalibrace60 je menší zásah. |
| Další redukce stínů | Low již používá512px, nejnižší PCF a bez alpha casterů; vyšší přímý dopad na vzhled. |
| Inkrementální travní bounds | Potenciální CPU úspora, ale složitější compaction/invalidation a neznámý podíl na snímku. |
| Retained solar renderList | Menší alokační změna; primární Babylon setter nedokládá globální shaderovou invalidaci při každém přiřazení. |

Primární podklady načtené při průzkumu: [Babylon LOD](https://doc.babylonjs.com/features/featuresDeepDive/mesh/LOD/), [stíny](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows), [ObjectRenderer9.30](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Rendering/objectRenderer.ts). Projektové vstupy: `client/tree-renderer.ts`, `shared/vegetation.ts`, `tests/tree-streaming.test.ts`, produkční stromový katalog a jeho GLB/clusterové části.

## Změna a její meze

`treeDetailForProjection` používá FAR45 pouze pro přesnou kvalitu `low` a profil `full-coverage`. Near6, Medium FAR100, High FAR135, neznámá kvalita s původním FAR75 a historické profily se zachovaly. Vzdálenost se stále přepočítává podle skutečné projekce; nejde o pevný45m radius při každém FOV/rozlišení. Ochrana úsečky kamera–hráč, svět, kolize, vítr, sezóny, materiály, shaderové varianty a streamovací vlastnictví zůstávají stejné.

Refaktoring rozděluje vnořený ternární výraz na near a far rozhodnutí s lokální konstantou. Nepřidává per-frame alokace, stav ani veřejné API. Cache může již načtený MID držet dál; změna proto neslibuje konkrétní pokles RAM/VRAM.

## Dosavadní ověření

- Čtyři nové regrese nejprve selhaly na původním runtime s `1 !== 2`; původní výstup zůstává v implementační relaci.
- Cílená sada `tree-streaming`, `tree-cluster-streaming`, `tree-catalog-loading`: **36/36 PASS**, bez skipů, exit0. Testuje skutečný TreeRenderer nad syntetickými GLB, hranice, projekci/zoom, nevyžádaný MID v pásmu45–75, obě pořadí pozdního dokončení MID a opětovné použití při low/high.
- Nezávislé čtecí review přesného runtime/test diffu a potřebného okolí: `[]`; rovněž bez nálezu v A/B harnessu. Reviewer nespouštěl testy ani GPU.
- První celý TypeScript průchod našel dvě zápisové operace do readonly testové vlastnosti `lodProfile` (TS2540). Fixture byla opravena stávajícím testovým způsobem `Object.assign`; runtime se při této opravě nezměnil. Následný TypeScript prošel.
- Celý `pnpm test`: **2 848 PASS / 0 FAIL / 5 SKIP**, celkem2 853 případů, exit0,1 613 907,9619ms. Přeskočené kontroly jsou opt-in browser feedback, POSIX koncová mezera, volitelný původní report, PostgreSQL/pgvector a nedostupný původní station capture; žádná nová stromová regrese nebyla přeskočena.
- Standardní `pnpm build` včetně TypeScriptu: **PASS**, exit0. Kandidátní A/B build: **PASS**, exit0; stejné dosavadní Vite warnings o velikosti chunků a dynamických importech.
- Izolovaný `pnpm test:integration`: **PASS**, exit0. Zahrnuje singleton svět, guest boundary, skutečnou jízdu přes SDK,12 autentizovaných peers se vzájemnou přítomností, recovery/input backlog a feedback boundary. Je to síťový/fyzikální důkaz, nikoli GPU vykreslení.
- [Strojový souhrn](validation.json) zachovává přesné hashe logů, oba source/test manifesty a původní TypeScript selhání. Logy jsou v `.cache/low-tree-lod-20261102/`; neopakovala se již úspěšná plná sada bez změny runtime.

## Reprodukovatelné buildy a praktická přejímka

Kandidátní source/test hash je `0786606868a5fa20259935ad315ea57c7a540136fcdcfea5ed1ddc74fd887bbe`. Z943 vstupních souborů se mezi A/B liší pouze `client/tree-renderer.ts` a `tests/tree-streaming.test.ts`; public tree i skutečné asset bajty jsou shodné. Oba buildy a manifesty zůstávají v přidělené `.cache` pro pozdější GPU srovnání.

[Harness](harness/README.md) sestavuje pouze výstupy v `.cache/low-tree-lod-20261102/`; nekopíruje zdroje, public ani závislosti. Baseline má source/test hash `3304e474e6e1653bfbaef9c2cb1059fddab60c114824e96cce9bfdef720bc85c`, public tree `ce279822be17f1bbee373af19c13edd18cfaa612` a skutečný public content hash `45f088a91dbdc53456e8cfebb6fc50a2d3cd6914e9eba8ed197a946e947d2416`. Před/po kontrola zahrnula8064 public souborů,4,666GiB; celý baseline build a kontroly trvaly102,65s. Vite build prošel, s dosavadními upozorněními na velké chunky a neúčinné dynamické importy.

Baseline preview4179 a vlastní izolované API2568 skutečně nastartovaly. Přípravný běh bez herního měření byl ukončen přes exec Ctrl+C; oba jeho PID3248/42480 již neexistují a porty jsou volné. `cleanup.json` nevznikl, takže se tento přerušený běh nevydává za přijatou měřicí sérii.

Na stroji jsou Intel UHD630 a GTX1060; NVIDIA ovladač582.28, fyzická VRAM6144MiB. Toto je inventář stroje, **nikoli důkaz použitého GPU ve hře**. Žádný nový herní FPS/p95/p99 výsledek nevznikl.

V předchozím pokusu nativní Computer Use zastavila automatická kontrola, protože nedokázala spolehlivě určit URL Edge. Po výslovném pokračování uživatelem bylo spuštění Edge přes terminál odmítnuto automatickou kontrolou bez podrobnějšího důvodu. Podporované `cua.createBrowserTab("edge", ...)` následně jednoznačně oznámilo `Local browser use is disabled in Work settings`. Uživatel dostal žádost zapnout tuto možnost; omezení se neobcházelo jinou browser/CDP automatizací.

Přijetí FAR45 stále vyžaduje stejný backend, Low, viewport/backbuffer, datum/počasí, kameru, HUD a různá skutečná avatarová připojení. Zaznamenat všechny raw intervaly, FPS/p95/p99, skutečný adaptér a LOD/triangle counts; porovnat koruny v pásmu přechodu, zoom, low→high a pohyb. NullEngine a úspěšný build nejsou náhradou této kontroly.
