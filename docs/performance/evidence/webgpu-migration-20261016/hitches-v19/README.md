# KEY-31: define-order QA a produkční B6 kontroly

18. 10. 2026. **Izolovaný kandidát prošel 1402/1402 testy, plným TypeScript/buildem a izolovanou integrací.** Produkční Edge piloty podporují dílčí snížení kompilací a prodlev při otočení z B6 a odchodu. **První F, nízké FPS uvnitř a zbývající exit prodleva nejsou vyřešené; zrychlení startupu není prokázané.** Nativní přenos má samostatný task, celá migrace zůstává otevřená.

## Přesná změna a ověření

Vstup plný V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`; V6 `fc6efd2bcf91bd2b1720b35f090d74656352486ea7f09a2199dc69d14c61d525`. V5 far-only není součástí tohoto kandidáta. Jediná library runtime delta je fyzicky izolovaný `Materials/materialDefines.js`, SHA `43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4`. Původní serializace čte hodnoty beze změny a předá hotový text ověřenému bounded literal canonicalizeru. Žádná nová cache, kamera, loading etapa nebo změna deadline/readiness.

QA manifest `37b2d5e1c31f62d4f4d0cdebaaf3063cd1ad8f3e64156ddf58a2a99563fbb228`; dependency manifest `3e17ecf7339436c13929edb3706955c1f33f1ee13f3401f14d433da273df7970`. Fyzických10860 core/loaders souborů, nlink1, jedna class identity, pouze tato runtime delta; ostatní vstupy zůstaly stejné. Starých9813B patchu je zachováno, nový patch SHA `21114f6048abdcba932a8640adf1a97b6281939d99ae6d53fbfe96ef76bf0503`; lock má šest odpovídajících hash náhrad.

Shodné finální testy/fixtures: původní serializer **15FAIL/3PASS**, upravená třída **18/18PASS**, skutečné ordering/reuse assertions. Related **103/103 bez skipu**, scoped TS **3170/0**, celý patch **7/7 exact roundtrip**. Dvě odstraněné historické path assertions nenahrazují core/loaders realpath ani skutečný GLB/instanceof/lifecycle důkaz. Tři car GLB jsou pouze identické testové kopie, bez regenerace. Zachované neúspěšné transfer runs vysvětlují JS replacement-token a cross-JSON undefined premisy; nejsou vydávané za runtime RED/GREEN.

Runtime i finální evidence/test review jsou bez blokujících nálezů. Root zopakoval celý dependency/source sweep při sestavení a ověřil po buildu i testech nezměněné vstupy. Plný build05:31:58–05:32:42 UTC, fulltest06:11:02–06:14:56, integrace06:15:03–06:15:27; explicitní logy/receipts jsou v archivu. Shared dependency metadata nezměněná.

Kontrakt je **současný ověřený projektový default processor/plugin matrix**, ne univerzální Babylon rozšíření. Order-sensitive custom hook zůstává skutečným negativním případem. Změna nemá WebGPU guard a ovlivní všechny konzumenty MaterialDefines v této kopii; při nativním přenosu bude potřebná i WebGL kontrola. Podrobná volba proti cache-key variantě a source audit aut: [root decision](define-order-v6-source-audit.md), [leaf decision](qa/decision.md), [CPU proof](../hitches-v18/README.md).

## Golden a první F, časově blízký pár

Vlastní Edge/4194, WebGPU compatibility, Nvidia/Pascal, medium/manual, CSS i render1512×642, jeden skutečný klient, shodné řízené počasí/cloud0,96, žádné profileEnvironment. Obyčejné frame/health/module counters zůstávají; resources0 z vypnutého lifecycle profileru nelze tvrdit. Hraná4193/C5 zůstala v menu s jedním preview canvasem. Žádný test/build během benchmarků.

| Metrika | V4 normal2 | V6 normal1 |
|---|---:|---:|
| Vstup→ready |41,3079s|39,3330s|
| Příprava15etap |23,4384s|21,2371s|
| Startup moduly/sync/async |796/52/458|760/52/447|
| Golden moduly/sync/max |0/0/51,1ms|0/0/66,3ms|
| První F moduly/sync/max |4/2/133,6ms|6/3/149,7ms|
| Golden FPS |46,2|45,1|
| První F FPS |37,8|38,0|

Vstupy05:35:38,057/05:39:01,038 UTC. Obě raw sekvence557/558 záznamů souvislé, health valid, dispose542 errors0. Shodné sceneView matrices a Golden instant15:42:00,518 UTC; bez hidden/blur. Golden akce31/33,6ms po startu, F830,7/810,5ms po startu a55,8/54,7ms po zavření panelu.

Obsah není totožný: ready cars1/0 a tree meshes258/254; Golden ambient bus/passenger/car0/0/0 proti0/2/1, F1/0/0 proti0/3/2. F active582/583, regular instances296/297. V6 extra program je v prvním F renderu; sousední sample skutečně kreslí far-avatar material, ale387material detailů chybí, takže není přesně přiřazen. Další dva programy v obou bězích doprovází leaf material a flashlight shadow map. Pozorovaných−1,9749s startupu nelze celých připsat opravě a FPS benefit z páru neplyne.

## Čerstvé B6 porovnání

V6 normal-b6-1 proti následné V4 normal-b6-3. Oba poslední kroky vpřed, avatar směrem dovnitř doložený screenshoty před otočením; Day12:00, stejné počasí/quality/rozlišení/yaw/pitch, svítilna před prvním F nepoužitá. V4(-4,929804;−76,943192) proti V6(-4,973061;−76,983376), rozdíl5,90cm. B6 active511/499, výběrová historie a NPC nejsou shodné.

| Metrika | V4 normal-b6-3 | V6 normal-b6-1 |
|---|---:|---:|
| Vstup→ready |40,1465s|40,3903s|
| Příprava |21,6359s|21,3658s|
| Startup moduly/sync/async |800/52/460|756/52/445|
| První F moduly/programy/sync |6/3/3|2/1/1|
| První F maximum |325,8ms|317,1ms|
| Outward moduly/programy/sync |28/14/22|2/1/1|
| Outward maximum |1661,7ms|105,6ms|
| Exit moduly/programy/sync |26/13/15|12/6/8|
| Exit maximum |2018,5ms|928,1ms|
| Steady ON FPS |24,3|23,4|

První F stále obsahuje velký CPU náklad: V4 CPU248,7/main217,4ms/3programy, pak325,8ms interval poCPU44,7ms; V6 CPU313,9/main280,3ms/1program. Draw preparation145,3/200,0ms je vnořený, nesčítat s main. Méně programů zde není důkaz kratší CPU práce.

Při outward V4 vytváří pozorované nové Effects429/430/431/435 pro venkovní materiály/bark/plaster, zatímco V6 přebírá existující61/78/74/63. To podporuje duplicitní varianty, ale bez plného WGSL inventáře neatribuuje všech14programů. Exit main214,0→162,8ms, CPU236,1→188,6ms; **entry-dark-metal v obou bězích přebírá již existující Effect** (V4 65→356, V6 65→344). Není konkrétním odstraněným novým programem tohoto páru. Následné dlouhé mezery mají předchozíCPU37/31,4ms a síťové callbacky, nejsou celou souvislou JS blokací ani doloženým driver execution časem.

V4 F začíná206,398s po ready, V6 280,381s; outward282,052/431,021s. V4 bez pasažérů, V6 přiF4/outward1. Startup používá různé skutečné ranní okamžiky a tree meshes256/254. Exit stejné W3,2s skončí z−82,157/−86,874; průměrné exit FPS nejsou přímé srovnání. Obě celé sekvence1671/2485 záznamů jsou souvislé, všechny health výsledky valid, dispose1652/2469 errors0.

**V4 normal-b6-2 je výslovně vyloučený z přímého porovnání.** Korekční krok S obrátil avatara i ruční světlo; má pouze OFF/F/steady okna, screenshot a raw zachované. Nezaměnit jeho712,6ms F za odpovídající referenci. Starší V4 normal-b6-1 z hitches-v16 je další historický pilot, nikoli totožný pár.

UI frameIntervals/maxima jsou úplnější než omezené raw frame-hitch detaily (nejvýše4/sekundu). V6 OFF134ms a outward105,6ms zůstaly ve frame-window971/2320, i když detailní summary hitches[] je prázdné. Prázdné pole neznamená nulové záseky. Pozdější samostatný beard program během idle před outward nepatří do jeho měřicího okna.

## Rozhodnutí

QA celek přijat jako podklad dílčí nativní opravy duplicitních defines. Samostatný native task přenese pouze patch/lock a regrese s komprimovaným baseline fixture; **nepřenáší Game15etapy a tím nepřebírá automaticky V6 B6 výsledky**. Root provede čistou native fullpipeline a relevantní WebGPU/WebGL smoke před samostatným commitem/main integrací. Měřené B6 zbytky, startup optimalizace, ≥3relace, další avatary/LOD/kvality/clear-weather a finální rendererové páry zůstávají otevřené. Žádný default renderer flip ani uzavření KEY-31.

[Archivní manifest](archive-manifest.json) ověřuje118 artefaktů. Own services jsou po všech oknech ukončené podle identity, karta about:blank; hrané4193/4192/4188 a cizí WIP nezměněné.
