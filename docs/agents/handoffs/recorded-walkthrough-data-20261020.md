# Předání: recorded-walkthrough-data-20261020

- Vlastník: `replay-20261020-data`; příjemce: koordinátor `replay-20261020-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/recorded-playtest-replay/StrahovCrazyShow`; větev `codex/recorded-playtest-replay`; výchozí commit `ab39b7185d0c9fb5e393c654818f43de82e07886`.
- Výsledek: implementovaná datová část testového replaye, obě skutečně extrahované fixtures a lehké regrese. Bez commitu; společný browserový výsledek zatím nepřejat.
- Změněné soubory: `tests/replay/recording.mjs`, `tests/replay/fixtures/b6-20261017.json`, `tests/replay/fixtures/outdoor-car-20261018.json`, `tests/replay/fixtures/README.md`, `tests/recorded-walkthrough-recording.test.ts`, toto předání.
- Cizí WIP: při převzetí byly untracked pouze koordinátorovy tři task JSONy a `_bmad-output/implementation-artifacts/recorded-walkthrough-20261020/`. Nebyly převzaty ani změněny. Produkční soubory a KEY-21 scope zůstaly beze změn.

## Podklady a rozhodnutí

Před zápisem načteny AGENTS, architecture, koordinace, current-work, BMAD policy, přidělený task a specifikace. `git status --short`, `git worktree list`, `agent-tasks status/validate` ověřeny; claim získán před prvním zápisem. Zdrojové kontrakty doloženy `client/session-diagnostics.ts`, `shared/session-diagnostics.ts`, `shared/weather.ts`, `client/lighting-preview.ts` a oběma kompletními původními JSONL.

- B6 17. 10.: nezměněný lokální `.cache/webgpu-migration/user-test-20261017-completed/session-prefix.jsonl` ve worktree `webgpu-comparison`, session `c063cf2e-4c92-49af-9283-cd55783b4e93`, SHA `cb15db6a0ee7905ede9debdd7435556c165799bcc0d3931246122d97403e46c2`, 5297 souvislých eventů. Vybráno od 0, ready 259, do posledního frame-window 2498. Výstup 584 vzorků + 24 explicitních událostí; outside a B6 patra 0–4. Délka posledního pozorovaného kontextu od ready `579953.4999999941` ms.
- Venkovní auto 18. 10.: verzované `docs/performance/evidence/webgpu-migration-20261016/user-4196-20261018/session.jsonl.gz`, rozbalený SHA `52cdf6bde7f27268ee6f628d347ba636a9ebb13d42aa504be2fb0a949434d425`, session `ccac5532-9f27-46a0-928f-b6b5c1e62acf`, 1717 souvislých eventů. Lidský vstup od 636, ready 1014, hranice disposal 1695. Výstup 166 vzorků + 19 událostí, žádný předchozí agent smoke, menu ani disposal. Délka posledního pozorovaného kontextu `159961.39999997616` ms.

Přesný vstupní replay není z těchto dat doložitelný, protože chybí tickové vstupy a orientace aktéra/auta. Waypoint autopilot by vynalezl řízení i mezikameru. Zvolena explicitní projekce známých technických polí do vzorkovaného renderového scénáře. Kopie celého contextu by měla vyšší velikost a zachovala zbytečná osobní/performance data. Whitelist zachovává počasí včetně původu/stale/timestamps, skutečný UTC okamžik světla a pozorované quality výstupy; není zde žádná produkční cena ani runtime cache. `zone` je koordinátorem schválené drobné rozšíření schématu pro důkaz pokrytí pater.

Celý zdroj se nejprve ověří proti očekávanému SHA, session, buildSnapshot a souvislému seq od 0; duplicita dávky/seq nebo mezera i mimo výběr selže. Teprve potom se vybírá jedna hra. Vzorky používají `contextAtMs`, události své `atMs`; stabilní řazení je čas a seq. `recordCount` znamená počet všech ověřených eventů v originálním zdroji, nikoli počet timeline položek. `durationMs` končí posledním pozorováním, nikoli pozdějším flushem nebo disposal.

