# Předání: webgpu-shadow-freshness-20261017 (probíhá)

- Vlastník `webgpu-mig-01a14497-shadow-20261017`, příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; výchozí HEAD při claimu `5cdb14e`.
- Scope: `client/webgpu-shadow-readiness.ts`, `tests/webgpu-shadow-freshness.test.ts`, toto předání a `.cache/webgpu-migration-checks/shadow-freshness/`. Rootův handoff/task WIP nepřebírám. Game, vegetation, patch/lockfile a frozen hry se nemění.
- Aktuální primární AGENTS, BMAD policy a celá root specifikace `_bmad-output/implementation-artifacts/spec-key-39-shadow-freshness-20261017.md` načtené17.10.2026; BMAD vede root, tento konkrétní podagent další workflow nespouští.

## Důkaz a příčina před implementací

Immutable C4 uživatelská session `c063cf2e-4c92-49af-9283-cd55783b4e93`, snapshot `1383fc9296d70d256ead4c6df0ac87892cdcd522426272bc8e7288613266f277`: seq2412 a2450 v flashlight shadow pass bindují directional sun80B do deklarace vyžadující96B. Seq2496 má `createBindGroup` TypeError pro chybějící `resource.buffer`; další dokončené Game snímky chybí. Log `.cache/webgpu-migration/user-test-20261017-completed/session-prefix.jsonl`, SHA256 `CB15DB6A0EE7905EDE9DEBDD7435556C165799BCC0D3931246122D97403E46C2`.

Primární implementační podklad je skutečný readonly `dependencies-v5/node_modules/@babylonjs/core` používaný C4. Root ověřil oficiální tarball9.30 SHA512 vůči lockfile a byte shodu upstream `uniformBuffer.js` a `drawWrapper.js`; jejich owner-keyed UBO mechanismus není lokální kontaminace. Projektový shadow patch upravuje WGSL include/remap, ne readiness nebo bindgroup cache. [Upstream ShadowDepthWrapper](https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/dev/core/src/Materials/shadowDepthWrapper.ts) také má rozlišení standalone; aktuální web není náhrada pinned zdroje.

Řetězec: Scene active-mesh evaluation používá `mesh.isReady(false)` bez přípravy materiálů. Shadow targets proběhnou před hlavním draw. Non-standalone `ShadowDepthWrapper.isReadyForSubMesh` nepřipraví základní materiál a přijme poslední ready efekt z `onEffectCreatedObservable`. ShadowGenerator nastaví depth draw-wrapper override a volá základní material binding. `BindLights` ale iteruje aktuální `mesh.lightSources`. StableLightState světla seřadí a označí materiál light-dirty; tento marker sám shadow wrapper neobnoví. PBR stromové wrappery vznikají v `client/vegetation.ts:472`.

Directional UBO má80B, hemispheric/point96B, spot112B. Binding15/16 neidentifikuje konkrétní LightN. Konkrétní původní mesh uživatelského faultu nebyl identifikován; samotné počty indexů57600/14400 za identitu nevydáváme.

## Malá reprodukce

`tests/webgpu-shadow-freshness.test.ts` používá skutečné pinned ShadowDepthWrapper, Light/UniformBuffer layouty a BindLights; nahrazuje pouze GPU effect creation/terminal GPUDevice. Je to důkaz CPU mechanismu, nikoli GPU obraz nebo výkon.

1. Základní shadow efekt HEMILIGHT0 + POINTLIGHT1 je ready. Aktuální seznam se změní na sun+point a označí light-dirty. Původní wrapper pořád vrátí ready bez nové kompilace; skutečný BindLights naváže Light0 s80B místo96B.
2. Aktuální seznam se zkrátí na sun. Původní shadow efekt dále vyžaduje Light1; skutečný binding jej neposkytne.
3. Skutečný WebGPUShaderProcessor předvytvoří buffer entry s undefined. Skutečný WebGPUCacheBindGroups při chybějícím Light1 pouze loguje a předá undefined do terminal-device fixture; vznikne odpovídající TypeError i při vypnuté bindgroup cache. Toto izoluje příčinu od cache hitu, ale neprokazuje identitu chybějícího bufferu v uživatelském běhu.

Ověření:17.10.2026 po explicitním ukončení rootova GPU okna; `TSX_DISABLE_CACHE=1 node --import tsx --test tests/webgpu-shadow-freshness.test.ts` z vlastního stagingu. **3/3 PASS**, log `reproduction-v1.log`, trvání~1.2s. Tyto testy záměrně potvrzují výchozí chybu, nejsou GREEN opravou. Žádný GPU/build/server ani instalace. Staging node_modules je readonly junction na dependencies-v5.

## Varianty a návrh před runtime změnou

