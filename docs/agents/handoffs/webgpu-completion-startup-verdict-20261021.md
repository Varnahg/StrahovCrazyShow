# Předání: webgpu-completion-startup-verdict-20261021

- Vlastník: webgpu-completion-01a15a3e-startup-verdict; příjemce: webgpu-completion-01a15a3e-root.
- Pracovní kopie: C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020; větev codex/webgpu-completion-20261021; výchozí HEAD e9ac917d454f85643886679c29bf546c4e230288. Při závěrečné kontrole HEAD fd3feb805df05bc05a0f42b591b907693803a551 z nezávislé práce koordinátora.
- Výsledek: lokální kandidát synchronního submit verdictu callbacku light preparation. run/stop přijímají callback () => boolean. Zdravý průběžný tick i právě zdravě dokončený tick vrací true; timeout, failed, disposed a již dříve dokončený pozdní callback vrací false. Hodnota vzniká po původní práci, finish, restore a cleanup.
- Změněné soubory: client/light-preparation.ts; tests/light-preparation.test.ts; docs/agents/handoffs/webgpu-completion-startup-verdict-20261021.md. Žádný staging ani commit.
- Cizí změny: koordinátorův Game/spec/measurement/validation/presentation a rendererův startup-preparation-loop i související testy. Nebyly měněny, stážovány ani převzaty. Předchozí default kandidát již převzal koordinátor; tento task do něj nezapisuje.

## Podklady, volba a refaktoring

Načteny aktuální AGENTS.md, bmad-policy, task, spec-key-22-webgpu-completion.md s kontextem webgpu-migration.md a research/startup-scheduling-decision.md. Původní void tick zachytí chybu do výsledku Promise; manuální frame owner proto neměl bez čekání na microtask spolehlivou informaci, zda smí zavolat endFrame. Verdikt pouze po draw by přehlédl následnou chybu effects, revision, restore, cleanup nebo závěrečný timeout. Čekání na Promise zase nemůže udržovat GPU frame otevřený přes await.

Původní tick je nyní advance() se zachovanou stage/check/draw/restart logikou. Vnější tick vyhodnotí výsledek až po jeho návratu. Finální status se ve finish spočítá jednou a sdílí mezi původním Promise výsledkem a synchronním verdict. Tím se nekopíruje logika timeoutu ani cleanup.

Po dohodě s koordinátorem je na konci dosud běžícího ticku ještě původní canWork(): poslední effects/revision/collect callback mohl spotřebovat deadline až po dřívější kontrole. Nový check při témže překročení synchronně dokončí metadata a restore přes původní finish, místo čekání na další callback/watchdog. Jde o časnější settlement stejného původního překročení; limit, varianta, readiness a stage pořadí se nemění. Regrese výslovně pokrývají všechny tři pozdní callbacky.

Disposal uvnitř závěrečného stop cleanup zachovává původní complete Promise výsledek, protože původní done guard již blokoval druhý finish. Nové závěrečné isDisposed veto přesto vrací false, takže frame nelze submitnout. Tento úzký rozdíl je otestovaný a předaný renderer agentovi; root musí nadále kontrolovat živost vlastníka před ready.

Nevzniká scheduler, další render, GPU frame, cache, materiálová varianta ani změna 30/90s limitů. Runtime přidává jeden scalar settledStatus, tenký synchronní wrapper a poslední lifecycle/deadline kontrolu. Žádná nová cache nebo asynchronní práce.

## Skutečně provedené ověření

21. 10. 2026 přibližně 09:02 UTC:

    pnpm --config.verify-deps-before-run=false exec tsx --test tests/light-preparation.test.ts

Finální běh: exit 0, 39 testů, 39 PASS, 0 FAIL/SKIP/CANCELLED/TODO; runner duration 606.0181 ms. Zachovaných 18 původních testů a 21 nových verdict regresí. Před kontrolou synchronní hodnoty se nečeká na Promise. Negativní případy zahrnují apply, meshes, beforeChecks/check, effects, render, výjimku po skutečném draw, postdraw revision, stop/clearTimer/oba detach callbacky/restore, timeout během finálního stop/restore, disposal a stale callback.

Předchozí průběžný běh před doplněním pozdního canWork: 36/36 PASS; není zaměňován za finální důkaz. Po finální změně byl také spuštěn cílený TypeScript program s kořenovými soubory právě client/light-preparation.ts a tests/light-preparation.test.ts, projektovými tsconfig options a noEmit:true: exit 0, diagnostics []. Syntaktická kontrola obou souborů rovněž bez diagnostiky. Git diff --check pro oba soubory: exit 0. Původní LF zachováno. Stdout je ve výstupu nástroje předání; samostatný log nebyl v tasku vyhrazen.

## Identita kandidáta

SHA256 UTF-8 kompaktního JSON pole těchto dvou objektů v uvedeném pořadí: 70b348814cf7fbe5b158093d59dea4578c9eeeeccfad9a8595ccfd555c6d6c77.

```json
[
  {
    "path": "client/light-preparation.ts",
    "bytes": 15989,
    "sha256": "28e13d79c3d40379a4968637c682c8a22164d2ecc9c3d9fbe6529498a29af8e8"
  },
  {
    "path": "tests/light-preparation.test.ts",
    "bytes": 25074,
    "sha256": "acd1725adb403c71bc12b8abf9eca23372dd44ba4da8f731ff1b6799a08148bf"
  }
]
```

## Procesy, rezervace a další krok

Všechny vlastní cílené CPU příkazy skončily. Žádný build, server, port, GPU, plná sada, helper proces, staging nebo commit. Claim se po předání uvolní; skutečný release dokládá výstup nástroje. Uvolnění neznamená KEY22 Done.

Root a renderer agent vlastní zapojení callbacku do lazy begin/end adapteru, Game wiring a společnou přejímku. Nutné navazující důkazy: žádný submit po false verdict, zachování jediného GPU flight při stop/run a přechodu kvalit, full test/build/izolovaná integrace a skutečný GPU startup i obraz/výkon na neměnném snapshotu. Tento CPU task netvrdí odstraněný timeout, vyšší FPS ani přijatý WebGPU default.

Integrátor: zatím nepřevzato; stav tasku a společnou evidenci doplní koordinátor po kontrole.
