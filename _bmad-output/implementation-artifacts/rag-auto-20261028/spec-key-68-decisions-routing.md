---
title: 'KEY-68: routing Crazy Typky podle složitosti přes Decisions API'
type: feature
created: '2026-10-28'
status: in-review
route: dispatch
baseline_commit: '86e4dd603ca1b91e3eaa5f84573f9481be410a29'
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/rag-ingestion/20261028/decisions/contract.md']
---

<frozen-after-approval>

## Intent

Uživatel výslovně upřednostnil skutečný Decisions API routing podle složitosti. Dnešní služba používá jediný generativní model. Bezpečné požadavky mají automaticky používat levný model, náročné odvozování a syntéza silnější serverem zvolený model, v omezeném rozpočtu.

## Boundaries & Constraints

Zachovat moderaci, soukromé relace, origin/admission, requestSeq/replay, abort/expiry a citace. Decisions je poradní klasifikátor, nikdy oprávnění k URL/SQL/modelům či interním datům. Klíč mimoGit. Nejasnost nebo výpadek nesmí vyvolat drahé opakování. Chybějící podklady samy nejsou složitost. Automatický ingest, OpenAI převod PDF a uživatelem potvrzený oddělený archiv zůstávají otevřené v KEY-67; jejich WIP se do tohoto priority checkpointu nezahrnuje.

## I/O & Edge-Case Matrix

| Stav | Chování | Chyba |
| --- | --- | --- |
| Přímý dotaz / konverzace | Decisions → simple generátor | Neřídit jen délkou nebo jazykem |
| Náročná syntéza / odvozování | Decisions → complex při splněném prahu a capu | Chybějící lokální evidence neeskaluje |
| Refusal / timeout / nízká jistota | Dosavadní bezpečná levná cesta | Bez auto retry nebo drahého fallbacku |
| Reset / abort během rozhodování | Ukončit operaci | Žádná další generace |
| Přesný replay | Stejný uložený výsledek | Nula nových placených kroků |
| Souběh posledního complex slotu | Nejvýše jeden nový complex pokus | Rozpočet rezervovat atomicky předHTTP |
| Expirace zdroje během odpovědi | Dosavadní response-expired guard | Neukazovat staré podklady |

</frozen-after-approval>

## Code Map

- `server/crazy-typka-decisions.ts`: nový bounded adapter, dvě nezávislé predicate otázky, validace odpovědi a usage; přesné API v kontraktu.
- `server/crazy-typka.ts`: místo po moderaci, deterministická tier policy, oddělené capy/metry a bezpečný fallback; původní RAG tok zachovat.
- `server/crazy-typka-provider.ts`: konfigurace druhého generátoru, bounded output a skutečné usage callbackem. Zachovat Jantar onboarding handoff c38661f6 bez převzetí UI souborů.
- `compose.ai.yaml`: pouze serverové nové parametry. Žádný shared/public DTO, SQL nebo klientský zásah.
- `tests/crazy-typka-decisions.test.ts`, `tests/crazy-typka.test.ts`, `tests/crazy-typka-provider.test.ts`: API schema, model/effort, lifecycle a významné regresní scénáře.

## Tasks & Acceptance

- [x] Adapter s fixed/v1/decisions, gpt-6-luna, skutečným predicate schema, timeout/size/abort/usage, bez retry.
- [x] Runtime simple/complex volba z důvěryhodné konfigurace, cap a fallback, včetně concurrent reservation a replay.
- [x] Provider/Compose s nezměněným veřejným kontraktem a žádným klíčem v klientovi/logu.
- [ ] Označená česká evaluace, bounded skutečné API ověření obou cest, review a samostatný commit/PR.

Given složitý povolený požadavek a rozpočet, when klasifikace překročí ověřený práh, then Responses request používá nakonfigurovaný complex model/effort. Given jednoduchý či nejistý požadavek, when proběhne stejné API, then používá simple model. Given duplicitní requestSeq, when klient obnoví požadavek, then nevznikne nová moderace/Decisions/embedding/generace. Given blokovaný vstup, when moderace odmítne, then Decisions ani generace neběží.

## Implementation Notes

