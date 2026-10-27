# Předání: trees-20261026-shadow-startup

- Vlastník: `trees-shadow-startup-01a16b37`; příjemce: root koordinátor `trees-20261025`.
- Cwd/větev: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, `codex/trees-realism-20261025`; výchozí HEAD `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek: reprodukované přepínání PCF shadow base DEPTHPREPASS opraveno v projektovém Fresh wrapperu. CPU RED→GREEN potvrzen; native GPU/startup přejímka náleží koordinátorovi.
- Přesné vlastní soubory: `client/webgpu-shadow-readiness.ts`, `tests/tree-shadow-startup-repro.test.ts`, `docs/trees/20261025/shadow-startup.md`, toto předání; vlastní `.cache/trees-shadow-startup-repro-20261026/`.
- Cizí WIP: wrapper byl při claim čistý; nový test neexistoval. Game/UI, pipeline adapter, stromy/assets a dependencies nebyly upraveny. Žádný stage/commit.
- Podklady a varianty: [shadow-startup.md](../../trees/20261025/shadow-startup.md), pinned Babylon PCF callbacks/Mesh.isReady/PBR frame defines/ShadowDepthWrapper a v7 shader inventory. Vybrána úzká PCF wrapper normalizace před globálním Game stavem či dependency patchem; žádné oslabení kontrol/deadlinu.
- RED důkaz: skutečný TreeWind+TreeSeason PBR + VehicleLighting(player/low) + Fresh wrapper + actual scene shadow callbacks, explicitně FILTER_PCF bez NullEngine Poisson fallbacku. Osm check/render cyklů vytvořilo 16 dalších programů (19 místo 3), DEPTHPREPASS false/true a opakované disposed depth efekty; `red-first.log`, exit 1.
- Fix/refaktoring: veřejný PCF getter, původní guards před změnou stavu, jeden try/finally scope nad base/depth/layout readiness, žádný nový cache/state owner a žádná duplikace standalone volání. Caller true je po scope obnovené; caller false zůstává false; PCSS ani WebGL factory větev se nemění. Vlastní actual PCF draw už má false, takže se zbytečně nepřepíná.
- Ověření 26. 10. 2026 11:08–11:13 UTC: finální `node node_modules/tsx/dist/cli.mjs --test tests/tree-shadow-startup-repro.test.ts tests/webgpu-shadow-freshness.test.ts` **32/32 PASS**, targeted tsconfig **PASS**, diff check **PASS**, exit 0. Logy `green-first.log`, `lifecycle-first.log`, `targeted-tests-final.log`, `targeted-types-final.log`.
- Regrese: stabilní 3 programy/stejný depth Effect po osmi check/render cyklech; smíšené PCF/PCSS generátory a přepnutí filtrů; standalone exactly-once; success/false/throw/wrapper+scene+engine retirement pro původní true/false; reentrant guard neprovádí writes. Stávající stale light-layout/UBO/late effect readiness testy zůstaly zelené.
- Testové omezení: skutečné CPU PBR/Effect/cache/shadow state machines, NullEngine GLSL driver IO bez nativní WGSL/GPU. Neměří FPS ani vizuální parity.
- Snapshot/diff: `.cache/trees-shadow-startup-repro-20261026/manifest.json`, `source/` s vlastním wrapperem/testem/docs, `implementation.diff`. Scope manifest obsahuje nový test; nejde o celý herní build.
- Procesy: pouze dokončené lehké CPU testy/typecheck; žádný server/GPU/Blender/build/fullsuite/install. Žádný živý proces k převzetí.
- Další krok: root zmrazí nový checkpoint, provede build/integraci a native GPU start/visual acceptance; průběžně aktualizuje Linear/verification a vlastní task status. Scope je připravený k převzetí, širší migrace není označena Done.
- Rezervace: po handoffu a snapshotu uvolněna CLI release; žádné další zápisy pod tímto ownerem.

## Převzetí koordinátorem

Root převzal přesný scope s vlastníkem `trees-shadow-startup-integrator-01a16b37`. Nezávislé čtecí review `tree_streaming` nenašlo actionable problém; potvrzuje PCF-only predicate, standalone a finally restore. Neměnný candidate-v8 `f8ccb516ea741d033bce4a0a039db34243630ac827c152252f4b29c2dea78ce0` zahrnuje nový test;128/128 cílených kontrol a produkční build PASS. Nativní GPU ověření probíhá odděleně v Edge, stav širší přejímky není Done.
