# Optimalizace Strahov Crazy Show pro 60 FPS a 100 hráčů

Studie k 10. říjnu 2026. Cíl podle zadání: běžné notebooky, plynulých 60 FPS v prohlížeči, až 100 hráčů současně, příjemný běh, interakce a řízení auta inspirované GTA V a vizuálně soudržné prostředí s atmosférou inspirovanou Hogwarts Legacy.

**Doporučuji zachovat Babylon.js, Rapier a Colyseus a přestavět jejich propojení.** Největší zbývající přínos přinese sjednocení vstupů a simulačního času, správná síťová predikce a oddělení fyzikálního a zobrazovaného stavu. Auto potřebuje vlastní model vozidla. Souběžně rozpracované úpravy kamery a instancování postav je třeba ověřit proti níže zachycené baseline. Vyšší kvalitu obrazu bych získával zejména světlem, tvary, animací a výtvarnou soudržností.

Cíl 100 hráčů je rozumný směr dalšího prototypování. Dosavadní měření jej neprokazují pro celou hru. Zvlášť je nutné splnit **100 lidí rozptýlených po areálu** a **100 lidí současně na jednom nádvoří**. Druhý případ nelze vyřešit pouze skrýváním vzdálených entit.

## Rozsah a způsob čtení výsledků

Studie rozlišuje čtyři druhy tvrzení:

- **Nález v kódu:** přímo ověřené chování konkrétního snapshotu.
- **Měření:** uvedený scénář na konkrétním zařízení; přenositelnost je omezená.
- **Výpočet:** odvození z kódu nebo naměřených dat, nikoliv další benchmark.
- **Návrhový cíl:** rozpočet nebo počáteční nastavení, které musí projít měřením a hraním.

Během auditu probíhaly další změny sdíleného projektu. Hlavní analýza se proto vztahuje k archivované kopii zdrojů; řádky uvedené níže patří této kopii, nikoliv nutně nejnovějším souborům v pracovním adresáři. Archiv, hashe a reprodukce jsou v [podkladech měření](evidence/README.md). Audit sám neměnil implementaci hry.

