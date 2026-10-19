---
title: 'CPU vlákna klienta Strahov: výzkum a volba experimentu'
type: technical
topic: client-threading
decision: select
source: native research + oddělený audit pinovaného projektu
status: complete
preset: standard
validation: normal
created: 2026-10-19
updated: 2026-10-19
claims_verified: 3
claims_unverified: 8
---

# Rozhodnutí

Nezačínat přepisem fyziky do Rustu ani přesunem celé hry do jediného workeru. První varianta míří na malý náklad, druhá zachová sériový render a znamená rozsáhlou změnu ovládání, síťového pořadí a životního cyklu. Produkční rozhodovací profil nyní přiřadil sedm environment špiček celému controlleru ambientní dopravy a cestujících; tráva v těchto událostech nebyla významná. Dalším krokem je reprodukce opakovaných průchodů scénou při vzniku materiálů NPC a porovnání jednoduššího dávkování s workerem. Přesný podíl této funkce na špičkách zatím není znám. Render worker zůstává kandidátem pro odezvu UI. Vyšší FPS u žádné worker varianty zatím nejsou doložené.

Základní výzkum odpověděl na architektonické otázky a první produkční profil zúžil další experiment. Jde o rozhodnutí pro další práci v KEY-40, nikoli o dokončení optimalizace.

## Požadavky a dosavadní důkazy

Tvrdé podmínky: stejná scéna, obraz, ovládání a fyzika; multiplayer pořadí a izolovaný host; bounded cache/fronty/paměť; spolehlivé zrušení a teardown; hrané buildy a cizí WIP zachovat. Preferujeme plynulost a rychlou odezvu, nikoli kratší startup. Číselné pořadí variant nelze poctivě vypočítat, dokud chybí jejich výkonové výsledky.

V ručním testu source `65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60`, session `50f80eab-61bd-4576-b6b6-8b3b17911653`, má Medium 48,67 FPS, p95 31,2 ms, p99 43,7 ms; High 44,06 FPS, p95 38,1 ms, p99 46,1 ms. Ve vzorcích pořízených zcela během hraní v popředí má GPU medián 31 %, maximum 47 % a VRAM 3 420 / 6 144 MiB. To nepodporuje nedostatek výkonu GPU či VRAM jako hlavní průběžný limit. Přibližně jedno jádro na renderer procesu není měření konkrétního JS vlákna. [8]

Nový reprodukovatelný přepočet stejných 8 761 snímků pro Medium a 7 578 pro High: průměrný čas fyziky 0,340 / 0,383 ms, environment 1,109 / 1,767 ms a renderu 15,989 / 18,417 ms. Dvojice hodnot jsou vždy v pořadí Medium / High. Environment maxima jsou 53,7 / 34,3 ms; render 186,4 / 137,6 ms. Render bucket zahrnuje přípravu světel i scene.render, nikoli pouze draw calls. Delší RAF mezera 1 071,9 ms měla předchozí CPU 42,9 ms a zůstává nevysvětlená; nelze ji automaticky připsat shaderům. [8]

## Co web a Babylon skutečně dovolují

Dedicated Worker nabízí samostatný event loop. OffscreenCanvas dovoluje vlastnit canvas renderer mimo DOM; vstupy a UI potřebují zprávy. Přesun zachovává sériové části uvnitř workeru. Worker RAF má vlastní plánování, není zárukou prezentovaného snímku. [1][2]

WebGPU je vystavené i ve workeru, ale dnešní API neumožňuje vícevláknové používání jednoho GPUDevice. Explainer uvádí přenos GPUBuffer/GPUTexture jako budoucí návrh. Neplánujeme tedy pool workerů sdílejících jeden Babylon renderer. [3]

Plný Babylon core podporuje OffscreenCanvas; dokumentace a demo nejsou pouze Babylon Lite. Pin 9.30 má odpovídající Engine i WebGPUEngine konstruktory. Lokální audit ale našel rozdíly DPR/resize, Date.now místo performance.now v interních CPU counterech a importScripts cestu nekompatibilní s module workerem. Zachovat nativní WGSL a zákaz GLSL translatoru; shodu assetů, fontů a dekodérů prakticky ověřit. [4][9]

Transfer ArrayBuffer předává vlastnictví a odpojí původní buffer; cache nesmí dál držet odpojené matice. SAB/WASM threads vyžadují další izolaci a synchronizaci. Rust ani Python samy neparalelizují Babylon scene graph; WASM má smysl pro doložený numerický algoritmus. [5][6]

## Porovnání variant

