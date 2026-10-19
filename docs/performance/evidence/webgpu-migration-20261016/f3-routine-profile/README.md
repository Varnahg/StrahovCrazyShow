# Zbývající CPU rutiny po přijatém F3 — 19. 10. 2026

Produkční Edge sběr určil další dominantní CPU práci: `MaterialDefines.toString` stojí při prvním vstupu do auta **37,4 ms / 499 volání**, při další světelné změně **24,0 ms / 431 volání**. Nativní F3 metadata jsou aktivní; nejde o starý serializer ani odmítnuté memo. Toto je profil příčiny, nikoli další FPS optimalizace nebo přijetí migrace.

| Vybraný přechod | Main draw CPU | Příprava meshů | Bind/draw meshů | toString | PBR _prepareDefines | getBindGroups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| První vstup do auta + revize světel | 142,4 ms | 95,5 ms | 40,5 ms | 37,4 ms | 20,5 ms | 12,2 ms |
| Další revize světel | 93,3 ms | 56,3 ms | 33,4 ms | 24,0 ms | 10,4 ms | 10,1 ms |

Časy rutin jsou synchronní nested walltime celého Scene.render; zahrnují instrumentaci, GC a případné nativní/driver blokování. Inkluzivní časy se překrývají; uvedené rutiny nejsou nezávislé části main draw a nejsou GPU čas. `selfSelectedMs` odečítá pouze vybraných osm rutin. F3 a původní profil nemají kontrolovaný společný měřicí běh, nelze z nich odvodit kauzální procentní přínos.

## Identita a skutečné podmínky

- QA source `46dab140223f92cbf6df85fa01a164174fadcdcb8139dd9c939ffa1c2a3927bb`, 585 manifestovaných souborů včetně testů. Základ native-clean F3 `3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03`, runtime main `9edcc05132df1b3f9aa2c37c897fd11b29dad5fe`.
- MaterialDefines SHA `3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768`. Pouze čtecí dependencies F3. Přesná inverze dvou app změn Game/render-cost do aktuálního F3; pět nových helper/test souborů. Ostatní runtime zdroje jsou stejné. Wrapper používá Reflect.apply s původním receiverem; F3 WeakMap nemá guard identity toString.
- Edge, WebGPU compatibilityMode=true, NVIDIA GTX1060, driver 582.28, CSS 1528×650, interně 1175×500, Low77%, noční okamžik **1792447200000**, řízené počasí, jeden skutečný hráč Alex, nula simulovaných bus/passenger/car. Jediná herní scéna v inventáři prohlížečů.
- Skutečná session `88f808ed-6b7b-4d79-b3d0-36b73ad3254c`; raw sekvence je souvislá, 517 záznamů po návratu do menu. Veřejný benchmark a serverový buildSnapshotId odpovídají source. Odlišný bootstrap/reload log je zachovaný samostatně a nepočítá se jako další měření.
- Protokol: původní spawn, S1900, E odstraní interakci se značkou; UI potvrdí možnost nástupu. Benchmark → zavření panelu → E → W8000 → space2500, bez pozorování během 10 s. Následné UI `E · vystoupit` a raw vehicle-entry potvrzují skutečné auto. GPU před/po 71/72 °C, 860/949 MHz graphics; takty nejsou zamčené. Doba idle po ready není stejná jako v minulých pilotech.
- Instrumentovaný benchmark: **52,6 FPS, p95 24,6 ms, p99 33,2 ms, maximum174 ms, čtyři intervaly≥100 ms**. Tato čísla nejsou čisté A/B a neprokazují regresi běžného F3. Health start/end valid, všechny chybové čítače 0, žádné nové shader programy/moduly, dvě synchronní pipeline, browser warn/error `[]`.

## Ověření a lifecycle

32/32 cílených helper/Game/mesh testů PASS, full TypeScript a izolovaný Vite build PASS. Zdrojové bajty ověřeny před i po všech fázích, source ID vloženo při buildu. Max8 timer zachytil tři skutečné přechody; errors/depthSkipped/restoreConflicts jsou 0, finální routineCleanup errors=0/restoreConflicts=0. Návrat do menu a ukončení pouze vlastních PID podle startUTC/path/command; 4200/2595 po ukončení nenaslouchají. Vlastní karta zavřená, dočasné rozlišení obnoveno. Hraná4199 má před/po stejných17 souborů a shodně servírované HTML; starší hrané snapshoty ani jejich dependencies se neotevíraly k zápisu.

První pomocný start selhal na readiness kontrole Invoke-WebRequest v Windows PowerShellu; API/preview přitom byly přechodně živé a skript je při timeoutu sám uklidil. Logy/PID zachovány v run-startup-failed-01. Přidání UseBasicParsing opravilo kontrolu, následující start vrátil READY. První volání skriptu vyžadovalo procesní execution policy pro vlastní skript; trvalé systémové nastavení se neměnilo. Následné pozorování UI vypršelo kvůli nesprávně přesnému názvu tlačítka Svítilna; stejná karta byla po obnovení ovládání již ready, hra ani benchmark se kvůli tomu nerestartovaly. Startup tento sběr nehodnotí.

BMAD oneshot: původní scope review bez nálezů. Závěrečný raw audit potvrdil všech50 hashovaných artefaktů a seq0–516; našel dvě opravené archivační chyby: provozní PID receipts zůstaly v ignored cache a archiv obsahuje výslovně označenou provenance projekci bez processes; manifest nyní uvádí i encodedBytes. Raw GPU/session se neměnily. Celá sada/integrace se neopakovala pro nezměněný runtime po již přijaté F3 sadě; tento úkol mění pouze izolovanou diagnostickou kopii a evidenci.

## Rozhodnutí a další krok

Další zásah odvodit z prokázané ceny toString. Porovnat omezená immutable metadata pro sestavení řádků a per-call fragment buffer proti současnému F3, se stejným čtením/coercion/throw/pořadím a původním kanonickým fallbackem. Nevracet odmítnuté complete-value memo bez nových důkazů; samotný nízký createEffect čas (3,1/3,2 ms) neodůvodňuje další pipeline cache. Globální zásah do light invalidace má širší riziko vzhledu a lifecycle. Nejprve diferenciální CPU důkaz a měření, pak nový izolovaný produkční A/B; žádné slibované FPS z tohoto profilu. KEY-31/32, default, Medium, ≥3 skutečné relace a úplná přejímka zůstávají otevřené.

Všechny přijaté raw, zdrojové overlaye, protokoly, test/build logy, screenshoty a neúspěšný start jsou v [artifact-manifest.json](artifact-manifest.json); každá položka uvádí SHA a délku zakódovaných i původních bajtů. Základní nezměněné F3 zdroje a úplná přejímka úzkého F3 patche jsou v [předchozí evidenci](../serializer-schema-qa/native/README.md).
