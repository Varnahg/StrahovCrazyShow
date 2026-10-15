# Uživatelský test 15. 10. 2026 — main4188

Uživatel potvrzuje výrazné zlepšení a **žádné červené záblesky v této relaci**. Přetrvávají záseky a náhodné propady FPS hlavně v noci se svítilnou, občasné posuny zpět a velké korekce při současném propadu FPS. Výsledek zatím není plynulý ani bez chyb. Toto je uživatelské pozorování; světelný režim ani stav svítilny nejsou v nynější telemetrii označené.

## Identita a úplnost

- Frozen preview4188/API2583, runtime commit `e1b03fe8a6c14f25c14bb6173ce90c29050ed9ea`; metadata startu v main `3b35904`.
- Build snapshot `4dcb3f6fc34a560b455c0ee5c4f02a014105142d4bcce392f2628bca0e012ca0`; source hash `cd254d0479a165117efb6c9b7846b534a1596585b02df52764a39ca4ecc16255`. Obě identity jsou po celé relaci stejné.
- Herní relace `5c950ac1-f0e9-4fc4-82e3-e7d47986404e`: archiv **7 811 255 bytes**, **420 dávek / 4126 záznamů**, seq0–4125 bez mezer. SHA-256 `6c540c3700bbd1c26a9cf0455275916a085fbbc3c4fbaa403c129c8f8954b0c4`.
- Hraní přibližně **22:56:36,871–23:09:59,356 Europe/Prague**, 13 min 22 s. Jeden multiplayerový game-ready, explicitní opuštění a game-dispose. Po celou hru visible/focused. Stránka následně zůstala otevřená v menu, proto chybí session-end; nejde samo o sobě o ztrátu konce hraní.
- Menu-only relace `9d4ae317…` a syntetický collector smoke `d6164e33…` jsou vyloučené. Raw logy jsou neměnně uložené v lokálním `.cache/playtest-analysis-20261015/raw/` ve vlastní key17 worktree; do Gitu se nepřidává celá soukromá relace.
- Primární podklad: skutečná produkční hra uživatele, nikoli NullEngine. CSS i interní rozlišení **2040×986**, scaling1, target60. Host má GTX1060, Intel UHD630 a DisplayLink, ale aktuálně zvolený GPU renderer prohlížeč do logu neuložil. Nelze poctivě připsat měření konkrétnímu adaptéru.

## Přímý výpočet výkonu

[summary.json](summary.json) vzniká reprodukovatelně přes [analyze.mjs](analyze.mjs) z uvedeného archivu. Skript ověřuje SHA a křížově porovnává raw intervaly s publikovanou čtečkou; nezávislý druhý přepočet souhlasí. Percentily jsou nearest-rank nad všemi dodanými intervaly, nikoli průměr percentilů oken.

| Rozsah | Snímků | Průměr FPS | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Foreground | 41 114 | 51,24 | 34,3 ms | 77,5 ms | 3509 ms |
| B6 podle vzorkovaného kontextu | 6939 | 40,28 | 54,1 ms | 93,2 ms | 2987,5 ms |
| Venku podle vzorkovaného kontextu | 34 175 | 54,23 | 28,7 ms | 65,1 ms | 3509 ms |

Foreground obsahuje **898 intervalů ≥50 ms, 253 ≥100 ms, 32 ≥500 ms a22 ≥1000 ms**. První transition interval992,7ms je vyloučen. Počet2352 v poli reportu `counts.hitches` sčítá překrývající se frame-hitch/LongTask/LoAF důkazy, nikoli samostatná zamrznutí; zde se nepoužívá.

Vzorkovaný kontext platí pro celé okno, takže přiřazení k patru či kvalitě není přesné na každém snímku. Trasy, kvalita i cache se měnily: nejde o kontrolovaný A/B benchmark ani důkaz zlepšení konkrétní optimalizací.

## Doložené problémy a jejich meze

### 1. Dlouhé blokace vykreslování — KEY-3 / KEY-5

22 sekundových intervalů trvalo dohromady40 736ms. Jejich předcházející callbacky mají40 350,9ms (**99,05 %**), z toho38 178,9ms fáze `render` a2135ms `environment`. Celkově tvoří render89,37 % měřené doby callbacků. Měření obaluje `scene.render()` a může obsahovat JS, driver/GPU čekání i odplánování; není to profil čistě spotřebovaného CPU.

Nejhorší interval #2918 trvá3,509s (+603,713 až607,222s od timeOrigin). Předchozí callback3,4717s má render2,9311s a environment539,9ms. Další má3,3666s, z toho předchozí render3,3529s. LoAF/LongTask tyto blokace nezávisle potvrzují, ukazují však na render loop, nikoli konkrétní shader či mesh.

Uživatel situaci lokalizuje hlavně do noci se svítilnou. To určuje hlavní směr dalšího výzkumu světla/material/shader lifecycle; samotný log neoznačuje každé zapnutí svítilny a nemůže dokázat, že všech22 blokací má stejnou příčinu.

### 2. B6 není plynulý ani mimo přechod — KEY-16

Zachycen je průchod patry0–5, sestup a další výstup. B6 má5 intervalů nad1s. Čtyři z nich mezi+417,566 až430,857s vznikly v patře3 u téměř stejné polohy `(6.823,11.619,-30.194)`. Problém tedy není omezený na první vstup nebo samotné překročení patra. Není to důkaz, že dřívější úzký pivot fix selhal; jiné renderové náklady zůstávají.