## Refaktoring a ověření

Jeden schema-driven helper sjednocuje vnořenou projekci vzorků a událostí. Ponechává false/0/null, kopíruje nové objekty a nevytváří sdílený stav. Čistá `compileRecording` nemá filesystem/gzip I/O ani časovače; knihovna kromě SHA používá jen standardní JS. Žádná dlouhodobá cache, watcher nebo proces. Při závěrečné kontrole explicitní whitelist událostí používá `Object.hasOwn`, aby se neznámé diagnostic kind nedostalo do timeline přes prototyp objektu.

`pnpm exec tsx --test tests/recorded-walkthrough-recording.test.ts` dne 2026-10-20 přibližně 13:45 UTC: exit 0, **13/13 PASS**, 0 skipped/cancelled, délka dle test runneru 624.0327 ms. Výstup byl vrácen přímo koordinátorovi; žádný další log/process soubor nebyl vytvořen. Kontroly zahrnují skutečnou recompilaci verzovaného gzip s deep equality, provenance/patra B6, čas kontextu proti flush, lifecycle, SHA, session, mezery/duplicity mimo výběr, private/telemetry whitelist, chybějící data a historické chyby.

Byla skutečně spuštěna také extrakce celého lokálního B6 zdroje, která ověřila původní SHA a všech 5297 seq před vytvořením fixture. Tento celý soukromý zdroj se necommituje; CI proto B6 fixture kontroluje přes omezený obsah a provenance, nikoli znovu proti neexistujícímu raw souboru.

Manifest SHA-256 finálních datových souborů včetně testů:

| Soubor | SHA-256 |
| --- | --- |
| `tests/replay/recording.mjs` | `cf9e5f175973fd1f01b017a7b21e1f8bbdac05c8d00d8b046971b02fe912bb7a` |
| `tests/replay/fixtures/b6-20261017.json` | `648fa827983e4c4a0d17a02e3f505b27cc853197ebf6c6527f2107a5bf5c35c9` |
| `tests/replay/fixtures/outdoor-car-20261018.json` | `4ee28c6f035918891ca6df42bd6a017480318be27704c35563410c3bdcccf8da` |
| `tests/replay/fixtures/README.md` | `ec58673092e624ed31217c0bd1fa23fbe0b674390c45352bba371e2da7b2cdd1` |
| `tests/recorded-walkthrough-recording.test.ts` | `076081f972ddf873dabeef21fa98b8817a4db37cc37f178771025237ba5420f0` |

## Omezení a další krok

Samotná datová část neměří GPU/FPS a netvrdí deterministickou fyziku, průchodnost, multiplayer, síť, recovery ani orientaci aktérů. Historické B6 chyby seq 2412/2413/2450/2451/2496 jsou pouze označené v limitations, nikoli opakované jako akce nebo očekávané současné selhání. Tři delší chybějící intervaly pozorování i chybějící stav přesně v ready jsou výslovné. Testový bootstrap má zobrazovat guest režim a vynucenou pozorovanou efektivní kvalitu podle koordinátorova kontraktu.

Celá sada/build/integrace a skutečný GPU replay neproběhly v této disjunktní lehké části; koordinátor je provede nad stabilním společným checkpointem pod vlastními heavy/GPU/port rezervacemi. Žádné vlastní pomocné procesy nezůstávají. Nebyly spuštěny síťové procesy, GPU ani build a nic nebylo commitováno.

- Rezervace: předání dokončeno 2026-10-20 13:47 UTC; ihned poté je vlastník uvolňuje přes `release`. Uvolnění není přijetí tasku do Done.
- Integrátor: kontrola manifestu, review, společné přijetí, commit, evidence a Linear zůstávají koordinátorovi; zdejší soubory se nadále nepovažují za volný cizí WIP.
