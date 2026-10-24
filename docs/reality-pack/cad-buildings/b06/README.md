# Blok 6 podle CAD a fotografií

Foto revize KEY-60 z 24. 10. 2026 je zapojená do neměnného testovacího buildu na `http://127.0.0.1:2591/`. Nativní a prostorová přejímka prošla; aktuální GPU přejímka a integrace do main ještě nejsou dokončené. Předchozí přijatou verzi obsahuje PR25 a původní snapshot na2590.

Editovatelný zdroj je `assets/blender/cad-buildings/b06.blend`. GLB a společné kolize se exportují ze skutečných nativních meshů: 311 objektů, 138 kolizních částí, 279004 kolizních trojúhelníků, 427 okenních sestav, 703 dveřních záznamů a39 schodišťových ramen. U228 pokojových dvojdveří je podle uživatele jedno křídlo pevné. Model obsahuje vybavení228 pokojů,12 koupelen a24 WC. Původní CAD, obrazové kopie a textové přílohy nejsou v Gitu ani zabalené v modelu.

## Podklady a interpretace

Osm půdorysů P01–N07 poskytlo392 místnostních polygonů. Měřítko CAD/1000 potvrzuje grafická míra; společný počátek je `[35,8]`. Patra se jednotlivě neposouvají ani neškálují. Oprava oken uchovává skutečnou100mm příčku uvnitř párové sestavy a správnou rovinu rámu. Podrobnosti v [foto revizi](photo-refinement.md), [oknech a dveřích](photo-shell.md), [interiérech](photo-interiors.md) a [materiálech](photo-finishes.md).

Výšky jsou přiznanou interpretací půdorysů a IPR2023: hlavní úrovně −3/0/3/6/9/12/15m, mezipatra −1,5/1,5/4,5/7,5/10,5/13,5m, hlavní střecha18m a nástavby21,41/20,50m. Vnitřní stupně mají0,15m. Nové zadní schodiště má dvě doložená IPR ramena s mezipodestou;8+8 stoupání a1,50m šířka jsou rekonstrukční odhady. Horní modelový rozdíl0,481m není vydáván za změřený fyzický práh. Překonání standardním herním skokem neřeší tuto nejistotu podkladů.

Materiály rozlišují pruhovanou chodbovou dlažbu, pokojové lino, dvoubarevnou výmalbu, koupelnové obklady, schody a fasády. Jde o autorské metrické vzory podle fotografií. Plochy a otvory určuje CAD; proporce nábytku a2,05m výška vnitřních sprchových příček jsou označené foto interpretace. Smrk je stejný původní asset na opravované poloze, viz [provenience stromu](photo-tree.md).

Rigidní transform zůstává translation `[6.702656726398903,0.6962777093118497,-55.04815187265829]`, yaw `-3.1233667855768164`, bez změny měřítka. Tři přijaté střešní/stříškové atlasy používají IPR Praha, léto2023, CC BY: datový podklad © IPR Praha. [Metoda a licence](../photogrammetry.md). Fasádní projekce se zachycenými stíny nahradily materiály podle uživatelských fotografií.

## Ověření a zbývající práce

- Native reopen/GLB/PBR/UV/packed PNG a shodná kolizní geometrie PASS.
- Skutečný Actor v celé Simulation:950/950 aktivních dveřních bodů; samostatně76/76 schodišťových směrů PASS.228 pevných křídel má samostatně ověřenou ochranu, není tiše vynecháno.
- Skutečný Actor v nativním modelu:264/264 místnostních tras včetně návratu PASS.36 vnitřků sprch zůstává explicitně neověřených kvůli0,50m CAD vstupům a0,54m účinnému průměru postavy.
- Produkční build a izolovaná integrace PASS. Úplné výsledky a skutečně přerušený místní autodev testovací běh jsou v [ověření hry](../../../verification.md); nepředstírá se úplný místní pnpm test PASS.
- GPU obraz, výkon a běžné ovládání čekají na viditelnou kartu v popředí. Předchozí starty byly omezené přibližně na1rAF/s a vypršely; readiness ani timeout se neoslabují. CPU render není GPU důkaz.

| Výstup | SHA-256 |
| --- | --- |
| Blender | `a55952f16c3006a85d15d3f6638db64628b4cb5079b0790a85a06c607ed207a5` |
| GLB | `a8aa5242b63b7ecf11caf6ce9fc54f2cdb516238e3268e03649aae7d0e327b9a` |
| Snapshot s testy a assety | `0ee299c2bc87e3d76c832783aa877c19ff8ff74de4e9bced8993e8be09d58100` |
