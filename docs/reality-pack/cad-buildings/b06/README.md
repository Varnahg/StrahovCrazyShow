# Blok 6 podle CAD a fotogrammetrie

Stav 24. 10. 2026: editovatelný nativní model R4 je zapojený do pracovní hry spolu s B1. Souvislé CPU ověření dosáhlo všech 1 406 dveřních bodů. Produkční herní/GPU přejímka se dokončuje; tento záznam ji nenahrazuje.

Zdrojem modelu je `assets/blender/cad-buildings/b06.blend`; GLB a společná kolizní data jsou exportované z jeho skutečných meshů. Model obsahuje 113 částí, 65 kolizních částí, 195 796 konstrukčních trojúhelníků, 703 dveří, 319 oken, 37 schodišťových letů a 28 podest. Patra mají samostatné kolekce a části podle role/materiálu. Původní DXF, jejich obrazové kopie ani textové přílohy nejsou v Gitu nebo zabalené v modelu.

## Geometrie a její meze

Osm půdorysů P01–N07 poskytlo 392 room polygonů. Měřítko CAD/1000 potvrzuje dvacetimetrová grafická míra; společný počátek je `[35,8]`. Jednotlivá patra se neposouvají ani neškálují samostatně. Podrobné entity, výjimky a interpretace jsou v [přípravě](preparation.md) a `preparation-audit.json`.

Chybějící svislé kóty jsou výslovnou interpretací podle schodišťových hran a IPR2023: main úrovně −3/0/3/6/9/12/15 m, mezipatra −1,5/1,5/4,5/7,5/10,5/13,5 m, společná střecha 18 m. Nástavby dosahují 21,41 a 20,50 m. Vnitřní stupně mají stoupání 0,15 m, dvanáct skutečných vnějších hran 0,175 m. Nejde o geodetické zaměření současného stavu.

R4 zahrnuje zdrojově doložené koncové portiky, vstupní přístřešek, východní terasu a podzemní s201 pod zachovaným terénem. P01 stěny v přesném půdorysu terasy končí na jejím spodním líci, aby nevyčnívaly nad nástupní plochu. Šest prosklených východních dveří zůstává průchozích; přibližně 0,481 m rozdíl úrovní vyžaduje herní skok. Není maskovaný vyšším autostepem. Tloušťky krytů a nezaměřená výška podzemní s201 jsou označené odhady. Interiéry obsahují architekturu podle plánů, nikoli domyšlený nábytek.

## Fotogrammetrie

Rigidní umístění v herních metrech je translation `[6.702656726398903,0.6962777093118497,-55.04815187265829]`, yaw `-3.1233667855768164`, bez změny měřítka. Odvozené bezztrátové PNG z IPR Praha, léto 2023, jsou zabalené v Blenderu a GLB; původní foto soubory se nepřibalují. Attribution: datový podklad © IPR Praha, CC BY. [Společná metoda a licence](../photogrammetry.md).

Z 28 explicitních ploch bylo přijato 21 atlasů při 16 px/m. Zachovává se CAD geometrie, otvory, sklo a vnitřní materiály. Plochy s nedostatečným pokrytím mají původní PBR materiál. Pás přechodu 0,15 m leží pouze uvnitř platné masky. Textury obsahují skutečné historické osvětlení a stíny; nejsou čistým albedem. Rozmazání a lokální nesoulad historického půdorysu s fotogrammetrií zůstávají omezením. Východní nástavba má proti snímku rozdíl půdorysu přibližně 3,84 m; kvůli tomu se neposouvá celý CAD model a její nevyhovující střešní atlas se nepoužil.

Geometry digest před a po texturování je shodný `73a0f4ed02ae743d933dbf860d68bcc3304bbd91e0e30c91359483703da86f30`. Nativní audit ověřil orientované trojúhelníky, normály, UV, přiřazení PBR materiálů a přesné embedded PNG bajty. Všech 372 vzorků světlosti/opory nad schody prošlo; to samo neprokazuje cestu hráče.

## Dosavadní praktické ověření

- 44 přísných testů přípravy, 74/74 směrů schodišť a 1 406/1 406 izolovaných dveřních směrů skutečné Simulation prošlo. U dveří 1 399 chůzí, 7 skutečným skokem.
- Souvislý replay celé Simulation od hlavního vnějšího schodiště prošel všech 1 406 bodů včetně venkovního P01 návratu. Mřížka 0,60 m zachytila zdrojovou chodbu širokou 0,935485 m, kterou fáze původní mřížky 0,75 m minula. Stěny ani otvory se kvůli testu neposunuly.
- Izolovaný modelový walking planner hlásí chybějící venkovní podporu a neumí skok. Tyto neúspěchy zůstávají v důkazu; až full-world Actor ověřuje skutečný terén a návrat. Podrobnosti v [průchodech](../world-paths.md).
- Navigace a výška simulovaných cestujících sledují skutečné CAD nášlapy a dveře 12E1. Všech 14 transit regresí včetně souvislých přístupů a fyzikální výšky každého nášlapu prošlo.

| Výstup | SHA-256 |
| --- | --- |
| Blender | `749464558ebcab5ca582f875b4582093ac567496fffa410213e4a87c4f7f544e` |
| GLB | `54ef5d20819b841765af1801a5337f9a34ae83302b174b27de72541c093569b7` |
| Kolize/anotace | `a7f62e9a066c8bd5076f29fe8f061509c32dc0a14656a931b1841f2a7530940e` |

Žádný CPU/Blender výsledek není měření FPS nebo přejímka ovládání a kamery v celé produkční hře. Současný stav této přejímky a integrace patří do [ověření hry](../../../verification.md).
