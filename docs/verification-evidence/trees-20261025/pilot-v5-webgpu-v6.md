# R5 pilot a lokalizace WebGPU startupu

26. 10. 2026. Navazuje na [R4 důkazy](pilot-v3.md). Jde o rozpracovanou přejímku dvou stromů; ostatních108 zůstává legacy. Úplný katalog ani WebGPU migrace nejsou dokončené.

## R5 / candidate-v5

Zdroj `3fbc7986e4bc7d31f94956c2a5a221505d76bb47b08fc5211a223dfb19893910`, 8809 souborů včetně testů. 217/217 cílených testů, produkční build a izolovaná integrace PASS; logy `targeted-v5.log`, `build-v5.log`, `integration-v5.log` v lokální `.cache/trees-validation-20261025/`. Není to celá testovací sada.

Skutečná hra v Edge/GTX1060, WebGL2, 1280×720 CSS i interně, medium, letní denní clear DEMO, pevná B5 near kamera, HUD a jeden hostující avatar:

| Záznam v `.cache/trees-gpu-20261025/` | FPS | p95 ms | p99 ms |
|---|---:|---:|---:|
| `v5-own-b5-near-summer-medium-01.json` | 29,8 | 43,0 | 62,7 |
| `v5-own-b5-near-summer-medium-02.json` | 30,7 | 39,8 | 48,6 |

Platný render health, žádné asset chyby. Aktivní tree geometrie685425tri;20 cache entries /33617020B, pending0/reserved0. MID zachovává všechny listy/větvičky, LOD0 používá zjednodušené dřevo a šestitrojúhelníkové fir podpory. Jde o celou scénu, ne izolovaný test stromu; neudává se přesná procentní úspora oproti R4 kvůli driftu Actoru a proměnlivým GPU taktům. Následná oprava priority stromů podle kamery v tomto buildu ještě není.

Nový B5 far obrázek již nemá stadion uprostřed pohledu, ale malou korunu a částečný překryv další vegetace; není přijetím hustoty FAR. Ground autumn/high záznam má30,7FPS/p9539,6/p9945,5,5 aktivních litter patches/357items/1428tri, bez chyb. Pohled není dostatečným detailním obrazovým důkazem opadu; do další verze přibyl pevný `b5-tree-ground`.

## WebGPU / candidate-v6

Zdroj `17685dbb874097ba96b3c3951c191d3b947dcb10f76847469c1a0de9116dcf38`, 8809 souborů. **242/242 cílených testů, build a izolovaná integrace PASS.** Stejné názvy logů s příponou `-v6`. Přidán uživatelem požadovaný výchozí WebGPU, explicitní WebGL2 tlačítko po chybě a lokální readiness diagnostika. Hrané uložené kopie4179/2592 zůstaly beze změn.

URL `http://127.0.0.1:4182/?terrainReview=b5-tree-near&treePilot=own` nemá backend parametr. Edge použil WebGPU, ale příprava skončila timeoutem. Tlačítko kompatibility se zobrazilo; v tomto běhu nebylo kliknuto. Screenshot a přesný vybraný collector záznam: `v6-webgpu-pipeline-timeout.png` / `.json` v lokální GPU evidence cache.

- Celá low příprava30026ms aktivního času,0ms paused.
- `current-on`:20063ms,852ticků,140renderů,0restartů,87202 mesh checks.
- Čekání: mesh0, precipitation0, **pipeline112**, health0, effects0. Poslední dvě kontroly jsou až za pipeline short-circuitem; nula jejich waits neznamená, že byly vždy vyhodnoceny.
-327 shader preparations,654 shader modules/validations,271async a49sync pipelines dokončeno bez chyby/pending.

Tento běh lokalizuje blokaci do pipeline readiness adapteru; nevysvětluje ji pouhé uspávání karty ani nehotový model. Zatím nerozlišuje incomplete frame, serial nebo nevyzvednutý výsledek. Nová bounded opt-in diagnostika adapteru se připravuje. Readiness pravidla a časové limity nejsou změněny.

