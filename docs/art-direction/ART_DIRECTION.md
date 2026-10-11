# Výtvarný směr Strahov Crazy Show

Rozhodnutí pro implementaci, 10. 10. 2026. Navazuje na [optimalizační studii](../optimization-study/STUDIE.md) a [referenční atlas](../references/README.md). Hodnoty níže jsou výchozí autorské nastavení a výkonové rozpočty, nikoliv nové měření FPS nebo zaměření staveb. Strojově čitelná paleta je v [palette.json](palette.json).

## Jednotná podoba hry

**Současný skutečný Strahov, přirozené materiály, měkké filmové světlo a lidské měřítko.** Inspirací Hogwarts Legacy je vzdušná hloubka scény, rozpoznatelné dominanty, kompozice, kontakt objektů se zemí a teplá světla proti chladnější obloze. Strahov si zachová svou modernistickou architekturu. Hra dostane vlastní modely, materiály a rozhraní.

Obraz musí působit soudržně z běžné výšky očí i za pohybu. Největší pozornost dostane silueta budovy, rozměry, členění fasády, vstup a napojení chodníku. Jemná textura přichází až po nich. Realistické proporce jsou závazné také pro postavy a auto; obličej a vegetace mohou mít zjednodušené detaily. Kulaté mraky složené z viditelných koulí, hranaté končetiny a jednotné pastelové budovy patří k dočasnému prototypu.

### Co lze stylizovat a co musí odpovídat předloze

| Zachovat podle podkladu | Dovolená stylizace |
|---|---|
| Poloha, půdorys, výška doložená zdrojem, střešní silueta | Menší množství detailů na vzdálené střeše |
| Odlišné dlouhé fasády, čela a schodišťové části | Jemnější barevná variace a souvislejší materiál |
| Rozmístění a charakter oken, dveří, schodů a vstupů | Zjednodušené rámování a interiér za neprůchozím oknem |
| Skutečné cesty, jejich povrch, svah a návaznost | Vynechání drobné nečistoty a jednotlivých prasklin |
| Stadion, tribuny, sportoviště, nízké provozní objekty | Úsporné opakování doložených konstrukčních dílů |
| Prostorové uspořádání B6 doložené plánem | Přibližné vybavení jasně evidované jako nedoložené |

**Budova stadionu nesmí dostat mřížku kolejních oken.** Neznamená to, že stadion nemůže mít okna: konkrétní otvory a členění musí vycházet z jeho vlastních referencí. Číslo v názvu či velikost polygonu nestačí k výběru architektonické šablony. Každá identifikovaná stavba dostane vlastní typ; nedoložený objekt zůstane střídmou hmotou bez vymyšlených oken. Konkrétní přiřazení objektů spravuje mapová práce, tento dokument je nepřepisuje.

## Podklady a pravidla jejich použití

