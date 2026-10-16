# Předání: webgpu-migrate-preview-20261016 / KEY-29

Vlastník `webgpu-mig-01a14497-preview`, příjemce `webgpu-migration-01a14497-root`. Worktree `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; navazuje na vendor předání `93f3a87`. Claim získán před zápisem. Pouze přidělené preview/editor moduly, dva nové testy, tento handoff a vlastní `.cache/webgpu-migration-checks/preview/`.

## Průzkum a rozhodnutí před implementací

Původní synchronní createAvatarPreview má vlastní WebGL Engine a RAF volající pouze scene.render. Pinovaný WebGPU endFrame uzavírá pass, předává command buffers a uvolňuje deferred resources. Editor označuje ready hned po konstrukci a jeho pozdní import pracuje s aktuálním canvas.current namísto zachyceného vlastníka. Jediný skutečný callsite je avatar-editor; shared renderer nemá vlastnit UI engine.

Vybrána samostatná async factory preview nad sdíleným createGameEngine, zachyceným canvas/AbortSignal a posledním profilem. Controller renderuje přes deduplikovaný on-demand scheduler; každý render má beginFrame/render/endFrame a serializovaný GPU checkpoint. Native checkpoint obsahuje validation scope, getCompilationInfo nových skutečných modulů z vykreslovaných efektů a queue.onSubmittedWorkDone. Queue completion sama není shaderová validace. RenderHealth je vlastní preview engine, připojený před Scene; texture chyby jsou scene-local. Ready vyžaduje scene/effect readiness před i po renderu, dokončený checkpoint, zdravou generaci a nezastaralý profil.

Trvalý engine loop byl odmítnut kvůli idle GPU práci; samotný RAF bez begin/end neposílá korektní WebGPU frame. Holý whenReadyAsync/executeWhenReady byl odmítnut kvůli disposal/pending promise a nedoloženému submission. Připravenost je krátce pumpovaná pouze při změně/načítání, s časovým rozpočtem měřeným jen při viditelnosti. Skrytí zruší RAF a pozastaví loading budget. Rotation/detail/resize/DPR a opakované změny se slučují, nová operace nezačne přes nedokončený checkpoint.

Root souhlasil s explicitním unsupported stavem pouze při absent navigator.gpu a vybraném WebGPU; adapter/device rejection je failed bez fallbacku. Factory API se nemění. UI zachová formulář, rozliší stavy a povolí ovládání náhledu až po skutečné připravenosti. Generační kontrola, AbortController a lokální owner brání pozdnímu přepsání jiné instance.

## Výsledek a ověření

Hotová CPU část. `createAvatarPreview` je nyní Promise factory v samostatném `avatar-preview.ts`; editor je jediný callsite a obsluhuje async lifecycle. Z `avatar-renderer.ts` zmizel pouze preview controller a jeho nepotřebné importy; byte porovnání těla všech avatarových typů, poolu a createAvatarRig proti `93f3a87` je shodné. Původní camera/lighting/tone-mapping parametry i DPR cap 1,5 jsou zachované. Preview používá stejný backendový výběr jako Game, bez vlastní WebGL konstrukce nebo globálního ForceGLSL.

Editor drží captured canvas, AbortController, generation a lokálního controller ownera. Pozdní import se nepoužije na jiný canvas; pozdní controller se uklidí a nesmaže novější ref. Stav ready není odvozen od konstrukce. Formulář a silhouette fallback fungují i při unsupported/failed; detail chyby používá stávající překladový klíč a omezený první řádek zprávy. Poslední vybraný profil se čte při inicializaci i po GPU checkpointu. Běžné update se slučují do následujícího renderu, neprodukují několik rigů při sérii změn.

`OnDemandRender` vlastní nejvýše jeden RAF a jeden probíhající async frame. Po dokončení nic neplánuje, pokud nejsou změny nebo nedokončená příprava. Hidden zruší naplánovaný RAF a pozastaví 30s visible-time budget; návrat a DPR/resize vytvoří jediný nový požadavek. Rozměry enginu se mění jen při skutečné změně. Shader compilation info je přes WeakMap ověřené jednou pro každý vytvořený shader module. Frame validation scope, queue completion a shader checks jsou pozorované přes vlastní RenderHealth; late výsledky po abort/device loss nereaktivují ownera. Efektová chyba uvnitř renderu odloží disposal do microtasku, aby vždy mohl proběhnout endFrame.

### Skutečné kontroly

Vlastní staged kopie source/testů používá pouze read-only node_modules junction na historické dependencies. Přímé Node CLI, žádné pnpm exec/install ani write do závislostí. Všechny vlastní procesy skončily.

| Kontrola 16. 10. 2026 | Výsledek | Log v `.cache/webgpu-migration-checks/preview/` |
|---|---|---|
| První scheduler/controller/editor série | **16/16 PASS**, exit 0 | `targeted-v1.log` |
| První scoped strict TS | 1 fixture chyba: AvatarConfig nemá height; opravena na skutečný preset | `types-v1.log` |
| Rozšířená série + health + i18n | **33 PASS / 1 FAIL**, chyběla pouze read-only kopie server source pro existující i18n scan | `related-v2.log` |
| Finální rozšířená série | **34/34 PASS**, exit 0; 20 nových + 5 health + 9 i18n | `related-final.log` |
| Finální scoped strict TypeScript | **0 diagnostik**, exit 0 | `types-v2.log` |
| Scoped formatting a `git diff --check` | PASS | výstup relace |
| Nezávislý read-only review `preview_review` | Bez konkrétního blockeru; ověřené pinned stages/modules, efekty source meshů instancí, scope/endFrame/abort ownership | zpráva relace |

Regrese zahrnují skutečný editor effect přes AST, latest config během engine/submission čekání, abort před init/po init/během GPU checkpointu, constructor/getter failure, hidden-visible/DPR, scope a compilation errors, render failure s endFrame, progressive readiness, device loss, deadline a absenci idle RAF. Browser/GPU IO a surface jsou v controller testech nahrazené; skutečný RenderHealth/NullEngine observables a skutečná controller logika běží. To není GPU kompilace či obrazový důkaz.

Příkazy ze stagingu: `node --import tsx --test --test-concurrency=1 tests/on-demand-render.test.ts tests/avatar-preview-webgpu.test.ts tests/render-health.test.ts tests/i18n.test.ts`; `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --esModuleInterop --resolveJsonModule --types node,vite/client --lib ES2022,DOM,DOM.Iterable client/avatar-preview.ts client/avatar-editor.tsx client/on-demand-render.ts tests/avatar-preview-webgpu.test.ts tests/on-demand-render.test.ts`.

Source/staged shoda všech šesti runtime/test cest, source SHA pro shared factory/health/texture boundary a log hashe jsou v `checks.json`. Stejné factory/health/validation/type soubory byly při závěrečném porovnání stále aktuální. Původní neúspěšné fixture kontroly zůstaly zachované. Historické snapshoty/dependencies jsou nedotčené.

Root převezme sedm verzovaných own cest a samostatně ověří stabilní pipeline, skutečný obraz šesti presetů, rychlé změny/rotaci/detail, opakovaný lifecycle a výkon editoru samostatně i nad Game. Žádný GPU, build ani fullsuite zde neproběhl; KEY-29 ani migrace se podle tohoto CPU předání neoznačují Done. Po samostatném commitu se claim uvolňuje; přesný commit a potvrzení release dostane root zprávou.
