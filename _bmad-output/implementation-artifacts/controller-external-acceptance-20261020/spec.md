---
title: 'KEY-54: externí praktická přejímka BMAD řadiče'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: 'ba91b84c17918ee16a9472c57f38b427fa6e21da'
route: 'dispatch'
review_loop_iteration: 0
context:
  - docs/agents/bmad-policy.md
  - docs/agents/ci.md
  - docs/agents/bmad-controller.md
---

<frozen-after-approval reason="Uživatel autorizoval autonomní runtime pilot; projektová policy nevyžaduje nové potvrzení běžného nezbytného kroku">

## Intent

**Problem:** V1 přijímá jen CLI úkol a po checkech automaticky vydává project-acceptance. Objednaný KEY-53 potřebuje skutečnou produkční A/B přejímku před merge.
**Approach:** Přidat explicitní external přejímku nezávislého koordinátora ve stávajících accept/merge fázích. Chybějící důkaz zastaví běh; resume jej převezme bez opakování práce.

## Boundaries & Constraints

**Always:** Zachovat CLI kompatibilitu, existující fáze a worker protokol. Respektovat přesný worker task a claims. Přejímka váže současný run, assignment, base, commit, source a konkrétní hashované soubory; evidence vzniká v koordinátorově ctx.repo. Autorizace uživatele zahrnuje publikaci/merge a praktickou validaci, nikoli záměnu GPU důkazu za testy.
**Never:** Neměnit herní runtime, checkpointy starých runů, ruleset, instalační BMAD nebo cizí WIP. Žádné podpisové klíče či tvrzení kryptografické autority.

## I/O & Edge-Case Matrix

| Scénář | Vstup/stav | Výsledek | Chyba |
|---|---|---|---|
| Starý CLI | původní manifest | původní průchod | stávající validace |
| Čekání | external bez receipt | stopped před GitHub accept | EXTERNAL_ACCEPTANCE_PENDING, nic nemazat |
| Přejímka | přesný pass + živá autorita + hashované důkazy | připnout proof před mutací | nesoulad blokuje |
| Vadný důkaz | fail, neznámé pole, jiné identity/bytes | žádný accept/merge | konkrétní chyba, zachovat soubor |
| Cesta | traversal, absolutní, symlink/junction/hardlink | odmítnout | žádná vedlejší mutace |
| Obnova | receipt dodán po stopped | stejný run a hotové kroky | žádné nové worker dispatch |
| Změna po accept | jiný či chybějící proof | žádný merge | nepřepnout automaticky na nový pass |
| Pád po merge | původní mergeIntent s proofem | rekoncilovat stejný merge | cizí již merged bez intent nepřijmout |

</frozen-after-approval>

## Code Map

- scripts/autodev/store.mjs: validateAssignment; engine.mjs již podporuje stopped/resume a zůstává beze změny.
- scripts/autodev/source.mjs a adapters.mjs: safePath, scope, stabilní čtení amendmentů a assertSource; zachovat stávající reexporty.
- scripts/autodev/github.mjs: skutečné accept/merge mutace a jejich intents; gate musí platit také při přímém volání klienta.
- _bmad/scripts/render_skill.py: skutečný prefix je slug normalizovaného project_root a prvních12SHA256 jeho Python řetězce; staging je uvnitř tohoto prefixu. Současný prepare vyžaduje zbytečně celý _bmad/render/bmad-build/. Nový úkol smí rezervovat přesně vlastní budoucí worktree prefix; starý široký scope zůstane kompatibilní.

## Tasks & Acceptance

