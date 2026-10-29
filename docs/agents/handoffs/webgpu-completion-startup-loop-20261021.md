# Předání: webgpu-completion-startup-loop-20261021

- Vlastník: `webgpu-completion-01a15a3e-startup-loop`; příjemce `/root`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/webgpu-completion-20261021`; výchozí HEAD při převzetí `e9ac917d454f85643886679c29bf546c4e230288`. Runtime kontext je přijatý main `9341bcef`; navazující root metadata nejsou GPU checkpoint.
- Rozsah: pouze nové `client/startup-preparation-loop.ts`, `tests/startup-preparation-loop.test.ts` a toto předání. Žádný staging/commit. Všechny ostatní rozpracované soubory ponechány jejich vlastníkům; žádný cizí WIP ani snapshot4211 nebyl převzat.
- Podklady před implementací: aktuální AGENTS/policy/architecture/coordination a task, `_bmad-output/implementation-artifacts/spec-key-22-webgpu-completion.md` včetně odkazovaného migračního kontraktu, `research/startup-scheduling-decision.md`, pinovaný Babylon9.30 actual begin/end/flush a současné OnDemandRender/RenderHealth/render-startup/light/pipeline helpers. Přímý delegovaný podagent nespouštěl další BMAD ani podagenty.

## Výsledek a API

`new StartupPreparationLoop(engine, health, { signal?, host? })` poskytuje `run(callback: () => boolean)`, `stop(callback)`, `render(work)`, `waitForIdle()` a `dispose()`. `StartupPreparationHost` je injektovatelný pro testy; výchozí host vlastní jediný queued MessageChannel task a oba porty. OnDemandRender je znovu použitý beze změny.

CPU-only tick nevytváří engine frame ani falešnou health validation operaci. Skutečný draw líně otevře validation scope a beginFrame. Teprve synchronní verdict celého light ticku rozhodne o endFrame; žádný frame nepřesahuje await. Úspěšný stop uvnitř callbacku dokončí svůj zdravý frame. Jeden původní OnDemandRender vlastní pending scope/fence i přes následující run jiné quality pass. Nový pass nemůže obejít pending GPUflight.

Root schválil nutné úzké rozšíření `waitForIdle`: poslední light callback může resolve svůj výsledek ještě před fence. Po dokončené light přípravě a stop callbacku se musí před samostatným `waitForRenderStartup` zavolat `await loop.waitForIdle()`. Reentrant/aktivní caller dostane konkrétní chybu namísto bariéry předchozí pass. Root drží jediný adapter až do finally po finálním submitted gate; Game wiring vlastní root, tento task jej neupravoval.

False verdict bez vlastního draw/begin throw jen vyřadí adapter a nevyrobí předčasný health fault; původní Game tak může uložit svůj timeout/restore/cleanup/disposal výsledek. Skutečný draw/begin throw zachycený adapterem má přednost i když jej light helper spolkl do false. OnDemand onError předá přesnou původní hodnotu do RenderHealth a vyřadí vlastníka; testované i `throw 0`, `throw undefined`, `throw false`. EndFrame zůstane zakázaný. Queue/scope chyby se sledují přes health.track, late promise je spotřebována a device loss/health generation/abort/engine disposal ruší work owner i čekání na idle.

Skrytí zastaví nové dávky. Již zahájený zdravý draw lze dokončit jako v existujícím final startup helperu; jeho pending fence se zachová. Obnovení neobejde fence. Dispose vypne scheduler, uvolní lifetime guard, všechny observery a porty i při chybě jednoho cleanupu; cleanup chyba se uchová v health. Nepřebírá ani nedisponuje engine/scénu.

Refaktoring: jednotný per-tick frame state bez redundantních rendered/rendering flagů, společný OnDemand scheduler pro všechny passy, skutečné scope-only health operace a jeden cleanup průchod. Žádná nová shader/material/resource cache, změna variant/ABI/kvalit, browser flagů, watchdogů nebo gameplay/editor RAF.

## Skutečné ověření

- `pnpm --config.verify-deps-before-run=false exec tsx --test tests/startup-preparation-loop.test.ts tests/on-demand-render.test.ts` dne21Oct2026 v09:08UTC: **36/36 PASS, fail0, cancelled0, skip0, exit0**, délka1169.2936ms. Konečný stdout je v tool výstupu chunk `4c9670`; task nemá další log writePath, proto se log nezapisoval mimo scope.
- Nové testy vykonávají instalovaný `WebGPUEngine.endFrame` a `flushFramebuffer` nad nahrazeným terminálním GPUDevice/encoders, nikoli GPU. Skutečný aktuální `prepareLightVariants` dokončí všech15 vehicle/day/night/restore stages:45draws,150checks při batchSize2 a třech draws/stage. Nejsou používány prezentační callbacks; nejde o naměřené FPS/startup seconds.
- Regrese používají skutečný light helper pro failed/render, timeout, restore, cleanup a disposed false; dále source/begin/end throws, inline health fault, scope/queue rejection, stop/run během fence, hidden/resume, abort/dispose/device loss/generation během pending idle, pozdní dokončení, WebGL reference, cleanup throw a skutečný Node MessageChannel lifecycle. Testy nepoužívají syntetické výkonové výsledky.
- Scoped strict TypeScript: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node --lib ES2022,DOM,DOM.Iterable client/startup-preparation-loop.ts tests/startup-preparation-loop.test.ts` → exit0/0diagnostik před posledním scope-only refaktorem; finální stejná kontrola je zopakovaná před předáním.
- První scoped TS běh odhalil `TS18048 queued is possibly undefined` v MessageChannel eventu. Opraveno explicitním zachycením a ověřením queued itemu před čtením; původní diagnostika zachována zde a v tool chunk `7b76a3`. Dílčí30/32/35PASS nejsou vydávané za finální36PASS.
- Whitespace kontroly obou nových souborů přes `git diff --no-index --check -- NUL <file>` nevydaly žádnou diagnostiku; no-index exit1 odpovídá existujícímu diffu nového souboru, není uváděn jako exit0.

