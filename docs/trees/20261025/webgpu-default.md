# Výchozí WebGPU — rozhodnutí a hranice přejímky

## Aktualizace 27. 10. 2026: řízený fallback

Nový výslovný pokyn uživatele nahrazuje níže uvedené starší rozhodnutí o zákazu automatického fallbacku. WebGPU CM je výchozí preference, počítače odmítající inicializaci dostanou jeden řízený pokus WebGL2. Uživatel převzal herní testování; tato etapa nespouští hru, browser, GPU, herní server ani celý testovací běh.

Vybraná varianta zachovává `initializeRenderEngine` jako jeden striktní pokus. Teprve po úspěšném úklidu vrací `WebGpuInitializationError`; vlastník UI smí použít `requestWebGlFallback`, změnit React generaci a vytvořit **nový canvas**. Stejný canvas po `getContext("webgpu")` nemůže získat WebGL2; `unconfigure()` pouze uvolňuje konfiguraci a textury. Pouhý catch a druhý engine na starém canvasu byl proto zamítnut. [MDN canvas](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext), [unconfigure](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/unconfigure).

Preferenci ukládá jen malý modulový `RenderFallbackSession` pro budoucí pokusy na aktuální stránce. Nemá subscriptions, nepřestavuje zdravé běžící enginy, nepoužívá localStorage a nezamyká zařízení na WebGL2 po pozdějším reloadu. Explicitní platná query je striktní a paměť stránky přebije. Důvod a skutečný backend jsou neměnná metadata konkrétního enginu; neodvozují se zpětně od aktuální preference jiného preview.

Automatický fallback není povolen pro abort, chybu cleanupu, import chunku, shaderu, assetu, časového limitu přípravy či ztrátu zařízení běžící scény. Tyto případy zachovají původní chybovou a restartovací cestu. Původní příčina init chyby zůstává v `cause`. [MDN device loss](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost).

Pinned Babylon9.30 `IsSupportedAsync` provádí vlastní requestAdapter a init jej opakuje; nebyl přidán druhý preflight. Nedostupný `timestamp-query` už Babylon filtruje podle adapter features. Babylon compatibilityMode řídí render bundles a není totožný s novým WebGPU `featureLevel: compatibility`. NCM se nestává výchozím režimem. [MDN requestAdapter](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter), [Babylon NCM](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/).

Preview už nepředbíhá společnou factory kontrolou navigator.gpu. AvatarEditor mění key i efekt podle lokální renderer generace; staré callbacky nemohou publikovat stav nového canvasu. Zobrazuje skutečný kompatibilní backend. Hlavní UI integruje root podle stejného API a zachovává připojení multiplayeru při inicializačním retry. Podrobné aktuální CPU výsledky a soubory jsou v [předání fallbacku](../../agents/handoffs/renderer-fallback-20261027.md). Bez browserové přejímky se netvrdí změřený výkon ani úplná grafická bezchybnost.

## Historické rozhodnutí 26. 10. 2026

26. 10. 2026, task `trees-20261026-webgpu-default`, owner `trees-webgpu-default-01a16b37`.

Uživatel výslovně upřesnil cílovou cestu WebGPU. Existující [migrační kontrakt](../../performance/webgpu-migration.md) již požaduje skutečný produkční WebGPU default bez query, nativní WGSL, explicitní nepodporovaný stav a žádný tichý fallback. Dosavadní `selectRenderBackend` přesto volil bez query WebGL2 a oba WebGPU režimy omezoval na loopback. Společná továrna slouží hře i avatar preview; není nutná druhá volba v Game/UI.

## Varianty před implementací

| Varianta | Náklady a dopady | Volba |
| --- | --- | --- |
| Zachovat WebGL2 default a vyžadovat místní query | Nejmenší změna, ale neplní dnešní explicitní cíl ani konečný migrační kontrakt | Zamítnuto |
| WebGPU default všude, WebGL2 pouze explicitně, `webgpu-fast` pouze explicitně na loopbacku | Úzká změna společného výběru; nepodporované prostředí dostane stávající explicitní chybu. Rendering, kvalita, cache a lifecycle zvoleného WebGPU zůstávají stejné | Vybráno |
| Detekovat podporu a automaticky přepnout na WebGL2 | Maskuje selhání backendu i identitu měření, mění rendering bez vědomé volby a porušuje zákaz tichého fallbacku | Zamítnuto |
| Udělat default z `webgpu-fast` | Mění compatibility mode, bundle/cache chování i startup adapter; vyžaduje samostatný srovnatelný profil a přejímku | Zamítnuto |

