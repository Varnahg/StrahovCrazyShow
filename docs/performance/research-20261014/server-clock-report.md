# KEY-18: pozorované přírůstky serverových hodin v offline reportu

Rozhodnutí před implementací: 14. 10. 2026. Jde o vydělený již popsaný požadavek KEY-2, nikoli o opravu herního výkonu. Pracovní kopie má historický HEAD `2c7aec9`; koordinátor do ní předal ověřený zdrojový/testový overlay současného main `af4d6ef`. Ostatní metadata, assety a starší evidence jsou read-only.

## Doložený řetězec

`shared/network-diagnostics.ts` drží `NetworkClockTiming` po dobu života místnosti. `record` přičítá `callbacks` a `droppedTotalMs`, zatímco `elapsedMs`/`cpuMs` jsou poslední callback a `elapsedMaxMs`/`cpuMaxMs` jsou maxima za celý život objektu. `server/index.ts` připojuje snapshot k vlastní autoritativní odpovědi. Queue má odlišný lifecycle: reset epochy neresetuje její kumulované čítače. Proto ji tento úkol nezahrnuje.

Existující `scripts/diagnostics-report.mjs` serverové časové čítače vůbec neagreguje. Primární herní archiv 07c má server snapshot v `frame-window.data.context.network.server.clock`; hitch může opakovat stejný context. Committed Game ukládá `lastAuthorityNetwork`, ale aktuální emitter je ještě pouze v jiném WIP. Tato offline změna nemění sběr dat a chybějící telemetrii musí přiznat. Širší KEY-2 nebude označen Done.

