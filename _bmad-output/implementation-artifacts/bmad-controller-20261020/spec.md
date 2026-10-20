---
title: 'BMAD řadič jednoho přiděleného Linear úkolu'
type: feature
created: '2026-10-20'
status: in-review
route: dispatch
baseline_commit: ceddc0802cd98dccfbee9d44fc00d6331ac9d749
review_loop_iteration: 0
context:
  - '{project-root}/docs/agents/README.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/agents/ci.md'
---
<frozen-after-approval reason="Výslovné zadání uživatele 20.10.2026">
## Intent
Dodat samostatné Node CLI `run`, `status`, `resume` pro právě jeden explicitně přidělený Linear issue a katalogový task. Řadič provede výzkum/plán, implementaci, nezávislé review, skutečné kontroly a přijetí/integraci přes chráněné PR. Po pádu pokračuje z doloženého stavu bez duplicit.

## Boundaries & Constraints
Vždy respektuje projektové task scopes, cizí WIP, claims a zdroje. Claim před rendererem/workerem, heartbeat během práce; release až po handoffu a ukončení workerů. Trvalé provozní údaje v git-common-dir, nikoli verzovaném stromu. Jeden zapisující controller a jeden worker daného attemptu. Neznámý stav procesu či vzdálené mutace nezaměňovat za neprovedenou akci. Přijetí je vázáno na skutečný head/base a prokázané kontroly.
Mimo rozsah: backlog scheduler, dávky úkolů, upgrade BMAD, zásahy do herního runtime, falešné GPU/uživatelské přijetí, obcházení ochrany main.

## I/O & Edge-Case Matrix
| Scénář | Vstup | Chování | Chyba |
|---|---|---|---|
| Nový run | validní explicitní manifest | stabilní run, branch, worktree a owner | invalidní zadání odmítnout před mutací |
| Opakovaný run/resume | stejný issue/manifest | stejná identita, dokončené efekty se neopakují | změněný manifest odmítnout |
| Dva controllery | shodný run | pouze jeden zapisuje | druhý hlásí running/busy |
| Pád controlleru | živý worker supervisor | resume naváže na původní attempt | nespouštět druhého workeru |
| Ztracený supervisor | started bez receipt | unknown, explicitní diagnostika | žádný automatický retry/ukončování cizích PID |
| Pád po commitu/PR/Linear mutaci | efekt existuje bez checkpointu | dohledat identitu a pokračovat | rozpor blokuje |
| Selhání kontroly/review | neúspěšný exit/nález | zachovat log a zastavit integraci | nikdy Done/acceptance |
| Změněný head/base | zastaralé přijetí | odmítnout merge | nutné nové důkazy |
| Dokončený run | opakované resume/status | readout stejného PR/merge | žádné nové efekty |
</frozen-after-approval>

## Code Map
- `scripts/agent-tasks.mjs`: autoritativní claims v git-common-dir; claim není idempotentní ani pro stejného ownera.
- `docs/agents/ci.md`, `.github/workflows/ci.yml`: strict PR + verify + source-secret-hygiene + project-acceptance.
- `scripts/autodev.mjs`, `scripts/autodev/{engine,store,process,supervisor}.mjs`: nový lifecycle/CLI.
- `scripts/autodev/{adapters,github,linear,codex}.mjs`: konkrétní project/GitHub/Linear/Codex kroky.
- [Kontrakt](contract.md): přesné rozhraní mezi disjunktními tasky.

## Tasks & Acceptance
- [x] Engine + atomický stav + IPC singleton + supervisor + cílené testy (14/14 Windows, předané hashy ověřeny).
- [x] Idempotentní projekt/Git/Linear/GitHub/Codex adaptéry + cílené testy (17/17,9/9 hashů ověřeno).
- [x] Skutečná BMAD spec/readiness a snapshot review lenses;24/24 adapter testů a skutečný5-prompt binding smoke exit0.
- [x] Procesní crash/recovery audit:7 scénářů, společně38/38, skutečný kill/souběh/unknown;5/5 hashů vlastních QA souborů ověřeno.
- [ ] Návod, nezávislé review, plná relevantní lokální sada a skutečná GitHub CI.
- [ ] Jeden explicitně přidělený živý Linear pilot, pád controlleru, resume, jediný PR a chráněná integrace.
Přejímka vyžaduje skutečný CLI/backend průchod a důkaz nulových duplicit; samotné mocks nestačí.