Volba sama neopravuje timeout přípravy a není GPU přejímkou. Koordinátor doložil na frozen v5 timeout v `low/current-on` při 826–882 ticks, 133–142 renders a 0 restarts v této etapě; všechny zaznamenané shader/pipeline operace byly dokončené bez pending/errors. Tento předaný runtime důkaz vyvrací pro tyto běhy vysvětlení pouhou absencí foreground; konkrétní čekající readiness podmínku zkoumá samostatně koordinátor.

## Kontrakt změny

- Bez `renderBackend`, včetně jiných query parametrů, vybere společná továrna `webgpu` na místním i vzdáleném hostname.
- Explicitní `webgpu` a `webgl2` jsou dostupné bez omezení hostname. Tím se nemění HTTP/API/origin oprávnění.
- Pouze `webgpu-fast` zůstává loopback experiment; neplatné, prázdné či opakované hodnoty jsou odmítnuté.
- Nativní WGSL guard, zákaz fallbacku, async init, abort, late cleanup, předání vlastnictví a disposal se nemění. Žádný nový cache/state/controller.
- Avatar preview přebírá volbu stejnou továrnou; jeho stávající unsupported stav se nyní uplatní i bez query. Případnou uživatelskou explicitní akci pro kompatibilní WebGL2 vlastní koordinátor v UI.

Primární implementační podklady: `client/render-engine.ts`, `client/avatar-preview.ts`, `client/ui.tsx`, přenosné CPU lifecycle testy a připnuté Babylon 9.30 zdroje. Oficiální [Babylon WGSL dokumentace](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md) potvrzuje nativní WGSL cestu bez konverzní WASM závislosti; konkrétní lifecycle kontrakt určuje připnutý kód projektu.

## Výchozí ověření

`pnpm exec` byl odmítnut s `ERR_PNPM_UNSAFE_MODULES_DIR`, protože se pokusil o implicitní install nad sdíleným junctionem. Závislosti nebyly opravovány ani měněny. Přímé `node node_modules/tsx/dist/cli.mjs --test tests/render-engine.test.ts tests/game-render-engine.test.ts` před změnou: **17/19 PASS**, dva UI fixture testy selhaly. Fixture používá starý `lightingPreviewRef`, zatímco skutečný UI efekt už čte `seasonPreviewRef`; oprava fixture patří do přiděleného testového rozsahu. Logy: `.cache/trees-webgpu-default-20261026/baseline-tests.log` a `baseline-direct-tests.log`.

## Implementace, refaktoring a výsledek

Společný selector nyní defaultuje na `webgpu`; hostname omezení platí pouze pro `webgpu-fast`. Existující native WGSL guard a všechny větve inicializace/abort/dispose zůstaly beze změny. Nevznikl nový stav, cache ani zdroj. Cílený refaktoring testů sjednotil místní/vzdálené hosty a oddělil default, explicitní kompatibilitu, fast experiment a odmítnutí neplatných vstupů. UI fixture nyní používá skutečné `seasonPreviewRef`, takže provede start namísto předčasného `ReferenceError`.

26. 10. 2026, 09:56–09:57 UTC:

- `node node_modules/tsx/dist/cli.mjs --test tests/render-engine.test.ts tests/game-render-engine.test.ts`: **23/23 PASS**, exit 0, log `.cache/trees-webgpu-default-20261026/targeted-tests.log`.
- `node node_modules/tsx/dist/cli.mjs --test tests/avatar-preview-webgpu.test.ts`: **22/22 PASS**, exit 0, log `.cache/trees-webgpu-default-20261026/avatar-preview-tests.log`. Preview je další přímý volající společné továrny; jde o CPU testy skutečné lifecycle logiky se simulovaným GPU IO, ne GPU přejímku.
- `git diff --check -- client/render-engine.ts tests/render-engine.test.ts tests/game-render-engine.test.ts`: PASS, exit 0.

Regrese pokrývají také skutečnou produkční továrnu bez `navigator.gpu`: dostane explicitní WebGPU chybu a nevytvoří fallback engine. Zachované testy ověřují zákaz GLSL konverze, opožděný cleanup po zrušení, přesné předání vlastnictví a likvidaci částečně inicializovaného Babylon enginu.

Žádný build, celá sada, integrace ani GPU nebyly tímto taskem spuštěny. Production startup timeout, vizuální/výkonová přejímka, případná UI kompatibilní akce a aktualizace společné architektury patří integrátorovi. Stav tasku není označen Done a samotný default flip není tvrzení dokončené migrace.
