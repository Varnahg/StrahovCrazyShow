# Kontrakt řadiče KEY-46 (20.10.2026)
Koordinátor: bmadctl-01a155b2. Toto je závazné integrační rozhraní mezi engine a adapters; potřebné změny domluvit před změnou exportů.

## CLI a manifest
`node scripts/autodev.mjs run --assignment <path> [--repo <path>]`
`node scripts/autodev.mjs status --run <id> [--repo <path>]`
`node scripts/autodev.mjs resume --run <id> [--repo <path>]`
JSON stdout, diagnostika/logy na stderr či v runDir. status pouze čte. Žádné obecné `--adapter` z CLI; injekce fake adapterů jen programovým API testů.

Manifest schemaVersion 1:
```json
{
 "schemaVersion": 1,
 "issue": "KEY-47",
 "task": "bmad-controller-live-pilot-20261020",
 "workerTask": "bmad-controller-live-pilot-worker-20261020",
 "repository": "Varnahg/StrahovCrazyShow",
 "baseBranch": "main",
 "intentFile": "docs/agents/assignments/bmad-controller-pilot-20261020.md",
 "artifactDir": "_bmad-output/implementation-artifacts/bmad-controller-live-pilot-20261020",
 "handoffFile": "docs/agents/handoffs/bmad-controller-live-pilot-20261020.md",
 "checks": [{"id":"lfs-cli","command":"node","args":["--test","tests/lfs-assets-help.test.ts"]}],
 "prTitle": "Přidat nápovědu kontroly LFS",
 "linearStates": {"active":"In Progress","done":"Done"},
 "acceptance": {"kind":"cli","description":"Ověřená nápověda CLI a nezávislé review"},
 "merge": true
}
```
Manifest se validuje a zmrazí před efekty; zadání má být verzované v base. Repo skutečnou identitu ověřit, uvedený název příkladu se musí nahradit skutečným remote. Task writePaths zahrnují artifacts, handoff i renderer output před jejich zápisem. check commands bez shellu. Task nesmí mít heavy resources trvale; pokud checks potřebují heavy, manifest může mít předem založený `validationTask` resource-only task, který adapter claimne jen po dobu verify. Neznámá UI/GPU acceptance se automaticky neschvaluje. V1 podporuje pouze explicitní CLI acceptance.

## Engine exports
`engine.mjs` exportuje `run({repo,assignment,adapter?,onEvent?})`, `resume({repo,runId,adapter?,onEvent?})`, `status({repo,runId})`.
`assignment` v programovém API je cesta k JSON. Default adapter se načte dynamicky z `createAdapter()` v adapters.mjs; testy mohou dodat vlastní objekt.
Stabilní runId podle canonical repo + issue, např. `key-47-<12hex>`; manifest digest immutable. Jediný state writer. Run data v `<gitCommonDir>/autodev/runs/<runId>/`. Nepředpokládat volný .cache scope v pilot worktree.
Stavy: running, stopped (známá recoverable chyba), unknown (nejasný worker), complete. Záznam `stage`, `data`, `attempts`, `lastError`, identity + timestamps.
Stages v pevném pořadí: `prepare, plan, implement, review, verify, commit, publish, ci, accept, merge, finalize`.
Adapter: `await adapter.runStage(stage, ctx)` -> objekt patch do `state.data`; po úspěchu engine checkpointuje a postupuje. Každý adapter krok je znovuspustitelný a reconciles skutečné efekty.
ctx:
- `repo, runId, runDir, assignment` (parsed), `state` (current), `data` (current state.data)
- `save(patch)`: await durable merge do data, aktualizuje ctx.data.
- `supervise({key,command,args,cwd,env?,heartbeat?})`: durable attempt; returns `{exitCode,stdoutPath,stderrPath,...}`. key unikátní stage/command, args explicit. env merge s process.env (žádné credentials do persisted request). heartbeat optional `{command,args,cwd,intervalMs}`, nepřenášet tajné environment hodnoty na disk.
- `fault(point)`: test hook process crash po checkpointu/efektu. CLI environment `AUTODEV_TEST_CRASH_AT` se smí používat pouze jako zjevně dokumentovaný fault injection; jednorázový marker v runDir zajistí, že resume znovu nepadne.
- `emit(event)`: průběžné JSON události; bez tajných údajů.
- Volitelné `adapter.close()` po ukončení run/resume (app-server lifecycle).
Engine drží OS IPC singleton; stavy poškozené/unknown neobnovuje resetem. Supervisor drží oddělený IPC endpoint, zápis started před spawnem, terminální receipt, heartbeat; při pádu controlleru běží dál. Resume se připojí/přečte receipt. Chybějící supervisor po started -> unknown. Neopakovat neúspěšný worker automaticky. `process.mjs` může exportovat execute helper, ale adapters může mít vlastní execFile wrapper bez cyklu.

