# KEY-31: nativní stabilní pořadí literal defines

18.10.2026. Runtime commit `c18844f2264dd773269406346e62318d0dee3338` → main `7eb777763c9cbf1b090d672d755d12d0a59a987d`. Přesně7 souborů: Babylon patch/lock,2regrese a3fixtures.132dalších working cest zachováno. Žádný install do main/WT, default renderer změna ani přenos QA15stage Game. [Předchozí QA přejímka](../hitches-v19/README.md) se automaticky nepřipisuje nativní hře.

## Přenos a ověření

Manifest `a3b0d5fe839c5ecdc6fc116427191040008ebc3ebaf1bddf9abbe954503ca5d8`; patch `21114f6048abdcba932a8640adf1a97b6281939d99ae6d53fbfe96ef76bf0503`, lock `03d4edcd8f9d92fa7b6b320f5600709dd62612a5bad7867cef61875e7ecd8b53`. Původní9813B patch zachován, pouze6lockhash substitucí. Scenario/serializer byte-exact QA; WGSL test přidává jen bounded gzip načtení a integrity assertions.9 709 634B baseline →1 370 891B gzip; rozbalený SHA `355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f`.

Leaf18/18, related103/103 bez skipů, scopedTS3169/0. Nezávislé čtecí review ověřilo7výstupů/16artefaktů/105source closure, assertions34→34 a17→19, všechny preimages a chráněné Game/light-preparation/render-engine/package/inactive-helper/dependencies bez změny. Bez blokujících nálezů.

Root snapshot `2a3dba44ea28dbeffa5324fe22c35011b1e333c4233bb99ed487ee7e057d3584`, native WT source `5ae43a55e142889ec54a606cff6f494148208ebb`,567hashovaných souborů včetně testů/provenance. Fyzické frozen QA core/loaders readonly, vlastní node_modules root a tool shims. Shared dependency metadata se nezměnila.

| Kontrola | Výsledek | UTC |
|---|---|---|
| pnpm test |1330/1330,0skip,exit0|06:33:03–06:35:58|
| pnpm build --configLoader native |fullTS/build PASS|06:36:02–06:36:45|
| izolovaný pnpm test:integration |PASS,exit0,port2568 uvolněn|06:36:50–06:37:14|

Build ponechává známá chunk/dynamic-import warnings. Integration4002 teardown zprávy doprovázejí úspěšné kontrolované ukončení; nejsou zamlčené. Při stagingu nejprve diff-check odmítl převzatou prázdnou EOF řádku scenario; source zůstal byte-exact a kontrola byla zopakována s explicitním `-blank-at-eof`. Žádné test assertions nebyly oslabeny.

## Skutečný Edge smoke

Dva čerstvé API běhy na vlastní4194/2589, stejný snapshot,1512×642 CSS i internal,manual medium,Alex a1skutečná multiplayer relace. WebGPU kompatibilní režim,Nvidia/Pascal; WebGL2 ANGLE NVIDIA GTX1060/D3D11. Řízené počasí cloud0.96, bez profileEnvironment. Původní4193 zůstala v menu s avatar preview; žádný souběžný build/test/GPU hra. Měřicí karta ve vlastním schváleném okně v popředí.

Vstup do hry → Golden předvolba →10s benchmark s prvnímF → obraz →W1,2s →F →odchod/menu →about:blank. Přepnutí Golden nebylo uvnitř benchmarku. U WebGPU během něj ovládání jednou timeoutovalo; následný DOM potvrdil předvolbu a nezahájený benchmark, který se pak spustil. Nejde o shader error. F off byl odeslaný, okamžitý aria stav mohl zaostávat; z těchto raw dat bez QA action markers jej neprohlašujeme za samostatně potvrzený stav. Pohyb je omezená smoke kontrola, nikoli kompletní kamera/řízení přejímka.

| Metrika | WebGPU | WebGL2 |
|---|---:|---:|
| Vstup→ready |33,4601s|35,1522s|
| Příprava9etap |20,1074s|20,6507s|
| FirstF10s FPS |11,4|36,7|
| p95 / p99 |36,4 /798,9ms|33,6 /63,2ms|
| Maximum intervalu |6265ms|1414,6ms|
| Nové WGSL moduly / programy / sync |82 /41 /57|WebGPU counters nepoužitelné|
| Render/asset/health errors |0 /0 /0|0 /0 /0|

Oba renderery vykreslily svět/avatar/vegetaci/auta/svítilnu a vrátily menu, RenderHealth na začátku i konci valid, žádné pending operations. Toto je funkční smoke **s nevyhovující plynulostí**, nikoli opakovaný matched A/B nebo důkaz startup výhody. Native nemá QA day/B6 coverage, a proto stále vytváří nové varianty při prvnímF. Obrazy nejsou pixel-exact parity, protože živý čas/ambient a animace se liší.

WebGPU raw session `fc5640eb-7c5e-45da-9573-bc60e99f24bd`,415souvislýchrecords0–414,SHA `d3785e8ff30148e6ed14a71fd1ede2bd2c24119001c79707972a50639767a332`,dispose404. WebGL2 `455dafa4-7c08-4a91-b290-867abf1011c0`,359records0–358,SHA `1ad9128420a77890e02da0d049cc49abba8dc0d550fd4d25ab1cd398041bb272`,dispose345. Žádné fault/error/failure eventy; samotný game-dispose má prázdná data a není kompletní resource-leak důkaz. Post-dispose preview práce je v raw zachovaná.

## Rozhodnutí a další hranice

Nativní serializer komponenta je přijatá pro současné ověřené projektové hooks. Global MaterialDefines nemáWebGPUguard; pořadově závislý custom hook je známá nepodporovaná větev, guard ji nerozpozná. Mirrored baseline RED zůstává v [původním proofu](../hitches-v18/README.md). Úplná funkční/LOD/multiplayer/host/fault přejímka, stabilníFPS, startup a opakované rendererové páry zůstávají otevřené.

Následuje oddělení CPU ceny přepínání již známých Effectů: V6 firstF313,9msCPU s1programem/794Effectchanges,steady23FPS a825drawů jsou jiné části problému než native82novýchmodulů. Samostatný bounded CPU proof rozliší defines/serializer/options/cachehit/reset, bez nové produkční diagnostiky nebo automatického zavedení cache. Přenos skutečně potřebné QA coverage vyžaduje sémantický native plán a startup tradeoff.

[Archivní manifest](archive-manifest.json) ověřuje38 artefaktů. Screenshoty: [WebGPU](define-native-webgpu-smoke-1.png), [WebGL2](define-native-webgl2-smoke-1.png). Služby4194/2589 po obou bězích identity-stopped, kartaabout:blank. Hrané4193/4192/4188 nezměněné. Linear `fd948b83-c929-4ddd-9147-0c0acbfa8c41`; KEY31/celkový migrační cíl nejsou dokončené.
