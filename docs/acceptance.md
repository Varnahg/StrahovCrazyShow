# Rozsah a přejímka virtuálního Strahova

Aktualizace návodu 20. 10. 2026. Tento seznam shrnuje existující zadání a podmínky přijetí; není seznamem nových funkcí ani potvrzením úplné hotovosti. Spuštěné demo, export modelů a PASS testů nenahrazují vizuální porovnání předlohy se skutečnou hrou. Hogwarts Legacy je inspirací pro materiály, světlo, anatomii a atmosféru; jeho assety se nepřebírají a jeho dokončená kvalita se netvrdí.

Aktuální kód používá protokol **11**, sdílenou simulaci **60 Hz** a výchozí **WebGL2**. WebGPU je explicitní loopback QA. Konkrétní výsledky vždy patří zdrojové identitě v [přehledu ověření](verification.md); P5, D2 a jejich porty jsou historická evidence. Tento dokument neurčuje živou testovací adresu.

Aktuální výsledky, source identity a známá omezení jsou soustředěné v [přehledu ověření](verification.md). Refaktoring KEY-48 má [vlastní závěrečný záznam](refactoring/20261020/final-validation.json); datované výsledky jednotlivých celků se nepřenášejí na jiný checkpoint. Funkční kontrola hry není měřením cílového GPU výkonu.

| Oblast existujícího zadání | Stav a podmínka přijetí |
| --- | --- |
| Prohlížečová hra a spuštění | Klient, autoritativní server a Docker existují. [CZ](../README.cs.md)/[EN](../README.md) popisují spuštění; úspěch konkrétní pipeline patří pouze jejímu checkpointu. |
| Přezdívka, host, žádné IS ani ověřování bydliště | Přezdívka označuje dočasnou relaci. Host se nepřipojuje do multiplayeru a nesmí dostat přítomnost ani zprávy včetně veřejného HTTP. |
| Jeden společný svět | Všechny multiplayerové relace sdílejí jednu místnost, žádné skupiny po osmi. Kapacitu a stabilitu prokazuje měření skutečných relací; neomezená kapacita se netvrdí. |
| Akce a seznamování | Teď/Dnes/Tento týden, mapa, filtry, detail, dobrovolné zájmy a vlastní setkání jsou implementované v demu. Akce jsou fiktivní, virtuální poloha/účast nepotvrzuje skutečnou návštěvu. |
| Komunikace a dočasné relace | Globální/místní/událostní chat, DM po přijetí kontaktu, mute, blokování, limity a reconnect mají serverová oprávnění. Stav v paměti zmizí po restartu; přijetí vyžaduje SDK/HTTP scénáře dané verze. |
| Společné a sólové aktivity | Hledání, týmový kvíz a hostovské úkoly mají demonstrační rozsah. Kosmetické odměny nemají ekonomiku. |
| Areál, silnice, terén a hřiště | OSM půdorysy, DMR a samostatné assety existují. Vykreslení/kolize musí sdílet polohy a povrchy; vstupy, schody a přechody vyžadují skutečný průchod a porovnání s datovanou předlohou. |
| Fotografie a fotogrammetrie | IPR originály/mastery a provenience zůstávají zachované. Sloučený městský mesh se do hry nenačítá; zapečené světlo ve snímku není fyzické albedo. [Reality Pack](reality-pack/README.md). |
| Budovy a povolené interiéry | Interiéry jsou zamýšlené jen pro kolejní bloky, školicí centrum, R-ko a Potraviny. Stadion a ostatní budovy mají exteriér. Úplná fotografická věrnost všech budov ani všechny povolené interiéry nejsou přijaté. |
| B6 | Detail existuje v rámci přiznané rekonstrukce: krytý severní vstup, schody, recepce, dvě jádra, chodby a sociální zázemí. Nekótované schéma a fotografie BLOK 3 nejsou zaměření současného B6; ilustrativní pokoje nejsou skutečný inventář. |
| Samostatné modely a vegetace | Budovy, auta, stromy a hřiště mají vlastní identity. Mapová poloha, interpretace fotografie a herní odhad se rozlišují. Stromy/tráva nesmějí zasahovat do komunikací; LOD, vítr a vzhled vyžadují vlastní vizuální kontrolu. |
| Slunce, Měsíc a počasí | Astronomie používá skutečný UTC okamžik a souřadnice Strahova. Čerstvá stanice, model a stará data jsou odlišené; vítr je směr ODKUD. Lampy mají výtvarné intenzity, okna simulované osvětlení. |
| Postavy, editor a lokomoce | Společná factory používá CC0 anatomii, GPU skinning a samostatné oděvy. Vlasy, mimika, extrémní pózy a kontakt každé boty se schody mají přiznané limity. CPU regrese nenahrazuje obrazovou přejímku. |
| Ovládání a kamera | WASD/šipky, kamera, výběr, gesta a svítilna jsou součást dema. A musí být vlevo a D vpravo při každém natočení; ověřit projekci, jízdu, GUI a kameru ve skutečné scéně. |
| Auto a veřejná doprava | Sdílené řízení je arkádové, výstup vyžaduje bezpečné místo. PID je uložený plán a cestující simulovaní; plán se nevydává za živou polohu. [Vozidla](vehicles/README.md), [PID zdroje a limity](transit/README.md). |
| Mapa, minimapa, deník a CZ/EN | Pěší cíle/trasy a zdrojové články jsou součást dema. Texty hráčů se nepřekládají; aktuální osoby/kontakty vyžadují datované primární zdroje. |
| Výkon a kvalita | Cíl 60 FPS na GeForce GTX 1060 za dne a s davem zůstává otevřený. Nastavitelný cíl 60/120/144 FPS ani adaptivní kvalita nejsou naměřené FPS. Vyžadovat plnou produkční hru, skutečné relace/HUD, GPU, CSS/interní rozlišení a p95/p99. [Metodika](performance/README.md). |
| Licence a soukromí | Zachovat zdroje/atribuce a původní assety. Uživatelské diagnostiky zůstávají pouze místní; nepublikují se jako veřejná evidence. |

Historické výsledky P5/L2/K4/K3/J včetně neúspěšných pokusů a vyloučených vzorků zůstávají v [původní evidenci](verification.md). Staré GPU číslo ani tehdejší nasazení není důkazem současného checkpointu.

Kontrolní trasa: [world-walk](verification/world-walk.html). Počáteční umístění je diagnostická příprava; další úseky používají skutečný vstup a fyziku. Komponentové náhledy, CPU rendery, NullEngine a okamžitý HUD nejsou měřením výkonu celé hry. Trvalé účty, hlas, IS, ověřování bydliště, skutečný import akcí, ekonomika a zabezpečená administrace nejsou součástí této etapy.
