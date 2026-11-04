---
title: 'KEY-73: praktický strahovský AI chat'
type: 'feature'
created: '2026-11-04'
status: 'in-review'
baseline_commit: '6805bcd4396eeb6abd17f724914a054b06fa86bc'
route: 'dispatch'
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/agents/architecture.md']
---

<frozen-after-approval reason="Plán výslovně schválen uživatelem 4.11.2026">

## Intent

Crazy Typka pomáhá s praktickým životem Strahova a KB. Přidat tematickou kontrolu, přehledový/konkrétní režim, doplněné podklady a přehledný chat s reakcemi na bloky. Obecné školní úkoly, sexuální chat a slovníky vulgarismů odmítá; místní bezpečí a slušné odmítnutí objektifikace zachová.

## Boundaries & Constraints

Nová větev codex/crazy-typka-scope-ui-20261104 v kanonickém C checkoutu je výslovná výjimka z main-only. Oddělené rezervace, žádné další kopie. Zachovat soukromí, moderaci, limity, cancel/replay, aktuálnost citací, top4/distance0.60. Žádný runtime crawler ani live denní menu. Uživatel následně výslovně zadal vytvořit PR a po ověření sloučit do main.

## I/O & Edge-Case Matrix

| Vstup/stav | Výsledek |
|---|---|
| Místní praktický dotaz | Decisions scope>=.80, podklady, přímá doložená odpověď |
| Co podniknout / kdy otevřeno | overview: možnosti; specific: údaj/první krok |
| Matematika, sexuální tužby, vulgarismy | Pevné odmítnutí před embeddingem/generací |
| Oddělitelný mixed | Druhé Decisions nad max6 přesnými segmenty; pouze povolená část dále |
| Nejasný mix / >6segmentů | Žádost o samostatný místní dotaz |
| Decisions chyba/timeout/budget | Terminální chyba, žádný generator fallback |
| Reply na podložený blok | Server dohledá vlastní referenci, nové RAG pro fakta |
| Neplatný/evikovaný reply | Potvrzený reply-unavailable; žádné auto odeslání bez citace |
| Enter / Shift+Enter / IME | Odeslání / nový řádek / nesmí odeslat skládání |

</frozen-after-approval>

## Code Map

- server/crazy-typka-decisions.ts: nyní jen complexity/local predicates; přidat scope/mode a bounded segment classify.
- server/crazy-typka.ts: session, limity, sekvence, replay; zde gate, reply buffer a publikace bloků.
- server/crazy-typka-provider.ts: parts už existují pro kuraci, nyní se slévají; zachovat provenance a vystavit bloky.
- shared/crazy-typka.ts: zpětně kompatibilní blocks a replyTo, reply-unavailable.
- server/rag-evidence-backend.ts: přesný moderovaný query, fresh snapshot; zachovat SQL ranking.
- client/crazy-typka.tsx/css: store, composer, citace; shell úvod/hra vlastní welcome-screen/ui.
- server/data/rag/bootstrap-documents.json: přidat samostatný official campus-guide, revision3; community receipts neměnit.

## Tasks & Acceptance

- [x] key-73-scope: pět nezávislých otázek v jednom Decisions: binary admission, scope reason, answer mode, complexity a local evidence. Optional druhý call pouze mixed. Split Intl.Segmenter(cs/en,sentence)+newline/odrážka/středník; žádné spojkové heuristiky. Přímé schválení vyžaduje raw allowed i admissionProbability>=.80; agregace admission MIN, complexity/local MAX. Pevné CZ/EN odpovědi.
- [x] key-73-root: fail-closed gate, exact input moderation, bezpečná projekce mixed, provider mode a parts, server reply, všechny související regrese. Známý named API refusal znamená pouze denial, ne permission; malformed/missing stále error. Dangling follow-up bez kontextu vrací místní clarification bez placeného API.
- [x] key-73-kb: hostel červenec–srpen blok3/8; registrátoři jako první krok; role SH/SÚZ; přehled aktivit včetně potravin; přesné menza hodiny/menu a výluka16.–17.11.2026, provenance a expirace.
- [x] key-73-ui/shell: Enter/Shift/IME guard, autoheight bez resize, info-trash-close, privacy pod info, bez archive select, typing tečky/reduced-motion, klidný pointer focus a viditelný Tab. Úvod/CZ/EN/citovaná reakce a320/360px skutečně ověřeny vEdge; herní HUD patří finální přejímce níže.
- [ ] key-73-validation: skutečná DB/model holdout, browser, plná pipeline a nezávislé review, oddělené commity.

