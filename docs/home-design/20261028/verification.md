# Jantar: závěrečné ověření

Finální stránka běží na http://127.0.0.1:4280/ jako neměnný produkční build zdroje0d957a1ba0f53baeeef894b13791da857663d6fe. Uživatel výslovně potvrdil „na tomhle ale všechno funguje“ a požádal dokončit původní goal nové stránky. Diagnostická odbočka e819 byla celá vyřazená revertem b67ec21e6d3c319a7ebb89737857f431ca6333c4. Zdrojové/testové/build vstupy publikace jsou opět shodné s0d; přijetí přesného finálního head a merge zaznamenáváPR33. Níže zůstává původní datovaná historie včetně selhání, nejde o tvrzení o opravě rendereru.

## Finální výsledky původního goalu

- Source manifest6bfb508e6361023bbe3e1cccbfbdb6f89de0714908e8c3da4788ce780e3ebcba,9494souborů včetně testů. Dcachefinal-01 vznikla fyzickou kopií a úplnou shodou Cbefore/Cafter/Dhash; nehraná příprava f570/bdce88… byla před buildem revidovaná pouze pro hostový Docker testscript0d, původní manifest/script jsou vpreparation-history.
- Dependencies8782a45c1fa0247e7370453e5af9970a411391792c89c35a540285bddec71591,16288souborů,0symlink/junction/hardlinků. Fyzická kopie jen po shodě package/lock/workspace/patches. Následný skutečný bytecheck po SDK totožný; žádná instalace do rootu.
- ClientIDsha256-efca68de0348122b8183a0b2b7b1e68953bf3b45a77b9c8006856f5a150c90c6, bundleindex-qYbuOxJo.js, CSSindex-Bgz_x2sS.css, sourceID6bfb508e… a multiplayerURL=/.
-148/148cílených CPU testů, plný produkční TypeScript/Vite build a celá SDK integrace PASS; logs/results vDfinal-servecache. CI přesného0d: verify40736108285/job122984986593 SUCCESS,2598celkem/2597PASS/0FAIL/1SKIP, build19.44s a izolovaná integrace SUCCESS; oba secret checks SUCCESS.
- Standardní Docker03/source0d PASS/exit0: skutečný AI popup open/close/Escape/focus/draft/pending/citace s plně lokální fakeAI, profil→nativeeditor→nickname→join; HTTP/assets/cache/guest/diagnostics/two clients, chůze/auto/chat/consent/resume/weather SDK, SIGTERM a restart identity. Own projekt63464-1793208737045 a jeho namedvolume/network zrušené, kontrolní labeldotazy prázdné. Falešná AI se neprezentuje jako živá služba.
- Nová4280 vEdge ověřila skutečný úvod, CZ/EN se stejnou značkou, compactchat s pravdivou lokální dostupností, živýNiki editor, zachování jména/předlohy přiBack a cleanupcanvas0. Snímky final-01-edge-home/chat/profile-full vcachevalidation. Plnou funkčnost běžné adresy4280 navíc přímo potvrdil uživatel. Nový FPS/GPU výkonový benchmark se netvrdí.

Lokální4280 server31936/exec93732 čte výhradně fyzický Dsnapshot. STRAHOV_SOURCE_SNAPSHOT_ID=6bfb508e… a Git discovery ceiling zamezuje mylnému připsání Dparent checkoutu; první původní log bezmarkeru měl parentGitHead410 a nepoužívá se jako identita buildu. Při opravě pouze této startup metadata konfigurace byl předchozí vlastní prázdný server48456 ukončen po online0, byte vstupy se neměnily. AI/feedback jsou vtéto izolované kopii pravdivě neaktivní bez soukromých klíčů; nic placeného se neodesílalo.

Vynucené GL2 pokusy zaznamenaly také existující světelný timeout, včetně zdravé59.9Hz kadence. Jejich konkrétní blocker nebyl potvrzen a není součástí výsledné změny stránky. Source diagnostika byla uživatelem zastavená a revertovaná; žádný4282server či snapshot nevznikl. Původní logy zůstávají jako evidence, nikoli jako důvod označit timeout za opravený. Konečný uživatelský požadavek a potvrzení4280 určují rozsah homepage přijetí.

Historický mezistav před závěrečným uživatelským potvrzením: zdrojová implementace, UI scénáře a skutečný funkční start byly doložené v IAB i Edge. PR33 kombinuje Jantar s přijatým RAG main86e4dd603ca1b91e3eaa5f84573f9481be410a29. V tomto dřívějším bodě chyběl závěrečný review/integrační doklad. Studený Edge timeout se nepovažuje za opravený, skutečný Edge úspěch nastal při opakovaném standardním WebGL2 startu. FPS benchmark ani výkonová optimalizace se netvrdí.

