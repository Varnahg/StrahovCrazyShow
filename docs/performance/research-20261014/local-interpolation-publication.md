# Přenos ověřené fáze na publikovaný clock základ

14. 10. 2026, `publish-01a13624-phase-20261014`. Rozhodnutí před zápisem runtime. Základ je `4f41b37fb145e5a00414bf256fd431744b6ba462`, původní phase je pouze předaný delta z wave4. Neopakuje se obecný výzkum: příčiny, varianty a původní red5/1 jsou v archivovaných `game-interpolation-reproduction.md` a `local-interpolation-phase.md`. Historické52 cílených/892 full výsledky nejsou výsledkem tohoto nového mezistavu.

Read-only audit prokázal `git apply --check`: Timeline phase4hunky PASS (offset4), append3 phase testů PASS (offset105), nový Game test PASS. Game8hunk delta má jen dva kontextové konflikty: import vedle chybějícího profileru a phase pole vedle profilerových fields. Zbylých6hunků samostatně PASS. Přenést celý starý Game/Timeline by vrátilo startup/profiler WIP nebo odstranilo `canCalibrate`; to je zamítnutá varianta. Zvolen je původní ověřený delta, dva lokální import/field zásahy a kontrola nezměněného acceptAuthority.

Přesný source/test scope: `client/game.ts`, `client/network-timeline.ts`, nový `tests/game-interpolation.test.ts`, append do `tests/network-timeline.test.ts`, minimální adaptace `tests/room-callbacks.test.ts`. Client-recovery je shodný s wave4 a zůstává read-only. Game nový typ/import + phase field, identity/reconcile invalidace, single pair update, getter a dvě frame-používané interpolace; žádný jiný Game hunk. Timeline pouze typ advanced výsledku a výpočet alpha ze stejného odhadu jako target. Clock eligibility v acceptAuthority a všechny čtyři kalibrační regrese musí zůstat přesně zachované.

Room fixture z publikovaného V11 spouští skutečnou advance metodu z AST; nově proto musí obsahovat také skutečnou AST `updateNetworkPresentation`. TypeScript factory odstraní jen private modifier, tělo helperu není kopírováno ani ručně nahrazeno. Fake planner dostane platný presentation payload pro skutečně vyrobený tick. Všech19 původních room těl, wiring a4 lifecycle případy včetně Scene mocku zůstávají. Ověření tohoto adaptéru není náhradou samostatných skutečných Game phase regresí.

Původní phase/reproduction research a handoffy budou přeneseny byte-exact jako historické podklady; nové výsledky patří jen sem a do nového handoffu/cache. Staré snapshoty/logy, main, dependencies a právě servírovaný candidate se nemění. Cache obsahuje before kopie aktuálního clock základu a přesný přenesený patch. Po stabilních source/test a dokončení vlastních CPU procesů následuje explicitní freeze-ready pro root full checkpoint; agent nestaguje ani necommituje.

Před CPU testy kontrolovat0 Established4186/2581 a nové candidate JSONL. Ověřit nové Game/timeline/clock/room testy, původní related recovery/replay/sender/physics a typy. GPU, plný build/suite, integrace a instalace nejsou v tomto tasku. Lead burst, korekční offsety, resync amplitudy a camera spring zůstávají mimo tento přenos.

## Přenesený výsledek a skutečné ověření

Přenesen původní phase delta, včetně mechanické extrakce obou frame-používaných interpolací. Dva konflikty vyřešeny pouze typovým importem a phase fieldem; zbylých6 Game hunků a4 Timeline hunks aplikovány z ověřených patchů. Celé `acceptAuthority` zůstalo po normalizaci EOL shodné s4f41b37, stejně jako celý předchozí Timeline test prefix. Přesný přenos a before kopie jsou v `.cache/local-interpolation-publication/transfer.json` a souvisejících patchích.

Room fixture používá TypeScript `updateMethodDeclaration` k odstranění pouze `PrivateKeyword`, jinak skutečné parametry/tělo `updateNetworkPresentation`. Žádná ruční kopie algoritmu. Fake planner nyní vrací kompletní advanced výsledek včetně `presentation` pro seq2. Finální AST porovnání potvrdilo nezměněná těla19 původních testů a celý lifecycle loop včetně Scene mocku. Původní Game phase test je byte-exact přenos SHA9365d519…; žádné assertions/tolerance nebyly oslabeny.

Před každým CPU během a závěrem17:33:40UTC bylo0 Established4186/2581 a žádné candidate game-diagnostics. Všechny vlastní procesy skončily; žádný server/browser/GPU/build/fullsuite/instalace se zde nespustil.

| Ověření nového mezistavu | Skutečný výsledek | Evidence v `.cache/local-interpolation-publication/` |
| --- | --- | --- |
| Game interpolation + Timeline včetně clock regresí + room callbacks | **53/53 PASS**, exit0,17:27:38.158–17:27:44.428UTC | `targeted-01.*` |
| network-latency-recovery, client-recovery, prediction-replay, timeline-physics, timeline-sender | **31/31 PASS**, exit0,17:28:32.370–17:29:05.890UTC | `related-01.*` |
| Scoped TypeScript nad8 roots a import/type closure3344souborů, project options, bez emit | **0 diagnostik, exit0**,17:30:43.543–17:31:02.351UTC | `types-01.{log,json}` |

Celkem84 různých cílených PASS. Žádný neúspěšný běh v tomto přenosu, historické red/green artefakty nejsou přepsané. Nezávislý read-only review `/root/repair_network_causes/review_timeline_contract` bez nového konkrétního nálezu; výslovně potvrdil clock/AST/Scene hranice, sám nic nespouštěl. Scoped git diff whitespace kontrola exit0. Plný checkpoint a praktická přejímka zůstávají rootu.

Finální manifest `.cache/local-interpolation-publication/assembly-output.json` má5 source entries a4 byte-exact historické docs; celé SHA `f2bf323ca4d63ee036e635f5e20ec8e636a95ae7061c7795cf04c3a04fad4bfb`, entries SHA `d70a4820d5a30dad9e7c56b2b041e78c584f1c17b4eb86a57c7647458b493885`. Přesný patch proti4f41b37 (včetně nového testu) `feature-against-head.patch` SHA `1f7e6a2f0e0dd4ba1154c4b720e3a64cee503a264a1ff136bab1db256329e97d`. Source/test/assembly zápisy skončily před freeze-ready; další nové docs jejich identitu nemění.