## Adapter povinnosti
prepare: ověřit assignment, issue a git remote/base; deterministický sibling worktree/branch `codex/autodev-<runId>`, owner `autodev:<runId>`. Rekonciliace worktree + claim (nikdy adopt-dirty ani steal); dirty pouze v již doloženém vlastním run. Přesný claim owner/worktree/scope. Issue active a jeden aktualizovatelný Linear komentář s run markerem (list a id reconciliation).
plan/implement/review: skutečný Codex worker spuštěný přes ctx.supervise. Projektový BMAD policy před rendererem; renderer pod claimem, planning artifacts pod artifactDir. Fresh read-only nezávislé review. Explicitní schema výstupu, skutečná kontrola diff scope, před implementací výzkum variant; worker nemá GitHub/Linear mutační oprávnění ani commit/PR odpovědnost. Codex default model (bez override).
verify: manifest checks, skutečné exit codes/logs; audit diff proti claim; invalidace review při jiné source identity.
commit: explicitní soubory, stabilní commit marker, reconcile tree/parent; žádné blanket stage. Handoff zahrnuje skutečné důkazy.
publish: push normální větve; PR lookup všech stavů dle head/base/repo + run marker. Po PR create `ctx.fault('after-pr-create')` před checkpointem je povinný živý failure bod. Žádné duplicitní PR. PR URL emitovat (parent integrátor připojí v app UI).
ci: skutečně počkat na `verify` a `source-secret-hygiene` pro přesný head a GitHub Actions app. Neopakovat done checks jako novou práci.
accept: jen validní CLI practical evidence + čisté review + oba checks + nezměněný head/base. Vystavit project-acceptance na SHA se skutečným evidence URL.
merge: guard exact head, recheck base; GitHub chráněný merge bez admin bypass. Pokud merge=false, skončit jako připravený PR bez Linear Done.
finalize: ověřit merge do main + main CI; Linear done + aktualizovat stejný komentář; release claim až po handoffu a ukončení procesů. Task katalog mění koordinátor; controller nesmí nezarezervovaně měnit katalog. Živá přejímka zahrne finální koordinátorské převzetí.
GitHub přes gh; Linear přes podporovaný app-server MCP API (ověřený probe v .cache/bmad-controller-development). Implementovat direct RPC s timeouts/exit handling/close, ephemeral thread bez modelového turnu, tool inventory validation a explicitní tool calls. Žádné čtení tokenů ze souborů.


## Upřesnění před implementací adapters
- Manifest má povinný disjunktní `workerTask`. `task` vlastní pouze plan/artifactDir/handoff/renderer, `workerTask` source a testy. Worker executor drží stabilní owner `autodev:<runId>:worker`; controller `autodev:<runId>`. Obě rezervace se ověřují a heartbeatují, nikdy se nezapisuje do stejné cesty souběžně. Implementační prompt musí výslovně načíst task a ověřit vlastní claim před zápisem. Read-only review nemá zápisový claim.
- ctx.supervise heartbeat přijímá objekt nebo pole objektů, pro udržování obou claims.
- Nezávislé review má tři čerstvé read-only průchody: blind/edge/verification. Nálezy musí být doložené, bez minimálního počtu. V1 při podloženém nálezu zastaví, neposkytuje nekonečný automatický repair loop; resume bez nového výsledku nesmí starou chybu považovat za úspěch.
- Ověřený worker probe: `codex exec --disable apps --disable multi_agent -c mcp_servers={} -c web_search="disabled" -c approval_policy="never" --sandbox read-only --ephemeral --json --output-schema FILE -o FILE PROMPT`; skutečný command node -p process.version skončil0 a vrátil v24.19.0. Pro implementaci workspace-write; bez override modelu. App-server naopak musí běžet s apps připojením; dotted mcp_servers.NAME.enabled=false vytváří neúplný transport a selže, nepoužívat.
- Research agent má primární zdroje v explicitním intentFile; pro nové dotčené mechanismy musí web být umožněný read-only nebo přesným doloženým lokálním zdrojem. Neprovádí vzdálené mutace.
- Provozní registry/logy v git-common-dir nejsou commitované deliverables. Do PR patří stručná ověřitelná evidence/handoff a aktuální specifikace, nikoli tokeny či kompletní surová historie modelu.

