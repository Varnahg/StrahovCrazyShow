# B6: vstup, viditelnost a opravy z konkrétních fotografických nálezů

11. 10. 2026. Tato změna navazuje na [schodiště podle B6 schématu a typologie B3](stair-photo-reconstruction.md) a na [skutečnou zdrojovou IPR studii](../facade-study/README.md). Nejde o tvrzení, že je dokončený přesný stavební pasport B6.

## Co bylo skutečně chybné

Všech třináct vnějších schodových/podestových boxů patřilo do renderovacího batche interiérového podlaží 0. Před nimi má postava nohy na venkovním terénu; při interpretované základně 1,8 m jí předchozí výpočet přiřazoval podlaží −1. Vnitřní `atStairs` oblast začínala až na z > −79,6, tedy přímo na schodech. Vnější vstup se proto objevil až během výstupu. Stejný cull schovával i vyšší podlahy, pokojové stěny a střechu, přestože fasáda B6 měla průhledné sklo.

Vnější konstrukce nyní mají samostatnou skupinu `exterior-entry`, source IDs a vlastní půdorysné bounds. Konzervativní vzdálenost k tomuto skutečnému obalu se vyhodnocuje nezávisle na podlaží. Neprůhledné konstrukce tvoří `opaque-envelope` a zůstávají přítomné, dokud je fasáda v detailním průhledném LOD. Podlažní a krátký vzdálenostní cull zůstal jen pro rekvizity a dveřní tabulky. Načtení GLB nebo připojení ke kořenu invaliduje visibility cache; nové instance se správně připojí i při root attachment před loadingem.

Druhý konkrétní browser nález ukázal z recepční podesty přímo postel/stůl přes chybějící boční stěnu. Nábytek nebyl dekorací recepce. Generátor při přeskočení servisního bay přeskočil také hraniční příčku přilehlého pokoje. Nové sdílené příčky stojí na z `−20−16×70/22 ≈ −70,9091` a `−20−3×70/22 ≈ −29,5455`, na všech šesti obytných modelových úrovních. Vnější průchozí trasa, dveře, inventář modelu i základna zůstaly.

Zdrojová studie dále prokázala koplanární dvojitou vnější konstrukční slupku. `createB6BoxFaceParts` nyní vynechává přesně dvě duplictní vnější face-triangles na konkrétních shell boxech; vnitřní plochy, tloušťka, ostění a fyzikální kolize se nemění. Severní spodní lobbyfront zůstává interiéru, protože ji fasádní renderer úmyslně nevyrábí. Stejný filtr používá hlavní controller, preload fallback a samostatný archiv B6. Není to dočasné skrývání celého modelu.

## Samostatný krytý vstup

`shared/b6-entry.ts` vytváří samostatně identifikované čisté části podle uživatelova severního B6 snímku a typologického detailu vstupu. Detail má viditelnou tabulku 5, proto není prohlašován za fotografii B6. Půdorys/dveřní směr zůstávají severní podle B6 schématu a panoramatu. Všechny nové rozměry jsou fotografická interpretace bez zaměření.

Balíček má světlé boční plinthy a hlubší ostění, plochou stříšku se stříbřitou fascií a hladkým světlým podhledem, zelenavé boční prosklení, tmavé rámy a otevřená prosklená dveřní křídla. Otevření je demonstrační stav; konkrétní historický úhel křídel není dokázaný. Dvě subtilní kulatá 18mm kovová madla kopírují současný stoupající schodový povrch. Jejich přesné mesh kolize se přidávají do jediné kanonické sady `B6_STAIR_MESHES`, kterou používá Simulation, renderer i fallback. Boxy vstupu jsou v `B6_REALITY_BOXES`; žádná překážka nepřetíná osu chůze.

Podhled je lokálně 2,56 m nad horní podestou, tedy při aktuální základně worldY 4,36 m. Nemůže udeřit stojící postavu na horní podestě. Neprůhledné materiály mají explicitní alpha 1 a opaque render mode; pouze skutečné boční/dveřní sklo používá alpha 0,28. Chodbové výplňové světlo používá `FALLOFF_STANDARD`; jeho intenzita je umělecký odhad, nikoli měřený světelný tok.

## Omezená doložená fasádní oprava

Západní severní část měla stejné velké pokojové otvory jako obytné křídlo, zatímco zdroj jasně ukazuje malé téměř čtvercové otvory. Čtyři stávající severní nativebay pozice na každé úrovni nyní používají interpretovanou rodinu 1,2×1,0 m s parapetem 1,1 m. Západní 7,1m čelo výstupku dostalo jeden široký schodišťový pás 4,4×1,2 m se třemi díly. **Tentýž rozměrový plán určuje fasádní geometrii i skutečné otvory a skleněné kolidery v obalu.** Rozměry a dosavadní centra jsou kalibrace modelu, nikoli stavební kóty.

Počet širokých zdrojových okenních skupin se nepřenáší na počet pokojů. Native `70/22` room pitch, modelová délka 70 m, půdorys i foundation 1,8 m jsou zachované. Přesné per-window centra a členění širokých skupin jsou konkrétní zbývající práce. Source/OSM/native georeference audit vyloučil chybu měřítka 1,56×; rozdíly nejsou řešeny svévolným otáčením celého bloku.

Dvě střešní nástavby používají source XY obaly a výšku vůči dominantní zdrojové střeše. Severní rise je přibližně 3,384 m, jižní 2,451 m. Jejich spodky se přesně posazují na **aktuální modelovou střechu localY 18,125**, nikoli na zdrojový absolutní datum. Source dominantní roof worldY 18,753 a současný native roof worldY 19,925 se liší asi 1,172 m. Adaptace je přiznaná; nevznikají plovoucí boxy a současná foundation se automaticky nemění.

## Praktické ověření a omezení

Renderer-state test jde po bodech x −4,85 / z −110→−90→−85→−82→dveře a zpět, low/medium/high, před i po skutečném dekódování všech 17 GLB assetů a po root attachment. Kontroluje enabled/scene membership/alpha všech šesti vstupních batchů, world-transform shodu, neprůhledný vyšší obal a střechu, skutečné volné okenní otvory i zákaz pohledu přes chybějící pokojovou stěnu. Doplňková KCC zkouška v celé Simulation jde z terénu −110 přes schody a recepci na podestu a zase zpět, bez skoku či teleportu. Ray testy skutečných renderovacích a fyzikálních dat kontrolují obě nové mezibayové příčky. Test zdrojového fasádního plánu ověřuje malá okna, široký pás i posazení obou rooftopů. Původní floor-face test dál zakazuje dlažbu na spodcích podest.

Samostatný celý physics průchod všech **222 modelových dveří**, obou jader a severního vchodu prošel **3/3** po těchto úpravách. TypeScript prošel. Počet **35 ilustračních ložnic na modelovou obytnou úroveň** zůstává odhadem, nikoli inventářem B6. Skutečné celé-game browser snímky a průchod ověřuje kořenový agent; testy NullEngine nejsou GPU/FPS důkaz.

Před vnějšími schody je navíc doložený rozdíl mezi native osou příchodu a mapovanou trasou. [Nové originální ortofoto IPR8.6.2024](../facade-study/b6-entry-ortho-2024.jpg), [georeference a dotazy na mapované cesty](../facade-study/b6-entry-path-audit.json) jsou připravené pro další přesné napojení. Přímá osa x −4,85 v z −85..−81 leží asi 5,6–7,0 m od nejbližší mapované osy; rovný chodník přes tuto trávu nebyl slepě vymyšlen. Část potřebného místa je v hlubokém stínu a vyžaduje spojení ortha s pozemními fotografiemi.
