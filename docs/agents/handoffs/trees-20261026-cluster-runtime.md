# Předání kompaktního FAR decoderu

Root KEY-62, owner `trees-cluster-runtime-root-01a16b37`, cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`.

Vlastní soubory: `shared/tree-cluster-types.ts`, `client/tree-cluster-geometry.ts`, `tests/tree-cluster-geometry.test.ts`, `docs/trees/20261025/cluster-runtime.md` a tento handoff. Přesné schéma dohodnuté s `far_r6_design`; streaming integrátor `ncm_startup_probe` má tyto helpery read-only.

Výsledek: čistý bounded parser banky a jednorázová rigidní expanze32B group records do původního sezonního kontraktu. Před alokací vyžaduje úplné rankové pokrytí včetně nezávisle dekódovaného exact fallbacku. Source bytes a expanded bytes jsou oddělené, žádné tvrzení o VRAM/FPS.

`node node_modules/tsx/dist/cli.mjs --test tests/tree-cluster-geometry.test.ts`:4/4PASS,0fail/skip,647.9ms. Úzký tsc nad třemi novými soubory s ES2023/ESNext/Bundler/strict/resolveJsonModule: exit0. Nespouštěna celá sada, build, integrace, Blender ani GPU. Runtime wiring a skutečná produkční data dosud neověřené.

Bez vedlejších procesů. Rezervace zůstává rootovi pro případné nutné opravy po předání skutečných autorovaných dat; další agent do souborů nezapisuje.

Navazující skutečná data: banku a všechny její mapy ověřily integrity SHA, všech16 019ranků má právě jednu cestu card/exact. Samostatný comparisonGLB souhlasí s runtime expanzí každého rohu do0,954µm v pozici,1,192e−7 v normále a bitově v UV. Explicitní kalibrace atlasu0,2/1 přidala jeden cílený test PASS. Evidence `produced-check.json` a přesné identity jsou v cluster-runtime.md. Původní tvrzení o neověřených skutečných datech výše patří prvnímu syntetickému checkpointu; runtime zapojení/GPU nadále čeká.
