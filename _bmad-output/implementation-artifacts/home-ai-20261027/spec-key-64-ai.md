---
title: 'KEY-64: Crazy Typka AI s podklady Silicon Hill'
type: feature
created: '2026-10-27'
status: in-review
baseline_commit: 'a0e0e31286ae9521f1282a8bd966b40e8fdad628'
route: dispatch
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/home-ai/20261027/research.md', 'docs/home-ai/20261027/adoption.md']
---

<frozen-after-approval>

## Intent

Přidat konverzaci s Crazy Typkou na úvodu a ve vlastním AI kanálu herního chatu. Jde o fiktivní dospělou AI spolužačku ze Strahova, která pomáhá s hrou a s orientací v ověřených veřejných podkladech Silicon Hill. Přátelský, trochu škádlivý tón nesmí vytlačit pravdivost praktických odpovědí.

## Boundaries & Constraints

Trvalý viditelný štítek AI; postava není skutečná studentka ani zástupkyně SH. Herní fikce: 22 let, studium VŠ a koleje. Bez sexuálního tónu, výlučnosti a předstíraného osobního vztahu; u nezletilých pouze přátelsky. Nikdy nežádat hesla, UID ani přístup do IS. Nezaměňovat herní profil za účet klubu.

AI dostane pouze zprávy z vlastní konverzace a kontrolovaný corpus; žádné lidské kanály, profily nebo polohy. Není Player a nevysílá automaticky do multiplayeru. Před prvním odesláním UI vysvětlí zpracování OpenAI a že ostatní hráči tuto konverzaci nevidí. Klíče jen na serveru, žádné vlastní logování textů. store:false není slib nulové retence poskytovatele.

## I/O & Edge-Case Matrix

| Stav | Výsledek | Chyba |
| --- | --- | --- |
| GET /api/ai/status | enabled boolean | Bez konfigurace chat zřetelně nepřipojený |
| POST /api/ai/session | token, expiresAt | Omezená tvorba a kapacita relací |
| POST /api/ai/chat | token/requestSeq/message/locale -> speaker/text/sources a potvrzené requestSeq | Žádná klientská systémová role nebo cizí historie; přesný replay bez nové platby |
| DELETE /api/ai/session | Bearer token -> reset | Zrušit inflight a zapomenout historii |
| Věcný dotaz | Retrieval z ověřených SH chunků; citované IDs mapuje server | Bez podkladu přiznat mezeru |
| Spam, souběh, moderace | Admission/session/IP/global stropy | Bez dalších placených retry |
| Timeout, incomplete, refusal | Bez zveřejnění vadného/neověřeného výstupu | Čitelný bezpečný kód chyby |

</frozen-after-approval>

## Code Map

- `server/feedback.ts`: místní vzor exact Origin, bounded body/time, rate map a shutdown; pouze číst.
- `server/index.ts`: handler vložit před wildcard CORS, close při shutdown; převezme integrátor.
- `server/community.ts`, `shared/types.ts`: lidský multiplayer beze změny.
- `client/ui.tsx`: jeden hook drží AI stav mezi menu a herním panelem; samotné komponenty nevytvářejí hráče.
- `scripts/test-integration.mjs`, `tests/feedback-deployment.test.ts`: izolace env před startem testovacího serveru.

## Tasks & Acceptance

- [x] `shared/crazy-typka.ts`: úzké typy odpovědi/citací, validátory a limity bez Node závislostí.
- [x] `server/data/silicon-hill-knowledge.json`, `server/crazy-typka-retrieval.ts`: kurátorované krátké parafráze, URL, verze/účinnost, kontrola dne, autor/licence, hash uloženého textu a reviewAfter; lokální BM25/normalizace/synonyma, minimální relevantní shoda.
- [x] `server/crazy-typka-provider.ts`: pevný OpenAI endpoint, env model, Responses se strukturovaným text/sourceIds, bez tools, moderace vstupu i výstupu, timeout/byte limit a validace completed odpovědi.
- [x] `server/crazy-typka.ts`: vypínač/config, samostatné náhodné AI relace; historie nejvýše 6 turnů, TTL 30 minut, bounded map; jeden inflight na relaci. Admission před body, limity nové relace/IP/globální, konzervativní strop generování na běh procesu. Žádné tvrzení trvalého denního finančního rozpočtu.
- [x] `client/crazy-typka.tsx`, `client/crazy-typka.css`, `tests/crazy-typka-ui.test.ts`: sdílený hook a widget, plain text, bezpečné zdrojové odkazy/atribuce, stav práce, reset/cancel a CZ/EN.
- [x] `tests/crazy-typka.test.ts`, `tests/crazy-typka-provider.test.ts`, `tests/crazy-typka-retrieval.test.ts`: fake provider, retrieval fixture dotazy, abuse/timeout/cancel a žádný klíč v odpovědi.
- [x] `client/ui.tsx`, `server/index.ts`, `compose.ai.yaml`, izolovaný harness: propojení po předání, deploy návod bez tajných hodnot.

