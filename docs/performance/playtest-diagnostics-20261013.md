# Nálezy z uživatelského hraní 13. 10. 2026

Analyzovaná relace: **19:43:35–19:50:32 Europe/Prague**, `c0c87474-6d36-487d-b9c7-a180bb43c5fd`. Záznam dokládá opakované sekundové záseky renderu, soustavné propady výkonu a skokové síťové opravy pohybu. Zároveň odhalil konkrétní chyby nové diagnostiky. Níže jsou všechny doložené nálezy tohoto auditu, nikoli tvrzení, že log zachytil každou možnou vizuální či kolizní vadu.

## Důkazy a podmínky

- Vstupní JSONL zachován v `.cache/playtest-diagnostics-20261013/session.jsonl`, SHA256 `30f15b76b579f872d127c61bbdd4821e8779a6082fffb18001878391d2215f6d`. Strojový základní report je `report.json`, nezávislý přepočet `checks.json` ve stejném adresáři.
- **2 741 událostí, 70 dávek, 412 frame oken, 17 438 intervalů**, žádná chybějící sekvence, duplicitní dávka ani recording-gap. Relace končí pagehide a session-end. Jeden počáteční transition interval je z foreground statistik vyloučen.
- Nejnovější relace `75148be8…` zaznamenává pouze menu a **0 herních snímků**; není to testovaná hra. Starší `4acb2ed6…` je kontrola agenta z 19:17–19:21, rovněž vyloučená.
- Edge155, Windows, NVIDIA GeForce **GTX1060 / ANGLE D3D11 / WebGL2**, skutečné4× MSAA; CSS **2040×986**, DPR1,25. Low render **1569×758**, medium/high **2040×986**. Přesná verze ovladače nezjištěná.
- Celou dobu multiplayer, **jeden avatar**, venkovní zóna, reálný večerní/noční čas bez náhledu osvětlení. Od19:45:24 jízda autem až do konce. HUD běžel, krátce se otevíralo nastavení a editor avatara.
- Uložené ruční low, změna na medium19:46:03.780 a high19:47:43.153. Cíl60FPS; kvalita byla ruční, její nepřizpůsobování není chyba automatiky. Pět quality událostí zahrnuje také inicializaci a revizi detekované obnovovací frekvence, nejde o pět ručních změn.
- Vývojový server5173, `development:true`, `clientBuildSnapshotId:null`. HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`, jeden zaznamenaný source hash `a8d6eafc9657325442bfe2bb4c686b4a1385109c030e3e33367c6cb2f14fa305`, dirty. Nezávislé porovnání476 souborů s předaným checkpointem `d3ee76c2eb756a66f992fcd3e1f164c2f48a738932ef0f9603c11671e12a956a` nezjistilo změnu kódu/testů. Oba otisky používají jiný rozsah a algoritmus; nejsou zaměnitelné. Binární assety nejsou v průběžném hashování.
- Nejde o produkční srovnávací benchmark: mění se trasa, rozlišení, kvalita, stav cache a interakce. Výsledek nelze přímo porovnat s předchozí QA na1280×720 nebo vykládat jako high rychlejší než medium.

## 1. Soustavně nevyhovující snímkování — vysoká priorita

Z17 437 foreground intervalů /403,134s vychází **43,25FPS**, medián17,4ms, **p9541,7ms / p9989,8ms**, nejhorší interval2713,8ms. **507 intervalů ≥50ms**,150 ≥100ms,40 ≥250ms, **12 ≥1s**. Dvanáct nejdelších intervalů samo zabralo19,862s. Není to pouze jeden studený start.

| Úsek Praha | Kontext | FPS | p95 / p99 |
|---|---|---:|---:|
| přibližně19:47:04–19:47:34 | medium, jízda | 25,45 | 62,8 /177,2ms |
| přibližně19:48:34–19:49:04 | high, jízda | 33,09 | 49,3 /76,5ms |
| přibližně19:50:04–19:50:32 | high, konec zahrnuje editor | 27,18 | 54,3 /140,7ms |

Měřená CPU práce má průměr20,74ms, z toho souhrnný `render`18,05ms, přibližně **87%**. GPU má7 721 nových asynchronních vzorků s průměrem11,81ms a p9523,02ms. To lokalizuje velkou část nákladů do renderovacího volání na hlavním vlákně, ale samo nerozliší CPU výpočty, synchronizaci ovladače a GPU čekání.

U x≈−5,z≈43 vzorek#1584 dosáhl **1 841 872 aktivních trojúhelníků**, přibližně700–773 draw calls a opakovaně18–26FPS. Nejvyšší vzorkovaný počet draw calls je **1 007** (#2602, kontext19:50:05.382,x−127,z−15,6). Jsou to vzorkovaná maxima, ne garantované maximum celé relace.

## 2. Běžné přepínače způsobují sekundová zamrznutí — vysoká priorita

| Akce / čas Praha | Následující interval | Předchozí CPU render | Události seq |
|---|---:|---:|---|
| Svítilna ON19:43:58.977 | 1597,8ms | 1569,5ms | #312 /#314 |
| Svítilna OFF19:45:11.100 | 1761,7ms | 1754,7ms | #638 /#640 |
| Další zásek19:45:13–14 | 1262,4ms | 1255,7ms | #652 |
| Interakce/nástup do auta19:45:23.118 | 1504,2ms | 1491,5ms | #671 /#674 |
| Low→medium19:46:03.780 | **2713,8ms** | 2168,8ms | #842 /#844 |

U low→medium měl předchozí snímek2671,2ms CPU práce, včetně459,4ms cinematic podfáze. [Cinematic configure](../../client/cinematic.ts#L462) při změně mění stínovou mapu a vytváří/připravuje postprocess pipeline. Naměřená souvislost je silná; konkrétní materiál/shader/kompilace uvnitř `scene.render()` zatím identifikovány nejsou. Zahřívání shaderů a synchronní příprava prostředků jsou hypotézy k cílenému profilu, nikoli hotová diagnóza konkrétní kompilace.

## 3. Další sekundové záseky při průjezdu světem — vysoká priorita

| Čas Praha | Interval | Předchozí render | Přibližná poloha x,z | Seq |
|---|---:|---:|---|---|
| 19:46:22–23 | 1005,5ms | 990,1ms | −98,−100 | #1009 |
| 19:46:28–30 | 1755,0ms | 1741,8ms | −131,−79 | #1063 |
| 19:46:34–36 | 1830,7ms | 1817,1ms | −129,−59 | #1103 |
| 19:46:55–58 | **2570,3ms** | 2546,4ms | −99,8,5 | #1288 |
| 19:46:58–19:47:00 | 1370,4ms | 1242,2ms | −85,12,5 | #1307 |

Tyto záseky vznikají během jízdy, nikoli pouze při načítání menu. LoAF současně ukazuje dlouhé Babylon render-loop callbacky. Kamera/poloha jsou vzorkovaný kontext, ne přesný záznam každého kontaktu či celého render průchodu.

## 4. Pohyb se opakovaně skokově opravuje — vysoká priorita

- Poslední dostupný kontext: **2 227 oprav z8 133 authority paketů**; malé opravy nemají každá vlastní událost. Výslovně zapsáno **420 tvrdých korekcí ≥0,35m** a **174 resynchronizací**.
- Tvrdé korekce:7 pěšky,1 při nastupování a **412 za jízdy**. Za jízdy medián0,465m,p950,788m,max1,195m. [Game.reconcile](../../client/game.ts#L1031) pro tyto opravy nulově nastavuje vyhlazovací posun; jde tedy o skokové opravy předpovězené polohy.
- V **19:45:04.481** (#580) došlo pěšky k nevyžádané opravě **2,120m**, po třech přetečeních fronty. Předchozí#574 měl1,562m. Oba přehrávají180 vstupů, což je strop historie, nominálně3s.
- Největší jednotlivý zapsaný posun2,965m (#672) **nepočítáme jako chybu teleportu**:57ms před ním proběhla explicitní interakce/nástup do auta a další kontext potvrzuje vozidlo. Jeho souběžný renderový zásek je uveden samostatně.
- Přesnou část viny rendereru, serveru, transportní fronty a fyzikální predikce tyto logy nerozdělí. Chybí RTT, server tick/queue telemetry a důvody jednotlivých resynců. Není podložené označit všech594 událostí za výpadky internetu.

## 5. Přetékají vstupy a záseky mohou rušit řízení — vysoká priorita

**8 přetečení po65 příkazech** v19:45:01.893,19:45:02.964,19:45:04.198,19:47:18.161,19:47:19.847,19:48:44.809,19:50:11.800 a19:50:16.002. [UI](../../client/ui.tsx#L453) při každém zahodí celou čekající frontu a vyžádá resync: nejméně **520 neodeslaných vstupů** zmizelo.

V kontextu z19:45:03.206 byl poslední motion paket starý **2445ms**, pending inputs147; následně historie dosahuje180. Bez serverového časování nelze tuto prodlevu vydávat za síťové RTT.

Kód [Game.frame](../../client/game.ts#L1765) při intervalu>250ms nuluje akumulátor, volá `blur()`/`clearHeldInput()` a v multiplayeru žádá resync. Všech intervalů>250ms bylo41, z toho40 foreground a1 počáteční transition. Renderový zásek tedy může zasáhnout i držený pohyb/řízení. Log nezaznamenává kompletní stav fyzicky držených kláves, takže netvrdíme, že se hráč ve všech41 případech právě snažil jet.

## 6. Start zatěžuje síť i hlavní vlákno — střední priorita

- `game-ready` v19:43:49.608, **15,1125s od počátku stránky**. React `ready:true` událost se projeví až19:43:53.551. Záznam neobsahuje celý start v globálních herních FPS.
- LoAF#196 začíná19:43:38.357 a trvá **3312ms**, UI callback3284,4ms. Kód synchronně konstruuje hru v [ui.tsx](../../client/ui.tsx#L431).
- LoAF#283 začíná+13,6463s a trvá2790,3ms, zahrnuje glTF callback1467,3ms a engine/render callback1322,4ms. Longtasky#252/#253 jsou překryvné důkazy téže práce, nepřičítají se jako další zamrznutí. Observer `atMs` je čas doručení; skutečný začátek je `data.startTime`.
- Celá relace: **759 načtených zdrojů /297 044 253 transferBytes (283,3MiB)**. Resource-window již zahrnuje i podrobně zapsané resource-timing; hodnoty se nesmějí sčítat dvakrát.
- Vegetační `far.glb`:76 500 488B /2,020s. Dev modul `student-garments.json`:53 433 528B /1,655s; `skinned-character-geometry.json`:22 786 516B. To jsou přenosy vývojového serveru, nikoli produkční velikosti bundlu.

## 7. Vegetace přidává průběžnou CPU zátěž — střední priorita

V19:50:21–24, high, kolem x−110,z−15, vegetace zabírá v několika oknech průměrně **6,27–6,49ms/snímek**, vedle20–24ms renderu. Počet grass triangles roste123k→195k, příprava trávy stále aktivní, pending tiles33→14. Nejvyšší zaznamenané fázové maximum je10,4ms (#2671). Tato práce ukusuje významnou část16,7ms rozpočtu pro60FPS, ale **není doloženou příčinou sekundových zamrznutí**, v nichž dominuje render.

## 8. Editor avatara přidává další propad — střední priorita

Panel otevřen19:50:26.296 (#2676). Následující okna mají **10,53 /8,34 /14,19FPS** (#2683/#2707/#2729), následně návrat přibližně33FPS. LoAF425,6ms v19:50:27.057 obsahuje fileTools.loadHandler356,6ms; další callback editoru101,7ms a scény193,5ms. [AvatarEditor](../../client/avatar-editor.tsx#L154) při otevření vytváří nový3D náhled, zatímco svět dál renderuje. Záznam dokládá dodatečnou zátěž otevření/přípravy náhledu, nikoli únik paměti.

## Chyby a mezery nové diagnostiky

Tyto nálezy jsou chyby měření/reportování, nesmějí se zaměňovat s tím, co uživatel viděl ve hře:

1. **Nesprávný stav připojení:** všech412 kontextů uvádí `connecting`, ačkoli network-connected#149 nastal už19:43:37.529. [Welcome callback](../../client/ui.tsx#L531) zapisuje dataset pouze tehdy, když už existuje Game; v této relaci připojení předběhlo jeho vytvoření. Pozdější vytvoření stav nedoplní.
2. **Nepravdivé nulové posuny resynců:** všech174 resync eventů má correctionMetres0. [Reconcile](../../client/game.ts#L982) před restore jako starou pozici vybírá už autoritativní pozici. Po restore porovná tutéž polohu se sebou. Skutečné velikosti těchto174 posunů nelze zpětně dopočítat.
3. **Chybějící poloha interakce:**#671 nemá position. [Interakce](../../client/game.ts#L1160) předává přímo Rapier Vector3; sanitizace přijímá čisté objekty, ne instanci této třídy. Frame kontext polohu obsahuje, ale je vzorkovaný.
4. **Souhrnný report potíže podhodnocuje:** `errors:0` nezahrnuje8 network-input-overflow. Jsou v lifecycle JSON, které textový formatter nevypisuje. Výchozí „poslední relace“ navíc po reloadu vybírá menu75148… místo dokončené hry. Pro audit bylo nutné vybrat relaci podle obsahu a času.
5. **Chybějí důvody a serverové metriky:** resyncReason/ack/frontiers/RTT, délka serverové fronty a tick/drop časy se neukládají. Server stderr je prázdný, stdout obsahuje starty; poslední restart19:01:36 předcházel testu. Z prázdného stderr nelze vyvodit zdravé serverové časování.
6. **Render nemá dost jemné členění pro určení kořenové příčiny:** `scene.render()` je souhrnný blok; detailní BenchmarkRenderProfile se spouští jen manuálním benchmarkem. Není jisté, který materiál, stínový průchod, shader či upload způsobil konkrétní zásek.
7. **Část detailů je záměrně vzorkovaná/agregovaná:** po první minutě264 resource /57 517 397B, ale pouze1 podrobný resource-timing (počasí). Rychlé úspěšné zdroje nemají URL v logu. `frame-hitch` má394 událostí kvůli limitu4/s, zatímco raw intervalů≥50ms je507. Celkové intervaly se neztratily; všechny pomalé snímky nemají stejně podrobný kontext.
8. **Vlastní režie zapisovače a paměť se neměří:** cpuMs vzniká předrecordFrame; dvě jednotlivě připsané LoAF aktivity zapisovače5,3/6,2ms nedokládají jeho celkovou režii ani hlavní příčinu propadů. Chybí heap/VRAM, přesný GPU ovladač a video/replay. Únik paměti nelze potvrdit ani vyloučit.

## Co se nepotvrdilo a pořadí navazujících oprav

V této relaci nejsou zachycené JS výjimky, odmítnuté promises, technické konzolové chyby, HTTP≥400, ztráta WebGL kontextu ani render/asset chyby. Není zapsané odpojení, reconnect nebo respawn. Ve vzorkovaných souřadnicích a rychlostech nejsou nečíselné hodnoty; to nevylučuje krátkou kolizní nebo vizuální vadu mezi vzorky. Průchody zdmi, propadání terénem, kvalitu animací či modelů nelze tímto záznamem úplně posoudit.

Nejvyšší prioritu má společně **renderové zamrzání a dopad na ovládání/predikci**. Nejprve opravit doložené chyby diagnostiky a přidat příčiny resynců/dílčí render timing; pak reprodukovat konkrétní svítilnu, low→medium a uvedené průjezdy v produkčním snapshotu se stejným rozlišením. Následuje odstranění synchronní přípravy a přebytečné práce doložených profilováním, kontrola vstupní fronty a síťových oprav při plynulém i zadrhávajícím renderu. Vegetace, studený start a editor tvoří další samostatné měřitelné úlohy. V tomto auditu se runtime **neměnil** a žádná z těchto oprav ještě není prohlášena za hotovou.
