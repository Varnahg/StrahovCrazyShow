# KEY-31: hranice čekání mezi CPU, RAF a dokončením GPU fronty

Průzkum17.10.2026, izolovaná QA4194/API2589 v Edge. Hraná4193 používá původní frozenC5 a nebyla přestavěna. Tato evidence není přijatou výkonovou opravou, srovnáním FPS ani finální migrační přejímkou. Všechny sondy mění pouze jednotlivé kopie v `.cache/webgpu-hitch-validation-20261017/`; produkční runtime se tím nemění.

## Co je doložené

Předchozí [evidence](../hitches-v1/README.md) rekonstruuje původní8s incident. Nové kopie zachycují dvě přesné hranice stejného existujícího opt-in profilu. Mezi burstem a následujícím dlouhým intervalem vzroste rawRAF i engine process pouze o1, zatímco téměř celý interval připadne na čekání před doručením RAF. Síťové JS callbacky přitom pokračují. Není to jeden souvislý8sJavaScript výpočet.

| Pokus | První F CPU / burst interval | Následující mezera | Δ dokončený processCPU | Δ queue-to-process |
|---|---:|---:|---:|---:|
| Cadence timingON |731,1 /732,1ms |3755,6ms |56,5ms |3699,1ms |
| Timestamp timingOFF |945,4 /948,4ms |3472,1ms |53,5ms |3418,6ms |
| Opravená fence, timingOFF |1586,0 /1587,9ms |8568,0ms |60,5ms |8507,4ms |

Vypnutí `enableGPUTimingMeasurements` po initAsync nezabránilo záseku. Feature timestamp-query zůstala dostupná, engine timing flag byl false. OFF není přijata jako oprava a jednotlivé neproložené běhy nedokazují rychlostní rozdíl.

Opravená fence sonda v posledním běhu požádala o `queue.onSubmittedWorkDone()` **po skutečném endFrame/submit** prvního F. Probe3: CPU297591,8→299177,8ms; queued299178,7ms; completed307903,9ms, tedy **8725,2ms completion latency**. Následující frame-gap je299179,7→307747,7ms,8568ms. Vlastní předchozí práce fronty se tedy hlásí dokončená přibližně až při návratu snímkování. Podporuje to souvislost prodlevy s cestou dokončení submitnuté WebGPU práce; není tím určena konkrétní pipeline, čistá délka GPU výpočtu ani chyba ovladače.

Stejná sonda zaznamenala probe1 po přechodu na den:843,2msCPU,3145ms completion a3046,5ms frame-gap. Probe2 při průchodu hranicí B6:810,8msCPU,3079,7ms completion a2851,4ms gap. V logu následoval návrat b6:0→outside; první F nastal na prahu se zónou **outside**, x≈−4,92573/z≈−77,12243. Není to důkaz stabilního interiérového F. Každý probe používá vlastní renderer/generation identity. Completion obsahuje starší práci ve stejné frontě i doručení Promise callbacku. Úspěšný probe neznamená splnění shaderové readiness.

## Co první fence pokus nezměřil

Snapshotb8b257…f79c měl nulové fence záznamy, přestože zopakoval3457,4ms pauzu. Původní QA guard použil `RenderHealth.valid`; tento příznak požaduje také nulový počet pending shader-validation. `createShaderModule→getCompilationInfo→track` ale pending zvyšuje synchronně a snižuje až v microtasku, takže guard přeskočil právě měřený shader burst. Nulový počet záznamů **není** důkaz rychlého dokončení fronty. Původní17testová sada i první read-only review tuto vazbu minuly.

Nová QA kopie používá pouze pro sondu podmínku `phase=ready && errorCount=0`, odpovídající možnosti měřit již submitnutou práci během pending validace. Produkční RenderHealth, markReady, timeouty a fault chování jsou byteově shodné. Doplněné testy se skutečným RenderHealth, CompilationProfile/getCompilationInfo a Game.frame přes pinned_processFrame odhalily původní chybu v RED a celkem22/22 prošlo v GREEN. ScopedTS3361/0; fullTS a Vite native-loader build novéQA rovněžPASS. Nezávislé následné review bez dalšího nálezu.

## Reprodukovatelnost a omezení

Plné identifikátory, rawSHA, source identity, konkrétní seq, counters a páry jsou v [runs.json](runs.json) a `*-summary.json`. Příslušné úplné JSONL jsou bezeztrátově gzipované. Přiložené diffy jsou jen QA rozdíly, nikoli změna produkce.

- Skutečný Edge/Windows, WebGPU compatibility, metadata GPU nvidia/pascal. F kontext: ručnímedium,1multiplayer avatar, Alex/preset0,1512×642 CSS i interní rozlišení, dennínáhled, řízené počasí. Přesné fyzické GPU označení prohlížeč neposkytl.
- Cadence a timingOFF měly mírně odlišnou polohu vB6 i zahřátí. Nový fence běh navíc obsahuje navigační odbočku: ovládací dávka přesáhla30s limit CUA, vstupA byl po novém připojení výslovně uvolněn a avatar skutečnými klávesami vrácen z x≈−146 kB6. Cílové F se provedlo až po návratu. Tento běh není kontrolovaný A/B důkaz rychlosti.
- VGPU okně neběžely vlastní TS/test/build úlohy. Hraná4193 měla předměřením0herních canvasů. Viditelnost/focus jsou doložené UI a logy, ne systémovým driver trace.
- Startup se vyhodnocuje k `game-ready`, nikoli k avatar-preview nebo světelné complete fázi. U ON činil nejčasnější uložený vstupní marker→game-ready52414,6ms, uOFF44732,1ms; nelze to připsat změně queries bez proložených kontrol.
- Raw RAF epoch se na fence zapisuje, ale není její invalidation guard. Cadence korelace proto používá pouze shodnou epochu. Zrušený observer/Promise či změna generace může chybět ve výsledcích; queued bez completed není automaticky nekonečná GPU fronta.
- Tyto QA kopie mají cílené testy/fullTS/build, **nikoli** nově provedenou plnou sadu či integraci. Starší native/C5 kompletní pipeline se nevydává za test novésondy.

## Další oprava

BMAD kandidát `webgpu-torch-receivers-20261017` řeší doložené zbytečné přepínání světelných variant vzdálených statických objektů za konečným STANDARD dosahovým limitem. Zachová ON/OFF, intenzity, skutečné lampy i shadow casters; unknown/frozen/deformation/instance/cap případy zatím ponechá původní. Finální membership synchronizace a explicitní dirty vstup do StableLightState musí proběhnout před skutečným draw. Přínos i vzhled zatím **neověřeny**; bez samostatného GPU výsledku kandidát není přijat.

Primární kontrakty: [GPUQueue.onSubmittedWorkDone](https://gpuweb.github.io/types/interfaces/GPUQueue.html#onsubmittedworkdone), [GPUDevice pipeline API](https://gpuweb.github.io/types/interfaces/GPUDevice.html#createrenderpipelineasync), připnutý Babylon9.30 endFrame/flushFramebuffer, Light.canAffectMesh, material helpers a ShadowDepthWrapper. Exact async prewarm zůstává větší varianta s nutností přesných instance/pass deskriptorů a generation/disposal guardů; trvale enabled/intensity0 mění light budget i práci stínů a nebylo zvoleno.