| Varianta | Který problém řeší | Náklady / rizika | Rozhodnutí nyní |
| --- | --- | --- | --- |
| Omezit scene traversal/submission | Dominantní render CPU | Nízké až střední; batch culling, vzhled a invalidace | Nejsilnější obecný směr; shadow-pass chybu vlastní původní vlákno |
| Jeden worker pro cold grass placement | Nezávislá klasifikace/terrain/matice při pohybu | Střední; bounded queue, stale výsledky, cache detach, zpoždění detailu | Technicky malý kandidát; první profil jej neposunul před transit |
| Worker pro fyziku | Simulace a queries | Vysoké: kamera/feet/LOS/reconcile/snapshot latency | Teď zamítnout: průměrně méně než 0,4 ms v dodaném testu |
| Renderer v OffscreenCanvas workeru | Main-thread input/HUD konkurence | Vysoké: DOM/labels/input/network/canvas lifecycle; render zůstává sériový | Další experiment pro odezvu, nikoli předem slíbené FPS |
| WASM threads / SAB / compute | Velké numerické joby | Nový build, izolace, synchronizace/readback | Odložit do doloženého hotspotu |
| NCM/batching/snapshot | Opakované draw příkazy | Scene změny invalidují reuse; coarse culling a aktualizace UBO | Existující webgpu-fast nezapínat bez A/B; plošný snapshot nevhodný první krok |

NCM/batching mechanismy jsou doložené oficiální dokumentací, nikoli výkonovým výsledkem této hry. [7] Cold grass už má cache pro 1 536 dlaždic a 2ms úseky kooperativní přípravy; stacionární test s naplněnou cache proto může mít nulový přínos. Transit worker zase nesmí zpozdit auta proti přesnému physics sampleru. [9]

## Produkční experiment a další podmínky přijetí

Vlastní API na portu 2599 a preview na 4204, přesná kopie zdrojů a testů a pouze čtené dist současné verze 4203. Stávající `profileEnvironment=1` oddělí environment části; stávající render benchmark rozliší render targets, active meshes a draw. Diagnostický běh neporovnávat přímo s FPS bez diagnostiky. Žádná nová vrstva diagnostiky před výsledkem.

**Provedeno:** jedna skutečná multiplayer relace v Edge, noční produkční svět, chůze a Medium po počátečním Auto/Low, 1 912 × 867. Zachováno 5 500 souvislých záznamů. Sedm post-ready transit intervalů mělo 26,8–86,9 ms, vegetace v nich 0–0,3 ms. Samostatná quality transition měla cinematic 325,3 ms. Desetisekundový stacionární diagnostický benchmark naměřil render 28,10 ms, activeMeshes 5,89 ms a mainDraw 21,01 ms; během něj nevznikl nový shader/pipeline. Podrobné hooks byly aktivní, nejde o FPS A/B. První neaktivní start s přibližně 1 RAF/s timeoutoval a zůstává neplatným pokusem. Vlastní scéna a služby byly ukončeny; hrané verze beze změny. [11]

Následný audit transit řetězce rozlišil čistý schedule sampler od tvorby/rušení meshů, materiálů, LOD a raycastů živé fyziky. Worker sampleru tyto scene-owned operace neodstraní. Prioritní samostatná CPU reprodukce proto měří nové `CharacterMaterials` PBR settery a jejich opakované cizí mesh traversals; pouze při potvrzení se zkusí veřejné dávkování, bez další cache či změny parametrů. Atribuce celých transit špiček zůstává otevřená. [11]

Pokud bude příprava cold grass významná, jeden dlouho žijící bounded worker: čisté joby a transferable matice, main vlastní cache a GPU integraci, žádné await uvnitř frame. Zachovat stejná data a rozpočty i při quality change, rychlém otočení, chybě a dispose. Alternativa ke workeru je menší počet zbytečných výpočtů nebo levnější cache; porovnat oboje.

Po prototypu tři proložené produkční páry se stejnou trasou, kvalitou, rozlišením, reálnými relacemi a stavem cache. FPS, p95/p99, záseky ≥ 100 ms, prodleva od vstupu k aplikaci a vykreslení, stáří fronty a objem zpráv, paměť a rychlost doplnění viditelného obsahu. UI FPS ani počet callbacků nejsou náhrada prezentace hry. Časy realms sjednotit přes timeOrigin. [2][10]

Otevřeno: která část transit controlleru vytváří kolik nákladu; konkrétní Edge worker device/asset podpora; zda by renderer worker odstranil neobjasněné RAF mezery; cena komunikace. Profil ani dokumentace to zatím nerozhodly.

