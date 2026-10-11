# Stadion: exteriér a uzavřený vnitřek — 11. 10. 2026

Podle výslovného zadání uživatele zůstává stadion v pilotu **pouze exteriérem**. Vnitřek a hrací plocha nejsou veřejně přístupné. Model zachovává otevřené nebe nad skutečným hřištěm; nevznikla plochá střecha ani neviditelný cap přes stadion. Současný stav nahrazuje dřívější průchozí model z [fotografické opravy 10. 10.](stadium-photo-correction.md); její původní výsledky zůstávají historickým záznamem.

## Zdroje a konkrétní opravy

- Půdorys, vnitřní výběžky a identity částí zůstávají z uchovaného OSM katalogu, zejména [relace 1515034](https://www.openstreetmap.org/relation/1515034), [východního pavilonu 480849465](https://www.openstreetmap.org/way/480849465) a [jižní věže 456174850](https://www.openstreetmap.org/way/456174850). Zdrojem není nový stavební výkres.
- Byly znovu skutečně prohlédnuty tři zachované uživatelské Street View snímky uvedené v předchozím dokumentu. Potvrzují hlavní prosklenou konzolu, široký plný pás, úzké horní prosklení, ustoupené pilíře a vnější schodiště. Datum jejich snímkování zůstává neznámé; screenshoty se nekopírují do textur ani exportů.
- [IPR ortofoto](https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer?f=pjson) má doložené datum 8. 6. 2024. Prohlédnutý širší repo výřez zachovává celý stadion a návaznosti Vaníčkovy i jižního autobusového terminálu. Materiál: datový podklad © IPR Praha, CC BY.
- Původní **IPR 2023 mesh**, nikoli ortofoto, poskytl upřesnění výšky. Bylo přečteno 51 původních nejpodrobnějších uzlů, s jejich uloženými SHA. U hlavní východní střechy vychází dominantní téměř vodorovná plocha **1 142 m² v pásu Y 27,1 m**. Dosavadní model měl tuto střechu přibližně Y 23,18 m. Nová modelová výška je zaokrouhlených **24 m nad dosavadním terénním základem Y 3,17977 m**; původní OSM údaj 20 m je uchován samostatně. Jde o interpretaci historického skenu, nikoli nové zaměření. [Profil vrcholů](stadium-exterior-20261011/source-profile.json), [plošně vážené vodorovné plochy](stadium-exterior-20261011/source-horizontal.json).
- Horní úzké prosklení navazuje na opravenou střechu; výrazný horizontální pás skenu kolem Y 17,6 m pomohl ukotvit horní mez hlavního objemu. Přesné rozdělení oken, pilíře a schodišťové proporce nadále zůstávají fotografickou interpretací.
- Doplněna je dosud chybějící jižní maratonská věž podle přesného OSM půdorysu a zdrojové výšky **38 m**, bez vymyšlených oken či interiéru. Barevnost je výtvarná interpretace historické [fotografie z roku 2005](https://commons.wikimedia.org/wiki/File:Praha_Strahovsky_stadion.jpg), nikoli inventura nátěrů roku 2026. Konstrukční charakter vnějších tribun potvrzuje také [dobový odborný článek LC Journal 2013, str. 25–28](https://www.holcim.cz/sites/czech2/files/2022-06/2013_01.pdf).

## Uzávěry a sdílená fyzika

Viditelné tmavé panely stojí za vnějšími pilíři. Jejich obrys vychází z průsečíků obou původních OSM prstenců: záměrný radiální odstup je 5 m od vnějšího obvodu a nejméně 0,8 m od hrací plochy. Algoritmus zahrnuje směry všech zdrojových rohů; prosté zmenšení celého polygonu bylo při vývoji odmítnuto, protože chybovalo u západního zalomení. Tato hranice, výška panelů nejméně 3,2 m a uzavření za vnějším ochozem jsou **herní opatření pro pilot**, ne tvrzení o skutečné permanentní fasádě nebo vstupním režimu stadionu.

Každý panel má dvě viditelné trojúhelníkové plochy předané také do samostatného oboustranného kolizního streamu `twoSidedExteriorCollision`. Rapier používá `FIX_INTERNAL_EDGES_TWO_SIDED`; ostatním stěnám ani střechám se nemění jejich dosavadní pravidla. Nevznikají nekonečné či neviditelné bariéry. Vnější předprostor, Vaníčkova a obě fotograficky interpretovaná schodišťová ramena zůstávají přístupná; za nimi je uzávěra.

Navigace používá `isClosedStadiumInterior` a `STADIUM_CLOSED_BOUNDARY` ze stejného plánu. Uživatel se pěšky ani autem běžně nedostane za uzávěru. Test auta sleduje skutečné kontakty Rapier `contactPair` s novým colliderem; nestačí pouhé zastavení o dřívější pilíř. Ověřeny jsou také skoky postavy, každý panel a spoj při chůzi i výšce skoku, otevřený prostor nad hřištěm a skutečná vnější pěší trasa.

## Zjednodušení a skutečný rozsah výkonového důkazu

Nepřístupná vnitřní mísa používá jednoduchou siluetu přesného prstence místo 22 řad fyzicky průchozích stupňů. U drobných nekolidujících fasádních rámů zůstávají jejich stejné odkryté čelní plochy; odstraněny jsou skryté zadní a boční stěny. Hlavní pilíře, konzoly, schodiště a fotograficky doložené členění zůstávají.

| Rozsah | Před | Po |
| --- | ---: | ---: |
| Trojúhelníky samotného stadionu, near | 16 620 | 11 179 (−32,7 %) |
| Trojúhelníky samotného stadionu, far | 9 686 | 9 471 (−2,2 %) |
| Zapnuté materiálové dávky stadionu, near | 10 | 10 |
| Zapnuté materiálové dávky stadionu, far | 8 | 9 |
| Všechny kolizní trojúhelníky balíku B1 + vstupy + stadion | 14 351 | 11 442 (−20,3 %) |

Dodatečná vzdálená dávka patří obnovené barevné věži. Nejde tedy o obecné snížení počtu draw calls. [Audit před](stadium-exterior-20261011/before.json) a [po](stadium-exterior-20261011/after.json) rozlišuje skutečné počty geometrie, zapnuté submeshe v NullEngine na low/medium/high a kolizní streamy. **Není to GPU měření, počet všech stínových průchodů ani produkční FPS.** Geometrický hash všech částí mimo stadion je shodný.

## Artefakty a ověření

Selektivní exporter nyní umí `--only great-strahov-stadium,great-strahov-stadium-far` a nezmění ostatní manifest entries ani soubory. Před exportem byl archivován [původní manifest](stadium-exterior-20261011/manifest-before.json). SHA obou GLB a obou masterů B1/společného vchodu po exportu odpovídají [původním hodnotám](stadium-exterior-20261011/preserved-archive-shas.json).

Při kontrole prvního exportu tohoto updatu byla nalezena chyba starého uzlu `ShaderNodeMixRGB`: Blender 5.2 vydával bílé `COLOR_0`, vlastní barvu až v `COLOR_1` a neuchoval modrošedý faktor. Exporter nyní používá primárním kódem glTF addonu podporovaný `ShaderNodeMix` s RGBA/MULTIPLY. Regrese ověřuje skutečné nebílé `COLOR_0`, modrošedý `baseColorFactor` a nepřítomnost nového průhledného průchodu.

Oba nové mastery byly **znovu otevřeny** v Blenderu 5.2.2, bez renderu, s nejvýše dvěma CPU vlákny. Každý index odpovídá sdílenému zdroji; maximální odchylka Float32 polohy je 7,63 µm, UV 3,77 × 10⁻⁶ a barvy 2,94 × 10⁻⁸. Následný export obou znovu otevřených masterů je **bitově shodný** s finálními GLB. [Reopen audit](stadium-exterior-20261011/reopen-audit.json).

- Near GLB SHA: `056e136a89cc786a06bc8c937edcb98d39f2c07f0e989fbfa6058f73c62cd647`.
- Far GLB SHA: `229fe7fa2f810e754cd4c9a1cf383c2fd589465d9528976f7804a1621a107d9d`.
- Finální cílená sada: **26/26 PASS**, včetně stadionu, aktuálních assetů, provenience cestujících a regresí střech. [Log](stadium-exterior-20261011/targeted-final.log). Scoped TypeScript **PASS** ([záznam výsledku](stadium-exterior-20261011/typescript-final.log)).
- Navigace byla znovu vygenerována s 24 správnými vstupními SHA. Všech **18 cest / 9 destinací i celý NPC payload** zůstávají po odečtení provenance stejné; hash payloadu `e892c3b0225a630f6e110265ddab29967feb5885448d0af74c7a9400aa892868`. [Porovnání](stadium-exterior-20261011/navigation-audit.json).
- Aktualizovaný celkový read-only [audit 158 GLB](../../model-review/authored-glb-audit.json) má `errors: []`; eviduje i dřívější geometrická upozornění ostatních modelů, která tento úkol neopravoval.

UTC intervaly CPU testů a exportů jsou v přiložených `cpu-*-window.json`. Konečné cílené testy proběhly 19:18:47–19:18:57 UTC; žádný překrývající se výkonový vzorek nelze vydávat za nezatížený. Po freeze tento agent nespouští další výpočty. Celou stabilní sadu/build/integraci, vizuální kontrolu produkční hry a GPU/FPS přejímku provádí root nad společným checkpointem. Far kandidát opravy auta nebyl změněn ani integrován.
