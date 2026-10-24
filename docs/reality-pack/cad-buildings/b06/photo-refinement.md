# B6: rekonstrukce podle plánů a fotografií — KEY-60

Navazující připomínky uživatele z 24. 10. 2026 se týkají B6: návaznosti oken na pokojové příčky, jednoho aktivního křídla pokojových dvojdveří, podlah, schodišť, pokojů, koupelen, zadního vstupu Čajovny/STOH a předního smrku. Fotografie s číslem 2 je pouze typologické srovnání. Originály CAD a fotografií zůstávají mimo Git; manifest šesti nezměněných příloh je v ignorované pracovní cache.

## Rozhodnutí a podklady

- CAD N02 F5A/F5B obsahuje 4,4m okenní sestavu přes dva pokoje. Původní výřez odstranil 100mm konec příčky 5EC/5ED/94C. Oprava dělí sestavu v místě skutečné příčky, zachovává rámovou rovinu a odlišuje tenkou příčku od silnějšího pilastru mezi dvojicemi. `normalOffset` označuje střed okolního ostění, nikoli posun skla.
- Pokojová dvojice má 0,625m křídla se zdrojovými úhly 26,565° a 90°. Podle výslovného upřesnění uživatele je menší křídlo pevné pouze u pokojových dveří na chodbě. Má skutečnou viditelnou kolizi v rovině ostění; prosklené vstupy zůstávají samostatně klasifikované.
- Plošná projekce IPR na fasády by přenesla zachycené stíny a zdvojené detaily. Zvolená varianta používá autorské metrické materiály podle fotografií, samostatně pro chodby, pokoje, koupelny, schody a fasády. Fotografie neurčují kalibrované albedo. Ověřená projekce IPR zůstává na střeše a vstupní stříšce; slabě pokrytá východní nástavba si ponechává původní materiál.
- Z 392 zdrojových místnostních polygonů se vybavuje 228 pokojů, 12 koupelen a 24 WC. Počty a polohy sanitárních prvků pocházejí z CAD symbolů. Rozměry nábytku, barevné podání a opakování zářivek jsou přiznané autorské interpretace fotografií. Neznámé místnosti se automaticky nemění na ložnice.
- [Klub Čajovna](https://klubcajovna.cz/) a [Klub STOH](https://stoh.su.cvut.cz/phprs/view.php?cisloclanku=2004100601) potvrzují společný suterénní vstup z východu mezi B6/B7. Souvislá IPR geometrie dokládá dvě klesající ramena s mezipodestou kolem world Y +0,32 m a patou kolem −1,0655 m. Počet 8 + 8 stoupání a šířka 1,50 m jsou rekonstrukční odhady. Zlomené čáry D85/D90 nejsou celý vnější okraj terasy.
- Sprchové příčky zachovávají půdorys a konkrétní zdrojové entity. Jen vnitřní T příčky končí ve fotograficky odhadnutých 2,05 m; obvodové stěny zůstávají celé. Rozdíl 0,481 m mezi modelem horních dveří a terasou není doložený skutečný práh. Nevkládají se proto tři vymyšlené schůdky; případný skok je ověření herního modelu, nikoli tvrzení o skutečné stavbě.
- Smrk používá stejné původní LOD modely. Fotografie a IPR koruna opravují polohu na x −10,5 / z −76,5 m s nejistotou ±2 m. Umístění se opravuje před původními filtry komunikací; filtry se neobcházejí.

## Implementace a ověření

Uzavřené konstrukční meshe si zachovávají společné kolizní souřadnice; materiály jsou přiřazené jednotlivým plochám. Podlahové vrstvy jsou průnikem místností se skutečnými deskami v příslušné výšce, bez zakrývání schodišťových otvorů. Vybavení se slučuje podle patra, role, materiálu a kolize. Nativní export porovnává orientované trojúhelníky, normály, UV, PBR vlastnosti a přesné embedded PNG.

První kandidát prošel nativním auditem a skutečný Actor prošel všech 264 místnostních tras včetně návratu. Tento výsledek nepokrývá vstup z venku ani 36 zvlášť evidovaných vnitřků sprch: jejich CAD otvory mají přibližně 0,50 m proti účinnému průměru postavy 0,54 m. Nová zadní schodiště, snížené příčky a finální publikovaný model vyžadují vlastní navazující přejímku.

Zkrácený postup podle požadavku uživatele: výzkum a volba, konkrétní implementace, cílené regrese, jedno čtecí review a společná praktická přejímka. Žádné další BMAD renderery. Původní hraný snapshot 841637d9 na portu 2590 se nemění. Kvůli omezenému místu nový snapshot sdílí pouze obsahově ověřené neměnné adresáře assetů; změněné zdroje, modely a testy se kopírují. Zamítnutý pokus o úklid starých pomocných buildů se neopakuje.

Finální native kandidát byl znovu ověřen po materiálové korekci fasádních hran: beze změny geometrie a kolizí; actual full-world950/950, stairs76/76 a room264/264 PASS. Aktuální snapshot je source-v4, SHA0ee299c2bc87e3d76c832783aa877c19ff8ff74de4e9bced8993e8be09d58100. Stále platí36 neověřených vnitřků sprch a čekající GPU přejímka. Podrobné limity a stav main jsou v docs/verification.md.
