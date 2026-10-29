# Přehrání uživatelských průchodů v testovacím rendereru

Dva scénáře kopírují doloženou trasu B6 ze 17. 10. 2026 a venkovní trasu s autem z 18. 10. [Původ a regenerace fixtures](fixtures/README.md). Celá funkce je pouze v tests; normální produkční build neobsahuje testový bootstrap.

## Spuštění

Po získání taskových rezervací (heavy-validation, gpu, workspace-build, porty4291/2568 a zapisované výstupy):

```powershell
pnpm exec tsx --test tests/recorded-walkthrough-recording.test.ts tests/recorded-walkthrough-replay.test.ts
node tests/replay/run.mjs
```

Runner vytvoří produkční testový build v .cache/recorded-walkthrough/dist, ověří neměnnost zdrojů včetně testů, spustí vlastní API2568 a preview4291. Používá skutečné původní modely z public. Předem spusť node scripts/check-lfs-assets.mjs. Ukončení Ctrl+C zavře pouze vlastní služby; zápisy reportů a API log zůstávají v .cache. Nejvýše po30min runner skončí sám.

Otevři vždy samostatnou kartu pro každý scénář, stiskni „Pusť mě dovnitř“, vyber postavu a potvrď vstup. Pouze tento testový build přesměruje normální Jantar formulář do režimu hosta; produkční nabídka se nemění. Přesný buildový guard odmítne změněnou či víceznačnou vstupní callback cestu.

- http://127.0.0.1:4291/?scenario=b6-20261017&renderBackend=webgpu
- http://127.0.0.1:4291/?scenario=outdoor-car-20261018&renderBackend=webgpu

Výchozí rychlost je1×. Parametr speed=10 zrychlí pořadovou regresi; takový běh není časovou reprodukcí ani benchmarkem. Žádný původní bod/událost se nepřeskočí ani po záseku, takže pomalý renderer může za plánem zaostávat. WebGL2 se ověří parametrem renderBackend=webgl2. Přepínač rendereru musí být uveden právě jednou; test odmítne chybějící volbu, fallback i záměnu WebGPU CM/NCM. Přepnutí zvolené backendové cesty se nevydává za fallback.

`node tests/replay/run.mjs --help` pouze vypíše použití; nespouští build ani server a nevytváří cache. API přebírá existující izolaci integračních testů: bez OpenAI/RAG/Linear/produkční konfigurace feedbacku, s vlastním spool adresářem a loopback HOST. Zděděný STATIC_DIR a VITE konfigurace se nepřebírají, testový build nečte soubory .env a jeho multiplayer URL míří pouze na vlastní preview proxy.

Panel ukazuje počty skutečně vykreslených vzorků, událostí, snímků a zóny. „complete“ znamená dokončení této renderové rekonstrukce bez zachycené render/asset chyby a s dokončenými GPU přípravami. Report obsahuje původní SHA/session/rozsah, hash testovaného zdroje, backend, GPU identifikaci dostupnou enginu, rozlišení a omezení. JSON se ukládá až po potvrzeném lokálním POST; panel má data-saved=true. Na selhání zůstává status failed. Skrytí karty během běhu zneplatní přehrání.

Negativní kontrola přidá stopAfterFirstSample=1: po prvním skutečném vzorku zastaví vlastní render loop a nezávislý hlídač musí uložit failed. Nejde o simulaci driverové chyby ani o přejímku recovery. Report uzavírá konkrétní běh; další chyby po jeho dokončení patří novému testu.

omitLightingOverride=1 je druhá negativní varianta: záměrně vynechá přenos UTC času. Kontrola skutečných vstupů oblohy a svítilny musí odmítnout rozdíl oproti scénáři. Kontroluje také efektivní kvalitu/scaling a vlastněný snapshot počasí; původní minutový refresh UI jej nemůže nahradit. Report obsahuje settingsCheckedFrames.

Complete i failed ukončí vlastní Game a obnoví testové wrappers ještě před uložením reportu. Uvolnění enginu se odloží za aktuální endFrame; report uchová health před úklidem a výsledek cleanup. Fixture bajty se načtou a SHA ověří při startu runneru, takže pozdější editace souboru nemění právě běžící test.

