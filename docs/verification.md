# Ověření dema a známá omezení

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
