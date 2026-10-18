# Warm material switch: plán důkazu před implementací

Podklad hitches-v19 má při V6 first F 313.9 ms CPU / 280.3 ms main, 1 program, 794 Effect changes, 825 main draws a 200.0 ms draw preparation. Poslední interval je onBeforeRender→onBeforeBind (mesh-draw-profile172–182,306–321), není to samotný compiler/serializer/cache. Nelze jej odvodit z počtu nových programů.

Pinned PBR isReadyForSubMesh921 volá _prepareEffect; ta963–1198 nejprve _prepareDefines, poté při dirty markAsProcessed, fallback/attribute/uniform/sampler/plugin options, serializer a teprve createEffect. Cache hit na konci proto nevynechá předchozí přípravu. Vrácený Effect dále vyvolá onEffectCreated, resetCachedMaterial a subMesh.setEffect (PBR924–945). Standard má podobný inline řetězec840–1277, bez samostatné callable _prepareDefines. DrawWrapper.setEffect50–59 standardně volá drawContext.reset; WebGPUDrawContext.reset79–88 uvolní owner slots a invaliduje buffers/bindGroups/fastBundle.

Zkouška použije skutečné PBR/Standard a CampusSurfaceArt plugin, 12 skutečných meshes s více skutečnými submeshes, S/P/D/H světla a předem dokončené 3/4 varianty. Nezměněné draws se porovnají s návratem do teplé varianty a se skutečnou změnou hodnoty define. Žádné přepsání readiness nebo ruční dirty flag jako náhrada nativního Light.setEnabled. Scene/GltfBudget/StableLightState/mesh/material/binding/draw zůstávají původní.

Instrumentace je pouze lokální testový owner nad skutečnými instančními metodami a synchronními marker intervals. PBR _prepareDefines je vlastní call scope. U Standardu se přizná širší ready-entry→markAsProcessed interval, nikoli čistý čas helperu. Options-before-serializer a serializer-end→cache-entry jsou přímé intervaly uvnitř téže invocation. Nested plugin, _prepareEffect, readiness, setEffect a reset jsou inclusive; nesmějí se sčítat jako nezávislé části. Zvlášť se vykáže skutečný createEffect cache hit a nové programy. Nezachycená práce se nebude odhadovat odečtem nesrovnatelných čítačů.

Engine adapter vychází z existujícího NativeProcessingEngine: skutečný WGSL processor/context, pipeline creation/submission zůstávají NullEngine. Pro cache se deleguje přes skutečnou pinned WebGPUEngine.createEffect metodu, nikoli její kopii. Actual WebGPUDrawContext může doložit JS reset bookkeeping, ale bez skutečného GPU bind-group/UBO-slot tlaku; tyto náklady nejsou browser/GPU profilem. Světelné stíny budou v tomto úzkém main-material proofu vypnuté a jejich cena nepřejímaná. Žádné world/GLB/driver zatížení.

Varianty před měřením:

1. Dřívější lookup ve stávající cache: mohl by vynechat options sestavení, ale musí respektovat plugin/fallback callbacks, attributes/uniforms/samplers a onEffectCreated/reset ownership. Zatím nevybrán.
2. Levnější čistá serializace: může pomoci pouze její vlastní ceně, nikoli zbývajícím callbacks/draw resets. Musí zachovat whole-block fallback a getter/string kontrakt; nové persistentní cache nejsou automaticky oprávněné.
3. Shared-material příprava: různé submeshes mohou mít různé lightSources/receiveShadows/instance/pass/texture metadata. Nelze sdílet jen podle material identity.
4. Stabilní světelné sloty: mohly by omezit dirty/switch, ale mění aktivní budget, potenciálně shader/image práci, více současných místních světel a fixed-cap výběr. Širší dosud nevybraný redesign.
5. Další prewarm: odstraní první chybějící varianty, nikoli opakovanou cenu warm switch. Přidává startup práci a musí zachovat shadow lifecycle.
6. Žádná změna: správné, pokud bounded CPU data nedoloží užitečnou hranici nebo se nepromítne do browser profilu. Tento task nevytváří runtime kandidáta.

Výstup musí obsahovat counts/raw fáze, srovnatelné invariants a cleanup success/failure, provenance a vlastní limity. Časy z Node nejsou násobitel pro 794 produkčních změn ani slib úspory ve hře.
