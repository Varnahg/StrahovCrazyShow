# NCM startup async pipeline experiment

## Výzkum a rozhodnutí před implementací

21.10.2026, task webgpu-completion-native-pipeline-20261021 nad931c6a5f. Primární podklad je skutečný instalovaný Babylon9.30 (včetně projektového patche), nikoli odhad podle názvu API. Actual NCM receipt45291133/source80395553/build14983724 ukazuje315sync/0async a low timeout30s, s překrývajícími se popErrorScope/fence completion latencies přibližně20,7s. To nedokládá cenu CPU kompilace, GPU execution ani budoucí přínos async. Parent vlastní skutečné GPU přijetí nového frozen kandidáta.

- `webgpuEngine.pure.js:2871 _draw`: skutečný DrawContext aktualizuje UBO/vertex pulling. Při dirty draw/material/forceBindGroupCreation zahodí fastBundle; platná NCM fastBundle se přehraje před jakýmkoliv pipeline lookup. Při miss se getRenderPipeline volá ještě před vytvořením draw RenderBundleEncoder. Proto pending sentinel lze zachytit na existující _draw boundary bez publikace částečné bundle. Native completion musí vložit až původní opakovaný cache miss, ne Promise callback.
- `WebGPUCacheRenderPipeline.getRenderPipeline/_lookupRenderPipeline`: native token z tree lookup obsahuje shader, vertex/instance layout, texture state, MRT, samples a depth/stencil. Descriptor zůstává původní `_buildRenderPipelineDescriptor`; builder může přepracovat non-float effect. Získaný pipeline musí projít původním native insertion/counters, zachovat exact Effect/context/modules/device a limit64 pending i completed výsledků. Disabled-cache původní sync behavior se nemění.
- `webgpuEngine.pure.js:1190 _clearFullQuad`: v NCM volá `ClearQuad.clear(null,...)`, původní adapter tuto větev obcházel. `ClearQuad.pure.js:37 clear`: nejprve kontroluje vlastní bundle cache; při miss vytváří RenderBundleEncoder ještě před pipeline lookup. Sentinel nesmí zapsat bindGroups/bundleCache, dokončit ani publikovat částečný encoder. Prázdný opuštěný encoder je GC-only; experiment může přidat jeho alokace při opakovaných pending clear retries a GPU přejímka to musí přiznat. `WebGPUBundleList.addBundle` null/undefined bezpečně ignoruje; není třeba syntetický bundle.
- `WebGPUDrawContext`, `WebGPUMaterialContext`, `WebGPUCacheBindGroups`: původní dirty/reset/buffer/texture updateIds vlastní invalidaci a rebind. Přetrvávající fastBundle je úmyslný native reuse, který adapter nesmí plošně čistit. Regular/thin instancing mají skutečný vertex layout a indirect draw data; oba musí zůstat stejné.
- `ThinWebGPUEngine._endCurrentRenderPass`: NCM skutečně přehraje bundle list a resetuje ho, persistentní DrawContext bundle zůstává. Není doložena hypotéza akumulace starých frame bundles. Neúplné once-only RTT stále vyžadují existující retryIncompleteFrame/resetRefreshCounter; pipeline existence není přijetí kompletního snímku.

| Varianta | Rizika/náklady | Volba |
|---|---|---|
| CM jako stávající kandidát | Ověřená async cesta, NCM problém neřeší | Zachovat beze změny |
| Pouze odstranit CM guard | NCM null-clear zůstane sync, mode drift se stane neviditelným | Odmítnuto |
| Změnit timeout/readiness nebo vracet Promise encoderu | Zakryje skutečné selhání nebo vytvoří neplatný GPU draw | Odmítnuto |
| Přepsat native draw/cache/bundle nebo globálně mazat cache | Velký zásah do bind/geometry/material lifecycle a steady výkonu | Odmítnuto |
| Rozšířit existující startup boundary na captured CM/NCM a null clear | Stejný bounded async state, native token insertion/reuse; navíc pending clear encoder alokace, async benefit neznámý | Zvolený úzký experiment |

