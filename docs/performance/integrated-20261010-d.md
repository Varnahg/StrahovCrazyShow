# Integrovaný výkonový audit D — historický výsledek

Pro snapshot **D** splnily všechny tři testy třiceti účastníků v zaznamenaném výhledu výkonový cíl: **59,6–60,1 FPS, p95 16,9–20,2 ms** na Intel UHD 630. Také tři stejné zkoušky se stovkou účastníků na nádvoří prošly. Toto platí pouze pro níže uvedený záběr, kvalitu a neměnný zdroj. Pozdější opravy průchodu B6 a směru kamery vyžadují nové ověření; tento výsledek se na ně nepřenáší.

## Verze a podmínky

- Source SHA-256: `6bac5a55ce9f8a07885fd07de125fca0299ef7b2e4b893ded45bbc0eb962d062`, 99 souborů, [manifest](evidence/integrated-20261010-d/source-manifest.json).
- Produkční Vite build z `.cache/performance-snapshot/integrated-20261010-d`, preview 4175 a samostatný server 2570. Hlavní servery 2567/4173 nebyly použity pro zátěž. Před GPU auditováním skončily sekvenční kontroly 91 testů, produkčního buildu a integrace; [ověření nezměněného zdroje](../verification-evidence/integrated-20261010-d/integration-source-check.json).
- Intel Core i7-8750H, Windows, skutečně vybraný WebGL adaptér **ANGLE Intel UHD Graphics 630 / Direct3D11**. Na stroji je také GTX 1060, kterou tyto zaznamenané WebGL výsledky nepoužívají. [Inventář](evidence/integrated-20261010-d/environment.json).
- CSS viewport **1920 × 1080**, nízká kvalita s backbufferem **1476 × 830**. Jde o nižší interní rozlišení, ne o vykreslování 1920 × 1080 pixelů.
- Plná aplikace v multiplayeru, standardní HUD a otevřený panel nastavení. Kamera u výchozího místa na zpevněné ploše. V platných low vzorcích bylo **0 travních trsů, 0 autobusů, 0 cestujících a 0–1 okolních aut**. Nejde o nejdražší pohled celého areálu.
- Osvětlení nastavené přes UI na **denní demonstrační náhled 10. 10. 2026, 10:00 UTC / 12:00 Praha**. Počasí zůstalo živé: 10,9 °C, bez deště; povrchový vítr během testů přešel z 2,2 m/s od jihu na 2,7 m/s od jihovýchodu. Modelová oblačnost Open-Meteo byla 100 %, s modelovými větry jednotlivých vrstev. [Před browserem](evidence/integrated-20261010-d/weather-before-browser.json), [během stovky](evidence/integrated-20261010-d/weather-during-100-crowd.json). Počasí tedy nebylo přesně zmrazené pro všechna opakování.

UI akce a screenshoty pořídil hlavní agent ve vlastním tabu; tento výkonový subagent neměl v CUA přístup k hostitelskému browseru. Síťové kohorty a kontrola uložených raw výsledků běžely nezávisle. Neprobíhal souběžný build ani test.

## GPU výsledky

Každý vzorek trval alespoň 10 sekund. P95/p99 jsou kvantily jednotlivých nezprůměrovaných `Engine.getDeltaTime()` hodnot, nikoli zaokrouhlených HUD FPS. **PASS vyžaduje současně průměr ≥ 30 FPS a p95 ≤ 33,3 ms v každém opakování.**

| Připojení | FPS jednotlivých opakování | p95 ms | p99 ms | LOD při dokončení vzorku | Výsledek |
|---|---|---|---|---|---|
| 1 | 60,0 / 60,1 / 60,0 | 22,9 / 20,7 / 20,5 | 26,3 / 25,5 / 26,5 | 1 near | 3/3 PASS |
| 30 | 60,0 / 59,6 / 60,1 | 16,9 / 20,2 / 17,5 | 18,7 / 28,3 / 22,6 | 3–4 near, 26–27 medium | 3/3 PASS |
| 100 na nádvoří | 57,1 / 59,1 / 56,0 | 23,2 / 21,3 / 23,6 | 28,0 / 26,2 / 27,8 | 4 near, 96 medium | 3/3 PASS |

Pro třicet účastníků se vykreslovalo přibližně 92,7–119 tisíc trojúhelníků a 111–115 draw calls; pro stovku 294–325 tisíc trojúhelníků a 111–119 draw calls. Stabilní počet draw calls při růstu davu odpovídá zachování sdílených hardware instances. Počet online avatarů a součet LOD nejsou tvrzením, že každý avatar je v každém okamžiku uvnitř frustumu nebo viditelný přes budovy.

[Raw výsledky a automatická kontrola](evidence/integrated-20261010-d/browser-summary.json), [jeden účastník](evidence/integrated-20261010-d/browser-1-low.jpg), [třicet účastníků](evidence/integrated-20261010-d/browser-30-low.jpg), [stovka na nádvoří](evidence/integrated-20261010-d/browser-100-crowd-low.jpg).