GTA V zde označuje inspirační směr ovládání a chování vozidel. Navržené rovnice ani hodnoty nejsou vydávány za interní implementaci Rockstaru. Hogwarts Legacy je reference atmosféry a výtvarného vedení; jeho samotný renderer není úspornou šablonou pro běžný notebook. Avalanche popisuje náročné efekty a využití výkonu PS5, tedy jiný výkonový profil. [Vyjádření vývojářů Avalanche](https://blog.playstation.com/2023/02/09/ps5-creators-how-hogwarts-legacy-harnesses-ps5s-power/).

## Souběžné změny po pořízení měřicího snapshotu

Při závěrečném porovnání už pracovní kód obsahoval následující změny provedené jinou prací. **Historická měření níže nepopisují výkon této novější verze.** Uvedené nálezy slouží jako zdůvodnění a baseline; hotové části znovu neimplementovat, ale prověřit jejich výsledné chování. Seznam hashů je v [záznamu souběžných změn](evidence/concurrent-changes.json).

| Oblast | Co novější pracovní kód už obsahuje | Co zbývá ověřit nebo dokončit |
|---|---|---|
| Kamera | Rapier raycast místo pickWithRay po renderových trojúhelnících | Nový CPU profil, rohy near plane, objemový sweep a camera feel |
| Avatary | Sdílená primitiva a createInstance | Draw calls při různých barvách a doplňcích, animace a 100členný dav; 934 už nelze připsat nové verzi |
| Auto | Ukládání parkovací polohy a yaw na serveru, zpráva car | Trvalá VehicleEntity, jízdní dynamika a správná predikce |
| Kolize auta | Test výsledné rotace přes intersectionWithShape | Regrese u zdí; test cílové polohy není souvislý rotační sweep |
| Vystupování | Několik kandidátů a test kapsle | Výška terénu, svahy, výstup za jízdy a síťové přechody |
| Svět | Další kolize stromů, lamp, laviček a zaparkovaného auta | Shoda klient/server a nové náklady query/step |
| Telemetrie | RawFrameMs a základní desetisekundový benchmark | Správné draw calls, GPU čas, delší a produkční měření |
| Importy a assety | Přímé Babylon importy a načítání modelu auta | Nová velikost produkčního přenosu a doba načítání |
| Sestavení | Explicitní typy middleware req/res/next | Úspěšný plný build nové verze; historický TS7006 není tvrzení o aktuálním výsledku |
| Pohyb | Rozpracovaný sprint | Kompletní propojení vstupu, sanitizace a serveru; automaticky nepovažovat za hotový nový controller |

Při této kontrole nadále zůstával původní serverový jeden-krok-na-callback, poslední vstup v mapě, korekce polohy bez replaye a úplné motion broadcasty. Tyto systémové priority nejsou odstraněné uvedenými dílčími úpravami. Měřicí archiv má záměrně stabilní starší podobu; novou produkční baseline po dokončení paralelních úprav je nutné pořídit zvlášť.

## Jak je současný projekt postavený

| Vrstva | Současné řešení | Co je na něm užitečné |
|---|---|---|
| Aplikace | React 19, TypeScript, Vite | Přehledné oddělení menu a herní části; hra se načítá dynamickým importem |
| Obraz | Babylon.js 9.30, WebGL engine, procedurální primitiva, StandardMaterial | Sdílené materiály a slučování statiky už omezují počet volání |
| Fyzika | Rapier 0.21 WASM, vlastní Simulation a Actor | Stejný zdroj simulačních pravidel lze používat na klientu i serveru |
| Postava | Kinematická kapsle a character controller | Vhodný základ pro ovladatelnou pěší postavu |
| Auto | Tentýž Actor přepne kapsli na kvádr | Funkční demonstrace, ale nevhodný základ pro požadovanou jízdu |
| Síť | Colyseus core 0.18.9 a SDK 0.18.5 | Autoritativní server, přenos vstupů a sociální funkce již existují |
| Svět | OSM půdorysy, lokální souřadnice, ručně sestavený B6 | Malý a tematicky jasný areál; není nutná technologie pro obrovský kontinent |
| Obsluha | onStats do React stavu každých 200 ms | Už existuje jednoduchý přístup k základní telemetrii |

Herní smyčka, tvorba světa, avatarů, auta, kamery, světla i síťové korekce jsou soustředěné v `client/game.ts`. Rozdělení tohoto souboru má smysl podle odpovědností a měření; samotná změna struktury složek FPS nezvýší.

Zamýšlená frekvence fyziky je 30 Hz. Klient má akumulátor, server provádí jeden krok na callback intervalu. Server rozesílá 15krát za sekundu úplný seznam pohybových stavů. Lokální hráč simuluje pohyb předem, ale následné opravy nejsou plnohodnotné vyrovnání s historií vstupů.

## Co bylo skutečně ověřeno

### Stav testů a sestavení

Při prvním spuštění prošlo 8 z 9 testů; test podkladu selhal v bodě x=26, z=79. Následná souběžná úprava jinou prací rozdělila velké zemní kvádry na dlaždice. **Archivovaný snapshot už má všech 9 testů úspěšných.** Během průzkumu se změnil také výběr vzorků testu podkladu, který vynechává body těsně u zdí; výsledky proto nejsou čistým A/B stejného testu. Zlepšení bodu (26,79) nezávisle potvrzuje izolovaná diagnostika: stabilní výška kapsle přibližně 0,820 m oproti původnímu zaboření na přibližně 0,635 m.

Snapshotu stále neprochází `pnpm build`: TypeScript hlásí tři implicitní `any` pro `req/res/next` v `server/index.ts:67`. Samostatně spuštěný Vite bundler prošel, ale to není totéž jako úspěšný plný build. Vytvořil herní JS chunk přibližně 10,465 MB před přenosovou kompresí a 3,018 MB gzip; hlavní JS přibližně 580 kB / 186 kB gzip. Celý adresář assetů má přibližně 12,093 MB a 450 souborů. Součet emitovaných souborů není velikost skutečného prvního stažení. [Log diagnostického sestavení](evidence/vite-build.log).

Existující integrační test se dvěma klienty prošel. Ověřuje vybrané sociální funkce, pohyb a obnovení relace; neověřuje 100 klientů, vysokou latenci, plynulost nebo správnost replaye.

### Geometrie a vykreslování

Statický inventář zahrnuje 40 budov, 529 cestních prvků v datech, 1 258 kreslených segmentů cest, 716 boxů B6 a 2 953 okenních boxů. Samotný svět po sloučení má 109 meshů a přibližně 97 718 trojúhelníků. Z toho všechny mraky tvoří 24 576 trojúhelníků, část se ale vypíná podle počasí. To není počet viditelných trojúhelníků. [Inventář a metodika](evidence/render-inventory.json).

Browserové měření použilo samostatnou scénu Game bez React HUD, vývojový snapshot, WebGL 2 a Intel UHD 630 přes ANGLE. Procesor zařízení je Core i7-8750H; render nepoužíval přítomnou GTX 1060. Canvas měl CSS rozměr 1280 × 720, interní rozlišení 984 × 553, DPR zařízení 1,25. Panel prohlížeče byl menší než canvas, takže screenshot zachycuje jen část jeho plochy. Každý běh trval 12 sekund po zahřátí. Jde o krátkou diagnostiku, nikoliv certifikaci 720p nebo 1080p výkonu.

| Scénář | Průměr práce CPU na snímek | p95 CPU | p95 intervalu snímků | Důležitý závěr |
|---|---:|---:|---:|---|
| Jeden avatar, původní kamera | 4,12 ms | 6,20 ms | 16,90 ms | Jednoduchá scéna při tomto rozlišení může běžet kolem 60 FPS |
| Jeden avatar, vypnutý kamerový geometrický dotaz | 1,05 ms | 1,80 ms | 20,20 ms | Výrazná úspora CPU, ale tento běh nezlepšil p95 snímkových intervalů |
| Sto statických avatarů, původní kamera | 14,37 ms | 18,60 ms | 19,00 ms | Malá rezerva pro další herní práci i při průměru blízko 60 FPS |
| Sto statických avatarů, bez kamerového dotazu | 8,90 ms | 12,50 ms | 19,60 ms | Zbývá významná cena davu; nejde o benchmark nové Rapier kamery |

CPU měření zahrnuje předání renderovacích příkazů, nikoliv GPU čas. Scéna davu má jednu lokální fyzikální postavu a 99 syntetických renderových avatarů. Nepřenáší síť, neobsahuje plný HUD, chůzi davu ani nový podvozek auta. Nevydávat ji za test 100 připojených hráčů.

U jedné postavy zabíral kamerový `pickWithRay` průměrně 2,775 ms, p95 4,2 ms. Při 100 postavách průměrně 3,473 ms. Korektně instrumentovaný počet draw calls byl 43 pro samostatnou scénu a **934 pro dav**; viditelná geometrie davu byla přibližně 131 511 trojúhelníků. Dnešní jednoduché avatary tedy zatěžují hlavně mnoho samostatných objektů a vykreslovacích volání. [Browserové podklady](evidence/browser-measurements.json).

### Fyzika bez grafiky a sítě

Plný svět, 120 zahřívacích kroků a 600 měřených kroků, jednoduché chodící postavy, jeden průchod pro každý počet. Časy obsahují součet controllerů a kroku světa, měřený jako celek.

| Počet postav | Počet colliderů | Průměr | p95 | p99 |
|---:|---:|---:|---:|---:|
| 1 | 1 620 | 0,445 ms | 0,901 ms | 1,146 ms |
| 16 | 1 635 | 0,881 ms | 1,624 ms | 1,931 ms |
| 32 | 1 651 | 1,057 ms | 1,681 ms | 2,212 ms |
| 100 | 1 719 | 2,645 ms | 4,365 ms | 5,261 ms |

Výsledek podporuje pokračování s Rapierem. Neprokazuje výkon stovky fyzikálních aut, hustého kolizního shluku ani výsledného prohlížeče. Zvýšení frekvence na 60 Hz také znamená přibližně dvojnásobek počtu kroků za sekundu, nikoliv bezplatnou změnu. [Reprodukce fyziky](evidence/physics-diagnostics.json).

### Síť na samostatném místním serveru

Loopback test běžel proti snapshotu na portu 2568, Node 24.19.0, Windows. Jeden až šestnáct botů; šest sekund měření na fázi. Boti používající časovač nedosáhli zamýšlených 30 vstupů/s, ale přibližně 21–22/s.

| Klienti | Snapshoty za sekundu | p95 mezery mezi snapshoty | Příjem jednoho klienta | Součet příjmů klientů |
|---:|---:|---:|---:|---:|
| 1 | 14,989 | 93,56 ms | 1,546 kB/s | 1,546 kB/s |
| 8 | 15,142 | 93,70 ms | 11,539 kB/s | 92,310 kB/s |
| 16 | 14,995 | 94,33 ms | 22,490 kB/s | 359,836 kB/s |

Jde pouze o binární pohybové aplikační zprávy; bez transportní režie a bez profilů, chatu a vstupních handshake. Medián stáří nejnovějšího potvrzeného vstupu při přijetí snapshotu byl přibližně 93–94 ms. **Tato metrika není ping RTT ani odezva od stisku po zobrazený pixel.**

Samostatná instrumentace serverového časovače zjistila 21,69 callbacku/s při požadovaných 30. Protože každý callback posune fyziku právě o 1/30 s, odpovídá to v tomto běhu pouze 0,723 s simulace na jednu skutečnou sekundu. Konkrétní příčina rozvrhování OS/runtime nebyla určena; nelze ji zobecnit na všechny počítače. Architektura má nicméně zvládat nepravidelné buzení bez změny rychlosti světa. [Síťová metodika a výsledky](evidence/network-methodology.md).

## Nejdůležitější problémy v pořadí řešení

| Priorita | Problém a důkaz ve snapshotu | Navržený zásah |
|---|---|---|
| P0 | Diagonální vstup má na serveru jiný směr: game.ts:129, profile.ts:10 | Jedna kanonická normalizace před predikcí i odesláním |
| P0 | Serverová simulace je svázaná s počtem callbacků: server/index.ts:36 | Akumulátor skutečného času, sdílený pevný krok, omezené dohánění |
| P0 | ack se nepoužívá pro restore/replay: game.ts:105 | Historie vstupů, úplný obnovitelný stav a skutečné potvrzování kroků |
| P1 | Lokální 30Hz pohyb a vzdálené 15Hz auto: game.ts:129–138 | Oddělený renderový stav, časované snapshoty, interpolace polohy i rotace |
| P1 | Kamerový dotaz stojí jednotky ms: game.ts:137 | Oddělená jednoduchá kolizní geometrie a objemový sweep kamery |
| P1 | Auto protíná zdi při rotaci: simulation.ts:54–65 | Vlastní VehicleEntity a dynamická karoserie s raycast koly |
| P1 | Stovka avatarů vyvolala 934 draw calls: game.ts:88–96 | Spojený model postavy, sdílená paleta, LOD a dávkování davu |
| P1 | Všichni dostávají stav všech: server/index.ts:37 | Prostorový zájem, krátká ID, změnové zprávy, frekvence podle relevance |
| P1 | Server koliduje s ostatními hráči, predikční klient je nemá | Vybrat jednotnou politiku hráčských kolizí |
| P2 | Svět je slučovaný napříč celým areálem: game.ts:83 | Slučovat podle prostorové buňky a materiálu |
| P2 | HUD opakovaně přestavuje statickou mapu: ui.tsx:17–18,42 | Oddělit mapové pozadí, značky hráčů a pomalé panely |
| P2 | Telemetrie čte kumulovaný draw counter a ořezané dt | Veřejná instrumentace, neupravené časy a percentily |

P0 znamená opravu podkladu dalších změn; P1 přímý dopad na hlavní požadavek; P2 zlepšení navazujícího výkonu, údržby nebo prezentace.

### Proč je nesoulad vstupů skutečná chyba

Při W+D a natočení kamery o π/8 klient vytvoří vektor (1,30656; 0,541196) a následně jej normalizuje. Server nejprve každou osu ořízne do rozsahu −1 až 1 a teprve potom normalizuje. Výsledný směr se liší o 5,922°. Při dnešní rychlosti to na volné ploše odpovídá rozdílu asi 0,475 m za sekundu simulace. Zde i u odvození jízdního modelu jde o správně běžící simulační čas, nikoliv naměřenou dráhu za skutečnou sekundu serveru s nepravidelným timerem. Zvýšení serverové frekvence ani vyhlazování korekcí tuto příčinu neodstraní.

Správný kontrakt může přenášet normalizované lokální osy a yaw, nebo normalizovaný směr ve světě. Důležitá je identická transformace a kvantizace před oběma simulacemi. Regresní test musí projít celé kolečko vstup → síťový formát → sanitizace → serverový krok.

## Plynulost a latence jako samostatné cíle

FPS udává četnost vykreslení. Frame pacing popisuje pravidelnost snímků. Lokální odezva říká, jak rychle se projeví ovladač. Síťová odezva říká, jak starý je vzdálený svět a jak rychle server potvrdí akci. Kamera a animace pak mohou přidat další záměrné nebo nechtěné zpoždění.

Při 60 FPS trvá interval 16,67 ms. Vstup načtený těsně po 30Hz kroku může čekat skoro 33,3 ms na další simulaci. Běžná interpolace mezi dvěma posledními fyzikálními stavy přidává až jeden pevný krok stáří zobrazení. Je výborná pro pravidelnost, ale sama nemusí být nejlepší volbou pro nejrychlejší lokální odezvu.

Doporučené rozdělení:

| Systém | Počáteční návrh | Co rozhodne o finálním nastavení |
|---|---|---|
| Render a natočení kamery | 60 Hz podle displeje, bez síťového čekání | p95/p99 a odezva na skutečném notebooku |
| Lokální postava a řízené auto | Kandidát 60Hz společné simulace | Cena fyziky a přesnost predikce |
| Úsporná varianta fyziky | 30 Hz s interpolací, případně dvěma substeps vozidla | Porovnání citlivosti řízení a navýšeného vizuálního stáří |
| Přenos vstupů | Např. 30 paketů/s, obsahují 60Hz příkazy v dávkách | Srozumitelný kontrakt ticků a fronta, nikoliv přeposílání posledního stavu |
| Blízké snapshoty | Výchozí experiment 20 Hz | Jitter, rychlost entit a objem přenosu |
| Vzdálené snapshoty | 5–10 Hz podle důležitosti | Plynulé zobrazení a správné vstupy do zóny |
| UI seznamy a počasí | Událostně nebo pomalu | Jejich obsah se obvykle nemění s každým snímkem |

**Nevytvořit klientskou 60Hz a serverovou 30Hz integraci týchž pravidel bez jasné shody kroků.** Pro rychlý první prototyp je jednodušší shodných 60 Hz; varianta 30Hz serverového taktu s dvěma 60Hz kroky je možná, ale vyžaduje přesný formát vstupů. Dávkování 60 příkazů do 30 zpráv vyžaduje vlastní transportní adaptér. Při standardním kontraktu Colyseus prediction odpovídá vstup pevnému ticku; levnější variantou k ověření je 30Hz vstup a dvě společné fyzikální substeps. Renderová kvalita nesmí měnit autoritativní fyzikální pravidla.

Klientská smyčka má sbírat události ovládání průběžně, s timestampem a hranami tlačítek. Každý pevný krok vezme kanonický vstup. Kamera může zpracovat aktuální myš v každém renderu. Dohnání ztraceného času musí mít limit počtu kroků; dlouhé uspání tabu řešit explicitním resyncem, ne velkou dávkou dávno prošlých pohybů.

## Pěší pohyb a interakce inspirované kvalitními akčními hrami

### Ovládání postavy

Zachovat Rapier kapsli a kinematický controller. Nad něj přidat stavový automat pro stání, chůzi, běh, sprint, pohyb ve vzduchu, interakci a vstup/výstup z vozidla. Oddělit fyzikální kapsli, vizuální postavu a kamerový rig.

Cílem je okamžitě přijmout změnu záměru hráče a přitom dodat tělu hmotnost. Směr ovládání reaguje hned; zrychlení, otáčení trupu, přenesení váhy a animační přechod mají vlastní krátké časové konstanty. Dlouhá nepřerušitelná animace rozběhu působí jako zpožděné ovládání.

Počáteční rozsahy pro hraní a ladění, nikoliv parametry GTA V:

| Parametr | Výchozí rozsah |
|---|---|
| Chůze | 1,7–2,3 m/s |
| Běh | 4,5–5,5 m/s |
| Sprint | 6,5–8 m/s |
| Odezva rozběhu | přibližně 80–150 ms |
| Zastavení po puštění | přibližně 60–120 ms |
| Uchování krátkého stisku skoku | asi 100 ms |
| Krátká tolerance po opuštění hrany | 60–100 ms, pokud má skákání v hře význam |

Rychlost a animace se mají odvozovat i ze skutečného posunu po kolizi. Dnešní postava při tlačení do zdi reportuje 4,6 m/s, přestože diagnostika posledního kroku zjistila jen 0,0277 m/s. Odstranit tak běh na místě, nepřiměřené kroky a zvukovou nesrovnalost.

Skok vyhodnocovat na hraně stisku, ne z trvale držené hodnoty. Dnešní controller při držení mezerníku opakoval skok osmkrát za 150 kroků. Určit samostatnou míru ovládání ve vzduchu, gravitaci při výstupu/pádu a podmínky doskoku. Vyšší kvalita pocitu nevyžaduje fyzikálně věrného člověka.

Rapier podporuje autostep, přilnutí k zemi a řešení svahů. Jejich limity se mají odvozovat od velikosti kapsle a reálné geometrie schodů. Character controller ale podporuje pohyb posunem, ne řešení rotace automobilového kvádru. [Oficiální character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/).

### Animace a hmotnost těla

Pro běžnou locomotion použít animace na místě, jejichž rychlost odpovídá naměřené rychlosti pohybu. Míchat stání, chůzi a běh; směr trupu a pohledu oddělit v rozumném rozsahu. Přidat krátkou reakci na prudkou změnu směru, jednoduché přizpůsobení chodidel zemi u nejbližších postav a čitelný doskok.

Root motion, tedy pohyb řízený animací, rezervovat pro cílené akce: dosednutí do auta, překonání konkrétní překážky nebo krátký interakční úsek. Cíl musí být validovaný a akce musí mít jasná pravidla přerušení. Plný motion matching nebo fyzikální ragdoll stovky postav není první investice.

Zvuk kroků, změna povrchu, krátký nádech při sprintu a odezva doskoku mohou dodat více vnímané kvality než další tisíce polygonů. Zvukový systém má omezovat souběžné hlasy podle vzdálenosti a důležitosti; vlastní kroky nesmějí čekat na síťové potvrzení.

### Interakce

Vytvořit jeden resolver, který vybírá kandidáty podle vzdálenosti, výšky/patra, pohledu, viditelnosti a priority. Z téhož rozhodnutí vzniká prompt i následná akce. Dnešní samostatné větve sběru značek, auta a doručení se mohou rozcházet.

V blízkosti auta nebo dveří nabídnout krátké a čitelné přitažení k cíli, ale nepřebírat hráči kameru na dlouhou dobu. Při potvrzení vstupu do auta server ověří řidiče, vzdálenost a dostupnost; klient může okamžitě zahájit vratnou úvodní odezvu. Při zamítnutí ji ukončí.

Vystupování musí zkusit více míst kolem auta, testovat objem kapsle a výšku země. Pokud žádné místo není bezpečné, hráč zůstane uvnitř a dostane srozumitelnou informaci. Současný teleport s výškou natvrdo 1 m může umístit hráče do zdi.

## Model auta a pocit z jízdy

### Co dnes dělá auto

Současné auto mění kapsli na kvádr a pohybuje jím pomocí character controlleru. Dopředu i dozadu má cíl ±12 m/s, tedy ±43,2 km/h. Prvotní zrychlení při plném plynu vychází asi 31,2 m/s². Puštění plynu funguje skoro jako silná brzda: z 12 m/s zbude po zhruba půl sekundě asi 1,4 m/s.

Zatáčení při vysoké rychlosti nemá dostatečně odlišná pravidla. U 12 m/s a yaw rate 1,4 rad/s vychází poloměr asi 8,57 m. Tělo se otáčí přímo před vyřešením posunu; izolovaný test při zatáčení u stěny naměřil průnik až 1,007 m. To je chyba kolizního modelu, nikoliv pouze špatně zvolená citlivost volantu.

### Možné přístupy

| Přístup | Výhody | Nevýhody | Použití pro Strahov |
|---|---|---|---|
| Kinematický model s vlastními sweepy | Velmi řízené chování, jednoduchý stav pro síť | Rotace, kontakty a podvozek se musejí doprogramovat | Přechodný jednoduchý režim |
| Arkádový jízdní model a dynamické tělo | Přesně řiditelný styl, dobrá reakce nárazů | Vlastní přilnavost a kontakt s terénem | Dobrá alternativa zkušeného týmu |
| Dynamická karoserie a čtyři raycastová kola | Rozumná cena, odpružení a kontaktní síly | Nutné ladění obrubníků, ramp a predikce | **Doporučený první prototyp** |
| Kola jako samostatná tělesa s klouby | Podrobnější fyzický kontakt | Více těles, náročnější stabilita a síť | Jen pokud to vyžaduje konkrétní mechanika |
| Detailní model pneumatik a přenosu výkonu | Vhodný pro závodní simulátor | Velká cena ladění, neodpovídá hlavnímu cíli | Odložit |

Rapier v používané řadě poskytuje `DynamicRayCastVehicleController` s ovládáním kol, motoru, brzd a odpružení. Použít jej jako základ a nad ním ladit arkádové asistence; očekávanou kvalitu musí potvrdit prototyp. [API raycast vozidla](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html).

### Doporučené řízení vozidla

Auto oddělit od hráče do samostatné entity s identitou, karoserií, řidičem, případně sedadly a trvalou parkovací polohou. Dnešní server povoluje nástup na původním spawn bodě, zatímco klient si pamatuje vizuální parkování jinde.

Podvozek: jeden rigid body, jednoduchý konvexní collider, čtyři raycasty zavěšení. Pružina působí proti stlačení, tlumič proti rychlosti stlačování. Boční síla omezuje nežádoucí skluz. Tyto síly musí být omezené a stabilní pro zvolený pevný krok.

Oddělit plyn, servisní brzdu, zpátečku a ruční brzdu. Zpátečku omezit například na 4–6 m/s a přechod brzda → zpátečka dělat až po zpomalení. Rychlost pro areál nejdříve ladit kolem 40–65 km/h; vyšší maximální rychlost zvyšuje požadavky na prostor, streaming a kolize.

U řízení kombinovat rychlost náběhu natočení kol, maximální úhel závislý na rychlosti a rychlejší návrat do neutrálu. Chování může mít lehkou nedotáčivost při vysoké rychlosti a kontrolovaný skluz zadní nápravy po ruční brzdě. Parametry nastavovat společně se šířkou ulic a měřítkem světa.

Přípustné herní asistence: nižší těžiště, omezený stabilizační moment, tlumení extrémního bočního náklonu, malá korekce ve vzduchu a pomoc při návratu na kola. Asistence nesmějí přepisovat polohu bez respektování kolizí. CCD a substeps používat tam, kde měření prokáže průlety; nejsou náhradou chybějícího rotačního řešení.

Pocit rychlosti vytvářet otáčením a natáčením kol, lehkým náklonem karoserie, zvukem motoru podle zatížení, zvukem pneumatik, střídmou změnou FOV a čitelnou paralaxou okolí. Nezakrývat špatné ovládání silným camera shake nebo motion blur.

### Jak jízdní model přijmout

Prototyp musí projet osmičku, slalom, prudké brzdění, přechod brzda/zpátečka, obrubník, rampu, boční náraz a úzký průjezd. Stejné vstupy přehrát při renderu 30/60/120 Hz; výsledná fyzická trajektorie má být v dohodnuté toleranci shodná. Pak zopakovat s RTT 60 a 120 ms. Teprve auto, které se příjemně ovládá a stabilně synchronizuje, dostane finální model.


## Síťová architektura pro 100 hráčů

### Správná predikce a opravy stavu

Klient má reagovat hned na vlastní vstup. Server rozhoduje o výsledku světa. Po přijetí potvrzeného stavu klient obnoví stav odpovídající potvrzenému kroku a znovu přehraje dosud nepotvrzené vstupy. Rozdíl vizuálně vyrovná krátkou korekcí renderového modelu; skutečnou fyziku nemá libovolně lerpovat přes kolidery.

Dnešní `ack` neznamená, že server postupně provedl všechny dřívější příkazy. Vstupy se přepisují v jedné položce mapy a server opakuje poslední hodnotu. Pokud klient po záseku pošle několik kroků naráz, mohou se mezilehlé příkazy ztratit. Timeout navíc vrací ack na nulu. Na tomto významu potvrzení nelze postavit správný replay.

Nový kontrakt má obsahovat pořadí příkazu, simulační tick, kanonické osy a stav/události tlačítek. Server přijme omezenou frontu, vyřadí duplicity a nepovolí klientovi urychlit svět zasláním nadbytečných kroků. V každém fyzikálním substepu integruje společný svět právě jednou, nikoliv jednou za každý přijatý paket. Nepřítomný analogový vstup lze krátce podržet podle zvolených pravidel; jednorázový skok nebo interakce se nesmějí znovu opakovat.

Obnovitelný stav musí obsahovat nejen polohu, ale také rychlosti, yaw nebo quaternion, svislou rychlost, grounded, režim pohybu a stav důležitý pro příští krok. Vozidlo vyžaduje i úhlovou rychlost a konzistentní stav ovladače. Při kontaktu více dynamických těl není replay jednoho hráče automaticky stejný jako replay celého světa; pro první verzi omezit predikované dynamické interakce a mít definovaný způsob serverové opravy.

Colyseus v nainstalovaných verzích již nabízí `defineInput`, `setFixedTimestep` a na klientu nástroje `Predict` včetně `Predict.sim`. Nejprve ověřit jejich integraci s konkrétním Rapier stavem na malé scéně. Přítomnost API není záruka hotové predikce pro současný vlastní Actor. [Serverové vstupy](https://docs.colyseus.io/netcode/server-input), [klientská predikce](https://docs.colyseus.io/netcode/client-prediction).

Současný práh teleportu 0,75 m je při rychlosti auta 12 m/s jen 62,5 ms dráhy. Porovnání nové lokální pozice se starým serverovým stavem proto snadno zamění normální stáří dat za skutečnou chybu. Neřešit to prostým zvýšením prahu.

### Vzdálené postavy a auta

Nový snapshot má obsahovat čas serveru a tick; současná motion zpráva je nemá. Klient odhaduje posun hodin a udržuje krátký buffer. Ostatní hráče zobrazuje v lehce opožděném společném čase mezi dvěma snapshoty. U rotace používat nejkratší úhlovou cestu nebo quaternion slerp; přechod 359° → 1° nesmí udělat otočku.

Počáteční buffer 100–133 ms je rozumný experiment při 15–20Hz snapshotech, nikoliv univerzální hodnota. Při lepší síti lze zkracovat, při jitteru opatrně prodlužovat. Malou extrapolaci omezit časově a rychlostně; při dlouhém výpadku nepokračovat věčně přes překážky. Vlastní kamera a vlastní ovládání nesmějí čekat na tento buffer.

### Kolize hráčů v davu

Server dnes počítá všechny fyzikální hráče, klient pouze svého. Při střetu se serverová a lokální předpověď nutně liší. Pro společenský areál doporučuji měkké nebo neblokující kolize mezi chodci, s vizuální reakcí a případným jemným lokálním vyhýbáním. Budovy, schody a vozidla zůstávají pevnými překážkami podle pravidel hry.

Pokud budou vzájemné nárazy důležitou mechanikou, je nutné synchronizovat blízké kolizní proxy a řešit jejich čas vůči predikci. Je to významně složitější varianta. Hustota sta lidí u jedněch dveří má být herně zvládnutelná a nesmí se změnit v neprostupnou bariéru kapslí.

### Přenos jen relevantního stavu

Rozdělit svět na prostorovou mřížku, zpočátku například 32–64m buňky, a B6 navíc na patra/místnosti. Každý klient má oblast zájmu, která zahrnuje jeho okolí, směr jízdy a aktivní interakce. Přidat hysterezi, aby entita na hranici neustále nemizela a nevznikala. Zájem pro rychlé auto předsunout po směru pohybu.

Profily, oblečení a jména posílat při objevení nebo změně. Motion zpráva má obsahovat krátké síťové ID, polohu, rotaci, rychlost a malé stavové příznaky. UUID a textový název patra není nutné opakovat 20krát za sekundu. Polohy kvantizovat v lokálních souřadnicích buněk v přesnosti, kterou hra opravdu potřebuje; například centimetry u blízkého auta a hrubší přesnost u vzdálené siluety. Otestovat přechody buněk a opravy chyby kvantizace.

Možné jsou dvě cesty:

| Cesta | Kdy ji zvolit | Co ověřit |
|---|---|---|
| Colyseus Schema a StateView | Pokud dobře pokryje změny a per-client zájem | Cena serializace odlišných pohledů, aktualizace členství a velikost payloadu |
| Vlastní kompaktní snapshot protokol | Pokud potřebujeme přesný tick, prioritu a per-entity frekvenci | Více práce s pořadím, baseline, keyframy a resyncem |

Nepřidávat automaticky obě cesty pro stejný stav. Přenášet zdvojené pozice přes Schema i vlastní zprávy by zhoršilo přehlednost i provoz. [Colyseus StateView](https://docs.colyseus.io/state/view), [optimalizace synchronizace](https://docs.colyseus.io/state/optimization).

Současných přibližně 93 B na entitu vede při 100 hráčích a 15 snapshotech/s k výpočtu:

`100 × 15 × 93 = 139 500 B/s na klienta`

`100 adresátů × 139 500 = 13,95 MB/s ze serveru, přibližně 111,6 Mbit/s`

Je to extrapolace z testu do 16 klientů, před transportní režií a dalšími zprávami. Pro ilustraci cílového formátu: 32 B × 100 entit × 20 Hz by znamenalo 64 kB/s na klienta; při 30 blízkých entitách 19,2 kB/s plus pomalejší vzdálené stavy. **Ani 32 B, ani dosažená frekvence nejsou hotové implementované výsledky.** Ilustrace se týká vzdálené entity; úplný autoritativní stav vlastního vozidla potřebný pro replay může být větší.

Při stovce lidí na jednom místě oblast zájmu většinu provozu neodstraní. Pořád je třeba všechny reprezentovat, ale lze použít kompaktní stav, změnové zprávy a prioritu podle pohybu a interakce.

### Transport a provoz serveru

První iteraci ponechat na WebSocketu. Správná predikce a časování jsou důležitější než okamžitá změna transportu. Ve vlastní aplikační frontě lze před předáním transportu nahradit zastaralý samostatný snapshot novějším. Data už předaná WebSocketu odebrat nelze; u delta zpráv musí zůstat zachována návaznost na baseline. Potvrzení nástupu do auta nebo změnu vlastnictví nelze libovolně zahodit. Spolehlivý uspořádaný přenos může při ztrátě paketu zadržet i novější stav. [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket).

WebTransport je kandidát dalšího experimentu pro pohybové datagramy a oddělené spolehlivé akce. Ověřit podporu skutečných cílových browserů a zachovat kompatibilní cestu. Colyseus má odpovídající transportní dokumentaci. [WebTransport](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport), [Colyseus H3 transport](https://docs.colyseus.io/server/transport/webtransport). WebRTC vyžaduje další správu spojení; plnou mesh síť mezi 100 hráči zde nedoporučuji.

Pro první instanci stačí jeden autoritativní herní proces/room, pokud splní měření. Nepřecházet preventivně na mikroservisy. Pozdější více instancí vyžaduje oddělit room-local herní stav od současného globálního `Community`; jinak se smíchají hráči různých světů. Sociální data mohou mít samostatnou službu, fyzika zůstává lokální instanci.

Definovat kapacitu room, omezení drahých zpráv, úklid relací a rate registrů, dobu pro reconnect a chování odpojeného řidiče. Profilové změny nyní spouštějí broadcast bez obdobného limitu jako pohyb. Nasazení sjednotit přes HTTPS/WSS a nastavitelný endpoint; klientské natvrdo dané `:2567` není robustní finální topologie.

Reconnect má obnovit identitu i stav hry po krátkém výpadku. Dnešní odpojení odstraní Actor a nový join začíná na spawnu. Použít ověřený lifecycle obnovení, zastavit akce proti mrtvému spojení a provést řízený resync. [Colyseus reconnection](https://docs.colyseus.io/room/reconnection).

## Kamera a prostorové členění

### Levná a příjemná kamera

Dnešní kamera testuje paprsek proti velkým sloučeným renderovým meshům. Samotný mesh oken má rozměry obálky přibližně 435 × 16 × 212 m. U takového objektu nemůže hrubý test obálky snadno vyřadit vzdálené trojúhelníky.

Kamerové kolize oddělit od vizuálního modelu. Používat jednoduché boxy stěn nebo vhodné kolizní proxy v prostorovém indexu. Spherecast/shape cast řeší objem kamery lépe než jediný paprsek, který nechrání rohy near plane. Výsledek má rychle zkrátit vzdálenost při překážce a pomaleji ji obnovit po uvolnění. Výpočet řídit délkou ramene a skutečným posunem, ale nevynechávat ochranu při prudkém otočení.

Pro chůzi a jízdu použít rozdílné rigy. Auto má měkké sledování směru, možnost rozhlédnutí a návrat s dead zone. První osoba má přímou odezvu natočení a rychlou pozici očí; kosmetické houpání patří mimo základní transform. Ve snapshotu je navíc nekonzistentní kombinace firstPerson + vehicle: používá chase pozici, vypne kamerovou kolizi a přitom jinak volí směr pohledu.

Výměna paprsku za levnější proxy není totéž jako odstranění kolizí. Vypnutí dotazu v benchmarku pouze izolovalo cenu subsystému.

### Slučování a culling

Dnes se tisíce statických dílů slučují podle materiálu napříč celým areálem. To skutečně šetří draw calls, ale vytváří velké společné bounding boxy. Lepší kompromis je **buňka × materiál**, například 32–64m venkovní úsek a samostatné patro či místnost uvnitř B6.

Vždy měřit obě strany: příliš malé buňky zvýší draw calls a správu; příliš velké kreslí a testují zbytečnou geometrii. Počet trojúhelníků v datovém souboru není hlavní rozhodovací metrika.

Interiéry aktivovat podle polohy, portálů/dveří a viditelnosti. Venkovní pohled nemá aktualizovat nábytek všech pokojů a všech pater. Důležité vchody a průhledy zachovat. Kamera viditelná skrz dveře nesmí sledovat prázdnou místnost před jejím načtením.

Drobné opakované objekty instancovat, ale také po prostorových skupinách. Jedna thin-instance dávka přes celý areál může mít obdobně příliš velký bounds. [Babylon Thin Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/).

Kolizní svět je samostatný model. Vizuální schody mohou zůstat detailní, zatímco šest ramen schodiště lze zkusit nahradit vhodnými rampami. Ověřit sestup, stropy, hrany a přístup vozidel; změna proxy nesmí vytvořit nechtěné průchody. Dlaždicování země již vyřešilo lokální stabilitu, ale přidalo 406 colliderů. Jejich velikost dále ladit měřením, ne automaticky dalším zmenšováním.

## Vykreslování a animace stovky lidí

Avatar nyní vzniká z 9 samostatných meshů, s doplňky až z 12. Řešením není pouze ubrat počet stran na hlavě. Vytvořit sdílený rig a zpravidla jeden spojený mesh s jednou paletou nebo atlasem; blízký avatar má mít ideálně 1–2 materiálové průchody. Barvy řešit parametricky nebo přes paletu, ne neomezeným vytvářením materiálů pro každý odstín.

Pro hustý dav zavést rozpočet kvality podle velikosti na obrazovce, vzdálenosti, interakce a významu. Hystereze zabrání rušivému přepínání. Vlastní postava a aktuální partner interakce mají přednost.

Následující čísla jsou **návrhem**, který se má otestovat:

| Reprezentace | Počet | Trojúhelníky na postavu | Draw calls celkem | Obnova animační pózy |
|---|---:|---:|---:|---:|
| Hlavní blízké postavy | 12 | 4 000 | nejvýše 24 | 60 Hz |
| Střední detail | 28 | 1 000 | nejvýše 28 | 20 Hz |
| Nízký detail nebo vzdálené siluety | 60 | 100 | nejvýše 8 společných dávek | 10 Hz |
| Celkem | 100 | 82 000 dohromady | nejvýše 60 | podle významu |

Uvedených 60 draw calls je rozpočet hlavního renderovacího průchodu bez stínů. Stínové průchody patří do celkového rozpočtu; dynamicky stínovat jen omezenou množinu důležitých blízkých postav. Rozdělení není povinné podle prosté vzdálenosti. Při skupinové fotografii může být vhodnější levná jednotnější kvalita všech postav než nápadně rozdílné modely vedle sebe. Počet detailních postav určuje rozpočet, ale herní přítomnost všech 100 se zachovává.

**Poloha a rotace kořene postavy se vyhlazují každý renderovaný snímek.** Pomalejší může být výpočet kostí nebo kosmetických efektů; jinak se jen znovu vytvoří viditelné 10Hz poskakování.

Pro vzdálený dav lze vyzkoušet vertex/baked texture animation a sdílené animační fáze. Babylon podporuje tuto cestu i u thin instances, ale jeho dokumentace uvádí omezení blendingu a interpolace animačních snímků. Není to vhodná univerzální náhrada bohatého ovládání vlastní postavy. [Baked Texture Animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations/).

Jmenovky filtrovat: blízké postavy, zaměřený hráč, aktivní kontakt. V davu nezobrazovat 100 překrývajících se jmen. Projekci polohy provádět hladce mimo kompletní React strom; obsah jména se mění vzácně.

## Úsporný výtvarný směr

### Co převzít z inspirace Hogwarts Legacy

Pro Strahov bych volil měkce stylizované prostředí s dobře čitelnými materiály, teplými světly a chladnějšími stíny. Budovy zůstanou rozpoznatelné podle skutečných siluet, rytmu oken, barev a vstupů. Lidské měřítko a odlišnost míst je důležitější než mikroskopická špína v omítce.

Pocit velké hry zde mají vytvářet kompozice a konzistence: obdobná míra detailu na postavách, autech i budovách; jasné dominanty; přirozený kontakt objektů se zemí; proměna atmosféry dne a večera; čitelná cesta k místům. Současné jednoduché primitivní tvary lze zlepšit cíleným modelováním bez přechodu k fotorealistickým texturám.

### Praktický materiálový a světelný systém

| Prvek | Úsporné řešení | Detail jen tam, kde pomáhá |
|---|---|---|
| Omítka a beton | Sdílená barevná textura, vertex barvy, jemná variace | Trim atlas hran a soklů u vstupů |
| Okna | Na dálku fasádový materiál nebo plochy, blízko jednoduchá hloubka | Vybrané osvětlené místnosti, bez živé reflexe v každém okně |
| Tráva | Barevná terénní plocha a malé shluky v okolí hráče | Omezit vrstvy průhledných listů |
| Stromy | Několik čitelných hmot koruny, instancované varianty | Silueta má přednost před množstvím listových karet |
| Auta | Dobrá silueta, hladké velké plochy, malý počet materiálů | Kola, světla a místa interakcí |
| Interiéry | Modulární nábytek, sdílené atlasy, pečené ambientní zastínění | Detail v klubovně a u herních úkolů |
| Obloha | Jednoduchý gradient a úsporná vrstva mraků | Nevyžaduje 24 tisíc mrakových trojúhelníků |
| Značky a cedule | Atlas, sdílený textový systém nebo omezené UI | Zachovat čitelnost a kontrast |

Začít malou knihovnou opakovaně použitelných materiálů. Většina prostředí může používat jednoduchý shader; dražší PBR s odrazem vyhradit pro auto, vybraná okna a několik výrazných objektů. PBR samo o sobě neznamená fotorealismus; složitost určuje konkrétní shader, textury a efekty.

Osvětlení: jedno hlavní slunce, ambientní obloha, pečené AO a podle režimu omezené kontaktní/sluneční stíny. Pro dynamický den a noc nezapékat trvale ostré směrové polední stíny do fasád. Pečené ambientní zastínění a umělé osvětlení interiérů lze kombinovat s proměnlivým sluncem.

U současných StandardMaterial se ve výchozím nastavení uplatní nejvýše čtyři světla na mesh. Ve snapshotu jsou k meshům přiděleny všechny lampy za ambientem a sluncem, takže čtyři pozdější lampy scénu očekávaně neosvětlí. `range=16` samo nevybere nejbližší světla. Rozdělit vliv světel prostorově a držet nízký počet; vzdálené lampy zobrazit emisí a pečenou skvrnou. [Babylon a limity světel](https://doc.babylonjs.com/features/featuresDeepDive/lights/lights_introduction/).

### Co má vysoký vizuální přínos za nízkou cenu

Nejprve dotvořit kontaktní stín pod postavou/autem, charakteristický profil střech, zaoblení důležitých hran, barvu a roughness velkých ploch, plynulé animace a kvalitní zvuky. Okolí herních tras vytvořit pečlivěji než vzdálené části střech.

Poté přidat jemné tónování obrazu, kontrolovanou mlhu a střídmý bloom světel. Plnoobrazovkové SSAO, SSR, hloubka ostrosti, dynamické odrazy, motion blur a objemové efekty nesmějí být podmínkou, aby scéna dobře vypadala. Každý přidaný efekt musí mít měřitelný vizuální přínos a levnou variantu.

Mlha sama neomezuje kreslení vzdálené geometrie. Je třeba současně nastavit culling, LOD a vzdálenost scény. Počasí realizovat hlavně změnou světla, oblohy, zvuku a omezenými částicemi poblíž kamery; nelít déšť nad celým areálem.

### Výroba assetů

Doporučená cesta je modulární zdrojový model → kontrola metrů a pivotů → LOD → jednoduché kolizní proxy → rozdělení na buňky a místnosti → sjednocení materiálů → glTF/GLB → zvolená komprese → manifest rozpočtů.

LOD řídit i velikostí na obrazovce, ne jen pevnou vzdáleností. Okno nebo strom zabírající pár pixelů nepotřebuje stejnou geometrii jako objekt u kamery. [Babylon LOD](https://doc.babylonjs.com/features/featuresDeepDive/mesh/LOD/).

Pro textury používat mipmapy, opakované atlasy a podle podporovaných formátů KTX2/Basis. Malý JPEG/WebP na disku neznamená stejně malou GPU paměť. Pro představu: nekomprimovaná RGBA8 textura 1024² s kompletními mipmapami zabere přibližně 5,33 MiB; 2048² přibližně 21,33 MiB. Další mapy tento účet násobí. [Khronos KTX](https://www.khronos.org/ktx/).

Geometrickou kompresi volit po měření velikosti i času dekódování. Vyšší komprese, která při vstupu do hry zablokuje CPU, může zhoršit celkový zážitek. Zdroje a licence modelů/textur evidovat od začátku; současné místní reference použít pro tvar a prostorové vztahy, nepřisuzovat jim neověřené rozměry.

## Kvalitativní režimy a výkonnostní rozpočty

Režimy mají měnit cenu prezentace, nikoliv pravidla fyziky nebo počet skutečně přítomných hráčů. Dnešní low upravuje převážně rozlišení a mlhu. Faktor hardware scaling 1,3 znamená asi 76,9 % každého rozměru a 59,2 % pixelů oproti faktoru 1; automatické 60 FPS to nezaručuje.

Následující tabulka je počáteční designový rozpočet pro optimalizovaný prototyp. Nelze ji číst jako naměřenou schopnost všech notebooků.

| Položka | Úsporný notebook | Cílový běžný notebook | Vyšší kvalita |
|---|---|---|---|
| Cíl vykreslování | 60 FPS, nouzově uživatelsky 30 | 60 FPS | 60 FPS, volitelně vyšší obnovování |
| Interní rozlišení | zhruba 540–720p dynamicky | zhruba 720–900p dynamicky | 1080p a více dle výkonu |
| Viditelné trojúhelníky | kolem 150 tisíc | kolem 250 tisíc | kolem 450 tisíc |
| Draw calls včetně stínových/efektových průchodů | kolem 100 | kolem 150 | kolem 220 |
| Kontakt se zemí | AO a jednoduchý kontaktní stín | omezená sluneční mapa a kontakt | kvalitnější lokální stíny |
| Drahé postprocesy | vypnuté | nejvýše levný cílený efekt | podle GPU rezervy |
| Textury rezidentní na GPU | návrh do 128 MiB | návrh do 256 MiB | návrh do 384 MiB |
| Vzdálené postavy | jednoduchá reprezentace | rozpočet animací a LOD | lepší LOD podle rezervy |

Paměť textur je jen část spotřeby; navíc existují geometrie, render targety, shader programy, WASM a JS heap. Pro hlavní režim začít s cílem přibližně do 5 ms CPU práce a do 9–10 ms GPU práce v běžném snímku, s rezervou na špičky. CPU a GPU pracují v pipeline; jejich časy se nesčítají jako prostý seznam úloh.

Dynamické rozlišení řídit vyhlazeným GPU časem s hysterezí: rychleji snížit při přetížení, pomalu zvýšit při dlouhodobé rezervě. Pokud je problém na CPU, snižování počtu pixelů nepomůže hlavní příčině. Pak upravit počet draze animovaných postav, viditelné detaily, kamerové dotazy a cenu UI. [MDN doporučení pro backbuffer a dávkování](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Pokud browser neposkytuje spolehlivý GPU timer, použít neblokující časovou telemetrii a krátké kalibrační A/B změny rozlišení k odhadu omezení; neoznačovat odhad za změřený GPU čas. DPR vědomě omezit. Na HiDPI displeji může dvojnásobné rozlišení v obou osách znamenat čtyřnásobek pixelů, aniž by uživatel ocenil odpovídající rozdíl. Vždy reportovat CSS i skutečné interní rozlišení.


## Načítání hry a práce CPU

### První vstup do světa

Ve snapshotu se Babylon importuje přes hlavní balík a synchronně se vyrobí tisíce dočasných meshů, které se následně slučují. Prověřit explicitní modulové importy a nezbytné side-effect registrace; odebrat nepoužité renderovací funkce. Neodstraňovat registrace naslepo, jinak může fungovat vývojová scéna a selhat produkční loader nebo shader.

Rozdělit načtení na malou vstupní aplikaci, herní runtime, základ okolí spawnu a další buňky. Po vstupu hráč potřebuje mít okamžitě kolizně správné okolí; vzdálený vizuální detail může přibýt později. Kolize pro rychle se blížící auto načítat s předstihem. Během hraní neprovádět jednorázovou kompilaci stovek shaderových variant ani hromadné GPU uploady.

Vyrobit statickou geometrii předem v asset pipeline nebo ji stavět dávkovaně. Měřit načtení souboru, dekompresi, inicializaci WASM, stavbu světa, kompilaci shaderů a první ovladatelný snímek odděleně. Změna `chunkSizeWarningLimit` pouze potlačí varování a nezrychlí aplikaci.

Produkční hosting má mít správné MIME, HTTP kompresi, dlouhé cache pro soubory s hashem a konzistentní vydávání manifestu. Při změně verze nemíchat starý klientský kód s jinou verzí simulačního protokolu. Připnout závislosti nyní vedené jako `latest` a obnovitelnost instalace opřít o lockfile. [Produkční build ve Vite](https://vite.dev/guide/build).

### React a alokace

Herní stav se mění 60krát za sekundu, ale seznam událostí nebo profil ne. Canvas a simulační objekty ponechat mimo React state. Hlavní App dnes dostává statistiky každých 200 ms, čímž znovu skládá i statické SVG cesty. Statickou mapu předpočítat a memoizovat; hráčské značky držet odděleně.

U dat pohybu použít Map podle ID namísto opakovaného hledání v poli pro každý řádek snapshotu. V per-frame smyčce znovu používat pracovní vektory a pole. Profily porovnávat podle změny/verze, ne opakovaným JSON.stringify v celé kolekci, pokud profil ukáže významnou cenu.

SunCalc, počasí a pomalé změny světel nevyžadují nový astronomický výpočet v každém snímku. Osvětlení může interpolovat hodnoty spočtené například jednou za sekundu. Počet aktivních světel, mraků a materiálové změny aktualizovat při změně stavu, ne opakovaně přenastavovat totožné hodnoty.

Materiály avatarů mají mít omezenou paletu nebo řízenou životnost. Sdílený materiál se nesmí zničit při odpojení jednoho hráče, ale nekonečně rostoucí cache všech zvolených barev také není vhodná. Měřit paměť po opakovaném vstupu/odchodu, úpravách avataru a desítkách reconnectů.

### Web Workers a WASM

WASM už v projektu pracuje prostřednictvím Rapieru. Přepsat běžnou herní logiku z TypeScriptu do Rustu nebo C++ automaticky nezrychlí render, DOM ani síť.

Worker má smysl pro velké dekódování dat, generování geometrie, navigaci davu nebo pro měřením prokázanou cenu fyziky. Přenesení lokálního controlleru do workeru ale přidává synchronizaci vstupu a výsledku; špatně navržená fronta zhorší odezvu. Začít s malým datovým kontraktem a přenositelnými buffery, bez čekání UI na dokončení velkého jobu.

Celý renderer přes OffscreenCanvas je další varianta, ne první zásah. Přidává složitost kolem UI, resize, pointer lock, assetů a diagnostiky. SharedArrayBuffer pro sdílenou paměť vyžaduje odpovídající izolaci a hosting; běžný worker přes postMessage sám takovou podmínku nemá. [MDN Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).

### Vstup a fokus browseru

Zpracování ovládání musí rozlišovat hru, otevřený panel, textový input, ztrátu fokusu a skrytý tab. Při odchodu z herního ovládání vyčistit držené klávesy a podle síťových pravidel odeslat neutrální vstup. Přepnutí do chatu nemá nechat postavu běžet kvůli dříve stisknutému W.

Myš zpracovávat přímo; uživateli dát citlivost, invertování osy a přepnutí kamery. Pointer lock vyžaduje uživatelské gesto a musí mít funkční návrat po Escape. Gamepad může mít dead zone, křivku citlivosti a oddělenou asistenci řízení. [Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API).

## Porovnání technologických cest

Smyslem je pokrýt podstatné architektonické varianty. Žádná volba enginu sama neposkytne hotový jízdní model, správnou predikci a kvalitní výtvarné zpracování.

| Varianta | Co může přinést | Cena a riziko | Doporučení |
|---|---|---|---|
| Současný Babylon + Rapier + Colyseus | Nejvíce znovupoužitelného kódu, společná TS simulace, přímý přístup k webu | Je třeba napravit časování, avatar pipeline a game feel | **Hlavní cesta** |
| Babylon WebGPU s WebGL cestou | Možnost snížit režii některých scén a využít moderní GPU funkce | Rozdíly zařízení, shaderů a výkonu; potřebuje A/B test stejné scény | Experiment po odstranění hlavních vad |
| Babylon Lite | Menší a datově orientovaný renderer | Jen WebGPU, odlišné API, mladší a neúplná funkční sada | Izolovaný prototyp; ne automatická migrace |
| Three.js + Rapier | Vysoká kontrola nad renderem a obsahem | Více vlastní herní infrastruktury, přepis dnešní prezentační vrstvy | Jen při prokázaném konkrétním omezení Babylonu |
| PlayCanvas | Webový engine a příslušný editor/produkční workflow | Migrace scény a herního propojení; není garantovaná úspora | Smysluplná alternativa při nové produkční fázi |
| Godot web export | Editor, scény a animační workflow | Přepis části logiky a webová omezení exportu | Pokud tým preferuje Godot a prototyp potvrdí cíle |
| Unity web export | Rozsáhlé autorovací a animační nástroje | Migrace, cena runtime/asset pipeline a omezení webové platformy | Pokud převažují zkušenosti týmu s Unity |
| Unreal přes Pixel Streaming | Bohatý render běží na serverovém GPU | Video streaming, síťová odezva a průběžné serverové náklady | Pro prezentační zážitek; slabý soulad s úspornou multiplayer hrou |
| Nativní desktopová verze | Jiné možnosti výkonu a platformních API | Nutná instalace, samostatná distribuce | Doplněk, pokud zůstane browser hlavní vstup |
| Vlastní engine | Maximální specializace | Nejvyšší náklady na nástroje, debug, kompatibilitu a obsah | Pro tuto velikost projektu nedává první prioritu |

Babylon podporuje WebGPU, ale konkrétní režimy optimalizují různé části pipeline. Například snapshot rendering cílí především na CPU předávání renderovacích příkazů a má omezení pro měnící se scénu. Nelze slibovat zrychlení všech scén nebo odstranit fyzikální problémy změnou backendu. [Babylon WebGPU](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU.md), [snapshot rendering](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering.md).

Babylon Lite oficiálně uvádí WebGPU-only přístup, vývoj funkční parity a možné změny mladého API. Výrobní benchmarky jeho vlastních scén nejsou benchmarkem Strahova. [Babylon Lite](https://www.babylonjs.com/lite/).

Godot podle aktuální stabilní dokumentace na webu používá Compatibility/WebGL 2 a podporuje jednovláknový export; vícevláknový vyžaduje další podmínky hostingu. Unity 6 dokumentuje omezení managed threading a sítí ve webové platformě. Tyto volby posuzovat podle konkrétní verze exportu a cílových zařízení. [Godot Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Unity Web limitations](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-technical-overview.html).

PlayCanvas nabízí samostatné použití enginu a WebGPU/WebGL cestu. Jeho workflow může být výhodou, pokud bude zásadní potřeba editoru a spolupráce na obsahu; nelze z toho odvodit automaticky vyšší FPS stávající hry. [PlayCanvas standalone](https://developer.playcanvas.com/user-manual/engine/standalone/).

Pixel Streaming posílá renderovaný obraz z Unreal aplikace do browseru přes WebRTC. Herní vstup proto stále prochází sítí k rendereru a zpět jako video; lokální levné vykreslování na notebooku nahrazuje placená výpočetní kapacita jinde. [Epic Pixel Streaming](https://dev.epicgames.com/documentation/unreal-engine/overview-of-pixel-streaming-in-unreal-engine).

### Varianty v rámci současného enginu

Pro svět s jedním sluncem a několika relevantními lampami je vhodné začít jednoduchým forward renderem. Deferred nebo clustered řešení může pomoci při mnoha světlech, ale přidává další buffery, průchody a složitost; zde je levnější nejprve zmenšit skutečný počet dynamických světel.

Pro statiku porovnat chunkované slučování, klasické instance a thin instances. Pro postavy porovnat jeden skinned mesh, sdílené animační pózy a vzdálenou baked animaci. Pro server srovnat jednoduché komponentové pole/mapy s plným ECS až podle profilu. ECS samo o sobě neodstraní mnoho draw calls ani špatný protokol.

Lockstep celé hry není vhodný výchozí směr pro sto uživatelů s různými sítěmi. Plný rollback všech dynamických objektů je náročnější než autoritativní snapshoty s lokální predikcí a řízenými opravami. Streaming videa může dodat dražší grafiku slabému zařízení, ale má jinou odezvu a provozní ekonomiku. Každá z těchto cest řeší jinou část problému.

## Navržené oddělení systémů v projektu

Doporučené odpovědnosti, nikoliv požadavek na přepis všeho najednou:

| Modul | Odpovědnost |
|---|---|
| InputSampler | Klávesnice, myš, gamepad, hrany tlačítek a fokus |
| SharedSimulation | Společné pevné kroky, canonical input, postava a vozidlo |
| PredictionHistory | Tickované vstupy, potvrzení, restore/replay a velikost korekce |
| SnapshotBuffer | Vzdálené entity a společný renderovací čas |
| CharacterMotor | Kapsle, zrychlení, skok, schody, stav pohybu |
| VehicleMotor | Podvozek, síly kol, asistence a řidič |
| InteractionResolver | Stejný výběr cíle pro prompt i akci |
| CameraRig | Odezva pohledu, follow a kolizní sweep |
| WorldStreamer | Buňky, interiéry, LOD, rezidentní assety a kolize |
| RenderWorld | Materiály, instance, avatary, animace a efekty |
| PerformanceController | Raw telemetrie, limity, dynamická kvalita |
| React UI | Menu, chat, profily a pomalé panely |

Tok dat má být jednosměrně srozumitelný:

`vstup → kanonický příkaz → lokální predikce → renderový stav → obraz`

`příkaz → serverový pevný krok → snapshot + ack → restore/replay → renderová korekce`

`vzdálené snapshoty → časový buffer → interpolované cizí postavy a auta`

Renderer nesmí být zdrojem autoritativní polohy ani síťový paket přímo přesouvat kameru bez interpretace času. Detail modelu nemá určovat fyzikální collider.

## Jak prokázat 60 FPS a dobrý pocit z hraní

### Referenční zařízení a délka měření

Nejdříve jmenovitě vybrat slabší integrovaný notebook a běžný současný notebook jako dva referenční stroje. Zdejší UHD 630 je užitečná spodní zkušební konfigurace, ale jedna krátká scéna nepokrývá celou třídu zařízení.

Každý výsledek musí uvést CPU/GPU skutečně použité browserem, RAM, browser/verzi, backend, CSS a interní rozlišení, režim kvality, počet lidí, síťové podmínky, napájení a zahřátí zařízení. Produkční benchmark provádět na produkčním buildu, bez DevTools a bez souběžného sestavování. Vedle krátkých tras měřit alespoň 15–20 minut zahřátého provozu kvůli teplotním limitům.

### Povinné scénáře

| Scénář | Co odhalí |
|---|---|
| Spawn, volný pohled a rychlé otáčení | Kamera, culling, shader uploady |
| Běh mezi budovami | Plynulost kroků, streaming a jmenovky |
| Vstup do B6, schody, suterén | Kolize, interiérové členění a změny světla |
| Nastoupení, slalom, brzda, náraz, výstup | Jízdní model a interakční stavy |
| 100 hráčů rozptýleně | Síťový zájem a průběžné vstupy do viditelnosti |
| 100 lidí na nádvoří a u vchodu | Skutečná cena davu, fyzika a UI |
| Dav a několik současně jedoucích aut | Dynamické kontakty a síťová predikce |
| Noc, déšť, otočení na osvětlenou část | Overdraw, světla a efektové varianty |
| Ztráta fokusu, tab na pozadí, reconnect | Neutrální vstup, dohánění času a resync |
| Opakovaný vstup do světa a úpravy avataru | Úniky paměti a opakované kompilace |

Síťové scénáře: RTT 20/60/120/200 ms, jitter 0/20/50 ms, dočasné přerušení a 1–5 % ztráty paketů na síťové vrstvě. U WebSocketu není zahazování jednotlivých aplikačních zpráv přesnou simulací chování TCP při ztrátě; použít odpovídající emulaci sítě nebo skutečně horší připojení.

Pro test 100 klientů nepoužít pouze 100 renderových figurín. Spouštět boty na odděleném stroji nebo rozdělené mezi generátory, sledovat jejich skutečnou frekvenci a dodržet řízený náběh relací. Testovací harness nemá omylem obejít nebo vypnout produkční limity autentizace.

### Metriky a počáteční akceptační cíle

Následující hranice slouží k dohodě pro první optimalizovaný vertical slice a mohou se zpřesnit po referenčním měření.

| Metrika | Počáteční cíl | Jak měřit |
|---|---|---|
| Render v hlavním režimu | 60 FPS; p95 intervalu přibližně do 18,5 ms, p99 do 25 ms | Raw intervaly bez clampu, delší opakované trasy |
| Viditelné záseky | Nad 50 ms méně než 0,1 % snímků po zahřátí | Počet a příčina, oddělit loading |
| Lokální odezva | Medián do 50 ms, p95 do 80 ms jako první návrh | Vysokorychlostní kamera nebo odpovídající input-to-photon měření |
| Kamera | V typické scéně řádově pod 0,5 ms CPU p95 | Přímá instrumentace dotazu; ověřit správnost kolizí |
| Simulační tempo | Správný počet ticků na skutečnou sekundu | Monotónní hodiny, počet kroků a backlog |
| Server při 100 hráčích | p95 práce ticku pod polovinou zvoleného intervalu | Tick, serializace, event-loop a paměť zvlášť |
| Korekce lokálního pohybu | Bez opakovaného viditelného vracení při stabilní síti | Histogram velikosti korekcí, počet velkých oprav a video |
| Načítání | Nejdříve změřit; cílově první ovladatelný prostor do několika sekund na definované síti | Studená cache i návrat, jednoznačná cílová rychlost připojení |
| Paměť | Bez trvalého růstu po opakovaných cyklech | JS/WASM, počet GPU zdrojů, dlouhý provoz |

API čas od `keydown` do render funkce není input-to-photon: neobsahuje celou frontu GPU, kompozitor ani displej. Stejně tak ping nevystihuje zpoždění interpolace vzdáleného hráče. Uvádět tyto metriky odděleně.

Telemetrii opravit před používáním pro rozhodování. `frames` dnes ukládá dt oříznuté na 100 ms, čímž zamlčuje délku větších záseků. `_drawCalls.current` ve snapshotu bez SceneInstrumentation kumuluje. Použít veřejnou instrumentaci, oddělit raw čas od simulačního limitu a GPU čas číst dostupným neblokujícím mechanismem; dostupnost i disjoint výsledky ověřovat. [Babylon optimalizace a instrumentace](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/).

### Testování pocitu ze hry

Vedle čísel dát stejnou krátkou trasu několika lidem, kteří neznají implementaci. Porovnat anonymně varianty rozběhu, brzdy a kamery. Zjišťovat, zda hráč rozumí směru pohybu, dokáže zastavit na zamýšleném místě, snadno nastoupí a bezpečně projede zatáčku.

Měřit splnění úkolu, počet nechtěných nárazů, opakované pokusy o interakci a subjektivní hodnocení odezvy. Neoptimalizovat pouze podle preference autora controlleru. Přístupnost zahrnuje vypnutí chvění kamery, nastavení citlivosti, čitelnost promptů a možnost omezit rušivé efekty.

## Doporučené pořadí implementace

Odhady níže jsou rozsah práce zkušeného vývojáře při dostupné znalosti kódu, nikoliv závazný termín. Assety, animace a výtvarná tvorba potřebují vlastní kapacitu. Po první fázi odhady aktualizovat.

| Fáze | Konkrétní výstup | Kritérium dokončení | Orientační rozsah |
|---|---|---|---|
| 0 | Reprodukovatelný build, raw telemetrie, referenční trasy | Jasná baseline na dvou noteboocích a archivovaný protokol | několik dnů |
| 1 | Kanonický vstup, správné simulační hodiny, neutrální fokus stavy | Stejný replay při různých render FPS, žádné zrychlení/zpomalení kvůli timeru | několik dnů až týden |
| 2 | Predikce/reconciliation a snapshot buffer, dohodnuté kolize chodců | Hladký běh a otočení při RTT 60/120 ms | přibližně 1–2 týdny |
| 3 | Nový CharacterMotor, kamera s proxy, jednotné interakce | Trasa B6 bez kamerových průniků a nechtěných interakcí | přibližně 1–2 týdny |
| 4 | Jedno kvalitně ovladatelné auto | Slalom, zeď, náraz, výstup i síťový test splněny | přibližně 1–3 týdny |
| 5 | Spojené avatary, animace/LOD davu, prostorový síťový zájem | Samostatně projde 100 rozptýlených i 100 v davu | přibližně 1–3 týdny |
| 6 | Jeden dokončený výtvarný úsek a asset pipeline | Lepší obraz v daném CPU/GPU rozpočtu | programování řádově týden, výtvarná práce samostatně |
| 7 | Rozšíření ověřeného řešení na areál, dlouhé zátěžové testy | Stabilní build, teplotní výdrž, paměť a reconnect | podle rozsahu obsahu |

Fáze se částečně překrývají; jejich odhady nelze mechanicky sečíst do pevného data. Síťový kontrakt a VehicleEntity rozhodnout před finální animací nastupování. Renderové slučování před finálním exportem stovek modelů. Zátěž 100 hráčů ověřovat už s provizorními modely, nikoliv až na konci.

### První konkrétní backlog

1. Zafixovat verze, opravit plný build a ukládat raw performance export.
2. Přidat jeden regresní test kanonického vstupu přes sanitizaci.
3. Nahradit serverové „jeden callback = jeden krok“ pevným časovým akumulátorem s limitem backlogu.
4. Definovat tickovaný vstup, význam ack a úplný obnovitelný stav.
5. Oddělit lokální render transform od Rapier pozice a vytvořit buffer vzdálených stavů.
6. Rozhodnout jednotná pravidla kontaktu chodců; pro společenskou první verzi preferovat měkké/neblokující.
7. Nahradit kamerový pick po renderové geometrii levným kolizním rigem.
8. Vytvořit samostatné vozidlo a první raycastový podvozek.
9. Převést avatar na sdílený model a změřit scénu 100 lidí.
10. Implementovat síťový zájem a kompaktní stavy, potom měřit 100 skutečných klientů.
11. Rozdělit render světa do buněk a interiérů; oddělit statické SVG od pohyblivého UI.
12. Teprve do ověřených rozpočtů přidávat finální materiály, stíny, zvuk a efekty.

### Co nyní nepřinese odpovídající návratnost

Plošný přepis do jiného enginu bez srovnávacího prototypu, celoplošný vysoký detail textur, fyzikální kola s mnoha klouby, zvýšení frekvence úplných broadcastů, přidání dynamických světel všem meshům a snížení rozlišení jako univerzální reakce na každý zásek. Stejně tak samotné číslo 60 na HUD nesmí být výstupní kontrolou.

## Doporučený první hotový herní úsek

Vytvořit jednu krátkou reprezentativní trasu: spawn → chůze a běh mezi bloky → vstup do B6 → schody a malá interakce → návrat ven → nastoupení do auta → slalom a krátký okruh → bezpečný výstup. Přidat denní a večerní režim a dvě varianty populace: běžné okolí a 100členné setkání.

Tento úsek spojuje všechny podstatné požadavky. Jeho dokončení má znamenat příjemné ovládání, reprodukovatelně plynulý obraz, stabilní síť a soudržnou stylizaci v daném rozpočtu. Až takový výsledek je spolehlivým základem pro rozšiřování areálu a dalších aktivit.



