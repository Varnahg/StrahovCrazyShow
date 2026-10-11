# K4 · pořadí vykreslování a nulový clearcoat

Zmrazený zdroj `441bbcd3b3f861e01fbcde498cff75ba3f332671eb361078d62143b725b5a687` má 8066 souborů. **352/352 testů PASS, build včetně TypeScript PASS, izolovaná integrace PASS**. Příkazy trvaly 56,1539 / 34,2529 / 17,8149 s. SHA audit ověřil 8066 živých + 8066 zmrazených souborů bez neshod před následnými změnami K5. [Výsledky a pipeline](../verification-evidence/render-order-material-budget-20261011-k4/results.json), [manifest](../verification-evidence/render-order-material-budget-20261011-k4/source-manifest.json), [SHA audit](../verification-evidence/render-order-material-budget-20261011-k4/source-check.json).

Proti K3 se změnily pouze `client/art-lighting.ts` a `client/car-pack.ts`; přibyly dva pomocné moduly a dva testové soubory. **Žádný asset, textura, UV, normála, poloha ani geometrie se nezměnily.** Přesně nulový netexturovaný clearcoat se vypíná; opaque sort zachovává sky první a používá skutečné native instance LOD skupiny. Alpha-test a transparentní pořadí nemění. [Algoritmus, primární GLSL a cílené kontroly](k4-candidate.md).

## Skutečné GPU výsledky

Celá produkční hra s HUD a skutečnými anonymními relacemi; **Intel UHD 630**, WebGL2/ANGLE D3D11. CSS **1920×1080**, interně **1476×830**, ručně zafixovaná low. Kamera a její matice, světelný okamžik i ambientní populace jsou v každém JSON. Všech sedm platných intervalů má **0 shaderových a asset chyb**.

| Scéna | FPS | p95 ms | p99 ms |
| --- | --- | --- | --- |
| Den, 1 avatar, 3 opakování | 35,8 / 35,6 / 35,6 | 31,1 / 32,1 / 31,4 | 39,6 / 38,2 / 34,9 |
| Den, 30 avatarů, 3 opakování | 32,5 / 31,7 / 32,4 | 35,0 / 40,2 / 35,3 | 40,0 / 50,1 / 43,9 |
| Noc, 30 avatarů, 1 opakování | 35,7 | 30,5 | 32,7 |

[Strojové shrnutí a jednotlivé JSON](evidence/render-order-material-budget-20261011-k4/summary.json); PNG stejného názvu jsou vedle JSON. První denní jednoavatarový interval má 1 080 505 trojúhelníků **včetně stínových průchodů**, 325 draw calls.

**Cíl 60 FPS nesplněn.** Denní třicetiavatarová série také nesplňuje p95≤33,3 ms v každém opakování. Jediný noční vzorek tuto podmínku splnil, ale nedokazuje celý noční průchod. Náhled noci je 12. 10. 2026 00:00 Praha; přesný okamžik 11. 10. 02:00 je samostatná regrese osvětlení. NVIDIA K4/30 hráčů zatím změřené nejsou. Místní uživatelské diagnostiky se nepublikují.

## Populace a vyloučený interval

První SDK běh: 300,0069 s, přesně 30 motion řádků, 26 pohybujících se botů z 29 připojených, **29 authority resync flagů**, 0 aplikačních chyb, ukončen deadline. Celé první dva denní GPU intervaly leží uvnitř této kohorty. Opakovaný běh: 100,8649 s, přesně 30 řádků/26 pohybujících se botů, **0 resync a 0 chyb**, kontrolované ukončení stop souborem. Obsahuje celé třetí denní a noční měření. Oba běhy po odpojení potvrdily 0 otevřených autentizovaných bot spojení.

Přímý zmrazený harness konstruuje 29 profilů cyklicky přes šest presetů (`index % 6`); jeho cesta/SHA jsou v síťových zprávách. Oddělený post-join capture profilů tentokrát nebyl sbírán. Síťový report ani NullEngine nejsou GPU důkaz nebo měření internetové latence.

`browser-transition-30-ended-low-day-intel.json` je zachovaný a **vyloučený**: kohorta již skončila a celý interval měl jednoho avatara. Jeho 33,3 FPS se do třicetihráčových výsledků nepočítá.

## Omezení srovnání

Nová kontrolní K3 série dala 25,1 / 25,3 / 25,2 FPS při stejných kamerových maticích. První dva intervaly ale obsahovaly 3/1 ambientní cestující a třetí měl jiný počet stínových draw calls než K4. **Nejde o přesně izolované A/B** a procento zrychlení se neodvozuje. Totéž platí pro starší K3 28,2 proti novým 35,6–35,8 FPS. K4 má vlastní platná měření a jejich limity se uvádějí přímo.

K3, J a neúspěšné I/K/K2 zůstávají zachované. Technický PASS nedokončuje všechny interiéry, fotogrammetrii každého stromu nebo nové vlasy/trávu. Ty jsou samostatné vizuální studie. K5 prostorové rozdělení terénu potřebuje vlastní kontrolu stínů, testy a GPU měření.
