# Herní rozhraní, jazyky a navigace · 11. 10. 2026

Rozhraní používá kompaktní vlastní SVG ikony, tlumenou modrošedou desku se zlatým akcentem a průsvitné pozadí. Velká mapa a deník jsou soustředěné modální plochy; okolní HUD se během jejich otevření skryje. Ve světě zůstávají kontextové interakce, malá mapa, stav relace a kompaktní ovládání. Trvalé popisky míst jsou vypnuté, jména mají limit šesti blízkých hráčů do 18 m s hysterezí. Vzdálení hráči tím ze společného světa ani z vykreslení nemizí.

Směr vychází z požadované čitelnosti herního HUD, mapy DOOM a deníku Hogwarts Legacy. [Blizzardův popis modernizace HUD](https://worldofwarcraft.blizzard.com/en-gb/news/23837944) výslovně popisuje omezení vizuálního nepořádku a výraznější mapu; [primární popis AutoMap od Bethesdy](https://wiki.bethesda.net/wiki/snapwiki/Doom/AutoMap/) byl podkladem pro princip čitelné orientace. Implementovaná mapa je vlastní **dvourozměrná SVG mapa**, nikoli kopie jejich 3D mapových systémů. Zachovává skutečné souřadnice Strahova a sdílené půdorysy, cesty a plochy.

## Funkční rozsah

- Čeština/angličtina se přepíná v úvodní obrazovce a Nastavení. Přezdívky, chat, vlastní události a zdrojová ID se nepřekládají. Deník má přeložených všech 36 článků a anglické vyhledávání. [Kontrakt a testy lokalizace](localization.md).
- Kliknutí na místo nebo volnou část velké mapy nastaví cíl, který zůstane viditelný v minimapě. Enter v mapě označí její střed. Tažení, zoom, sever/směr postavy a klávesové ovládání zůstávají zachované.
- Pěší trasa kontroluje společné fyzikální překážky a stadionovou uzávěru. Není-li trasa dostupná, neukazuje vymyšlenou spojnici. U známých interiérů vede k venkovnímu přístupu; navigace po vnitřních patrech není součástí této 2D trasy. [Průchody skutečné postavy, cache a časové dělení](map-navigation-20261011.md).
- M/ J/ Esc a Tab používají řízený focus. Otevřený panel blokuje pohybové klávesy postavy, svět a ostatní účastníci pokračují. Zavření vrací focus; psaní ve formuláři nespouští herní zkratky.
- F a samostatné tlačítko přepnou místní svítilnu. Drží ji pravá ruka; v první osobě vychází paprsek z kamery. V autě se vypíná a využívá se existující světlo vozidla. [Světelný rozpočet, stíny a životnost](flashlight-20261011.md).

## Výkon a ověření

Mapa nevytváří druhou Babylon scénu ani další WebGL kontext. Statická SVG geometrie je sdílená a memoizovaná; obě mapy používají stejný plánovač. Hledání má kooperativní rozpočet přibližně 3 ms, přeruší se mezi malými kroky a respektuje zrušení cíle i likvidaci světa. Přesné časy nativních jednotek a překročení rozpočtu jsou v navigačním profilu, nikoli vydávané za garantovanou délku snímku.

Nové mapové/deníkové plochy a dock nepoužívají celoplošné rozmazávání nebo SVG filtry. Písmo používá místní systémové rodiny; původní vzdálený Google Fonts import byl odstraněn. Tyto změny mají konkrétní omezený rozsah, samy nedokazují 60 FPS.

Cílená kontrola labels/recovery/controls prošla 25/25. Test popisků ověřuje limit šesti jmen, vynechání všech statických projekcí a zachování stejného uživatelského jména při změně jazyka. Kontrola README odkazů byla přesunuta z runtime locale testu do samostatného `pnpm check:readme`: kontroluje oba skutečné publikační soubory a relativní cíle, zatímco neměnný gameplay snapshot záměrně neobsahuje průběžně aktualizované dokumentační důkazy. Runtime testy a jejich skutečné datové závislosti zůstávají ve snapshotu.

Průběžná vizuální kontrola pracovního stromu potvrdila CZ→EN se zachovanou přezdívkou, zobrazenou trasu k R-ku, anglické hledání „laundry“ a nové mapové/deníkové panely. V průběhu se aktivoval vývojový HMR při souběžných změnách; jeho znovunačítání ani HUD FPS nejsou použité jako výkonový důkaz. Finální produkční a GPU výsledky patří do [společného ověření](verification.md).

Interiéry jsou podle upřesnění uživatele omezené na kolejní bloky, školicí centrum, R-ko a Potraviny Strahov. Neznamená to, že jsou již všechny hotové: detailně hratelný je nadále B6. Ostatní objekty včetně stadionu mají být pouze exteriéry s uzavřeným vstupem.

Finální P3 má 469/469 testů, build, izolovanou integraci a SHA audit PASS. Produkční P2 kontrola zachytila nedostatečný kontrast mapového odznaku DEMO; P3 jej opravuje na text `#e3c990` na podkladu `#263a41`. [Finální mapa](verification-evidence/pilot-20261011-p3/production-map-route.png) a [produkční protokol](verification-evidence/pilot-20261011-p3/production-ui.json) jsou z medium/Intel UHD 630, 1280×720. Nejde o cílovou GeForce FPS přejímku.
