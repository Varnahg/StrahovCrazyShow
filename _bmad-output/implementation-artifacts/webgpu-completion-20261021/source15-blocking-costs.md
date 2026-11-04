---
title: 'KEY22: lokalizace blokujících nákladů startupu a prvního vstupu'
type: 'chore'
created: '2026-10-24'
status: 'in-review'
route: 'dispatch'
baseline_commit: '754dde6ad665070f6d46c52e755eaa2a24e0df69'
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/performance/evidence/webgpu-completion-20261021/research/source15-blocking-costs-decision.md'
---

<frozen-after-approval reason="Existující výslovné zadání KEY22; projektová policy nevyžaduje nové potvrzení běžné diagnostiky.">

## Intent

**Problém:** Source15 opravuje avatar F, ale skutečný startup Low i obnova hosta překročily limity. První car render má přes200ms bez nových kompilací; chybí vnitřní lokalizace.

**Postup:** Dvě samostatné immutable QA kopie zachytí skutečné startupové etapy a synchronní práci s efekty při prvním vstupu. Výstup slouží výběru pozdější opravy, není změnou produktu ani přijetím výkonu.

## Boundaries & Constraints

**Vždy:** Vlastní disjunktní claim; V17/36seal a historické raw beze změn; explicit default-off identity; původní receiver/args/return/Promise/falsy throw přesně jednou; bounded data, atomický rollback, native frame IDs a úklid referencí. Původní core/pin/order/behavior assertions zachovat. Pouze nové helper kopie a jejich přidělené public evidence/handoff.

**Nikdy:** Produkční source/lock/asset změny, cache key scan, nové render/readiness/GPU/scheduler/await volání, zvýšení30/90budgetů nebo oslabení coverage. GPU/build/fullsuite nejsou přidělené; vyžadují další skutečné předání CAD. Podagenti nespouštějí BMAD ani další agenty.

## I/O & Edge-Case Matrix

| Stav | Očekávaný výsledek | Chyba |
|---|---|---|
| Default off | Žádné nové runtime hooks/čtení Game | Nezměněný produkt |
| Vybraná startup etapa | Původní absolutní hranice, nejvýše8 actual renders | Nedosažený/partial cíl výslovně |
| Entry false→true | Společný10target stack,8actual Scene framů | Deadline/foreign owner/refusal výslovně |
| Reentry/throw/dispose/drift | Stejný původní výsledek, vlastní rollback | Partial evidence, žádný přepis cizího descriptoru |
| Cap/schema tamper | Bounded valid projection | Odmítnutí/overflow, žádná falešná complete |

</frozen-after-approval>

## Code Map

- `client/game.ts`, `client/light-preparation.ts`: skutečné options/startStage/saveStage/measure hranice; pouze exact QA transform ve snapshot buildu.
- `.cache/webgpu-completion-20261021/startup-stage-export/helper/v17/`: immutable donor36, původní routine/core a entry waiter; nový kód nesmí donor upravit.
- Pinované PBRBaseMaterial, WebGPUEngine a ThinEngine9.30: dvě synchronní effect hranice a skutečné inherited originy. Detailní chain/varianty a důkazy jsou v context rozhodnutí.

## Tasks & Acceptance

**Implementace:**
- [ ] `startup-stage-routines/helper/v18/`: kopie36 + nový modul/test; canonical enum null/first-medium-vehicle-0/first-low-day-1-on/first-high-day-1-on. Game options registrace vrací tentýž objekt. Původní časové odečty, žádný extra now. Lower-level8core pouze ve vybrané etapě; cap16/304/8/256KiB a explicit méně-než8 complete při skutečném konci etapy. Upravit jen vlastní common/harness/overlay/receipt/README a nezbytná copied-test metadata.
- [ ] `entry-effect-cost/helper/v18/`: kopie36 + nový core/adapter/test. Jediný10target stack, nullReturns, actual own engine wrapper a native backend origin check včetně ThinEngine dependency SHA. Nový receipt/profile schema a oddělená akce pod default-off routine-cost; původní akce/moduly byteexact. Původní entry waiter přes startCapture factory, jeden30s deadline,8framů.
- [ ] Otestovat matici, default-off/strict transforms/native null-dirty/cache reuse, nested selfSelected, foreign/reentry/Promise/falsy throw, rollback/late references/deadline/capy/receipt tamper. Uložit skutečné TAP a hashy; light targeted CPU bez sdílených heavy zdrojů.
- [ ] Nezávislý review konkrétních task diffů, root rehash a relevantní ověření. Nový build/GPU teprve po koordinaci; source/CPU přijetí oddělit od actual výkonu.

**Přijetí:**
- Given původní source15/V17, when každý task vytvoří novou kopii, then donor seal i chráněné produktové vstupy jsou stejné.
- Given selected stage nebo accepted entry, when originál běží, then evidence rozliší hranice a hierarchii bez přidaných produktových operací.
- Given chyba či konec, when owner uklízí, then zbývající vlastní hooks0 nebo explicit foreign conflict a výsledek originálu zůstává stejný.

## Implementation Notes

## Spec Change Log

-24Oct09:38UTC po Low6frame capture: V21 přidá oddělený defaultoff startup-effect-routines/strictstartupStageEffects10target stack do původních selectedstageoptions.render. V20/old8byteexact, cap16/304/8/256KiB a stage-endpartialcompletekontrakt zachovaný. Actual886msCPU +overlapping1065msfence/105pending vyžaduje měřeníprepare/create, ne blindproductfix. Podrobnévarianty a nativechain v research rozhodnutí. Whole/build/GPU stále vyžadují nové CADokno.

