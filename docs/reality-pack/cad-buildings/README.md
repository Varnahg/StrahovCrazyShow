# Rekonstrukce budov podle dodaných CAD plánů

Zadání 24. 10. 2026, [KEY-59](https://linear.app/gigeconomy/issue/KEY-59): dokončit postupně každý model, včetně interiérů a schodišť, potom modely zapojit do hry. Zdrojové dokumenty zůstávají pouze v uživatelově lokální složce `Downloads/strahov autocad/strahov autocad`. Nejsou součástí repozitáře ani se nepřibalují do modelu jako textové či obrazové přílohy. Odvozená editovatelná geometrie, její herní exporty a vlastní implementační kód jsou výsledkem práce.

## Ověřený inventář

| Budova | DXF | Význam podkladů |
| --- | ---: | --- |
| Blok 1 | 5 | 1PP, 1NP, 2NP, 3NP, střecha s nástavbou |
| Bloky 2–11, každý samostatně | 8 každý | 1PP, 1NP–6NP, střecha |
| Blok 12 | 4 | 1PP, 1NP–3NP |
| Menza | 4 | 2PP, 1PP, 1NP, 2NP |
| Prádelna | 2 | 1NP, 2NP |
| Prodejna | 2 | 1PP, 1NP |
| Výtopna | 3 | n01–n03, přesný výškový význam ověřit při její samostatné rekonstrukci |

Čtecí průchod `ezdxf 1.4.5` otevřel všech **100 DXF pro 16 budov**. Všechny mají původní verzi **AC1004 (AutoCAD R9)** a nemají deklarované jednotky. Knihovna starou verzi při čtení interně normalizuje na R12; originály se nezapisují. Kontrolované polohové atributy entit nemají nenulovou Z souřadnici. Podklady jsou půdorysy, nikoli hotové trojrozměrné modely.

Rozpisky bloků uvádějí pasportizaci ČVUT, INDESS, leden 2005, digitalizaci původní kresby a výslovně **„Nezaměřeno“**. Menza uvádí prosinec 2004, prádelna září 2007. Neúplné rozpisky některých výkresů nepřebírají datum automaticky ze sousedního souboru. Lokální audit obsahuje SHA-256 každého souboru a extrahované rozpisové údaje; jeho plný obsah zůstává v ignorované pracovní cache.

Primární technické zdroje, ověřeno 24. 10. 2026: [Autodesk DXF HEADER](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm), [ezdxf verze](https://ezdxf.readthedocs.io/en/stable/const.html), [podpora starších DXF](https://ezdxf.readthedocs.io/en/stable/introduction.html). Hodnota INSUNITS 0 sama nedokazuje milimetry.

## První budova: blok 1

Mapová identita je `building:osm:way:53929063`. Výkresy jsou registrované v jedné velké 2D soustavě. Grafická stupnice 0–20 m v n01 měří **20004,8089027405 CAD jednotek**, tedy při převodu 0,001 m/jednotku 20,004809 m. Rozdíl přibližně 0,024 % odpovídá omezením digitalizované kresby; jde o kalibraci grafickou stupnicí, nikoli nově zjištěné zaměření budovy.

Vrstvy rozlišují silné/slabé hrany zdiva, nadpraží, okna, dveře, plochy a čísla místností a vybavení. Dveřní oblouky jsou otevřené tessellované POLYLINE, nikoli entity ARC. Uzavřené polyliny s 66 vrcholy ve zdivu často představují kruhové sloupy. Střešní n04 obsahuje malou nástavbu; nelze jej extrudovat jako celé čtvrté obytné patro. Pomocné rozpisové/schema čáry ani odlehlé nulové body se nesmějí stát stavební geometrií.

Na skutečných datech byla vyzkoušena polygonizace všech hran zdiva s odstraněním ploch místností. Vzniklé náhledy ztrácely příčky a části obvodu; tato varianta **není přijatá** jako finální převod. Room polygony se místy nepatrně překrývají a hrany nejsou všude uzavřené. Potřebná je interpretace vrstev, párování hran a kontrola každého podlaží proti čitelnému 2D náhledu.

[ELSA ČVUT](https://www.elsa.cvut.cz/bezbarierove-cvut/pristupnost-objektu/objekt/?o=81), kontrola 24. 10. 2026, potvrzuje tři nadzemní podlaží a rozdílné úrovně vstupní haly, zvýšeného vstupního podlaží a polosuterénu. Nejde tedy o jednoduchý stoh identických plochých podlaží. Dodané plány určují půdorys historického stavu; současný popis vstupu je doplňující zdroj, nikoli pokyn bez evidence přepsat historický plán. Výšky podlaží, parapetů, otvorů a profilů budou označené modelářské interpretace.

## Volba implementace a dopady

| Varianta | Posouzení |
| --- | --- |
| Ručně přepsat vše do nynějšího parametrického TypeScriptu | Navazuje na runtime, ale u 16 různých budov vytváří nákladnou druhou autorskou reprezentaci; změna Blender modelu se nepropíše do hry. |
| Prostě extrudovat všechny CAD čáry | Rychlé, ale vytváří stěny ze schodů, popisků a dveřních oblouků; odmítnuto. |
| GLB pro vzhled a nezávisle psané kolizní boxy | Rychlá první ukázka, trvalé riziko neviditelných stěn a rozdílných schodů; odmítnuto jako cílové řešení. |
| Kalibrovaná rekonstrukce do Blenderu, společný export vzhledu a konstrukčních kolizí | Zvolená cesta: jeden editovatelný model, oddělená podlaží a konstrukce, audit transformů a otvorů. Vyžaduje jeden exportní kontrakt a následný herní loader. |

Současné `.blend` a GLB budov jsou archivem nativně generovaných částí, hra celé tyto GLB nenačítá. B1 render pochází z `shared/landmark-reality.ts`; fyzika v `shared/simulation.ts` stále vytváří plný obvod a střešní kolizi. Samotná výměna archivního modelu by nic neopravila ve hře.

Následná integrace musí jedním registrem podle OSM identity vypnout nahrazený render, staré obvodové kolize, střechu a základový lem. Nový model musí mít shodný transform v rendereru i fyzice, skutečné výřezy terénu pro sklepy a prostorové vnitřní zóny, které neuzavřou dvory. Příprava materiálů patří do existujícího startupu; po zrušení načítání se pozdě načtený model musí uvolnit. URL exportů budou obsahovat verzi/hash. Kolize zůstávají stejné pro všechny kvality; dekorativní detail se řídí vzdáleností a podlažím. Skutečný výkon zatím nebyl měřen.

## Aktuální hranice důkazů

Inventář a 2D studie proběhly. [Blok 1](b01/README.md) má přijatý samostatný model R10, znovu otevřený v Blenderu, s ověřeným exportem a stavebními průchody. Nezávislé review i přísná přejímka čerstvé receptury jsou dokončené:162 Python a28 fyzikálních fixture testů bez skip. Ostatních 15 budov ještě nebylo modelováno; následuje B2. Herní integrace, návaznost na terén a produkční GPU důkaz následují po dokončení modelů a nejsou tímto modelovým výsledkem splněné.