**Execution:**
- [x] scripts/autodev/store.mjs — striktní external manifest — explicitní autorita a neměnný seznam důkazů.
- [x] scripts/autodev/external-acceptance.mjs — společné bezpečné čtení/validace/pinning — stejná pravidla na všech hranicích.
- [x] scripts/autodev/adapters.mjs — zmrazit autoritu z base, čekat a popsat proof; přijmout přesný skutečný renderer prefix — pravdivý lifecycle bez kolize s jiným prefixem.
- [x] scripts/autodev/github.mjs — gate před mutacemi, proof v acceptance/mergeIntent a rekonciliaci — žádný bypass.
- [x] scripts/autodev/linear.mjs — předat per-call guard za status lookup a inicializaci transportu, bezprostředně před save_issue dispatch — zachovat platnost externí přejímky na skutečné hranici Done.
- [x] tests/autodev-store.test.ts — kompatibilita a matrix manifestu.
- [x] tests/autodev-external-acceptance.test.ts — důkaz/autorita/paths/content matrix.
- [x] tests/autodev-adapters.test.ts — skutečná hranice mutací a renderer scope.
- [x] tests/autodev-engine.test.ts — stopped/resume a počty efektů.
- [x] docs/agents/bmad-controller.md — přesný kontrakt a odpovědnost externího integrátora.
- [x] docs/agents/handoffs/controller-external-acceptance-worker-20261020.md — skutečné změny/refaktoring/testy/limity.

**Acceptance Criteria:**
- Given dokončené implementace/review/checks, when praktický důkaz chybí, then nevznikne GitHub přijetí ani merge.
- Given stejný kandidát a platný dodaný receipt, when resume, then pokračují pouze zbývající kroky bez duplicit.
- Given již přijatý proof, when změna souboru nebo identity, then ani přímý klient neprovede nový merge.
- Given platný mergeIntent před pádem, when vzdálený PR už merged, then je dohledán pouze očekávaný merge a proof.
- Given souběžný jiný renderer prefix, when přesná vlastní rezervace zahrnuje staging, then může proběhnout vlastní render bez rozšíření scope.

## Implementation Notes

- Kandidát devíti source/test/doc souborů je stabilní. Nové kontroly 16/16 a4/4 PASS; úplnější místní běh stále dokončuje legacy procesní scénáře. Známý setup timeout živého reviewera zůstává otevřený do izolovaného ověření, není vydáno integrační přijetí. Starý export snapshot načtený před průběžnou úpravou byl cíleně ověřen na finálním kontraktu; smíšený původní běh není důkaz finální celé sady.
- Čtecí review kódu probíhá souběžně s dokončením původních kontrol; žádný merge či Done nenastane, dokud budou skutečné závady nebo podstatné mezery otevřené.

## Spec Change Log

## Review Triage Log

| Nález | Verdikt | Důkaz a řešení |
|---|---|---|
| B1 finalization | medium / patch | Resume po merge přeskočí proof kontrolu a může zapsat Done bez důkazu. Přidat stávající guard před finalizačními účinky a dokončením. |
| E1 evidence po async | medium / patch | Evidence jsou hashované před sourceIdentity/final authority await, pak se znovu čte jen receipt. Znovu ověřit evidence na konci validace a konkrétní změnu během čekání regresně pokrýt. |
| E2 finalization | medium / patch | Stejný doložený mechanismus jako B1; společná oprava, původní nález zachovaný. |
| V1 prepare→acceptance | medium / patch | Fixtures dodávají externalAuthority ručně. Přidat test skutečného prepare checkpointu a jeho spotřeby. |
| V2 base versus HEAD | medium / patch | Dosavadní test má shodný task ve všech verzích. Přidat rozdílné base/HEAD/worktree a nezávislou kontrolu base bytes/hash. |

Všechny tři vrstvy dokončené nad diff46e3ec499c2e1bafa39ed9c4f8f00d0cb3bf9d251e911dabc3efc2d8a88f848a. Opravy přidávají použití existujícího guardu a regresní důkazy v již přiděleném scope; žádné nové uživatelské rozhodnutí ani public API nejsou potřeba.