## Zdrojové checkpointy

- ef220b2e891124d6ff726d03faa844b2d9042469: původní Jantar implementace; celé CI prošlo. Následná browser kontrola našla dvě UI chyby.
- bd8174d3ac0f12fae647ec250a8b88dd269e6da7: zpětná vazba používá home-quiet místo globální světlé secondary; App drží značku v title také po změně jazyka. Build03/TypeScript a53cílených regresí prošly. CI40690482141/job122823686998:2491PASS/1FAIL/1SKIP, solefailure tree-cluster-streaming.test.ts active2 místo0. Izolovaný případ1/1PASS neznamenal opravu příčiny.
- 62ba8c870082b1a3897d8f580d81dbd4005ca481: koordinovaný čistý merge bd8174d3 + přijatého main86e4dd60;77přijatých cest,0konfliktů, žádný import nepublikovaného RAG WIP. Klientské UI se tím nezměnilo.
- c38661f6: provider už nenabízí odstraněný sólo vstup;7/7provider testů a62/62kombinovaných kontraktů. Skutečný client/shared validátor a compact render nově ověřují SÚZ/SHerna citace.
- dc4ca272: předaný test-only tree fix čeká na skutečné původní loadDetail Promise a nepoužívá12otáček setImmediate; řízený delayed-near případ zachovává FAR do dokončení a ověřuje neprázdné detaily. RED1FAIL a GREEN10/10PASS. Runtime renderer se neměnil.
- 987bcd9242f747a6dd78c83a68b127a60ab90f19: doplnění typu čteného mock result po TS7006. Původní failed combined01 build je zachován. Celý následný root tsc exit0 a10/10tree testů. Root dependencies v tomto okamžiku již byly po incidentu popsaném níže; jejich historická byte identita se netvrdí.
- 25dff25b: canonical i18n publisher drží stejnou značku i při storage clear/remove/same-locale; odstraněn duplicitní App efekt. Skutečné storage callback regrese RED2FAIL→GREEN10/10.
- f57076ca: Docker browser driver používá Pusť mě dovnitř→skutečný AvatarEditor→nickname→Vstoupit do hry. Nový popup scénář ověřuje close/reopen/Escape/focus/draft/pending/citation s plně zachyceným lokálním AI fixture, bez provider volání. Scoped tsc,49/49UI a3/3fixture kontrakty PASS; nezávislý source follow-up bez dalších konkrétních nálezů. Skutečný Docker E2E je při tomto zápisu ještě pending.

## Snapshoty a závislosti

| Kandidát | Source manifest | Stav |
| --- | --- | --- |
| candidate-02/build-03, původní4276 | 8577da066a4d66b985a4a10a273f6a75ec8e34d7af91ecdf820ad40493ce3afe,9477souborů včetně testů | Historická UI evidence, server retired po dependency incidentu |
| combined-01 | 24d4d82047ca8e9d12af33bfd253a3b0e4480b71a10beb83a687300334dab8e5,9494souborů | Fyzická frozen instalace hotová,138/138CPUtestů; build selhal před Vite na TS7006 |
| combined-02 | 64e0678cd15a80d985e437f5e4ea2f7662dc3ca99320d1b708008285529e1d8b,9494souborů | Současný987bcd92 runtime, vlastní fyzické dependencies,138/138CPUtestů, full build a opakovaná lokální SDK integrace PASS; IAB i Edge funkčně ready |

Kombinované snapshoty jsou v `.cache/jantar-home-20261028-combined-serve/snapshots/`. Upravený kopírovací helper vychází z aktuálního scripts/performance-snapshot.mjs; mění jen vlastněný výstupní prefix a odstraňuje vytvoření node_modules junction. Zachovává shodu všech zdrojových/asset/testových SHA před/po kopírování a ve frozen kopii. Nevytváří hardlinky ani reference reuse pro herní assety.

PNPM11.25.0 je samostatný helper v cache setup; instalace používá frozen lock, hoisted, vypnutý global virtual store a package-import-method=copy. První offline pokus combined01 selhal na chybějících vlastních registry metadata, log se zachoval; prefer-offline opakování dokončilo167cache balíků/0download,2m39.4s. Combined02 následně prošlo plně offline se167cache balíky/0download,2m29.9s. Root instalace se při těchto krocích nepoužívá. Úplný dependency-manifest.json má ID8782a45c1fa0247e7370453e5af9970a411391792c89c35a540285bddec71591:16288souborů,0symbolických/junction odkazů a0hardlinků. Kontrolní přepočet po integraci se shodoval. Node při finálním lokálním běhu24.22.1; React19.3.0/Babylon9.30.0/pg8.23.1.