| Podklad | Konkrétní využití | Hranice |
|---|---|---|
| [ČVUT: exteriéry, 20. 6. 2024](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov) | Fasádové materiály, členění, značky bloků a okolí | Snímek jednoho bloku neurčuje vzhled všech ostatních |
| [ČVUT: rekonstruovaný B4, 20. 6. 2024](https://media.cvut.cz/cs/foto/20240620-rekonstruovany-blok-4-strahovskych-koleji) | Materiály a vybavení rekonstruovaného interiéru B4 | Nepřevádět automaticky do B6 |
| [ČVUT: otevření B4 a porovnání s B3, 20. 6. 2024](https://media.cvut.cz/cs/foto/20240620-slavnostni-otevreni-rekonstruovaneho-bloku-4) | Rozlišení rekonstruovaného a staršího vybavení | Identifikovat budovu každého záběru zvlášť |
| [ČVUT: pokoje, 16. 11. 2016](https://media.cvut.cz/cs/foto/20161116-pokoje-na-kolejich-strahov) | Historické vybavení, proporce a varianty | Starší stav; není důkazem podoby v roce 2026 |
| [Wikimedia Commons: Koleje Strahov](https://commons.wikimedia.org/wiki/Category:Koleje_Strahov) | Siluety, pohledy z dálky, kontext stadionu a okolí | Kategorie uvádí 22 souborů; každý má vlastní datum a licenci |
| [Plán a fotografie B6](../references/README.md#blok-6--priorita) | Podlaží, schodiště, vstupy a odlišnost čela od dlouhé fasády | Plán nemá kóty; odhad není zaměření |

V této práci byly přímo vizuálně zkontrolovány tři konkrétní snímky galerie exteriérů ČVUT: [čelo B4 s číslem 4](https://media.cvut.cz/sites/media/files/styles/large/public/content/photos/4747a232-056d-41a1-8baa-a2255d7d7efb/958a2185-7a8b-46e5-96f5-eddfdc1aa790.jpg?itok=Bg32I_YY), [čelo a odstupněné hmoty B4](https://media.cvut.cz/sites/media/files/styles/large/public/content/photos/4747a232-056d-41a1-8baa-a2255d7d7efb/f3452ed9-9cab-4197-946b-b0c92ded8913.jpg?itok=XEccZfwv) a [dlouhá světlá fasáda s většími okny](https://media.cvut.cz/sites/media/files/styles/large/public/content/photos/4747a232-056d-41a1-8baa-a2255d7d7efb/fe9b7d5b-facc-479d-9e50-1c07806041ce.jpg?itok=CfysDPa2). První dvě fotografie ukazují šedý povrch, malé párované otvory a modrobílou značku B4; třetí světlou fasádu a hnědé rámy. Třetí záběr sám neobsahuje viditelné číslo bloku, proto jej nelze tímto dokumentem bezpečně přiřadit konkrétní budově. Barevné hodnoty níže jsou autorská interpretace, nikoliv kolorimetrické měření těchto fotografií.

Pro každou finální fasádu vybrat identifikovaný celkový záběr a detail. Zapsat objekt, fasádu, datum a zdroj do atlasu. Novější doložená rekonstrukce má přednost před starším stavem. Při rozporu zachovat nejistotu v dokumentaci a nevytvářet smyšlené průčelí. Fotografie ČVUT jsou zde referencemi; nebylo doloženo oprávnění použít je jako herní textury. Žádné fotografie ani screenshoty nebyly touto prací kopírovány do hry.

## Paleta, povrchy a modely

Paleta je úmyslně tlumená. Omítky a beton zůstávají převážně neutrální; živější barvu přinesou lidé, skutečné cedule a osvětlení. Pro výchozí nedoloženou budovu používat `renderPlaster`, nikoliv náhodnou barvu podle čísla. U doloženého bloku materiál přepsat z jeho referencí. Hodnoty HEX jsou sRGB; nekombinovat dvojitou gamma korekci s nastavením rendereru.

| Povrch | Základ | Roughness pro PBR | Vzhled a detail |
|---|---|---:|---|
| Světlá omítka | `#D3D1C7` | 0,86 | Jemné nerovnosti, žádná velká opakovaná skvrna |
| Šedý beton čela | `#929893` | 0,90 | Velké spáry doložené fotografií, slabá variace |
| Sokl / starší beton | `#797C75` | 0,94 | Ztmavení jen při zemi a u skutečných hran |
| Asfalt | `#666B68` | 0,96 | Široké matné plochy, méně kontrastní než avatar |
| Chodník / betonové dlaždice | `#ABA99F` | 0,92 | Spáry přes trim/texturu; ne tisíce samostatných kostek |
| Suchá tráva | `#788268` | 1,00 | Dvě blízké varianty, nepravidelné přechody |
| Listy / koruna | `#556B4E` | 0,94 | Několik čitelných hmot, bez lesku plastu |
| Okenní sklo | `#50656C` | 0,25 | Lehce chladné, střídmý odraz oblohy |
| Hnědý rám | `#675750` | 0,76 | Pouze na fasádách, které jej mají doložený |
| Kov | `#555F5F` | 0,58 | Zábradlí a lampy, žádná chromová záře |
| Dřevo | `#8F7560` | 0,82 | Široká kresba a tvar, méně mikrokontrastu |

PBR není podmínkou každého povrchu. V první implementaci lze tyto barvy použít se stávajícím `StandardMaterial`, slabým specularem a AO. U tabulky roughness jde o hodnoty pro následnou PBR knihovnu, nikoliv o přímo zaměnitelný parametr StandardMaterial. Kovovost všech běžných stavebních povrchů je 0; PBR kov použít jen na skutečný odkrytý kov. Tráva, omítka ani beton nesmějí zářit.

### Architektura a okolí

- Každá doložená fasáda má samostatný profil: velké podélné okenní řady, malé koncové otvory, schodiště, sokl, vstup. Nevkládat stejný rytmus na všechny hrany polygonu.
- Modelovat skutečně viditelné hrany parapetu a střechy. Na blízkých rozích použít malý bevel; šířku řídit měřítkem objektu, u stavebních prvků výchozí 1–3 cm. Nevytvářet měkké nafouknuté budovy.
- Okno má rám, ostění 8–15 cm pouze jako provizorní modelovací výchozí hodnotu a tmavší sklo. Rozměry z reference mají přednost. Na dálku jej převést na fasádový atlas. Viditelný interiér řešit jen u průchozích či herně důležitých oken.
- Značky bloků umístit na jejich skutečná místa. Údaje z referencí neměnit na plošně stejně velká plovoucí čísla nad střechou.
- Cesty musí napojit dveře a schody; terén, obruba a sokl spolu musí souhlasit. Vrstvy cest vzájemně nekoplanárně překrývat jen kontrolovaně, aby neblikaly. Kolize jsou samostatné a zachovávají souvislý podklad.
- Venkovní vegetaci rozmísťovat podle mapy a fotografií, s menšími doplňky u tras. Nevytvářet les nebo náhodný strom před každými dveřmi. Koruny 3–5 sdílených tvarů a střídmá změna měřítka.

### Postavy a auto

Postavy mají současné studentské oblečení, přirozené délky končetin, přibližně 7–7,5 hlavy na výšku, měkce modelovaný obličej a čitelné účesy z celistvých hmot. U lokální postavy fungují obě paže, chodidla při stoji drží zem a chůze neklouže. Změna rychlosti řídí přechod klid/chůze/běh; kamera nemá povinné houpání. Editor používá stejný model a stejné materiály jako hra. Oblečení se skládá z kontrolované společné palety, nikoliv z neomezené cache odstínů.

Auto je běžný lehký kompaktní hatchback s vlastní siluetou, nikoliv kopie konkrétního licencovaného vozu. Výchozí lak `#647E78`, tmavé pneumatiky a střídmé sklo. Hodnoty PBR: lak metallic 0,15 / roughness 0,32; pneumatika 0 / 0,95; sklo 0 / 0,18. Model musí měřítkem odpovídat ověřenému fyzikálnímu obalu, nikoliv naopak. Kola se otáčejí a přední pár natáčí podle řízení. Stín/přítlak vozidla, poloha kol a světel mají větší prioritu než detail palubní desky. Jízda nemá přidávat chvění kamery ani motion blur.

## Obloha, skutečné počasí a světlo

Čas světa vychází ze skutečného dne a polohy Strahova. Uživatelská volba den/večer slouží jen označenému náhledu nebo testu. Atmosféru interpolovat ze sluneční výšky, ne přepínat při jedné pevné hodině. Viditelný sluneční kotouč a směr hlavního světla musí souhlasit; slunce pod horizontem nesvítí zdola. Původ a stáří počasí zůstane v HUD. Při nedostupnosti stanice zobrazuje hra výslovně náhradní/poslední stav. Oblačnost z orientační ikony není vydávána za měřený oktant oblohy.

| Stav | Obloha nahoře / u horizontu | Hlavní světlo / ambient | Praktický charakter |
|---|---|---|---|
| Jasný den | `#648CB0` / `#CAD5D6` | `#FFF1DC` / `#A8BCC8` | Neutrální fasády, měkký chladný stín |
| Zataženo | `#87949C` / `#B7C1C3` | `#DBE3E7` / `#B4BEC4` | Nižší kontrast a rozptýlené světlo |
| Nízké slunce | `#6A87A1` / `#D6B7A0` | `#FFD5A5` / `#8FABC0` | Teplé nasvícené hrany; tlumený, ne oranžový celý obraz |
| Soumrak | `#3F5772` / `#8D97A8` | `#B0BDD0` / `#708198` | Světla míst získávají význam, čitelné chodníky |
| Noc | `#142337` / `#35465B` | `#A0B5CF` / `#62758B` | Zachované detaily; ne černá tráva a bílé neonové fasády |

Výchozí intenzity pro současnou neexponovanou StandardMaterial scénu: slunce 1,0 / denní ambient 0,62; při zataženu slunce 0,25 / ambient 0,78; soumrak hlavní světlo 0,08 / ambient 0,36; noc měsíční příspěvek nejvýše 0,12 / ambient 0,28. Tyto hodnoty kalibrovat společně na šedém 18% vzorku a referenční trase; při přechodu na jinou expozici je nepřebírat jako fyzikální jednotky. V noci vzniká hlavní orientace lampami a skutečnými vstupy.

- Mraky: úsporná vrstva s velkými měkkými hmotami, pomalý posun podle větru. Nejvýše dvě překrývající se vrstvy; základní obloha bez volumetrického raymarchingu. Hustota odpovídá počasí, obloha se při zatažení nezmění na plošnou bílou.
- Mlha: jemná vzdušná perspektiva. Výchozí EXP2 hustota 0,0012 za jasna, 0,0022 za zatažena a nejvýše 0,0035 při dešti; barva vždy navazuje na horizont. Neznačit srážky automaticky za mlhu a neskrývat blízké chybné budovy hustou vrstvou.
- Déšť: částice pouze poblíž hráče, výchozí 160 a horní limit 300 v záběru. Jemné ztmavení asfaltu, žádné zrcadlo přes celou ulici. Změny počasí a světel přecházejí alespoň 5 sekund, atmosférický výpočet stačí 1 Hz a hodnoty se mezi ním interpolují.
- Noční lampy: teplá barva `#FFD6A0`. Emise svítidla a levná lokální světelná skvrna jsou základ. Skutečné point lights jen nejbližší dvě a přiřazené prostorovým skupinám; bez dynamického stínu. Okna se rozsvěcují deterministicky v malém podílu, nikoliv všichni stejně a ne náhodně každý snímek.
- Jedno směrové světlo + hemisférický ambient. Nízká kvalita využívá AO a jednoduchý kontaktní stín pod lokální postavou, blízkými avatary a autem. Střední kvalita může přidat jednu 1024px mapu slunečních stínů v okolí hráče; vyšší 2048px. Stabilizovat shadow frustum a bias proti třepotání. Nezapékat trvalé ostré polední stíny do textur.
- Všechny kvality: vypnutý film grain, chromatická aberace, motion blur a hloubka ostrosti při hraní. Bloom pouze volitelně a střídmě ve vyšší kvalitě; musí jít vypnout. Základní obraz musí obstát bez postprocesů.

## Text, rozhraní a stabilita obrazu

Rozhraní si zachová současné DM Sans / Manrope, decentní tmavě zelený inkoust, světlý povrch a střídmý zelený akcent. Inspirace filmovou atmosférou neznamená pergameny, ornamenty ani gotické písmo. Avatar editor je klidná scéna s neutrálním podkladem, teplým hlavním a chladnějším doplňkovým světlem; neobsahuje povinnou animaci kamery.

Fyzické cedule patří k budově a nikdy se nenatáčejí ke kameře. Herní názvy míst jsou střídmé popisky v obrazové vrstvě. Hráčská jména jsou odlišná od názvů budov, text 13–14 CSS px s pevným řádkem, světlé písmo na tmavém neprůhledném či téměř neprůhledném podkladu. Zaměřené místo má prioritu; běžně nejvýše osm názvů míst a 16 jmen v záběru. Další přítomní zůstávají dostupní v seznamu; limit popisků neomezuje multiplayer.

**Pevný svět nemá za chůze vibrovat.** Jde o vstupní podmínku finální vizuální kontroly:

- Kamera, vykreslovaný avatar a projekce jeho jména používají tentýž renderový čas a hotovou kamerovou matici daného snímku. Poloha jména vychází z renderovaného modelu, nikoliv z posledního síťového snapshotu.
- Statické budovy jsou v lokálních metrech blízko počátku a jejich transformace se za chůze nepřepisují. Fyzikální kroky nesmějí neposlušně posouvat celý svět.
- DOM transformace mají subpixelovou přesnost; nezaokrouhlovat každou pozici na celé pixely. Text nemá CSS transition pohybující za projekcí. Vymizení podle vzdálenosti či překážky má hysterézi, aby neblikalo na hranici.
- Překryté povrchy, okna a cedule nemají koplanární geometrii. Kontrolovat Z-fighting za pohybu na dlouhých fasádách, cestách a okenních rámech. Oddělit tuto chybu od 30Hz chvění kamery či síťových oprav.
- LOD přepínat s 15% hysterezí kolem prahu. Jemné fasádové textury mají mipmapy; husté horizontální čáry nechat mizet na dálku. Nekreslit detaily menší než přibližně pixel.
- Ve stoji při nehybné myši nejsou žádné mimovolné oscilace kamery, jmenovek ani stínů. Houpání a chvění jsou ve výchozím nastavení vypnuté.

## Rozpočty, pořadí a přijímací kontrola

Výkonové cíle přebírají měřicí metodiku studie. 30 avatarů je minimální uživatelský gate pro 30 FPS na integrované grafice; 60 FPS a 100 avatarů jsou rozvojové cíle, které se musí samostatně ověřit. Viditelný dav a skutečné připojené klienty měřit odděleně. Čísla nejsou příslibem výsledku neotestovaného hardwaru.

| Rozpočet celé viditelné scény | Nízká | Střední | Vyšší |
|---|---:|---:|---:|
| Trojúhelníky včetně viditelných avatarů | 150 000 | 250 000 | 450 000 |
| Draw calls včetně stínů a efektů | 100 | 150 | 220 |
| Rezidentní textury GPU, návrh | 128 MiB | 256 MiB | 384 MiB |
| Interní rozlišení, explicitně reportované | 540–720p | 720–900p | 1080p podle rezervy |
| Dynamické lampy na lokální okolí | 0 | 2 | 2 |
| Stínová mapa slunce | žádná | 1024² | 2048² |
| Geometrie mraků | nejvýše 1 000 trojúhelníků dohromady | stejná | stejná |

Počáteční asset rozpočty: vlastní/blízký avatar 4 000 trojúhelníků, nejvýše dva materiály; střední 1 000 a vzdálený 100 podle studie. Hlavní auto nejvýše 8 000 trojúhelníků a tři materiálové průchody, vzdálená varianta 1 500. Běžný strom nejvýše 800 / 200 podle LOD. Pro stavební textury začít sdílenými 1K atlasy; 2K jen pro skutečně blízký přínos. Sloučit statiku podle buňky přibližně 32–64 m a materiálu, ne do jediné fasády přes celý areál. Chybějící detail se řeší modelem či atlasem, nikoliv tisíci novými draw calls.

### Implementační pořadí

1. **Odstranit vibrace a architektonické omyly.** Stabilní kamera/renderový stav/popisky, žádné Z-fighting, správné typy budov, stadion a fasády. Bez tohoto kroku nepřidávat náročnější efekty.
2. **Dodat první jednotnou světelnou a materiálovou vrstvu.** Paleta, obloha, současný čas, mraky, den/noc, tlumené sklo a kontakt objektů se zemí. Tento krok lze provést nad současnými modely.
3. **Dokončit jeden věrný úsek B6 → okolí B7/007 → R-ko.** Příslušné fotografické reference, fasády, vstupy, cesty, terén, jasně označené přibližné interiéry. Geometrii rozšířit podle mapového auditu, nikoliv podle fantazie grafika.
4. **Sjednotit člověka a auto s prostředím.** Proporce, animace, editor, sdílené materiály, kola, stíny a interakční body. Dálkové modely současně s blízkými.
5. **Teprve po měření přidat lokální sluneční stíny a vyšší kvalitu.** Každý efekt porovnat A/B při stejném čase, počasí, trase, populaci a rozlišení. Pokud jeho náklady překročí rozpočet, zachovat kvalitní základ a snížit efekt, ne geometrickou věrnost.

### Povinný vizuální protokol

Pořídit srovnatelné záběry ze stejné definované kamery: čelo B6, dlouhá fasáda B6, vstup a schody, 007, budova Potravin/R-ka, stadion, celé nádvoří s lidmi a auto vedle člověka. Pro každou známou stavbu vedle sebe referenční odkaz a herní obraz, s datem reference a označením odhadů. Zkontrolovat jasný den, zataženo, soumrak, noc a déšť. V automatickém testu zamknout čas a počasí; živý režim se testuje zvlášť.

V pohybu projet trasu spawn → B6 → schody → ven → auto → okruh → vystoupení. Při 30/60 FPS sledovat stabilitu textu, fasád, oken, stínů a kontaktu chodidel; 30 sekund stát bez vstupu. Přijetí vyžaduje správné siluety a identitu staveb, čitelné vstupy, žádné viditelné oscilace ve stoji a žádné periodické poskakování celé scény při chůzi. Funkční kolize nesmějí být za vizuální změnu odstraněny.

Benchmark opakovat s 1, 30 a 100 renderovými avatary; pro multiplayer také skutečné klienty. Uvést hardware, skutečně použitý GPU renderer, browser, produkční build, CSS/interní rozlišení, kvalitu, počasí, počty průchodů, průměr/p95/p99 snímků a minimálně 15 minut zahřátého provozu. Kontrolovat rozpočty i při shromáždění lidí na jednom místě. Žádná nová grafická vrstva není označena za optimalizovanou jen podle subjektivního dojmu.