Re-review nad ca4db13db8030fc1478883282d67e685c0eee864f43318a57e7412673ae0f29b potvrdilo B1/E1/E2/V1/V2 jako odstraněné. Blind a verification bez dalších nálezů. Edge E3: medium / patch — skutečný LinearClient.setState před save_issue ještě awaituje list_issue_statuses; změna důkazu v tomto čekání dovolí Done a zjistí se až post-call. Nutná stejná předmutační kontrola přímo v lokálním Linear volání těsně před dispatch, se zachováním CLI kompatibility a regresí přes skutečný LinearClient. Koordinátor nejprve rozšíří rezervaci o scripts/autodev/linear.mjs; do té doby žádný zápis mimo přidělený scope.

## Design Notes

Zvolená varianta zachovává engine a přidává jediný sdílený validátor. Merge:false nepomáhá, protože accept mu předchází; běžný check je před výsledným commitem a jeho receipt se opakovaně používá. Širší interaktivní approval služba/podpisy nejsou nutné pro kooperativní místní autoritu.

Manifest external: kind, description, authority={task,owner}, receiptFile a evidenceFiles=[{id,path}], vše přesné relativní cesty bez globů. Authority musí být odlišná od controller/worker/validation; její definici/hash načíst z připnutého base. Receipt musí ležet v jejím scope a mimo zapisující scope řadiče/workeru; důkazy mohou být převzaté od samostatného měřicího tasku. Koordinátorova živá claim musí odpovídat task/owner/worktree a scope receiptu; baseHead claim se nerovná nutně baseSha runu. Řadič cizí claim nespravuje.

Receipt v1: kind=external-acceptance, decision=pass|fail, runId, assignmentDigest, baseSha, commitSha, sourceDigest, authority={task,owner,taskSha256}, issuedAt, summary, evidence=[{id,path,sha256}]. Přesný seznam manifestu; žádná volná cesta z receiptu. Hashovat původní bytes. Obyčejné soubory, kontrola všech path komponent a stabilní file handle/identity před i po čtení; zabránit TOCTOU záměně. První validní pass připnout do checkpointu před GitHub zápisem a dále vyžadovat stejné bytes/hash. Tato vazba dokládá kooperativní přijetí; smysl A/B posuzuje koordinátor, nikoli schema. Žádné automatické vytvoření receiptu modelem.

Route dispatch: nejsou nevyřešené uživatelské intent otázky; jedenáct přesných worker cest a změna podmínek externích GitHub/Linear efektů vyžadují plný review. Zachovat tento jeden podpůrný cíl; koordinační rozhodnutí vychází z autorizovaného pilotu a projektové policy.

## Verification

- node --test tests/autodev-store.test.ts tests/autodev-external-acceptance.test.ts tests/autodev-adapters.test.ts tests/autodev-engine.test.ts — očekáváno0, zaznamenat skutečný počet.
- Tři nezávislé review pouze vlastního diffu; žádná minimální kvóta nálezů.
- Samostatný PR, úplné GitHub CI, exact-head přijetí a main CI. Tento podpůrný CLI krok není výkonovým ani GPU důkazem KEY-53.

## Final local review and verification

Final diff SHA256: 8fdeb160fe0d2f60b49ac556e5d9e0149d95519967bf1e5b9a974947a75fddc5; ten-file source manifest: 3dd9d95b66fc10b796055978adc52fa2a303eef1eaf4ee9fa3c962e0ced776a3. Blind, edge-case and verification reviewers returned no remaining findings after E3. All B1/E1/E2/V1/V2/E3 findings are resolved; original reports remain unchanged.

Final focused verification:16/16 external/store,4/4 API/prefix/pending,7/7 review regressions and2/2 native Linear/CLI tests PASS. Original live-review fixture also passed serially on baseline and candidate (1/1 each), without changing its deadline or assertions; see legacy-isolated-comparison.json. Earlier130/132 mixed-source run and failed concurrent retry remain disclosed in worker handoff. No new full-suite claim is made here.

Local BMAD implementation/review is done. Project integration, exact PR checks and main CI remain pending; Linear KEY-54 is still In Progress. No runtime performance acceptance is implied.