Archiv: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/playtest-repairs-validation/snapshots/wave3/.cache/game-diagnostics/07c227f8-d2f8-4011-a6f8-5d27ad0627a4.jsonl`, SHA256 `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`. Read-only průzkum našel 496 frame-window vzorků seq259–1796, contextAt74830.3–564182.8ms: callbacks86629→108024 (+21395), dropped3966.6667→4250ms (+283.3333ms). Největší vzorkované cpu15.3898ms/elapsed32.0614ms se liší od hlášených lifetime maxim1108.5657/1108.6527ms. Ve všech pozorovaných aktuálních `droppedMs` je nula. První vzorek je až po začátku hry; přírůstek není celá relace.

## Varianty a rozhodnutí

| Varianta | Náklad a dopad | Rozhodnutí |
| --- | --- | --- |
| Vydat poslední lifetime drop/max za relaci | Nejlevnější, ale započte minulost jiných hráčů/relací | Zamítnout |
| Sčítat aktuální droppedMs nebo hitch kopie | Levné, ztratí nezachycené callbacky a může duplikovat vzorek | Zamítnout |
| Poslední minus první bez hranic | Malý kód; chybně překlene restart/reconnect/konflikt | Zamítnout |
| Resetovat čítače serveru nebo přidat emitter/instance ID | Vyžaduje runtime/wire/Game integraci; zásah do dalších tasků a nové přejímky | Mimo rozsah |
| Konzervativní offline přírůstky v porovnatelných úsecích | Minimální scalar data + řazení seq; žádná změna hry/cache/GPU/lifecycle | Vybráno |

## Kontrakt a omezení

Číst pouze frame-window a pevný whitelist šesti clock hodnot. Nezávisle na pořadí souborů používat posloupnost seq. `contextAtMs` musí být konečný nezáporný a nejvýše o1ms předběhnout zaokrouhlené record.atMs. Shodné kopie contextu započítat jednou; rozporné kopie stejného context času vyloučit jako celou skupinu. Duplicitní seq napříč různými batchi jsou v původním reportu již nejednoznačné; pro nový souhrn danou seq nepoužít a nepřeklenout. Konfliktní obsah stejného batch ID nebo smíšená session zneplatní nový souhrn, místo volby prvního obsahu.

`callbacks` a `droppedTotalMs` jsou povinné. Čtyři současné/lifetime časové hodnoty jsou nezávisle volitelné: chybějící, nekonečné či záporné hodnoty se označí jako unavailable a nevyřadí jinak platný counter pár. Počet těchto nepozorovaných hodnot je ve výstupu. Výstup neodvozuje průměrné časy z historických mean hodnot.

První platná hodnota je baseline. Přírůstek vznikne až mezi různými callback stavy s monotónním časem contextu a nezáporným rozdílem obou čítačů. Stejný callback a drop je opakovaná autorita, nikoli další porovnatelný interval. Pokles čítače vytvoří nový baseline bez přičtení nové lifetime hodnoty. Stejný callback s odlišným drop je konflikt. Chybějící seq, explicitní recording-gap, známé hranice spojení/hry a neplatný či zastaralý vzorek přeruší kontinuitu. Context starší než hranice není novým vzorkem po hranici. Počet důvodů zůstává přesný, podrobnosti segmentů jsou omezené.

Review zpřesnil časové hranice: samotné zrušení baseline nestačí, protože nově doručený context může být pořízený před chybou. Missing/invalid vzorek a lifecycle/recording-gap používají čas jejich doručení jako konzervativní mez. U chybějících seq není čas ztracené události známý: mez je čas prvního zachovaného recordu za mezerou. U duplicitní seq použít maximum atMs všech jejích kopií a u konfliktního contextu maximum doručení všech kopií skupiny, nezávisle na file order. Tím lze ztratit některé jinak použitelné vzorky; úmyslně se nepřemosťuje neznámý úsek. Pouhé následné odmítnutí zastaralého contextu mez dál neposouvá, aby běžný zpožděný flush nevedl k trvalému odmítání všeho. Samostatné fixtures chrání tyto konkrétní nálezy.

JSON i text oddělí observed increments, maxima skutečně vzorkovaných callbacků a největší hlášená lifetime maxima. Bez platného páru jsou přírůstky `null`/unavailable; jeden snapshot stále dovoluje ukázat jeho časové hodnoty. Součet úseků je pozorované minimum pouze za předpokladu kontinuity čítačů uvnitř úseků, nikdy úplný runtime relace. Chybí server instance ID: nepozorovaný restart, který čítače vrátí nad předchozí hodnotu, nelze spolehlivě identifikovat. Začátek/konec, nezachycené callback maxima a nepozorované mezery zůstávají neznámé. Queue, resync events a clock callbacky se nesčítají dohromady.

## Bezpečnost a přejímka

Pevné scalar projekce, finite/safeInteger a kontrola přetečení, žádný eval/dynamický merge, síť, zápis do zdrojového logu ani kopie profilů/peer dat. Paměť navíc odpovídá počtu minimálních server snapshotů/hranových událostí, nikoli celých contextů. Původní parser a integrity evidence zůstanou zachované.

Před implementací přidat red fixtures pro původní chybějící výstup; potom targeted report testy, plain Node CLI a archivní přepočet se SHA before/after. Výsledek nevypovídá o FPS, obrazu nebo novém herním testu. Integrátor provede samostatný review a celkové ověření.

## Primární podklady

- Přesný lokální `shared/network-diagnostics.ts`, `server/index.ts`, `shared/input-timeline.ts`, `scripts/diagnostics-report.mjs` a původní07c JSONL výše; čteno14.10.2026.
- [Prometheus: counter vs gauge](https://prometheus.io/docs/concepts/metric_types/#counter), čteno14.10.2026: obecný význam kumulativních čítačů a restartů; není důkazem konkrétního incidentu hry.
- Node24 `node:readline`/`node:fs` jsou již existující read-only mechanismus CLI; nepřidává se nová závislost ani transport.

## Provedené cílené ověření

- První red běh `pnpm exec tsx --test tests/diagnostics-report.test.ts`:12 původních testů PASS,10 nových selhalo kvůli chybějícímu `serverClock`; evidence `.cache/server-clock-report-feature/red.log`. Po implementaci21/22 PASS; jediná očekávaná změna fixture souvisela s výslovným rozhodnutím koordinátora zachovat counter delty i bez volitelných timing polí. Očekávání upraveno na tento kontrakt, přidána samostatná regrese volitelných polí a missing/reconnect hranic.
- Cílený green:24/24 PASS, exit0, `.cache/server-clock-report-feature/green-2.log`. Pokrývá kopie batch/seq/context, shuffled soubory, konflikty, reset, neplatné čítače, zpožděný context, missing vzorek, mezery, lifecycle, overflow a200detailů. Původní testy parseru/FPS/incidents stále procházejí.
- Po zapracování review časových hranic a zpětné kompatibility formatteru: **29/29 PASS**, exit0, `.cache/server-clock-report-feature/green-final.log`. Uložený starší report bez `serverClock` se formátuje s unavailable fallback přes společnou továrnu, bez mutace původního reportu. Finální script SHA256 `3c402e4cfd1913733520ea18aa6f3c76b9c180c8bd88684706945757ed2390e4`; test `e1e8c131407b3c4c2412b96a9032c28518d9e6c373dc0ee5c48f94c9a8b4f8d6`.
- Plain Node CLI nad původním07c v textu i JSON: exit0. Před i po je SHA původního archivu `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`. Výsledek:479 různých contextů ze496frame-window záznamů (17kopií),475 změn callback stavu; přírůstek21395callbacks/+283.3333333333344ms. Current maxima32.0614/15.3898ms, lifetime maxima1108.6527/1108.5657ms. Žádný counter reset, konflikt, stalecontext, invalidsample ani seqgap.
- Stejná plain Node kontrola zopakována po poslední runtime změně (nejde o novou hru): `.cache/server-clock-report-feature/archive-report-final.{json,txt}`, oba exit0 a stejné číselné výsledky i before/after SHA archivu. Finální manifest v `acceptance-final.json` zahrnuje také testy a dokumenty.
- Refaktoring: scalar projekce a souhrn jsou privátní funkce v již existujícím CLI; pořadí/hranice/baseline řeší jeden průchod. Celé herní contexty se navíc nekopírují. Počet pomocných Map stále roste s retained logem; jde o omezené výstupní detaily, nikoli tvrzení konstantní paměti nebo obecné DoS odolnosti.
- Nová hra/browser/GPU/server nebyly spuštěny. Žádná instalace, změna produceru, queue ani hodnot běžícího serveru. Celkovou validaci, bezpečnostní review, samostatný commit/push a Linear dokončí root.