**GPU test stovky rozptýlených po areálu se neprovedl.** Během přípravného reálného průchodu byla nalezena neprůchodná návaznost vestibulu B6 na schodiště; pokračovalo se její opravou. Samostatné fyzikální testy v D ji nezachytily, protože některé začínaly teleportováním do prostoru. Neexistuje žádný platný D FPS výsledek pro průchod celým areálem, noční režim, hustou travní plochu, scénu s cestujícími nebo rovnoměrně rozptýlenou stovku.

Vyšší kvalita má jen [neplatný přechodový vzorek](evidence/integrated-20261010-d/browser-transition-91to100-high.json): 43,2 FPS, p95 30,8 ms, p99 43,3 ms, 1920 × 1080 backbuffer, 590 trsů a jeden autobus. Během něj se změnila kohorta; minimální počet avatarů byl 91, konečný součet LOD 100. Je zachován jako `invalidPopulationTransition` a **nepoužívá se pro potvrzení výkonu třiceti ani sta hráčů nebo kvality high**.

## Skutečné síťové kohorty

Všechny relace byly autentizované dočasným tokenem v jediném společném světě `JODcg33dC`. Vstupy měly protocol 2, souvislou `seq`, přibližně 60 příkazů/s ve 30 batchech/s. Serverový tick byl porovnán se skutečným uplynulým časem. Hostitelské `/api/health` neposkytovalo přítomnost; počty byly kontrolované přes autentizované motion řádky.

Boty střídaly **šest úplných fiktivních předloh**, včetně rozdílných barev kůže, vlasů, oblečení, brýlí a vousů. Nešlo o sto kopií `DEFAULT_AVATAR`. Současně se neměřilo sto unikátních nastavení barev; opakování šesti vzhledů je stále příznivé pro instancing. Zvláštní vstupní wrapper má SHA `ec5230a2ab16fc2929d59dae0973283ed15a3a2e6acbcf17d1f75f82f1eb94e4`, [přesný skript](evidence/integrated-20261010-d/performance-diverse.mjs). Vydané UUID a jejich skutečné profily jsou v souborech `*.profiles.json`. Runtime D zůstal beze změn.

| Varianta | Doba | Pohybující se boty | Tick Hz | CPU serveru / jedno jádro | Ack p95 | Resync přijaté boty |
|---|---:|---:|---:|---:|---:|---:|
| 100 headless | 30 s | 100 / 100 | 59,965 | 76,96 % | 155,69 ms | 0 |
| 29 botů + browser, celkem 30 | 120 s | 29 / 29 | 60,004 | 24,18 % | 52,91 ms | 0 |
| 99 botů + browser, celkem 100 na nádvoří | 120 s | 99 / 99 | 60,006 | 58,24 % | 88,81 ms | 0 |
| 99 botů + browser, celkem 100 rozptýlených | 120 s po 50 s přesunu | **79 / 99** | 59,953 | 61,60 % | 109,44 ms | **297** |

Poslední varianta udržela všech sto identit a motion řádků; výsledná obálka botů byla **x 24,10–255,80 m, z −23,27–30,00 m**. Dvacet botů při jednoduchém směrování uvízlo. Nelze ji popsat jako sto současně pohyblivých účastníků. Zaznamenala maximální interval motion 222,22 ms, event-loop maximum 182,71 ms a 297 autoritativních resynchronizačních paketů na 99 měřených botů. To dokládá prodlevy a resynchronizace; **stabilita stovky za všech okolností není prokázaná**. Během tohoto okna probíhal skutečný browserový průchod, nikoli build/test. Z tohoto měření není izolovaná příčina jednotlivých dlouhých prodlev.

Headless stovka přijala celkem **20,034 MB/s** binárních aplikačních zpráv. Jeden klient přijímal přibližně 200 kB/s. Jde o skutečně měřené Colyseus payloady bez WS/TCP/IP/TLS režie; fanout celých seznamů všem účastníkům roste téměř kvadraticky. Při variantách s browserem se součet payloadu vztahuje pouze na 29 či 99 měřených botů; browserové bajty se do něj nedopočítávají jako naměřené.

[Raw ticky, ACK, pozice, profily a CPU](evidence/integrated-20261010-d/summary.json). CPU znamená spotřebu procesu serveru vůči jednomu jádru, nikoli zatížení celého počítače. Loopback bez emulace latence/ztrát neověřuje veřejný internet. Po skončení každé kohorty se všichni její boty odpojili; browser hlavního agenta zůstal samostatným účastníkem.

## Co tento audit uzavírá

Výkonový cíl třiceti skutečně připojených a pohybujících se účastníků **pro zaznamenaný low výhled snapshotu D prošel**. Zůstávají otevřené ostatní pohledy a kvality, rozptýlená GPU stovka, příčiny serverových resynchronizací a funkční oprava návaznosti B6. Novější integrační snapshot musí dostat vlastní manifest a alespoň nové ověření primárního třicetihráčového cíle.
