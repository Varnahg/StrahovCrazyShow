# Převzetí historického replay nástroje do main · 29.10.2026

- Task `main-replay-consolidation-20261029`, vlastník `consolidate-replay-01a189cd`; přímé zadání root koordinátora, bez dalšího BMAD workflow.
- Cwd `D:/CodexWorkspaces/StrahovCrazyShow-main-20261027`, základ `9fbc76477bfd941bc3a71bc8dbc5ad645af4ebd2`. Zdroj přesně `eb7624b6fb114c9d3de7afd547a8ca503b2c06cf`.
- Před zápisem úspěšný claim. Žádný cizí WIP, produkční zdroj, task JSON, společná verification, závislosti ani Git index nebyly změněné. Cizí koordinační/evidenční zápisy rootu zůstaly mimo scope.

## Převzatý výsledek a nezbytné adaptace

Importováno 34 původních additive souborů (3 243 459 bajtů) přes `git show` jako binární bajty. Seznam a SHA-256 každého importu jsou v `.cache/main-replay-consolidation-20261029/import-manifest.json`. Tři původní task JSON a append společné verification přebírá root samostatně. Historické handoffy, specifikace, evidence, obě časové fixtures a kompilátor záznamů zůstávají původními bajty.

Z pěti importovaných souborů vznikla nutná úprava pro současný main: `tests/replay/run.mjs`, `browser-entry.ts`, `replay.mjs`, `README.md` a `tests/recorded-walkthrough-replay.test.ts`. Přibyl čistě testový `tests/replay/runner-config.mjs` a toto předání.

1. Původní UI dovolovalo zvolit hosta; Jantar nabízí pouze multiplayer. Replay přitom síť správně odmítá. Zvolený Vite plugin upraví jediný přesně identifikovaný `enter("multi")` na `enter("guest")` pouze v testovém buildu. Ověří původní bootstrap a jediný HTML head; při změně či duplicitě kontraktu selže. Alternativní změna produkčního launcheru by zbytečně rozšířila rozsah, přímé vytvoření Game by vynechalo současný skutečný UI lifecycle.
2. Původní API runner dědil provider/feedback konfiguraci a STATIC_DIR. Nová cesta používá stávající `createIsolatedIntegrationEnvironment`, vlastní spool a loopback HOST/2568, odstraní STATIC_DIR a VITE proměnné. Vite test build nečte `.env`; compile-time multiplayer endpoint je vlastní preview proxy. Nevzniká druhý provider filtr.
3. Produkce nyní automaticky preferuje WebGPU/fallback, zatímco starý replay považoval chybějící parametr za WebGL2. Replay vyžaduje jednu explicitní volbu a ověřuje také WebGPU CM proti NCM. Nelze tak vydat downgrade za přijetí požadovaného backendu.
4. Čtecí vyhodnocení všech původních bodů prokázalo změnu 83/584 popisků B6: současný CAD vrací `b06:n01` až `b06:n05`, záznam `b6:0` až `b6:4`. Report zachovává `recordedZones`, přidává z původních souřadnic a aktuálního `zoneAt` odvozené `expectedZones` a `changedZoneSamples`; dokončení vyžaduje pokrytí všech aktuálních zón trasy. Venkovní trasa má 0 změněných popisků. Žádné souřadnice ani historické fixture SHA se neopravují podle dnešního světa.
5. Zdrojový manifest doplněn o Babylon patches a pnpm/workspace konfiguraci, aby změna native patchů nezůstala mimo stale-build kontrolu. Samostatné `--help` nevytváří výstupy ani procesy. Duplicitní/neznámé či protichůdné CLI volby se odmítají.

Refaktoring odděluje čisté CLI/build/environment funkce od top-level runneru, takže je lze ověřit bez serveru a buildu. Report odvozuje zóny jednou před přehráním, nikoli opakovaně na konci snímků. Nejsou přidané produktové cache, scene resources ani per-frame backend výpočty.

## Skutečné ověření

