# Předání řízeného fallbacku rendereru · 27. 10. 2026

- Vlastník: `renderer-fallback-engine-agent-20261027`; příjemce root.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`.
- Scope: companion claims `trees-20261026-webgpu-default` a `renderer-fallback-20261027`. Engine WIP je výslovně převzatý od rootu v jeho handoffu; hlavní UI/Game a překlady měnil pouze root.
- Výsledek: automatická preference WebGPU CM, po bezpečně uklizeném init odmítnutí jeden WebGL2 pokus na novém canvasu. Explicitní query zůstává striktní. Žádné přepnutí běžící scény, snapshot rendering nebo změna NCM defaultu.

## Přesné soubory

`client/render-engine.ts`, nový `client/render-fallback.ts`, `client/avatar-preview.ts`, `client/avatar-editor.tsx`; `tests/render-engine.test.ts`, `tests/game-render-engine.test.ts`, `tests/avatar-preview-webgpu.test.ts`, nové `tests/render-fallback.test.ts` a `tests/avatar-editor-fallback.test.ts`; aktualizované `docs/trees/20261025/webgpu-default.md`, původní engine handoff a toto předání. Lokální evidence a scope snapshot jsou výhradně v `.cache/renderer-fallback-20261027/`.

## Rozhodnutí a rozhraní

Primární připnutý Babylon 9.30 nejprve získává adapter/device, poté naváže canvas a ještě vytváří attachments. Pozdní init chyba tedy může ponechat canvas na contextType WebGPU. Varianta druhého enginu na tomtéž canvasu byla odmítnutá; stejně tak globální přepínání zdravé scény a trvalý localStorage blacklist. [MDN canvas](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext), [unconfigure](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/unconfigure).

`initializeRenderEngine` zůstává jeden pokus. `WebGpuInitializationError` vzniká až po úspěšném cleanupu; původní příčina je v `cause`. Import/constructor chyby před připraveným enginem se automaticky neoznačují za odmítnutí GPU. Chyba cleanupu zůstává AggregateError; abort a asset/shader/deadline/runtime chyby neopravňují k fallbacku. Zachovaná pozdní cleanup cesta nesmí alokovat nový fallback po zrušení.

Root UI používá `requestWebGlFallback(error, location, signal?)`. Vrací readonly `{backend:"webgl2", reason:"unavailable"|"initialization-failed"}` nebo null; každý error lze spotřebovat jen jednou. Přijatá preference se týká pouze budoucích pokusů na aktuální stránce, bez subscriptions. Současně rozpracované nezávislé init pokusy mohou získat vlastní nový canvas, ale zdravá existující Game se tím nerestartuje. `createGameEngine(canvas,{signal})` zůstává API-compatible. `getRenderEngineSelection(engine)` vrací neměnnou volbu konkrétního pokusu, takže pozdější fallback jiného preview nezfalšuje diagnostiku již vytvořeného enginu.

AvatarEditor má lokální renderer generation v key canvasu i dependencies efektu. Zachovává poslední upravený profil, ignoruje staré callbacky a uvolní pozdní controller bez zásahu do nového. Browserový preview precheck již neobchází společnou factory. Preview předává skutečnou volbu přes `options.onRenderer`; editor ji zapisuje do data atributů a zobrazuje kompatibilní režim. Explicitní nepodporované WebGPU zůstává rozlišitelné stavem unsupported.

Root obdobně upravil hlavní UI. Jeho skutečný efekt je ověřen s falešným Game/engine a bez sítě: fallback remount zachová stejnou multiplayerovou relaci, vytvoří nový canvas, vykáže skutečný WebGL2 backend a při odmítnutí druhého backendu ukončí pokus obvyklou chybovou cestou bez třetí generace.

## Refaktoring a lifecycle

Výběr backendu je přesunutý do čistého policy modulu a původní export z render-engine je zachovaný. Page preference obsahuje jen malý readonly záznam; spotřebované chyby jsou ve WeakSet a metadata engine ve WeakMap. Nevznikl trvalý cache, listener registry nebo frame-by-frame výpočet. Metadata wrapper respektuje abort i při předání již inicializovaného enginu. Celý původní RenderHealth/device-loss režim zůstává stejný; ztráta běžícího zařízení vyžaduje nový renderer a zdroje. [MDN device loss](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost).

## Skutečné ověření

- `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=2 tests/render-engine.test.ts tests/render-fallback.test.ts tests/avatar-preview-webgpu.test.ts tests/avatar-editor-fallback.test.ts tests/game-render-engine.test.ts`: **62/62 PASS**, exit 0, 3,98 s. Finální log `targeted-handoff.log`.
- Úzký TypeScript přes `.cache/renderer-fallback-20261027/tsconfig.json`: **PASS**, exit 0; `types-handoff.log`.
- Whitespace kontrola vlastních kódových změn PASS.
- První preview běh měl 24/26 PASS: dvě staré VM fixtures postrádaly nové setRendererSelection vazby. Byly opravené bez oslabení původních kontrol; `preview-first.log` zůstává zachovaný jako neúspěšný běh.

Všechny uvedené testy jsou izolované CPU/přenosné lifecycle fixtures. Test UI používá náhradní Game, nikoli skutečnou herní instanci. Nebyl spuštěný browser, hardware GPU, herní server, produkční hra, build, celá sada nebo integrační proces. Podle nového uživatelského pokynu je herní přejímka na uživateli; tyto výsledky nejsou vizuální ani FPS důkaz.

## Hranice a předání

Tato změna neřeší přípravný timeout způsobený přibližně 1Hz callbacky a nepřeklasifikuje jej na init odmítnutí. HTTP fallback musí zároveň zachovat integritní SHA kontrolu assetů bez závislosti na secure-only crypto.subtle; tuto navazující část řeší root/autor textur, nikoli tento scope. Babylon CM není WebGPU API `featureLevel: compatibility`; nový adapter feature level se nepřidával. [Babylon NCM](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/).

Žádný staging ani commit. Vlastní CPU procesy skončily; po hashovaném předání budou oba claims uvolněné. Root převezme pouze uvedené vlastní změny, zkontroluje společnou UI vazbu a provede konečné začlenění podle aktuálního uživatelského zadání.