Given nepřipojený OpenAI, when uživatel otevře AI, then UI netvrdí dostupnost ani nevrací předstíranou odpověď modelu.
Given odpověď s neznámou citací nebo chybnou moderací, when se validuje, then se nezveřejní.
Given reset/odchod/zánik komponenty, when doběhne starý request, then neobnoví smazaný obsah.

## Implementation Notes

Výzkum a bezpečnostní oponentura dokončeny před implementací. Autorizované vratné změny pokračují bez dalšího BMAD potvrzení dle projektové policy. Živé OpenAI volání nyní nelze ověřit: v prostředí není klíč ani model. Zvolen konfigurovatelný model podporující Responses structured outputs, nikoli neověřený účet/model alias.

Pozdější upřesnění 27. 10.: uživatel bezpečně uložil klíč mimo Git. Přístup k GPT-6 Luna byl ověřen a proběhly malé živé testy s effort=none; skutečné výsledky budou v přejímce, původní mock evidence se tím nepřepisuje. Uživatel dále dodal nezávazný návrh a výslovně dovolil vybrat jeho užitečné části. Technický kontrakt doplňuje requestSeq, kontextový retrieval a místní první pozdrav podle adoption.md. Nejde o povinný přechod na DB/crawler/Decisions.

- [x] `server/crazy-typka.ts`, `shared/crazy-typka.ts`, příslušné testy: poslední operace session, přesný replay terminálního výsledku včetně chyby, bezpečné odmítnutí změněné/staré/neuspořádané operace; lokální první greeting za stejnými limity.
- [x] `server/crazy-typka-retrieval.ts`, corpus metadata a retrieval testy: omezené návaznosti ze serverových USER zpráv, zachování tématu, stop na novém neznámém tématu, žádná autorita assistant textu.
- [x] `client/crazy-typka.tsx`, jeho testy: potvrzované pořadí, explicitní obnovení nejisté operace stejným payloadem, žádné další placené automatické retry; zachovat další draft a fokus.

## Spec Change Log

## Review Triage Log

| Vrstva / nález | Verdikt a důkaz | Řešení |
| --- | --- | --- |
| Edge: podklady mohou zestárnout během provider volání | medium: injected clock překročí reviewAfter během generování, první odpověď byla200, okamžitý replay409 | patch: freshness znovu před zveřejněním i zápisem historie; regresní případ včetně neplaceného replay PASS. |
| Verification: platný env strop nebyl pokryt testem | medium: dosavadní cap testy přepisovaly limits přímo a nemohly zachytit ignorovaný env parametr | patch: cap="1" přes env bez limits override, jedna generace a odmítnutí další; regresní případ PASS. |

## Design Notes

Malý lokální index je levný, deterministický a nepotřebuje upload/vector-store lifecycle. Embeddings nebo hosted File Search přidat až podle doloženého recall problému. Citace zvyšuje dohledatelnost, ale sama nezaručuje pravdivost modelu. Zdrojová data zůstávají nedůvěryhodným obsahem vůči instrukcím. Žádný runtime fetch uživatelských URL. Bez streamingu lze moderovat celou odpověď před zobrazením. Origin brání cizím webům, nikoli skriptům; proto samostatné limity nákladů.

## Verification

Lehké cílené testy bez portů a placeného API (mock req/res podle feedback-server testů). Testy známých českých/anglických parafrází i dotazů mimo corpus; status/response validation, expiry, dedup, body/rate/concurrency, shutdown/reset. Poté společná pipeline a browser kontrola úvodu/herního AI panelu v dohodnutém okně; živou kvalitu modelu uvést odděleně jako neověřenou, dokud nebude bezpečně nastaven serverový klíč.

Místní implementace a review dokončeny; důkazy a omezení viz docs/home-ai/20261027/verification.md. Stav in-review zůstává do povinného CI a integračního přijetí, aby pomocný BMAD stav nepředbíhal skutečný výsledek.