Ověřený build987bcd92 na4278 má clientID sha256-85b30fe670d87ac343adbb7339512ac0ca148c5f3b19506d3ea5d527b346d0fc, index-DP_tatPN.js a VITE_MULTIPLAYER_URL=/. VITE_SOURCE_SNAPSHOT_ID odpovídá64e0678…. Zdrojové package/lock SHA jsou9e7cac59d8dcd9072fea838c7c5845b0bfe5d60ce74eb09dd262a064f4b0b38a /72c35c176eb7ad4d7f1890c549d43ce44879cf49ecd3bc03ec8851b1c9be82d1. Nový patchovaný zdroj f57076ca tuto neměnnou verzi nepřepisuje; dostane vlastní fyzický snapshot a runtime4280 s novým dokladem.

CI přesného987bcd9242f747a6dd78c83a68b127a60ab90f19: verify40705561507/job122876594720 SUCCESS,2596PASS/0FAIL/1SKIP, build a celá SDK integrace SUCCESS. Source-secret-hygiene SUCCESS. Zachovaný bounded tail má logTruncated:true; nevydává se za úplný joblog. Lokální první SDK běh skončil na10s readiness čekání během souběžné inventury dependencies, bez výsledkové chyby SDK. Po dokončení inventury stejný nezměněný příkaz prošel celý/exit0; přesnou příčinu prvního pomalého startu tento jeden opakovaný běh neprokazuje.

## Provedené funkční kontroly

### Navazující review checkpoint f57076ca a Docker prostředí

Přesný f57076ca7c1b9ddb9fa3bcec4c8f3dc0501dc3eb má verify40726415131/job122950794618 SUCCESS:2598celkem,2597PASS/0FAIL/1SKIP,411211.7ms; produkční build45.85s a celý izolovaný multiplayer/feedback SDK scénář SUCCESS. Source-secret-hygiene122950794464 i122950760197 SUCCESS. Lokální výpis ci-f57076ca-extract.log je záměrně jen vybraný souhrn, nikoli úplný job log.

První standardní Docker harness4281 (unique projekt strahov-docker-test-41808-1793204998250) prošel runtimeasset preflight8064souborů a celým TypeScript/Vite buildem, ale export/unpack~5GBherních dat vyčerpal C: z21.5GB na0. Následoval20min up timeout a bounded logs/down timeout; skutečný browser/SDK/lifecycle segment tohoto běhu nezačal a celý běh je FAIL/exit1. Log f57076ca-docker-01.log zůstává zachovaný. Pokus finálního freeze ani nezačal: otevření nového logu selhalo ENOSPC; žádný final-01 ani4280proces nevznikl.

Obnova úložiště odstranila výhradně vlastní nepoužívané duplicity z failedcombined01: první183087208BGLB a8580dalších souborů/8933858165B vpublic/assets. Před odstraněním byly skutečné bajtové SHA každého souboru porovnány s oběma manifesty i fyzickou combined02kopií. Zdrojové kódy, všechny testy, původní source/dependency manifesty, failed build i logy zůstaly. Failedcombined01 je odteď archiv zdrojů/evidence s manifestovou referencí na zachované assety, nikoli úplná samostatná hratelná kopie; touto změnou se jeho starý manifest nevydává za novou physicalsnapshot validaci. Seznam všech dvojic/hashů a dokončení jsou ve space-recovery-*.json. Automatická kontrola odmítla hromadný recursiveRemove; úspěšný bezpečnější postup odstraňoval jednotlivé ověřené běžné soubory se striktní kontrolou cesty, bez symlinků/junctionů. Běžící4278/combined02 ani dříve hraná retired4276 se nepozměnily.

Po obnově C14.29GB zůstal Docker daemon nedostupný. Uživatel zde výslovně schválil restart Docker Desktop. Oficiální restart120s selhal na stop deadline; další start odhalil WSL data device busy. Následoval oficiální force stop a cílené ukončení pouze distribuce docker-desktop (ostatní WSL se neukončovalo); operace skončila0. Před opětovným startem C19.67GB/D25.69GB. Žádný globální prune, smazání Docker dat, upload diagnostiky či změna cizích projektů. Nový finální fyzický snapshot se koordinuje naD cache pod odpovídajícím claimem, aby source+deps+dist měly dostatečnou rezervu. Docker E2E zůstává do skutečného opakovaného výsledku pending.

