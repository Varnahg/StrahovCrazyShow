# Automatická diagnostika hraní

Lokální hra zaznamenává diagnostiku automaticky od spuštění stránky. Není potřeba zapínat FPS benchmark ani stahovat export. Běžná automatická kvalita zůstává aktivní. Stav ukládání je vedle FPS a podrobněji v nastavení; „Logy se ukládají“ se zobrazí až po potvrzeném zápisu serverem. Výpadek úložiště nebo spojení přepne stav na čekání a klient dávku opakuje.

Záznamy leží v `.cache/game-diagnostics/` jako JSONL. Automatický sběr funguje pouze na loopback hostu; server přijímá stejný lokální origin a neposkytuje HTTP čtení logů nebo seznam hráčů. Sólo/host neposílá ani nezískává multiplayerovou přítomnost. Obsah chatu, přezdívky, přístupové tokeny, formuláře a obecné stisky kláves nejsou součástí záznamu. Herní poloha a vzhled avatara jsou technický kontext scény.

## Co může agent načíst

```powershell
node scripts/diagnostics-report.mjs
node scripts/diagnostics-report.mjs --all
node scripts/diagnostics-report.mjs --json
node scripts/diagnostics-report.mjs .cache/game-diagnostics/SESSION-UUID.jsonl --json
```

Výchozí report vybírá poslední relaci. JSON zachovává podrobnější kontext; původní JSONL zůstává čitelný pro další analýzu. Report vyznačí neúplné řádky, chybějící sekvence a změnu zdrojového otisku. U stále otevřené relace je chybějící koncová událost očekávaná.

Záznam zahrnuje časové intervaly snímků a CPU/GPU vzorky, FPS a p95/p99, kontext polohy/kamery, rozlišení CSS i renderu, GPU, aktuální kvalitu a její změny, světlo/počasí včetně původu, stav UI, počet avatarů a jejich LOD, vegetaci/dopravu, jízdu/svítilnu, síťové korekce a stav spojení. JS chyby, odmítnuté promise, chyby zdrojů, technické console.warn/error a podporované browserové long-task/long-animation-frame události doplňují herní chyby. Možnosti prohlížeče jsou zaznamenané, chybějící API se nepředstírá.

## Význam měření a limity

- Interval snímku končí na začátku právě vykreslovaného snímku. Zásek proto ukládá předchozí CPU práci a předchozí známý kontext s jeho stářím, odděleně od práce aktuálního snímku. Kontext scény se vzorkuje jednou za sekundu, při zásecích nejvýše čtyřikrát za sekundu; nejde o deterministický replay.
- CPU fáze rozlišují simulaci, svět, avatary/kameru, prostředí, render a popisky. Obloha, světla, vegetace, doprava, částice, povrchy a cinematic jsou podfáze prostředí; nelze je přičíst k prostředí podruhé. Měřená CPU práce nezahrnuje pozdější aktualizaci React HUD, samotný zapisovač ani všechnu práci prohlížeče.
- GPU timer-query výsledky přicházejí asynchronně. Recorder dostává pouze nový výsledek čítače; nepřiřazuje ho s jistotou ke stejnému snímku. Nedostupný GPU čas je `null`. Skutečná karta a rozlišení jsou součástí kontextu, ovladač nemusí být dostupný.
- Skrytou kartu a přechod zpět do hry je nutné odlišovat od záseků při hraní. Globální percentily se počítají z doručených intervalů, nikoli průměrováním percentilů jednotlivých oken.
- Dávky se běžně odesílají každých 5 sekund. Paměťová fronta je omezená; výpadky, zahlcení a příliš velké záznamy mohou vytvořit hlášené mezery. Náhlé ukončení procesu může ztratit dosud neodeslaný konec. Záznam není video, profiler ovladače ani úplná historie každé interní funkce.
- Lokální soubory rotují po 16 MiB; výchozí celkový limit je 128 MiB, nejvýše 256 souborů a stáří 7 dnů. Starší diagnostika může být odstraněna touto retenční politikou. Pro dlouhodobý důkaz je potřeba relevantní relaci uchovat zvlášť.
- Zdrojová identita obsahuje Git HEAD, otisk kódu/konfigurace/testů, příznak dirty a případný produkční snapshot. Dev server a HMR nejsou neměnný produkční checkpoint; binární assety nejsou součástí průběžného otisku. Pro výkonovou přejímku stále platí izolovaný produkční snapshot a srovnatelné měření.

## Podklady

Implementace navazuje na existující `client/game.ts`, `client/adaptive-quality.ts`, `client/benchmark-render-profile.ts` a `server/local-benchmarks.ts` (průzkum 13. 10. 2026). Browserové události vycházejí z primárních specifikací [W3C Long Animation Frames](https://www.w3.org/TR/long-animation-frames/) a [W3C Long Tasks](https://www.w3.org/TR/longtasks-1/). Tyto události poskytují další indicie, samy o sobě neprokazují příčinu konkrétního propadu GPU výkonu.

Skutečné ověření této změny a jeho omezení zaznamenává předání `docs/agents/handoffs/automatic-diagnostics-integration.md` a `docs/verification.md`.
