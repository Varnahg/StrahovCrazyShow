# KEY-31: denní příprava nestačí, shader defines závisí na historii

18.10.2026. **Negativní produkční QA pilot a dokončený CPU proof, nikoli přijetí runtime opravy.** Navazuje na [V2](../hitches-v9/README.md). Hrané4193/4192/4188 zůstaly neměnné.

## V3 Day pilot

Snapshot `0e15522126720f08e892de60685df25f5d20c313c562c952151de7d94d9f964a` přidal day0 OFF/ON přes původní přípravu světel. Explicitní inventory cap21 pokrývá20pojmenovaných etap a overflow; default16 a ostatní limity beze změny. Cílené **108/108 PASS**, full TypeScript/produkční build PASS, sdílené dependency metadata nezměněné. Fullsuite/integration této QA varianty neprovedené. [Overlay](day-zero/overlay-record.json), [log](day-zero/targeted-01.log), [build](day-zero-v3-build.json), [composition](candidate-composition.json).

Fresh server, Edge native WebGPU compatibility, NVIDIA/pascal, medium/manual,1512×642 CSS i render,59.9Hz, jeden skutečný multiplayer klient/Alex. Normální GPU timing a lokální opt-in profil; během pilotu žádný souběžný build/test. Session `6cc88ac4-89de-4e11-bf8c-5068e3057334`, raw3104souvislých záznamů0–3103. Vstup seq12@1747.6 → ready649@44823.7: **43.0761s**, příprava25.4694s, poslední gate41.8ms. Day0OFF/ON1.9483+2.3992s; startup872modulů,52sync+501async,872validation completed, pending/failures0. Inventář bez overflow/limited/unknown. Startup je o4.0174s delší než jeden předchozí V2 pilot; není to statistické srovnání.

| Okno | Raw seq | Snímky / délka | FPS | Největší interval | Nové moduly / sync |
|---|---|---|---:|---:|---:|
| Day |1074–1145|264 /10.02s|26.4|3309.5ms|62 /45|
| První F ve spawnu |2096–2325|336 /10.01s|33.6|294.8ms|4 /2|

Day akce seq1075 je37.1ms po startu benchmarku. Seq1080 interval846.4ms/CPU835ms/main810.3ms,31novýchprogramů,404Effectchanges,0RTT; seq1090 mezera3309.5ms po předchozímCPU17.3ms. Inventory CPU167.1ms je v této práci již zahrnuté. **Panel nastavení zůstal otevřený v celém Day okně**, protože jeho zavření během záseku vypršelo. P99 46.7ms nezastupuje maximum3309.5ms. Dodatečnou přípravu nelze přijmout jako vyřešení tohoto záseku.

F seq2102 nastalo773.6ms po startu druhého okna; panel se zavřel seq2099 po722.1ms,51.5ms před F. Celé okno tedy není od počátku bez panelu. První interval105.9ms/CPU103.9ms bez nového programu; druhý121.4ms/CPU92ms se2programy a shadow target56.9ms. Maximum294.8ms následuje poCPU27.8ms. První F přepne car Effects437→původní270 a438→271; později vzniknou dva programy, zaznamenaný nový materiálový Effect468 patří listům. Jde o jiný scénář než B6 F ve V2, nelze jejich FPS porovnávat.

Health obou výsledků valid, renderer1/generation1, pending/errors0. Dispose seq3098 errors0, profil3099 inactive/tracked resources0/observerErrors0. [Obraz ON](day-zero-v3-pilot1-on.png) zachovává scénu/avatara/svítilnu při tomto pohledu, nikoli úplnou pixelovou přejímku.

Mezi ready a Day zůstalo13weather payloadů shodných; avatar poblíž původního spawnu, kameraY1.507→1.396. Auta0→1 již před Day, source3299→3330/active578→580 a před Day navíc2moduly/1sync. Materiálové counts222/280 a loader pending0 stejné. Audit zdroje vyvrátil hypotézu, že Day přepíná traffic čas: traffic používá Date.now()+server offset, nikoli lighting timeOverride. Přípravu světel nepřepisuje updatePreloadVisuals, protože preparingLighting ji chrání. Budoucí ambientLOD/pending material conversion zůstávají možné další coverage rozdíly, ne prokázaná příčina31programů.

## Reprodukce historie neaktivních slotů