Given nový mimooborový požadavek, when citace/old context existuje, then staré téma jej nepovolí.
Given odmítnutí, when další dotaz nemá referenci, then implicitní starý kontext je prázdný; explicitní vlastní reply jej může obnovit.
Given stejná potvrzená operace, when retry, then stejné bloky/ID a žádné placené volání.
Given konkrétní termín výluky, when menza otázka, then výluka má přednost před rozpisem.

## Implementation Notes

Rozhraní: blocks?:{id,text,sourceIds}[]; replyTo?:{requestSeq,blockId}. text=join bloků dvojím newline; nejvýše6bloků/4000znaků. ID tvoří server; sourceIds odkazují public sources.id. Reply jen source-backed bloky, buffer posledních6podložených odpovědí stejné relace/scope. Citace je neautoritativní kontext. Replay kontrolovat před dohledáním targetu; target zahrnout do identity a pending freeze. Mixed max5provider+1server refusal, společný délkový limit. Odmítnutý text se neukládá do implicitní historie. Reset/expiry/shutdown/scope change čistí buffer. Žádný raw HTML.

Živá evaluace odlišila samostatnou multiclass confidence od pravděpodobnosti doménového oprávnění: A/B/C zamítnuty, rozlišovací9casepredicateprobe2 prošel. Proto pátý povinný binary predicate se stejným prahem.80 a rawlabel souhlasem, nikoli nižšípráh. Pevná policy je jednou vdeveloper message, přesný moderovaný text vuser.content; max6segmentů/8191USERB vytvoří32502B pod32KiBcap. Answer presentation má nezávislý práh>.5, nedává permission ani neurčuje model. Známé gate refusal se normalizuje pouze na admission0/denial a uchová potvrzenéusage. Podrobnosti a hashe v key-73-scope handoffu.

Produkční R3 ověřil12/12 skutečných chatových příkladů, včetně6tematických activity bloků, registrar-first odpovědi, hodin/výluky a odmítnutí mat/sex/objectification. Overview s evidencí vyžaduje alespoň2části (max6/4000/token600 nezměněny), aby model nevrátil celý výčet jako jeden odstavec. Neutrální odmítnutí zbytku mixed zprávy neobviňuje nejistou místní část zoff-topic a nepokládá znovu již zodpovězenou otázku.

## Spec Change Log

-4.11: výslovné nové lidské zadání PR+merge nahrazuje původní odevzdání pouze na větvi; frozen záměr aktualizován právě vtomto bodě.
-4.11: empirické oddělení binary admission od choice confidence a konzervativní known-refusal denial; žádné snižování bezpečnostního prahu či navýšení API kol/capů. KEEP: čerstvé zdroje, requestSeq replay, private channel a bounded refs.

## Review Triage Log

| Verdikt | Nález a ověření | Oprava |
|---|---|---|
| medium | USER upřesnění Blok3 se ztratilo pro další A kde; explicitní reply na nové téma ponechával starý anchor. Potvrzeno probe. | Bounded USER clarification a nový aktuální podložený replyAnchor; relevantní regrese PASS. |
| medium | Info na320px sahalo vlevo mimo overflow popup. Nezávislý CSSdůkaz. | Kotvení ke společné hlavičce; Edge320/360 skutečně bez levého ořezu. |
| clean | Nezávislý přezkum celého159KB core diffu. | [] |
| medium | Přehled evidence předčasně formuloval finální CI jako již existující; JSON dokládal jen první335750f0. | Zpřesněno na zbývající podmínku před merge; žádný nový PASS připsán. |

## Design Notes

Porovnáno: blacklist a moderace nenahrazují doménový gate; další běžné API kolo zbytečně zvyšuje latenci. Scope/mode ve stejném Decisions, extra call jen mixed. Prompt sám nedoplní chybějící fakta; doplněný official corpus řeší pokrytí bez plošného zvyšování top-k. Serverové parts/ref chrání tematické hranice a autenticitu citace lépe než klientem poslaný quote text. Zachovat omezenou paměť i source guards.

## Verification

Cíleně node --import tsx --test nad přidělenými regresními soubory. Na stabilním checkpointu pnpm --config.verifyDepsBeforeRun=error test/build/test:integration se zdroji. Holdout: nula průchodů zakázaných úkolů a nula blokací hlavních místních scénářů. Reálný DB retrieval pro příklady, build/revision/chunk distance/usage/latency do evidence. Edge CZ/EN desktop/mobile, úvod/hra, klávesy/IME/reply/reset/focus. Chybějící runtime evidence není PASS.
