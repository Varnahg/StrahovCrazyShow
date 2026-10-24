# Předání: webgpu-completion-startup-fixture-20261021

- Vlastník: webgpu-completion-01a15a3e-startup-fixture; příjemce: webgpu-completion-01a15a3e-root.
- Pracovní kopie: C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020; větev codex/webgpu-completion-20261021; výchozí i závěrečný HEAD fc2f3eb94e0119b2ad57cba7fdfbab3fd5d1d7a0.
- Změněné soubory: tests/game-webgpu-startup.test.ts a docs/agents/handoffs/webgpu-completion-startup-fixture-20261021.md. Žádný runtime soubor, cizí snapshot, metadata, staging nebo commit.
- Výsledek: opravena chybějící dependency StartupPreparationLoop ve VM prostředí skutečného Game.start. Původních 13 startup testů zůstává včetně všech původních cancellation/health/readiness/late-cleanup tvrzení.

## Doložený problém a volba

Načteny aktuální AGENTS/policy, task, specifikace KEY22 s kontextem migračního kontraktu a startup scheduling decision. Historický neměnný full run40a363 skončil 1912 PASS, 9 FAIL a 2 SKIP z1923 testů; šest selhání bylo ReferenceError nové VM dependency. Tento původní log/snapshot nebyl měněn a není vydáván za úspěch. Zbylé tři statické vstupy vlastní jiný task.

Pouhé přidání prázdného adapter stubu by odstranilo ReferenceError, ale neověřilo nový frame/fence kontrakt. Fixture nyní předává skutečný StartupPreparationLoop s injektovaným omezeným task hostem a stále používá skutečný RenderHealth. Původní light preparation je výslovný IO stub: provede jeden skutečný run/render/stop tick a vyřeší svůj výsledek před dokončením submit fence, stejně jako původní light helper. Plný katalog variant má samostatné integrační testy. Host používá deterministické microtasks bez nativních portů; nejedná se o emulaci browserové cadence ani výkonu.

Refaktoring centralizuje kontrolovaný queue/validation/device-lost transport do jedné fixture; actual adapter se nepatchuje a jeho waitForIdle se nenahrazuje. Nové čtyři whole-start případy ověřují: zadrženou validaci i fence, jejich oddělené uvolnění před finálním gate, původní identitu queue rejection a abort/native device-loss během pending fence. Pozdní dokončení nesmí spustit gameplay ani zdvojit cleanup. Původní pipeline/effect readiness a finální submitted gate tvrzení nebyla oslabena.

## Skutečné ověření

21. 10. 2026 přibližně09:44UTC:

    pnpm --config.verify-deps-before-run=false exec tsx --test tests/game-webgpu-startup.test.ts tests/game-preparation-scheduler.test.ts

Exit0; **22/22 PASS**, 0 FAIL/SKIP/CANCELLED/TODO, runner duration1966.0847ms. Z toho17 skutečných whole-start fixture testů (13 původních +4 nové) a5 nezměněných post-loader/scheduler testů. Před doplněním nových případů prošlo18/18; konečným důkazem je22/22. Stdout je zachován v tool výstupu chunk a0dbdd. Testy používají NullEngine a kontrolovaný device/asset/gate IO; nedokazují skutečný GPU submit, vzhled nebo FPS.

Cílený TypeScript program s rootFiles právě obou uvedených testů, projektovými tsconfig options a noEmit:true: exit0, diagnostics []. Git diff --check: exit0. Kontrola přesného diffu:146 přidaných a5 odstraněných řádků v jediném testu; původní LF zachováno.

## Přesná identita

Změněný test:

```json
{
  "path": "tests/game-webgpu-startup.test.ts",
  "bytes": 24791,
  "sha256": "44e7b3640c00ffd1ed293ce7ae8014f2dca105eb48f165dfc8854842ed1ffb13"
}
```

Čtené runtime/test závislosti při finálním ověření; nejsou součástí tohoto taskového diffu:

```json
[
  {
    "path": "client/game.ts",
    "sha256": "c3ad05b05d8d64e7a5b0033303a4fa7e330f793ea8bb54a8a0fec976a1384395"
  },
  {
    "path": "client/startup-preparation-loop.ts",
    "sha256": "ea9407a613ece5349320057a528f619cd57d9e08f869f6394a5547c83c09d77f"
  },
  {
    "path": "tests/game-preparation-scheduler.test.ts",
    "sha256": "601b77fd398238e5dd18f7c9a7c5604e53208f9c7b55584ec322116e808ac360"
  }
]
```

## Procesy a převzetí

Pouze dokončené cílené CPU test/typecheck příkazy, žádný server, port, build, GPU, plná sada nebo vlastní pomocný proces. Fixture vytváří pouze řízené JavaScript fronty; skutečný adapter uvolňuje jejich callbacky/listenery při success i fault. Claim se po předání uvolní a úspěšný release dokládá tool výstup.

Root musí změnu zahrnout do NOVÉHO úplného neměnného snapshotu se všemi skutečnými testovými vstupy, spustit full suite/build/izolovanou integraci a praktickou GPU přejímku. Neopravuje se starý snapshot ani testový výsledek. Tento task sám neuzavírá KEY22 ani produkční default. Stav a integraci aktualizuje koordinátor po převzetí.