## Zdroje

Všechny webové zdroje načteny 19. 10. 2026; `n.d.` je průběžná dokumentace bez stabilního data publikace. Audit a ruční logy jsou oddělená projektová evidence.

| Ref | Podporované tvrzení | Vydavatel / zdroj | Publikace | Přístup | Jistota |
| --- | --- | --- | --- | --- | --- |
| [1] | Worker event loop a ownership | [WHATWG Workers](https://html.spec.whatwg.org/multipage/workers.html) | living standard | 2026-10-19 | střední, primární |
| [2] | OffscreenCanvas odděluje UI; přínos závisí na práci | [Chrome OffscreenCanvas](https://web.dev/articles/offscreen-canvas), [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) | Chrome2023-12-08; průběžná MDN | 2026-10-19 | vysoká pro mechanismus, ne herní benefit |
| [3] | GPUDevice multithreading dosud návrh | [GPUWeb explainer](https://gpuweb.github.io/gpuweb/explainer/#multithreading), [MDN WorkerNavigator.gpu](https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/gpu) | explainer2026-10-16; MDN2025-06-18 | 2026-10-19 | střední, zákaz má primární zdroj |
| [4] | Full Babylon OffscreenCanvas | [Babylon dokumentace](https://doc.babylonjs.com/features/featuresDeepDive/scene/offscreenCanvas/), [zdroj dema](https://www.babylonjs.com/Demos/Offscreen/source/) | n.d. | 2026-10-19 | střední, stejný vydavatel |
| [5] | Transfer/SAB a izolace | [WHATWG structured data](https://html.spec.whatwg.org/multipage/structured-data.html), [Chrome COOP/COEP](https://web.dev/articles/coop-coep) | průběžné | 2026-10-19 | vysoká pro izolaci |
| [6] | WASM thread build podmínky | [Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html) | n.d. | 2026-10-19 | střední |
| [7] | NCM/batching/compute varianty | [Babylon NCM](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/), [thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/), [compute](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/) | n.d. | 2026-10-19 | střední |
| [8] | Skutečný starší ruční test a nový přepočet fází | `docs/performance/client-threading/manual-phases.json` a `analyze-manual-phases.mjs`; raw SHA8c2fea54…29a88, původní manual-analysis-01/derived.json | 2026-10-19 | 2026-10-19 | reprodukovaný projektový důkaz, ne A/B |
| [9] | Pin9.30 a konkrétní herní hranice | `digests/babylon-r1.md`, `digests/application-r1.md`, source65d028 | 2026-10-19 | 2026-10-19 | audit skutečného kódu |
| [10] | Časy mezi realms a skutečně prezentované snímky | [W3C High Resolution Time](https://www.w3.org/TR/hr-time-3/#examples), [Chrome Performance](https://developer.chrome.com/docs/devtools/performance/reference) | průběžné | 2026-10-19 | střední |
| [11] | Nový skutečný profil a audit transit řetězce | `docs/performance/evidence/client-threading-20261019/README.md`, raw SHA60f8c1e0…9d94fc; `digests/transit-r2.md` | 2026-10-19 | 2026-10-19 | konkrétní měření; bez funkční atribuce/FPS A/B |

## Obnova výzkumu

Mechanický výpočet `staleness.json` označil starší článek Chrome z roku 2023 za zastaralý podle 24měsíčního okna (termín 8. 12. 2025). Proto není jediným důkazem současné kompatibility; mechanismus byl znovu ověřen v aktuálních WHATWG a MDN podkladech. Nejbližší budoucí datum kontroly datovaného WebGPU tvrzení je 16. 11. 2026. Nedatované průběžné stránky nemají vymyšlené datum publikace a jsou z výpočtu vynechané; před nasazením se musí znovu načíst. Projektová čísla a audit se znovu ověřují při změně snapshotu nebo závislostí, nikoli až po uplynutí kalendářního okna.

Mechanická kontrola citací: bez chyb. Nezávislé sémantické ověření rozhodujících externích tvrzení a nového profilu: bez věcných nálezů; nezahrnovalo nový GPU běh ani vlastní přepočet raw dat. BMAD structure review: bez nálezů; prose review opraveno (čitelnost metrik, přiřazení Medium/High, přesnější označení dosavadních důkazů). Ledger podle `recon_kit tally`: 3 nezávisle potvrzená, 8 bez nezávislé replikace. `unverified` zde neznamená bez zdroje: jde o primární zdroj nebo místní měření s výslovnými limity. Žádná z položek neověřuje vyšší FPS workeru.