### 3. Velké opravy polohy po blokaci — KEY-6 / KEY-7

183 zaznamenaných korekcí:117 resync (90 client-request,25 server-clock-drop,1 join,1 explicitní respawn) a66 běžných tvrdých korekcí. Čtyři běžné skoky patří výslovnému nastoupení/vystoupení. Po vyloučení respawnu a změny režimu zůstává **115 korekcí ≥0,35m**,61 ≥1m,14 ≥5m a5 ≥10m. Poslední kontext hlásí456 oprav včetně malých, které se jako event nefiltrovaně neukládají.

Největší oprava **21,087m v autě v23:06:38,910 Praha** následovala po1,787s LongTask, zastaralé autoritě a rebase časové osy; potom následovaly opravy2,808m a2,063m. Jiný incident po1,620s blokaci zahrnoval13,908m +3,142m server-clock-drop opravy a1,522m client-request. Při jedné obnově klient zpracoval šest starších server-clock-drop bariér a client-request během14ms, přestože autoritativní časy pokrývaly2,6s.

Wait události:83 stale-authority,7 prediction-budget, **0 latency-budget**. Jsou throttlované, takže90 záznamů není90 samostatných epizod ani jejich délka.75 z90 následovalo nejvýše100ms po konci LongTask. Žádný input overflow, send error ani probe timeout. Z400 sond bylo41 kontaminovaných blokací klienta; raw max3535,7ms má3532ms LongTask překryv. Není to důkaz3,5s síťové latence.

Nekontaminovaný nadlimitní RTT264,8ms zůstal pending a timeline dál používala26,2ms. To podporuje účinnost KEY-7A. Neřeší to ostatní skoky. Jediný výslovný R v23:03:53 měl odpověď za24ms; žádný nevyžádaný respawn:true není doložen. Resync není automaticky návrat na spawn.

### 4. Serverové pauzy jsou také skutečné

745 srovnatelných intervalů potvrzuje **+1983,333ms zahozeného simulačního času** a33 870 callbacků. Lifetime `cpuMaxMs` během testu vzrostlo46,63→117,663→579,544ms, takže poslední peak vznikl po začátku této relace. Čas jeho pozorování klientem není přesný čas serverového callbacku. Přímo vzorkované maximum vnitřního času je8,223ms, což krátké pauzy mezi vzorky nevylučuje. `cpuMs` je wall time uvnitř callbacku; bez profilu neodliší fyziku, GC a odplánování.

### 5. Start a odchod do menu

Mode-change→game-ready trvá **10,669s**. Startup má2,953s LongTask a první render1,7165s. Stažení vegetačního far.glb má76,5MB/1,823s; avatar JS4,71MB přenos/15,03MB decoded. Je to důkaz velikosti a doby načtení, nikoli automaticky dominantní příčina startup CPU (KEY-8).

Při odchodu do menu vznikl **5,640s LongTask**, LoAF5,6415s, JS5,6388s a forced layout jen4,3ms. Začíná s událostí leave a zahrnuje game-dispose. Již není v herních frame windows. Chybí profil jednotlivých teardown kroků, proto jej nelze celý připsat konkrétnímu dispose modulu nebo editoru.

## Co se zlepšilo a co nelze uzavřít

- Uživatel výslovně potvrdil, že **červené záblesky nebyly**, a výrazné celkové zlepšení. KEY-13 má nový pozitivní uživatelský důkaz; nejde o obrazový záznam ani záruku nereprodukovatelnosti ve všech scénách.
- Základní automatický sběr KEY-19 funguje a archiv nemá seq mezery. Chybí však flashlight/lighting/camera stav, vnitřní render fáze, zvolený GPU a označení editoru. KEY-2 zůstává otevřený.
- Fresh GPU query:19 127 vzorků,46,52 % foreground snímků; mean10,865ms,p95 18,82ms,p99 39,92ms,max1102,45ms. `null` není0; asynchronní vzorek se nesmí bez dalšího přiřadit sousednímu frame intervalu.
- Jediná resource chyba je **favicon.ico404**. Není to pád hry ani selhání herní textury. Žádné zaznamenané JS/context chyby; vizuální vady to samo nevylučuje.
- Recorder self-time mean0,0349ms/frame, max50,9ms; tento scope nezahrnuje veškerý transport/browser overhead a nedokazuje nulovou režii.
- Report `changes:[]` není důkaz nezměněných settings: context ukazuje osm stavů kvality. `acceptedForPrediction` v probe znamená filtr, nikoli výběr timeline. `network-left/identity-change` je počáteční nastavení identity, nikoli skutečné odpojení; nynější report může tento marker interpretovat chybně.
- Sólo/rejoin ani konkrétní editor přejímka v tomto archivu doložené nejsou. Žádné další issue se neuzavírá podle absence eventů.

## Rozhodnutí pro další práci

Priorita je **noc/svítilna a dlouhé render blokace**, souběžně přesně reprodukovat chování síťové obnovy po takové blokaci. Rozumné varianty k dalšímu výzkumu jsou stabilita světel/material variant, plánování shader/asset přípravy, odložení prokazatelně blokujících operací a bezpečné zpracování historických authority bariér. V této analýze nebyla žádná z nich implementována ani prohlášena za nejlepší bez hlubšího profilu. Pouhé zvýšení timeoutů nebo replay budgetu nemá doloženou bezpečnost či účinnost.

Původní log, frozen preview a runtime kód zůstaly nezměněné. Main/Linear aktualizace tohoto kroku obsahuje pouze důkazy a stav přejímky.
