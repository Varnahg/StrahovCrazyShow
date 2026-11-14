---
title: 'Čtvrtinové LOD posledního stromu 4314257259'
type: 'bugfix'
created: '2026-11-14'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '0ca9a080871a5b632db1264f71251f358cb6e614'
review_loop_iteration: 0
---

<frozen-after-approval reason="Zadání uživatele">

## Záměr a podmínky

1. Předchozí model prošel v zimě a létě. Ve dvou pohledech při poloopadu nesplnil přejímku. Produkce používá 109 schválených čtvrtinových prototypů.
2. Výběr a škálování jiných karet mění pokrytí při polovičním počtu sezónních skupin. Referenční LOD1 má 6 360 autorských a 2 231 sdílených karet, celkem 3 214 různých ranků.
3. Převést autorské karty na jediný obalový trojúhelník a původní sdílené karty ponechat v jejich rovinách jako čtyřúhelníky. Jejich mapy se vejdou do volných buněk existujícího formátu atlasu. Dřevo LOD1 a celý LOD0 převzít z předchozí větvové varianty. Další lokální škálování ponechává příčinu předchozích odchylek. Rozdělení materiálů do dalších runtime meshů zvětšuje zásah do loaderu, vykreslení a cache.
4. Ověřit finální indexy. Strop LOD0 je 39 143 z 156 572 a LOD1 je 22 357 z 89 428. Cíle jsou 27 498 a 22 220.
5. Podmínky správnosti jsou stejné sezónní ranky, shodné bajty dřeva a LOD0 s ověřeným kandidátem, původní metadata, polohy a nezměněné LOD2. Nový materiál je vlastněn produkčním katalogem, se stejným počtem meshů jako jiné čtvrtinové stromy.
6. Edge WebGL2 musí doložit nejméně šest stejných pohledů ve třech stavech pro oba LOD a přítomnost vržených stínů. Platí stávající skupinové meze z quarter-acceptance.mjs. Po úspěchu přepnout výchozí katalog, ověřit hru a vydat přes PR s povinnými kontrolami. Na Raspberry ověřit běžící SHA, zdraví a SHA-256 servírovaných GLB i katalogu.

</frozen-after-approval>

## Code Map

- scripts/geometry-tree-mid/quarter-last-7259.mjs znovu použije ověřený dekodér a zápis GLB se zachováním identity.
- scripts/geometry-tree-mid/quarter-last-atlas.py připraví kombinovaný materiál pro jediný LOD1 z ověřených zdrojů na D:.
- scripts/geometry-tree-mid/quarter-review.mjs a quarter-review.ts připnou vstupy a použijí skutečný Babylon materiál a sezónní logiku.
- scripts/geometry-tree-mid/quarter-publish.mjs provede stávající kontrolu a zveřejní neměnné GLB a katalog. Cílený test ochrání rozpočet a identitu souborů.

## Implementation Notes

## Review Triage Log
