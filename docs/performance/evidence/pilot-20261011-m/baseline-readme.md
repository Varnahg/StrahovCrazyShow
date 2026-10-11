# Ověřený baseline L2 před kandidátem M

**Šest denních intervalů je platných pro následné srovnání; discovery a tři označené intervaly jsou vyloučené.** [Strojový audit](baseline-summary.json) uvádí každý příznak, důvod vyloučení a SHA-256 vstupů. Audit spustil `node docs/performance/evidence/pilot-20261011-m/validate-baseline.mjs` s výsledkem **exit 0**. Runtime se při auditu neměnil.

Všech šest měření má zdroj `c4586de83cef2b7406122c75eed04abf89796765cc338c0b7dabc92a9c7ad658`, Intel UHD 630 / ANGLE D3D11 / WebGL2, CSS **1920 × 1080**, interně **1476 × 830**, ruční **low**, stejnou kameru včetně obou matic, denní astronomický okamžik a render budgets. Ambientní autobusy, auta a cestující mají shodně nulový počet. Všechny platné intervaly mají **0 render a asset chyb**.

| Populace | Opakování | FPS | p95 ms | p99 ms |
| --- | --- | ---: | ---: | ---: |
| 1 | [a](baseline-1-day-a.json) | 34,1 | 37,4 | 47,1 |
| 1 | [b](baseline-1-day-b.json) | 34,6 | 34,0 | 41,3 |
| 1 | [c](baseline-1-day-c.json) | 34,6 | 32,4 | 39,5 |
| 30 | [a](baseline-30-day-a.json) | 30,3 | 41,7 | 54,0 |
| 30 | [b](baseline-30-day-b.json) | 29,0 | 48,2 | 57,8 |
| 30 | [c](baseline-30-day-c.json) | 32,2 | 36,3 | 40,8 |

Mediány **intervalových** průměrů FPS jsou 34,6 a 30,3. Nejde o pooled frame statistiku. Cíl 60 FPS splněný není a žádný třicetiavatarový interval nemá p95 ≤ 33,3 ms.

## Kohorta a fikční profily

[Síťový report](baseline-network.json) měřil 11. 10. 2026 **15:42:48,952–15:47:48,953 Praha / CEST**, po 20s warmupu. Všechny tři třicetiavatarové GPU intervaly leží celé uvnitř tohoto rozmezí, i po započtení 5ms nejistoty zaokrouhlené délky. Frozen L2 ukládá `date` na konci intervalu a `avatars` jako minimum přes všechny snímky; všechna tři minima jsou 30.

29 skutečných SDK botů a browser sdílejí jeden svět. Síť zaznamenala přesně 30 motion řádků, všech 29 botů se pohybovalo a aplikačních chyb bylo 0. [Capture profilů](baseline-network.profiles.json) obsahuje všech šest fikčních presetů s počty **5/5/5/5/5/4**. ID všech 29 úspěšně vydaných profilů přesně odpovídají ID botů v síťových pozicích; hashe skutečných importů harnessu odpovídají zmrazenému manifestu. Je to capture vstupů do běžného vydání session, nikoli nezávislé opětovné načtení serverových profilů po joinu.

**Síť měla 87 authority resync flagů za celou kohortu.** Nejsou k dispozici časy jednotlivých flagů, takže je nelze přiřadit konkrétním GPU intervalům ani je odečíst jako následek dřívější souběžné zátěže. Bezchybná síťová stabilita se netvrdí. Tento údaj neanuluje zaznamenané FPS, ale omezuje interpretaci celého běhu.

## Počasí a vyloučené intervaly

[Fixture](weather-fixture.json) má SHA-256 `aa2030018833952bd83c858ba208ff22c03de20aa7c32432101b88efaad24574`. Koordinátor zaznamenal stejný hash při spuštění preview a viditelný zdroj řízeného počasí v UI. [Následný read-only HTTP capture](baseline-weather-observation.json) z dosud stejného preview potvrzuje přesnou shodu fixture se všemi číselnými hodnotami; pouze stav a popisky jsou výslovně označené jako řízený benchmark. Baseline JSON neobsahuje weatherAtStart/weatherAtEnd a nedokazuje samostatně, jaké uniformy shader používal po celý každý interval.

- `baseline-discovery.json`: předběžný průzkum, do baseline se nepočítá.
- `excluded-baseline-concurrent-cpu.json`: souběžné cílené testy/CPU studie.
- `excluded-baseline-30-concurrent-typecheck.json`: souběžné avatar testy/typecheck.
- `excluded-baseline-night-after-cohort.json`: interval přesahuje konec kohorty a minimum populace kleslo na 1; není třicetiavatarový noční důkaz.

Platné intervaly byly dle koordinace bez souběžných testů, CPU studií nebo další 3D scény; úplný systémový procesní trace se nezaznamenával. Pohybující se hráči mají při jednotlivých koncových capture odlišné přesné pozice a LOD. Srovnání kandidáta proto musí držet zdroje, kameru, počasí, kvalitu, rozlišení, počet a skladbu populace a současně uvádět variabilitu opakování. Hodnoty `frameWork` jsou poslední vzorek, `frameBreakdownMs` jsou průměry intervalu a `rendering.statistics` je jiné krátké adaptivní okno.
