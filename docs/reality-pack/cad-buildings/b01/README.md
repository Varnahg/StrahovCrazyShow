# Blok 1 podle historických půdorysů

Stav 24. 10. 2026: **Stavební geometrie R10 je zachovaná; současný master má osm odvozených packed IPR textur a runtime loader se společnými kolizemi. Produkční herní/GPU přejímka ještě není dokončená.** Aktuální uživatelský rozsah [KEY-59](https://linear.app/gigeconomy/issue/KEY-59) je pouze B1 a B6; další budovy se v této etapě nezačínají.

Editovatelným zdrojem je `assets/blender/cad-buildings/b01.blend`. `public/models/cad-buildings/b01.glb` a `shared/data/cad-buildings/b01.json` jsou odvozené z jeho skutečných meshů. Uložený model má samostatné podlažní kolekce a části podle role/materiálu, metrické jednotky a výchozí záběr celé budovy. Kontrolní kamery a světla nejsou zabalené v masteru. Starý hromadný generátor jej nepřepisuje.

## Podklady a interpretace

Pět lokálních DXF určuje 1PP, 1NP, 2NP, 3NP a střechu s malou nástavbou. Jde o digitalizaci z roku 2005 označenou „Nezaměřeno“. Originální soubory, rozpisové texty ani jejich obrazové kopie nejsou v Gitu či zabalené v Blenderu. Názvy, hashe a geometrická provenience jsou v `preparation-audit.json`.

Měřítko je CAD/1000, společný počátek `[250,731]` v metrech původní soustavy. Blender: `X=−(CAD Y−731)`, `Y=CAD X−250`, `Z=výška`; glTF/kolize: `X=Blender X`, `Y=Blender Z`, `Z=−Blender Y`. Jednotlivá patra se samostatně neposouvala ani nepřeměřovala podle jejich obálky.

Chybějící řezy doplňuje výslovná interpretace C, ověřená vůči počtům schodišťových hran a původní IPR Praha fotogrammetrii z léta 2023. Všech 22 vnitřních segmentů má stoupání 0,15 m. IPR má jiný rok a omezenou prostorovou přesnost: **výšky nejsou geodetické zaměření ani tvrzení as-built**.

| Úroveň | Main lokálně | Příčná křídla lokálně |
| --- | ---: | ---: |
| P01 | −3,00m | −4,65m |
| N01 | 0,00m | −1,95m |
| N02 | 2,85m | 1,05m |
| N03 | 5,70m | 4,35m |
| Střecha | 9,00m | 8,05m |

Nástavba končí v 11,55 m. Současné sdílené umístění z rigidního IPR fitu má translation `[-86.806769185171,4.219841912814184,77.74954203422622]`, yaw `−3.1251629196638517`, bez škálování. IPR podporuje střechy přibližně 13,2/12,25 m, hlavní vstupní podestu 4,2 m a N02 boční podestu 5,3 m. Historické venkovní schody, především osm zakreslených hran u N02, mohou zachycovat odlišný či neúplný stav proti roku 2023. Plane fit median0,277 m/RMS0,716 m není nové zaměření; obě čelní fasády nelze současně ztotožnit bez změny CAD délky.

## Současný fotogrammetrický master

Šest podélných hlavních fasád a dvě střešní úrovně dostaly explicitně vymezené atlasové textury z IPR2023,16px/m,max2048. Nejistá čela, sklo, rámy, ostění a interiéry si ponechaly původní materiály. Střecha malé nástavby nedosáhla požadovaného pokrytí, takže není označená za texturovanou. Zdrojové snímky jsou omezeně ostré a mají zachycené osvětlení; nejde o oddělené fyzikální albedo. Podrobnosti a licence jsou v [fotogrammetrii](../photogrammetry.md).

Zkušební4px/m a16px/m rendery včetně shodné kamery nad původním IPR mesh byly prohlédnuté. Ostré přechody mezi ověřenými texely a původní barvou zmírňuje výslovný pás nejvýše0,15m pouze uvnitř validní geometrie. Zdrojový core, fallback, masky a samotná stavební geometrie se nemění. Validní/rejected pixely ani reach se kvůli vzhledu nerozšiřují. Raw JPEG/CAD kopie se nebalí; v masteru jsou jen odvozené bezztrátové PNG s proveniencí.

Nativní předpublikační audit ověřil83 částí/50 kolizních částí, všechny orientované trojúhelníky, rohové normály/UV, přiřazení více materiálů, PBR a přesné embedded PNG bytes vGLB. Kolize/anotace jsou oproti R10 byteově stejné po vyloučení pouze dvou odkazových hashů assetů. Blender i GLB jsou vzájemně přenosné bez lokálních fototextur.

| Soubor | SHA-256 současné foto verze |
| --- | --- |
| Blender | `df9af6d517d12f47971d8910be66f6ef284939076871fa53a106cb994ddc016f` |
| GLB | `bf61d29cbaa89637db7362ca2d053b6e1f51381c1bf4438a7d6b082b13194e69` |
| Kolize/anotace | `dd71a7306096042083bea9533b744e14ad03c1b5fb0164beadbdf63cd5656112` |
| Site | `383bfddead0b57f559d379505a8488cca9284369588d72e8c9f6708dfc5859ef` |

Native/GLB evidence je v `model-audit.json`; původní R10 a jeho historické výsledky zůstávají níže a v commitu6dd89606. Nové world výsledky jsou oddělené od původní samostatné kapsle.

Přesné zóny respektují celé místnosti, nosné stěny, podesty a portály. Dřívější nekonečné Y pásy nesprávně snižovaly 84 hlavních fasádních oken; R10 tuto chybu neobsahuje. 95 doložených podélných okenních sestav křídel má vyšší profil a světlé dolní výplně. Jejich materiál je interpretace snímku, nikoli určení panelu proti matnému sklu. Hlavní střešní atika má odhad 0,40 m nad střechou a tloušťku 0,15 m; zvýšený obvod je v IPR doložen, stavební tloušťka není.

## Co model obsahuje

Pět podlažních skupin, 302 otvorů odvozených z dveřní kresby, 458 okenních sestav, 29 schodišťových ramen a 33 podest. 15 čelních fasádních otvorů je podle IPR uzavřené prosklení. Ostatní dveře jsou modelované otevřené; volné vybavení místností nebylo vymyšlené nad rámec podkladů. Užití některých mělkých prostorů není pojmenované bez důkazu.

Vnější schody tvoří 6 fyzických tras. Podschodové místnosti a skutečné nižší části stěn zůstaly zachované. Opravy zasahují pouze doložené průniky, včetně N01 portálu 2852 pod vyšší podpěrou a P01 s146 pod vstupním ramenem. s146 již uzavírá skutečná spodní plocha schodiště/podesty se světlostí nejméně 2,4659 m; další plochá deska tam nepatří. Spoj 0,241 mm odpovídá 1 mm modelové přesnosti.

Širší N01 interiéry pod odsazenými křídly N02 mají vlastní uzávěr 0,85–1,05 m. Je odvozený z konkrétních místností a sousedního zdiva, bez zakrytí šachet, dvorů, schodů či dvojí podesty 28DD. Ve dvou mělkých bay byla odstraněna falešná výplň z párování slabých čar; zůstalo 100mm ostění, boční i zadní stěny a podlaha. Jejich zkouška respektuje skutečnou hloubku prostoru a poloměr kapsle.

## Skutečné ověření R10

- **162 Python testů PASS, bez skip**, včetně čerstvě přepočtené receptury v režimu `B01_RECIPE_ACCEPTANCE=1`; 13 malých fyzikálních a 15 accessibility fixture testů PASS. Původní R10 běh měl154 testů; review doplnilo8 kontrol identity generátoru.
- Blender 5.2.2 LTS: build, primitive fixtures, reopen, orientované trojúhelníky všech částí, normály/PBR a shoda GLB/kolizí PASS. 83 mesh částí, 50 kolizních částí, 237 312 kolizních trojúhelníků. Počty nejsou GPU výkonový důkaz.
- 263 bodových kontrol podpory/světlosti 1,9 m bez blokace; **44/44 celých schodišťových směrů PASS**.
- **552/552 místních dveřních průchodů s příslušnou podlahou PASS**. 30 směrových kontrol 15 pevných prosklení PASS; sjednocení skutečných trojúhelníků kryje celý otvor v ostění. 22 pokusů u 11 vnějších dveří nemá v městském modelu dosud připojený venkovní terén, není vydáváno za PASS.
- Souvislá kapsle ze 3 konkrétních doložených vnějších nástupů dosáhla **561/563 konečných dveřních bodů**. Poslední 2 leží za 28D2/28EB v odděleném připojeném prostoru: zdrojové stěny 160A/1698 jsou souvislé bez vnitřního portálu. Jediný přístup vede zvenčí a čeká na terénní integraci. Nejde o důvod přidat vnitřní seed či prorazit zeď. Report zůstává pravdivě označený jako partial.
- Zkušební kapsle: radius 0,25 / halfHeight 0,55 m, celková výška 1,60 m, autostep height 0,22 / width 0,10 m, skin 0,02 m. **Hra tato nastavení zatím nepoužívá.** Neověřoval se klient/server, celý svět ani GPU.
- R10 celkový render a konkrétní perspektiva pod novým uzávěrem místností 29 byly prohlédnuté. R9a má zvlášť uložených 6 podlažních/celkových pohledů a 4 interiérové perspektivy; nejsou přeznačené za R10.
- Export uloženého R10 bez CAD zachoval přesné bajty všech 3 publikovaných souborů. Nativní master zůstává zdrojem, ne receptura. Starší skutečná zkouška upraveného masteru také zachovala ruční posun rámu 31 mm.

| Soubor | SHA-256 R10 |
| --- | --- |
| Blender | `5d415c1f4866a04adce944ac5e38002fc6c9c8f372186f3e36e917fa736422b1` |
| GLB | `93aa01ddf02ef5710ac53dda7847c312e51223e1f83b60603d6d941c93a089e1` |
| Kolize/anotace | `629ca3a8c25579c3e85e682dd1ca5032526a8cb74ee5d1f189e73d6bffaeff6d` |

Lokální důkazy jsou v `.cache/cad-buildings-20261024/b01-build/` (`tests-r10.log`, `build-r10.log`, `reopen-r10.json`, `routes-r10.json`, `doors-r10.json`, `native-roundtrip-r10.json`, `renders-r10/`, `interiors-r10/`) a sousedním `b01-accessibility/accessibility-r10-entries.json`. Neúspěšné R9 a předchozí checkpointy zůstaly zachované. `model-audit.json` váže současný přehled na konkrétní soubory.

Třívrstvé review bylo uzavřeno bez odložených nálezů. Opraveny jsou chybová cesta alokace Rapier světa, negativní testy celého dveřního reportu a přejímka zastaralé receptury. Čerstvý kontrolní převod má SHA `677b8f7d1cdd361f313e242375624a8dffdd70b9032d1538960afea07bb128b3`, generátor `942b9463f7f1f894a5fc61ba8b3caa91e3a38a7d061501d40ddbd7196f81588a`. Celá receptura kromě nového pole `generatorSha256` je přesně shodná s původním vstupem R10 `d1202adf…`. Všechny tři publikované assety zůstaly byteově stejné; nebylo nutné znovu měnit jejich geometrii. Důkazy: `review-fresh-equivalence.json`, `review-strict-python-green.log`, `review-node-fixtures-green.log`; původní skutečně odmítnutá cache je zaznamenaná v `b01-preparation/review-strict-old-recipe-red.log`.

Přípravná přejímka vyžaduje nejprve skutečný nový běh `prepare_b01.py` nad lokálními plány a potom `B01_RECIPE_ACCEPTANCE=1` při `python -m unittest discover -s scripts/cad-buildings -p 'test_*.py'`. Použité verze: ezdxf1.4.5, Shapely2.2.0, NumPy2.5.4, Matplotlib3.11.2. Výchozí syntetický režim bez soukromých plánů smí lokální recepturu přeskočit a není plnou přejímkou budovy.

## Export a další integrace

`build_model.py --from-blend <uložený.blend>` exportuje skutečně upravený master bez CAD. Ponechat identitu, patra a role objektů; modifikátory před exportem aplikovat. Při změně schodů/otvorů upravit jejich anotace a zopakovat prostorovou přejímku. Každý export nejprve vytvoří dočasnou sadu a ověří ji; publikace má zálohu/žurnál a obnovu po přerušení. Cizí neočekávaný obsah cíle nepřepisuje.

Herní integrace musí společně nahradit starý render, kolize a základy, připojit terénní výřezy a vnitřní zóny, sjednotit klient/server fyziku a zajistit načítání/úklid modelu. Poté následují skutečné vstupy, jízda/kamera, testy/build/izolovaná integrace a produkční GPU profil. Tyto budoucí kroky nejsou vydávány za splněné tímto stavebním modelem.


Finální stav24.10.2026: Produkční přejímka je doložená v [runtime záznamu](runtime.md). Model je zapojený a uložený v samostatném commitu; dřívější pending formulace výše zachycují průběžnou přejímku.