## Implementation Notes

20.10.2026: Engine předán po14 cílených testech a strict TypeScript kontrole; integrátor ověřil všech7 souborových hashů. Frozen instalace pnpm11.25.0 exit0 bez změny package/lockfile. Následuje adapters a skutečný kill/restart QA; celý průchod zatím nepřijat.

## Spec Change Log

20.10.2026 — Integrátorská kontrola před review doplnila ne-frozen kontrakt skutečné BMAD vazby: spec/template/readiness a originální review lenses, nikoli pouze renderer s obecnými prompty. Zachovat ověřený engine, durable receipts,31 již ověřených cílených testů, scope audity a service reconciliation.

## Review Triage Log

Průchod1: | ID / původ | Verdikt | Ověření a dopad | Směr |
| --- | --- | --- | --- |
| B1 blind: spec status/write checkpoint | high | adapters116–119 zapíše status před ctx.save; review945 a verify998 nejdříve assertSource porovnají starý celý hash. Pád v okně blokuje platný run před dostupnou reconciliací. | patch |
| B2 blind: falsy JSON checkpoint | high | engine70–105 používá if(state). Načtené null/false/0/empty-string přeskočí validateState a opakované run přepíše původní evidence. | patch |
| E1 edge: spec status/write checkpoint | high | Stejný konkrétní mechanismus jako B1, nezávisle potvrzený trace; ani frozen/body se nezměnily, takže je bezpečně rozlišitelný od cizí editace. | patch, skupina B1 |
| E2 edge: falsy JSON checkpoint | high | Stejný mechanismus jako B2; existující neplatný obsah musí zůstat zachovaný a nedostat druhý lifecycle. | patch, skupina B2 |
| E3 edge: UTF-8 chunks | medium | github.execute volá bytes.toString na každém Bufferu. Rozdělený vícebajtový znak se dekóduje jako replacement characters; zasáhne Git cesty/diff i gh text. Stream decoder zachová rozdělené sekvence. | patch |
| E4 edge: startedAt | medium | validateState nekontroluje čas pokusu; Date.parse může být NaN, takže deadline porovnání nikdy nevyprší a resume drží singleton neomezeně. | patch |
| V1 verification: failed/pending CI | medium | Aktuální produkční guard je správný, ale test používá jen completed/success a jiný base. Odstranění conclusion guardu by zůstalo zelené a dovolilo vydat nesprávný acceptance status; GitHub merge ochrana se tím automaticky neobchází. | patch testů |
| V2 verification: fresh merge | medium | Jediný merge test má pr.merged=true a obchází readiness/SHA-bound request. Inverze open guardu by nerozbila test, ale zastavila každý nový merge. | patch testů |
| V3 verification: main CI → Linear Done | medium | Finalize test má merge=false. Přesunutí Done před waitChecks zůstane netestované a může označit neověřený merge za hotový. | patch testů |
| P1 integrátor: spec crash window | high | Integrátor před výsledky reviewerů nezávisle našel stejný write/save→assertSource rozpor; přidat diskový crash checkpoint případ, ne jen opakování helperu v paměti. | patch, skupina B1 |
| P2 integrátor: validation lease při IO chybě | high | verify safeToRelease zůstává true pro raw EACCES/EIO z čtení receipt během živého procesu; finally by uvolnil heavy claim. Ukončení musí být doložené vráceným receipt, nikoli odhadnuté whitelistem error codes. | patch |

## Design Notes
Zvažováno řízení z chatu (nesplní samostatné CLI), obecný bmad-loop (nová závislost a širší scheduler), PID/retry (riziko dvojí práce), OS Job Objects (silnější containment, neúměrný nový nativní kód). Volíme Node state machine + oddělený supervisor s IPC a receipt. Pád samotného supervisoru bez receipt zůstane unknown. Změna nemá herní vzhled/GPU/cache dopady; důležité jsou lifecycle procesů, atomické checkpointy a ukládání logů.

Primární podklady: Node IPC, libuv Windows pipe FIRST_PIPE_INSTANCE, Node fs.sync/rename, instalované Codex CLI/app-server schéma 0.163.0-alpha.10.2; GitHub PR/check API a existující ruleset. Samostatný app-server probe skutečně načetl KEY-46 přes připojený Linear bez dalšího klíče (20.10.2026). Experimentální API musí mít jasnou chybu při nepodporované verzi, bez tichého fallbacku na modelové tvrzení.