Implementace zachytí původní boolean compatibilityMode a odmítne jeho změnu. Aktivní NCM použije stejnou _draw a ClearQuad.clear boundary včetně null pass. Sentinel vrátí pro clear null, nepřipravené GPU IO se přeskočí a původní incomplete/readiness/RTT retry podmínky zůstanou. CM a inert WebGL/snapshot zůstávají. Žádná změna Game, scheduleru, timeoutu, descriptoru, geometrie, materiálů, globální cache nebo renderer defaultu.

CPU ověření použije skutečné pinned _draw/_clearFullQuad/ClearQuad/cache/DrawContext/MaterialContext/CacheBindGroups/BundleList a engine binding/state metody. Náhradou jsou pouze terminální GPU device/encoder/buffer IO a minimalistické Effect shader resource fixtures; nejde o NullEngine FPS, GPU kompilaci, obraz ani startup throughput. Ověřit native insert, fastBundle, dirty rebind, regular/thin instance, sample/attachment/RTT a lifecycle/bounds. Plné testy/build/server/GPU vlastní root.

## Implementace a cílená přejímka

Změna runtime uchovává původní boolean režim a kontroluje jej po celou dobu vlastnictví. Neznámý režim/WebGL/snapshot zůstává inert; WebGL ani nečte compatibilityMode getter. Clear boundary již nezaměňuje null renderPass za neaktivní adapter. Jen vlastní pending sentinel vrací null a finally obnoví boundary; cizí synchronní chyby se dál propagují. Původní state machine/cache/lifecycle logika je společná pro CM a NCM, nezdvojuje se.

```powershell
node --import tsx --test --test-reporter=tap tests/webgpu-pipeline-preparation.test.ts tests/webgpu-native-pipeline-preparation.test.ts
```

Nové NCM testy mají skutečný WebGPUDrawContext, MaterialContext, BufferManager, CacheBindGroups, SnapshotRendering, BundleList, ClearQuad a engine `_draw`, `_clearFullQuad`, `_endCurrentRenderPass`, binding/state metody. Při miss nevznikne draw encoder; null-clear může mít nedokončený prázdný encoder, který se nikdy nefinishne/nezařadí do bundleCache ani nevykoná. Fake terminal encodery odmítají Promise v setPipeline. Actual pass-end přehraje a resetuje frame list; příští frame použije přetrvávající fastBundle. Actual uniform resource po rebind, instance stepMode/binding a indirect count3→5 se ověřují, bez překladu shaderů či scene/mesh/image/GPU přejímky. Regular a thin tests pokrývají obě podoby vertex bindingů spotřebované pinned `_draw`; nesimulují kompletní Mesh lifecycle nebo animaci postav. RTT použije skutečný once-only ObjectRenderer refresh counter a původní retry callback.

Cílený TypeScript program má přesně tři root files výše (runtime adapter a oba tests) a jejich imports, používá stávající tsconfig options a noEmit. Není to celý pnpm build. Node24 a Babylon pin nejsou odhadnuté výkonové profily. `verification.json`, `targeted-tests.tap`, `typecheck.log` uchovají skutečný výsledek, source/pin SHA před/po a přesné meze. První35/38 vývojový běh měl3 fixture failures kvůli structuredClone opaque GPU bufferu; nebyla to chyba runtime adapteru. Opaque resource identity se nyní zachovává a následný9/9 NCM průchod prošel. Při cíleném TS následovaly dva postupné testové control-flow/optional-fastBundle assertions (TS18048 a TS2339 přes callback), opravené explicitním načtením opaque GPU handle pro inspekci. Bound fixture po skutečném drawContext.reset znovu navazuje svůj uniform buffer, aby netestovala neplatný missing-buffer draw. Finální společné výsledky patří verification.json.

Root musí odděleně prokázat nový frozen snapshot/bundle, skutečné NCM async requests/native insert a original timeout/health, clear/scissor/RTT/attachments/instancing obraz, počet opusťených clear encoderů a plný1/3MP HUD výkon s různými avatary. GPU factory může serializovat i async implementaci; CPU correctness ani přesun názvu API nedokládá rychlejší startup, FPS nebo vyřešený CM shader churn.
