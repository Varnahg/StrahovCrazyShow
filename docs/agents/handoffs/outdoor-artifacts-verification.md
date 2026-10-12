# Předání: outdoor-artifacts-verification

Vlastník: outdoor-01a12fcf (thread 01a12fcf-0296-73c2-8d5e-a54d30c193f2), původní autor této práce a integrátor tří disjunktních podagentů. Hlavní checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, main, základ 918a59ce63d7ba7c3a97c209a739cd59a4e00475.

Průběžné předání při rozšíření rezervace: runtime 202 objektů dokončen, snapshot A `9dc61cd8077338809a81a9d79a0695409b0d92a7783cd38b882a01832467d624` obsahuje 8313 souborů včetně testů. Plná sada 644/646; dvě známá selhání graphics.test.ts jsou rozpracované počasí, jeho vlastník je převzal. Build A exit 0. Původní logy jsou v `docs/verification-evidence/outdoor-artifacts-20261012/`.

Původní vlastní procesy byly spuštěny v tomto tasku přes exec: pnpm dev:client (main, 5173, Vite PID44668), pnpm dev:server (main, 2567, poslední server PID31844, watcher34344), pnpm exec vite --host127.0.0.1 --port5175 --strictPort (snapshot A, PID36608). Všechny tři byly ukončeny Ctrl+C do jejich vlastních exec relací 13643/31401/30603 před obnovením rezervace. GPU tab1 byl již uzavřen. Cizí 4179/2570/5191 nebyly měněny.

Nyní je domluvené rozšíření na shared/netcode.ts a snapshot B pro protokol10 kvůli novým kolizím. Původní počasí změny v game/world-renderer zachovány; nedošlo k převzetí jejich autorství. Finální ověření, omezení a uvolnění zdrojů doplním po dokončení B.

## Finální předání B

Implementace a praktické ověření jsou dokončené. Příjemce: vlastník počasí `01a12fcb-4233-70c0-bc2d-95fc261f870c`, který provede další společnou publikaci; hlavní preview ani jeho dist nebyly přepisované.

- Snapshot **66296696199597061021f234678f122ca46756137e8d442b2a66c3b1fdfd1d0a**, 8313 souborů, protokol **10**. Celá sada **646/648**, výhradně dvě známá weather selhání v graphics.test.ts. Build exit0 a izolovaná integrace exit0 včetně 12 účastníků, starého protokolu, hosta, řízení fyzického auta a backlog recovery.
- Zdrojové moduly: `shared/outdoor-artifacts.ts`, `shared/outdoor-landmarks.ts`, `shared/outdoor-world.ts`, `shared/data/outdoor-artifacts.json`, `shared/simulation.ts`, `shared/netcode.ts`; renderer/UI `client/outdoor-artifacts.ts`, `client/map-artifacts.tsx`, `client/minimap.tsx`, `client/minimap.css`; explicitní integrace outdoor update/dispose/stats + far plane1100 v `client/game.ts`, create v `client/world-renderer.ts`. Původní souběžné weather patche v těchto dvou souborech zachovány.
- Testy: `tests/outdoor-artifacts.test.ts`, `tests/outdoor-artifacts-renderer.test.ts`, `tests/outdoor-landmarks.test.ts`, `tests/outdoor-world.test.ts`, `tests/map-artifacts.test.ts`. `tests/netcode.test.ts` se neměnil; existující skutečný integrační scénář ověřuje i předchozí protokol.
- Generátor `scripts/fetch-outdoor-artifacts.mjs`; primární podklady a evidence `docs/reality-pack/outdoor-artifacts/`; diagnostika `docs/verification/outdoor-artifacts.html` a `.tsx`; kompletní výsledek v `docs/verification-evidence/outdoor-artifacts-20261012/README.md`, logy a snímky v `final-b/`. Společný `docs/verification.md` doplněn pouze vlastní sekcí a odkazem na koordinátor; vegetační audit zachován.
- Cílený refaktoring: sdílená keš CPU geometrie, společný transform/collider plán, opakované nohy laviček/stolů, předindexované stromy, dávkování materiál/objekt/LOD, renderer bez alokací v update, samostatné scénové prostředky a ověřené idempotentní dispose, memoizovaná mapová vrstva.
- Praktické QA: Intel UHD630, medium, 1280×720 CSS i interně; traktor, rozhledna, stůl, tabule, kontejner a zdrojová mapa bez render/asset chyb; A−600px/D+599px, skutečný kontakt postavy se stolem; B6 tam/zpět18/18. Žádný nový FPS benchmark. Plná fotografická věrnost a všechny kandidátní objekty nejsou tvrzené.
- Kontrola8313 frozen souborů a18 dotčených live zdrojů po ověření: **0 odchylek** (`final-b/source-check.json`). Nepřenáší se na pozdější weather změny mimo tuto kontrolu.
- Finální Vite5175 ze snapshotuB byl spuštěn a ukončen v exec relaci75800, GPU tab2 zavřen; wrapper ukončil2568. Síťový výpis po úklidu nepotvrdil žádný poslouchající2567/2568/5173/5175. Cizí5191/4179/2570 se neměnily.

Rezervace bude uvolněna bez dalších změn runtime po zápisu tohoto předání; stav `done` převezme integrátor podle výsledků. Známé dvě weather chyby i původní checkpointA zůstávají v evidenci a nejsou vydávané za PASS.