## Verification
Cílené testy přes `node --import tsx --test tests/autodev-*.test.ts`; celý `pnpm test`, `pnpm build`, izolovaný `pnpm test:integration` pod heavy-validation. Živý pilot s uloženým run ID, attempt ID, claim, commit, PR, merge a CI URL. Výsledky teprve doplníme.







### Doplnění cíleného rechecku
Původní B1/B2/E1–E4/V1/V2 a pořadí V3 potvrzené po opravě. E-P2-resume (high): při více check attempts musí release čekat na všechny terminal receipts, nejen aktuální A; přidává se regrese s živým B a selháním auditu po A. V3-SHA (medium): fixture musí rozlišit skutečné base/head/no-ff merge SHA, jinak nezachytí použití starého base CI. Oba body patch, žádný odklad; podrobnosti v review-2.md. Frozen záměr se nemění.

### Review opravy SPEC prezentace

| ID | Verdikt | Ověření a směr |
| --- | --- | --- |
| SF-B1 blind | false | Nepublikovaný353b4c31 nemá žádného existujícího protocol2 plan consumeru; skutečný jediný legacy run a nové specFormatVersion=1 jsou rozlišeny. Neznámý meziformát zůstává nepodporovaný/fail-closed. |
| SF-E1 edge | medium | String.replace interpretuje dolarové tokeny I/O obsahu; callback musí zachovat doslovné bajty. patch. |
| SF-E2 edge | high | Vlastní UUID temp po kill před rename chybí v durable identity a blokuje resume přes STAGE_SCOPE. Přesný předem vlastněný temp/prefix musí být obnovitelný. patch. |
| SF-V1 verification | medium | Chybí ready=true regrese původních runtime-prerequisite/unresolved blokací; rozšířit testy pro completion i finální readiness. patch testů. |
| SF-V2 verification | medium | Kontrola hlavičky neprokazuje řádky matrix a escaping; ověřit konkrétní výstup nové i doplněné specifikace. patch testů. |

Každý nález vyhodnocen samostatně před seskupením. Detail a uzavření v docs/verification-evidence/bmad-controller-20261020/review-spec-format.md. Plná sada před opravami62/62 PASS není důkazem chybějících regresí; nové cílené testy a následná stabilní přejímka mají vlastní evidence. Frozen záměr se nemění.

SF-V3 recheck — medium, patch testů: kombinace již zapsaného toText a stále existujícího zaznamenaného tempu je produkčně správně odmítnutá, chybí však přímá regrese. Doplnit zachování obou souborů/checkpointu a0novýchworkerů při dvojím resume. Produkční kód se nemění; testový followup čeká na dokončení právě běžící úplné sady.

### Review svázaného output kontraktu

| ID | Verdikt | Důkaz a směr |
| --- | --- | --- |
| SC-B1 blind | false | Nepodporovaný completed-amendment mezistav z nepublikovaného fbeb582; zveřejněný main jej nevytváří a jediný skutečný run je před amendmentem/v3. Automatická obecná migrace meziverzí není slíbená. |
| SC-E1 edge | false | Samostatně posouzený stejný technicky možný, ale nepodporovaný upgrade mezistavu; neznámá metadata správně nezpůsobí přijetí či další práci. |
| SC-V1 verification | medium | Chybí skutečná plan-stage regrese null presentation pro oba typy blokací a repeat resume. Patch testů. |
| SC-V2 verification | medium | Chybí schema-tamper test přes převzetí hotového receipt, kde executor znovu neběží. Patch testů. |
| SC-V3 verification Other | false | Baseline blob potvrzuje starší metadata, ale ne existenci podporovaného consumeru; vyhodnoceno individuálně před seskupením s B1/E1. |

Detail a následné uzavření: docs/verification-evidence/bmad-controller-20261020/review-schema-contract.md. Root targeted3/3 PASS; autor19/19 PASS. Produkční kód se kvůli testovému followupu nemění.

SC-V1/V2 uzavřeny: autor3/3 PASS14.144s, tsc0; nezávislý verification recheck potvrdil skutečné plan/resume cesty a byte-identitu původních asercí po odečtení vložených bloků. Produkční kód beze změny. Detail review-schema-contract.md; skutečný pilot a finální CI ještě následují.
