# Ověření dema a známá omezení

Tato větev `codex/network-state-hud` přidává checkpoint **B3** nad P5. Stabilní `main` a jeho místní náhled [http://127.0.0.1:4179/](http://127.0.0.1:4179/) zůstávají P5; tento port nepředstavuje ověření B3. [Záznam nasazení P5 a ID místního sběru](verification-evidence/pilot-20261011-p5/local-preview-status.json). Historické checkpointy níže uchovávají tehdejší výsledky. `pnpm dev` spouští vývojový klient na 5173 a API na 2567.

## Checkpoint B3 · společný svět, přenos, predikce a HUD

B3 `f908aacdec194939b7715d66bafae972530efa88e66378b1ba0b7656b3d8607f` obsahuje **8193 zmrazených souborů včetně testů**. Prošel **516/516 testy, produkčním buildem a plnou izolovanou integrací**, všechny příkazy exit 0. Integrace obsahuje skutečný respawn, obecný multiplayer včetně hosta a řízení auta, dvanáct pozorovatelů nového pohybového protokolu a dva SDK klienty s vynuceným nahromaděním vstupů. Nezávislý audit znovu přečetl **8193 live + 8193 frozen souborů**, včetně 100 souborů ve stromu tests: **0 odchylek, chybějících či nadbytečných vstupů a chyb**. [Výsledky a logy](verification-evidence/network-responsive-20261012/results.json), [SHA audit](verification-evidence/network-responsive-20261012/source-check.json), [zdrojový manifest](verification-evidence/network-responsive-20261012/source-manifest.json), [rozdíly oproti B2](verification-evidence/network-responsive-20261012/source-comparison.json).

**Protokol 8 vyžaduje společnou aktualizaci serveru a klienta.** Jeden společný svět, autoritativní fyzika 60 Hz a pohybové zprávy 20 Hz zůstávají zachované. Všichni hráči nadále dostávají všechny ostatní; host nepřijímá jejich přítomnost či komunikaci ani přes veřejné HTTP. Krátká ID, maskované změny a pravidelné úplné snímky omezují síťový objem. Přesné autoritativní potvrzení vlastní predikce se nekvantizuje. Přenášený grounded stav zatím není zapojený do nové vzdálené animace.

Opravená historie predikce nepřehrává znovu již opravené stavy; po 30minutovém okně obnovy se uklízí osobní komunitní stav a obousměrné vazby. Autorské akce si ponechávají vlastníka do svého zániku a týmům zůstávají získané body. Operace bez změny zbytečně nerozesílají sociální stav. Při více než osmi čekajících vstupech server nejvýše jednou za sekundu zahodí starou frontu a pošle přesný stav pouze dotčenému hráči, bez dodatečného fyzikálního pohybu. [Skutečná SDK obnova](verification-evidence/network-responsive-20261012/input-backlog-integration.json): potvrzení 16 za 2,4093 ms, posun X 0 m, následný lag p95 dva příkazy, druhý hráč bez resynchronizace. Větší výpadek může vyvolat viditelnou korekci polohy; nejde o historický rollback dynamického okolí ani o veřejný internetový test.

Tři nové páry po 30 s se 100 skutečnými pohybujícími se SDK relacemi potvrdily **20,446 → 5,089 MB/s (−75,11 %)** aplikačního přenosu ze serveru. Všech šest běhů zachovalo 100 hráčů, 60Hz simulaci, nulové aplikační chyby a resynchronizace. CPU medián **52,34 → 59,32 % jednoho jádra** a pozorované stáří potvrzení p95 **63,81 → 80,24 ms** v této sérii neprokazují zrychlení; předchozí série i výkyvy zůstávají zachované. Server a SDK klienti běželi na stejném stroji. [Úplná evidence a meze](performance/network-state-20261012.md), [všech šest výsledků B3](performance/evidence/network-state-20261012/network-responsive-100/summary.json).

**Celá produkční hra s HUD:** 30 skutečných relací (29 SDK + browser), šest avatarových předloh, Intel UHD 630 / ANGLE D3D11, ruční low, CSS 1920×1080, interně 1476×830. Tři 10s intervaly B3: **28,9 / 29,5 / 30,9 FPS**, p95 **44,4 / 44,4 / 42,1 ms**, p99 **57,9 / 52,2 / 49,3 ms**, render/asset chyby 0. Výchozí P5 měl 28,4–30,6 FPS; zrychlení GPU se neprokazuje. Shodné světlo, kamera a řízené počasí jsou ověřené, pohyb hráčů mění detail modelů. [Úplné snímky a přepočet](performance/evidence/network-state-20261012/gpu-b3-check.json).

Pětiminutová souběžná kohorta zachovala všech 30 hráčů a 60,001Hz simulaci. V prvních 26 s skutečně proběhlo **31 cílených obnov `input-backlog` u 29 SDK klientů**, pak 274,673 s bez další obnovy. Potvrzení mělo medián/p95/p99 **49,87 / 90,49 / 113,49 ms**, lag p95 **5 příkazů**. Monitor nevykázal trvalý lag 14 z B2; poslední minuta přesto měla vyšší odezvu než začátek. Není to nulový počet resynchronizací ani test vynuceného resetu `Game.reconcile` v prohlížeči: SDK ovladač browserovou predikci nespouští. [Dlouhá kohorta, jednotlivé obnovy a přesné meze](performance/network-state-20261012.md).

HUD dostává čitelné názvy, klávesnicový fokus, odlišené modelové či zastaralé počasí a označený náhled světla. Kompaktní diagnostika zachovává naměřené intervaly; velký inventář se ukládá tlačítkem do úplného JSON místo vložení do stránky. Skutečný produkční prohlížeč ověřil CZ/EN, den/noc, 1920×1080, 320×640 a 390×844 bez vodorovného přesahu a překrytí hlavičky, panelu a navigace. Tab zobrazil fokus a nápovědu, Enter otevřel deník, Esc vrátil fokus. Tři úplné exporty B3 byly skutečně staženy. Host neviděl jiného připojeného hráče; návrat i reload se znovuvstupem ukázaly právě dva hráče. [Produkční UI protokol a omezení](verification-evidence/network-responsive-20261012/production-ui.json), [podklady a rozsah změn](hud-network-study.md).

Prohlédnutí B3: [http://127.0.0.1:4180/](http://127.0.0.1:4180/) s izolovaným API 2580. Po měření byli odpojeni všichni testovací SDK klienti, ukončena telemetrie a odstraněna testovací náhrada počasí; náhled používá stejný zmrazený zdroj B3. [Stav místního náhledu při předání](verification-evidence/network-responsive-20261012/local-preview-status.json). Náhled P5 na 4179/API 2570 nebyl měněn.

**Trvající provozní meze:** síťový objem všech vůči všem roste přibližně kvadraticky; jedna simulace patří jednomu procesu a běžné přidání instancí ji nerozdělí. Demo neukládá relace a komunitní stav přes restart. Před veřejným provozem je nutné vyřešit důvěryhodnou klientskou IP za proxy pro limit vydávání relací; nynější limit pracuje s přímým socketem. Vyšší kapacita, celkové CPU všech klientů a GeForce 60 FPS nejsou tímto testem doložené.

## Checkpoint P5 · oprava odrazu, letu a doskoku

P5 `4601a8c8f94775e37befda81976b1a8457a171be923dd5b24981847b7c34000e` prošel **471/471 testy a produkčním buildem**. Izolovaná integrace prošla opakováním na stejném snapshotu a bez změny kontrol. První pokus vypršel při kontrole D řízení po pevném bloku vstupů; jeho příčina není prokázaná a [původní log](verification-evidence/pilot-20261011-p5/pipeline-test-integration.log) zůstává zachovaný vedle [úspěšného opakování](verification-evidence/pilot-20261011-p5/integration-retry-result.json). Při opakování neběžel žádný náš Blender/GPU/export. Nezávislý SHA audit přečetl **8175 live + 8175 frozen souborů**, včetně 93 souborů ve stromu tests v každé kopii: **0 neshod/chyb**. [Výsledky, všechny logy a SHA](verification-evidence/pilot-20261011-p5/results.json).

Příčinou převrácených nohou byla ponechaná opora posledního kroku: při stejném vrcholu skutečného Rapier skoku měla P3 pánev −0,11140 m v prostoru postavy, oprava +0,88938 m. Odraz nyní zachytí skutečnou pózu, zruší pozemní plán a přenese pánev s rootem. Sestup připraví extenzi podle skutečné výšky nad podkladem; první grounded snímek má platný kontakt bot. [Reprodukce, šest scénářů a limity](characters/locomotion-study/jump-repair-20261011.md). Původní animační testy nebyly oslabené.

Skutečný GPU komponentový náhled prošel Alex/běh/near a Eli/klid/medium při odrazu, ve vrcholu a při doskoku. [Finální protokol](verification-evidence/jump-animation-20261011/final-component-gpu.json), [doskok](verification-evidence/jump-animation-20261011/final-landing.png). Předchozí diagnostické snímky s residual hoverem zůstávají výslovně mezivýsledkem. Také **celá produkční hra s HUD a jednou skutečnou multiplayerovou relací** prošla nativní chůzí a mezerníkem na medium, Intel UHD 630, CSS/render 1280×720, bez hlášených render/asset chyb. [Produkční kontrola a skutečný rozsah důkazu](verification-evidence/pilot-20261011-p5/production-jump.json). Toto není FPS interval ani GeForce přejímka.

Předchozí P4 měl čtyři neexpandované Git LFS pointery v nové pracovní kopii. Dva vegetační testové moduly selhaly dříve, než mohly zaregistrovat všechny testy: runner hlásil 464/466, build a integrace neběžely. [Původní chyba P4](verification-evidence/pilot-20261011-p4/results.json) je zachovaná. `git lfs checkout` doplnil skutečné čtyři soubory (564 MB); jejich obsah odpovídá původnímu P3. Nový P5 mění pouze runtime animaci a přidává test s fyzikální fixture.

**Otevřené limity:** vzdálené motion pakety zatím nepřenášejí grounded, proto oprava pouze brání připnutí jejich pánve ke staré výšce a netvrdí přesnou vzdálenou letovou pózu. Samostatná pozemní špička při prudkém rozběhovém otočení není tímto hotfixem vyřešená. Nová fotografická tráva a oprava vzdáleného lemu auta se připravují odděleně a nejsou součástí P5. Main i testovací build se aktualizují pouze na ověřenou opravu; soukromé uživatelské benchmarky zůstávají místní.

## Checkpoint P3 · jazyky, herní UI, navigace, svítilna a uzavřený stadion

P3 `912e65ee7ef04ab302db5c611e146b3e23ee6424d9bddc0102b4867fe24f03da` prošel **469/469 testy, produkčním buildem včetně TypeScript a izolovanou integrací**, vše exit 0 (11. 10. 2026 19:53:18–19:55:46 UTC; 84,344 / 42,203 / 21,725 s). Nezávislý SHA audit přečetl **8173 live + 8173 frozen souborů**, včetně 91 testových souborů v každém stromu: **0 neshod a chyb**. Snapshot zahrnuje také statický geometrický fixture, který skutečně používají stadium testy. [Výsledky a logy](verification-evidence/pilot-20261011-p3/results.json), [SHA audit](verification-evidence/pilot-20261011-p3/source-check.json).

Update přidává okamžité CZ/EN přepínání včetně 36 článků deníku, kompaktní ikonový HUD, průsvitné mapové/deníkové plochy, pěší cíl s trasou v minimapě a svítilnu na F. Opravuje přechody chůze při rozběhu a zastavení a uzavírá vnitřek stadionu společnou viditelnou geometrií a fyzikou. [Rozhraní a omezení](game-interface-20261011.md), [lokalizace](localization.md), [navigace a skutečné KCC průchody](map-navigation-20261011.md), [svítilna](flashlight-20261011.md), [chůze](characters/locomotion-study/transition-repair-20261011.md), [stadion, zdroje a exporty](reality-pack/landmarks/stadium-exterior-20261011.md). Near stadion má o 32,7 % méně trojúhelníků; počet jeho dávek zůstává 10. Far má o 2,2 % méně trojúhelníků, ale kvůli doložené doplněné věži 8→9 dávek. Nejde o měření FPS.

**Praktická produkční kontrola:** medium, Intel UHD 630 přes ANGLE D3D11, CSS i interní rozlišení 1280×720, HUD a jedna skutečná multiplayerová relace. P2 ověřil CZ→EN→CZ→EN bez změny přezdívky či opětovného připojení, anglické hledání a článek deníku, Tab/Shift+Tab v mapě, blokování F při otevřeném panelu, trasu k R-ku, vlastní bod a skutečnou chůzi W až do příchodu k cíli. F a V prošly první/třetí osobou včetně přeloženého fallbacku odmítnutého pointer lock. [Produkční protokol P2](verification-evidence/pilot-20261011-p2/production-ui.json). Samostatné skutečné GPU náhledy prošly stadion z jihu/portálu/nadhledu a rozběh/došlap dvou avatarových konfigurací; [stadion](verification-evidence/pilot-20261011-p2/stadium-visual.json), [chůze](verification-evidence/pilot-20261011-p2/locomotion-visual.json).

P2 měl technický PASS, následná vizuální kontrola však našla málo čitelný odznak DEMO na mapě a ostrý okraj kuželu svítilny. P3 mění právě tři soubory: CSS kontrast, exponent pouze hráčova reflektoru a příslušnou regresní podmínku. **Všechny ostatní runtime zdroje a assety jsou vůči P2 bitově stejné**, což dovoluje znovu použít jeho stadium/gait a širší UI důkazy. [Přesné porovnání P2/P3](verification-evidence/pilot-20261011-p3/source-comparison-p2.json). Finální P3 skutečně ukazuje čitelný odznak a měkké světlo v první/třetí osobě; F světlo vypne, canvas má render-error-count 0 a konzole warning/error je prázdná. [P3 produkční protokol](verification-evidence/pilot-20261011-p3/production-ui.json), [finální mapa](verification-evidence/pilot-20261011-p3/production-map-route.png), [svítilna z první osoby](verification-evidence/pilot-20261011-p3/production-flashlight-first-person.png). Tyto snímky a okamžitá čísla v HUD **nejsou FPS benchmark**.

První P měl **468/469 PASS**: ve zmrazeném stromu chyběl statický fixture `docs/reality-pack/landmarks/geometry-source.json`. Snapshot skript nyní zahrnuje právě tuto datovou závislost; test nebyl oslaben a [původní selhání](verification-evidence/pilot-20261011-p/results.json) zůstává zachované. [P2 technické výsledky i vizuální nedostatky](verification-evidence/pilot-20261011-p2/results.json) jsou také zachované. Kontrola obou skutečných README a jejich místních odkazů je samostatný `pnpm check:readme`, protože průběžně aktualizovaná publikační dokumentace není runtime fixture.

**Historický stav při předání P3:** port 4179 obsluhoval P3 a dočasný náhled 4189 ještě P2. Server i klient používaly **protokol 7**; místní uživatelský FPS sběr byl vázaný na přesné ID P3. Řízený QA prohlížeč 4190 a jeho server byly po kontrole ukončené. [Tehdejší místní build](verification-evidence/pilot-20261011-p3/local-preview-status.json). Aktuální náhled je uvedený na začátku dokumentu.

**Otevřené podmínky:** kompletní věrnost všech budov, povrchů a vegetace a P3/GeForce 60 FPS za dne s více hráči nejsou přijaty. Interiéry jsou povolené jen pro kolejní bloky, školicí centrum, R-ko a Potraviny Strahov; detailně hratelný zůstává B6, ostatní povolené interiéry ještě nejsou dokončené. Stadion je pouze exteriér s uzavřeným vnitřkem. Mapa poskytuje pěší venkovní přístup, nikoli navigaci po vnitřních patrech nebo automobilovou GPS. Soukromé uživatelské diagnostiky nejsou součástí Git repozitáře.

## Checkpoint O2 · kolize střech a návrat na start

O2 `54ce6e6d630b68b5c91de1197a07920cb7d0e27cf43e01376d3c02574b220d4c` prošel **433/433 testy, produkčním buildem a izolovanou integrací**, vše exit 0 (11. 10. 2026 18:12:13–18:14:23 UTC; 71,280 / 38,123 / 20,319 s). Nezávislý SHA audit skutečně přečetl **8155 live + 8155 frozen souborů**, včetně 86 testových souborů v každém stromu: **0 neshod a chyb**. [Výsledky a logy](verification-evidence/pilot-20261011-o2/results.json), [SHA audit](verification-evidence/pilot-20261011-o2/source-check.json).

Příčina reprodukovaného průletu auta: obecné budovy měly viditelnou střechu, ale fyzika jen obvodové stěny. Renderer i Rapier nyní používají stejnou triangulaci střechy a oboustranné kontakty. Doplněné jsou také přesné existující plochy B1 a marketu; původní render buffery, ostatní kolize a otevřené dvory/průchody se nemění. Výšky zůstávají původními mapovými či herními odhady, nikoli novým zaměřením. [Reprodukce, primární podklady a specializované střechy](roof-collision-recovery-20261011.md).

R a tlačítko Nastavení → Vrátit se na start mají společnou cestu: vyčistí předchozí vstupy, počkají na konkrétní potvrzení respawnu a obnoví postavu, kameru a případné vlastní auto. Běžná síťová synchronizace zachovává držené ovládání, záměr kamery i polohu zaparkovaného auta. Nová relace resetuje síťové pořadí; opětovné připojení stejné identity zachovává ochranu před starými pakety. **Protokol 6 vyžaduje společnou aktualizaci serveru a klienta.** [Serverový kontrakt](respawn-server-20261011.md). Finální skutečný SDK scénář má **23 dokončených čekacích kontrol, tři explicitní reset odpovědi, 0 chyb a 0 otevřených autentizovaných spojení po úklidu**; ověřil i absenci respawn markeru u obecné synchronizace a ochranu cizího řidiče. [Wire evidence](verification-evidence/pilot-20261011-o2/integration-respawn-evidence.json).

**Praktická GPU kontrola:** skutečný Game a Rapier, medium, Intel UHD 630, canvas/render 890×720. Jediná výslovná diagnostická příprava umístila auto 2 m nad střechu `53921692` s rychlostí Y −8 m/s; následovalo 90 běžných fyzikálních vstupů, bez dalšího teleportu nebo přímého krokování. Po dopadu zůstalo auto na střeše, se všemi čtyřmi kontakty kol, původně očekávaným rozdílem počátku modelu vůči střeše −0,01120 m a bez přesahu 90. kroku. Úplný záznam zachovává také přechodné minimum počátku modelu −0,36647 m vůči střeše; nejde o měření spodního povrchu karoserie. Návrat po šesti vykreslených snímcích potvrdil pěší spawn, kanonické zaparkované auto a konečnou polohu kamery. **0 shader/asset chyb, prázdná konzole warning/error.** [Drop data](verification-evidence/pilot-20261011-o2/roof-drop.json), [snímek na střeše](verification-evidence/pilot-20261011-o2/roof-drop.png), [recovery data](verification-evidence/pilot-20261011-o2/roof-recovery.json), [snímek návratu](verification-evidence/pilot-20261011-o2/roof-recovery.png).

Také produkční bundle s HUD a skutečnou multiplayerovou relací prošel nativním W/R a skutečným tlačítkem v Nastavení; obě cesty skončily stavem `restored`. Medium denní náhled měl CSS/render 1280×720 a Intel UHD 630, bez console warning/error. [Produkční smoke a hranice důkazu](verification-evidence/pilot-20261011-o2/production-smoke.json), [produkční snímek](verification-evidence/pilot-20261011-o2/production-respawn.png). Testovací relace používala izolované porty 2571/4189; po kontrole byly všechny řízené 3D scény i testovací servery ukončené. Tyto funkční kontroly nejsou FPS intervaly ani NVIDIA přejímka.

Předchozí **O měl 432/433 PASS a jeden FAIL** kvůli zastaralému source otisku navigace; build, integrace ani GPU QA tehdy neběžely. [Původní selhání](verification-evidence/pilot-20261011-o/results.json) je zachované. Existující generátor obnovil dva source otisky a ponechal všech **18 tras / 312 bodů / 9 cílů** i celý ostatní payload shodný. [Porovnání navigace](verification-evidence/pilot-20261011-o2/navigation-comparison.json). Test se neobcházel ruční výměnou očekávaného hashe.

**Historický stav při předání O2:** port 4179 obsluhoval O2 a lokální sběr potvrzoval stejné zdrojové ID. Uživatelské diagnostiky zůstaly pouze v ignorované místní cache. **Úplná 60FPS přejímka za dne a s více hráči zůstává otevřená.** Veřejné nasazení se neprovádí; další výtvarné a modelové limity se tímto bugfixem neuzavírají.

## Checkpoint N · přesné transformace a společné barevné dávky aut

N `4c19b98bc5b73410b776b388a3c55d7d8a4d0b25d60b42137268b522ea29d778` prošel **410/410 testy, produkčním buildem a izolovanou integrací**, vše exit 0 (11. 10. 2026 16:28:57–16:31:16 UTC; 83,813 / 38,398 / 17,545 s). Nezávislý audit skutečně hashoval **8148 live + 8148 frozen souborů**, včetně 82 testových souborů v každém stromu: **0 neshod a chyb**. [Výsledky a logy](verification-evidence/pilot-20261011-n/results.json), [SHA audit](verification-evidence/pilot-20261011-n/source-check.json).

Klient nyní nepřepisuje identické polohy/rotace, znovu používá quaterniony a počítá orientaci kontaktního stínu jen při změně jeho vstupů. Zachovává přesné hodnoty, velmi malé pohyby i původní pravidla odpružení. Native Babylon testovací sestava odstranila 2400 zbytečných přepočtů stojícího auta za 240 kroků, zatímco pohyblivá sestava zachovala všech 1200 potřebných přepočtů a stejné matice/bounds. [Přesný rozsah této CPU evidence](performance/transform-updates-20261011.md); nejde o měření celé hry ani FPS.

Barevné lakované části sdílejí původní LOD zdroje a používají per-instance lineární barvu. Native dispatch fixture prokázala **6 → 3 paint draws při stejných 215 892 odeslaných indexech**, včetně správných Float32 barev, shaderových atributů a zrcadlené regular větve. Opravené je také Babylon 9.30 rozlišení barev u medium/far native LOD. [Primární API, testy, PBR/texture shoda a omezení](performance/car-paint-instances-20261011.md). Toto není snížení celkových draw calls celé hry o polovinu. Modely, textury, kolize a jejich rozměry se nemění.

**Praktická kontrola skutečného Game a Rapieru:** denní i noční sekvence dokončila přípravu, nastoupení, W/A/D, brzdění, zpátečku, vystoupení a opětovné nastoupení. Po jediné výslovné přípravě pěší postavy nepoužívala teleport ani přímý zápis polohy auta. Kontrolovala již vykreslené world cache a dříve zachycené bounds; žádným force-refresh neopravovala stav před měřením.

| Celá herní scéna, medium, Intel UHD 630, CSS/render 890×720 | Den 10:00 UTC | Noc 00:00 UTC |
| --- | ---: | ---: |
| Skutečné fyzikální kroky | 271 | 272 |
| Projetá délka | 3,958 m | 3,866 m |
| Kontrolované vykreslené snímky | 208 | 233 |
| Vzorky world matic / bounds | 6410 / 5376 | 7166 / 6011 |
| Maximální zjištěná odchylka matic / bounds | 0 / 0 | 0 / 0 |
| Shaderové / assetové chyby | 0 / 0 | 0 / 0 |

Oba běhy viděly všechna čtyři kola v parked i driving reprezentaci, žádný kontrolovaný snímek neztratil zobrazený rig. Jednokrokové přesahy fází při pevném physics catch-up zůstávají v raw datech, nikoli přepsané na plán. [Denní záznam](verification-evidence/pilot-20261011-n/vehicle-drive-day.json), [noční záznam](verification-evidence/pilot-20261011-n/vehicle-drive-night.json), [denní snímek](verification-evidence/pilot-20261011-n/vehicle-drive-day.png), [noční snímek](verification-evidence/pilot-20261011-n/vehicle-drive-night.png). Jde o funkční QA jednoho lokálního hráče, nikoli produkční multiplayerový FPS interval.

Skutečný GPU review navíc prošel low/medium/high a dočasně zrcadlenou právě aktivní lakovanou část `photo-central-bay-1`. Její lak zůstal vykreslený, 0 shader/asset chyb. Zrcadlení bylo samostatnou vizuální zkouškou a před jízdou obnoveno; kolize se neměnily. [Snímky a stavy](verification-evidence/pilot-20261011-n/), [konzole po ukončení](verification-evidence/pilot-20261011-n/browser-qa-console-after-stop.json). Počáteční QA HTML postrádalo povinný label layer a selhalo před spuštěním Game; [původní chyba](verification-evidence/pilot-20261011-n/initial-harness-error.json) je zachovaná a oprava se týká pouze testovací stránky. Není vydávána za shaderovou vadu N. Finální QA HTML SHA `5fef14b29dccc297a2eb7829df565c1cfb556f65b3a5dcacb4ed02473a65b087`, TS SHA `bf757ab3fd2f5c3f9566d84f66bc0c98d6496120cfcdc093a3cc436a70599b9c`; docs harness je samostatný od runtime source ID.

Také produkční bundle s HUD a jednou skutečnou multiplayerovou relací byl načten: **medium, CSS/render 1280×720, Intel UHD 630**, aktuální čas a označený denní náhled, bez nové chyby konzole. [Protokol](verification-evidence/pilot-20261011-n/production-smoke.json), [produkční snímek](verification-evidence/pilot-20261011-n/production-medium-day.png). **Historický stav při předání N:** port 4179 obsluhoval N a lokální sběr očekával přesné ID N; při výměně předchozího M6 nebyla připojená žádná relace. Řízené GPU scény byly po kontrole zavřené.

**Veřejná přejímka 60 FPS klienta na cílové GeForce za dne a s více hráči zůstává otevřená.** Uživatelská diagnostika zůstává pouze místní; její data se do tohoto archivu nenahrávají. Úspora native operací není důkaz dosaženého FPS ani optimálnosti celého rendereru. Všechny další modelové a výtvarné limity zůstávají v přejímce. Veřejné nasazení se neprovádí.

## Checkpoint M6 · integrovaný pilot a klientské ověření

M6 `c21932439374f0bf23e7a8d514aecb88ef9552c2e89d5e3e2890e4b71da8b896` prošel **403/403 testy, produkčním buildem a izolovanou integrací**, vše exit 0 (11. 10. 2026 15:49:31–15:51:49 UTC; 78,019 / 41,867 / 18,179 s). Nezávislý audit skutečně hashoval **8144 live + 8144 frozen souborů**, včetně 80 testových souborů v každém stromu: **0 neshod a chyb**. [Výsledky a úplné logy](verification-evidence/pilot-20261011-m6/results.json), [SHA audit](verification-evidence/pilot-20261011-m6/source-check.json).

Zahrnuje tlumenější materiály, sdílené oči, texturované krátké účesy Alex/Sam, opravené medium brýle a Samovo ucho, cache render kandidátů a výběru trávy, přesný CPU profil a diagnostiku skutečného WebGL kontextu. Přidaná [oprava vnitřní near plochy auta](vehicle-pilot-repair-20261011.md) mění jedinou diagonálu, nikoli polohy vrcholů, textury nebo fyziku; stejná oprava je v editovatelném masteru. [Aktuální strukturální inventář](model-review/authored-glb-audit.json): 158 GLB, 0 strukturálních chyb; 161 degenerátů patří původnímu autobusu. Vizuální věrnost všech modelů tím není přijata.

M4 měl **402/402 technický PASS, ale následný component QA FAIL** při samostatném spuštění vysokého detailu: chyběla explicitní registrace postprocess scene component. [Původní selhání a reprodukce](verification-evidence/pilot-20261011-m4/results.json) zůstávají zachované. M5 je [mezikrok bez plné pipeline](verification-evidence/pilot-20261011-m5/results.json), který registraci opravuje; M6 přidává silnější regresi ověřující manager ještě před konstrukcí pipeline. Stejný test proti M4 správně selže, proti aktuální implementaci projde. [Pozitivní i negativní kontrola](verification-evidence/cinematic-pipeline-contract-20261011/results.json).

Skutečná **produkční hra s HUD a jednou multiplayerovou relací** se načetla na low, přepnula na high s denním náhledem a zpět na medium se skutečným časem. CSS i interní rozlišení při high/medium bylo **1280×720**, skutečný adaptér **Intel UHD 630**. V aktuálním intervalu nebyla nová console warning/error; jediná zachycená stará chyba patřila dřívějšímu M4 náhledu a je výslovně oddělená. [Protokol a omezení](verification-evidence/pilot-20261011-m6/production-smoke.json), [high / den](verification-evidence/pilot-20261011-m6/production-high-day.png), [medium / skutečný čas](verification-evidence/pilot-20261011-m6/production-medium-current-time.png). Nešlo o FPS přejímku ani opakování všech pěších/jízdních tras; ty mají vlastní dřívější důkazy níže.

**Hlavní cíl zůstává 60 FPS klienta na GeForce GTX 1060. Nové měření na této kartě chybí.** Instalovaná karta, serverové Hz, NullEngine, technický PASS ani okamžité HUD číslo cíl nedokazují. Přínos cache pro FPS se dosud nevyčísluje. **Historický stav při předání M6:** port 4179 byl po ověření nulového počtu připojených relací aktualizován na M6; lokální sběr vracel přesné ID M6 a výsledky ukládal pouze do ignorované `.cache`. Před uživatelským měřením byly řízené 3D scény zavřené. Ovládání samostatného Edge nebylo nástroji dostupné; vynucení GeForce se netvrdí.

## Checkpoint M3 · texturované krátké vlasy a stabilní identita postav

M3 `761f0f3436c7479126ecd2fc3dcc9231b6040d41371d5f9b1d560b855a021d65` prošel **399/399 testy, produkčním buildem a izolovanou integrací**, vše exit 0 (11. 10. 2026 15:01:12–15:03:21 UTC). Nezávislý audit následně hashoval **8139 live + 8139 frozen souborů**, včetně 78 testových souborů v každém stromu: 0 neshod a chyb. [Výsledky a logy](verification-evidence/pilot-20261011-m3/results.json), [SHA audit](verification-evidence/pilot-20261011-m3/source-check.json).

Alex a Sam používají ve skutečné herní factory sdílené CC0 pramenné účesy se zachovanými původními atlasy, paletou editoru a LOD. Brýle zůstávají viditelné i ve středním detailu a nezvětšují far proxy. Praktický GPU review zkontroloval tmavou/blond variantu, profily, zadní siluety, brýle a medium přechod. Nalezený pramen před tragusem Sama se opravil podle úplných původních face-setů ucha: předchozí výběr vynechal 86 vrcholů. Původní zdroj, hlava a bitmapy zůstaly nezměněné. Paprsky reprodukují 36/64 překrytí před opravou a 0/64 po ní; následné skutečné GPU snímky potvrzují odkryté ucho. [Provenience, přesná oprava a omezení](pilot-hair-20261011.md), [GPU po opravě](verification-evidence/pilot-hair-20261011/sam-ear-fixed-blond-glasses-medium.png), [nový Alex](verification-evidence/pilot-hair-20261011/alex-near-front.png).

Vizuální QA používala Intel UHD 630 a není FPS důkaz. **60 FPS klienta na GeForce GTX 1060 stále čeká na měření; technický PASS ani samostatný avatarový náhled tento cíl nepotvrzují.** Čtyři zbývající účesy, společná základna obličejů, vpečené světlo zdrojových vlasových atlasů a další otevřené modelové vady se tímto krokem neoznačují za dokončené. Následující car oprava má vlastní checkpoint a není součástí M3.

## Checkpoint M2 · méně prázdných kandidátů rendereru

M2 `868d6898dbe813ae2c9170beb3f629c8b890c5ec1766abb40a7ab8bca185f435` prošel **390/390 testy, buildem a izolovanou integrací**, vše exit 0 (11. 10. 2026 14:23:27–14:25:29 UTC). Následný audit skutečně přečetl a hashoval všech **8109 zmrazených souborů**, včetně 74 testových souborů a 7038 IPR podkladů: 0 neshod/chyb. [Výsledky](verification-evidence/pilot-20261011-m2/results.json), [frozen SHA audit](verification-evidence/pilot-20261011-m2/source-check.json). Pozdější živé soubory s novými účesy nejsou vydávané za shodné s M2.

Renderer nyní předává Babylonu cache efektivně povolených meshů. Zachovává původní pořadí, neviditelné zdroje instancí, nativní LOD i okamžité přidávání/odstraňování; žádný vrchol ani rozměr kolizí se touto optimalizací nemění. Cílené regrese ověřily shodný nativní camera/shadow dispatch před a po změně, včetně thin/regular instancí, záporného měřítka, rodičovského enabled a streamovaných meshů. [Implementace a hranice důkazů](performance/active-mesh-candidates-20261011.md).

Skutečná browserová kontrola stejného M2 dokončila **18/18 úseků venek–recepce B6–venek**, 1226 fyzikálních kroků, bez skoku a bez teleportů po jediné výslovné přípravě počátku. Vstup byl viditelný už před schody; všech 18 kontrolních bodů mělo 6/6 vstupních částí a 73/73 částí obalu, 0 chyb shaderů/assetů. [Záznam včetně hashů QA harnessu](verification-evidence/pilot-20261011-m2/b6-walk-medium.json), [vstup před schody](verification-evidence/pilot-20261011-m2/b6-before-steps.png). Celá Game scéna ve standalone režimu, medium, Intel UHD 630; jde o funkční/vizuální QA, nikoli výkonový test produkčního HUD nebo GeForce.

M2 doplňuje i jednorázové skutečné canvas AA/sample údaje a lokální numerický whitelist CPU rozkladu. **GPU/FPS efekt cache není dosud změřený a 60 FPS na GeForce není potvrzených.** Rozpracované texturované krátké vlasy pro Alexe/Sama patří navazujícímu checkpointu; ani technický PASS M2 nepřijímá jejich vizuální nebo výkonovou kvalitu.

## Pilot M · materiály, oči a přesný profil klienta (11. 10. 2026)

Zmrazený checkpoint M `c88f33c4baa80a1d6322b0551c555cb76b4912a4e5995f6d91af2ea06a188ea9` prošel **384/384 testy, produkčním buildem a izolovanou integrací**, vše exit 0. Nezávislý SHA audit skutečně hashoval 8107 živých a 8107 zmrazených souborů, včetně 73 testových souborů v každém stromu: 0 neshod. [Výsledky a logy](verification-evidence/pilot-20261011-m/results.json), [SHA audit](verification-evidence/pilot-20261011-m/source-check.json).

M přidává tlumenější fotografický detail povrchů se zachovanými původními texturami/UV, jednu místo dvou oktáv výtvarného šumu, fitované sdílené oči i ve středním LOD a přesnou akumulaci CPU render průchodů s ověřeným odpojením observerů. [Materiály a provenience](pilot-surfaces-20261011.md), [postavy a GPU snímky](pilot-avatars-20261011.md), [malá CPU úspora výběru trávy](pilot-render-performance-20261011.md). Geometrie světa a kolize nejsou tímto checkpointem měněné.

Veškeré níže uvedené dosavadní GPU výsledky jsou **Intel UHD 630, nikoli GeForce**. Celá produkční hra, HUD, low, CSS 1920×1080, interně 1476×830, skutečné relace a šest různých presetů. Zdrojové ID je v každém JSON; všechny uvedené intervaly mají nulové shaderové/asset chyby.

| M | FPS v jednotlivých 10s intervalech | p95 / p99 ms |
| --- | --- | --- |
| 1 hráč, den | 34,7 / 34,6 / 34,8 | 33,0–35,4 / 36,8–39,9 |
| 30 hráčů, den | 30,9 / 30,0 / 31,7 | 36,3–44,0 / 39,5–53,3 |
| 30 hráčů, noc, jediný interval | 35,4 | 31,8 / 35,9 |

[Jednotlivé raw záznamy](performance/evidence/pilot-20261011-m/), [ověřený baseline L2](performance/evidence/pilot-20261011-m/baseline-readme.md). Počasí a astronomický náhled byly řízené, ale PID/ambientní simulace dál používala skutečný čas: M jednohráčové intervaly měly 3–6 NPC cestujících, baseline žádné. Proto se z nich **neodvozuje izolované procento zrychlení**. Denní třicetihráčové M intervaly měly 0 ambientních vozů/cestujících. Výběr aktivních meshů zabíral přibližně 5–7 ms CPU; následná konzervativní cache kandidátů je rozpracovaný další checkpoint, není součástí ověřeného M.

Síťová kohorta M měla 29 pohybujících se SDK klientů plus browser, 58 authority resync flagů a 0 aplikačních chyb. Browser byl při přechodu na GeForce zavřen před stop-file ukončením kohorty; její celkové minimum proto je 29, maximum 30. Celou kohortu nelze vydávat za stálou populaci 30 ani za síťovou stabilitu. Samotné uvedené GPU intervaly zaznamenaly minimum 30 avatarů po celou dobu. Vyloučené/discovery soubory baseline zůstávají zachované a nejsou započtené.

**Priorita upřesněná uživatelem: 60 FPS klienta na jeho GeForce GTX 1060.** Intel výsledky jsou doplňková diagnostika, nepředstavují splnění tohoto cíle. Připravené místní měření M v Chrome/Edge čeká na potvrzení skutečného rendereru; instalovaná karta se nevydává za použitou. Nové GeForce měření zatím chybí. Technický PASS M ani nové oči neznamenají hotové všechny účesy, obličeje, terénní styky nebo dokončenou výtvarnou kvalitu pilotu.

## Publikovaná verze L2

**Checkpoint L2 prošel 372/372 testy, produkčním buildem včetně TypeScript a izolovanou síťovou integrací; všechny příkazy skončily exit 0.** Zdrojové ID: `c4586de83cef2b7406122c75eed04abf89796765cc338c0b7dabc92a9c7ad658`, 8060 souborů. Následný SHA audit zkontroloval 8060 živých + 8060 zmrazených souborů bez neshody. Jde o zdroje klienta, serveru, společné logiky, assetů, skriptů, testů a konfigurace; dokumentace není součástí tohoto zdrojového hashe.

[Výsledky](verification-evidence/github-demo-20261011-l2/results.json), [pipeline a logy](verification-evidence/github-demo-20261011-l2/pipeline-results.json), [přejímka a omezení](releases/demo-2026-10-11.md). Původní [L](verification-evidence/github-demo-20261011-l/results.json) má 370/372 a zůstává neúspěšný. L2 zahrnuje nové značení, oporu bot, dělení statického terénu a opravu 16 archivních podezdívek. Nové srovnatelné měření GPU zatím není k dispozici.

## Historický ověřený checkpoint K4

Historický technický checkpoint **K4** (`441bbcd3b3f861e01fbcde498cff75ba3f332671eb361078d62143b725b5a687`, 8066 souborů) prošel **352/352 testy, buildem, izolovanou integrací a SHA auditem 8066 živých + 8066 zmrazených souborů bez neshod**. Modely, textury a geometrie jsou proti K3 byte-identické. [Úplný K4 protokol](performance/render-order-material-budget-20261011-k4.md), [výsledky](verification-evidence/render-order-material-budget-20261011-k4/results.json).

Sedm platných GPU intervalů na Intel UHD 630 / low / CSS 1920×1080 / render 1476×830: jeden avatar den **35,8 / 35,6 / 35,6 FPS**, třicet den **32,5 / 31,7 / 32,4**, třicet noc jednou **35,7**. Všechny mají 0 shader/asset chyb. Denní p95 **35,0 / 40,2 / 35,3 ms** stále nesplňuje přísnou 30FPS přejímku; cíl 60 FPS nesplněn. První SDK běh měl 29 authority flagů, opakovaný 0, oba přesně 30 účastníků. Interval po deadline se nepočítá. Místní uživatelská měření se nepublikují; veřejné NVIDIA měření K4/30 hráčů není k dispozici. K3 kontrolní série není přesné A/B kvůli rozdílnému provozu/stínům. Prostorové dělení K5 je zahrnuté v L2 s regresními testy; nové GPU měření a další vizuální studie zůstávají otevřené.

## Historický ověřený checkpoint K3

Historický technický checkpoint **K3** má SHA-256 **`e91aa84ec7d77949b2db706091fa66c603777faa13daa8ed998ff0871b390c9b`**, **8062 souborů**. Prošel **346/346 testy, produkčním buildem včetně TypeScript a izolovanou SDK/HTTP integrací**, vše exit 0. Následný audit 11. 10. 2026 v **08:19:54 UTC** ověřil **8062 živých + 8062 zmrazených souborů, 0 neshod**. To je stav konkrétního snapshotu; novější K4 má vlastní ověření uvedené výše.

| Sekvenční příkaz nad K3 | Výsledek | Doba příkazu |
| --- | --- | ---: |
| `pnpm test` | 346 PASS, 0 FAIL/skipped/cancelled/todo | 53,2766 s; runner 52,1150 s |
| `pnpm build` | TypeScript a produkční Vite build PASS | 33,7204 s |
| `pnpm test:integration` | izolovaný server, SDK/HTTP kontroly PASS | 23,0267 s |

[Výsledky K3](verification-evidence/shadow-reserve-wheel-repair-20261011-k3/results.json), [pipeline](verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-results.json), [manifest](verification-evidence/shadow-reserve-wheel-repair-20261011-k3/source-manifest.json), [SHA audit](verification-evidence/shadow-reserve-wheel-repair-20261011-k3/source-check.json) a úplné [testové](verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-test.log), [buildové](verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-build.log) a [integrační logy](verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-test-integration.log) jsou publikované. [GPU/síťový protokol K3](performance/shadow-reserve-wheel-repair-20261011-k3.md) výslovně ponechává výkonové cíle a stabilní noční síť nesplněné.

Neúspěšné [K](verification-evidence/shadow-reserve-wheel-repair-20261011-k/results.json) a [K2](verification-evidence/shadow-reserve-wheel-repair-20261011-k2/results.json) zůstávají zachované. K byl smoke-warning checkpoint s opakovaným `receiveShadows` warningem, bez buildu/integrace. K2 skončil **345/346 PASS, 1 FAIL**, 101,0141 s, bez následného buildu/integrace: chyběl `docs` weld audit v balíčku. K3 přidává byte-identický kanonický audit do asset sources; [původní neúspěšný K2 log](verification-evidence/shadow-reserve-wheel-repair-20261011-k2/pipeline-test.log) se nepřepisuje. Technický PASS není dokončení veškeré vizuální věrnosti nebo všech požadavků zadání.

## Historické ověření J, I a H

Stav 11. 10. 2026. Zmrazený checkpoint **J** má SHA-256 **`cd44b8d901261fc8a67c7080aa014595f3655f08153982418ba406ad574d2a33`**, **8050 souborů**. **335/335 testů PASS, produkční build včetně striktního TypeScript PASS, izolovaná síťová integrace PASS**; všechny tři kroky skončily exit 0. J je ověřený technický checkpoint, nikoli prohlášení o dokončení veškeré vizuální věrnosti nebo výkonových cílů.

| Sekvenční příkaz nad zmrazeným J | Výsledek | Doba příkazu |
| --- | --- | ---: |
| `pnpm test` | 335 PASS, 0 FAIL/skipped/cancelled/todo | 51,7324 s; vlastní test runner 50,7256 s |
| `pnpm build` | striktní TypeScript a produkční Vite build PASS | 35,5009 s |
| `pnpm test:integration` | izolovaný server a skutečné SDK/HTTP kontroly PASS | 17,9821 s |

Zdrojový snapshot je `.cache/performance-snapshot/faithful-world-repairs-20261011-j`. [Výsledky](verification-evidence/faithful-world-repairs-20261011-j/results.json), [příkazy a doby](verification-evidence/faithful-world-repairs-20261011-j/pipeline-results.json), [manifest](verification-evidence/faithful-world-repairs-20261011-j/source-manifest.json) a úplné [testové](verification-evidence/faithful-world-repairs-20261011-j/pipeline-test.log), [buildové](verification-evidence/faithful-world-repairs-20261011-j/pipeline-build.log) a [integrační logy](verification-evidence/faithful-world-repairs-20261011-j/pipeline-test-integration.log) jsou publikované. Následný [SHA audit](verification-evidence/faithful-world-repairs-20261011-j/source-check.json) prošel: **8050 živých + 8050 zmrazených souborů, 0 neshod**, zkontrolováno 11. 10. 2026 v 06:37:44 UTC. Pozdější práce na K tento neměnný výsledek J nepřepisuje.

Předchozí checkpoint **I** (`d9baf093defe543c53facbf3c19fe22453e431a5e16e07236229ed6d3e706352`, **8049 souborů**) skončil **330/334 PASS, 4 FAIL**, za **50,3948 s**. Produkční build ani izolovaná integrace po tomto selhání neběžely. I zůstává zachovaný jako neúspěšný kontrolní bod; pozdější J jeho výsledek nepřepisuje.

Dva nalezené zastaralé kontrakty byly opravené se zachováním původní přesnosti: 380 původních OSM úseků se ověřuje odděleně od přidané doložené B6 spojky; množina kořenů hřišť vychází z přesných zdrojových ID šesti kurtů a samostatné střechy Marketu. Cílené opakování obou souborů prošlo **5/5**, později i celý J. Opravené jsou rovněž fingerprint vegetace a zabalení licence anatomické základny. Počet 335 místo 334 vysvětluje nově přidaná vyčerpávající regrese 35cm odstupu trávy od skutečných povrchů; licenční kontrola už existovala a byla opravená.

Poslední starší uzavřený souhrnný běh **H** měl **269/269 PASS**, build a izolovanou integraci PASS, ale obsahoval předchozí schodiště, postavy a další modely. [H: přesné příkazy, zdrojové ID a logy](verification-evidence/authored-social-pilot-20261011-h/README.md). Starší F se 136 testy není aktuální přejímka; jeho neúspěšný browser start je zachovaný v [historickém auditu F](performance/reality-pack-20261010-f.md).

## Aktuální cílené kontroly

Tyto běhy mají rozdílný rozsah a některé stejné testy. Jejich počty se nesčítají jako unikátní testy ani jako úspěšný souhrnný běh K3.

| Oblast | Skutečné ověření | Výsledek a hranice |
| --- | --- | --- |
| Postavy a oblečení | Souvislá CC0 anatomie, skutečné bone matice, šité MakeHuman oděvy, mužské/ženské fity, barvy, LOD, váhy, manžety při idle→wave a likvidace sdílených zdrojů | **31/31 PASS**; [oděvy, finální logika a GPU snímky](characters/student-garments/README.md). Procedurální IK není mocap ani hotová AAA animace. |
| Noc, lampy a reflektor | Přesný okamžik 02:00 Praha, obzor a fáze Měsíce, transformace reflektoru, skutečné PBR light slots včetně B6, low/medium/high stíny a lifecycle | **36/36 PASS**; [příkaz a log](vehicles/headlights.md). Oddělený dřívější 38testový noční běh se do těchto 36 nepřičítá. |
| B6, architektura a navigace | 12 venkovních stupňů, dvě lomená jádra, 222 modelových dveřních tras, 210 ilustrativních ložnic, obal/okna/stropy, průchod k recepci, 18 pěších tras a zdrojové SHA | **36/36 PASS**, následně **3/3 PASS** po doplnění light getteru a copyrightu navigace. Jde o 39 úspěšných provedení s překryvem, nikoli 39 unikátních testů. [Číselné výsledky](reality-pack/b6/stair-photo-verification.json). |
| Severní kurt a dlažba | Lokální TIN s 3m návazným apronem, více než 3000 skutečných Rapier raycastů, shoda sampleru/collideru/drapovaných ploch, chůze kurt–okolí i chodník–recepce–zpět | **28/28 PASS** společného cíleného běhu; [ověření a zdrojové SHA](reality-pack/terrain/court-repair/verification.json). Všechny základové výšky budov beze změny. |
| Samostatné modely budov | Skutečných 121 GLB, 190 863 trojúhelníků, 3976 kanonických B6 boxových částí, normály, zdrojová identita, SHA, UV a znovuotevření B6 `.blend` | **PASS**, 0 nulových ploch a 0 přesně duplicitních neprůhledných trojúhelníků; [audit](reality-pack/separate-assets/README.md). Částečné překryvy a fotografickou podobnost samotný tento audit nedokazuje. |
| Venkovní beton B6 | Stejná runtime/archive factory, originální CC0 color/NormalGL/roughness, sRGB-to-linear tint, opakování 1,10×0,55 m, normal 0,27, opaque/culling | **PASS ve skutečně serializovaném GLB i reopen `.blend`**; [materiálový audit](reality-pack/separate-assets/b6-exterior-concrete-audit.json). Žádné přepékání světla z fotografie ani druhá geometrická vrstva. |
| Auta | Skutečně načtené CC0 GLB, 26 částí, čtyři samostatná kola, fyzické rozměry, grounding, paleta a LOD; post-export topologie 32 medium/far wheel částí | **11/11 PASS** pack/topologie; [wheel oprava](vehicles/wheel-repair.md). Near/master i J body/PBR/obrázky zůstaly stejné. Low sdílí pět stínových geometrií. Malý near vnitřní fold a samostatné far body/arch vady zůstávají otevřené. |
| Celkový geometrický inventář | 158 skutečných veřejných GLB, oddělené modelové identity, strukturální data a normály | Strukturální chyby 0; 161 degenerovaných trojúhelníků pouze v zachovaném neměnném zdrojovém autobusu. Všech 121 stavebních archivů má 0 trojúhelníků proti normálám. [Podrobný audit](model-review/authored-glb-audit.json). Počet modelů není důkaz věrnosti každého objektu. |

Mapa obsahuje **109 individuálních stromů**, **6 hřišť** a **38 lamp**. Stromy nejsou úplným botanickým inventářem: 47 poloh pochází z mapových uzlů a 62 korun z fotografické interpretace. Lampy tvoří 36 OSM bodů a dvě samostatně zdokumentované identifikace z ortofota. Výšky, druhy a materiálové odstíny mají vlastní míru nejistoty; tato čísla nejsou tvrzením o dnešním skutečném stavu areálu.

## Skutečný prohlížeč a průchod celou hrou

Diagnostika `/docs/verification/world-walk.html` používá skutečný `Game`, renderer, HUD, assety a fyziku. Pouze počáteční umístění je diagnostická příprava; následné úseky používají skutečné vstupy a kolize, bez skoku nebo záchranného teleportování.

- Medium průchod venek→vstup→recepce→venek dokončil **18/18 úseků**, `ready=true`, **0 shaderových a 0 asset chyb**. Vstup zůstával 6/6 a neprůhledný obal 73/73 viditelný. [Strojový záznam](verification-evidence/b6-entry-world/roundtrip-medium-current.json), [snímek návratu](verification-evidence/b6-entry-world/roundtrip-medium-current.png).
- Po opravě betonu proběhly skutečné low/medium/high GPU close-upy: vstup 6/6, obal 73/73, 0 shader/asset chyb. [High záznam](verification-evidence/b6-entry-world/concrete-high-after.json), [medium snímek](verification-evidence/b6-entry-world/concrete-medium-after.png).
- Nativní vstupy prověřily A/D, skutečné tažení myší a V první/třetí osoby. [Záznam ovládání](verification-evidence/b6-entry-world/controls-native.json). Numerická regrese projekce zároveň ověřuje A vlevo a D vpravo při různém natočení pravotočivé kamery.
- Noční auto bylo skutečně ovládané a kamera otočená myší; reflektor byl aktivní s konečným směrem a stínovým targetem. [Noční záznam](verification-evidence/night-driving/driving-medium.json), [otočená kamera](verification-evidence/night-driving/camera-orbit-medium.png). Noční okamžik **11. 10. 2026 02:00 Europe/Prague = 00:00 UTC** ponechává Slunce i Měsíc pod horizontem; [astronomický audit](weather/night-lighting-audit.json).
- Severní kurt a návazná dlažba se načetly také v celé scéně, bez shader/asset chyb. [Záznam](verification-evidence/north-court-world/high-close-current.json), [snímek](verification-evidence/north-court-world/high-close-current.png).

Tyto prohlídky použily **Intel UHD 630 v IAB** a nejsou FPS benchmarkem ani měřením uživatelovy GeForce v Chrome/Edge. Samostatné avatarové, automobilové a světelné náhledy dokládají svůj vzhled a kompilaci shaderů; nepředstavují výkon celé produkční hry se třiceti lidmi.

## Multiplayer, host a funkční rozsah

Všichni připojení patří do jednoho světa, žádné skupiny po osmi. Dvě skutečné SDK relace v izolované integraci **J** ověřily pohyb a společné auto, nastoupení/vystoupení, brzdu/couvání, odpojení a obnovení relace. Globální, místní a událostní chat mají serverová oprávnění; soukromé zprávy vyžadují přijatou žádost. Blokování, ztlumení a frekvenční limity mají vlastní regresní kontroly; integrace J ověřila globální/DM chat, souhlas a explicitní odmítnutí blokované zprávy. SDK integrace není browserovým testem všech podob rozhraní ani měřením internetové latence.

Host je samostatný: žádná multiplayerová přítomnost či zprávy, odmítnutí hostovských multiplayerových relací i soukromých HTTP dotazů. Veřejné health nevrací počty hráčů ani world ID. Není IS, ověřování bydliště, heslo, účet ani skutečný studentský profil.

Fiktivní akce navázané na pražský den jsou dostupné přes Teď/Dnes/Tento týden, mapu, filtry a detail bez chůze areálem. Stav plánovaná/probíhající/skončená/zrušená událost, vlastnictví setkání vázané na dočasnou relaci, dobrovolné zájmy a hledání společnosti mají regresní kontroly. Virtuální přítomnost není skutečná návštěva. Hostovy sólové úkoly, společná hledací výzva, týmový kvíz a kosmetické odznaky nevyžadují skutečné profily ani ekonomiku.

PID 143/149 používá statický GTFS platný **10.–23. 10. 2026**; časy, směry a trasy se nevydávají za živé polohy nebo zpoždění. 18 pěších cest vede od dvou zastávkových směrů k devíti modelovým vstupům; B6 explicitně používá diagonální dlážděnou spojku. Cestující, obsazenost aut i rozsvícená okna jsou simulované.

## Výkon a hardwarové hranice

**K3 na Intel UHD 630 nesplnil cíl 60 FPS ani přísnou přejímku 30 avatarů (průměr≥30 FPS a p95≤33,3 ms v každém platném vzorku).** Všech sedm platných GPU vzorků celé hry mělo low, CSS 1920×1080, interně 1476×830 a 0 shaderových/asset chyb.

| K3 / Intel UHD 630 / low | Platné vzorky | Průměr FPS | p95 / p99 ms |
| --- | ---: | --- | --- |
| Den, 1 avatar | 3 | 28,2 / 28,2 / 28,2 | 49,3–49,6 / 50,8–51,1 |
| Den, 30 avatarů | 3 | 25,0 / 26,5 / 27,3 | 41,3–52,9 / 47,2–58,1 |
| Noc, 30 avatarů | 1 | 27,9 | 41,7 / 54,1 |

[Úplný protokol K3](performance/shadow-reserve-wheel-repair-20261011-k3.md), [strojové shrnutí](performance/evidence/shadow-reserve-wheel-repair-20261011-k3/summary.json). Přechodný noční soubor s jedním avatarem po deadline je **vyloučený z 30-avatarových důkazů**. Platná noc pochází až z obnovené 180s kohorty. Denní 600s síť měla 30 motion řádků, 29 pohybujících se SDK klientů, 0 resync/chyb. Noční 180s běh zachoval 30 řádků/29 pohybujících se klientů, ale přijal **58 authority resync flagů**; noční stabilita se netvrdí.

[Vyšetření reconnectu](performance/network-rejoin-study/README.md) nepotvrdilo ghost collidery po odpojení. Dva globální catch-up dropy pro 29 klientů jsou podpořená **inference** z časové korelace s event-loop maximem 218,8 ms. Přesný důvod záseku ani každý resync callback přímo vysledovaný není; platný noční GPU interval incident obsahoval. Místní uživatelské diagnostiky nejsou součástí tohoto veřejného protokolu. K4 (nulová clearcoat větev/opaque sort) má vlastní pipeline a měření výše. Historické J přibližně 26 FPS proti K3 28,2 FPS pro jednoho hráče ve dne není přísně izolované GPU A/B se stejným počasím.

### Historické měření J a H

**J má platná měření celé produkční hry pro 1 i 30 avatarů na Intel UHD 630; výkonový cíl nesplnil.** Všechny vzorky používají low, CSS **1920×1080**, interně **1476×830**, skutečné relace a HUD, bez shaderových nebo asset chyb. Přísné přijetí pro 30 avatarů vyžaduje současně průměr alespoň 30 FPS a p95 nejvýše 33,3 ms v každém platném vzorku. Noční průměr 30,0 FPS s p95 36,1 ms proto není PASS. Cíle 60 nebo 144 FPS rovněž nebyly dosažené; NVIDIA vzorek zatím chybí.

| J / Intel UHD 630 / low | Platné vzorky | Průměr FPS | p95 / p99 ms | Výsledek |
| --- | ---: | --- | --- | --- |
| Den, 1 avatar | 3 | 25,8 / 25,7 / 26,0 | 40,4–43,3 / 45,0–53,4 | Pod 30 i 60 FPS |
| Den, 30 avatarů | 3 | 23,9 / 24,4 / 24,7 | 55,5–57,1 / 56,6–60,6 | Přísný 30-avatarový cíl FAIL |
| Noc, 30 avatarů | 1 | 30,0 | 36,1 / 38,7 | Přísný cíl FAIL; pouze jediné opakování |

[Úplný protokol J a jednotlivé vzorky](performance/faithful-world-repairs-20261011-j.md), [strojové shrnutí](performance/evidence/faithful-world-repairs-20261011-j/summary.json). Denní náhled byl 11. 10. 2026 12:00 Praha; noční benchmark **12. 10. 2026 00:00 Praha** (`1791756000000`, UTC 11. 10. 22:00). To je jiný okamžik než regresní a vizuální QA **11. 10. 02:00 Praha** uvedené výše.

Všechny čtyři 30-avatarové GPU intervaly leží celé uvnitř skutečného **600s síťového běhu J**: vždy 30 motion řádků, 29 pohybujících se SDK klientů plus browser, **60,001 Hz** simulace, **19,998 Hz** motion, **0 resync a 0 chyb**. Harness skončil důvodem `deadline`; úklid odpojil SDK relace a nezanechal otevřené spojení. [Síťový záznam J](performance/evidence/faithful-world-repairs-20261011-j/network-29-gpu-day.json). Síťový PASS a grafický FAIL jsou samostatné výsledky.

| Historický běh H | Skutečný výsledek | Rozsah |
| --- | --- | --- |
| Jediný hráč, low, Intel UHD 630 | **39,4 FPS**, p95 **38,4 ms**, p99 **41,8 ms**, 10 s / 394 snímků | CSS 1920×1080, interně 1476×830. [Původní vzorek](performance/evidence/authored-social-pilot-20261011-h/browser-1-low-day-a.json). Není to I/J ani NVIDIA. |
| 30 připojených účastníků společného světa | **59,997 Hz** serverového času, **19,999 Hz** motion, **0 resync**, 120 s | 29 SDK klientů a browserová relace, [síťový záznam](performance/evidence/authored-social-pilot-20261011-h/network-30-crowd-a.json). Platný síťový běh, žádný platný 30-avatarový GPU vzorek. |

Uživatel uvádí použití GeForce v Chrome/Edge; IAB nadále hlásí Intel. WebGL `high-performance` je požadavek, nikoli vynucení adaptéru. [GPU diagnostika](performance/gpu-selection.md) a lokální sběr benchmarku umožňují zaznamenat skutečný renderer, zdrojové ID, CSS/backbuffer, světelný okamžik, HUD, populaci, průměr i p95/p99. Prohlídka, jediné HUD číslo, CPU render a NullEngine nejsou důkazem GPU výkonu.

## Reprodukce

```powershell
pnpm test
pnpm build
pnpm test:integration
```

Spouštět sekvenčně nad stejným zmrazeným zdrojem; při selhání nedoplňovat neprovedený PASS. Integrační wrapper spustí vlastní server na 2568, nepoužívá hlavní server 2567 a svůj proces ukončí. [Lokální start a dva prohlížeče](../README.md), [celý rozsah přejímky](acceptance.md).

## Známá omezení

- **Věrnost a přesnost:** modely jsou interpretací map, originálního IPR skenu a identifikovaných fotografií, nikoli dokonalou fotogrammetrií. DMR a odvozený TIN nenahrazují nové zaměření obrub, každého stromu a vstupů. Mapové, fotografické a herní odhady zůstávají rozlišené.
- **Interiéry:** schéma B6 nemá kóty. Foto schodů je B3, část pokojových a hygienických předloh archivní či z jiného bloku. 210 modelových ložnic není inventář B6. Současná recepce, sociálky a ostatní bloky nemají kompletní současné fotodoložení ani všechny interiéry.
- **Postavy:** prototypové vlasy a společná základna hlavy, omezená mimika, drobný lem manžety, procedurální IK bez mocapu. Spojité švy a testy váhování nejsou zárukou každé extrémní pózy, prstového gesta nebo kontaktu boty se schodem. Kvalita Hogwarts Legacy není tvrzena.
- **Modelové vady a LOD:** malý přeložený trojúhelník vnitřního automobilového trimu čeká na izolovanou opravu. Neměnný původní autobus zachovává 161 zdrojových degenerátů. Vizuální přejímka všech přechodů detailu stromů, vlasů, oděvů a aut není dokončená. Nulový strukturální error neznamená dokonalou siluetu, materiály a návaznost každého modelu.
- **Světlo a živost:** lampy a reflektor používají omezený výtvarný PBR rozpočet; nejde o naměřenou fotometrii. Noc mimo dosah doložených lamp může být tmavá. Mraky/proudění jsou modelové, okna/cestující/provoz simulované; čerstvost stanice a meteorologického modelu je oddělená.
- **Výkon a kapacita:** K3 má sedm platných GPU vzorků na Intel, ale přísný cíl 30 FPS/p95 ani 60 FPS nesplnil. Noční síť má 58 authority resync flagů a nepotvrzuje bezchybnou stabilitu. NVIDIA J vzorek existuje, K4/30 hráčů na NVIDIA zatím ne. K4 má vlastní audit výše, K5 potřebuje další. Jeden společný svět má konečnou kapacitu; síťová a GPU čísla checkpointu se automaticky nepřenášejí na další. Predikce jednoho auta není úplný rollback všech kontaktů.
- **Dočasnost a další etapa:** serverový stav a setkání jsou v paměti a restart je ruší. Žádné IS, bydliště, skutečné profily, hlas, zabezpečená administrace, trvalá databáze, skutečný import komunitních akcí nebo veřejné nasazení. Přezdívka není ověřená identita.
