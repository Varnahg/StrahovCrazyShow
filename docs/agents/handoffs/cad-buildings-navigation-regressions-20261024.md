# Předání: cad-buildings-navigation-regressions-20261024

- Vlastník: `cad-buildings-01a16b37-navigation-regressions`; příjemce: root koordinátor.
- Worktree: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b1-playtest-20261024`. HEAD při předání: `dea1b67fa27d1ccebc7b7f422e585305aeafdb45`. Vlastní změny nejsou staged ani commitnuté.
- Změněné soubory: `client/map-navigation.ts`, `client/navigation-physics.ts`, `tests/map-navigation.test.ts`, `tests/static-submesh-chunks.test.ts`, toto předání a vlastní tasková cache. Před rozšířením o navigation-physics byl původní claim skutečně uvolněn a nový scope následně znovu rezervován. Žádný cizí WIP nebyl převzat nebo upraven.

## Výzkum a volba

První fullsuite log doložil dvě různé příčiny. Clearance nebyla pouze stará fixture: produkční query stále používala radius 0,43 + margin 0,01 pro původní Actor radius 0,42, zatímco aktuální Actor používá radius 0,25, halfHeight 0,55 a KCC offset 0,02. Pouhé přepsání očekávání by skrylo odmítání skutečných průchodů. Nové testy před opravou skutečně selhaly na šířkovém kontraktu i na headroom 1,64 m, který Actor prošel a planner odmítl.

Navigace B6 používala původní `B6_LAYOUT.approachRoute[0]`. Přijatý `CAD_B6_ENTRY` již obsahuje světové souřadnice skutečného vstupního ramene. Cíl je nyní 0,60 m před jeho první hranou ve směru opačném k výstupu, bez další transformace. Aktuální endpoint je X −5,7221290934 / Z −82,1293764055. Hodnota se počítá jednou; každý návrat kopíruje bod, aby volající nezměnil cache.

Pre-K5 terrain fixture má původních 57 050 vrcholů; aktuální zdrojový terén po záměrných CAD výřezech a vstupních sklonech měl 55 918. Aktualizace historických hashů by jen změnila baseline a neprokázala samotný invariant chunkingu. Zvolený test zachytí nezávislé kopie dokončených vstupních bufferů všech jedenácti skutečných builder meshů při `freezeWorldMatrix`, těsně před `chunkStaticMesh`; kontroluje, že source master v tu chvíli ještě neexistuje. Poté vyžaduje přesné zachování geometry/VBO identity, každého atributového bajtu, počtů a rekonstruovaných původních indexů včetně windingu. Očekává právě všech jedenáct pojmenovaných výstupů a žádný další chunkovaný mesh. Původní JSON je beze změny a slouží jako historický záznam i seznam těchto výstupů; jeho staré geometrické hashe už nepředstírají aktuální CAD geometrii.

## Implementace a refaktoring

`NAVIGATION_CLEARANCE` odvozuje radius a horní obálku z `CHARACTER_RADIUS` a `CHARACTER_HALF_HEIGHT`. Radius query 0,26 + margin 0,01 odpovídá 0,25 + offset 0,02. Celková horní mez je 1,62 m; spodní mez zkrácené torso query zůstává na 0,22 m pro autostep. HalfHeight 0,43 a centreHeight 0,92 se odvozují z těchto mezí. Sampling podpůrných výšek, slope/step limity, query filtr, cache a lifecycle controlleru zůstávají. Nevznikl druhý fyzikální svět ani nový per-frame výpočet.

Testový mock pro zachycení meshů se obnovuje hned po stavbě i v `finally`; scéna a NullEngine se vždy uvolní. Produkční chunker ani terrain fixture nebyly změněny. Testy chrání i mutaci vráceného navigačního bodu a šířkové/výškové hranice skutečného Actoru, nikoli jen číselnou definici planneru.

## Skutečné ověření

- `pnpm exec tsx --test --test-name-pattern 'clearance envelope|clearance agrees' tests/map-navigation.test.ts` před opravou: **2 FAIL**, exit 1; `clearance-red.log`.
- Po opravě cílený test policy/envelope/KCC: **3/3 PASS**, exit 0; `clearance-green.log`.
- `pnpm exec tsx --test --test-concurrency=1 tests/map-navigation.test.ts tests/static-submesh-chunks.test.ts`: **19/19 PASS**, bez skip, exit 0, **23,215 s**; `targeted-tests.log`.
- Skutečný Actor prošel ze SPAWN bez teleportování k novému B6 CAD approach a původním čtyřem cílům. B6 konečná odchylka 0,0502 m, 3422 ticků. Sync/async planning dává shodné trasy. Nejde o GPU měření nebo celý multiplayerový průchod.
- Průchody 0,52 / 0,56 m a headroom 1,60 / 1,64 m dávají shodný negativní/pozitivní výsledek planneru a Actoru. Portály 0,70 / 0,87 / 0,94 m jsou průchozí. Původní step/slope negativní i pozitivní případy zůstávají.
- Všech jedenáct aktuálních terrain/road/landcover meshů prošlo přesnou před/po kontrolou chunkingu. `git diff --check` prošel.

Logy a `source-sha256.json` jsou v `.cache/cad-buildings-20261024/cad-buildings-navigation-regressions-20261024/`.

| Soubor | SHA-256 |
| --- | --- |
| client/map-navigation.ts | `a0842397146f285228edbcc936fd699ec5d5732ac49d75dba27b1fd2fec8a2c8` |
| client/navigation-physics.ts | `10854d8ffa4d66d741eb71c710576c3ce84028f1c70d1535151a85473083185b` |
| tests/map-navigation.test.ts | `668e262921c23cc8cf6ebcfc065006469f6c0b493fa0b57ae2c671aabedeb515` |
| tests/static-submesh-chunks.test.ts | `6d45786d9e2fe3f3f44a7f56dece143a32c79c03b7921d264ed5e3edd0b73bd2` |
| historická fixture, beze změny | `751a0317f2e01ca38cd0f2babc7a6b86e22e18b3fb48fd20b6266ca26d49dba6` |

Všechny vlastní procesy skončily. Neběžela plná sada, build, server, Blender nebo GPU; frozen runtime v1 se neměnil. Root zajišťuje společnou přejímku po svých souběžných opravách Actoru a integraci. Po tomto předání se rezervace uvolňuje; root může převzít pouze tyto doložené vlastní změny.
