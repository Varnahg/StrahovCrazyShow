# B6: opravy po ruční prohlídce, 25. 10. 2026

Stav: pracovní kandidát, nikoli konečné přijetí. Původní hraný snapshot na2591 se nemění. PR26 zůstává draft; jeho dřívější CI neověřuje tuto revizi.

## Konstrukce a materiály

Parapet nyní vlastní přesný objem odečtený ze zdiva. Přepočet odhalil také překryv P01 mezipatra s N01 DA3 parapetem (0,0125m²) a malé slivery šikmých ostění po opětovném zaokrouhlení průsečíků na1mm. Závěrečné odečtení zachovává skutečné průsečíky již kvantovaných zdrojových hran; neposouvá plochy epsilon offsetem. Poslední východní fasáda má jednoho stavebního vlastníka napříč N05/N06. Každý vršek podlahové desky je úplně a disjunktně rozdělen podle místností; plovoucí1–3mm finish hranoly byly odstraněny.

Pokojové skříňky mají skutečné tenké panely, police, úchyty a sražené hrany. Fotografií informované původní autorské textury dýhy a linolea jsou zabalené v masteru/GLB, nikoli původní fotografie nebo CAD. Zachované IPR projekce střechy a vstupního krytu mají původní souřadnice a omezení pokrytí; východní střešní hlava s18,26% podloženým pokrytím zůstala na původním materiálu.

## Dveře a pohyb

475 pohyblivých křídel začíná zavřených;228 menších druhých pokojových křídel je pevných. E odesílá požadovaný stav s revizí. Autorita kontroluje identitu světa, skutečného hráče, dosah, dohlednost a prostor pohybu křídla, včetně zaparkovaného auta. Změna kolize nepřidává fyzikální tick. Klient obnovuje při predikci stav dveří ve správné části každého historického ticku a při chybějící historii žádá úplnou synchronizaci.

Nativní GLB obsahuje962 pohyblivých objektů/1400 materiálových primitiv. Renderer je spojuje do31 dávek podle podlaží a materiálu; zachovává UV, normály a přesnou nativní geometrii. Nevytváří objekt s vlastním draw callem pro každou kliku. Čtecí audit všech469 plných a6 prosklených křídel proti kolizním boxům našel nejvýše0,001889mm odchylku;228/228 pevných křídel má obě zavřené plochy v renderu i kolizi.

## Skutečné důkazy a otevřené nálezy

- Fresh recipe70/70 a konstrukční helper30/30 PASS. Nativní reopen/GLB/UV/material/collision audit PASS:1267 objektů,152 kolizních částí,392081 kolizních trojúhelníků. Stabilní double-precision výpočet objemu opravuje numerické rušení drobných klik daleko od počátku; záporný skutečný objem zůstává chybou.
- Integrovaná cílená sada112/112 PASS; následné door/obstacle integrační kontroly32/32 PASS. Samostatný shared core po doplnění vozidla24/24 PASS. Nejde o celou projektovou sadu.
- Ve zmraženém `source-r2-v1` (`af8c9ccb43558ca5def51734ad4c35177f2db1b72246ee9b2571fa1f4e735b31`) prošel veřejný SDK test na rezervovaném2568: běžná souvislá chůze315,94m od spawnu ke vstupu, otevření, průchod oběma směry, zavření a blokování; shodný stav druhého i později připojeného klienta, duplicitní požadavek bez druhého přepnutí, resync a hranice hosta. Exit0, uzavřeny všechny testovací relace a pomocný server. Test neobsahuje teleport. Záznam `.cache/b6-photo-refinement-20261024/revision2/sdk-doors-r2-v1-isolated.json`.
- Přímá izolovaná přejímka všech dveří **není zelená**:1406 směrových případů,942 geometrických průchodů,456 chráněných pevných křídel,6 blokovaných horních zadních průchodů a2 případy chybějícího nativního venkovního podkladu.474/948 pokusů o interakci z pevného přístupového bodu uspělo; druhá strana běžně potřebuje ustoupit z pohybu křídla. Podmíněný otevřený průchod není vydáván za úspěšnou interakci.

