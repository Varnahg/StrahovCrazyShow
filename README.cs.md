# StrahovCrazyShow · hratelné demo

[English version](README.md)

Virtuální Strahov pro prohlížeč: kolejní areál podle map, ortofota a skutečného výškopisu, rekonstruovaný model interiéru B6, upravitelná postava, anonymní společný svět, přehled fiktivních akcí a společné aktivity. Vnější podoba bloků, návaznosti cest a průchodnost používají společné zdrojové podklady. [Reality Pack](docs/reality-pack/README.md) propojuje kontrolní náhledy, fotografie, Blender modely a hranice přesnosti.

**Hlavní hra používá samostatné modely s doloženým původem.** Historický 3D sken IPR je prostorová předloha, kterou lze samostatně prohlížet; jeho spojené stromy, auta ani povrchy se do hry nenačítají. Budovy, auta, stromy a hřiště mají vlastní identitu a transformaci. [Modely budov](docs/reality-pack/separate-assets/README.md), [jednotlivé stromy](docs/vegetation/realistic-pack.md), [kontrola modelů a terénu](docs/model-review/README.md).

Demo neobsahuje přihlášení přes IS, ověření bydliště ani skutečné studentské profily. Přezdívka je pouze označení dočasné relace. Přístup výhradně pro obyvatele Strahova se nevynucuje. Veřejné nasazení není součástí této verze.

## Současná verze

Repozitář obsahuje vývojové demo 0.1.0 a aktuální seznamovací MMO pilot. [Historická přejímka L2](docs/releases/demo-2026-10-11.md) popisuje dřívější vydání; nejnovější checkpoint je uvedený níže.