Finální `node --import tsx --test tests/recorded-walkthrough-recording.test.ts tests/recorded-walkthrough-replay.test.ts`: **30/30 PASS**, 0 fail/cancel/skip/todo, 1734.6198 ms. Zahrnuje 25 zachovaných původních testů a 5 cílených regresí: izolované prostředí, fail-closed transform nad skutečným současným Jantar zdrojem/HTML, CLI, backend/CM/NCM a CAD zóny se zachováním původních dat. Venkovní fixture se znovu přesně kompiluje z existujícího gzip zdroje a ověřuje SHA.

`node --check` pro `run.mjs`, `runner-config.mjs`, `replay.mjs` všechny exit 0. Skutečné `node tests/replay/run.mjs --help` exit 0 a před/po ověřeno, že nevznikla `.cache/recorded-walkthrough`. Strojový souhrn a původní logy jsou v `.cache/main-replay-consolidation-20261029/{verification.json,targeted.log,runner-syntax.log,config-syntax.log,replay-syntax.log,help.log}`.

Závislosti se neměnily; přímý Node čte existující moduly, nepoužívá `pnpm exec` s odmítnutým junction instalátorem.

## Hranice a navazující práce

Žádný build, celá sada testů, server, prohlížeč, GPU ani plný TypeScript check nebyl spuštěn. Historické logy z roku/dne původního přijetí nejsou současná validace. Root má ověřit build a skutečný testový Vite transform, oba průchody a negativní kontrolu podle samostatné rezervace. Runtime runner zapisuje do `.cache/recorded-walkthrough/` a používá porty 4291/2568; před jeho spuštěním rezervovat tyto cesty a heavy/build/GPU zdroje. Normální produkce neimportuje žádný testový bootstrap ani guest transform.

Přehrání stále prokazuje pouze rekonstruovaný render, ne lidské vstupy, kolize, síť, historické FPS či dokončení KEY-49. Main může zachovat tento rozpracovaný nástroj, aniž by jej označil za GPU přijatý.

Žádné vlastní dlouhožijící procesy nezůstaly. Staging/commit a přijetí provádí root. Claim se po tomto předání uvolní; jeho úspěšné uvolnění dokládá registr, nikoli tento text.

## Oprava nezávislého review · 30.10.2026

Root předal jediný P2: runner servíroval mutable `public`, ale report přijímal pouze podle původního klientského hashe. Původní autor reclaimnul stejný task s doloženým `--adopt-dirty` (36 vlastních cest). Řešení znovu používá totožný manifest při buildu, startu i těsně před uložením reportu; nepřidává kopii assetů ani per-frame hashování. Kontrola public navíc odmítne ignorované servírované soubory. Při rozdílu zdrojů/public nebo chybě manifestu nevznikne žádný report soubor; při úspěchu server připojí `sourceRevalidated` a `publicGitTree`. Klient při neúspěšném uložení/revalidaci přejde na `failed`, neuchovává zdánlivě přijaté `complete`.

Manifest a ověřený zápis byly přesunuty do testovatelného `runner-config.mjs`; runner používá jedinou společnou cestu. Nový test vytvoří malý vlastní Git fixture pod rezervovanou cache a skutečně vyzkouší původní úspěch, změnu client zdroje, změnu tracked public bajtů, nový commit s jiným public stromem a ignorovaný servírovaný soubor. Každý odmítnutý případ ověřuje absenci souboru potvrzujícího přijetí. Vlastní dočasný fixture repozitář se po ověření odstraní po kontrole resolved cesty uvnitř rezervované cache.

Finální cílené testy po opravě: **31/31 PASS**, 0 fail/cancel/skip/todo, 7563.798 ms (`targeted-review-fix.log`). Tři syntax kontroly a `--help` znovu exit 0. Žádný build/server/GPU/full suite nebyl spuštěn. Koncová revalidace nezaručuje detekci transientní editace navrácené před uložením; po dobu testu nadále platí neměnnost servírovaných vstupů. Oprava nezvyšuje historické GPU důkazy na současné přijetí.