Šest zadních průchodů (`4D6C/4D81/4D8D/4DA1/4DAE/4DC3`) odhalilo rozdíl0,4813m mezi odhadem vnitřního N01 mezipatra1,5m a terasou1,0187223m. IPR horní plocha je doložená20 trojúhelníky (19,4167m², world Y1,716218 vážený průměr; rozsah1,677–1,748). Zvýšení terasy není podložené a žádné tři nové prahové schody nejsou doložené v CAD ani fotografii. Uživatel dostal faktickou otázku, zda je vstup v rovině. Samostatná kalibrace prvního východního mezipatra je kandidát, nikoli provedená nebo potvrzená změna. P01 `2552` má vnitřní stair-landing−1,5m; chybějící oporou je venkovní strana, kterou musí ověřit úplný herní terén.

Výchozí dvojice této revize před opravou zárubní: blend `130b307253c3e361e67a26a8c9850fa6ff5bf55ba62351ffa57fbfb595749fcc`, GLB `b1efc8db0b59a9769996f172e8befeffca79c3ceee42f71f7eeaeb1fbc5662bf`, collision JSON `18c19331fdfcd254752660bb7b34c411647945ac539b29b2fccc095abb0a52da`, definice dveří `f9a8c7ba1f8ef276f69ee90907206c453d931bdcc0f947635f3f1a86fddeca24`.

## Dokončená konstrukční revize zárubní

Ruční kontrola E v samostatné prohlídce prošla; při pohledu zvenku byl zároveň vidět podezřelý pruh nad hlavním vstupem. Nezávislá kontrola potvrdila, že nadpraží 12E1 zabírá stejnou výšku3,600–3,645m jako zdivo a překrývá se s ním z98,94 %. Přesná příprava nyní sjednocuje rámové objemy a odečítá je od všech dotčených stavebních pásem. Zárubeň má skutečnou kolizi, shodný render a svého vlastníka; nejde o epsilon posun. Příslušné páry mají společný vnější rám bez fiktivního středového sloupku. Zdrojové polohy všech703 dveřních záznamů i odhadované výšky zůstaly shodné. Fresh příprava78/78 PASS, překryv nadpraží po řezu7,17×10⁻¹⁶m².

Nový master po opětovném přenosu tří fotogrammetrických střešních/přístřeškových ploch: blend `da903433185fd59661337695641cd5ffa94bcbaeaa4fca5b9068bb19ae40bced`, GLB `3318a7b0418b7bf3d46e7abcdee05b7500076f6811b3b88be0868bef8bd39803`, kolizní JSON `e1391cc8b3647bc353abc22bc8ec06a276f859b10d1ba650ba17dd38a794ea1c`, recipe `14bfbffadd7a7d96729d9fb5205b54b8dbcccc87153b807621280a8550949275`. Audit před publikací PASS:1267 objektů,159 kolizních částí,548605 trojúhelníků. Foto přenos prokázal nezměněnou geometrii. Pole sourceBlend/sourceCollision v photo-alignment označují nezapečený kalibrační vstup této revize.

Oddělený B6-only snapshot `94fb29ca7346955dee9fd8caf6e6ea9fdb561c3d64b977fc320d5400423b636c`:317/317 souvisejících testů, produkční build i úplná izolovaná integrace PASS. První integrační pokus nestihl původní10s start; druhý bez vlastní souběžné GPU scény prošel beze změny limitu. Podmíněná celosvětová kontrola dveří má950/950 směrů,943 chůzí a7 skokem; všech456 směrů ochrany pevných křídel prošlo. Šest známých zadních výškových rozporů tím není vyřešeno.

Čerstvé opakování všech264 pokojových tras nad posledním modelem `e1391cc8…` z neměnného v6b znovu doložilo **261/264** skutečných interakčních průchodů. Tři neuzavřené důkazy navigace zůstávají ve WC N02:144a, N04:344a a N06:544a; všechny původní body jsou povinné, žádná kapsle nebyla zmenšena a žádný průchod nebyl přeskočen teleportem.36 sprchových cílů zůstává odděleně neověřených. Report `.cache/b6-photo-refinement-20261024/revision2/frame-r3/rooms-final-model.json`, SHA256 `e86300ede422ad24ffa08f5027ecd93b7da55dc8ace42ef95f880a21d83e6cdb`, status `partial`; tento výsledek se nevydává za celkové přijetí modelu.

Vizuální kontrola a celá projektová sada/integrace jsou další krok. Edge načetl CAD/fyziku, ale při kontrole přes rozšíření vypršela příprava světel; stejný klient ve viditelném IAB nastartoval. To není oprava timeoutu ani výkonový benchmark. Světlý obdélník oblohy byl ve skutečné hře reprodukován a izolován A/B/A přepnutím bloomu; jeho konkrétní grafický průchod je předmětem samostatné opravy počasí.
