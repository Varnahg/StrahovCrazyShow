# Objem fasád a korun — 12. října 2026

Tento průchod reaguje na skutečné herní snímky U1: plochá okna, velké skvrny na omítce, protažený beton soklů, roztříštěné světlo listových karet a viditelná mezera pod střechou R-ka. Nejde o dokončení fotografické věrnosti celého areálu. [Původní a nové neupravené snímky](../verification-evidence/campus-depth-20261012-d2/gameplay/review.json) vznikly chůzí v celé hře; nejde o ImageGen, offline render ani obraz dodatečně upravený filtrem. Den používá skutečný čas/počasí, noční náhled je označený. Kamera byla opakována přibližně, nikoli pixelově přesně.

Referenční směr z [oficiálních obrazů Hogwarts Legacy](https://www.hogwartslegacy.com/en-us) je vlastní vizuální interpretace čitelného objemu, materiálové kresby a oddělení světla/stínu. Nevnáší do Strahova cizí gotickou architekturu ani herní assety. Původní místní fotografické zdroje, jejich stáří a omezení jsou v jednotlivých studiích níže.

## Co se změnilo

- **R-ko:** rozdílný medián výšky otevřeného a uzavřeného OSM polygonu zvedal střechu o 0,339876 m nad stěny. Společná střešní geometrie a Rapier kolize teď používají stejný původní polygon a výšku jako fasáda. Zůstává skutečně modelovaný 11cm tmavý lem; ten není průhlednou mezerou. [Geometrie a ray/Rapier důkazy](facade-study/depth-20261012/README.md).
- **Fasády:** 12mm sražení ostění, 17mm boky existujících rámů, uzavřené boky pilastrů a návrat střešního pásku. Nevznikly nové otvory ani rozšíření budov. Beton základových sukní opakuje texturu po metrech; původní UV ji protahovalo přes celou hranu. Barevné textury se nepřepisují.
- **Omítka:** méně širokého barevného mramorování, výraznější jemná normála a odstranění přidaného makrošumu. Ostatní rodiny i tónování celé scény zůstávají stejné. [21 původních kanálů, fotografie a materiálové měření](materials/depth-20261012/README.md).
- **Stromy:** jednorázově odvozené objemové normály z existujícího podkladu koruny, slabý průsvit podle barvy listů bez emise a odpovídající normála/tangenta při větru. 109 poloh, původní geometrie/mapy a kolize se nemění. Světlá generická kůra zůstává omezením; nebyla naslepo přebarvena. [Zdrojový audit, runtime cena a lifecycle](../vegetation/tree-depth-20261012/README.md).
- **Okna:** šest sdílených neprůhledných fasádních materiálů dostává Fresnel odraz stejné stávající oblohy jako B6. Při šikmém pohledu odráží více, čelně zůstává viditelná autorská maska žaluzií/závěsů. Exteriérová okna nezískávají průhlednost ani nový průchod pro alpha blending. B6 zachovává svou průhlednost a simulované osvětlené masky. Obloha v noci ztmavne; nepoužívá se cizí HDR krajina. [Babylon Fresnel](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/fresnelParameters) a instalovaný Babylon 9.30.0 jsou technické podklady.

## Cena a rozsah

Fasádní near geometrie celého 120budovového kontrolního souboru přidává 56 754 trojúhelníků; far geometrie, počet meshů i materiálů jsou stejné. Ne všechny budovy jsou současně detailní. Ve dvanácti kontrolovaných kombinacích místa/kvality zůstal počet aktivních materiálových meshů stejný. Jde o CPU inventář, nikoli GPU draw/FPS měření. U skutečného herního výběru jsou některé landmarky samostatné.

Objemové normály 108 far korun (jeden ze 109 stromů je holý) zabraly v samostatném CPU auditu poprvé 23,62 ms, medián 19,16 ms. Typický near/mid strom 1,37/0,36 ms. Výpočet běží jednou při importu/streamingu, ne každý snímek; nepotřebné geometrie se při eviction uvolní. Průsvit přidává práci shaderu, proto samotné stejné draw rozpočty neprokazují stejná FPS.

Odrazy oken sdílejí existující 32px cubemapu a obsluhu přidaných/odebraných materiálů; nevzniká další render target, světlo, scéna nebo geometrie. Omítka naopak vynechává nepotřebný noise/hash. Refaktoring sjednocuje window eligibility a tree bootstrap/detail streaming.

Plážový kurt byl během průzkumu také identifikován jako příliš jednolitý. Tři prohlédnuté původní předlohy Poly Haven Sand 01/02/03 neodpovídaly spolehlivě světlému místnímu písku; nebyly nasazené jen kvůli přidání další textury. Původní fotografické zdroje nebyly upravované.

## Ověření a známé meze

Cílené sady: architektura 32/32, materiály 20/20, stromy 13/13. Root ověřil den, noc, F, natočení oken a stejné herní trasy bez konzolových či render chyb. První společný D1 test zachytil změnu významu příznaku `realityGlass`, který původně označoval jen průhledné B6. Opaque okna nyní používají vlastní `exteriorOnlyGlass`; staré regresní tvrzení o šesti B6 materiálech nebylo oslabeno. Zůstal také negativní záznam nalezené chyby disposal opacity Fresnel, která je opravená podmíněným uvolněním. [Zachované D1 výsledky](../verification-evidence/campus-depth-20261012-d2/earlier-d1/pipeline-results.json).

Finální pipeline, zdrojový hash a případná produkční GPU kontrola patří do [souhrnného ověření](../verification.md). **Protokol 9** odděluje klienty s jinou střešní kolizí; kompaktní síťový formát se nemění. Klient a server se nasazují společně.

Terénní siluety, místy jednoduché modely/provozovny, barvy kůry, plážový kurt, povolené nedokončené interiéry, studený výběr trávy a prudký sprintový obrat zůstávají otevřené. Předchozí čísla z HUD nejsou výkonovou přejímkou. 60 FPS na GeForce GTX 1060 s různými avatary zatím není doložené.
