# Předání: isolate-recorder-context-20261014

- Vlastník: `key19-recorder-context-20261014`; příjemce: root koordinátor.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/key17-ownership-integration/StrahovCrazyShow`, detached metadata `2c7aec924c7f24f2f129c1c4343305c2d9fbffcc`, explicitně předaný publikovaný obsah main `f4f6116c643bf001702f1b96331a3088d1717b08` v přidělených souborech. Cizí WIP v hlavním checkoutu není součástí převzetí.
- Rozsah: `client/session-diagnostics.ts`, `tests/session-diagnostics.test.ts`, toto předání a `.cache/recorder-context-feature/`. Žádná změna Game/UI, protokolu, instalovaných závislostí ani běžících preview.

## Výzkum a rozhodnutí před implementací — 14. 10. 2026

Primární podklady: aktuální `client/session-diagnostics.ts` (`recordFrame`, `event`, `finishWindow`, browser lifecycle, `dispose`), jeho injektované transportní testy, `shared/session-diagnostics.ts` (bounded sanitizer/wire validator), a volání `mode-change`, `network-connected`, `network-disconnected` v aktuálním `client/ui.tsx`. Babylon 9.30.0 `node_modules/@babylonjs/core/Engines/Extensions/engine.query.pure.js` vyhodnocuje dostupnost query a inkrementuje GPU counter až pro dostupný výsledek; údaj tedy není synchronní GPU doba právě zpracovaného CPU snímku.

Doložený mechanismus: recorder cacheuje sanitizovaný kontext 1000 ms při běžných snímcích a 250 ms při hitchi. Lifecycle event cache ani předchozí snímek neruší; jejich data tak mohou přežít přechod multiplayer → host a běžné frame-window může zahrnout snímky různých relací. Výjimka context factory navíc ponechá předchozí context. Globální event limit je 100/s a hitch limit 4/s; reset provedený až po event limitu by mohl být potlačen. Historické okno se musí dokončit před zneplatněním, aby jeho skutečná data zůstala zachována. Nejde o důkaz konkrétního vizuálního nebo síťového zpomalení.

Porovnané varianty:

| Varianta | Náklady, vazby a rizika | Rozhodnutí |
| --- | --- | --- |
| Vzorkovat context každým snímkem | Odstraní zpoždění cache, ale navyšuje alokace/sanitizaci na hot path; nespravuje previousFrame ani okna mezi relacemi | Zamítnuta |
| Založit celý recorder na každou Game/room relaci | Trhá souvislý log a receipt/queue lifecycle, přidává timery a transportní stav | Zamítnuta |
| Přidat epochu do každého frame payloadu | Robustní identita, ale širší API/wire změna a kontrola všech producentů; pro známé explicitní lifecycle hranice není nutná | Nyní odložena |
| Pouze lifecycle event po rate limitu | Malá změna, ale při event stormu zůstane starý kontext | Zamítnuta |
| Jediný explicitní `resetFrameContext()` a známé event hranice před rate limitem | Ukončí staré okno, vyprázdní cache a previousFrame; Game může volat i při přímém resetu/dispose. Zachová transport, seq, drop accounting a globální limity | Vybrána |

Reset ponechá event/hitch rate limity, aby opakované hranice nezvýšily povolenou frekvenci. Nezmění vzhled, simulaci, síťové frontiers, scene cache ani renderer. O(1) vyprázdnění contextu probíhá jen na hranicích; dokončení již existujícího okna využije původní bounded serializaci. Výjimka factory nově nastaví prázdný current context a zaznamená technickou chybu; tím nepředstírá platné aktuální informace. Starý historický context je přípustný pouze u skutečně předchozího snímku téže relace, nikdy přes reset.

Ověření bude používat skutečné JSON POST bodies a sdílený wire validator: rychlý multiplayer → guest přechod, event storm, přímé/repetitivní resety, factory výjimky a vypnutý recorder. Red/green důkaz se zaznamená před předáním. Nejde o GPU ani browserové měření výkonu.

## Výsledek a ověření

Implementační celek připraven k převzetí koordinátorem. `resetFrameContext()` ukončí historické okno právě jednou a zruší sampledContext, contextAt i previousFrame. Známé lifecycle události jsou sladěné s `CLOCK_BOUNDARIES` v offline reportu. Reset nastává před event-rate rozhodnutím. Pokud event limit samotnou boundary událost vyřadí, rezervuje se její vynechané `seq`; KEY-18 report přeruší porovnání již před následujícím kontextem, místo až u pozdějšího `recording-gap`. Nevzniká nový event, bypass limitu, timer ani wire pole. Tento doplněk byl předem domluven s koordinátorem.

Samotný veřejný reset není archivní marker. Game/UI vlastník musí stále emitovat skutečnou boundary událost, zejména při přímém opuštění a dispose; root tuto integraci delegoval. Základní i opakované resety nezvyšují globální event/hitch budget. `gpuTiming` v `session-start` a komentář `DiagnosticFrame.gpuMs` explicitně uvádějí nově dostupný asynchronní GPU výsledek, nikoli přesně odpovídající aktuální CPU frame.

### Skutečné kontroly

- RED před runtime změnou: `pnpm exec tsx --test tests/session-diagnostics.test.ts`, 25 testů: 20 původních PASS, 5 nových FAIL. První reprodukuje skutečnou cache chybu (`snapshots` 0 místo 1 při změně relace); ostatní vyžadují chybějící explicitní API. Log `.cache/recorder-context-feature/red.log`.
- RED dalšího report testu před implementací: chybějící `resetFrameContext`; `.cache/recorder-context-feature/red-report.log`.
- Mutation RED po implementaci: pouze dočasně odstraněna rezervace sequence při dropped boundary. Skutečné serializované room counters 100 → 900 se v reportu chybně spojily (`comparableIntervals` 1 místo 0). Exit 1; `.cache/recorder-context-feature/red-missing-sequence.log`. Zdroj obnoven v `finally` a ověřen jeho původní SHA. Mutation nebyla ponechána.
- GREEN finální: `pnpm exec tsx --test tests/session-diagnostics.test.ts tests/diagnostics-report.test.ts`, 2026-10-14 21:09 UTC, exit 0, **55/55 PASS** (26 recorder, 29 offline report). `.cache/recorder-context-feature/green-final.log`. Report regression získává payload z reálných `fetch` POST bodies recorderu, zapisuje do izolovaného JSONL a volá skutečný offline report; potvrzeny 2 samples, 0 comparableIntervals, žádný smyšlený přírůstek, 1 sequence gap a 2 oddělené segments.
- Stávající bounded transport test zůstal zelený: 3600 frame intervals, 306 POST, žádný drop, maximum pendingBytes 65123. Jde o deterministickou CPU/transportní regresi, nikoli praktické GPU měření.
- `git diff --check -- client/session-diagnostics.ts tests/session-diagnostics.test.ts`: PASS.
- Nezávislá read-only kontrola `/root/frame_diagnostics_security`: bez blokujícího nálezu; explicitně potvrdila oddělení čítačů rostoucích 100 → 900 a zachování rate limitů. Reviewer nespouštěl souběžně testy.

### Refaktoring, soubory a snapshot

Jedna public metoda sjednocuje reset frame cache/previousFrame pro všechny event hranice a přímé volání Game. Reentrantní opakované resetování prázdného okna neprodukuje duplikáty. Zachována dosavadní frekvence context sampling, bounded frame/window/queue limity, transportní retry lifecycle a původní timestamp semantika. Pouze nové testové bloky byly srovnány formátováním, ostatní soubory nedotčeny.

Změněny pouze `client/session-diagnostics.ts`, `tests/session-diagnostics.test.ts`, toto předání a jmenovaná cache evidence. Runtime/test bytes SHA-256:

- `client/session-diagnostics.ts`: `87ceadf7be528b9e7210bba6415880c2dc37706c6b6118cd51d25183b3a1ad4c`
- `tests/session-diagnostics.test.ts`: `2029869256f531c1ebb29a1df4e003ba037bfaf5a471e8c62cfb06841c358549`

Přesný diff proti main `f4f6116` a manifest obou souborů včetně testů jsou `.cache/recorder-context-feature/feature.patch` a `manifest.json`. Úplný integrovaný checkpoint, full test/build/integration, aktualizaci Linear a commit/push provede koordinátor.

Žádné spuštěné servery, porty, GPU procesy ani změny instalace. Všechny vlastní testovací procesy ukončeny; dočasný JSONL odstraněn pomocí `unlink` přesné vlastní cesty. Živé uživatelské preview nedotčeno. Rezervace se uvolňuje bezprostředně po tomto předání 2026-10-14 kolem 21:10 UTC; task status a přijetí mění pouze integrátor.
