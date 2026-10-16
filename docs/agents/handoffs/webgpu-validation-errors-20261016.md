# Předání: webgpu-validation-errors-20261016

- Vlastník: `webgpu-01a14497-validationerrors`; příjemce: `webgpu-01a14497-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-comparison`, výchozí commit `140fc3dfa1679af05d4bd8fad7e4b622e048fd1a`.
- Rozsah: `client/webgpu-validation.ts`, `tests/webgpu-validation.test.ts`, tento handoff. Při převzetí čistý checkout; navazující cizí změny nebyly převzaty.
- Výsledek: `watchWebGpuValidation(engine, callback)` připojí posluchač k inicializovanému WebGPU device, hlásí každý doručený `uncapturederror` s textem maximálně 2000 znaků, po obnově kontextu přepojí zařízení a po dispose/ručním cleanup odstraní posluchač i své pozorovatele. WebGL je úplný no-op. Chybějící WebGPU device výslovně hlásí nedostupné monitorování, aby nulové chyby neznamenaly chybějící dohled.

## Průzkum a volba

Spouštěčem byla koordinátorova skutečná browserová reprodukce `GPUValidationError` po `createShaderModule` při uniformity analýze. Tento podtask sám GPU nespouštěl.

Primární zdroje čtené 16. 10. 2026:

- Instalovaný Babylon **9.30.0** v hlavním checkoutu: `Engines/webgpuEngine.pure.js:458–490` při `initAsync` přiřadí device a nasadí vlastní `uncapturederror` listener, který pouze omezeně volá `Logger.Warn`. Není to `onEffectErrorObservable` callback.
- `Engines/webgpuEngine.pure.d.ts:227` deklaruje `_device: GPUDevice` jako veřejný `@internal` člen. Adapter tuto konkrétní pinned vazbu dokumentuje a neimportuje engine za běhu.
- `Engines/abstractEngine.pure.js:241` oznamuje obnovení kontextu; `:1560` oznamuje disposal. `Misc/observable.pure.js` poskytuje `Observer.remove(true)`, který deaktivuje observer a odloží fyzické odstranění, aby nevynechal další callbacky během probíhající notifikace.
- [GPUDevice uncapturederror, MDN](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/uncapturederror_event): event hlásí chyby, které nepřevzal GPU error scope; lze použít samostatný `addEventListener` bez nahrazení existujícího handleru.

Varianty:

1. Zachytávat `console.warn`/`Logger.Warn`: závislé na textu, Babylonově limitu a globálním loggeru; ztrácí přesný počet a vlastnictví konkrétního device.
2. Nahrazovat engine metody nebo obalovat veškeré operace error scopes: širší zásah do kompilací a životního cyklu, nová async práce a riziko změny toho, kdo chybu převezme.
3. **Zvoleno:** vlastní standardní device event listener s omezenou délkou textu a explicitním lifecycle. Nemění defaultní konzolové chování, nepoužívá `preventDefault` ani `stopPropagation`, nevytváří falešný Effect.

Každý doručený event musí zvyšovat Game error counter; interní limit 20 callbacků by mohl po saturaci vydávat další interval za bezchybný. Modul proto žádný callback nevynechává a sám žádné záznamy neukládá. Koordinátor může omezit počet uložených textových diagnostik odděleně od čítače. Paměť helperu je konstantní; na event vznikne nejvýše 2000znakový předaný řetězec. Žádná práce v render loop, cache ani polling.

## Ověření a hranice

- Připraveno šest cílených CPU testů se skutečným Node `EventTarget` a skutečným Babylon `Observable`: WebGL no-op, úplné počítání 103 událostí a omezení textu, zachované druhé listenery/default behavior, rebind na nový device a žádná duplikace, disposal/ruční cleanup, synchronně přehraná disposal notifikace, chybějící device a pozdější připojení.
- Příkaz pro koordinátorův frozen snapshot: `pnpm exec tsx --test tests/webgpu-validation.test.ts`. V prvním společném cíleném běhu 16. 10. 2026 15:12 CEST všech **6/6 watcher testů PASS**, viz `.cache/webgpu-comparison/logs/sky-validation-targeted.log`. Následný `tsc` našel jediný problém tohoto podtasku: `assert.deepEqual(messages, [])` zužovalo typ na `never[]`, což blokovalo navazující test callback. Opraveno na kontrolu `messages.length === 0`, bez runtime změny. Původní log `.cache/webgpu-comparison/logs/types-sky.log` zachován.
- Opakovaný společný běh v2: **PASS 25/25, exit 0**, včetně **6/6 watcher testů**, log `.cache/webgpu-comparison/logs/sky-validation-targeted-v2.log`. Strict `tsc --noEmit` **PASS, exit 0**, log `.cache/webgpu-comparison/logs/types-sky-v2.log`.
- Ověřený koordinátorův snapshot včetně testů: `a1eb953f7dc9805ee01798e1f11da854215896aadc484d1d3b3d3a89aaad065d`, 8418 vstupů. Tento podtask se předává jako samostatný commit pouze tří uvedených souborů; SHA commitu je v závěrečném předání.
- Integraci do `Game.renderErrorCount`, bounded diagnostického eventu a browserovou přejímku provádí koordinátor. Tento podtask neprokazuje GPU rendering ani výkon.
- Listener zachytí pouze uncaptured chyby doručené po připojení. GPU error scopes ani chyby před připojením nemůže zpětně zachytit. Po device loss se připojí k novému device při `onContextRestoredObservable`; samotný context loss proto má zneplatnit měřený interval. Případnou chybu interního obnovování před restored notifikací tento helper neslibuje zachytit.
- Vlastní procesy: žádný server, build, GPU kontext ani dlouhožijící pomocný proces. Pouze čtení primárních zdrojů a formátování vlastních souborů.
- Rezervace se uvolňuje ihned po samostatném commitu. Žádný vlastní proces nezůstává; výsledek release je předán koordinátorovi. Přijetí, GPU kompatibilitu a změnu stavu tasku provádí koordinátor.
