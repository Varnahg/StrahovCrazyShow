# KEY-73 — aktuální stav

- Checkpoint: větev `codex/crazy-typka-scope-ui-20261104`, výchozí HEAD `6805bcd4396eeb6abd17f724914a054b06fa86bc`.
- Implementace je ve čtyřech commitech na feature větvi (aktuální `ee7bbf587b464861d10736f1b4e580fe1d924795`), [PR42](https://github.com/Varnahg/StrahovCrazyShow/pull/42) je draft. Uživatel následně výslovně zadal po ověření merge do main.
- Podklady i7official jednotek jsou hotové; 8/8reálnýchretrievalů,12/12produkčníchR3chatových případů a úvodníEdgeCZ/EN/reply/Enter/Shift/focus/mobile320/360 ověřeny. Aktuální přehled důkazů: docs/verification-evidence/key-73/README.md .
- Linear: https://linear.app/gigeconomy/issue/KEY-73/crazy-typka-tematicky-filtr-prehledove-odpovedi-a-jednodussi-chat

## Původní rozhodovací záznam před změnou

| Položka | Záznam |
|---|---|
| Problém | Chat odpovídá mimo téma, neposkytuje chybějící místní fakta a má rušivé ovládání. |
| Doložený mechanismus | Decisions postrádá scope, provider dovoluje general conversation; hostel/hodiny v importním corpusu chybí; textarea resize vertical a žádný Enter handler. Runtime ranking zatím nezměřen. |
| Zkoušená změna | Jeden funkční celek schváleného plánu: scope/mode+bezpečné reply s doplněným corpusem a UI; jednotlivé ověřené části samostatně commitovat. |
| Hlavní metrika | Průchody zakázaných úkolů a falešné blokace místních scénářů; coverage konkrétních KB příkladů; browser scénáře ovládání. |
| Podmínky správnosti | Aktuální zdroje, role SH/SÚZ, příslušná sezóna/výluky; žádná cizí session/quote; replay bez nových model calls; zachované budget/cancel/privacy. |
| Přijetí | Holdout nula zakázaných průchodů a nula blokací hlavních místních scénářů, doložené DB/model příklady, Edge UX a plná test/build/integration pipeline. |

## Koordinace a omezení

Root nyní drží pouze key-73-root (CPU/source/docs). Leaf claims jsou uvolněné. PoR3timeoutu skutečně ukončil svouEdgekartu, API75208,preview a ephemeralPGscs-key73-db-20261104; porty2568/2571/4180/5439 ověřenyvolné. key-73-validation, snapshot i verification-record(docs/verification.md) RELEASE; heavy/GPU/build/2568/verification převzala Ultra grafika PR41 na30–45min. Původní8080/DB/images zachovány.3původníuntracked konsolidační dokumenty neměnit/nestagovat.

Další krok: dokončit dokumentaci/CIbezGPU; poověřenémmergePR41 převzít novýmain, zachovatAI změny vUI konfliktech, znovuzískat krátkévalidačníokno a provést reálný ingameChatHUDsmoke s platnýmLow/Ultra prvním snímkem. PakfinálníCI42/merge/pullmain/LinearDone. Stávající R3WebGL2AutoMedium vypršel vcurrent-off po30013ms, queue872/cursor128, visible/focusedtrue, prvnífinálnísnímek NEprokázán; žádné prodlužovánílimitu vtomtoAI úkolu. NovéWebGL260s zadání řeší samostatněPR41.

## Přejímka dalšího herního průchodu předem

Problém: zbývá praktický AI panel ve skutečně běžící scéně. Mechanismus: R3starý30sWebGL2mediumtimeout, nikoli chyba chatu. Jediná posuzovaná změna: nový AIpanel na přijatém PR41 s uživatelem zvolenýmLow/Ultra; nejde o příčinné FPS srovnání. Metrika: prokázaný první snímek/readiness+HUDchat/refs/locale/close/reset. Invarianty: žádné skryté vynuceníready, novýtimeoutjenpodle explicitníhoPR41zadání, skutečnýbuild/URL/clientid a vlastnírelace. Přijetí: validníscéna a úplnýHUDchat průchod; jinak uvést neprovedenouhernípřejímku, nePASS.
