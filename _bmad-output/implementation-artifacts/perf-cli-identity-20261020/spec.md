---
title: "Opravit rozlišení identity-change v CLI diagnostiky výkonových incidentů"
type: "feature"
created: "2026-10-20"
status: 'done'
route: "dispatch"
baseline_commit: "6971dfb52ff823a1031b40492833b57b2d888b02"
review_loop_iteration: 0
context: ["{project-root}/AGENTS.md", "{project-root}/docs/agents/bmad-policy.md"]
---



<frozen-after-approval reason="Explicitly assigned intent and task acceptance; controller preserves verbatim source">

## Intent

# KEY-50: věrohodná CLI diagnostika síťových výkonových incidentů

Jediný explicitně přidělený podúkol existujícího KEY-2. Oprav offline report tak, aby přesná událost network-left s data.reason === "identity-change" nezrušila poslední skutečně connected stav pro detekci connection-state-inconsistent. Sama nesmí vytvořit připojení. Všechny ostatní network-left (jiný/chybějící/neplatný reason), network-disconnected a network-connecting zachovají dosavadní význam.

Před implementací projdi celý řetězec Game.setLocalId → sessionDiagnostics → JSONL → summarizeDiagnosticFiles → JSON/text CLI, aktuální testy a přiloženou reprodukci. Porovnej rozumné varianty a zaznamenej volbu, dopady na chování, cache, alokace a lifecycle. Jde o offline interpretaci již existujícího záznamu, nikoli změnu emitovaného schématu nebo herní optimalizaci.

Zachovej:
- původní lifecycle záznam identity-change i přesný reason;
- network-left jako server-clock segmentovou hranici, aby se nepropojovaly čítače odlišných identit;
- chronologické řazení, contextAtMs/age a vyloučení guest vzorků;
- raw intervaly, foreground/hidden výběr, percentily a ostatní síťové incidenty;
- původní vstupní soubory bajtově beze změn.

WRITE pouze scripts/diagnostics-report.mjs a tests/diagnostics-report.test.ts. Implementaci, malý cílený refaktoring a přenositelné native CLI regrese předej společně. Testy mají pokrýt pozitivní identity-change po connected, identitu bez předchozího connected, skutečné leave/disconnected/connecting, jiné/chybějící reasons, guest/stale/out-of-order scénáře a zachování server-clock hranice. Žádné přejmenování historických raw záznamů, renderer/game/UI/recorder změny, nové dependencies ani změny testovacích limitů.

Koordinátor vlastní neměnnou syntetickou fixture a accept-cli.mjs v docs/performance/evidence/diagnostic-identity-20261020/. Čti je, neměň. Skutečné příkazy:
- node --test tests/diagnostics-report.test.ts
- node docs/performance/evidence/diagnostic-identity-20261020/accept-cli.mjs

Druhý příkaz ověřuje plain-Node JSON i text přes samostatné procesy, očekávané2inconsistent windows,9raw frames a server-clock přírůstky20callbacků/12ms ve2srovnatelných intervalech; kontroluje nezměněné bytes fixture. Čísla jsou syntetická acceptance data, nikoli měření FPS/GPU.

Průchod vede nový autodev run přes projektové BMAD, nezávislé blind/edge/verification review, skutečné kontroly, PR CI, exact-head přijetí, merge a main CI. KEY-50 Done až po zelené main CI. Parent KEY-2 zůstává otevřený. Žádný starý run, attempt ani runtime checkpoint se nepřebírá nebo ručně neupravuje.

## Boundaries & Constraints

**Always:** Controller task: `perf-cli-identity-controller-20261020`; writePaths: `_bmad-output/implementation-artifacts/perf-cli-identity-20261020/`, `_bmad/render/bmad-build/`, `docs/agents/handoffs/perf-cli-identity-controller-20261020.md`. Worker task: `perf-cli-identity-worker-20261020`; writePaths: `scripts/diagnostics-report.mjs`, `tests/diagnostics-report.test.ts`. AGENTS.md, task definitions, live claims and docs/agents/bmad-policy.md remain authoritative.

**Never:** add goals, mutate outside assigned scope, or replace frozen intent with assumptions.

