# KEY-73 — aktuální stav

- Checkpoint: větev `codex/crazy-typka-scope-ui-20261104`, výchozí HEAD `6805bcd4396eeb6abd17f724914a054b06fa86bc`.
- Runtime implementace je na feature větvi, checkpoint `d885fc4ff3f61355da4e351d6d168e478f886f14`; [PR42](https://github.com/Varnahg/StrahovCrazyShow/pull/42). Uživatel následně výslovně zadal PR a po ověření merge do main. Zbývá pouze dokončení dokumentace, její CI a remote merge.
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

Po historickém R3 timeoutu byly prostředky předané grafickému úkolu. Pro R4 byly znovu řádně rezervované validation/snapshot. R4 dokončil běžící herní HUD, poté root zavřel vlastní kartu, obnovil viewport, ukončil API77316 a preview a odstranil pouze vlastní ephemeralPG `scs-key73-db-r4-20261104`. Porty2568/2571/4180/5439 volné; původní8080/DB/images zachované. Validation/snapshot znovu RELEASE a grafický koordinátor informován. Tři původní untracked konsolidační dokumenty mají nezměněné SHA256 a nejsou součástí commitů.

Další krok: pouze CPU/dokumentace → zelené CI finálního PR42 head → ready/merge → aktualizace kanonického main → Linear. PR41 není závislost. Historický R3 WebGL2 AutoMedium vypršel v current-off po30013ms a nepředstavuje herní přejímku; nový WebGL2 rozpočet řeší samostatně grafika. R4 použil existující WebGPU60/180 bez změn limitů.

## Přejímka dalšího herního průchodu předem

Problém: praktický AI panel ve skutečně běžící scéně. Mechanismus R3: starý30s WebGL2 timeout. Jediná změna ověřovacího postupu R4: podporovaný WebGPU na témže klientském buildu, vlastní aktivní a fokusované Edge okno. Metrika: prokázaná dokončená příprava/game-ready a HUD chat/reply/close/reset. Invarianty: bez skrytého vynucení ready, původní limity, skutečná URL/build/relace. Výsledek PASS: multiplayer game-ready, automatické Medium, příprava79.312s, Enter/Shift+Enter, info, dva podložené bloky a citace na blok3, zachování draftu/citace při zavření, smazání. Screenshoty/readiness/úklid v přehledu evidence. Nejde o FPS ani celkovou herní přejímku; ruční OSIME zůstává neprovedené a guard kryjí testy.

## Výsledky a review

Runtime CI d885fc4f:3168 testů,3166 PASS,0 FAIL,2 SKIP; pnpm build, reálný pgvector, izolovaná integrace, feedback-browser a source-secret-hygiene PASS. R4 hranice: všech šest kontrol PASS včetně neutrálního odmítnutí mixed zbytku a přesného replay bez dalšího API. Chybný regex harnessu vyhodnocen nad uloženým výsledkem bez placeného opakování; původní false zachovaný. Nezávislá review jádra/UI/presentation bez zbývajících nálezů. Naměřené tokeny a latence jednotlivých API fází uložené; účtovaná dolarová částka není v odpovědích provideru dostupná a netvrdí se.
