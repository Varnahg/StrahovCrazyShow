# Předání: cad-buildings-b1-extraction-20261024

**Aktualizace 24. 10. 2026 03:15 UTC:** přepočet vnitřní geometrie R6 v přiděleném okně proběhl, 57 testů přípravy prošlo. Aktuální R6 receptura a její přesný kontrakt jsou popsány v poslední sekci; nativní Blender/Rapier přejímku přebírá root. Starší sekce jsou historické checkpointy, nikoli aktuální výsledky nebo výšková hypotéza.

- Vlastník: `cad-buildings-01a16b37-extraction`; příjemce: koordinátor `cad-buildings-01a16b37-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, detached HEAD; výchozí commit `c713c2aedcafdb02358f05e4c9c51b607edeebc4`.
- Výsledek k 24. 10. 2026 00:45 UTC: kompletní dočasná stavební receptura pěti plánů B1 pro přejímku builderem. Nejde o prohlášení dokončeného Blender modelu nebo herní integrace. Žádný commit ani staging.
- Změněné verzovatelné soubory: `scripts/cad-buildings/prepare_b01.py`, `scripts/cad-buildings/test_prepare_b01.py`, `docs/reality-pack/cad-buildings/b01/preparation-audit.json`, tento handoff. Dočasné výstupy: `.cache/cad-buildings-20261024/b01-preparation/recipe.json`, pět `*-overlay.png`, `preparation.log`, `tests.log`, `checkpoint.json`. Původní DXF ani jejich textové/obrazové kopie se nestagují.
- Cizí WIP: výchozí koordinační tasky, specifikace, research handoff a dokumentace koordinátora byly pouze čteny. Builder a jeho výstupy vlastní koordinátor. Nic cizího nebylo převzato nebo změněno.

## Podklady a rozhodnutí

Zdroj: pět souborů `strahov blok1 p01/n01/n02/n03/n04.dxf` v uživatelově lokální složce `C:/Users/rezac/Downloads/strahov autocad/strahov autocad/strahov blok1`. SHA-256 všech vstupů je v auditu. Jde o historické digitalizované půdorysy s uvedeným omezením zaměření; převod do metrů je `CAD / 1000`, společný počátek `[250, 731]`, bez nezávislé normalizace pater.

Všechny výšky jsou výslovné odhady. Koordinátor během implementace zvolil půlpatrovou hypotézu pro obě příčná křídla: proti příslušnému hlavnímu PP/NP je jejich podlaha níže o 1,6 m. Hlavní podlaží mají −3,2/0/3,2/6,4 m, příčná křídla −4,8/−1,6/1,6/4,8 m; střecha 9,6/8,0 m. Regiony jsou západní `CAD y >= 738.52`, východní `CAD y <= 723.228`. Souřadnice půdorysu se nemění. Toto rozhodnutí je fyzicky souvislá modelářská interpretace pro schodiště, nikoli doložený stav výšek. Rozhodnutí a omezení jsou také v receptuře a auditu.

Globální polygonizace byla odmítnuta kvůli chybějícím příčkám. Přijaté řešení páruje skutečné rovnoběžné hrany v libovolném směru, kontroluje průnik s room polygony, zachovává měřené sloupy a rozlišuje opakované nášlapové čáry. Dlouhé tenké strong+strong páry mohou převážit konfliktní room fill; ve finálních datech se výjimka použila čtyřikrát v P01. Ojedinělé silné hranice se doplňují pouze se zřejmým sousedstvím room boundary a auditovanou odhadovanou tloušťkou. N01 západní obvod `1CF2`/`1D0A` pokračuje s tloušťkou 0,372529 m převzatou ze sousedního měřeného úseku.

Dveřní POLYLINE jsou tessellované oblouky. Párování s LINE zachovává pant a koncové body; problematický šestibodový oblouk N01 `4064` má explicitní korekci k listu `406D`. Dvojice okenních hran se mění na jedno okno; třetí přídavná hrana P01 `2860` je auditována. Skutečné otvory jsou vyříznuté z oddělených výškových pásů stěn. Sloupy zůstávají samostatné.

Použita je constrained Delaunay triangulace se zachováním otvorů, nikoli triangulace konvexního obalu. Ověřené primární API: [Shapely constrained_delaunay_triangles](https://shapely.readthedocs.io/en/stable/reference/shapely.constrained_delaunay_triangles.html), [ezdxf POLYLINE / points_in_wcs](https://ezdxf.readthedocs.io/en/stable/dxfentities/polyline.html). Skutečné verze: ezdxf 1.4.5, Shapely 2.2.0.

## Smlouva a důležité předání builderu

Receptura má `schemaVersion: 1`, `buildingId: b01`, `osmId: 53929063`, nezměněné CAD souřadnice v metrech. Blender transform: `x = -(CAD y - 731)`, `y = CAD x - 250`, `z = height`. `loops` mají vnější obrys a případné otvory; `triangles` přesně pokrývají jejich vnitřek. `bottom/top` jsou absolutní modelové výšky. Materiály/role a `collision` odpovídají předané smlouvě.

`floor.stairCores` obsahuje `bounds`, `flightBounds`, původní `roomPolygons` s popisky a explicitní `holeLoops`. Po dohodě s koordinátorem jsou v deskách vyříznuté celé core bounds, také v P01. Builder nyní vlastní doplnění všech nízkých/vysokých podest a podpory schodů. Ponechaný generický pás horní desky by nad půlpatrovou podestou vytvářel pouze 1,4 m světlosti. P01 zahrnuje i místo historické s144 pod schody; nelze je bez přezkoušení nechat nad prázdnem.

N03 má pouze úzké cores: západ `[221.4103,734.5751,224.646,738.7434]`, východ `[274.8158,723.0668,278.0515,727.3883]`. Široká díra předchozích pater by odstranila podlahy pokojů 201/202/217/218. Úzká ramena nejsou automaticky schody na střechu. N04 je malá nástavba s `roofHeadBounds`, bez prokázané funkce a přístupové trasy; pod nástavbou je souvislá podlaha, nikoli vymyšlený schodišťový otvor.

`sourceProvenance.files.titleBlock` je pouze lokální diagnostický text v ignorované receptuře. **Do `.blend` ani verzovaných exportů nepřibalovat celý titleBlock či celý recipe JSON.** Vložit pouze názvy/hash a vlastní stručné shrnutí provenience a odhadů. Verzovaný audit titleBlock neobsahuje.

## Refaktoring a ověření

- Jednotné pomocné funkce pro čištění polygonů, rozdělení zón, lokální výšku, otevírání stěn a serializaci solids. Předpočítaný buffer hotových stěn nahradil jeho opakování pro každý kandidátní segment. Prostorový index a připravený room polygon omezují párování; samotné párování patra nyní v dokončeném běhu trvalo 0,4–0,6 s. Výškové pásy zpracovávají jen otvory skutečně protínající danou oblast. Vše je offline CPU, žádná runtime cache či lifecycle hry se nemění.
- Úspěšný úplný převod: `uv run --no-project --with ezdxf==1.4.5 --with matplotlib --with shapely python -B -X utf8 scripts/cad-buildings/prepare_b01.py --source 'C:/Users/rezac/Downloads/strahov autocad/strahov autocad/strahov blok1'`, exit 0. Log v uvedené cache. Vizuálně prohlédnuty všechny 2D overlays; půdorysné příčky, obvod, okenní/ dveřní intervaly a úzká N03 cores porovnány s lokálními náhledy plánů.
- `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py`: **17 testů, exit 0**, finální běh 4,247 s. Ověřeny syntetické i skutečné výstupy: otvory v průchozí výšce, otočené měřené stěny, vnitřní i venkovní nášlapy, chyba vstupu, triangulace konkávního polygonu s dírou, jednotlivá podlaží, obě wing výšky včetně střechy, zachované podlahy N03 pokojů, unikátní identifikátory.
- Celkem **3 742 solids**, **48 321 půdorysných trojúhelníků**, **302 dveří**, **458 oken**. To nejsou výsledné počty Blender mesh triangles/draw calls ani důkaz výkonu hry.
- `git diff --check`: exit 0. Necommitované nové soubory jsou výslovně vyjmenované výše; celkový dirty strom nepředstavuje tento checkpoint.

## Identita původního checkpointu

| Soubor | SHA-256 |
| --- | --- |
| `scripts/cad-buildings/prepare_b01.py` | `9156331952ed18379eb6f5dc28319f02379a27c79ddc707e5081e00a07380e79` |
| `scripts/cad-buildings/test_prepare_b01.py` | `89e752ba26d0e770d51a7c9cf776eb0c0a142a18dd5aead35a40d43e69855434` |
| `docs/reality-pack/cad-buildings/b01/preparation-audit.json` | `dc4d08a1c414765a200a254b4ff66a4ac96f046afe336296740f13ac37be697e` |
| `.cache/cad-buildings-20261024/b01-preparation/recipe.json` | `5b05a35e040523ba525bbe98e238ee7e9bb874b8065fca050cf1c7691f8739df` |

## Omezení a provoz

Audit obsahuje 92 kandidátních strong hran k další kontrole (P01/N01/N02/N03/N04: 40/24/13/12/3). Neznamenají automaticky 92 chybějících stěn: jde o nezakryté části hran, průniky historických room fills, konstrukční detaily a sporné obrysy. Nemají se bez porovnání automaticky extrudovat. Vnější opěrné a schodišťové okraje mají dosud jen půdorysný podklad; jejich skutečné výšky vyžadují modelovou přejímku.

Blender, GPU, herní server, build, celá herní sada ani integrace nebyly spuštěny. Průchod schodišť a světlá výška patří do builderu a následné přejímky koordinátora. Vlastní krátké Python/uv procesy skončily; dva dřívější pomalé CPU průchody byly ukončeny vlastním exec session před refaktoringem a opakováním. Nezůstává vlastní proces, port ani služba.

Rezervace bude uvolněna po zapsání tohoto předání; release není schválení modelu. Integrátor přebírá recepturu, kontroluje Blender geometrii/kolize, aktualizuje Linear a mění stav tasku až po vlastním přijetí.

## Navazující oprava L/T spojů: pouze kód a lehké testy

Koordinátor výslovně zadal tuto úzkou opravu po čtecí přejímce prvního skutečného Blender modelu. Stejný vlastník znovu získal task přes `claim --adopt-dirty`; převzal pouze své původní čtyři soubory doložené tímto předáním. Cizí WIP ani builder neupravoval.

**Doložený mechanismus:** párování rovnoběžných hran vytváří pás pouze v jejich společném průmětu. U L rohu proto zbývá čtverec tloušťky stěny, přestože jej uzavřený zdrojový obrys výslovně ohraničuje. Čtecí kontrola N04 našla čtyři chybějící plochy po 0,040 m²: jihozápad `[219.309,729.692,219.509,729.892]`, jihovýchod `[222.369,729.692,222.569,729.892]`, severozápad `[219.309,733.122,219.509,733.322]`, severovýchod `[222.369,733.122,222.569,733.322]`. Opora: strong vnější hrany 40/41/42/43/47 a vnitřní 3C/3D/3E/3F/46. N02 poskytuje další doložený roh 0,10 × 0,10 m u místnosti 137: `[279.725,726.941,279.825,727.041]`, hrany 17EE/17EF/1C97/1C9C.

Nová `close_wall_junctions` pracuje s přesným uzavřeným source network po odstranění nášlapových čar. Nepřidává všechny plochy mimo room fill. Přijme pouze malé rozdílové komponenty zdrojového face, jehož nejméně 50 % již tvoří nezávisle rekonstruované stěny. Každá oprava má nejvýše 0,25 m² a rozsah 0,8 m, nesmí zasáhnout room core, musí navazovat na stávající stěnu a mít oporu ve dvou nekolineárních měřených strong úsecích. Alespoň jedna volná hrana mezery musí ležet na skutečné silné hranici konstrukce. Tím se odliší roh nebo T napojení od malé neoznačené místnosti napojené na dveře. Výřezy oken/dveří zůstávají až za touto opravou. Budoucí audit dostane konkrétní `junctionRepairs` s handles, bounds a plochou.

Refaktoring drží prostorový index, buffer hotových stěn, boundary bands a zdrojové strong úseky mimo kandidátní smyčky. Nepoužívá plošné zvětšování stěn ani deformaci měřeného obrysu. Ostatní zjištěné typy závad se v tomto kroku nemění.

Ověření: `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py -k PreparationTests` → **18 syntetických testů, 0,224 s, exit 0**. Zahrnují N04 podobný prstenec se čtyřmi rohy, N02 podobný tenký L spoj, T spoj, uzavřenou malou šachtu, uzavřené malé zádveří, malé zádveří propojené s prahem a odmítnutí otevřených nedoložených hran. Skutečné `LocalRecipeTests` nebyly nad novým generátorem spuštěny, protože by testovaly starou recepturu.

SHA-256 kódového pokračování k 01:02 UTC:

- `prepare_b01.py`: `4dbdb726ab5dce7ee4733d41984cfbeb699a8cbdc24cf14072397997f0f2bfe4`.
- `test_prepare_b01.py`: `3056facfc9b52c0752ac2242cc0bbe4973d99d0c90a0ddfc4533f4aa149a06fa`.
- Stará receptura i audit mají stále stejné SHA-256 jako v původní tabulce. Žádný nový audit, receptura, PNG, Blender model ani export nebyl vytvořen. `checkpoint.json` je také původní checkpoint, nikoli identita opraveného generátoru.

Čtecí triáž pro další samostatné rozhodnutí: P01 `A8` je měřená vnější hrana opěrné/schodišťové stěny vedle `228`, vzdálená přibližně 0,300 m; původní `room.buffer(2.5)` ji vyřadil a téměř celá vnitřní hrana 228 zůstává nepokrytá. N01 weak bočnice `2869/286B` a `28CB/28CD` opakují venkovní suterénní šachty; 3 m nad místní N01 podlahou není doložená výška a nízká bariéra by byla nový explicitní odhad. P01 `1D2–1D7` jsou naopak stěny pojmenovaného zádveří s146 a nemají být snižovány jen pro vystoupení z obrysu. N02 otevřeně označená POLYLINE `1D4B` má shodný první/poslední bod a vymezuje obdélník 0,66 × 0,83 m kolem sloupu; N03 `1038–103B` podobně uzavírají profil 0,738 × 0,54 m. Tyto profily nejsou automaticky chybějící pokojové stěny a nyní se nepřidávají.

Další krok po vrácení sdíleného výpočetního zdroje: získat odpovídající rezervaci, přepočítat všech pět plánů, ověřit skutečné počty/plochy `junctionRepairs` a nulové výplně šachet/zádveří, spustit kompletní cílenou sadu včetně lokální receptury a teprve potom znovu vytvořit/přijmout Blender model. Vlastní lehký testovací proces skončil, neexistuje vlastní server/port/GPU proces; rezervace se uvolní po tomto záznamu.

## Navazující crop, ochranné konstrukce, šachty a obklad sloupu

Stejný vlastník získal novou rezervaci s dovoleným převzetím pouze vlastního doloženého WIP. Koordinátor postupně autorizoval také odstranění falešné N01 podlahy z obou identifikovaných vnějších šachet. Po celou dobu platilo cizí výpočetní okno: zapisoval se pouze vlastní kód, testy a toto předání. Proběhly malé syntetické testy a cílené čtecí dotazy jednotlivých výkresů. Receptura, audit, PNG, Blender a exporty se nepřepočítávaly.

**Crop:** `construction_domain` nyní používá bbox měřených room polygonů s omezeným okrajem **6 m** a vyžaduje zahrnutí celého segmentu nebo profilu. Zachová tak vnější P01 hranu `A8` i její protějšek `228`, ale odmítne nulové/neplatné entity, vzdálené body i úsečku vedoucí od vzdáleného počátku přes stavební bbox. Původně zvažovaných 5 m nestačilo: N01 hrany vstupní podesty `2A79/2A7B` sahají 5,085 m za maximální room X. Ostatní rozpisové/schema vrstvy se nadále vůbec nečtou jako konstrukce.

**N01 ochranné konstrukce:** dvě konkrétní tenké L/U plochy se odvozují z celých skupin `2868/2869/286A/286B/286C` a `28CA/28CB/28CC/28CD/28CE/28CF`. Krátké uzávěry jsou pouze na doložené fasádní rovině strong `160B`, respektive `185C`. Kontroluje se shoda všech použitých hran s maskou, uzávěry na fasádě a nulový zásah do room core. Geometrie bariér nepřepisuje obytnou fasádu ani P01 zádveří s146. `low-barrier` má materiál concrete, kolizi a výslovně odhadnutou výšku **1,0 m** nad příslušnou podlahou; v současné výškové hypotéze tedy −1,6 až −0,6 m. Normální stěny se o tyto přesné profily oříznou, takže jejich třímetrová kopie nezůstane uvnitř.

**Vnější šachty:** ze stejných dvou profilů se odvodí pouze jejich vnitřní dutiny, oddělené od skutečných room polygonů. Na N01 se tyto konkrétní plochy odečtou z envelope/slab. P01 dno na místní úrovni se zachová; nezavádí se obecné odstranění všech děr ani všech neoznačených místností. Západní U dutina je uzavřena měřenými bočnicemi a fasádou. Východní L dutina má otevřený severní konec, proto se maska ukončí v rovině měřeného zakončení `286A` na y = 712,033361; tato odvozená uzávěra je označena v `boundaryBasis` a žádná nová příčná stěna tam nevzniká.

Budoucí top-level `recipe.exteriorVoids` dodrží smlouvu `{id, loops, bottom, openAbove, provenance}`; aktuálně `bottom = -4.8`, `openAbove = -1.6`, provenance `derived historical shaft footprint; heights estimated`. Souřadnice zůstávají CAD/1000. Přidané `boundaryBasis`, `sourceEntities`, `cutFloor` a `preserveBottomFloor` uchovávají původ masky a omezení. Jde o odvozený modelový podklad pro pozdější terénní výřez, nikoli vložený originál CAD.

**Obklad sloupu:** čtecí dotaz N02 potvrdil, že otevřeně označená POLYLINE `1D4B` je geometricky uzavřený pravoúhlý profil 0,66 × 0,83 m, který zcela obklopuje měřený sloup `1762` o ploše 0,15036 m². Obklad vznikne samostatně jako `column-cover`, materiál plaster, s odhadnutou výškou stejného sloupu. Odečte se již existující kruhový průřez, takže se jeho vnitřní objem nekopíruje. Profil musí být skutečně uzavřený, pravoúhlý, malý a musí jednoznačně obklopovat jediný existující měřený sloup. N03 `1038–103B` jsou sice uzavřený obdélník, ale v jejich okolí není doložený kruhový sloup: zůstanou explicitním omezením bez automatické extruze.

**Půdorysy venkovních ramen:** budoucí `floor.exteriorStairPlans` přenese zdrojové handles, bounds, viditelné hrany/nášlapy, interval délek nášlapu a případné částečné hrany. N01 východní rameno `286D–287B` má 15 viditelných hran / 14 intervalů, x přibližně 282,377–284,109 a y 707,153–711,028. P01 západní rameno `2A06–2A13` má 14 hran / 13 intervalů po přibližně 0,270 m, x přibližně 268,756–270,532 a y 707,202–710,713. P01 východní kresba `26A1`, `26A3–26AB` zachycuje 10 hran, poslední dvě částečné, s kratším viditelným během kolem y 707,006–709,006. Počet viditelných hran není důkaz úplného počtu stupňů. `heightsMeasured` je false a `bottom/top` těchto půdorysných metadat jsou null; tento krok nevytváří venkovní schody ani nevydává jejich výšky za měřené.

Refaktoring soustředil crop, uzavření pravoúhlého profilu, jednoznačné přiřazení obkladu, ochranné profily, cílený odečet šachet a odečet viditelných nášlapů do samostatných funkcí. Výšková serializace stěn nyní přijímá roli/materiál, takže nízké bariéry používají stejný ověřený postup otvorů a triangulace. Lokální výšky se jednotně zaokrouhlují, aby metadata neobsahovala zápis −4,800000000000001 m.

Ověření: `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py -k PreparationTests` → **32 syntetických testů, 0,187 s, exit 0**. Zahrnují obě crop hrany, vzdálené/křížící entity, známý přesah podesty, přesné L/U masky bez vyplnění dutin, 1 m výšku při zachování normální fasády, zásah do místnosti jako chybu, obklad s otvorem pro sloup, odmítnutí neprokázaného/nejednoznačného obkladu, otevřené N01 šachty, zachované zádveří a P01 dno. Přibyly také **tři skutečné LocalRecipeTests**, které se spustí až po přepočtu; kompletní sada má nyní 41 testů. Tvrzení o průchodu 41 testů zatím neplatí.

Aktuální kódový checkpoint:

- `prepare_b01.py`: `43fd1cc2a5ad9b7a0cdfa153bc69e30aca3ff68ed797eb362815706afab62c30`.
- `test_prepare_b01.py`: `be3738b04b7cd92b23e6bd2e311e222051fb2988e4f01787819ea3a221ddc3e0`.
- Původní receptura stále `5b05a35e040523ba525bbe98e238ee7e9bb874b8065fca050cf1c7691f8739df`; původní audit stále `dc4d08a1c414765a200a254b4ff66a4ac96f046afe336296740f13ac37be697e`. Tyto výstupy nové změny ještě neobsahují.

Po potvrzeném vrácení `heavy-validation` zbývá přepočítat B1, prověřit všechny nové konstrukční a výřezové masky na skutečných datech, spustit celou cílenou sadu a převzít nový Blender výsledek. Vlastní procesy skončily; nic se nestagovalo ani necommitovalo. Rezervace se uvolní po zapsání této aktualizace.

## Předání zpět přípravě po root přejímce R5

24. 10. 2026: root `cad-buildings-01a16b37-extraction-acceptance` převzal předchozí doložený WIP, doplnil přesný průchod horním západním okrajem vnější šachty, sémantické vyřazení slabých grafických čar vnějších schodů a explicitní podlahu obou šachet v P01. Společné obrysy se nyní získají z N01 před přípravou pater; P01 je sjednotí s envelope, N01 odečte. Nové testy odlišují chybějící dno od pouhého neodečtení již existující podlahy. Aktuální skutečná receptura R5 SHA `ab0980760cf50449da3506b04878c3d37ea9b0479fba50b74c078247d67c3b90`; cílená sada všech dosavadních přípravných a publikačních testů 58 PASS. Přepočet i procesy skončily.

Root nyní předává tento konkrétní vlastní scope zpět podagentovi `cad_b1_geometry_research` pod novým vlastníkem `cad-buildings-01a16b37-stair-extraction`. Příjemce smí `--adopt-dirty` pouze pro zde doložené soubory prepare_b01.py, test_prepare_b01.py, vlastní cache přípravy, preparation-audit.json a toto předání. Nová práce: rozlišit vnitřní schodišťové projekce jednotlivých pater, odvodit měřené L/U segmenty a podesty, jejich příchozí/odchozí návaznosti a přímé půdorysné testy. Výšky jsou stále hypotéza, žádné nové zaměření.

Do přibližně 03:10 UTC patří výpočtové okno WebGPU chatu. Během něj pouze čtení jednotlivých zdrojů, editace kódu a malé syntetické testy; žádná úplná příprava/receptura/overlay, Blender ani GPU. Root mění pouze disjunktní Blender builder a nové čisté geometrické funkce. Příjemce před hromadnou přípravou musí obdržet potvrzení skutečně znovu získaného heavy-validation.

## R6: jednotlivé vnitřní trasy, podesty a zachované podschodové místnosti

Vlastník `cad-buildings-01a16b37-stair-extraction` převzal pouze výše doložený R5 scope. Zachoval root opravy skutečných den obou vnějších šachet, horního výstupu západní šachty i sémantického vyřazení jejích slabých grafických čar. Neprováděl nový BMAD workflow, Blender ani GPU práci.

### Zjištění a zvolená interpretace

- N02 boční ramena jsou skutečné **L trasy**, s pěti příčnými a sedmi podélnými hranami a hlubokou rohovou podestou. Nejde o přímé N01 rameno s prázdným pruhem za začátkem. První část začíná na středové wing podestě, poté se otočí ven a navazuje na podélné rameno k main.
- Příchozí center se modeluje jednou podle plného vyššího půdorysu: P01→N01 west končí na y = 736,266375, east na 725,425780; N01→N02 west na 736,563876, east na 725,355323. Dřívější prodloužení až k zadním hranám 738,2967 / 723,4514 zasahovalo do horních podest. Přerušený spodní obraz není další fyzická sada schodů.
- N03 má úzké U s 10 hranami první a 9 hranami druhé větve. První větev patří fyzicky N02, druhá N03; prostřední podesta navazuje na N03 wing. Osa výstupní čáry uprostřed podesty není další nášlapová hrana.
- P01 west kresby leží nad uzavřenými room polygony s133 (`205E`) a s135 (`2186`); na severu není doložený průchod do basement wing. Po rozhodnutí koordinátora se evidují jako nebudované projekce N01 bočních ramen. Zachovávají se skutečné místnosti a jejich podlahy na p01.main, ne další schody vedoucí do severní zdi. Je to označená interpretace překrývajících se 2D dat.
- P01 east je jiný: s193 (`1FCC`) sdílí celou jižní otevřenou hranu se s191d (`1FD5`) a severní se s191c (`219E`). Dvě vlastní P01 east boční přímá ramena proto zůstala jako dostupná spojení těchto prostorů.
- s144 (`208C`) překrývá projekci s192 (`21F8`) o **5,704056 m²**. Dveře `5604/5603` spojují s144 se s142 a `561E/561D` se s145 bez kreslených vyrovnávacích stupňů. Podlaha s144 je proto přiřazena ke stejnému p01.westWing jako tyto sousední místnosti; neposouvá se plošně celý core.

Koordinátor zvolil novou jednotnou, **nezaměřenou** hypotézu: `WING_OFFSET = -1.8`, main podlaží stále −3,2/0/3,2/6,4/9,6 m. Wing podlaží jsou −5,0/−1,8/1,4/4,6/7,8 m. Krátká centra tak mají převýšení 1,4 m, boční sestavy 1,8 m. Je zachována každá měřená horizontální hrana; počet N hran se interpretuje jako N stoupání a N−1 vodorovných intervalů, poslední stoupání ústí do podesty. Tento výklad podporuje [výukový podklad FAST VUT](https://www.fce.vutbr.cz/PST/kacalek.p/BH03/prednaska/01%20uvod_schodiste_rozdeleni.pdf), zejména pojmy nástupní/výstupní stupeň a vztah délky ramene k počtu výšek. Podklad nedokazuje výšky této budovy. Modelové výšky stupňů se mezi rameny liší a nejsou vydávány za zaměření nebo stavební posudek.

### Přesný kontrakt R6

Top-level `interiorStairPlans` obsahuje **16 fyzických tras, 22 segmentů a 20 podest**. Každá trasa má jedinečné ID, owner/source floor, core ID, krajní level keys a záznam příchozích/odchozích projekcí. `interiorStairObservations` zachovává obě nebudované P01 west boční kresby. Žádné schodiště na střechu se nepřidává.

Každý segment obsahuje `a`, `b`, `width`, `bounds`, `axis`, absolutní `treadPositions` a vzdálenosti `riserPositions` od `a` ve směru k `b`, včetně 0 a délky. Dále má vlastní `ownerFloor`, `sourceFloor`, `lowerLevelKey`, `upperLevelKey`, source handles, `visibleIntervals`, `modeledRiserCount` a explicitní `riserCountInterpretation`. Rozdíly některých obrysů oproti krajní hraně o přibližně 44 mm se zaznamenávají; nepřesouvá se kvůli nim koncová nášlapová hrana.

Podesty obsahují `loops` **i `triangles`** ze stejné constrained triangulace jako solids, vlastní `ownerFloor` a `levelKey`. Jsou omezeny na odebrané core otvory, takže nevytvářejí druhou koplanární kopii stávající podlahy mimo otvor; `sourceBounds` uchovává plný návrhový rozsah návaznosti. Širší wing a main podlahy mimo core zůstávají součástí běžných slab solids.

`interiorStairLevelEstimates` je explicitní mapa modelových úrovní. L turn keys se vypočítají poměrem počtu riserPositions obou částí; například 5+7 dává při 1,8 m společného převýšení mezilehlou hladinu 2,15 m. Stejná mapa je u každé trasy jako `heightEstimates`. Nezávislý root `model_geometry.stair_levels` vrací nad R6 přesně stejné hodnoty, maximální rozdíl 0.

### Podschodové konstrukce

V extrakci se skutečné wall solids rozdělily podle **devíti omezených masek**; ostatní půdorysné části zůstaly zachované. Výsledkem je 24 wall dílů s `ceilingPlane` v CAD XY metrech, `ceilingMaskId` a source handles. Blender dostává hotové díly a pouze vytvoří uzavřenou geometrii pod jejich rovinou, bez druhé sady maskovacích pravidel.

- P01 `189E/189F` u konce west center se dělí na část pod horní podestou (flat cap high−0,20) a přístupovou část pod skutečným ramenem. P01 `13DF/13E0` je pod poslední částí east center a dostává odpovídající sloping soffit. Masky jsou jen obaly konkrétních měřených párů hran.
- P01 severní uzávěr s133 `1B5C/1B5D` končí pod N01 nižší podestou; zůstává místnost, nevzniká třímetrová překážka nad ní. Části zdí s133/s135 pod skutečnými N01 bočními rameny zachovávají jejich spodní objem pod šikmým podhledem.
- P01 s144 dostává pouze lokální room/plateau masku a skutečnou podlahu na −5,0 m. Podschodové plochy s133, s135 a s134 se obnovují na −3,2 m; jižní s191d na −5,0 m. Přidává se pouze jejich část uvnitř odebraného core, takže stávající podlahy mimo core nejsou zdvojené.
- N02 east-right podélný výstup má podpěrnou severní dvojici `17EE/1C9C` pod posledním nášlapem. Boční stěna a dveře `2DFE/2DFD` jsou svázány s L turn hladinou 2,15 m, ne automaticky s n02.main. Měřený otvor je mezi x = 279,724637 a y = 723,874921–724,574920; jeho půdorys se nemění.

Pro šikmé podhledy platí root kontrakt měřeného letu: začátek low−0,20, konec high−riser−0,20. Poslední svislé čelo a horní podporu dodává podesta; flat cap pod ní zůstává high−0,20. Tato geometrická odlišnost je zohledněna v `stair_soffit_plane` i regresi.

### Skutečné ověření a identita

Po výslovném vrácení sdíleného zdroje a oznámení rootu proběhla **jedna úplná příprava B1**, exit 0. Root během ní nespouštěl Blender. R5 receptura a audit byly předem uchovány v `.cache/cad-buildings-20261024/b01-preparation/r5-before-stairs/`. Nové logy: `preparation-r6.log` a `tests-r6.log` ve stejné přípravné cache.

- `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py`: **57 testů PASS, exit 0, 4,644 s**. Předchozích 42 syntetických kontrol prošlo samostatně. Lokální regrese navíc ověřují kanonické konce center, unikátní lety, L podesty, owner/level keys, s144 floor a 137 door level.
- Nezávislé čtecí použití root `stair_levels` a `stair_profile`: všech 22 měřených profilů přijato, mapa úrovní shodná, největší modelové stoupání přibližně **0,20 m**.
- Bodová 2D kontrola podpory 0,5 m před začátkem a 0,1 m za koncem každého z 22 segmentů: **44/44 má podlahovou podporu**. Toto neověřuje kapslový pohyb, průchod dveřmi, zábradlí ani světlou výšku.
- R6 má **3 551 solids**, 49 187 půdorysných trojúhelníků a 24 capped wall dílů. Nejde o výsledný Blender triangle count ani GPU důkaz.
- Žádný Blender, renderer, GPU nebo server tohoto podagenta neběží. Všechny vlastní krátké procesy skončily, nic se nestagovalo ani necommitovalo.

SHA-256 R6:

| Soubor | SHA-256 |
| --- | --- |
| `scripts/cad-buildings/prepare_b01.py` | `1557032e2630029bf2d41cb36e683cfa37dfe6a9cd63d98fd06665747def30c6` |
| `scripts/cad-buildings/test_prepare_b01.py` | `8554cfc460867edf5b53e470a898cf93749ddc6224a7bda665fcb6c27d5614e0` |
| `.cache/cad-buildings-20261024/b01-preparation/recipe.json` | `27dbb1d36a8e5466fda1038e77e88573550c030c9b618ee080cbb60cfa4c0c79` |
| `docs/reality-pack/cad-buildings/b01/preparation-audit.json` | `02d4f91ec1b52650a559c4c8ee6ad09f4d58fb2d166df27e078f3054a19cbf5c` |

### Předání rootu a otevřené body

Root přebírá tento konkrétní R6 stav a po uvolnění claimu smí převzít extraction scope pro navazující západní exteriéry. Jeho vlastní průzkum severozápadního L a severovýchodního šikmého venkovního ramene není tímto checkpointem implementován; R6 stále obsahuje již ověřené dvě východní vnější šachty.

Nativní Blender/Rapier přejímka R6 zbývá rootu. Pro validní probe N01 east-side-east je důležité, že jižní přístupové dveře `283A/2839` mají zavřený otvor x = 279,918348–280,532986 na y = 723,004341, zatímco osa schodů je x = 280,821696. Reálný přístup má tedy boční posun; přímý začátek půl metru za schodem nemusí vést osou dveří. Nominální otvor 0,614638 m může být po odečtení rámu těsný pro kapsli o průměru 0,56 m. Není to důvod bez evidence přesunout či rozšířit historický otvor.

## Root přejímka R7a a předání západních exteriérů

Root převzal výše doložený R6. První skutečný route probe dokončil 30/36 směrů. Zbývající konkrétní kontakty byly odstraněny bez rozšíření CAD otvorů:

- P01 s133 severní cap zahrnuje také měřený návrat `444E` mezi prvním nášlapem a párem `1B5C/1B5D`. Předchozí masky ponechaly v tomto úzkém intervalu plně vysoký pás. Bodový witness (218,6745; 738,35; Z−1,0) byl nejprve RED; nová podesta má pod sebou zachovanou spodní stěnu.
- N01 pár `15FD/1600` se pouze v půdorysu N02 east-right příčného ramene ukončuje pod jeho skutečným podhledem. Dříve překážel vyššímu rameni jako plná třímetrová zeď. Witness (279,54; 724,2877; Z2,4) byl RED; spodní část na Z0,5 zůstala.
- `accessPath` propojuje skutečné portály. N01 lower `283A` má střed (280,225667; 723,004341), upper `2852` střed (280,821721; 727,046281). Průchod vstoupí kolmo spodními dveřmi, potom uvnitř širokého ramene změní směr a odejde horními dveřmi. Geometrie otvorů se nemění. N02 L trasa se vede středem skutečných dveří `2DFE` s malým příčným posunem. Tyto údaje builder uloží do skutečných schodišťových anotací.

R7a: **93 společných cílených testů PASS** (60 příprava, 22 čistá geometrie, 11 publikace), skutečný Blender build/reopen/export PASS a **36/36 celých tras oběma směry PASS** s kandidátní kapslí 0,28/0,52 m a autostep minWidth 0,10 m. Jde o samostatný Rapier model, nikoli hru/GPU. Nativní clipped-wall a measured/skew staircase fixture rovněž prošla. Předchozí RED a 30/36 či 34/36 reporty zůstaly v cache.

Zmrazené hashe před předáním:

- prepare_b01.py `7be26fe36c983ee9532bd6ad0bd690ae8e0dac3581f16d2faca048edc0d12650`
- test_prepare_b01.py `cc1ab1af4f04955f6635c53965a8e7206a90d29b075dca53a76b763832e31866`
- recipe.json `a2a18860d84d4c2c2c8c342b9dceb930e4c9570bab867af91e64b7e4a6d7dc00`
- preparation-audit.json `09ea1f42668dc9665f4879d771e83bff96dea78f5a6862b48c73a2ede47b0ee6`
- Blender `f92a4feb64056e7812ba31112eb246a6c081c476ee717d7421c0aacfc094daf3`
- GLB `9b52146c15749091ec593c72b4072a7efc643687c53f59ac31a9225393f285ea`

Root nyní předává pouze tento extraction scope zpět podagentovi `cad_b1_geometry_research`, owner `cad-buildings-01a16b37-west-extraction`, pro dvě dosud chybějící západní vnější trasy a jejich návazné podlahy, terénní výřezy a opěrné konstrukce. Smí `--adopt-dirty` pouze na zde doložených vlastních přípravných souborech. R7a musí nejprve zachovat v vlastní přípravné cache; dosavadní vnitřní trasy jsou regresní základ a nesmí se plošně změnit. Žádný commit ani stage.

Koordinátor řídí heavy samostatně. Do dalšího výslovného potvrzení pouze kód, jednotlivé čtecí sondy a malé syntetické testy, žádná úplná příprava/overlay ani Blender. Root právě dokončuje CPU obrázky R7a a pak předá domluvené další výpočtové okno jinému chatu. Přesný procesní stav je ve validačním handoffu a skutečném registru, nikoli odvozovaný z tohoto textu.

## Západní exteriéry: příprava kódu, předání před úplným přepočtem

Vlastník `cad-buildings-01a16b37-west-extraction` převzal doložené soubory pomocí vlastního claimu s `--adopt-dirty`. Před úpravami ověřil hashe R7a a uchoval kód, testy, recepturu, audit, Blender, GLB, runtime JSON a modelový audit v `.cache/cad-buildings-20261024/b01-preparation/r7a-before-west-exterior/`; `frozen-manifest.json` uvádí kopie a hashe. Do produkčních modelů ani root builderu nezapisoval. Žádný nový BMAD workflow.

### Výzkum a rozhodnutí

N01 je kanonický úplný půdorys obou západních venkovních tras. Pouhá kopie přerušeného P01 obrazu by vynechala stupně a konce ramen. Nahrazení šikmého ramene natočeným obdélníkem by změnilo koncové body nášlapů. Zvolena proto přesná dvojice koncových bodů každé N01 hrany; P01 dodává skutečnou tloušťku identifikovaných opěrných párů. Žádný globální posun budovy, obytných fasád či dveří.

- NW má 6 hran `3180–3185` ve směru k jihu a 8 hran `3186–318D` směrem na západ, s měřeným L obratem. První rameno má šířku 1,806766 m. Druhé ponechává proměnnou šířku 1,545995–1,564622 m a šikmé boční hrany.
- NE má 10 hran `31E3–31EC` a jeden terminální úsek `31DE`, omezený přesnými průsečíky s `31E1/31E2`. Šířka je 3,650784–3,669411 m. Poslední stoupání dodává horní podesta.
- Koordinátorem zvolené, **nezaměřené** výšky: spodní `p01.westWing = −5,0 m`, modelově 0,20 m na každou hranu, NW obrat −3,8 m, horní NW −2,2 m, horní NE −2,8 m. To jsou předběžné místní konce, nikoli známá nadmořská výška terénu. Vyžadují navazující kontrolu DEM při integraci.
- Přesnější kontrola překonala dřívější přibližný údaj o odchylce 0,4 m: P01 spodní opěra `152B/152C` leží vůči N01 `31E2` kolmo o 0,4192–0,6513 m jinde; `152E` má jeden konec 0,5174 m od `31E1`. Každý pár má v metadata oba podepsané koncové normálové odstupy. Koordinátor byl upozorněn; stále jde o lokální meziplánovou interpretaci, ne zjištěnou chybu zaměření.

Obvodové tloušťky se počítají z P01 párů a mají 0,279890–0,290984 m, vnitřní dělící opěry 0,146882–0,151089 m. Mapování: `317C←B0/B1`, `317D←AE/AF`, `317E←B5/B6`, `317F←B3/B4`, `31DD←1524/1525`, `31DE←1526/1527`, `31DF←1528/1529`, `31E0←1530/1531`, `31E1←152E/152F`, `31E2←152B/152C`. Doplňkové uzávěry `B7/B8`, `152D` a pokračování vnějšího konce `1533/1534` náleží těmto nahrazeným profilům. **B2 a 152A jsou skutečné fasádní návraty a zůstávají.**

### Implementace a kontrakt

Změněny pouze `prepare_b01.py`, `test_prepare_b01.py`, tato evidence a vlastní ignorovaná cache. Přibyla izolovaná příprava západních dat a obecné malé funkce pro měřené šikmé hrany, podestu, tloušťku páru, opěrný profil a podhled. Normalizace pořadí konců nekopíruje zpět do zdrojových polí; mapy výšek mají deterministické pořadí. AST porovnání vůči zmrazenému R7a potvrzuje, že z existujících funkcí se změnily pouze `prepare_floor` a `prepare`. Vnitřní schodišťová metadata, podschodové masky, portály a východní šachty zůstaly beze změny.

- `exteriorWestStairPlans`: dvě trasy `p01-west-exterior-nw` / `p01-west-exterior-ne`, celkem tři segmenty a pět podest. Owner floor je `p01`, kanonický source floor `n01`. Každý segment má `frontEdgesCad`, vlastní `edgeSourceEntities`, `a/b` ve středech první/poslední hrany, kumulativní `riserPositions` po středech, skutečný rozsah šířek a oba level keys. Podesty mají loops i constrained triangles.
- `exteriorWestLevelAnchors` obsahuje jen `westExterior.nw.top: −2.2` a `westExterior.ne.top: −2.8`. `exteriorWestLevelEstimates` obsahuje pouze `p01-west-exterior-nw:turn: −3.8`.
- Dvě `terrainCutouts` mají `loops`, `bottom`, `openAbove`, výslovný `coordinateSpace = CAD XY metres; no origin subtraction or game-axis transform` a `terrainValidationPending = true`. Východní `exteriorVoids` zůstávají dvě původní položky. Root je při exportu sloučí a transformuje jednou.
- Spodní podlahy se skutečně doplní; nelze pouze neodečíst plochu, která v původním room polygonu není. Nižší podesty se odečtou z těchto den, aby builder nevytvořil koplanární dvojitou podlahu. N01 ze slab odečítá pouze vymezené vnější prostory. Ostatní patra zůstávají beze změny.
- `exteriorPortal` a `exteriorWestDoorConnectors` zachovávají dveře `p01-door-44E2` (střed 217,362161; 754,401226) a `p01-door-4516` (228,981787; 750,053596). Podlahové prahy překlenují místní nesoulad obrysů přes jejich skutečnou šířku; délka 0,35 m na každou stranu dveří je výslovný odhad. Tyto vnitřní prahy nerozšiřují terénní masky.
- Konkrétní nášlapy, osy a přerušovací čáry západních schodů jsou vyřazeny z obecného párování stěn. Seznamy se evidují zvlášť od nahrazených opěrných obrysů. Slabé fasádní okenní čáry `2738/2739/273C/273F/2720/2721` zůstávají.
- Deset opěrných profilů se sjednotí bez dvojitého objemu a rozdělí na 38 dílů role `retaining-wall`. Základ je −5,0 m, volný horní okraj odhad −2,0 m. Jen části pod skutečným ramenem dostanou jeho po jednotlivých intervalech odvozený `ceilingPlane`; pod horní podestou jsou fyzicky ukončeny NW na −2,4 m a NE na −3,0 m. Žádná neviditelná kolizní výjimka, spodní opěra zůstává.

### Ověření a jeho hranice

`uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py` skončilo **OK, 71 testů, 4,370 s**. Jedna lokální třída pro novou kompletní recepturu je výslovně přeskočena, protože aktuální receptura je stále R7a. Log: `.cache/cad-buildings-20261024/b01-preparation/tests-west-light.log`. Nové syntetické regrese pokrývají skutečné šikmé hrany, různé šířky, normalizaci bez mutace, odmítnutí zpětného pořadí, podesty s podporou 0,5 m před/za koncem, podhled konstantní přes každou hranu, párovou tloušťku, disjunktní opěry, konkrétní sémantické výjimky, lokální řez N01 a jediné obnovení suterénního prahu.

Cílená čtecí sonda pouze P01/N01 vytvořila samostatný `.cache/cad-buildings-20261024/b01-preparation/west-exterior-candidate.json`. Nejde o úplnou recepturu. Koordinátorův čistý `model_geometry.skew_stair` přijal všechny 3 skutečné lety; 5/5 podest má přesně krytou triangulovanou plochu, 2/2 dveřních středů mají podporu, opěrné XY díly se nepřekrývají. `git diff --check` prošel. Tyto kontroly nedokládají Blender, kapslové průchody, zábradlí ani konečný terén.

Aktuální hashe:

- prepare_b01.py `4f4bec76f6f3b685249593cb4d33dde8237f1d2ec76f0e79f39a2ae6fbffeede`
- test_prepare_b01.py `0887fb991e7d38235eff3cc9c5a645ed22b660a16e215c39d5fd8bcf74f91bf9`
- west-exterior-candidate.json `61cb4dfc7df5487f4dd155c6a96e5cd85d25993891d867ade6884a7d6ecd4fd5`

**Úplná příprava, overlay, audit ani Blender nebyly spuštěny.** Receptura stále má zmrazený hash R7a `a2a18860d84d4c2c2c8c342b9dceb930e4c9570bab867af91e64b7e4a6d7dc00`, audit `09ea1f42668dc9665f4879d771e83bff96dea78f5a6862b48c73a2ede47b0ee6`. Heavy okno drží jiný chat; následné spuštění musí koordinátor výslovně zařadit po jeho navrácení. Je třeba přepočítat všechna patra, spustit novou lokální třídu, zkontrolovat obě spodní fasádní napojení a horní konce skutečným modelem/Rapierem a posléze DEM. Dosavadních 36/36 průchodů platí pro zmrazený R7a, nikoli pro dosud nepostavené západní schody.

Všechny vlastní krátké procesy skončily, nebyl spuštěn Blender/GPU/server, nic se nestagovalo ani necommitovalo. Po tomto předání se claim uvolňuje. Root smí převzít pouze zde doložené přípravné soubory a cache pomocí vlastního `--adopt-dirty`; západní kandidát je připraven pro jeho další ověření.

## Kompletní sada šesti vnějších tras a oprava vstupních prahů

Vlastník `cad-buildings-01a16b37-all-exterior` převzal výše doložený scope po načtení předání a vlastním úspěšném claimu s `--adopt-dirty`. Root mezitím přípravné soubory neměnil. Změny se týkají jen `prepare_b01.py`, `test_prepare_b01.py`, vlastních výstupů přípravy, malého auditu a tohoto předání. Žádný vlastní BMAD, Blender, GPU, server, stage ani commit.

### Úplná čtecí inventura a rozhodnutí

Před rozšířením proběhla kontrola schodišťových šipek/kroužků, pravidelných řad hran i náhledů všech pěti půdorysů. Vedle dvou východních šachet a dvou západních tras byly nalezeny ještě dvě konkrétní úplné kresby:

- N01 východní čelo hlavní chodby: **13 hran** `2A7A`, pak `2A87–2A7C` ve směru −X, od x 287,350267 k 283,811241. Šířka 4,097820 m v y 728,908926–733,006746, běh 3,539026 m. Kroužek `2A89`, osa `2A88`, šipka `2ACE`. Horní podesta pokračuje podle `2A79/2A7B` k x 282,283872 a k trojici výplní `2A37/2A4F/2A66`.
- N02 za dveřmi `28DD`: **8 hran** `2900`, `28FF–28FA`, `28F7` ve směru +Y, od y 706,275737 k 708,375735. Šířka 2,220001 m, běh 2,099998 m, rozteč přibližně 0,300 m. Podesta x 282,476602–284,696603 / y 708,375735–709,475735 a boční spojka `28F5/28F6` až k fasádě x 281,216603. Kroužek `2904`, osa `2903`, šipka `2949`. Není to totožná projekce nižší šachty: má jiné konce, šířku i vlastní boční podestu. Obě trasy zůstávají oddělené; jejich Z neplyne z názvu souboru.

N03 obsahuje známé vnitřní U, N04 neobsahuje další řadu nášlapů. P01 `55DE/55DF` a N01 `2BE8/2BED` jsou jednotlivé vnitřní příčné čáry s trojúhelníkem, bez doloženého celého ramene nebo Z. Nebyly z nich vymyšleny další schody. Na vyšších čelech chodby jsou opakované dveřní oblouky ve vrstvě `3-DVERE`, ale bez venkovní podesty. Patnáct těchto výplní má nyní `openingClassification = facade-opening-unconfirmed-access`, `accessConfirmed = false` a zdrojové zdůvodnění. Není jim přidán balkon, schodiště ani změřený parapet. Čtyři výplně s doloženou novou podestou mají `accessConfirmed = true`; samotné dveřní XY ani vzhled se tím nemění.

Zvažované varianty byly ponechat starých 16 odhadnutých stupňů v šachtách, přesné počty nezahrnout kvůli současnému fyzikálnímu limitu, nebo zachovat každou skutečnou hranu a explicitně oddělit limit konkrétního venkovního ramene. Koordinátor zvolil poslední variantu. Všechny vnější trasy používají stejný měřený edge kontrakt; nevznikají další fyzické kopie spodních přerušených projekcí.

### Obecný kontrakt

Původní nepublikovaná west-only pole byla po dohodě s rootem nahrazena obecnými `exteriorStairRoutes`, `exteriorLevelAnchors`, `exteriorLevelEstimates`. Sada má **6 tras, 7 segmentů a 13 podest**:

| Trasa | Source / owner ramene | Hrany | Výškové klíče / pracovní Z |
| --- | --- | --- | --- |
| `p01-west-exterior-nw` | N01 / P01 | 6 + 8 | p01.westWing −5,0 → NW turn −3,8 → westExterior.nw.top −2,2 |
| `p01-west-exterior-ne` | N01 / P01 | 11 | p01.westWing −5,0 → westExterior.ne.top −2,8 |
| `exterior-east-shaft-west` | P01 / N01 | 14 | p01.eastWing −5,0 → n01.eastWing −1,8 |
| `exterior-east-shaft-east` | N01 / N01 | 15 | p01.eastWing −5,0 → n01.eastWing −1,8 |
| `exterior-main-east` | N01 / N01 | 13 | exterior.mainEast.lower −2,6 → n01.main 0 |
| `exterior-n02-east` | N02 / N02 | 8 | exterior.n02East.lower −0,2 → n02.eastWing 1,4 |

Každý segment má přesné `frontEdgesCad`, jednotlivé `edgeSourceEntities`, pořadí hran, owner/source floor a oba level keys. Podesty mají constrained triangles. Východní šachty ponechávají owner ramene N01 jako R7a; jejich dolní podesta je P01, horní N01. Nový kód rozděluje původní podlahové solids pouze na stejné výšce a podlaží, aby podestu dodal právě jednou. Souhrnná skutečná plocha dna obou šachet zůstává zachovaná, což ověřuje test přes union podlah a podest. Pod novou vyšší trasou N02 se nižší šachta nemaže.

`exteriorLevelAnchors` obsahuje pouze čtyři venkovní konce: `westExterior.nw.top = −2.2`, `westExterior.ne.top = −2.8`, `exterior.mainEast.lower = −2.6`, `exterior.n02East.lower = −0.2`. Jediný nový odvozený meziklíč je `p01-west-exterior-nw:turn = −3.8` v `exteriorLevelEstimates`. Všech šest tras má `terrainValidationPending = true`. Čtyři nové `terrainCutouts` jsou samostatné, výslovně v CAD XY metrech; původní dvě `exteriorVoids` zůstávají obsahově shodné s R7a. Prahové spojky do budovy terénní masky nerozšiřují.

Jediná explicitní výjimka `maxRiserHeight = 0.24` patří segmentu `exterior-east-shaft-west-flight`: 3,2 m / 14 hran = **0,228571 m**. U patnáctihranného protějšku je přibližně 0,213333 m. Žádné vnitřní rameno nedostalo výjimku a jejich limit zůstává 0,22 m. Zdejší testy neprokazují jeho skutečné projití kapslí; root musí povolení zavést do vlastního geometrického primitiva a použít odděleného fyzikálního kandidáta.

Nové konkrétní série `2A79–2A88` v N01 a `28F5–2903` v N02 se vyřazují z obecného párování stěn. Původní `floor.exteriorStairPlans` zůstává referencí; builder musí postavit jednu sadu z `exteriorStairRoutes`, nikoli současně staré odhadované lety. Západní opěry, jejich source masks, podhledy a skutečné podlahy z předchozí části zůstávají.

### Nalezená a skutečně ověřená prahová oprava

První úplná příprava skončila exit 0 a tehdejších 82 testů prošlo. Následný odvozený 2D přehled však odhalil mezeru kolem **0,17 m** mezi tenkým rámem trojice vstupních dveří N01 a začátkem podesty x 282,283872. Bodové sondy x přibližně 282,146–282,246 m neměly podporu. N02 28DD byl již souvislý. První kandidát se proto nepovažoval za přijatý.

`connect_landing_to_portals` nyní vytvoří jen lokální polygon od skutečných zavřených dveřních konců k nejbližší hraně měřené podesty; vzdálenost nad 0,5 m odmítne. Nemění otvor, jeho šířku ani vnější půdorys schodů. Tři spojky N01 mají plochy **0,168150 / 0,172425 / 0,172663 m²**. Nová lokální regrese byla nejprve skutečně RED na staré receptuře pro 2A37 a po opakované přípravě je GREEN pro souvislou trasu 0,9 m přes každý ze tří prahů. Syntetické regrese zároveň odmítají vzdálený otvor, z něhož by jinak vznikl vymyšlený balkon.

První výsledek je zachovaný v `.cache/cad-buildings-20261024/b01-preparation/all-exterior-before-threshold-fix/`, recipe SHA `88bb3514bac9b49b2e03d4979b80a882b708677889d20410d002f3009a3ace25`; `tests-all-exterior-threshold-red.log` uchovává skutečnou neúspěšnou regresi. R7a zůstává v původní zmrazené složce. Starší `exterior-all-candidate.json` je pouze předprahová cílená metadata sonda, nikoli současná plná receptura.

### Skutečné ověření, identita a předání

Obě úplné přípravy proběhly až po samostatném výslovném potvrzení koordinátora, vždy bez souběžného Blenderu. Druhá skončila **exit 0**; log `preparation-all-exterior-threshold.log`. Konečné cílené ověření `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py` skončilo **85/85 PASS, bez skip, 4,511 s**; log `tests-all-exterior-final.log`.

Nová receptura má **3 565 solids a 48 799 půdorysných trojúhelníků**. To není výsledný Blender triangle count. Příprava vytvořila overlay všech pěti pater a z konečné receptury vznikl a byl zhlédnut také `exterior-routes-overview.png` se všemi šesti trasami, měřenými hranami, podestami, prahy a odhadnutými hladinami. Čtecí hluboké porovnání potvrzuje obsahovou shodu `interiorStairPlans`, `interiorStairLevelEstimates`, `underStairWallMasks`, `underStairRooms` a `exteriorVoids` proti zmrazenému R7a. Žádná geometrická optimalizace nebo nové hloubkové kroky neobešly původní vnitřní portály.

| Soubor | Konečný SHA-256 |
| --- | --- |
| prepare_b01.py | `f7c3eb94af125cb02e2ed6251a61918020d6dd98448d807ebee128b809040764` |
| test_prepare_b01.py | `41487262674a6cfeaef92b7a42c1631316b82f5b72f5604cec4d59cfa4d819b8` |
| recipe.json | `cd3a8c7311d3382e2c04486ee92f84d23e9cf58a59346d925928ece5622eca78` |
| preparation-audit.json | `81063ec86c7b35f8d561c348331000c89a3e09c0e18848044cf43eae9f350d88` |

**Hranice přijetí:** přesná XY sémantika a zdejší geometrické regrese jsou ověřené. Nativní Blender/Rapier přejímka nové šestice zatím neproběhla. Venkovní a globální Z nejsou finální: runtime průzkum doložil rozpor jednotných stoupání s dosavadní terénní kotvou a 4m DEM; root dále zkoumá primární IPR 3D podklady včetně rozdílu střešních hladin. Tato evidence neopravňuje označit budovu za as-built nebo převzít pracovní Z jako zaměření. Modelová výšková interpretace, terénní návaznost, případné zábradlí a praktické průchody patří do navazující přejímky rootu.

Po konečných testech a 2D kontrole byly všechny vlastní procesy ukončeny; root dostal zprávu, že může využít heavy pro IPR pohled. Po dopsání této evidence se extraction claim uvolňuje. Root smí převzít jen výše doložené přípravné soubory, cache a audit vlastním `--adopt-dirty`. Předanou recepturu již tento podagent nemění.

## R8 s146: zachovaná stěna pod skutečným vnějším schodištěm

Koordinátorova nativní přejímka R8 zastavila publikaci na skutečném RED: `exterior-main-east-flight`, krok 11, headroom přibližně 0,20 m, překážka `b01:p01:wall:plaster`. Starý R7a master nebyl přepsán. Vlastník `cad-buildings-01a16b37-s146-soffit` převzal výše doložený přípravný scope vlastním claimem; žádné výškové kotvy či interpretace podlaží se v této opravě neměnily.

Čtecí identifikace určila CAD střed kroku **(284,258277; 730,957836)**, jeho modelový nášlap −0,4 m a původní horní wall band `p01-wall--1.100-0082` s vrchem −0,2 m. Tentýž půdorys měly spodní bandy `p01-wall--3.200-0200` a `p01-wall--2.600-0113`. Jsou odvozené ze skutečného páru **1D2/1D3**, nikoli z grafiky schodů. Příslušný předsazený prostor s146 má room entity **1EC6**; jeho severní stěna je 1D4/1D5, jižní 1D6/1D7. Dveře 2965 a podlaha s146 zůstávají na svých původních úrovních.

Bylo odmítnuto odstranit celou stěnu či celý prostor, snížit okolní fasádu nebo schody posunout. Nový malý helper `exterior_support_masks` nejprve vytvoří každou ze tří párových stěn zvlášť; neobaluje šest hran společným convex hullem, který by zahrnul místnost. Pouze jejich průnik se skutečným vnějším ramenem/podestou dostane stávající mechanismus `ceilingPlane`. Tři intervalové masky pod ramenem používají přesný `edge_soffit_masks`; pod horní podestou je plochý spodní líc `upperLevel − 0.20`. Vznikly čtyři logické masky, šest polygonových záznamů. Všechny spodní/výškové hodnoty se odvozují z `exterior['levels']`, takže budoucí změna stacku nevyžaduje ruční přepis souřadnice Z této opravy.

Na původním witnessu je nyní spodní líc ramene, a tedy horní limit stěny, **−0,700000 m**. Spodní těleso zůstává. Severní strip mimo skutečný půdorys schodů (witness 283,0; 733,025; Z−0,3) nebyl snížen.

Ověření:

- Původní cd3… receptura a přípravný kód byly před změnami uchovány v `b01-preparation/r8-before-s146-soffit/` včetně manifestu.
- Nový test skutečné CAD stěny byl **RED** proti původní receptuře, přesně s nálezem `p01-wall--1.100-0082`; důkaz v `tests-s146-red.log`.
- Syntetické testy ověřují omezení masky na párové stěny, zachování volné místnosti a okolních částí, a skutečnou změnu spodního líce po změně vstupní level mapy.
- Regenerace receptury/auditu skončila **exit 0**, log `preparation-s146.log`; žádný Blender/GPU tohoto podagenta neběžel.
- Konečné cílené testy: **89/89 PASS, bez skip, 4,892 s**, log `tests-s146-final.log`.
- Všechny P01 dveře a podlahové solids jsou přesně shodné s cd3… checkpointem. Union XY půdorysů všech P01 wall solids se zachoval v toleranci testu 0,002 m²; nevznikla vymazaná stěna, propadlá podlaha ani změněný otvor. Nativní opakování původního RED zůstává koordinátorovi.

| Soubor | SHA-256 |
| --- | --- |
| prepare_b01.py | `b869297ff1d52eee805e3aa913163c35bc2a77dffb3acc854f65a5c87756cb18` |
| test_prepare_b01.py | `5b909be28ce6223e8bb973a4427d98b0131f2b36118040662142a429b2c40982` |
| recipe.json | `4ae5fee52efb02299ce3171a4a8fb3861608cc00e50c01e313c0d35eb4730316` |
| preparation-audit.json | `16f91ff8d96a1f982a622ab9d1ec45658b14b994128dc94777b5c95da83fd5e5` |

Žádné nové Z nebylo vydáváno za zaměření; všechny předchozí `terrainValidationPending` zůstávají. Samostatný rozbor IPR střešních a podestových hladin není touto opravou implementovaný. Po ukončení všech vlastních procesů se claim uvolňuje; root smí převzít pouze tento doložený přípravný WIP vlastním `--adopt-dirty`. Následující geometrický průzkum podagenta je pouze čtecí.

## Výšková varianta C, přesné zóny a fasády: předání kódu před regenerací

Vlastník `cad-buildings-01a16b37-height-c` převzal doložený přípravný WIP vlastním claimem s `--adopt-dirty`; root během této práce přípravné soubory neměnil. Před úpravami vznikla vlastní zmrazená kopie `b01-preparation/before-height-c/` s kódem, testy, recepturou, auditem a manifestem. Změněny jsou pouze oba přípravné Python soubory, vlastní ignorovaná cache a toto předání. **Receptura, audit, overlay ani Blender nebyly přepočítány.** Koordinátor předal heavy jinému chatu; tento checkpoint obsahuje kód a lehké ověření, ne hotový model C.

### Rozhodnutí a původ údajů

Koordinátor vybral C po porovnání jednotných podlaží 3,2 m, jednotných 3,0 m a stacku odvozeného z přesných počtů vnitřních hran se stoupáním 0,15 m. Poslední varianta současně odpovídá sledovaným platformám a fasádním pásům IPR 2023 lépe než pevný wing offset. CAD je z roku 2005, neobsahuje zde doložené svislé kóty; IPR je fotogrammetrický podklad jiného data. Výšky proto nesou `b01-C-cad2005-ipr2023-hypothesis`, nikoli označení zaměření či as-built.

| Zdrojové patro | Main lokálně | Obě křídla lokálně | Spodní líc další main / wing desky |
| --- | --- | --- | --- |
| P01 | −3,00 | −4,65 | −0,20 / −2,15 |
| N01 | 0,00 | −1,95 | 2,65 / 0,85 |
| N02 | 2,85 | 1,05 | 5,50 / 4,15 |
| N03 | 5,70 | 4,35 | 8,80 / 7,85 |
| N04 střechy | 9,00 | 8,05 | 11,35 pouze pod skutečnou nástavbou / žádný další wing strop |

World origin N01 je odhad 4,20 m. Horní líc nástavby je lokálně 11,55 m. Střechy nejsou vynucené další obytné patro. Všech 22 vnitřních segmentů se odvozuje z jedné level mapy a počtu skutečných hran; každá jejich výška stoupání je 0,15 m. N02 L mezipodesta a dveře `2DFE` jsou lokálně 1,80 m. Podschodová s144 zůstává na P01 wing. Podhledy, hlavní horní limity stěn, sloupů i otvorů používají společný resolver a další skutečně modelovanou desku místo `floor + 3.0`.

### Přesné výškové zóny

Původní nekonečné Y pásy snižovaly také hlavní fasády. Nové přiřazení je omezené skutečnými křídly v X a stykem doloženým místnostmi nebo portálem v každém půdorysu. Rozhraní leží v dělící konstrukci, nikoli přes celý běžný hlavní pokoj:

| Patro | West Y / zdrojové room handles | East Y / zdrojové handles |
| --- | --- | --- |
| P01 | 738,4885 / `1FEE, 2081` | 723,154 / `1F1E, 1EE0` |
| N01 | 738,818 / `1F0A, 2131` | 723,116170 / `20D0, 283A` |
| N02 | 738,929 / `1FF2, 20BE` | 723,001 / `2001, 2037` |
| N03 | 738,929 / `1F1B, 2016` | 723,001 / `1EF6, 1EC6` |

N04 přebírá fyzické styky těl N03. West tělo je omezené X ≤ 228,95, east X ≥ 270,50; tyto bodyboxy nejsou jediným pravidlem. Připojují se skutečné wing room polygony, zdrojové podesty a výslovně doložené portály. N01 vestibul mimo prosté X omezení je doložen hranami `1854–185B`; N02 east práh `14F3/14F6`, N03 west `1100/1101`, N03 east `B6A/B6D`. Samostatně je připojen skutečný mělký bay. Běžné hlavní pokoje jsou z wing masky vyloučené. Malé tolerance kolem existujících stěn pouze přiřazují již existující konstrukce; nevytvářejí novou geometrii.

`occupiedGeometry` pro hledání sousedního stropu obsahuje skutečné místnosti a spojení, nikoli celý maskovací pás ve venkovním vzduchu. To brání falešnému zkrácení hlavního okna kvůli prázdné části wing masky. Otvor ve skutečné sdílené konstrukci se naopak konzervativně omezí nižším z obou sousedních stropů. Dvě východní venkovní šachty mají přímo klíče P01/N01 eastWing; jejich výšku nelze odvozovat z bodu mimo tělo budovy.

### Fasády, ostění a střechy

- Pouze skutečné podélné venkovní okenní řady křídel mají IPR profil: N02 sill 0,30 / head 3,05 m nad wing podlahou; N03 0,10 / 3,15 m. Zdrojový výběr má přesně **47 a 48 sestav**. Otvor v `wall_bands` a descriptor sdílejí stejné výsledné hodnoty. `lowerInfillHeight = 0.75` je výslovná materiálová interpretace světlého dolního pole, ne určení panelu proti matnému sklu. Hlavní/interiérová okna tuto změnu profilu nedostala.
- N02 `2753/276A` a N03 `22CE/22E5` používají skutečné ostění X 280,171512–280,271512, hloubku přibližně 0,10 m a normálový offset ±0,05 m. Zdrojové páry jsou `1864/1865`, `1868/1869`, `E57/E58`, `E5B/E5C`. Zadní čáry bay `2745/2746/2747` a `22C0/22C1/22C2` nejsou hloubkou ostění. Jeho funkce zůstává neurčená.
- U těchto čtyř dveří je řez omezen na měřenou hloubku s malou tolerancí. Stejně jsou pouze u čtyř konkrétních sousedních návratových oken `274A/274E`, `22C5/22C9` použity jejich měřené normálové meze; starý univerzální přesah ±0,72 m jinak prořízl i zadní bay zábranu. Ostatní otvory tento úzký mechanismus nemění.
- N01 west `404E/4064/406E` je podle IPR uzavřená zasklená fasádní řada. Zachovává kompatibilní klasifikační token `facade-opening-unconfirmed-access`, přidává `fixedGlazing: true` a konkrétní důkaz. N01 east vstup zůstává přístupný.
- Main střecha dostává pouze vnitřní obvodový prstenec: odhad tloušťky 0,15 m a celkové výšky 0,40 m, rozdělený na tělo 0,36 m a shodný horní lem 0,04 m. Vychází z vnějšího obrysu skutečné main střechy; nevyplňuje střechu ani nástavbu. Wing atika, HVAC a další patro nebyly přidány.

### Kontrakt pro builder a export

Zůstávají `floor.elevation`, `wingElevation`, `floorWingOffset` (nyní skutečně per-floor). Přibyly `ceilingElevation`, `wingCeilingElevation`, přesné `wingRegions`, `levelKind` (`roof` pouze pro N04) a `roofHeadFootprint`. N04 wing ceiling je `null`; main strop N04 platí pro zdrojovou nástavbu. `roofTransitions` má segmenty `a/b` v CAD XY metrech, `lowerLevelKey`, `upperLevelKey`, `thickness`; vzniká jen ze společných hran finálních dvou střešních hladin. Na zmrazeném XY zkušebně vzniklo devět segmentů, včetně zdrojových drobných lomů, ne dvě odhadnuté přímky. Nativní builder má použít tato data místo staré ruční schodové stěny střechy.

Top-level `heightModel` nese kopii explicitní level mapy, zdroje, data a označení hypotézy. Každý otvor nese `levelKey`, `ceilingElevation`, `ceilingLevelKeys`, `requestedTop`, `ceilingClipped` a `heightBasis`. Audit po příští regeneraci vypíše `ceilingClippedOpenings` a konkrétní opravy ostění. Existující route keys, jejich XY, počty a source handles se zachovávají.

Vnější kotvy: main lower −2,10; N02 east lower −0,55 (stále nevyřešené napojení k dnešní ulici); NW top −1,85 / turn −3,45; NE top −2,45. Západní výšky nadále používají 0,20 m na skutečnou hranu od P01 wing a nejsou zaměřeným terénem. Společná volná opěrná koruna je odvozena z vyšší západní kotvy + 0,20, tedy −1,65 m, její části pod rameny dále omezují skutečné podhledy. Východní šachty mají rise 2,70 m: 14 hran znamená 0,192857 m, 15 hran 0,18 m. Výjimka `maxRiserHeight: 0.24` byla odstraněna. Dvě původní `exteriorVoids`, čtyři další `terrainCutouts` a jejich spodní podlahy zůstávají oddělené. Všechny venkovní terénní návaznosti zůstávají `terrainValidationPending`.

### Skutečné lehké ověření a čekající kroky

Poslední příkaz `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py` vypsal **Ran 75 tests in 0.813s; OK (skipped=2)**, log `tests-height-c-light.log`. Dvě přeskočené celé lokální třídy mají 25 a 7 metod; těchto **32 kontrol skutečné receptury C čeká na regeneraci**, protože uložená receptura stále nemá nový heightModel ID. Nejde o PASS z definice ani o výsledek celého modelu.

Cílené čtecí DXF sondy bez párování všech stěn a bez kompletní přípravy dokládají:

- 14 bodových witnessů hlavních fasád, křídel, vestibulu, bay a N03 portálů má správné přiřazení. Všechny čtyři N03 běžné pokoje 201/202/217/218 mají nulový průnik svého interiéru s wing maskou.
- Zdrojových 47/48 vysokých oken je správně vybraných; čtyři skutečná ostění mají hloubku 0,09999983 m a offset přibližně ±0,04999961 m. Jejich nové řezy nezasahují zadní zábranu bay.
- Všech 22 zmrazených skutečných vnitřních segmentů při novém resolveru dává 0,15 m na hranu a původní XY se nemutuje.
- Přepočet spanů všech 760 zmrazených otvorů s aktuálními maskami/resolverem má nula neplatných spanů a nula dveří nižších než 1,8 m. To není přepočtený wall mesh. Pět otvorů se bezpečně omezilo stropem: N02 návraty `274A/274E` na 3,75–4,10; N03 `22C5/22C9` na 6,60–7,80; N04 `FFA` na 9,90–11,30 m. Návraty ponechávají původní požadovaný generický profil; nižší společný strop je modelářská konzervativní mez, jejíž výsledný vzhled musí přijmout nativní kontrola.
- `tests-height-c-source-red.log` uchovává tři skutečné očekávané RED na staré receptuře: snížené main okno `2403`, starý pás uvnitř N03 pokoje 201 a chybná hloubka `2753`. Nové lokální source výpočty jsou správné; jejich skutečný recipe GREEN zatím není tvrzen.
- Syntetické regrese chrání konzistentní stropy, sdílené konstrukce versus venkovní vzduch, přesný výběr profilů, zadní bay zábranu, portály, volný vnitřek střechy a shodný obrys lemu. Porovnání whitespace proti zmrazeným dvěma zdrojům nevydalo diagnostiku; návratový kód `git diff --no-index` je 1 kvůli rozdílům, nikoli tvrzený exit 0.

Samostatný výsledek `.cache/cad-buildings-20261024/b01-preparation/height-c-source-probe.json` zaznamenává výše uvedené čtecí kontroly. Pro root perspektivní QA obsahuje také pokoj N02 106 / `1F8E`, centroid CAD (249,737; 735,462), okno `2403/2406` u (249,739461; 738,893721), směr téměř +CAD Y. Eye local 4,45 m je 1,60 m nad novou podlahou. Volný bod chodby 191a / `2013` je (250; 731), vzdálenost k room hranici 1,096 m.

| Soubor | SHA-256 tohoto checkpointu |
| --- | --- |
| prepare_b01.py | `663a3d86d25041159a260c105b64cea6d6d454e3bd56761bc136c7d881795d92` |
| test_prepare_b01.py | `918602059e3b1ef4ae4aa6b1a5efb71ae91e919e9852e4f77cd9488ffffab11d` |
| height-c-source-probe.json | `c3a5d818257f5c236881f8dc08870f3a569abd714be6ad663ef79c49433c7d11` |
| recipe.json, stále beze změny | `4ae5fee52efb02299ce3171a4a8fb3861608cc00e50c01e313c0d35eb4730316` |
| preparation-audit.json, stále beze změny | `16f91ff8d96a1f982a622ab9d1ec45658b14b994128dc94777b5c95da83fd5e5` |

Zbývá koordinovaná úplná příprava C po výslovném navrácení heavy, 32 lokálních recipe regresí a kontrola pěti overlay, následně root Blender, geometrická/fyzikální přejímka a perspektivní pohledy. Zvlášť ověřit sdílené okenní návraty, N03 U portály, celé obytné pokoje, roof přechody, s146 a zachovaná dna vnějších šachet. Stávající R7a/R8 výsledky nejsou důkazem C. Žádná nová svislá kóta CAD nebyla vymyšlena ani vydána za měření.

Všechny vlastní krátké procesy skončily; nebyl spuštěn Blender, GPU ani server, nic se nestagovalo nebo necommitovalo. Po tomto předání se claim uvolňuje. Root smí převzít pouze tento doložený přípravný WIP vlastním `--adopt-dirty`. Další regenerace není součástí tohoto kódového checkpointu bez navazující koordinace výpočtového zdroje.

## R9a: obsazené výstupky N01 a volný prostor mělkého bay, kód před přepočtem

Koordinátor výslovně předal svůj navazující WIP: prostorovou obousměrnou toleranci 1 mm v regresi s146 (zjištěný rozdíl nodingu nejvýše 0,472 mm) a lokální `minimum_bottom` masku podpěry `17EE/1C9C` přes skutečný N01 portál `2852`, jehož jamby jsou `1603/1602`. Nad přesným X intervalem otvoru začíná podpěra na 2,10 m, boky zůstávají od 1,80 m. Koordinátor uvedl R9a nativní PASS, 44/44 schodišťových průchodů a 143 kombinovaných Python testů; zde se tyto nativní výsledky neopakovaly.

Vlastník `cad-buildings-01a16b37-roof-bay` ověřil registr, získal vlastní claim s povoleným `--adopt-dirty` a uchoval přijaté přípravné soubory, recipe a audit v `b01-preparation/before-roof-bay/`. Root má samostatně zmrazené `b01-build/r9a-source-inputs/`. Žádný snapshot R9a, jeho rendery ani produkční model nebyl přepsán.

### Doložený mechanismus a zvolené řešení

**Střechy širšího přízemí:** N01 místnosti přesahují N02 obrys, ale dosavadní příprava vytvořila desku pouze z vlastního půdorysu horního patra. U okna `2DE6/2DE7` je v řezu Y 747,5 vnější N01 X 217,109919, zatímco N02 začíná až na 218,396952. Witness (217,55; 747,50) leží v N01 room 29 / `2131`, má podlahu −1,95 m, avšak žádný strop. Obdobně jsou prokázané druhý bok west, oba boky east místnosti 14 / `210E` a připojený vestibul `1854–185B`.

Zamítnuto plošné sjednocení podlažních envelope, protože by zakrylo venkovní šachty/dvory a schodiště. Také výškové `occupiedGeometry` není bezpečný stavební seed: obsahuje explicitně připojené masky šachet. Zvolena malá uzavírací funkce nad **výslovným seznamem zdrojových místností**: west `2131, 213A, 2143, 214C, 2155, 2160, 216D`; east `20F8, 210E`, plus měřený připojený vestibul. K nim se přidává jen existující přilehlé zdivo; výběrový okraj 0,40 m sám nevytváří žádnou novou plochu. Výsledek je oříznut N01 footprintem a odečítá N02 footprint, core otvory obou pater, oba shaft voids, konkrétní venkovní court/route masks a skutečné podesty na shodné úrovni. Podesta N02 za `28DD` proto zůstává jediným uzávěrem svého překryvu s N01 místností.

Nové desky patří do N01, role `slab`, materiál `roof`; spodní a horní líc **0,85 / 1,05 m** jsou odvozené z přijaté C mapy a tloušťky desky. Nejde o zaměřené výšky. P01 s146 se nezalévá; jeho samostatný šikmý uzávěr pod hlavním venkovním schodištěm zůstává výslovně uvedeným omezením příštího auditu.

**Bay N02/N03:** přímé čtení DXF potvrdilo, že párování slabých čar přes volný prostor vytvořilo zdivo mezi front `2750` / `22CB` a rear `2746/2747` / `22C1/22C2`. Skutečná vnitřní oblast má X **280,271511525–280,833814293**, Y **721,247129142–722,782047465**. Zvolené řešení odečítá jen tuto oblast ze stavebního wall výsledku **až po** párování, inference, opravách rohů a přidání otvorových bridges. Nemění obecný algoritmus jiných stěn a nelze ji znovu vyplnit pozdější otvorovou spojkou. Front jamb 0,10 m, boční uzávěry, zadní konstrukce a podlaha zůstávají; funkce bay není pojmenována bez důkazu. Modelová síť zachovává dosavadní přesnost 1 mm, tedy void bounds 280,272–280,834 / 721,247–722,782.

### Kontrakt a cílený refaktoring

- `floor.exposedWingRoofs` a `solid.roofClosure` obsahují source room/attached handles, oba floor keys, odhadované výšky a důvod. U auditu jsou plocha, počet dílů a průniky s vyloučenými prostory/podestami.
- `floor.shallowBayVoids` obsahuje odvozený polygon, přesný front/rear X a zdrojové handles. Je to prostor zbavený falešného zdiva, nikoli otvor do podlahy.
- Pouze čtyři dveře dostanou `approachBoundaryCad`, `approachBasis`, `accessClassification = shallow-bay`. Dvouprvkové pole je řazené `[−normal, +normal]`. `2753/22CE` mají `[null, [280.833814, 722.367504]]`; `276A/22E5` mají `[[280.833814, 721.661691], null]`. Druhá strana není uměle omezena. Root řeší délku fyzikálního přístupu podle skutečné kapsle; zde se neposunuje otvor ani zadní stěna.
- `geometryRevision = C-exposed-roofs-shallow-bays-1` odděluje příští přepočtenou recepturu od starého R9a. Výšková hypotéza C se nemění.
- Opakované geometrické operace jsou v malých samostatných funkcích. Příprava uchová drawing geometrie všech pěti pater, doplní uzávěr po získání N02 footprintu a až poté vykreslí každé overlay jednou. Přibyl oranžový obrys skutečných nových uzávěrů. Není zde nová cache, server ani dlouhožijící proces.

AST porovnání proti převzatému checkpointu prokázalo změny pouze tří dosavadních funkcí: `prepare_floor`, `draw_overlay`, `prepare`; ostatní doplněné funkce jsou nové. Root `minimum_bottom` / podschodové funkce zůstaly stejné. V testech nebyla změněna žádná existující metoda, tedy ani s146 prostorová tolerance nebo portálová regrese.

### Skutečné ověření a hranice

Poslední cílený běh `uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py` vypsal **Ran 115 tests in 5.109s; OK (skipped=1)**. Log `tests-roof-bay-light.log`. Přeskočena je jedna nová celá třída se **čtyřmi skutečnými recipe regresními metodami**, protože receptura zatím nemá novou geometryRevision. Zbývající dosavadní C/R9a kontroly proběhly. Nejde o opakování celého root souboru 143 testů.

`tests-roof-bay-source-red.log` obsahuje skutečné tři očekávané chyby proti zmrazené R9a receptuře: chybějící uzávěr, existující bay mass a chybějící čtyři boundary annotations. Samostatná cílená sonda pak četla N01/N02/N03 zdroje a aplikovala nové malé funkce na rekonstruované podporové půdorysy z R9a, **bez** `prepare_floor`, párování všech pater nebo regenerace:

- Všech pět roof witnessů (obě strany obou křídel a vestibul) je kryto. Kandidát má west 50,642281 m² a east 54,723870 m², celkem **105,366151 m²**, čtyři polygonová tělesa. Je to source kandidát nad rekonstruovanou podporou R9a, nikoli tvrzení o ploše ještě nevytvořené plné nové receptury.
- Průnik se všemi explicitními stair/shaft/court maskami i existujícími podestami je **0 m²**.
- V každém vyšším bay byl starý půdorysný průnik falešného zdiva **0,792982 m²**; po lokálním odečtu je vnitřní wall area **0 m²**. Kontrolní body zadní stěny, předního ostění a podlahy zůstaly zachované.
- Čtyři skutečné dveře mají výše uvedené správné normálové pořadí a rear boundary. Ostatní dveře se neanotují.

Výstup této sondy je `roof-bay-source-candidate.json`, nikoli `recipe.json`. Nové syntetické regrese navíc chrání prázdný schodišťový otvor, samostatnou podestu, výběr jen skutečných stěn bez přidaného přístřešku, clipping vlastním spodním půdorysem, odmítnutí neúplného zdroje a zachování předního/zadního/bočních uzávěrů bay.

| Soubor | SHA-256 |
| --- | --- |
| prepare_b01.py | `1715a6b5507e40f5849e034ad3495fa7ed258af1b85e700996b43765a8c97b62` |
| test_prepare_b01.py | `8fc1b85658de32abd038366b703316ad7c808619e82fc5644914bcc0859ec303` |
| roof-bay-source-candidate.json | `10a9443aba94d0c262da1c5c50787268a8e4f3513ed6d0598a936047f5e0c10c` |
| recipe.json, nezměněný R9a | `b361e86605898cc2762b0abd6936d0706801e96b98d0f7b9b8abba361bc301e5` |
| preparation-audit.json, nezměněný R9a | `d5fb13768413ceb04d5438ec801896d814c93a27a749d8390f8495267cf3a799` |

**Úplná příprava, nový audit/overlay, Blender ani Rapier nebyly spuštěny.** Koordinátor má provést jediný následný fullprep, čtyři čekající recipe kontroly a nativní/fyzikální ověření; zejména kontrolu spojitého roof obvodu a předního/zadního ostění bay. Žádný commit nebo stage. Všechny vlastní krátké procesy skončily; po tomto předání se claim uvolňuje. Root smí převzít zde doložený WIP vlastním `--adopt-dirty`.

## Předání po review R10, 24. 10. 08:55 UTC
Root přijal předchozí geometrii, provedl plnou přípravu R10 a všechny modelové kontroly. Nyní předává vlastní aktuální prepare_b01.py/test_prepare_b01.py a přípravnou evidenci zpět původnímu agentovi cad_b1_geometry_research pouze pro opravu vazby receptury na SHA generátoru a přísné přejímky. Původní CAD ani geometrie se nemění. Agent smí --adopt-dirty této doložené práce. Koordinátor vlastní procesy přípravy ukončil. Heavy je do skutečného vrácení druhým chatem nepřístupné: jen malé syntetické testy, žádný fullprep, Blender nebo modelový bulk.

## Review R10: přesná provenience generátoru a přísná přejímka receptury

Vlastník `cad-buildings-01a16b37-provenance` načetl pravidla/policy a předání, ověřil Git/registr a získal vlastní claim s povoleným `--adopt-dirty`. Převzaté dva Python soubory a manifest výchozích hashů jsou uchovány v `b01-preparation/before-provenance/`. Scope se nerozšířil, žádný nový BMAD, stage nebo commit.

**Příčina:** dosavadní aktuální recipe testy kontrolovaly pouze ID výškové hypotézy, případně ručně pojmenovanou geometryRevision. Ignorovaná cache jiného generátoru mohla nést stejná označení a projít. Vynechaný roof krok se proto mohl skrýt za starším platným výsledkem. Zvolena přesná identita skutečných bajtů `prepare_b01.py`; ručně udržovaná verze nebo Git HEAD by nepokryly necommitnutou změnu. Výpočet přidává dva krátké čtecí hashe během generování, bez změn geometrie a bez nového životního cyklu cache.

### Změny

- `generator_sha256()` počítá SHA-256 přímo ze skutečného souboru generátoru, včetně necommitnutých změn. `prepare()` zachytí identitu na začátku a před zápisem recipe/auditu ji znovu zkontroluje. Pokud se mezitím změnila, vyhodí chybu a tyto soubory nezapíše.
- `record_generator_provenance()` uloží **top-level `generatorSha256` do nové receptury i nového auditu**. Dosavadní audit `recipeSha256` poté hashováním zahrne i toto nové pole. Nepřidává se žádné razítko do staré cache.
- Jediný čtecí helper `current_height_recipe()` pro všechny tři aktuální recipe třídy vyžaduje shodu `recipe.generatorSha256 == prepare.generator_sha256()` a `recipe.heightModel.id == prepare.HEIGHT_MODEL_ID`. Chybějící SHA v historickém souboru se považuje za neaktuální recepturu.
- Výchozí režim přeskočí pouze nedostupnou/neaktuální soukromou recepturu, takže syntetické testy běží bez CAD. **`B01_RECIPE_ACCEPTANCE=1` mění absent/stale SHA nebo výškový model na `AssertionError`, nikoli skip.** Chybějící očekávaná roof/bay geometryRevision při již shodném SHA je chyba v obou režimech; nemůže skrýt nezapojené střešní solids.

Přesný následný přejímací příkaz z kořene worktree, až koordinátor skutečně přepočítá novou recepturu:

```powershell
$env:B01_RECIPE_ACCEPTANCE = '1'
uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest discover -s scripts/cad-buildings -p test_prepare_b01.py
```

Výsledek je nutné přijmout jen s exit 0; chybějící či zastaralá recipe nyní způsobí neúspěch. Pro běžný volitelný režim proměnnou odebrat nebo nastavit na `0`. Tento přejímací příkaz zde **nebyl spuštěn** nad R10 cache a nesmí se obcházet dodatečným doplněním jejího SHA.

### Skutečné cílené ověření

Spuštěny byly pouze malé CPU fixtures bez CAD, z `scripts/cad-buildings`:

```text
uv run --no-project --with ezdxf==1.4.5 --with shapely python -B -m unittest test_prepare_b01.RecipeProvenanceTests test_prepare_b01.RoofAndShallowBayTests
```

**15/15 PASS, bez skip, 0,031 s**, log `b01-preparation/tests-generator-provenance.log`. Osm nových kontrol ověřuje skutečný hash souboru, shodné nové provenance obou výstupů, odmítnutí změny generátoru během běhu bez mutace výstupů, přijetí odpovídající in-memory fixture, negativní missing/stale/legacy-cache scénáře a nezávislou kontrolu height modelu. Zbývajících sedm jsou již existující malé syntetické roof/bay regrese. Žádný modelový probe ani širší testovací sada neběžely. Po následné zprávě koordinátora o krátkém CPU capture nebyly spuštěny další testy.

AST porovnání potvrzuje, že z dosavadních funkcí generátoru se změnila pouze `prepare` přidáním hashových kroků. Všechny geometrické funkce zůstaly stejné. R10 cache byla ověřena byteově beze změny:

| Soubor | SHA-256 |
| --- | --- |
| prepare_b01.py | `0a169fbb142d88c9f0db4f776fc5e5f07e018dc1f9f29427a68a0fc4835cd216` |
| test_prepare_b01.py | `7ee8085297a95fe50d9af4556992905c479d0a77e9dafce81ce4971696554968` |
| recipe.json, původní R10 | `d1202adf453178e8abeeab3096315efd74d99857e68b1182d33cc64c0248ac42` |
| preparation-audit.json, původní R10 | `3dda3c2bccdc1f9e08822cb638fcc9e10c089d609a915921c64973bd4d6bc815` |

Úplnou přípravu, striktní přejímku nové receptury a porovnání nezměněné geometrie provede root po skutečném vrácení heavy. Původní provenance R10 zůstává historickou evidencí. Všechny vlastní krátké procesy skončily; po tomto předání se claim uvolňuje a root smí doložený WIP převzít vlastním `--adopt-dirty`.

## Root přijetí09:26UTC

Po převzetí uvolněného scope root opravil pouze neaktuální auditní větu o s146: skutečný uzávěr zajišťuje vstupní schodiště/podesta a nativní přejímka. Po vrácení heavy provedl úplný převod bez změny plánů: generator942b9463…,recipe677b8f7d…. Celá receptura je kromě generatorSha256 přesně rovna původní R10 d1202adf…. Strict B01_RECIPE_ACCEPTANCE=1:162 společných Python testů bez skip PASS. Předtím skutečný strict běh starou cache odmítl; log zachovaný. Přijatý model a jeho původní provenance se nepřepisovaly. Source checkpoint a důkazy jsou v modelovém handoffu. Extrakční task převzat jako done; celé KEY-59 pokračuje.
