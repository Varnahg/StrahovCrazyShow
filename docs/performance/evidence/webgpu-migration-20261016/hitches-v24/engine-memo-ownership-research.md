# Rozhodnutí o vlastnictví případného memo kandidáta

18. 10. 2026. Zdrojový průzkum functional_record; root vybral pro izolovaný QA kandidát explicitní engine/device-owned adapter. Není schválená modulová cross-scene cache ani výjimka z pravidla vlastnictví v docs/performance/webgpu-migration.md:55.

PBR má engine na pbrBaseMaterial.pure.js:970 a toString na1182; Standard engine838/toString1264. Příprava pluginů/customShaderNameResolve předchází serializaci a musí zůstat. Background/Node/OpenPBR mají jiné callsites a nejsou automaticky zahrnuté.

Optional engine argument je menší změna, ale custom toString override by nově dostal argument. Konzervativnější interní adapter jednou přečte metodu, porovná ji se zachycenou původní stock identitou a custom/později zabalenou metodu zavolá s původními0args/receiverem. Veřejné toString zůstane čisté; stock adapter sdílí přesný rawloop. Interní statická metoda může zachovat module exports, ale nové interní API/refaktoring musí být přiznané a testované.

Soukromý WeakMap<engine,owner> poskytne oddělené kvóty a lifetime. Žádný ambient current-engine/LastCreatedEngine/Scene. Entries mají jen primitive stringy a účetní počítadla; owner zná vlastní device/epoch/cleanup. Rawloop vždy předchází cachehit a jeho getter může reentrantně použít jiný engine, zrušit svůj nebo změnit device. Obsolete lease se po loopu nesmí použít, výstup přesto musí odpovídat čistému canonicalizeru.

Projectfactory client/render-engine.ts:198–205 nastavuje doNotHandleContextLost:true. Pinned webgpuEngine.pure.js:473–500 v takové konfiguraci nepřeposílá device.lost do engine observables. Pouhé onContextLost/onContextRestored tedy nestačí. watchWebGpuValidation:54 je příklad current-device guardu. Vlastní loss watcher nebo explicitní projektová invalidace musí mít bounded/weak/detachable reference, stará generace nesmí zasáhnout novou ani druhý engine. Dispose vyprázdní data a odstraní vlastní registrace. Restore event v abstractEngine.pure.js:239–242 předchází resetu _contextWasLost; není to samo potvrzení ready hry.

RenderHealth.valid není memo eligibility: během startup/pending validací je false. Potřebný je skutečný active/lost/disposed/device/epoch kontrakt. Při neznámém nebo ukončeném owneru se použije čistá cesta. Logical codeunit cap není záruka fyzického heapu.

Současný h21 timing wrapper na veřejném toString by adapter vyhodnotil jako custom fallback. Nový CPU proof musí změřit skutečnou adapter cestu a zachovat neinstrumentovaný celýrender. Vyžaduje původních18regresí plus dvaenginy/oddělenécaps, loss bez engineobservable, dispose-before-loss, device replacement, lateoldcallback, customoverride0args, getterreentry a cleanup/throws. Teprve potom má smysl nový day13 GPU/startup A/B. Dosavadní testový owner toto produkční vlastnictví nedokazuje.
