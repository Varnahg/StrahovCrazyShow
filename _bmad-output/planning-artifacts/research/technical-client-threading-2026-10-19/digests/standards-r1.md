# Worker standardy — 19. 10. 2026

Výzkumník worker_standards_research, pouze externí primární zdroje, načteno 19. 10. 2026. Žádná projektová změna ani GPU test. Datum publikace průběžných standardů není stabilní release date; přístup je datum ověření.

| Tvrzení | Zdroj / vydavatel | Třída / jistota |
| --- | --- | --- |
| Dedicated Worker má vlastní event loop; zprávy nepřenášejí DOM. Dlouho žijící omezený počet workerů šetří startup a paměť. hardwareConcurrency není doporučený počet workerů. | https://html.spec.whatwg.org/multipage/workers.html — WHATWG | mechanismus / střední, primární |
| Worker RAF má vlastní scheduling; dlouhá úloha blokuje stejný worker a hlavní RAF neposkytuje přesnou synchronizaci. | https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames a https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model — WHATWG | mechanismus / střední |
| OffscreenCanvas lze předat před vytvořením contextu. Podporuje webgl2/webgpu; nepředává hotovou Babylon scénu. | https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface — WHATWG | kompatibilita / střední |
| Jeden GPUDevice zatím nelze používat z více vláken; příklady sdílení GPUBuffer/GPUTexture v explaineru jsou budoucí návrh. | https://gpuweb.github.io/gpuweb/explainer/#multithreading — GPUWeb; https://www.w3.org/TR/webgpu/#devices — W3C | zásadní omezení / střední, jeden původ standardu |
| ArrayBuffer transfer odpojí původní buffer. SAB vyžaduje izolaci a vlastní konzistentní publikační protokol. | https://html.spec.whatwg.org/multipage/structured-data.html — WHATWG | mechanismus / střední |
| COOP/COEP ovlivňují cross-origin assety a popupy. Worker/OffscreenCanvas samy SAB nevyžadují. | https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-embedder-policies — WHATWG; https://web.dev/articles/coop-coep — Chrome | nasazení / vysoká, dva vydavatelé |
| Časové osy různých realms srovnávat přes timeOrigin, nikoli přímo performance.now. | https://www.w3.org/TR/hr-time-3/#examples — W3C | měření / střední |

Architektonický úsudek: pomocné workery jsou vhodné pro skutečně drahé čisté CPU joby; render worker pro oddělení UI; simulace přidává interpolaci a snapshot latency; SAB je až řešení změřené přenosové režie. Žádný z těchto zdrojů nedokazuje FPS přínos Strahova.

Otevřeno: skutečný adapter/device/features v Edge workeru, cena transportu a prezentované snímky. Chrome Performance reference https://developer.chrome.com/docs/devtools/performance/reference rozlišuje main/GPU aktivitu a dropped/partially presented frames; RAF počet nestačí.