- Vymazat cache: odmítnuto. Chybně zvolený efekt i chybějící buffer lze reprodukovat bez cache hitu; oprava by přidala práci a neuzavřela příčinu.
- Vypnout hot swapping globálně: odmítnuto. Non-standalone shadow cesta základní readiness vůbec nevolá; globální změna by navíc ovlivnila všechny materiály.
- `standalone:true` pro všechny wrappery: nejmenší změna konfigurace, ale veřejný kontrakt je depth-only základní materiál. Neřeší sám frozen fast path a nutno ověřit render-pass/generátor náklady.
- Úzká lokální factory/subclass pro WebGPU PBR/Standard: navrženo rootu. Před shadow readiness vyvolá base-material readiness, následná pinned wrapper readiness čeká i nový pending efekt oznámený při hot swappingu. Finální light-slot kontrola odmítne staré frozen či jinak neodpovídající typy/počty. WebGL zůstane původní wrapper, žádné přepisy shaderů/cache nebo globální politiky. Původní constructor/dispose/standalone chování se zachová; API root musí přijmout před runtime helperem.
- Upstream patch stejného chování: možný po izolované regresi, ale větší rozsah závislostí a všech wrapperů. Bez důvodu neměnit patch/lockfile.

Root před implementací schválil API `createWebGpuShadowDepthWrapper(material, scene, options?): ShadowDepthWrapper` a lokální variantu; vlastní následné napojení konstrukce wrapperů.

## Pass/ownership průzkum a implementace

`pass-probe-v2.log` porovnal skutečný Standard/PBR, hlavní pass0 a dva shadow generátory/pass9/10, včetně shadow-first změny HEMI→DIR. Base readiness v právě aktivním shadow passu vytvoří vlastní submesh draw-wrapper state, ale stejný base shader sdílí Effect ID; každý generátor si drží stabilní depth Effect ID. Opakování0/9/10 nevyvolalo smyčku invalidace. `currentRenderPassId` ani override se nepřepínaly. V této konkrétní freeze+light-enabled změně se pinned materiál také obnovil; neprokazujeme frozen defekt.

Helper používá subclass pouze pro WebGPU StandardMaterial, PBRMaterial a PBRBaseSimpleMaterial. WebGL i jiné materiály dostanou původní Babylon wrapper. Před super readiness provede základní readiness v aktuálním passu; existující standalone varianta ji už sama provádí, takže není volána dvakrát. Na počátku i po callbackech odmítne změněný pass, binding override, disposed mesh/scénu/wrapper. Nepřepisuje override, shader bytes, hot-swap/frozen politiku, lights ani cache.

Hot-swap může vrátit starý ready base efekt, ale onEffectCreated oznámí požadovaný nový efekt wrapperu. Pinned super readiness pak čeká na jeho skutečné dokončení. Finální kontrola čte LIGHTn/type z aktuálního depth efektu a porovná s leading lightSources podle material maxSimultaneousLights, device-supported clamp, scene.lightsEnabled a material.disableLighting. Neznámý typ/třída, chybějící/duplicitní slot nebo neprokázaný define tvar vrací false. Nenahrazuje neexistující buffer a nezaměňuje HEMI/POINT ani při stejné96B velikosti.

Refaktoring/cache: rozklad define layoutu je jeden lokální helper; výsledek se cachuje WeakMap podle Effect a přesného define stringu. Běžná kontrola pak prochází jen aktivní sloty, ne celý text nebo celou scénu. Cache neudržuje silné Effect/GPU reference. Dispose je idempotentní a zahodí vlastní WeakMap před původním cleanupem. Cena extra base readiness a vizuální průběh čekání jsou zatím CPU mechanismus, nikoli doložený produkční výkon.

## Ověření opravného checkpointu

- `guard-red.log`: stejná veřejná factory v izolovaném baseline vracela původní ShadowDepthWrapper; čtyři opravné guard testy **0/4 PASS,4FAIL**, exit1. Baseline source `baseline-factory.ts` je zachovaný. Jde o zpětnou kauzální kontrolu, nikoli tvrzení pořadí TDD.
- `guard-green-v1.log`: **11/11 PASS**, exit0.
- `types-v1.log`: jeden fixture-only diagnostic pro chybějící `this: NullEngine` u testového createEffect wrapperu; opraveno, runtime neměl TS diagnostic.
- `guard-green-v2.log`: **13/13 PASS**, exit0; `types-v2.log`:2954souborů,0diagnostics.
- `guard-final.log`: **14/14 PASS**, exit0,17.10.2026,~1.5s. Obsahuje tři původní kauzální negativní kontroly a opravu typu, chybějícího slotu,4→3, material/device cap, lighting off, unknown layout, pass/override, standalone/instancing, exception identity, reentrant dispose a WebGL/custom parity. Skutečné Standard/PBR testy navíc ověřují shadow-only změnu, dva stabilní generátory, frozen politiku a pending asynchronní initializer při hot swappingu.
- `types-final.log`: `node typecheck.mjs`, **2954souborů,0diagnostics**, exit0. Přesné kopie helperu/testu ve vlastním stagingu; žádná instalace závislostí.

Nezávislé review a skutečný Edge/GPU průchod ještě neproběhly. Žádný full build/integration/server/GPU nebyl tímto agentem spuštěn. Všechny vlastní CPU příkazy skončily. Source/test/log manifest bude předán rootu; samostatný commit až po jeho review, rezervace dosud držena.