Complete navíc zastaví další snímky a ověří poslední endFrame/submit. WebGPU čeká na skutečné dokončení již odevzdané práce přes stejný device/queue kontrakt jako produkční startup, nejvýše5s. Pozdní chyba nebo timeout změní report na failed; health se před dispose znovu načte.

Před uložením každého reportu server znovu ověří aktuální hash zdrojů a veřejných assetů. Změněný zdroj, dirty/ignorovaný soubor v servírovaném `public` nebo nově commitnutý jiný public strom report odmítne; klient pak ukáže `failed` a `data-saved=false`. Úspěšný JSON obsahuje serverové `sourceRevalidated=true` a ověřený `publicGitTree`. Kontrola probíhá na hranici uložení, nikoli v každém snímku. Nenahrazuje immutable snapshot: během přehrávání se zdroje ani assety neupravují, včetně dočasné změny a jejího vrácení před závěrečnou kontrolou.

Před GPU startem ověř skutečnou viditelnost testovacího panelu. Skrytý či neaktivní hostitelský chat může způsobit přibližně 1Hz přípravné snímky a timeout ještě před trasou. Takový běh není přejímkou ani důkazem regrese produktu. Pouhé požádání o zobrazení nestačí, pokud aplikace otevření zařadí do fronty.

## Co test ověřuje

Přehrává pozorované polohy, uloženou kameru, svítilnu, výslednou efektivní kvalitu, čas osvětlení, počasí a stav vozidla v celé scéně s původním UI. Zachovává pořadí explicitních akcí. Zapnutí světla a kvality používá existující produkční controllery. Interakce s autem je marker; její pozorovaný výsledek se nastaví podle následujícího vzorku.

Při převodu do main 29.10.2026 má CAD svět nové názvy pater `b06:n01` až `b06:n05`; historický záznam používá `b6:0` až `b6:4`. Report uchovává `recordedZones`, nezávisle odvozuje `expectedZones` ze stejných zaznamenaných souřadnic a aktuálního `zoneAt`, uvádí `changedZoneSamples` a vyžaduje návštěvu všech těchto aktuálních zón. Původní fixture ani její souřadnice se kvůli změně geometrie nepřepisují. Na současném main se liší 83 z 584 popisků B6 vzorků; venkovní trasa se neliší.

Chybějící úplné vstupy nelze obnovit. Test nastavuje polohu přes Actor a kameru testovým wrapperem; neověřuje průchodnost, kolize, autoritu, recovery ani původní stisky kláves. Režim hosta má jednu postavu a záměrně nemění serverový multiplayer. Vzhled, animace a přesný yaw auta/avatara v logu chybí; yaw kamery je pouze testový odhad jejich orientace. Přesné pixely ani původní material/shader identity nejsou garantované.

Mezisnímky krátkých intervalů jsou označená interpolace, přechody vozidla/FP a mezery nad3s se nepřemosťují. Explicitní změna osvětlení používá první následující pozorovaný UTC okamžik. Pozorovaná automatická kvalita se vynucuje manuálně, takže se neověřuje adaptivní algoritmus. Rekonstrukce nesmí uzavřít KEY-39/31 nebo dokazovat historická FPS.

## Vlastnictví a podklady

KEY-49; specifikace je v _bmad-output/implementation-artifacts/recorded-walkthrough-20261020/spec.md. Změny bootstrapu existují jen v testovém Vite pluginu; nezasahují do client, server nebo shared. Ověření normálního produkčního buildu kontroluje nepřítomnost testového panelu/hooků.

Použité primární podklady: zdrojový Game.frame/advanceSimulation/updateCameraFollow a Actor.setPosition v přijatém main; [Vite JavaScript API](https://vite.dev/guide/api-javascript.html) a [HTML transform hook](https://vite.dev/guide/api-plugin.html#transformindexhtml), ověřeno20.10.2026. Původní hrané buildy zůstávají neměnné.
