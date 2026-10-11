# Severní kurt B6 a návaznost vstupu

Oprava z 11. října 2026 nahrazuje nerovný povrch severního kurtu OSM `293949920` lokální triangulovanou rekonstrukcí. Viditelná zem, `groundHeight`, Rapier collider a drapované povrchy používají stejný TIN. Krátké dlážděné napojení od západního chodníku dovádí hráče k existujícím severním schodům B6. Čistý červeno-zelený tenisový povrch je samostatný model; neobsahuje roztavené stromy, auta ani okolní domy ze skenu.

## Podklady a jejich přesnost

- Původní ČÚZK DMR má rozlišení 2 m; kontrolní export s krokem 1 m nepřidává měření. Audit obsahuje 633 bodů kurtu: výšky −0,078 až 1,304 m; 349 vnitřních bodů má 0,072 až 0,512 m. Hrb proto nebyl chybou indexů 4m herní mřížky. Viz `../court-source-audit/audit.json` a původní TIFF.
- Originální IPR model z léta 2023 poskytl 156 červených přibližně vodorovných trojúhelníků s plochou 263,428 m². SHA původních `.bin` a `.jpg` se před čtením ověřuje proti manifestu. Výšková rovina má koeficienty `y = −0.0017891758250912848*x − 0.002700514751417203*z − 0.1454013782387373`. Rozdíl od nezávislé robustní roviny vnitřního DMR je −3,82 až +6,99 cm. Všechny podpůrné trojúhelníky zůstaly ve fitu; jejich rezidua jsou −8,74 až +4,07 cm. Nejde o nové geodetické zaměření.
- [IPR ortofoto, snímkování 8. června 2024](https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer) ukazuje červený tenisový vnitřek a zelený doběh. Přesný exportní URL, georeference, SHA a 0,1 m/px jsou v `court-source-comparison.json`. Náhled je `court-ortho-2024.jpg`.
- Původní OSM údaj `sport=multi`, `surface=clay` pochází z 8. prosince 2014. Zůstává zachovaný jako mapový údaj; vizuální tenis vychází ze snímku 2024. Chemické složení a aktuální stav nátěru ze snímku určit nelze.
- Proporce tenisových čar vycházejí z [ITF Rules of Tennis 2026](https://www.itftennis.com/media/7221/2026-rules-of-tennis-english.pdf), přizpůsobené červenému obrysu na snímku. Neprohlašujeme je za zaměřené soutěžní rozměry. Výška oplocení, branky ani síť nebyly doloženy; nová povrchová náhrada je nevymýšlí.

© OpenStreetMap contributors · ODbL; datový podklad © IPR Praha · CC BY; © ČÚZK, upraveno · CC BY 4.0. Původní rastrové a fotogrammetrické podklady zůstávají oddělené a nezměněné; jejich osvětlení se nepeče do materiálu herního kurtu.

## Kanonická geometrie

`shared/data/north-court-terrain-patch.json` obsahuje 422 vrcholů, 796 trojúhelníků a 130 dotčených původních buněk. Hrany kurtu a odsazení 1, 2 a 3 m jsou explicitní lomové linie. Uvnitř kurtu platí zdrojově podložená rovina; 3m apron se vrací k původnímu upravenému DMR. Okraje patch a zem mimo něj zachovávají původní výšky. Největší korekce původního vrcholu je 1,37747 m. Vysoká zdrojová mez severozápadně od kurtu zůstává zachovaná.

`shared/data/terrain-grid.json` má nadále SHA256 `5f4b45cf22507bbafdba96c17e4fb19e5c5e5188b85b2e55ec666b03109a7e03`. `sourceGroundHeight` čte původní zdroj. `legacyGroundHeight` umožňuje porovnání s dřívější herní úpravou. Žádná základová výška budovy se nemění.

Úzké trojúhelníky TIN také odhalily chybu obecného ořezu: pevná tolerance v surovém vektorovém součinu nesprávně rozšiřovala malé trojúhelníky a neomezený průsečík extrapoloval mimo segment. Oprava používá toleranci úměrnou délce hrany a omezuje parametr průsečíku na skutečný segment. Součet červených a zelených ploch se nyní rovná ploše mapového obrysu s tolerancí 0,00001 m²; nezůstávají barevné koplanární přesahy.

## Dlážděné napojení B6

`shared/data/b6-entry-paving.json` tvoří 12,47163 m² nové dlažby. Napojuje se na skutečnou mapovanou cestu OSM `25920440` v bodě `[-11.233297669, -84.084512124]`, pokračuje přes `[-8.4, -83.7]` a `[-4.85, -82.2]` k prvnímu stupni `[-4.85, -81.4]`. Šířka je modelových 1,8 m, před schody je rozšířená podesta.

Toto je interpretace snímku a adaptace na existující modelový vstup B6 s přiznanou nejistotou 2 m. Silné stíny ortofota a rozdíl mezi nativním schematickým modelem a skutečným domem neumožňují tvrdit zaměřené hrany. Nevzniká přímý pás přes trávník po ose x=−4,85. Ze spojky se předem odečítají existující mapové povrchy a půdorysy domů; nepřekrývá tak dlažbu ani nevyplňuje interiér budovy. Původní `shared/data/streets.json` zůstává nezměněné.

`isStreetSurface(x,z,margin=0)` zachovává při nulovém okraji původní přesnou klasifikaci. Volitelný okraj vyhledává skutečné hrany včetně hran děr v předpočítaném 8m indexu, bez druhého opakovaného bodového testu polygonů. Tráva tak může používat 0,35m odstup pro celý svazek stébel; hluboké výřezy zůstávají volné.

## Samostatný model kurtu

Zdrojový plán je `assets/blender/north-court/source-plan.json`, editovatelný archiv `assets/blender/north-court/north-b6-293949920.blend` a samostatný export `public/models/courts/north-b6-293949920.glb`. Kořen patří pouze kurtu OSM `293949920`, není součástí počtu 121 budov. Rozměry mapového obrysu v lokálních osách jsou přibližně 17,416 × 36,395 m; samotný červený vnitřek je fotografický odhad 10,917 × 23,495 m.

Tři materiálové části obsahují celkem 1019 trojúhelníků: zelený doběh se skutečným otvorem, disjunktní červený vnitřek a před triangulací sloučené bílé čáry. Nové materiály jsou neprůhledné hrubé povrchy. Původní růžový landcover se potlačuje existující společnou cestou pouze při přítomnosti náhradního kurtu. Pět starších kurtů a jejich osm modelových průchodů zůstává zachovaných.

`model-audit.json` obsahuje konečné SHA. Audit čte skutečné accessory serializovaného GLB: 1019 trojúhelníků, žádné degenerované trojúhelníky ani přesné neprůhledné duplicity. Opětovné otevření `.blend` potvrzuje počet vrcholů. `north-court-model-preview.png` je skutečný CPU render modelu, nikoli výsledek měření celé hry na GPU.

## Ověření a zbývající omezení

- Cílené testy `terrain-patch`, `terrain`, `campus-exterior`, `streets` a `surface-transitions`: 28/28 PASS; `tsc --noEmit`: PASS.
- Více než 3000 skutečných Rapier raycastů souhlasí se samplerem v toleranci 0,05 mm. Barycentra drapovaných ploch souhlasí s kanonickým TIN v toleranci 0,001 mm.
- Celá `Simulation` prošla kurt i apron a zůstává v klidu bez vibrace nad 3 mm. Další test projde z mapové západní cesty přes novou dlažbu, všechny venkovní schody až k recepci a zpět. Teleportování je v testu zakázané; není potřeba skok ani vypnutí kolizí.
- Test všech půdorysů budov potvrzuje nulovou změnu `buildingBaseHeight`. `market-roof-sync-audit.json` porovnává skutečnou čerstvou geometrii střechy Market/R-ko budovy `7645350` s archivním plánem: 11+52 trojúhelníků, identické indexy a normály, odchylka vrcholů maximálně 2,22e−16 m. Tato oprava další archivaci budov nevyžaduje.
- Jde o lokální rekonstrukci z uvedených podkladů, nikoli dokonalou fotogrammetrii nebo aktuální zaměření. Finální průchod a vzhled v celé produkční hře ověřuje root ve skutečném prohlížeči. Node/NullEngine ověření a CPU modelový render nejsou důkaz FPS ani GPU výkonu.

## Opakování pipeline

Spouštět z kořene repozitáře; Blender nejvýše se dvěma CPU vlákny. Python potřebuje NumPy, Pillow a Shapely dostupné v `.cache/street-python`.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/semantic-court-ground-study.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/create-north-court-terrain-patch.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/create-b6-entry-paving.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/create-north-court-style.py
pnpm exec tsx scripts/export-north-court.ts
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-north-court-model.py
pnpm exec tsx scripts/audit-north-court-roof-sync.ts
pnpm exec tsx --test tests/terrain-patch.test.ts tests/terrain.test.ts tests/campus-exterior.test.ts tests/streets.test.ts tests/surface-transitions.test.ts
pnpm exec tsc --noEmit
```

Síťové opakování prvního kroku znovu načítá datovaný ortofoto export; jeho SHA je nutné srovnat s uloženým auditem. Generátory zapisují pouze odvozená data, model a audity, nikoli originální DMR, mapové JSON nebo IPR mesh.
