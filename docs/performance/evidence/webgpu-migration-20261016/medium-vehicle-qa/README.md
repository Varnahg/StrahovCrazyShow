# Medium/High: příprava auta a zbývající stínové programy

**Stav 19. 10. 2026: kandidát není přijat do nativního runtime.** Příprava skutečných světel a stínových map prošla cílenými kontrolami, ale produkční hra má dále záseky nad100ms. Provoz a takty kontrolního a kandidátních běhů se liší. Tento checkpoint není dokončené KEY-31/32 ani finální WebGL2/WebGPU přejímka.

## Kandidát a reprodukce

Baseline source `06754993e63049552768a7114f7a7fb8233cae0c2770a23336e9e071df8bc220` obsahuje přijaté SDWf8 a garment068. Kandidát `65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60` má582souborů včetně testů. Mění pouze Game, light-preparation, render-quality-preparation a pět běžných testů. Tři runtime inverse do baseline jsou přesné. Balíčky se neinstalovaly ani neupravovaly.

WebGPU připravuje vehicle0/1/2 u všech kvalit včetně skutečných Medium256/High512 map. Low2 je přiznaná redundantní etapa clamped1; stabilní průchod má48 místo41etap. Veřejné Game.setQuality během posledního průchodu reprodukovalo High request se stale256 mapou. Kandidát doplní celý poslední průchod uvnitř původního90s celkového a30s dílčího limitu; bez nové cache, timeout resetu či snížení kvality. WebGL zůstává9etap. Helper i root152/152PASS, rootfullTypeScript a produkční buildPASS. Nezávislé review osmi souborů má[]nálezů.

## Skutečné Edge běhy

GTX1060, ovladač582.28, Medium100%, CSS i interně2040×986, Alex, jedna skutečná multiplayerová relace sHUD, stejné noční světlo a uložené počasí. D550→benchmark10s→E→W8000→space2500; přibližně100m jízda, karta vpopředí a validní health. RawUI intervaly se shodují právě jednou sautomatickým záznamem. Nula render/asset/browser chyb. Konkrétní identity relací, počty intervalů, zdroje a GPU vzorky jsou vraw souborech a `checkpoint.json`.

| Běh | Druh | FPS | p95ms | p99ms | Maxms | ≥100ms | Nové programy/moduly/sync | Bus/cestující/auta na konci |
|---|---|---:|---:|---:|---:|---:|---|---|
| c1 | kandidát |45,5|32,1|102,7|155,4|5|4/8/5|2/0/1|
| x1 | původní |32,1|89,6|146,8|222,5|10|9/18/10|2/3/0|
| c2 | kandidát |42,5|32,1|93,7|187,2|4|5/10/6|0/12/0|
| g1 | existující inventář |41,7|33,1|95,2|211,0|4|4/8/5|1/2/0|
| g2 | existující atribuce |41,4|34,7|106,5|168,1|5|5/10/6|0/6/0|

**Z těchto čísel se nepočítá procento zrychlení.** Skutečný UTC provoz i GPU79–85°C/takty se lišily; poslední dva běhy navíc obsahují podrobnou diagnostiku. Jedna kontrola a dva kandidáti nejsou tři srovnatelné páry. Delší startup byl dovolen, ale celý vstup→ready zde nebyl srovnatelně měřen. Chybí celý stabilní checkpoint, izolovaná integrace a zbývající funkční/obrazová/multiplayerová přejímka tohoto kandidáta. Výstup c2 byl skutečně potvrzen až po návratu fokusu do canvas; samotné E po zavření panelu není důkaz výstupu ani regrese.

## Nový důkaz určující další opravu

g1 použil pouze existující local `profileEnvironment=1` ve stejném buildu. Za benchmark přibylo8modulecalls, z nich4byly přesné raw/body duplicity dřívějších modulů. Skupiny369/370 a373/374 mají dřívější calls vvehicle0/1. Neznamená to, že všechny nové moduly jsou duplicity nebo že se shodují původní zdroje/ABI/Effect klíče. Stageoverflow1 slučuje pozdní fázi, takže label sám neurčuje okamžik použití.

g2 používá dříve ověřený šestifile observer instrument. Source `ec5ddd67fc497d9ec31cca171b1cc767f5498ac9fc05566500d4821cbdba6283`,583souborů, přesný donor a čisté třícestné sloučení Game.213/213cílených testů, fullTS/buildPASS, nezávislé review[]. Všech5nových fulfilled requestů má `SM_LIGHTTYPE_SPOTLIGHT`: jeden obyčejný alpha/instanced a čtyři PBR alpha stínové programy, sDEPTHPREPASS zapnuto/vypnuto a různými světelnými sloty. Ani jeden není zachycený nový hlavní program. Materiálový uživatel je u všech5unmatched; nelze proto tvrdit konkrétní materiál ani skutečné přijetí efektu při draw. ObserverErrors0, omitted0. Tento důkaz směřuje kživotnímu cyklu/klíčům stínových efektů a pokrytí casterů, nikoli kdalšímu slepému rozšiřování hlavních warm etap. Uvolnění připravených efektů je zatím hypotéza, která potřebuje reprodukci.

`manifest.json` hashově váže160artefaktů včetně původních RED/failed logů, výsledných zdrojů, testů, source manifestů, buildů, protokolů, raw relací a obrazů. README a manifest nejsou zahrnuté samy do sebe. Hrané4201/4202/starší verze a cizí WIP se neměnily; všech pět vlastních měřicích scén a služby4200/2595 jsou ukončené.
