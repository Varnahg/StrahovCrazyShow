# Samostatný diagnostický základ — 14. 10. 2026

Tento celek odděluje již používaný automatický recorder, lokální collector, čtečku záznamů a základ render-incident profilu ze staršího wave3 WIP. Je první samostatnou závislostí před atomickým V11 feature a novým phase fixem; neobsahuje Game/UI síťové ani startup/render/light/editor optimalizace.

## Zdroj a rozsah

Čistý základ `e215bf4fe5e7c148d806207f82ae6b849895fdd6`, právě14 source/test změn.13 souborů je byte-identických se zmrazenou wave3, server/index má jen collector import, konstrukci handleru a HTTP dispatch. BenchmarkRenderProfile přidává pouze volitelný callback vyžadovaný RenderIncidentProfile. Game/UI/netcode/respawn/render-cost/cinematic i package/lock/tsconfig a původní benchmark test jsou shodné se základním commitem.

Snapshot `9877f891566af3ec6bb035d2f09de7d18ae2bea4d7e9158434fae22aae3060be`:8372 vstupů/475 source-config-test. Mimo schválených14 souborů byla každá zdrojová kopie porovnána také s Git blobem HEAD, nejen s dirty pracovním stromem. Použité neměnné asset reference pocházejí z ověřeného baseline f2705e4…; Git public/assets se od91ee88f do e215bf4 nezměnily. LFS pointery nebyly vydávané za skutečné modely.

## Ověření

- Vlastní frozen install bez změny locku;50/50 cílených testů a projektové tsc0 diagnostik.
- **Celá samostatně sestavená hra:750/750 testů, build a plná pnpm test:integration PASS.** Viz [pipeline.jsonl](pipeline.jsonl) a [checkpoint.json](checkpoint.json).
- Po validaci475/475 source hashů shodných; integrační2568 bez listeneru. Vlastní procesy ukončené, žádný browser/GPU měřicí proces.
- První příprava inventáře překročila výstupní buffer neomezeného git ls-tree (ENOBUFS) ještě před vytvořením kandidáta. Opraveno omezením dotazu na přesné source/config/test roots a bounded buffer; původní chyba uložená v cache. Nešlo o chybu hry ani zaměněný testový výsledek.

Raw logy, input/assembly manifesty, procesní identity a kompletní snapshot jsou v `.cache/wave3-diagnostics-publication/` a `.cache/wave3-diagnostics-validation/`; provozní PID se necommitují. Hraný B6 build4186/API2581 se neměnil. Před náročnými kroky nebyla připojená herní relace ani nový JSONL.

## Hranice

Tento infrastrukturní feature není celé Game FPS/context napojení, V11 ani dokončení oprav hry. Je samostatně typově/testově uzavřený základ. Neprokazuje GPU výkon; samotné nové rozdělení nemění dřívější uživatelské výsledky wave3. Při začlenění do main zachovat další rozpracované serverové hunks a všechny cizí změny; nesmí se kopírovat celý zdejší server přes hlavní WIP.