**Frozen acceptance:**
- Nový run jednoho přiděleného Linear issue s přesnými vlastními zdroji a zachovanou evidencí.
- Skutečné výsledky kontrol a exact-head přijetí před chráněným PR merge; Linear Done až po zelené main CI.
- network-left s přesným reason=identity-change nezruší poslední skutečně connected stav; samo připojení nevytvoří.
- Ostatní leave/disconnected/connecting události, guest/age/chronologie, server-clock hranice a raw percentily zůstanou zachované.
- Implementace, cílený refaktoring a skutečné CLI regrese společně; původní logy se nepřepisují.
- Plain-Node JSON/text CLI rozlišuje identity-change od skutečného leave, zachovává raw performance a server-clock hranice i vstupní bytes. Offline oprava nemění herní/GPU runtime; není FPS přejímkou parent KEY-2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Změna identity po skutečném připojení | network-connected → network-left s reason="identity-change" → čerstvé multiplayerové okno s connecting, offline nebo disconnected. | Každé takové okno zvýší inconsistentConnectionWindows o 1; kontext connected jej nezvýší. | Porovnávat reason přesně, bez normalizace; zachovat původní lifecycle záznam. |
| Chybějící connected | Identity-change bez předchozího connected, opakovaný identity-change nebo identity-change po skutečném odpojení. | Následná nepřipojená okna nepřidají nesoulad. | Identity-change nesmí vytvořit ani obnovit důkaz připojení. |
| Skutečné ukončení nebo nové navazování spojení | Connected → skutečné network-left, network-disconnected nebo network-connecting → nepřipojené okno; případně pozdější nový connected. | Po ukončující události se nesoulad nepočítá; nový connected opět umožní jeho detekci. | Zachovat dosavadní ukončení connected období i při následném identity-change. |
| Neplatný nebo nepřesný reason | Network-left s jiným, chybějícím či neplatným reason, například null, číslo, objekt, pole, jiná velikost písmen nebo okolní mezery. | Událost ukončí connected období. | Použít původní význam skutečného leave; neprovádět převody typů. |
| Izolace guest vzorků | Guest frame-window po connected a identity-change. | Žádný connection-state-inconsistent; platné raw intervaly nadále vstupují do příslušné výkonové distribuce. | Guest vyloučit pouze z detekce síťového nesouladu. |
| Stáří kontextu | Kontext před skutečným connected, přesně v jeho čase nebo po něm, včetně kontextu před identity-change doručeného později. | Kontext starší než connected se nepočítá; rovnost a novější kontext se posuzují vůči původnímu connected, nikoli času identity-change. | Zachovat fallback na record.atMs při nečíselném nebo chybějícím contextAtMs. |
| Pořadí doručení | Stejné události a okna doručené v přeházeném pořadí nebo v obráceném pořadí souborů. | Vyhodnocení podle seq poskytne stejný počet nesouladů. | Zachovat dosavadní varování při zpětném atMs a stávající deduplikaci. |
| Hranice server-clock | Server-clock vzorky před a po network-left/reason=identity-change. | Vzniknou oddělené segmenty; první platný vzorek nového segmentu je baseline a mezisegmentový rozdíl se nepřičte. | Nepřenášet baseline ani zastaralý kontext přes network-left. |
| Ostatní diagnostické výsledky | Původní foreground, hidden a transition intervaly společně s overflow, correction a resync událostmi. | Počty, percentily, visibility výběr a ostatní síťové incidenty zůstanou stejné. | Zachovat existující validaci intervalů a oddělení překrývajících se observer záznamů. |

</frozen-after-approval>

## Code Map

Pozorováno na HEAD 6971dfb52ff823a1031b40492833b57b2d888b02 s Node v24.19.0: git status --short je prázdný. Přímé čtení claims.json potvrzuje oba zadané vlastníky, správnou worktree a přesně oddělené rozsahy; nebyl použit zapisující status CLI. Lokální intent odpovídá SHA256 c8b80a07beda169b75ca158290cb9bdee8f148e3a2cea7c5acf1f4937538d53c. Adresář specifikace zatím neexistuje, takže není draftový frozen blok k zachování. Prošel jsem producenty, sanitizaci, serializaci, JSONL persistence, report i oba CLI výstupy. Doložená příčina je connected=false vložené pro každý network-left. Nyní spuštěný accept-cli.mjs skončil očekávaným výchozím selháním 0 !== 2; oba subprocess CLI předtím uspěly a vstup zůstal nezměněn. Samostatné čtení reportu ověřilo 9 snímků, p50 16 ms, p95/p99/max 100 ms, clock 20 callbacků/12 ms ve 2 intervalech a zachované identity-change v lifecycle i textu. Fixture má SHA256 4056d5f4cb396a9b0dfd92d2cc915a7bda3ed1f8146fbfa99873f15e52dd96c6. Původních 29/29 testů je doloženo baseline.json se shodnými hashi zdrojů; v tomto plánovacím kroku nebyly znovu spuštěny. Žádné soubory ani rezervace nebyly změněny.