| Scénář | Skutečný výsledek |
| --- | --- |
| První render úvodu | Jeden multiplayer CTA, počet odděleně pod ním, AI launcher; editor/canvas0. Mapové SVG bez názvů/fokusu/handlerů. CZ i EN. |
| Úvod → profil → Back | Skutečný AvatarEditor dosáhl ready, jméno/preset se mění v App; Back odmountoval canvas na0 a vrátil fokus CTA. Opětovné otevření zachovalo jméno i Niki. |
| Prázdná přezdívka | Potvrzení pouze bílých znaků ukázalo Doplň přezdívku a fokusovalo původní input; nevstoupilo do hry. |
| Skutečné selhání joinu | Vlastní server byl po ověření PID/parent ukončen; připojení zobrazilo skutečný Failed to fetch. Profile screen, jméno Jantar QA, presetNiki a canvas1 zůstaly zachované. |
| Potvrzení profilu | Skutečný multiplayer bootstrap a místnost přijaly vybrané jméno/postavu; finální4278 dosáhla skutečného ready v IAB a opakovaném Edge WebGL2 startu. |
| Presence | Validní0 se liší od loading/unavailable pomlčky. Původní bounded/abort/hidden-page testy zůstaly a prošly. Žádný vymyšlený počet. |
| Chat pending/close/reopen | Řízená fixture skutečných komponent a createCrazyTypkaClient:1chat request,0mazání při zavření, odpověď dokončená na pozadí zůstala i s rozepsanou další otázkou. Fokus se vrátil launcheru a po otevření composeru. |
| Chat → původní herní view | Tatáž historie/draft ve výchozím CrazyTypkaChat, bez nového requestu. Citace šla rozbalit. Explicitní reset teprve potom zvýšil deletion na1 a vymazal místní obsah. Fixture jasně označena, žádný OpenAI ani3D. |
| Dialogy a klávesnice | Controls/About skutečně :modal/open, autofocus close, Escape vrací původní fokus. F8 otevřelo skutečný feedback dialog; nic se neodeslalo. |
| Mobil/locale | Edge390×844 profil bez horizontálního přetečení;390×650 AI popup v hranicích viewportu, textarea/akce dostupné. Jazyk CZ/EN přepnul text a title zůstal Strahov Crazy Show; override byl resetován. |
| Motion | Zdrojové i kompilované CSS obsahují reduced-motion vypnutí animace a dekorativní mapa nemá ovládání. OS media preference se nepřepínala; dynamická emulace reduce se netvrdí. |

Původní default AI markup byl v16CS/EN/stavových srovnáních byte-identický s baseline; store/hook/transport prefix se neměnil. Nová kombinace projde novým shared validátorem pro SÚZ/SHerna hosty, proto se nestřídá nový backend pod starým bundlem. Živé AI generování nebylo v této práci placeno. Historická samostatná instance neměla AI/feedback credentials a UI pravdivě hlásilo nedostupnost.

Snímky a řízené důkazy v `.cache/jantar-home-20261028-validation/`: home-desktop.jpg, mobile-chat.jpg, fixture-chat.jpg, fixture-view-transition.txt, failed-join.json, startup-timeout.jpg. Uvedené UI výsledky jsou historická konkrétní pozorování, ne automatická přejímka nového celku.

## Renderový startup: původní selhání

Zdrojově odvozené logy jsou v původním candidate02 `.cache/game-diagnostics/`. Oba historické pokusy timeoutovaly:

- WebGL2 `0487e330…`: active30006.9ms, paused0,34ticks, největší RAF mezera2196.2ms, pouze current-off a restarty meshes/weather. Skutečný renderer-ready uvádí ANGLE/NVIDIA GTX1060/D3D11.
- Automatický WebGPU `d020b88a…`: první low pass active30042.8ms, paused13164.5ms, elapsed43207.3ms. Runtime vendor nvidia/renderer pascal neurčuje sám přesný model.
- Oba pre-game presentation-rate vzorky měly přibližně sekundovou kadenci a reliable:false. V daném okně nebyla doložena dlouhá souvislá CPU práce; GPU hardware timing se neměřil. Shader/pipeline počty WebGPU byly vykázané jako dokončené, bez zaznamenaných pending/failures. To neprokazuje každý readiness gate.

