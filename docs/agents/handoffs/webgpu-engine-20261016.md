# Předání: webgpu-engine-20261016

- Vlastník `webgpu-01a14497-engine`; příjemce root `webgpu-01a14497-root`.
- Pracovní kopie `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, detached `f8c522730f152d23f7355b2bc872f5a37b83cba3`; runtime základ `960cb6f`. Původní main a neměnný 4188 nejsou měněné.
- Scope: `client/render-engine.ts`, `client/gpu-diagnostics.ts`, `tests/render-engine.test.ts`, `tests/gpu-diagnostics.test.ts`, tento handoff. Žádné cizí WIP nepřevzato. Game/UI/labels/benchmark/GPU/integraci vlastní root, auto samostatný agent.

## Podklady a rozhodnutí před implementací

Read-only průzkum 16. 10. 2026 porovnal HEAD Game konstruktor, UI lifecycle, GLSL-only material plugins, car paint backend guard, raw RGBA textury, DefaultRenderingPipeline, shadow wrappers a diagnostiku s pinovaným Babylon 9.30.0. Zásadní primární cesty: `Engines/webgpuEngine.pure.js`, `thinWebGPUEngine.js`, `WebGPU/webgpuTimestampQuery.js`, `Materials/materialPluginManager.pure.js`, `Materials/standardMaterial.pure.js`, `Materials/PBR/pbrBaseMaterial.pure.js`, `Engines/abstractEngine.pure.js` a `engine.common.js`.

Vybraná nejmenší varianta: stejný TypeScript svět/GLSL materiály, hotový async engine před konstrukcí Game, explicitní local CM a oddělená NCM volba. Přepis všech pluginů do WGSL by měnil více proměnných. Tichý WebGL fallback by znehodnotil experiment. Snapshot rendering není zapnuté. NCM není automaticky nejlepší: avatar pool sdílí materiály mezi skeletony, proto skutečná bundle reuse/creation a obraz patří do přejímky rootu. Oficiální podklady: [GLSL/WGSL](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUWGSL.md), [NCM](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode). Konkrétní chování určuje instalovaný pinovaný zdroj.

## Implementace a lifecycle

`createGameEngine(canvas, { signal? })` vrací `Promise<AbstractEngine>`. Výchozí WebGL2 má původní AA/stencil/power/DPR options; případný WebGL1 není přijat jako srovnávací baseline. `renderBackend=webgpu` a `webgpu-fast` jsou povolené jen na localhost/127.0.0.1/IPv6 loopback. Neznámé/duplicitní volby a unsupported backend se výslovně odmítnou. WebGPU modul se načítá dynamicky. CM je true, NCM false; snapshot rendering je false v obou.

StandardMaterial.ForceGLSL a PBRBaseMaterial.ForceGLSL se zapnou před materiály a zůstanou po celý život experimentální stránky, včetně pozdějších glTF/LOD loadů. Lokální kompilátory jsou explicitně `/tools/webgpu-9.30/glslang.js`, `glslang.wasm`, `twgsl.js`, `twgsl.wasm`; jejich stažení/provenienci/immutable snapshot vlastní root. Factory žádnou CDN URL implicitně nevybírá.

Cancellation vyřeší volající Promise hned; již probíhající init zůstane pozorovaný a po dokončení uklidí nově vytvořené prostředky. Před konstrukcí po dynamic import se znovu kontroluje abort. Babylon 9.30 public WebGPU dispose bezpodmínečně dereferencuje prostředky, které při odmítnutí adapter/device ještě nemusejí existovat. Úzký failure cleanup proto používá volitelné verze stejných uvolnění plus `_CommonDispose` a základní AbstractEngine disposal. Funguje jen bez herní scény a při cleanup chybě zachová obě chyby. Běžný úspěšný engine dál používá public dispose. Po vrácení enginu jej vlastní caller, včetně chyby Game konstruktoru.

`getRendererInfo` sjednocuje public getInfo a historické getGlInfo fixtures. WebGPU nezjišťuje WebGL kontext ani nevydává requested AA za actual samples. Adapter architecture/description/vendor zůstávají oddělené a klasifikace používá jen rozpoznané názvy. Diagnostics přidává backend/CM a scope GPU času. `readWebGpuMainPassTiming` přijímá jen kladné čerstvé samples a vrací null pro missing/zero/stale; výslovně jde pouze o main render pass. Timestamp-query je požadován jako volitelný feature, Babylon jej filtruje podle adapteru. Legacy WebGPU whole-frame counter se zde nepoužívá, protože bez `GPUCommandEncoder.writeTimestamp` může vracet 0. Root nesmí jeho data vydávat za total GPU frame.

Refaktoring: jednotná factory life-cycle cesta s injektovatelným GPU IO, jeden normalizátor identity, bez per-frame GPU dotazování/nové globální cache. Compiler konstanty jsou neměnné. Při baseline nevzniká WebGPU engine ani dynamic import.

## Ověření a meze

Scoped Prettier čtyř runtime/test souborů exit 0. Git diff --check exit 0. Root vytvořil vlastní frozen dependencies a převzal přesné čtyři soubory do svého scope; cílené testy a TypeScript běžely tam, nikoli přes immutable 4188 junction.

První root targeted běh zachoval log `.cache/webgpu-comparison/logs/backend-targeted.log`: všech sedm GPU diagnostics testů PASS, factory test soubor se nenačetl kvůli runtime re-exportu AbstractEngine při extensionless importu. TypeScript navíc našel chybějící deklaraci Navigator.gpu ve factory a testu. Oprava používá explicitní `abstractEngine.pure.js`/`engine.common.js` a úzký strukturální feature probe; žádná závislost, engine zdroj ani povolení se nemění. První log zahrnuje také nezávislou car-parity neshodu, kterou vlastní jeho agent. První neúspěch není výsledkem funkčních factory regresí a nenahrazuje následný běh.

Root retry 16. 10. 2026 přibližně 14:43 Europe/Prague: `.cache/webgpu-comparison/logs/backend-targeted-v3.log` potvrzuje všech **9 factory + 7 GPU diagnostics testů PASS**. Tento širší log jako celek měl dva jiné neúspěchy: car canonical geometry assertion a wrapper rootova nového UI testu; nepředstavuje plně zelenou sadu. Následná samostatná rootova UI lifecycle kontrola má 3/3 PASS v `ui-lifecycle.log`. Strict TypeScript v témže frozen checkpointu má exit 0 a prázdný `types-v3.log`, jak potvrdil root. Výsledky zde nejsou nové GPU důkazy.

Připravený příkaz: `node --import tsx --test --test-concurrency=1 tests/render-engine.test.ts tests/gpu-diagnostics.test.ts`. Regrese pokrývají loopback/volby, výslovný WebGL2, async init/CM/NCM, chybu bez fallbacku, cancellation před/during/after init, partial cleanup skutečné Babylon konstrukce bez GPU a pravdivou identitu/timing. Jde o CPU testy, nikoli doklad shaderové kompatibility nebo FPS. Skutečný browser musí ověřit shodu materiálů/stínů/culling, GPU adapter, rozlišení a shader/pipeline chování.

Žádný vlastní server/build/GPU/instalace nebo pomocný dlouhožijící proces. Po tomto předání, explicitním stagingu pěti vlastních souborů a samostatném commitu se rezervace uvolňuje; konkrétní commit a výsledek release dostává root v závěrečné zprávě. Stav tasku a integraci mění root. Celá sada/build/integrace a skutečný produkční WebGL2/WebGPU A/B zůstávají jeho navazující přejímkou; tento díl není tvrzení o kompatibilním obrazu ani FPS zisku.
