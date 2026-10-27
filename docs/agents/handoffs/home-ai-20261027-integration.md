# Předání UI integrace home-ai-20261027

- Vlastník/příjemce: `home-ai-ui-entry-01a17e9d`, root téhož uživatelského zadání.
- Worktree: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, `codex/clean-home-crazy-typka`; převzatá dependency `a9a1e3b5f15a2cee037117752230d5d8b3200c72`, aktuální base `752e75fd41b455db7e22453b881eb5f62bc283f0`.
- Soubory: `client/ui.tsx`, `tests/game-render-engine.test.ts`, `tests/room-callbacks.test.ts`, toto předání. Hlavní integrační commit `2ca089fb88e3dcac416c31f2013b22701adf01ab`.
- Úvod používá WelcomeScreen; editor se otevírá explicitně. Loader sleduje konkrétní canvas a skutečné milníky, před synchronní konstrukcí dá cancel-safe double-rAF prostor pro paint. Zachovány nové generace canvasu, fallback notice, ruční WebGL2 recovery a původní Game readiness.
- AI store žije jednou v App; vlastní AI panel dostupný na úvodu i v herním chatu. Lidské DM/event navigace sdílejí openHumanChat a z AI přepnou správně do lidského kanálu. Žádný zápis do hráčského modelu ani lidských zpráv.
- Cizí WIP: pouze výslovně předané a předtím ověřené dependency commity; původní primary checkout a hraný4182 se neměnily. Předání původního vlastníka viz trees-20261025-integration.md.
- Refaktoring: soustředěná volba lidského chatu, jeden AI lifecycle, cancel/observer cleanup, odložené mountování editoru. Netvrdí se zrychlení startupu ani GPU výkonu.
- Ověření: actual-effect Game16 + Room48 v kombinované finální sadě159/159 PASS; předchozí samostatná Room regrese48/48 PASS. Testy drží původní lifecycle assertions a rozšiřují prezentaci/propojení.
- Praktická kontrola úvodu v produkčním HTTP buildu a síťová integrace mají společné [předání validace](home-ai-20261027-validation.md). 3D startup a panel nad běžící scénou nebyly spuštěny, protože GPU/hra nebyly v tomto okně povolené. Jednotky se za takový důkaz nevydávají.
- Žádný vlastní UI proces; preview vlastní samostatný validační task. Claim zůstává držen do integračního dokončení.