Game ukládá lighting-preparation před odmítnutím výsledku; zobrazených64s loaderu není64s deadline. WebGPU má30s aktivně na pass/90s celkem, WebGL2 jeden30s pass. Hidden období se odečítají; řídké callbacky u visible-but-occluded/throttled karty jsou dosud hypotéza. Finální submitted-frame gate se ještě nespustil. Budget, strict readiness ani shader/render kód se neobcházely a neměnily. Nízká kvalita není zkratkou WebGPU startupu, který připravuje všechny tři kvality.

Po nativním neadresném Windows getApp bezpečnostní kontrola ukončila Computer Use, protože nedokázala určit aktuální browser URL. Daný turn skončil; pozdější práce používá jen adresně ověřená browser API. Žádný jiný ovládací mechanismus ani bezpečnostní bypass se nepoužil.

## Incident závislostí a procesy

Delegovaný tree test použil pnpm exec, jehož automatická synchronizace změnila root node_modules (+15cache balíků). Byl to cíl dependency junction starého candidate02. Předchozí úplný node_modules byte manifest neexistuje: historická neměnnost dependencies proto není potvrzená. Původní package/lock ve snapshotu a source/asset/build bajty zůstaly zachované. Žádné automatické restore/mazání/reinstall starých dependencies se neprovedly.

Po inventáři bez loopback karty/Blenderu a anonymním GET presence online0 byl vlastní server4276/PID38860 ověřen podle příkazu i parent build03 a retired. Receipt je `.cache/jantar-home-20261028-serve/dependency-incident.json`; portový claim se uvolnil. Chráněná4182 nebyla touto prací upravována ani zastavována. Nový4278 je samostatně rezervovaný a před startem vyžaduje hotový build/identity.

Lokální první redundantní fullsuite z ef220 byl před zdrojovou opravou řízeně ukončen (exit-1); není PASS. Root local SDK integrace před RAG syncem prošla celá/exit0. Nový celek vyžaduje vlastní stabilní CI/build/integraci. Cílené138/138CPU testy v obou fyzických kombinovaných instalacích prošly bez skipu; samy nepokrývají GPU.

## Výslovně otevřené hranice

Uživatel povolil doplňkový skutečný IAB funkční proof nové4278. Souhlas byl ověřen přímo v lidské odpovědi01a182e1-a8c5-75d1-9bea-3d0381d4b621 v modelovém chatu a je v tasku validation. IAB default WebGPU skutečně dosáhlo boot/physics/car/CAD/light/render-health ready, network connected a error0; CSS714×668, interně357×334. Snímek combined-02-iab-ready.jpg/json. Živý AI panel se otevřel a pravdivě hlásil chybějící runtime konfiguraci, nic se neodeslalo. Potom uživatelská akce Opustit demo vrátila IAB na home/canvas0.

Po lidské odpovědi Karta je v popředí se ověřovala konkrétní Edge karta2070825312. První nový explicitní WebGL2 pokus sice měl zdravou pre-game kadenci59.9Hz/focused/visible, ale vyčerpal30s aktivní přípravu po7stages; není to původní historický1Hz případ. Renderer uvedl ANGLE/NVIDIA GTX1060/D3D11. Tyto rozdílné backendy, adaptery a rozlišení nejsou izolované A/B.

Stejný standardní WebGL2 retry s vestavěným loopback profileEnvironment=1 následně skutečně dosáhl boot/light/render-health ready, network connected, physics/car/CAD ready a error0; žádný loader. Screenshot+DOM proof combined-02-edge-ready.jpg/json, CSS i interně1528×650. GL2 profiler neinstaluje WebGPU hooks a neobchází readiness ani deadline; neaktivní/null profiler čítače nejsou naměřená nula. Současná URL http://127.0.0.1:4278/?renderBackend=webgl2&profileEnvironment=1.

Skutečné klávesové W600ms změnilo marker vlastní virtuální polohy z(110,12.0000) na(110.0107,9.3200). V testovaném natočení A350ms snížiloX110.0112→108.2557, D350ms zvýšiloX→109.9472. Jsou to funkční vstupní/obrazové důkazy, ne výkonový benchmark a ne tvrzení o všech úhlech kamery. Doklady combined-02-edge-movement.json a combined-02-edge-lateral.json. Po uložení důkazů byly obě kontrolované karty standardně vráceny na úvod/canvas0; historická ready/movement evidence987 zůstává zachována.

Studený Edge timeout a příčina rozdílu cold/warm zůstávají známým omezením beze změny rendereru. Neprohlašuje se FPS/p95/p99 ani výkonová přejímka. Project-acceptance ani merge PR33 zatím nevydané; hlavní stav KEY-66 zůstává In Progress do review a integrace.