## Přejímací identity a review workflow
- BMAD step4 launchuje tři nezávislé read-only review současně a triage až po všech výsledcích. Engine supervise musí podporovat nezávislé keys souběžně; implementační kroky zůstávají sekvenční.
- Review evidence obsahuje baseSha a SHA256 úplného implementačního diffu (workerTask source + testy, včetně untracked/mode/deletions). Po review i verify se tato identita znovu ověří. Controllerem generované plan/review/check/handoff důkazy jsou explicitně oddělené od zdrojového digestu, nikoli náhodně vynechané zdroje. Finální commit má navíc přesný očekávaný parent/tree/marker a celý jeho index se audituje.
- Zmrazit manifest, task definice i intent z base. Claim porovnat s uloženou definicí. Cizí staged obsah odmítnout před vlastním stagingem.
- Audit změn zahrnuje tracked/untracked a ignorované výstupy, zejména jejich obsahové změny na existující cestě. U fresh worktree není node_modules/dist, model nepotřebuje dependency instalaci pro pilot. Žádné tiché tvrzení o OS izolaci jednotlivých cest: sandbox workspace-write omezuje checkout, přesný task scope je kooperativně ověřený audit.
- Check API v aktuálním main skutečně vrací verify i source-secret-hygiene app.id15368 a úspěšné běhy; main ceddc080 běhy39333225141/39333225050. Pro kandidáta znovu načíst jeho checky; nepřebírat tento výsledek.
- Linear list_comments result tvar {comments:[...],hasNextPage:false}; pokud hasNextPage true a není použitelný cursor, fail-closed místo předpokladu, že marker neexistuje. Výsledek tool call bývá JSON v text content; ověřit isError.
- Ztracený response po create: předem uložený intent a reconcile lookup; když není jisté, že efekt nevznikl, unknown. after-pr-create fault nastává po úspěšném API vytvoření, ale před ctx.save(PR), resume musí dohledat jediný existující PR.

## Závazné doplnění skutečné BMAD vazby před integrací
Samotný renderer a obecné role nestačí. Planner čte konkrétní snapshot step-02-plan.md/spec-template.md a vrací také explicitní intentGaps (neprázdné blokují implementaci), code map a připravený plán. Controller pod svým claimem vytvoří skutečný spec.md podle šablony, baseline_commit a frozen intent/constraints/AC odvozené z přidělení (bez nových domyšlených požadavků). Uloží identitu specifikace, implementační worker čte spec_file a projektový step3 handoff.

Review používá skutečné launch instrukce step4 a jeho snapshot lenses. Blind nedostane intent/plan/spec/obecný workflow prompt; edge dostane claims_file až podle pozdního claims checku; verification nedostane claims. Výstupy mají originální kontrakty lenses: edge JSON array, verification předepsaný Markdown nebo přesně No verification gaps found., blind čistý []. Nepoužívat současné jednotné schema s povinnou priority, které metodice odporuje. Raw výsledek se zachová a normalizuje až po dokončení; neplatný/neúplný/missing diff nikdy není clean. Evidence obsahuje použité prompt/spec/diff identity. V1 při nálezu zastavuje, neprovádí nekonečnou triage/repair smyčku.

Cílené regrese: chybějící snapshot, skutečné rozdělení promptů a jejich blindness, intent gap readiness, frozen spec/replay po progress výpadku, per-lens výstupní parsování. Doplnění navazuje sekvenčně po recovery QA; žádné souběžné zapisování implementací.
