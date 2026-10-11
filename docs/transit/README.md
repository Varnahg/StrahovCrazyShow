# PID 143 / 149 a ambientní cestující

Implementace používá skutečně stažené jízdní řády [ROPID / PID](https://pid.cz/o-systemu/opendata/) z 10. 10. 2026, platné **10.–23. 10. 2026**. Obsahují 443 spojů linek **143 Dejvická–Stadion Strahov** a **149 Dejvická–Stodůlky-Bavorská**, 6 tras a 10 zastávkových bodů včetně přístupových úseků. Licence dat: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); výřez, převod souřadnic a přehled změn jsou v `shared/data/transit.json`.

Autobusy jedou po skutečných GTFS shapes a zastavují podle stop_times. Směry, kalendáře a kalendářní výjimky jsou zachovány. Čas používá Europe/Prague a [GTFS pravidlo „noon minus 12h“](https://gtfs.org/documentation/schedule/reference/#field-types), včetně změn letního času a časů nad 24:00. **Jde o plánovaný provoz bez skutečných poloh a zpoždění vozů.** Když data vyprší, běžný režim nevymýšlí ani neopakuje jízdní řád; stav je označen jako prošlý.

## Obnova dat a kontrola

```powershell
node scripts/fetch-transit.mjs
pnpm exec tsx --test tests/transit.test.ts
```

Launcher použije Python již obsažený v nainstalovaném Blenderu. Jinde lze nastavit `STRAHOV_PYTHON` nebo spustit `python3 scripts/fetch-transit.py`. `--cached` znovu vyřízne již stažený `.cache/PID_GTFS.zip` bez síťového přenosu. PID feed obnovuje denně; před dlouhodobým používáním dema je potřeba opakovat aktualizaci. Pro veřejné nasazení patří tento krok do denního serverového importu, který je mimo tuto lokální etapu.

Kontrolní WebGL scéna: `http://127.0.0.1:5173/docs/transit/preview.html`. Volba 143/149 používá stejný herní renderer, stejný model a skutečný konkrétní spoj. Tlačítko „Cestující po 35 s“ ukáže stav po odjezdu. Je jasně označena jako časová ukázka.

## Model

Skutečně stažený základ: **Low-floor city bus**, autor **Innerscene**, [zdroj a licence CC0](https://www.innerscene.com/tools/library/3d-parts/low-floor-city-bus-9e7ce899). Původní GLB je zachován v `public/models/transit/city-bus-source.glb`, SHA-256 `42fc939d64b8bcfc5329e13356fc984872c18ecb10535da6354f98ea58d3519c`.

`scripts/create-bus.py` v Blenderu peče transformace, slučuje materiálové skupiny, opravuje stranu dveří pro pravotočivý herní svět, mění obecnou červenobílou barvu a vytváří vzdálený LOD. Výstupy jsou editovatelný `assets/blender/transit/strahov-city-bus.blend`, plný GLB s **18 780 trojúhelníky**, vzdálený GLB s **6 553 trojúhelníky** a manifest s původem. Kola se otáčejí kolem skutečných středů podle rychlosti vozidla; světlomety a koncová světla mají emisní materiály. Číslo a cílový nápis vytváří hra na čele, boku a zádi; nejsou součástí cizí textury. Obě linky sdílejí tentýž základ.

Model je obecný dvanáctimetrový nízkopodlažní autobus. **Není to přesný model SOR ani doložený typ vypravený na konkrétní spoj DPP.** Dveře mají jednoduchý vnější posun; uzavřená karoserie, interiér a obsazení sedadel nejsou simulovány. [Skutečný Blender render](bus-preview.png) a [WebGL 149](browser-149-arrival.jpg) jsou uložené důkazy, nikoli konceptové ilustrace.

## Cestující a osobní auta

Při příjezdu k zastávce Koleje Strahov vystoupí deterministicky proměnlivý počet **0–10 fiktivních NPC** podle data, spoje a části dne. Nejde o skutečná data o cestujících. Začnou u předních pravých dveří, přejdou na existující pěší síť a pokračují k osmi různým blokům. Šestnáct předpočítaných cest navazuje OSM pěší cesty a obslužné komunikace; všechny vzorky tras jsou kontrolované proti budovám, stromům, lampám a nábytku. Krátké spojky propojují dveře, sloupek a chodník.

Vstupní prahy bloků jsou **zatím odvozené ze západních vstupních výstupků, nejsou zaměřené dveře**. Metadata to uvádějí u každého cíle. NPC se po dosažení prahu na okamžik zastaví a zmizí až zde, ne uprostřed cesty. Cesty zůstávají na přibližném rovném terénu; nesimulují skutečný počet obyvatel ani pohyb uvnitř nepostavených interiérů. Doba stání autobusu je vizuálně minimálně 14 s tam, kde GTFS uvádí nulový pobyt; plánovaný příjezd se neposouvá.

Dvě nezávislé větve lehkého ambientního automobilového provozu používají stejné silniční křivky. Auta jsou fiktivní kulisa, nikoli živý dopravní přenos. NPC nikdy nevstupují do seznamu přihlášených hráčů, chatu nebo multiplayerové identity. Host používá stejná veřejná data samostatně.

## Integrační API a výkon

`shared/transit.ts`: `sampleTransit(now)` vrací `buses`, `passengers`, `traffic`, `status`; `transitObstacles(frame)` poskytuje shodné rozměry a transformace autobusů/aut pro klientskou i serverovou fyziku. `nextArrivals(now, limit)` vrací skutečné plánované příjezdy; `getPreviewArrival(now)` vybere příjezd pro jasně označenou ukázku a při prošlých datech může použít historické datum feedu. Toto časové přepnutí nemá měnit reálné počasí nebo astronomický čas.

`new TransitRenderer(scene)`; await `ready`; `update({now, player, quality, dt})`; `dispose()`. Renderer má vlastní pool avatarů a nepřepisuje hráčské materiály. Blízké autobusy používají plný GLB, vzdálené LOD s hysterezí; geometrie je instancovaná. Low omezuje viditelnost na 4 autobusy a 16 NPC, medium na 8 a 28, high na 8 a 40. Časový stav všech NPC existuje nezávisle na této vzdálenostní optimalizaci. Autoři nevykazují tyto limity jako maximum počtu online hráčů.

Ověřeno 8/8 testů v `tests/transit.test.ts`, TypeScript bez chyby v těchto modulech a skutečná WebGL scéna pro obě linky bez konzolových chyb. Orientace nápisů byla opravena a vizuálně ověřena. CPU sampleru při 1 000 voláních v lokálním testu vyšel přibližně 0,10 ms na volání; toto **není** FPS test celé hry.