[Actual-helper probe](history-proof/probe.ts), [report](history-proof/report.json.gz), [manifest](history-proof/manifest.json), [finální log](history-proof/probe-final.log). Pinned Babylon9.30, stejné objekty material/mesh/submesh, pass, cap4, receiveShadows, alpha/instance a texture metadata v celé sekvenci. Skutečné PBR/Standard readiness, Effect creation a80main draw captures; žádné falešné material/Effect ready.

`night2ON → day0OFF → day0ON → day1 OFF/ON → B6 OFF/ON → restore-night1OFF → runtimeDayOFF/ON`. Původní helper při deaktivaci slotu2 ponechá `LIGHT_FALLOFF_STANDARD2`, následující day0ON použije slot2 pro HEMI a příznak odstraní. Pozdější stejná aktivní DayOFF kombinace má jiné plné defines.

| Cesta | První / pozdější DayOFF Effect | Jediný rozdíl |
|---|---|---|
| PBR opaque |6 /26|LIGHT_FALLOFF_STANDARD2|
| Standard opaque |7 /27|LIGHT_FALLOFF_STANDARD2|
| PBR alpha-test regular instance |8 /28|LIGHT_FALLOFF_STANDARD2|
| Standard alpha-test regular instance |9 /29|LIGHT_FALLOFF_STANDARD2|

Izolovaný CPU counterfactual před původní readiness vyčistil pouze true falloff neaktivních slotů při light-dirty. Effects34/35/36/37 se pak znovu použily, plné defines jsou shodné. Všech40párových stage/material řádků zachovalo aktivní světelné flags, ordered light fingerprint, textury, alpha a instancing. Main pass je neměnný uvnitř každé scény; mezi samostatnými scénami má ID1 versus3. Wrapper je pouze test, ne shipping návrh. Dvě scény/enginy i všechny vlastní resources/observers/hooks uvolněné. Přímý Node/tsx PASS01:28:08.205–.599UTC, nezávislý audit bez blokujících nálezů.

Mechanismus je v pinned `Materials/materialHelper.functions.js:672–701` (inactive reset), proti aktivnímu resetu:870–884. `Engines/webgpuEngine.pure.js:1504–1523` zahrnuje plné defines do Effect cache key. CPU proof používá reprezentativní materiály, GLSL/NullEngine/dummy URL textury, POISSON místo požadovaného PCF a žádnéIBL. Není to přesná car fixture, WGSL/pipeline/image/performance důkaz ani úplná atribuce všech31produkčníchprogramů. Bounded GPU export nemá per-stage Effect/submesh/full-defines vazby;7unused-derived repeats z62modulů nelze vydávat za všechny varianty.

## Volba dalšího kandidáta

- Další pořadí/prewarm umí ustálit některé historie, přidává startup a nemění samotnou příčinu.
- MaterialPlugin má použitelné pořadí před Effect creation, ale zavádí identitu pluginu a další readiness/binding callbacks; pozdní připojení může resetovat draw cache/UBO.
- Aplikační hook musí řešit nové/streamované materiály, obnovení descriptorů, disposal a změny cap/disableLighting i bez scene light změny. StableLightState samotný takové cesty nepokrývá.
- **Vybrán malý vendor hunk:** v existujícím inactive-slot resetu vyčistit3falloff příznaky. Původní dirty guard/active count existuje; žádný další scan, cache nebo lifecycle stav. Aktivní sloty a globální PBR USEPHYSICAL/USEGLTF flags se nemění. Vlastní pluginy čtoucí neaktivní slot mimo LIGHT guard a cap-excluded flags jsou výslovná hranice, kterou nelze bez testu rozšířit.

Navazující `webgpu-inactive-light-defines-qa-20261018` používá vlastní fyzické kopie **core i loaders**, jednu class identity a přesné patch/lock hashes. Sdílené V5 dependency i nativní runtime nedotčené. Před přijetím: actual-helper regrese všech3falloff, disable/cap/reactivation/globalflags, starší core patch/shadow regrese, production GPU pilot, celý startup a následně plná ověření přijatého celku. Původní timeouty a úplná readiness zůstávají povinné.

[Archivní manifest](archive-manifest.json) ověřuje32převzatých souborů včetně rozbalení gzip. RawSHA `1d8d145ba9601a55db32ede06ce7efbd1c6761a651282d35af11f2554067580f`, CPU manifestSHA `20187e11565307e44ac679014510962d27c89b389abbe59302d6fb153666df73`. Diffy/logy zachované beze změny bajtů. KEY-31 i migrační cíl zůstávají otevřené.