Čtecí review odhalilo, že původní `lastGate` znamená poslední false v etapě a jméno materiálu může být starší. V tomto konkrétním záznamu mají mesh i precipitation nula waits a obě jména jsou null, takže pipeline lokalizace obstojí. Následná oprava maže staré popisky po dokončení celé mesh fronty a při non-mesh false;2/2 přímé Game regrese PASS. `mesh.isReady(true)` navíc zahrnuje shadow/LOD větev, proto samotné jméno materiálu nikdy není důkazem chyby hlavního shaderu.

Po zachycení důkazů byla Edge karta vrácena na about:blank. Žádná GPU scéna neběží během dalšího buildu. Závěrečný full-suite, funkční WebGPU start, skutečná vizuální/výkonová přejímka všech kvalit, katalog110 stromů, review, commity a main integrace zůstávají otevřené.

## V7: rozlišení adapteru od opakované tvorby shaderů

Zdroj `086098ef253d03da27e530994536bb63e322079e22e997d555d37b10ae99a087`;96/96 cílených testů a produkční build PASS. V tomto malém diagnostickém kroku nebyla opakována nezměněná serverová integrace zV6. Výchozí WebGPU opět timeoutuje vcurrent-on. Adapter na konci hlásí prázdné entries/work, shodný completion/proven serial311 a ready=true;65 dokončených renderů ale není65 přijatých potvrzení. Outer helper vyžaduje dvě po sobě jdoucí cesty pre-ready→render→post-ready, nikoli pouhý dokončený progress draw.

Kontrolní explicitní `webgpu-fast` na stejném immutable buildu má inert adapter a stále timeoutuje vcurrent-on, s49 čekáními na preparation health. To vylučuje adapter jako samostatnou příčinu. `shaderValidation` je oddělený operation kind; jeho čtyři pending operace nejsou vysvětlením těchto49 preparation čekání. Oba běhy jsou diagnóza, nikoli benchmark stejné vizuální kvality/výkonu. Collector identifikuje nvidia/pascal/WebGPU; viewport této reprodukce1528×650CSS, rozlišení se během quality prewarm mění.

Další běh s existujícím `profileEnvironment=1` prokázal vcurrent-on372 shader modules, z toho288 opakování přesně shodných bajtů. Šest raw skupin po49 voláních odpovídá třem vertex/fragment programům vytvářeným opakovaně. Evidence vGPU cache: `v7-webgpu-pipeline-timeout.json`, `v7-webgpu-fast-timeout.json`, `v7-webgpu-shader-inventory.json` a odpovídající PNG. Counter pojmenovaný `descriptor-token` původní privacy sanitizer správně vynechal; jeho nepřítomnost se nesmí interpretovat jako nula a sanitizer nebyl oslaben.

Zdrojový průzkum a následná CPU reprodukce určily konkrétní nesoulad: `Mesh.isReady(true)` při kontrole stínu nastavuje pass ID, ale nikoli `colorWrite`; skutečný PCF průchod vypne colorWrite. Fresh PBR wrapper proto během readiness/draw střídá `DEPTHPREPASS`, znovu vytváří base efekt a maže odvozený depth efekt. Skutečný `VehicleLighting(player/low)`, PCF callbacks a TreeWind/TreeSeason PBR po zahřátí3 programů vytvořily během8 check/render cyklů dalších16. Původní RED log zachovaný v `.cache/trees-shadow-startup-repro-20261026/red-first.log`.

Úzká oprava normalizuje tento stav pouze uvnitř WebGPU Fresh wrapperu pro skutečný `FILTER_PCF` a obnoví přesnou původní hodnotu vfinally. PCSS potřebuje barevnou depth texture a nesmí být zahrnut. Game-wide vypnutí colorWrite by poškodilo přípravu kamerového materiálu. První opravený CPU běh zachoval3programy a stejný depth efekt; lifecycle regrese a následnýGPU důkaz se dokončují samostatně. Tím ještě není deklarován vyřešený reálný startup.
