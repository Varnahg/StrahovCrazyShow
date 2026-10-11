# B6: spojitá cesta od vrátnice na první patro

Oprava 10. 10. 2026. Mění sdílené vykreslovací/kolizní `B6_BOXES` a regresní test fyziky. Ostatní budovy, stromy, hranice areálu, podlažní desky, schody a vybavení zůstaly zachované.

## Předloha a hranice přesnosti

Před změnou byl vizuálně prohlédnut archivovaný [plán B6](../references/media/blok-6-plan-2023.jpg), původní obrázek Silicon Hill Wiki: [zdroj a metadata](https://wiki.sh.cvut.cz/_detail/kolej/bloky/0.jpg?id=kolej%3Abloky%3Ablok_6). Původ a deklarovaná CC BY-SA 4.0 jsou v [evidenci referencí](../references/LICENSES.md).

Axonometrie 0./1. NP ukazuje předsazenou vrátnici a navazující schodišťovou sekci s volnou podestou, která propojuje vstup s dlouhou centrální chodbou. V tomto servisním jádru pokojová řada ustupuje komunikaci. Opakování stejné ložnicové šablony přes tento prostor v herním modelu proto vytvořilo nesprávnou uzávěru.

Obrázek nemá kóty ani severku. „Západní“ zde označuje současné herní souřadnice vstupu. Šířky, poloha příček a schodišťový výškový řez zůstávají schematické a čekají na zaměření; tato oprava dokládá souvislou průchodnost existujícího modelu a topologickou návaznost vstupu na schody.

## Příčina a oprava

Vstupní lobby `x=-7..0, z=-76..-70` vedlo do západní buňky pokoje. Příčka v `z=-77` a navazující pokojové rámy u `x=6` ji oddělovaly od zadní podesty schodů. Starý test ověřil pouze průchod dveřmi a pak postavu přenesl přímo k patě schodů. Spojení těchto míst tím nebylo ověřené.

Západní řádky 9/10 už negenerují pokojové příčky ani pokojové rámy do centrálního koridoru; představují servisní halu kolem schodišťového jádra. Východní pokoje a jejich příčky zůstávají pevné. Současné desky a stupně se nemění.

Na vstupu jsou dva skutečně kolizní boční sokly stejného typu `base`, který používá i renderer. Jejich střední souřadnice jsou `x=-7.06, z=-75.1/-70.9`, rozměry `0.1 × 0.55 × 1.8 m`. Mezi nimi zůstává volný průchod `z=-74.2..-71.8`, široký 2,4 m. Původní vizuální sokl přes celý vstup odstranila hlavní implementace, takže ve dveřích neleží průchozí kosmetická zeď.

## Selhání před změnou a výsledek po ní

Reprodukce: `pnpm exec tsx docs/stability/audit-b6-entry.ts before|after`. Actor vznikne jednou na `(-9,1,-73)`, chodí rychlostí 4,6 m/s v pevných 60Hz krocích bez skoku; jakýkoliv následný `setPosition`/respawn je zakázaný. Prochází body:

`(-3.5,-73) → (3.2,-73) → (3.2,-79) → (8,-79) → (8,-69.5)`

| Stav | Důkaz | Výsledek |
|---|---|---|
| Před opravou | [B6-entry-before.json](B6-entry-before.json) | První dva body prošel; třetí zablokovaný po 600 krocích na `(3.2004,0.8198,-76.4850)`. Exit 1, nula teleportů. |
| Po opravě | [B6-entry-after.json](B6-entry-after.json) | Všech pět bodů prošel; finální poloha `(7.9990,3.8202,-69.6127)`, tedy první patro. Exit 0, nula teleportů. |

Oba záznamy obsahují SHA-256 právě testovaného `shared/world.ts`, počet kroků a polohu na každém kontrolním bodě. Celá opravená trasa trvala 472 simulačních kroků včetně 30 úvodních klidových kroků. Nejnižší výška středu kapsle byla 0,8097 m.

Regresní test `B6 west lobby reaches the first floor by continuous walking without teleporting` nahrazuje slabý test vstupu. Další test potvrzuje pevnou východní příčku a oba boční sokly; samostatně zůstává ověření suterénní podlahy. Relevantní physics/netcode/stability výstup je v [B6-entry-relevant-tests.log](B6-entry-relevant-tests.log). GPU/FPS měření historického snapshotu D popisuje právě D; nová verze vyžaduje aktuální integrační a browser smoke.