- `client/game.ts` — [intent] Game.setLocalId, řádky 1170–1197: emituje network-left/reason=identity-change a resetuje epochu predikce; neodpojuje transport. Pouze číst.
- `client/ui.tsx` — [intent, worker:1] bind:647 emituje connected, onLeave:756 disconnected, connect:784 connecting a leave:881 skutečný network-left bez reason. Zachovat producenty.
- `client/session-diagnostics.ts` — [intent, worker:1] event:266 a resetFrameContext:294 oddělují cache kontextu při lifecycle hranicích; enqueue:428 zachovává kind/data, prepareBatch:513 serializuje JSON. Neměnit recorder ani jeho lifecycle.
- `shared/session-diagnostics.ts` — [intent] Schéma 1, sanitizeDiagnosticsData a validateDiagnosticsBatch zachovávají technický reason jako řetězec. Znovu použít existující kontrakt bez změny schématu.
- `server/session-diagnostics.ts` — [intent] persist:244 ukládá validované records do JSONL, serializace:326 a appendFile:380. Dokládá cestu na disk; bez změn.
- `scripts/diagnostics-report.mjs` — [worker:0, worker:1] Vadná klasifikace connectionEvents:555–567 převádí každý network-left na connected=false. Upravit pouze toto rozlišení; zachovat samostatné CLOCK_BOUNDARIES:82, clockEvidence:96, lifecycle:543, řazení a kontrolu contextAtMs:637–652, distribuce i CLI:895.
- `tests/diagnostics-report.test.ts` — [worker:2] Využít row/record/fixture:12–41; rozšířit síťové regrese u testu:409. Existující testy pokrývají raw percentily, visibility, další incidenty, duplicity a server-clock segmenty. Doplnit skutečné subprocess JSON/text CLI.
- `tests/session-diagnostics.test.ts` — [intent, worker:1] Test:100 dokládá oddělení serializovaných kontextů při network-left a dalších hranicích. Pouze primární podklad, bez zápisu.
- `docs/performance/evidence/diagnostic-identity-20261020/input.jsonl` — [intent] Neměnná syntetická reprodukce: identity-change po connected, skutečné leave/disconnected/connecting a oddělené clock segmenty. Vlastní koordinátor.
- `docs/performance/evidence/diagnostic-identity-20261020/accept-cli.mjs` — [intent, acceptance] Neměnná přejímka spouští plain Node JSON/text pomocí process.execPath bez NODE_OPTIONS a kontroluje vstupní bytes, 2 nesoulady, 9 raw snímků a clock 20 callbacků/12 ms ve 2 intervalech. Vlastní koordinátor.
- `docs/performance/evidence/diagnostic-identity-20261020/baseline.json` — [intent] Původní výsledek 29/29 testů a selhání přejímky 0 místo 2; hashe reportu, testů, fixture a přejímky odpovídají nyní přečteným souborům.

## Tasks & Acceptance

**Execution:**
- [ ] `scripts/diagnostics-report.mjs` -- Upravit klasifikaci přechodů připojení tak, aby přesný identity-change neměnil poslední skutečný stav; provést malý interní refaktoring predikátu bez změny lifecycle, clock hranic, řazení a časových kontrol. -- Odstraní doložené potlačení nesouladů a zachová původní connected čas bez dalšího stavového modelu. (basis: worker:0)
- [ ] `tests/diagnostics-report.test.ts` -- Doplnit tabulkové regrese hraničních případů z I/O matice a přenositelné native JSON/text CLI regrese přes process.execPath bez shellu a loaderu; využít stávající fixture helper a zachovat testovací limity. -- Pokryje dosud chybějící identity-change, ochrání skutečné leave, guest, stáří, pořadí, raw statistiky, clock segmentaci a neměnnost vstupů. (basis: intent)

**Acceptance Criteria:**
- Given Neměnná syntetická fixture a opravený report dostupný přímo přes Node., when Řadič spustí node docs/performance/evidence/diagnostic-identity-20261020/accept-cli.mjs., then Přejímka skončí kódem 0; JSON i text vykážou 2 connection-state-inconsistent, 9 raw snímků, p50 16 ms, p95/p99/max 100 ms, averageFps 9000/264 a server-clock 20 callbacků/12 ms ve 2 srovnatelných intervalech. (basis: intent)
- Given Původní vstupní JSONL soubory s uloženými bajty před zpracováním., when CLI dokončí čtení a vytvoření reportu., then Bajty všech vstupů zůstanou shodné s původními, včetně neúplných či neplatných záznamů. (basis: worker:2)

