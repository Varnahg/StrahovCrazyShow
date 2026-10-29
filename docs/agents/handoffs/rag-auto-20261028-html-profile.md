# Předání: rag-auto-20261028-html-profile

- Vlastník `rag-html-profile-01a17e9d`, příjemce `/root`, KEY-67. Pracovní kopie `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`.
- Samostatný heavy claim získán až po výslovném root GO a potvrzeném release předchozího vlastníka. Source změny patří oddělenému extraction tasku `rag-html-refactor-01a17e9d`; během měření se neměnily.
- Výsledek: tři povolené zpracovací procesy A/B/A dokončené, bez timeoutu/chyby. Celý normalizovaný výstup je shodný. Přímý HTML kandidát byl v tomto omezeném instrumentovaném vzorku rychlejší; nejde o obecnou přejímku výkonu ingestu nebo ostatních formátů.

## Připnuté vstupy a procesy

Původní HTML: `.cache/rag-auto-20261028/source-probe-9FBMrk/source.html`, 45088 bajtů, SHA256 **`c4629e7f1fa683c09e9949b80bc826adae1e145f607aae74c978d703a818dc9f`**. Původní request a limity byly převzaty z `extract-request-2.json`; měnila se pouze lokální cesta totožných bytes a výlučný workDir. Žádná změna selectorů, MIME, title/sourceId, kvalitativních guardů, tokenizeru nebo velikosti chunků.

A je byte-identická kopie runtime Python package z commitu `0ff4209cfbf854066530c8ee4802f3f2ede81770`; B je frozen kandidát ze source manifestu `.cache/rag-auto-extraction-20261028/html-refactor-manifest.json`. Obě kopie vznikly pouze ve validační cache. Kandidátní hashe: docling_adapter `b1e81607b98e3a9b4fcf0f4e8c96b945f5c1bbdf08221dd72a4e1bc80af4036f`, worker `5918e79572903477dcc65ca7c59b987b79d3c33a4401244f9bbf2a210e9ddc60`, test `c58d56571a00d7ee622ccb88f21617d44c1f4d162c90060e425914069e8fa3ff`. Úplné obě source sady a jejich hashe jsou v `source-checkpoints.json`.

Použit výhradně stávající `.cache/rag-auto-extraction-20261028/venv/Scripts/python.exe`. Jeden nový Python proces na vzorek přímo zavolal skutečný `process_runtime.child` včetně offline/secret/logging boundary. Nadřazený Node vlastnil hard deadline 150 s; nedošlo k dalším vnořeným processing procesům. Parser request měl stále původní timeoutSeconds90. Měřicí harness zachycuje celý worker target a vnější spawn, nikoli dodatečný Python rodič produkčního CLI.

| Pořadí | PID | UTC začátek → konec | Vnější wall | Profilovaný worker wall | Spawn + počáteční bootstrap |
| --- | --- | --- | ---: | ---: | ---: |
| A1 | 62672 | 21:53:09.418 → 21:53:32.238 | 22,818 s | 21,374 s | 0,263 s |
| B | 8556 | 21:53:32.261 → 21:53:49.090 | 16,828 s | 15,797 s | 0,217 s |
| A2 | 62640 | 21:53:49.110 → 21:54:10.964 | 21,854 s | 20,481 s | 0,178 s |

Všechny exit0, žádný timeout. Ledger `.cache/rag-auto-html-profile-20261028/budget.json` zachovává všechny tři rezervace/starty/PID/výsledky a odmítá automatické nové spuštění stejného checkpointu. Následná analýza pouze četla již uložené pstats; žádný další worker nebo nové zpracování HTML se neopakovalo.

## Obsahová parita a interpretace času

Všechny výsledky byly strukturálně a textově porovnány i s původním uloženým CLI výsledkem. Shoduje se celý JSON kromě `parserProfile`: bloky, text, nadpisy, spans, IDs, chunky/tokenCount, quality, odkazy a envelope. Každý výstup má 74 bloků, 71 chunků, 1553 znaků, 27 odkazů a stejné `review-required`, `complete:false`, `unrepresented-image`. Semantický SHA je ve všech bězích **`f316d1749d2517cddc1d8fcacf743e543be47e4d4eae07f709b42a7c0051116e`**.

V parserProfile jsou stejné packages, label, modelManifestHash i tokenizer. Liší se pouze očekávaný configurationHash s implementation fingerprintem kandidáta; oba A běhy mají stejný fingerprint. Zachování obsahu není důkaz, že partnerská loga byla textově vyjádřena nebo že tento hub lze automaticky publikovat.

B bylo o 26,25 % rychlejší než A1 a o 23,00 % než A2, proti průměru obou A o 24,66 %. Jde o tři instrumentované fresh procesy na jednom stroji a jednom HTML, s jediným B vzorkem. Není to p95, obecné optimum ani měření produkčního corpus. Původních neinstrumentovaných 65,8 s není kontrolní základ tohoto porovnání; stav OS cache a jiná hostitelská práce se mohou lišit.

Dochované fázové důkazy:

- Všechny distribution metadata API reads včetně knihovních importů: A1/A2 622 volání (1,375/1,265 s inclusive), B325 (0,466 s). Samotný B package_versions helper má 0,156 s inclusive. Tato čísla nejsou samostatně přičitatelná k importnímu času.
- Backend konstrukce přibližně 18 ms ve všech třech bězích; skutečný HTML backend.convert přibližně 101/88/87 ms, normalizace 9,73/9,42/9,09 ms a chunkování 7,45/7,39/8,47 ms. Rozdíl není ve zjednodušení dokumentu.
- Vlastní čas kompilace Python kódu: 7,132/5,179/6,766 s; filesystem stat: 2,148/1,669/2,097 s. Tyto agregáty ukazují význam importního/startup režimu, ne cenu konkrétní jediné knihovny.
- Přímý kandidát skutečně zavolal backend.unload jednou; původní běhy takový call nezaznamenaly. Zdrojové unit testy zvlášť prokazují uzavření streamu i při chybách.

**Omezení profileru:** některé dlouho aktivní/importní frame entries (worker.run/adapter.convert a některé module imports) v uložených cProfile datech chybějí. První mechanická sumarizace je reprezentovala 0 calls; to není nulový naměřený čas. Původní raw reporty se nepřepisovaly. Následný `analysis.json` označuje tyto fáze `not-collected`/null a rozlišuje je od skutečně nepoužitých cest. Úplná přímá atribuce času všech importů tedy zůstává omezením; žádné nové processing pokusy se kvůli tomu nedělaly.

## Artefakty, cleanup a předání

Všechny baseline/candidate kopie, input kopie, requesty, výsledky, raw pstats, stdout/stderr a receipts jsou pouze v `.cache/rag-auto-html-profile-20261028/aba-WagEuR/`. Relevantní soubory: `source-checkpoints.json`, `summary.json`, **`analysis.json`**, podsložky `A1`, `B`, `A2`. Harnessy a ledger jsou v nadřazené vlastněné validační cache. Žádný originál ani venv se nepřepisoval; žádná síť/API, instalace, DB, GPU, modelová inference, build nebo hraná služba.

Všechny vlastněné worker procesy skončily a Node helper skončil exit0. Čerstvá kontrola Win32_Process nenašla Python příkaz s validačním prefixem. Žádný cizí proces nebyl ukončen. Po tomto předání se heavy rezervace uvolní; samotný source refaktor, jeho testy a následnou integraci přebírá root podle extraction handoffu.