Aktuální ověřený pilot je **P5**, zdroj `4601a8c8f94775e37befda81976b1a8457a171be923dd5b24981847b7c34000e`. Prošel **471/471 testy a produkčním buildem**. Izolovaná integrace prošla opakováním beze změn po prvním timeoutu řízení; oba pokusy jsou zachované. SHA audit ověřil **8175 live + 8175 frozen souborů bez neshod**. [Přehled ověření](docs/verification.md), [evidence P5](docs/verification-evidence/pilot-20261011-p5/results.json). Místní testování: [http://127.0.0.1:4179/](http://127.0.0.1:4179/).

P5 opravuje převrácení nohou při skoku, přenáší pánev s fyzickou postavou za letu a připravuje chodidla na dopad. [Oprava a testy](docs/characters/locomotion-study/jump-repair-20261011.md) odlišují tento výsledek od zbývajícího prudkého otáčení a omezení skokové pózy vzdálených hráčů.

P3 přidává CZ/EN rozhraní včetně všech 36 článků deníku, kompaktní HUD s průsvitnými panely, pěší cíle a trasy sdílené velkou mapou a minimapou, svítilnu F, opravenou plynulost chodidel při rozběhu/zastavení a uzavřený vnější plášť stadionu. Fitované oči, účesy Alex/Sam, medium brýle, klidnější materiály a úspory rendereru zůstávají integrované. Historické N omezilo redundantní transformace a sdružilo barevné díly aut; O2 opravilo střešní kolize a bezpečný návrat postavy/auta a prošlo 433/433 testy. Aktuální protokol 7 vyžaduje shodnou verzi klienta a serveru. Historické výsledky L2/N/O2 nenahrazují vlastní ověření P3.

Společný anonymní svět, samostatný host, úprava postavy, akce a komunikace, mapa a deník, průchozí model B6, ovládání auta, astronomický cyklus a demonstrační PID doprava jsou hratelné. Vizuální věrnost, všechny interiéry ani kvalita postav srovnatelná s Hogwarts Legacy nejsou dokončené; filmová inspirace určuje náladu a čitelnost, nepřebírá cizí herní assety. **Denní a skupinová přejímka 60 FPS na GeForce GTX 1060 není ověřená; plná fotografická věrnost zůstává otevřená.** Uživatelské diagnostiky zůstávají místní a jejich data se do repozitáře nenahrávají. Podrobný stav požadavků je v [přejímacím seznamu](docs/acceptance.md), novější dílčí změny a jejich důkazy jsou odkazované níže.

## Lokální spuštění

Rozhraní pracovní verze podporuje češtinu a angličtinu. Jazyk přepneš na úvodní obrazovce nebo v Nastavení bez restartu světa či ztráty relace. Volba se ukládá v prohlížeči; při první návštěvě rozhoduje podporovaný jazyk prohlížeče, jinak angličtina. Přezdívky, chat a vlastní texty setkání se nepřekládají. Odkazy na původní zdroje zůstávají zachované. Tyto funkce jsou součástí P3; další změny vyžadují vlastní ověření.

Zamýšlený rozsah interiérů zahrnuje kolejní bloky, školicí centrum, R-ko a Potraviny; ostatní budovy mají pouze exteriér. Detailní B6 je dokončený v mezích dokumentované rekonstrukce; ostatní povolené interiéry nejsou hotové.

Potřebuješ **Git + Git LFS, Node.js 24 a pnpm 11.25.0**. Blender není ke hraní ani k běžnému sestavení potřeba; slouží k úpravě modelových zdrojů. Velké Blender/GLB soubory jsou v Git LFS, ostatní herní data jsou přímo v repozitáři. První klon je proto objemný (přibližně 2 GB modelů, podkladů a dokumentace, před instalací závislostí).

Klonování a první spuštění v PowerShellu nebo terminálu:

```powershell
git lfs install
git clone https://github.com/Varnahg/StrahovCrazyShow.git
cd StrahovCrazyShow
git lfs pull
pnpm install --frozen-lockfile
pnpm dev
```

Pokud `pnpm` ještě nemáš, nainstaluj jej po instalaci Node.js pomocí `npm install --global pnpm@11.25.0`. Pokud už pracuješ v tomto naklonovaném projektu, začni příkazem `git lfs pull`. GitHub ZIP není náhradou úplného klonu s LFS modely.

Nový klon standardně otevře `main`/L2. Popsané novější pilotní změny vyžadují checkout pracovní větve `codex/pilot-visuals-client-performance`, pokud ji máš ve svém klonu dostupnou; samotné klonování výchozí větve je nezahrnuje.

Otevři [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Vite obsluhuje klienta na **5173**, Colyseus/API server běží na **2567**. Klient používá Vite proxy `/api` a `/realtime`; server je v této etapě vázaný na místní počítač.

Samostatné spuštění v oddělených terminálech:

```powershell
pnpm dev:server
pnpm dev:client
```

Host se může procházet také při spuštění samotného `pnpm dev:client`. Bez serveru není dostupná aktuální odpověď počasí; astronomický cyklus, místní mapová data, uložený jízdní řád PID a sólové aktivity zůstávají nezávislé na multiplayeru.

### Vyzkoušení dvou hráčů

1. Spusť `pnpm dev` a otevři adresu ve dvou prohlížečích, případně ve dvou samostatných kartách.
2. Vyber odlišné přezdívky a v obou zvol **Vstoupit do společného světa**. Každá karta získá vlastní dočasnou relaci.
3. Ověř vzájemný pohyb a globální chat. Pro soukromou zprávu nejdříve odešli a přijmi žádost o kontakt.
4. Třetí kartu otevři jako **Prohlédnout si Strahov sám**: hráči a zprávy z multiplayeru se v ní neobjeví.

Všichni multiplayeroví účastníci patří do jedné instance světa. Nevytvářejí se skupiny po osmi. Vzdálené postavy mohou mít nižší grafický detail a popisky mají vlastní limit; tím se nemění společná přítomnost. Skutečná kapacita světa závisí na změřeném výkonu klienta, serveru a sítě.

## Ovládání

| Klávesa / vstup                 | Funkce                                               |
| ------------------------------- | ---------------------------------------------------- |
| Krátké levé kliknutí            | Výběr postavy nebo místa; v první osobě zachytit myš |
| Tažení levým / pravým tlačítkem | Otáčení kamery ve třetí osobě a v autě               |
| W A S D / šipky                 | Chůze; v autě plyn, brzda/zpátečka a řízení          |
| Shift                           | Běh                                                  |
| Mezerník                        | Skok; v autě ruční brzda                             |
| E                               | Blízká značka nebo úkol, nastoupit/vystoupit z auta  |
| V                               | První / třetí osoba                                  |
| F                               | Svítilna při chůzi                                   |
| M                               | Mapa                                                 |
| J                               | Deník Strahova                                       |
| G, potom 1–4                    | Rychlá gesta                                         |
| R                               | Bezpečný návrat na start                             |
| Kolečko myši                    | Vzdálenost kamery ve třetí osobě                     |
| Esc                             | Uvolnit kurzor pro rozhraní                          |

Auto začíná u startu. Jeden hráč může řídit sdílený vůz; ostatní vidí jeho pohyb. Používá dynamickou karoserii Rapier, čtyři raycastová kola, odpružení, řízení podle rychlosti, brzdy a CCD. S nejprve brzdí, po zastavení couvá; mezerník používá ruční brzdu. E dovolí vystoupit až po zastavení a nalezení volného místa. Po vystoupení vůz zůstává na místě jako překážka a lze znovu nastoupit; odpojení řidiče jej zaparkuje. Myš se rozhlíží nezávisle na volantu, V přepíná vzdálenost kamery auta. Jde o arkádové řízení v areálu, nikoli přesnou simulaci automobilu.

## Akce, komunikace a ukládání

- Přehled **Teď / Dnes / Tento týden**, mapa, filtry zájmů a detail akce fungují bez nutnosti procházet 3D areál. Základní akce jsou jasně označené jako **fiktivní** a navázané na aktuální den v Europe/Prague.
- Dobrovolné zájmy a stavy „rád se seznámím“, „jdu poprvé“ a „hledám společnost“ pomáhají připojit se k události. Virtuální účast ani poloha avatara nepotvrzují skutečnou návštěvu místa.
- Globální chat, místní chat do 40 m ve stejné zóně a chat události mají serverová oprávnění. Soukromé zprávy vyžadují přijatý kontakt. K dispozici je ztlumení, blokování a omezení frekvence zpráv.
- Vlastní demonstrační setkání může jeho zakladatel upravit a zrušit. Vlastnictví se váže na dočasnou relaci, nikoli na ověřenou osobu.
- Hledací výzva sdílí multiplayerový postup; týmový kvíz používá serverový čas. Host má vlastní průzkum, hledání a doručovací úkol B6. Kosmetické odznaky nemají ekonomiku.

Vzhled, přezdívka a získané kosmetické odměny se ukládají do `localStorage` prohlížeče. Token multiplayerové relace je v `sessionStorage` dané karty. Server drží přítomnost, kontakty, blokování, účasti, nová setkání a aktivity dočasně v paměti. Relaci lze obnovit do 30 minut po odpojení; restart serveru dočasný stav odstraní. Historie chatu se po opětovném připojení neobnovuje.

Host se nepřipojuje ke kanálům multiplayeru. Přímý požadavek na vytvoření hostovské multiplayerové relace je odmítnut. Veřejný `/api/health` vrací pouze `{ok:true,demo:true}`, bez počtu hráčů nebo identifikátoru světa. Veřejné ukázkové akce a počasí nejsou soukromým multiplayerovým stavem.

## Počasí, obloha a živější areál

[Meteostanice Silicon Hill](https://weather.sh.cvut.cz/weather/) poskytuje teplotu, povrchový vítr a intenzitu srážek. Server obnovuje podklady nejvýše jednou za pět minut. [Open-Meteo](https://open-meteo.com/en/docs) doplňuje modelovou oblačnost a proudění v několika výškách; při nedostupné nebo zastaralé stanici poskytuje označený povrchový fallback. Měření a model mají oddělené časy a stav čerstvosti. Výpadek zdrojů se nevydává za živé bezvětří či sucho.

Slunce a Měsíc mají vypočítanou polohu pro skutečné datum a souřadnice Strahova. Měsíc používá fázi, natočení osvětleného okraje a místně uloženou [povrchovou mapu NASA LROC](https://svs.gsfc.nasa.gov/4720/). Mraky se posouvají podle dostupného modelového proudění ve výšce; listy a tráva reagují na povrchový vítr. Déšť a modelový sníh jsou oddělené. Část oken po setmění svítí podle fiktivního vzoru, který nesleduje skutečné pokoje.

Tráva respektuje mapované typy povrchů a vynechává komunikace, stavby i umělý trávník. Zakřivená stébla reagují na vítr a svazky mají odstup od skutečných hran dlažby. 109 samostatných stromů má vlastní geometrii podle zdrojové koruny, tři úrovně detailu, CC0 materiály a shaderový pohyb listí. Nejdetailnější zdroj zůstává uložený v Blenderu. Poloha kmene a konkrétní botanický druh nejsou vždy ověřené; katalog rozlišuje mapové uzly, interpretaci fotografie a odhad. Nejde o úplný inventář všech skutečných stromů. [Stromový pack](docs/vegetation/realistic-pack.md).

Areál používá 38 doložených nebo interpretovaných lamp: 36 mapových bodů a dvě identifikace z ortofota. Noc vychází ze skutečného astronomického okamžiku; reflektor řízeného auta, interiér B6 a nejbližší lampy sdílejí omezený rozpočet světel. Intenzity jsou výtvarné parametry, nikoli zaměřené luxy. Konkrétní mraky, místní poryvy ani skutečné obsazení pokojů nejsou rekonstruované ze živých snímků. [Počasí a astronomie](docs/weather/README.md), [oprava noci](docs/weather/night-lighting-repair.md), [reflektory](docs/vehicles/headlights.md).

### PID 143 / 149 a cestující

Autobusy používají skutečně stažený [jízdní řád PID](https://pid.cz/o-systemu/opendata/) a GTFS silniční trasy: **143 Dejvická–Stadion Strahov**, **149 Dejvická–Stodůlky-Bavorská**. Uložená data jsou platná **10.–23. 10. 2026**. Jde o plánované časy, bez skutečných poloh a zpoždění vozů; prošlá data jsou označená a běžný režim neopakuje vymyšlený rozvrh.

Obě linky sdílejí upravený stažený CC0 model obecného nízkopodlažního autobusu, s rozdílným číslem a cílem na displejích. Při příjezdu vystoupí proměnlivý počet fiktivních NPC. Po ověřených venkovních trasách jdou k odvozeným vstupním prahům bloků; nejde o skutečné cestující ani online hráče. Osobní auta tvoří samostatný fiktivní ambientní provoz.

V **Nastavení** jsou plánované příjezdy. V režimu hosta je dostupná označená **Ukázka příjezdu a cestujících**, takže není třeba čekat na další spoj; nemění čas astronomického světla ani skutečné počasí. Obnova místních dat:

```powershell
node scripts/fetch-transit.mjs
```

Skript umí použít Python z již nainstalovaného Blenderu. Licence, model, cesty NPC, validita a omezení: [PID a NPC](docs/transit/README.md).

## Mapa, reference a přesnost

[Interaktivní atlas](http://127.0.0.1:5173/docs/world-architecture/atlas.html) propojuje mapové identity budov, konkrétní fotografie a panoramatická stanoviště. [Dokumentace podkladů](docs/world-architecture/README.md) eviduje B1–B12, Menzu, Potraviny/R-ko a samostatný prstenec Velkého stadionu s otevřeným středem. Katalog má 70 OSM identit, fotografický index 146 individuálních odkazů ČVUT a panoramatický průzkum pět doložených stanovišť. Každá reference má vlastní stav kontroly; zahrnutí odkazu neznamená, že byla fotografie individuálně lokalizována. Google Street View, Mapy.com a GeoGuessr slouží k inspekci, jejich snímky nejsou hromadně stažené jako herní textury.

Základní půdorysy a komunikace: **© OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright)**. Souřadnice jsou místní aproximace v metrech, X na východ, Z na jih, počátek 50.08065 N / 14.39175 E. `pnpm map:fetch` obnoví základní mapový výřez; navazující katalogy a odvozené vrstvy je poté nutné znovu sestavit a ověřit podle jejich dokumentace. [Novější audit ulic a podkladů](docs/streets/audit.json) rozlišuje mapovou geometrii a odhadované šířky; integrace této vrstvy se ověřuje samostatně.

**Terén vychází z ČÚZK DMR 5G**, převzorkovaného na 4m síť. Komunikace, chodníky, přechody, parkování a vegetace na tento reliéf navazují; fyzika používá stejné trojúhelníky. Centrální asfalt, parkovací řady a nápis Silicon Hill jsou interpretované z ortofota IPR Praha z 8. 6. 2024. Místa aut jsou z podkladu, obsazenost je simulovaná. U B6 je přiznaná základová adaptace terénu kvůli průchozímu suterénu a modelovým podlažím. Severní tenisový kurt má lokální zdrojově podloženou rovinu s navazujícím terénem; render, sampler a kolize sdílejí jeden TIN. Šest samostatných hřišť zachovává mapové identity. [Kurt a diagonální dlažba vstupu B6](docs/reality-pack/terrain/court-repair/README.md) mají doložené podklady i přiznané nejistoty.

Fasády rozlišují dlouhé okenní stěny, schodišťová čela, B12, Menzu, R-ko a otevřený stadion. Model B6 má krytý severní vstup s 12 venkovními stupni, recepci, dvě lomená schodišťová jádra, chodby a sociální zázemí. 210 ilustrativních ložnic a 222 modelových dveřních tras nejsou skutečným inventářem. Materiálová typologie vnitřních schodů vychází z fotografie výslovně označené BLOK 3; nekótované schéma B6 dokládá dispozici. **Nejde o zaměřený současný interiér B6:** archivní pokojové fotografie nemají vždy doložený blok a současná recepce ani sociálky nejsou kompletně fotograficky potvrzené. Ostatní bloky nemají hotové všechny interiéry.

Asfalt, dlažba a zemní zeleň používají původní generické CC0 mapy ambientCG se zachovanými metrickými UV. Pracovní pilot tlumí rušivý drobný kontrast, zejména v dálce, a upravuje sílu normál; rozložení cest, výškopis ani kolize tím nemění. Barvy a intenzity jsou výtvarná interpretace, nikoli změřená odrazivost Strahova. [Materiály pilotu a provenience](docs/pilot-surfaces-20261011.md).

Postavy používají souvislou CC0 anatomii Blender Studio, GPU skinning, procedurální IK a šest upravitelných předloh. Samostatné šité CC0 oděvy MakeHuman nahrazují původní přiléhavé obarvení těla; editor i hra sdílejí stejnou factory. [Anatomie](docs/characters/skinned-anatomy/README.md), [aktuální oděvy a ověření](docs/characters/student-garments/README.md). Fitované sdílené oči zůstávají čitelné při otočení i ve středním LOD. Alex používá CC0 `short02`, Sam `short04`, oba s barvou z editoru, původními atlasy a samostatným fitem pro brýle. U Sama je výřez před uchem opravený podle úplných původních face-setů; brýle se při přechodu na medium neztrácejí a nepřidávají plný hranol do far siluety. [Oči a studentské postavy](docs/pilot-avatars-20261011.md), [účesy, opravy a GPU důkazy](docs/pilot-hair-20261011.md).

Nejde o fotogrammetrické tváře, mocap nebo dokončenou kvalitu Hogwarts Legacy. Čtyři zbývající účesy a společná základna obličejů potřebují další práci, atlasům vlasů zůstává část vpečeného světla a chybí mrkání i plná mimika. Kontakt jednotlivého chodidla s každým schodem vyžaduje další vizuální kontrolu.

## Blender a použité modely

Hra načítá GLB z `public/models/`; editovatelné zdroje jsou v `assets/blender/`. Auto, osm kusů nábytku/lavička a vegetace mají reprodukční skripty. Nábytek používá stejný manifest umístění a konzervativních kolizních tvarů na klientu i serveru. Modely se načítají jednou a opakované kusy sdílejí geometrii.

121 budov má samostatný `.blend` a GLB archiv v `assets/blender/buildings/` a `public/models/buildings/`. Jedno herní auto, 24 parkovaných aut a ambientní provoz používají [CC0 hatchback pack](docs/vehicles/README.md): 26 materiálových částí, interiér, čtyři samostatná kola a near/medium/far detail. Dřívější [oprava wheel LOD](docs/vehicles/wheel-repair.md) ověřila uzavřenost všech 32 odvozených wheel částí a zachovala tehdejší near/master i karoserii. Navazující [near oprava](docs/vehicle-pilot-repair-20261011.md) odstranila překlopenou vnitřní plochu karoserie změnou diagonály dvojice trojúhelníků, bez posunu vrcholů, změny materiálů nebo fyziky. Původní zdroj i medium/far zůstávají zachované; samostatné vady vzdálených podběhů a karoserie tím nejsou vyřešené. Low používá pět sdílených stínových geometrií; viditelné modely zůstávají samostatné. Každé auto má vlastní kořen a sdílí neměnnou geometrii. Modelové archivy se nepřidávají jako druhá překrývající se vrstva nad nativní herní geometrii. [Ověřené exporty a zdrojová ID](docs/reality-pack/separate-assets/README.md).

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/car-master-pack.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-realistic-car.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-car-lods.py
pnpm exec tsx scripts/build-car-manifest.ts
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-environment.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-vegetation.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-bus.py
```

Cestu uprav podle své instalace Blenderu. Modely používají metry a glTF Y-up. Rozměry vybavení jsou modelářské odhady z referencí, nikoli inventarizace současného B6. [Modely prostředí](docs/models/README.md), [původ autobusu](docs/transit/README.md).

## Ověření a výkon

```powershell
pnpm test
pnpm build
pnpm test:integration
```

`pnpm test:integration` **samo spustí izolovaný server na 2568**, provede síťové scénáře a ukončí svůj proces. Hlavní server na 2567 nepotřebuje. Port 2568 musí být volný. `pnpm build` kontroluje TypeScript a vytvoří klientský `dist`; samotné sestavení nespouští multiplayerový server.

Publikovaný historický checkpoint L2 prošel **372/372 testy, buildem, izolovanou integrací a zdrojovým SHA auditem bez neshod**. Souhrn je v [přejímce dema](docs/releases/demo-2026-10-11.md). Výsledky jednotlivých novějších zdrojových snapshotů jsou v [přehledu ověření](docs/verification.md); úspěch staršího checkpointu se automaticky nepřenáší na aktuální pracovní M6.

Klient znovu používá pracovní paměť při výběru trávy a předává Babylonu cache efektivně povolených meshů. Zachovává neviditelné zdroje instancí, původní pořadí, nativní LOD a přidávání/odstraňování objektů; profil zvlášť zaznamenává renderové průchody a skutečný GPU kontext. [Výběr trávy a CPU studie](docs/pilot-render-performance-20261011.md), [výběr kandidátů rendereru](docs/performance/active-mesh-candidates-20261011.md). Omezení alokací a strukturální testy samy nedokazují vyšší FPS celé hry.

**Veřejná přejímka 60 FPS na cílové GeForce za dne a s více hráči zůstává otevřená.** Místní uživatelské diagnostiky nejsou součástí veřejné evidence. Produkční GPU série checkpointu M používala Intel UHD 630; zahrnovala celou hru, HUD a skutečné relace, ale není důkazem výkonu novějšího checkpointu. Vizuální prohlídky nových vlasů, brýlí a auta rovněž nejsou FPS benchmark. Níže zůstávají historická měření K4/K3/J s vlastními podmínkami a omezeními.

**K4 prošel 352/352 testy, buildem, izolovanou integrací a SHA auditem 8066 živých + 8066 zmrazených souborů bez neshody**. [K4: přesný zdroj, výsledky a omezení](docs/performance/render-order-material-budget-20261011-k4.md). Intel UHD 630 / low / CSS 1920×1080 / render 1476×830: 1 avatar den 35,6–35,8 FPS; 30 den 31,7–32,5, p95 35,0–40,2 ms; 30 noc jednou 35,7. Všech sedm platných intervalů mělo 0 grafických chyb. Cíl 60 ani přísné denní p95≤33,3 ms nesplněn. První SDK běh měl 29 authority flagů, opakovaný 0; interval po deadline je vyloučený. Technický PASS nedokončuje všechny vizuální požadavky. Historické checkpointy zůstávají v [přehledu ověření](docs/verification.md).

**Historické GPU měření K3 na Intel UHD 630 výkonový cíl nesplnilo:** low, CSS 1920×1080 / interně 1476×830, 1 avatar ve dne třikrát 28,2 FPS; 30 avatarů ve dne 25,0 / 26,5 / 27,3 FPS a jeden platný noční vzorek 27,9 FPS. P95 bylo 41,3–52,9 ms ve dne při 30 avatarech a 41,7 ms v noci. Cíl 60 FPS ani přísný limit 30 FPS / p95≤33,3 ms splněný není. Všech sedm platných GPU vzorků mělo 0 shaderových a asset chyb. Denní 600s síťový běh měl 30 účastníků a 0 resync; opakovaný 180s noční běh měl **58 authority resync flagů** a není vydávaný za stabilní noční síť. Přechodný noční soubor s pouhým jedním avatarem po deadline je z 30-avatarových důkazů vyloučený. [Úplná přejímka K3 a omezení](docs/performance/shadow-reserve-wheel-repair-20261011-k3.md).

[Historické J měření](docs/performance/faithful-world-repairs-20261011-j.md) ukazuje ve dne přibližně 26 FPS proti 28,2 FPS K3 pro jednoho hráče; nejde o přísně izolované GPU A/B se stejným počasím. Měření vyvolaná uživatelem zůstávají pouze místně a nejsou součástí veřejného repozitáře. Prostorové dělení terénu má geometrické a stínové regrese; nové srovnatelné GPU měření zůstává otevřené.

V Nastavení je desetisekundový FPS test s počtem snímků, průměrem, p95/p99 dobou snímku, počtem hráčských avatarů, rozlišením a označením adaptéru. Nízká kvalita snižuje interní rozlišení proti CSS viewportu. Pro opakovatelný audit je potřeba neměnný snapshot, plný HUD, cílové GPU a zaznamenané počasí, světlo i ambientní NPC. NullEngine kontroly geometrie a CPU nejsou měřením herního FPS.

Výchozí **automatická kvalita** vyhodnocuje skutečné doby snímků, postupně mění interní rozlišení a společný rozpočet vzdálených detailů. Blízké okolí zůstává podrobnější, vzdálené fasády a avataři mají levnější reprezentaci; tráva a vybavení B6 mají omezený dosah. Ruční nízká/střední/vysoká kvalita se sama nemění. Cíl lze nastavit na **60, 120 nebo 144 FPS**. Render loop nemá pevný 60FPS limit; jeho skutečná frekvence závisí i na monitoru a prohlížeči. Před vykreslováním světa se krátce měří nezatížený rytmus prohlížeče, aby se na 60Hz zobrazení zbytečně nesnižovala kvalita při cíli 144. [Principy, rozpočty a testy](docs/performance/adaptive-quality.md).

Nastavení ukazuje **skutečně použitý GPU renderer**, nikoli pouze seznam nainstalovaných karet. WebGL požaduje `high-performance`; tento požadavek může prohlížeč nebo Windows vyhodnotit jinak. V dosavadních zde uvedených měřeních byla vybraná Intel UHD 630, přestože je na stroji nainstalovaná GTX 1060. Pro vestavěný prohlížeč se výkonová preference nastavuje ve Windows pro aplikaci Codex a vyžaduje její běžný restart. [Ověřený postup pro GPU a frekvenci monitoru](docs/performance/gpu-selection.md). Dřívější diagnostika aktivního displeje hlásila 60 Hz; podpora 144FPS renderu není tvrzením o naměřených 144 FPS.

Klient i server používají společnou kolizní geometrii a pevnou simulaci **60 Hz**. Server je autoritativní; lokální predikce, potvrzení vstupů a časová interpolace oddělují pohyb od renderové frekvence. Kamera prověřuje prostor koule proti překážkám, animace nehoupají fyzikálním kořenem a popisky se promítají ze stejného renderového snímku. Vzorkované regresní testy podloží a kolizí nejsou důkazem nemožnosti každé chyby.

## Architektura a další etapa

| Složka                              | Odpovědnost                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `client/`                           | React rozhraní, Babylon.js, modely, kamera a renderová smyčka                       |
| `server/`                           | Jediný autoritativní svět Colyseus, dočasné relace, chat, události a adaptér počasí |
| `shared/`                           | Typy, validace, události, mapa, veřejná ambientní doprava a Rapier simulace         |
| `assets/blender/`, `public/models/` | Editovatelné modely a herní exporty                                                 |
| `docs/`                             | Reference, původ dat, geometrické audity, testy a známá omezení                     |

Ověřování IS lze později doplnit před vydání herní relace bez přepisování pohybu a sociálních funkcí. Trvalé účty, hlas, skutečný import komunitních akcí, ekonomika, hráčské vybavování pokojů, zabezpečená administrace a veřejné nasazení patří do další etapy. Sdílený svět má konečnou hardwarovou a síťovou kapacitu; současné demo není neomezené MMO.

## Původ podkladů a licence

Licence podkladů a převzatých modelů jsou samostatné: OSM/ODbL, IPR a ČÚZK podle přiložených atribucí, CC0 modely a materiály podle jejich manifestů. Začni v [Reality Packu](docs/reality-pack/README.md), [modelech](public/models/README.md), [postavách](docs/characters/student-garments/README.md) a [stromovém packu](docs/vegetation/realistic-pack.md). Referenční snímky Google Maps a dalších autorů slouží k porovnání; nejsou volnými herními texturami. Zveřejnění repozitáře nemění jejich původní licenční podmínky. Vlastní kód projektu zatím nemá samostatně zvolenou open-source licenci.