## Implementation Notes



## Spec Change Log



## Review Triage Log



## Design Notes

[worker:0, worker:1, worker:2] Analýza je připravena pro implementaci. Přesný network-left s data.reason === "identity-change" nebude vložen mezi přechody připojení; celý záznam zůstane dostupný lifecycle i server-clock analýze. Malý interní predikát sjednotí klasifikaci bez nového stavu, veřejného API či alokace seznamu pro každý záznam. [controller:0, controller:1] Route zůstává dispatch podle autorizace řadiče. Publikace, Linear, PR, merge a main CI jsou jeho samostatné účinky. Keep-full již rozhodl koordinátor; přesný počet tokenů nebyl měřen.

**Zvažované varianty:**
- [worker:0, worker:1] Vynechat přesný identity-change pouze při sběru connectionEvents: nejmenší změna, zachová původní connected událost i její čas. Zvolená varianta.
- [worker:0] Uchovávat identity-change jako neutrální přechod a ignorovat jej při vyhodnocení: možné, ale přidává nepotřebné záznamy a riziko přepsání času původního connected.
- [intent] Změnit producenta nebo historické logy: neřeší původní archivy bez dalších zásahů a překračuje autorizovaný rozsah.
- [worker:1] Ignorovat všechny network-left nebo odstranit jejich server-clock hranici: porušilo by skutečné opuštění relace a propojilo čítače různých identit.

**Primární podklady:**
- AGENTS.md; docs/agents/README.md; docs/agents/architecture.md; docs/agents/current-work.md; docs/agents/bmad-policy.md
- docs/agents/tasks/perf-cli-identity-controller-20261020.json; docs/agents/tasks/perf-cli-identity-worker-20261020.json
- docs/agents/assignments/perf-cli-identity-20261020.md; docs/agents/assignments/perf-cli-identity-20261020.json
- C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.git/agent-coordination/claims.json
- Primární kód a testy uvedené v codeMap
- docs/performance/evidence/diagnostic-identity-20261020/research.md; baseline.json; baseline-cli.stderr.log; input.jsonl; accept-cli.mjs
- Inline step-02-plan.md, SHA256 52bd48a5e33f92c3a9e5013778ed19e42a69322e8888617a4c60a31ff27a28c1; spec-template.md, SHA256 e217325964857ebd90a9508bf171eddc2c4ad1b0b9b32a119775ac5c015695fd; project-authorization.json a jeho authorization.bases

**Rizika a omezení:**
- [worker:1] Plošné přeskočení celého identity-change záznamu by odstranilo lifecycle a clock důkazy; výjimka musí platit pouze pro connectionEvents.
- [worker:1] Nahrazení času posledního connected časem identity-change by změnilo posuzování stáří kontextu.
- [intent] Dopady na alokace jsou návrhový závěr: konstantní predikát nepotřebuje novou cache ani zdroje. Výkonnostní zisk nebyl měřen; syntetická čísla nejsou FPS/GPU přejímka.

## Verification

**Commands:**
- `node --test tests/diagnostics-report.test.ts` — expected: exit 0; actual results recorded by controller
- `node docs/performance/evidence/diagnostic-identity-20261020/accept-cli.mjs` — expected: exit 0; actual results recorded by controller

Plain-Node JSON/text CLI rozlišuje identity-change od skutečného leave, zachovává raw performance a server-clock hranice i vstupní bytes. Offline oprava nemění herní/GPU runtime; není FPS přejímkou parent KEY-2.

## Controller Planning Decisions

Route: dispatch. The assigned controller run includes external Linear progress, Git push, PR publication and project acceptance, plus merge/main CI when merge=true; these are actual assigned external effects, even when worker source changes are small.

Observed worker footprint: `scripts/diagnostics-report.mjs`, `tests/diagnostics-report.test.ts`. Worker irreversibles: []. New callable/dependency surfaces: [].

Scope: keep-full, decided by the controller under existing single-task authorization; no new user approval is claimed. Retain the single assigned goal and its frozen acceptance. Splitting would change the delegated scope; this is a presentation decision, not new user approval or permission to add goals. Not measured; no exact model-token count is claimed. Keep-full applies regardless of length and accepts the context-length risk.

Authorization SHA256: 8cada6bf5b17737f9fe7cac2f3ef42e01903bccfa008fc108a38f8adc770b045. AGENTS.md and docs/agents/bmad-policy.md require autonomous completion of authorized work; routine format/route decisions do not request another approval. Only unresolved user-visible intent choices are intentGaps. Real missing inputs or runtime prerequisites still block readiness.