Identita konečných source/test bajtů (09:08:43.288UTC, mimo toto ne-self-hashované předání):

| Soubor | SHA-256 |
|---|---|
| client/startup-preparation-loop.ts | d11c9a5c8ec31901323b63ca210069df3c0f0149d85bed0227e557e88df4d8b1 |
| tests/startup-preparation-loop.test.ts | 18bfc6e6bf9ad30fece197537c6e19689bea66c1efc06db3e29564bb07af3709 |

SHA256 z JSON objektu cest a těchto hashů v uvedeném pořadí: `5799ead59b6102371d3c80db8b3c07a72701e74b04d4e6f428836bbd98a0ba78`.

Procesy: pouze dokončené krátké CPU Node/tsx/tsc příkazy v této worktree, bez portů/serverů/buildů/GPU. Skutečný MessageChannel test uzavřel porty, idle Node test exit0. Žádný vlastní pomocný proces nezůstává. Žádná instalace nebo změna dependencies neproběhla.

Omezení: toto není praktická GPU/obrazová/performance přejímka ani vysvětlení1Hz browser presentation. Root musí ověřit Game wiring v novém source/test/asset snapshotu, plné quality/startup/watchdog/reentry a celé test/build/integration; potom skutečný browser obraz a výkon. Původní immutable runtime se neměnil.

Rezervace: po ověření konkrétních source/test hashů předáno rootovi a uvolněno pomocí agent-tasks release; stav tasku a integraci určuje root.

## Peer review P2: zachovat první vlastní throw před další cleanup chybou

- Původní vlastník znovu získal tentýž task přes `--adopt-dirty` dne21Oct2026; doložený původ všech tří vlastních cest je předání výše. Rootův zmrazený snapshot `40a363` zůstává byteově nedotčený. Žádný jiný runtime/test/source soubor nebyl upraven.
- Reprodukce: callback zachytí `loop.render()` throw a poté vyhodí vlastní cleanup chybu. Původní `step` catch tím mohl přepsat skutečný draw/begin error, protože nedošlo k návratu do explicitního `if (step.failed)`. Nové tři regrese pro `throw 0/undefined/false` skutečně RED nad původním source:0PASS/3FAIL, exit1, tool chunk `b96249`. Guard v každém případě nesprávně obdržel Error secondary callback cleanup failure.
- Jediná runtime změna v centralizovaném catch: `capture(step.failed ? step.error : error)`. Boolean failed zachovává také falsy původní hodnoty; nevzniká další stav, cache, hook nebo lifecycle větev. Zdravé frame chování a purefalse statusflow beze změny.
- Skutečné konečné ověření kolem09:16UTC: původní příkaz se dvěma test soubory → **39/39PASS,0FAIL/skip/cancel, exit0**, délka7268.513ms; stdout tool chunks `09c501` a `1f0d17`. Původní scoped strict TypeScript příkaz → exit0/0diagnostik, chunks `bd190c`/`0419e6`. Nové regrese ověřují původní guard rejection identity, první health message, jediný fault, uzavřený scope a0endFrame/submitů.
- Source/test identita v09:16:25.943UTC: `client/startup-preparation-loop.ts` SHA256 `ea9407a613ece5349320057a528f619cd57d9e08f869f6394a5547c83c09d77f`; `tests/startup-preparation-loop.test.ts` SHA256 `93999259dfe38f55dfb928c07080325d46e8974ef303a21ce115fdf7f3a23698`. Kombinovaný JSON paths/hash SHA256 `ac93bb9c8c5c504bdedefb0f96fcfe919379f9636e75ba85ddee27fbd615e4d8` nahrazuje předchozí source/test pár pro tuto opravu.
- Žádný build, fullsuite, server, browser nebo GPU. Všechny vlastní CPU procesy dokončené exit0 po opravě; žádný staging/commit. Po tomto konkrétním předání se rezervace opět uvolňuje. Root musí vytvořit nový source/test snapshot; běžící starší frozen suite touto opravou není zpětně změněná ani vydávaná za ověření nových bajtů.