Přímé zadání a projektová policy autorizují běžnou implementaci bez nového approval kroku. Samostatné tasky/claims před zápisem; žádné převzetí ingestWIP. Aktuální main okno PR33 patří Jantaru. Priority PR lze vytvořit ze selektivních router commitů bez přepnutí checkoutu nad cizími změnami.

Adapter18/18 a provider/service72/72, společná cílená sada90/90PASS a strictTypeScriptPASS. Skutečná24případová klasifikace při0.80:24/24 očekávanýchtiers; stále malá syntetická sada. Live service prokázal požadovaný/pozorovaný modelLuna/Sol i fallbackpo capu a chybějícíchpodkladech; replay0calls. Jeden obsahový problém (nevyžádaná oprava staré správné odpovědi při jiných úryvcích) opravenjednou instrukcí a ověřen novouLuna→Sol dvojicí. Celkem30Decisions/6Responses(2complex)/12moderací, beznejasnýchpokusů; explicitnírozpočtová změna4→6 zachovaná vledgeru. Servicefixture není nováSQL/embedding přejímka. Detail v decisions/live-evidence.json a validačnímhandoffu.

## Spec Change Log

## Review Triage Log

Všechny3vrstvy spuštěny společně nad stejným7souborovým diffem; jednotlivé verdikty až po úplném předání všech výsledků.

| ID / vrstva | Verdikt | Důkaz a dopad | Cesta |
| --- | --- | --- | --- |
| B1 blind | medium | Config přijme none/minimal pro defaultgpt-6.1-sol, ačkoli aktuální primární dokumentace obě hodnoty vylučuje; in-memory reprodukce odešle neplatný požadavek a spotřebuje complexslot. | patch: odmítnout známou neplatnou dvojici před API, regresníconfigtest |
| B2 blind | low | Adapter validuje nenulové reasoning_tokens, ale zahodí je. Potvrzené usage3 je ve statistikách0, celkové tokeny se nemění. | patch: přenést skutečný údaj, přímo opravitelné bez nového veřejnéhoAPI |
| E1 edge | medium | Po expiraci v awaitcaptureActive callback vyhodí RequestError, který evidence-backend normalizuje na502. Dřívější RagEvidenceError dával409cancelled; skutečná service+backend reprodukce potvrzuje rozdíl. | patch: zachovat typovanou cancellation přes hranici callbacku a přidat kombinovanouregresi |
| E2 edge | low | Nezávislá reprodukce stejné ztráty reasoning_tokens jakoB2. | patch: společná opravaB2, vlastní verdikt zachován |
| V1 verification | medium | Test s bytecap1 odmítne prvnírequest, ale neprokazuje kumulativní přechod. Odstranění dosavadního součtu zguardu by prošlo. | patch: dva jednotlivě přípustnérequesty, součet přeslimit, druhý bez placenéhoDecisions |
| V2 verification | medium | Validní odlišný threshold nebyl behaviorálně testovaný; nahrazení parametru0.8 by prošlo. | patch:0.9 musí měnit tier i empty-evidence jistotu |

Původní autoingest WIP nebyl předmětem těchto vrstev. Known Jantar onboarding dependency zůstává integrační podmínkou, ne schválením nasazení proti starému UI.

## Design Notes

Všechny nálezy B1/B2/E1/E2/V1/V2 jsou po cíleném re-review uzavřené. Blind ověřil7 testů, edge4 a verification2; žádná další doložená regrese. Souhrnný finální cílený běh94/94PASS. Opravy nemění platné API requesty či otázky routeru, proto se již potvrzená živá evaluace neopakovala a nevznikly další placené generace. Celé CI/build/SDK a aktualizace přijaté main base stále čekají.

Volba skutečných Decisions proti regexům a klasifikaci generátorem je v kontraktu. Základní kandidát Luna, silnější Sol/low; konkrétní efekt a práh musí potvrdit české měření. Moderace zůstává před rozhodováním. Tento checkpoint neoptimalizuje vynechávání RAG, aby nezavedl vedlejší změnu historie/evidence.

## Verification

Cílené Node/tsx a strict TypeScript, zejména serializované API requesty a race/cancel/expiry/replay. Bounded live Decisions a simple/complex generation se skutečnými usage; žádné volání bez validačního scope. Finální review, plné CI/build/SDK a exact-head přijetí před main. Výsledky neoznačovat za veřejný deployment nebo obecný výkonový benchmark.