-24Oct09:30UTC po prvním skutečném entry: V19 retired po1accepted framu; rawpozději pendingValidation2, failing predicate chybí. Nová V20 effect-only cesta ponechá legacy8modulybyteexact; admission pending0, poaccepted instalaci pending obou explicitních kindů zaznamenává jako práci, zachová phase/error/identity/lifecycle guardy. Nový strict bounded witness/perframecounts a native RenderHealth regressions dle rozhodnutí source15-blocking-costs-decision.md. Scope zůstává QA, žádná produktová či timeout změna. V19výsledek zůstává incomplete.

## Review Triage Log

### V20/V21 review:24Oct10:05UTC

- blind-hunter:[] nad přesným combineddiff240907B/SHA5cb32bab; reviewprovedené.
- edge-1: medium/patch. Nový validateEntryEffectTrigger uzavírá jen topobject; p.limits předává legacy JSON.stringify validátoru před own-data normalizací. Accessory/toJSON na limits mohou být vykonané a accessorvalue přijata. Potvrzeno callerem a původním validateEntryTrigger. Nejmenší oprava interně closed-normalizovat limits ještě před legacycall, přidat getter/toJSONregresi; žádné API.
- verification-1: medium/patch. Nový native foreignscene test nemá assertions na exportedrows/profileNowreads; odstranění receiverfiltru by zůstalo nezachycené. Předověřená verificationgap přijatá z test/search důkazů. Rozšířit původní native test porovnáním ownrows/calls a fakeprofileclockreads s/bezforeignrender; netvrdit odečtení skutečného nestedwalltime. Žádná změna runtimeAPI.

Původní předané V20entry/V21startup a jejich sealy zůstávají immutable; autoopravy vzniknou jen v sousedních entryhelper/v21 a startuphelper/v22. Starší úspěšná/failedCPUevidence se nepřepisuje. Další cílené testy, rootreviewdelta a whole/build/GPU teprve nad navazujícími hashy.

## Verification

- Root actual přejímka24Oct10:00–10:24UTC: entryV21/helper9a594e60 celýcorpus539/539, startupV22/helpera6294c4b512/512, dvaimmutablebuildyPASS. Původnílimits/getter a foreignscene testgap opravené v novýchkopiích, všechny3patchreviewvrstvy[]; legacy/source15sealy zachované.
- ActualGuestentry8frames2646→2654 fixedMedium1/2040×986/night23Oct22/pending0/error0/hook0; raw902f944f jecomplete. ActualGueststartup71.212s/76etap/Low7frames175→182 complete, rawd9ed0db9. Diagnostika odlišila carprepare residual48ms od startupengineAPI625.9ms; nevyřešila produktovýhitch205.2ms ani nepotvrdilaFPS. Celá migrace/main/default zůstávajíotevřené.
- Evidence validation/diagnostics-window3-20261024 včetněaudit29payloadů; entryoriginal chybísession-end a obaoriginals mají1recordSizegap. STOP/release6resources10:24UTC předhardend10:25, B1+B6 nyní drží výpočty. ŽádnýdalšíGPU/build/server beznovéhopředání.

- Nové cílené `node --import tsx --test` moduly, exact transform/pin/schema/lifecycle kontroly; všechny spuštěné příkazy a omezení v task handoffu.
- Celý helper corpus, build a GPU nesmí běžet bez přiděleného heavy okna. NullEngine/syntetické časy nejsou GPU důkaz.

Root: oba source packy předané a claims převzaté po release. Startup38/92577509 má41 cílených PASS, entry39/509888eb má42 PASS. Celé corpora, build a GPU stále pending; formální review čte jen vlastní helper delta proti immutable V17.


### Review round1

Všechny tři čtecí vrstvy dokončené.

| Nález | Verdikt/cesta | Důkaz |
|---|---|---|
| blind-1 | medium/patch | Clock odmítne Guest před ownerem; null profil pak zneplatní původní rejected receipt. |
| edge-1 | medium/patch | Nová identita startupRoutines není v pipeline-inputs whitelistu. |
| edge-2 | medium/patch | Druhý RTT add může selhat před zaznamenáním prvního cleanupu. |
| verification-1 | medium/patch | Skutečný transformovaný Game callsite není vykonaný bez ruční registrace. |
| verification-2 | medium/patch | Chybí přímý Standard readiness→engine řetězec a native Standard fixture. |

Root ověřil první tři větve v source/caller řetězci; obě verification mezery mají předověřený test/search důkaz. Všechny opravy jsou lokální bez nového veřejného API. V18/helper92577509 a509888eb i jejich118/174seals zůstanou immutable; autor vytvoří sousední helper/v19 a nové review-fix-v19 důkazy. Původní handoffy také nepřepisovat.

### Review patch follow-up

V19 startup má4úzké source/test změny a21cílených PASS po RED17/4. V19 entry mění pouze test+README:2nové Standard regrese PASS a obě selžou po izolované ancestor5 mutaci. Všechny3čtecí vrstvy opraveného diffu vrátily[]. Verification-1/2 uzavřeny skutečnými Game/Standard callsite testy; root nezávisle rehashoval staré118/174 i nové62/90payloady. PůvodníV18/HDF bezezměny. Celé corpora, nové buildy a skutečná GPU přejímka zůstávají pending; nejde o uzavření KEY22.
