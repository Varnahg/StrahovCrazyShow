# Izolovaná oprava zbývajících automobilových vad – diagnóza 11. 10. 2026

**Near oprava je po dokončení zmrazeného M3 integrovaná do aktuálního workspace.** Změněny jsou pouze uvedené near indexy, editovatelný master, reprodukovatelné helpery/generátory a současná provenience. Původní zdroje, medium/far, jejich kola a fyzika zůstávají bitově stejné. Před integrací vznikly SHA-ověřené zálohy v `.cache/vehicle-pilot-repair-20261011/integration-before`. Úplná izolovaná reprodukce z původního source masteru, reopen a export proběhly v Blenderu 5.2.2 background s nejvýše dvěma CPU vlákny, bez renderu. Žádná nová GPU/FPS kontrola ani plná sada/build/integrace zde neproběhly.

## Zdroj a existující důkazy

Původní [Innerscene Blue five-door compact hatchback](https://www.innerscene.com/tools/library/3d-parts/blue-five-door-compact-hatchback-5b95b2a0) uvádí vlastní neznačkový model pod CC0; stránka byla znovu ověřena 11. 10. 2026 a uvádí přidání 7. 10. 2026. Jde o generickou herní předlohu, nikoli konkrétní zaměřené strahovské auto. Skutečné rozměry derivátu, nápravy a pivots určují dosavadní sdílená fyzika a manifest; nominální rozměry webového modelu nejsou měření výsledné hry.

| Soubor | SHA-256 ověřený v tomto čtení |
|---|---|
| `assets/blender/vehicles/innerscene-hatchback/original-source.glb` | `107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7` |
| `public/models/vehicles/campus-hatchback-near.glb` | `2805ecfd4dd14ad3ea0511efce8c78d9dd8fc07c9d55dc28bf02e61831afa665` |
| `public/models/vehicles/campus-hatchback-far.glb` | `98254bb33689919998a83fd28aae77a6aa31da5826afda368f9f4c4e7f2ead58` |
| `assets/blender/vehicles/innerscene-hatchback/lod-baseline-j/far.glb` | `b8426d57160e691484e3f87f0ce96b5b515fdc3305732cdd07d3c5c0bf16223a` |

Editovatelný near master je `assets/blender/vehicles/innerscene-hatchback/campus-hatchback-master.blend`; původní zdrojový `.blend` zůstává vedle něj. Dřívější skutečné snímky [near zblízka](vehicles/root-review/repaired-near-closeup.png) a [far po opravě kol K](vehicles/root-review/wheel-lod-k/far-front.png) byly nyní prohlédnuty. Near snímek přímo neukazuje skrytý vnitřní fold. Far snímek dokládá podstatně hrubší podběhy, ale sám nedává identitu každého trojúhelníku.

Historické diagnózy jsou v `.cache/vehicle-normal-study/{README.md,followup.json,coverage.json}`. Nový reprodukovatelný čtecí skript a úplné souřadnice jsou v `.cache/vehicle-pilot-repair-20261011/{inspect.mjs,diagnosis.json,inspect.log}`. Skript aplikuje původní node TRS včetně rodičů, potom stejnou zdokumentovanou po částech lineární normalizaci. Identitu zdrojového trojúhelníku určuje trojice jeho transformovaných vrcholů v toleranci 10 µm, nikoli podobnost názvu. `Body:black` a `Body:paint` far K stále mají přesně shodná POSITION/NORMAL/UV/index pole s archivovaným J.

## Near: přesný fold a oprava bez pohybu vrcholů

Popis „vnitřní trim“ v souhrnné verifikaci je nepřesný: jde o vnitřní boční plochu hlavního shellu, za lakovanou vnější plochou.

- Runtime: node **Body:black**, mesh **0**, primitive **0**, material **black.001**, trojúhelník **18117** (indexování od nuly), indexy **25956, 27922, 27927**.
- Původní GLB: node **305 / Watertight 14-station body shell**, mesh **305 / Watertight 14-station body shell_closed_tessellation**, primitive **1**, material **black.001**, triangle **537**, indexy **27, 1912, 1917**.
- Centroid `(0,8053064; 0,5873877; −0,4212954) m`, plocha `0,0004844576 m²`, nejdelší hrana `1,6947449 m`. Zdrojový winding souhlasil s normálami; normalizovaná přímá aproximace přes dva délkové knoty se překlopila.
- Geometricky sousední triangles jsou **18116**, **17595**, **18120**. Soused 17595 má jinou UV větev a netvoří vhodný koplanární pár.

**Přesný omezený kandidát:** změnit diagonálu pouze koplanárního páru **18116 + 18117** v rovině `x = 0,8053064346313477 m`.

| Triangle | Dosavadní indexy | Kandidátní indexy |
|---|---|---|
| 18116 | `25955, 27830, 27921` | `27830, 27921, 27927` |
| 18117 | `25956, 27922, 27927` | `27830, 27927, 25955` |

Obě kandidátní geometrické normály mají vůči průměru původních vertex normál dot přibližně **+0,999999994**; plochy jsou **0,002461606** a **0,157591908 m²**. UV obou duplikovaných vrcholů původní společné hrany jsou přesně shodné. Lze zachovat celá POSITION/NORMAL/TEXCOORD pole byte-for-byte, žádný vrchol neposunout, zachovat vnější obvod páru a počet trojúhelníků a změnit jen šest indexů. Lokálně se odstraní překryv převrácené plošky; interpolace UV uvnitř přetriangulované dvojice se přirozeně změní.

Oprava je nyní implementovaná **v aktuálním near packu**, zatím bez nové vizuální přejímky. Editovatelný master i regenerátor používají geometrické/UV kotvy; oprava tedy není jen ruční změna exportovaného GLB. Nepoužívat plošný flip normál: ostatní upozornění na ostrých hladce stínovaných komponentech nejsou stejná chyba.

Zamítnutý globální knot prototyp z historické cache přidával 10 174 trojúhelníků a měnil některé interior plochy až o 0,217 m. Nový výpočet ukázal, že i dělení **pouze folded triangle 18117** by vložený bod proti dosavadní hraně posunulo až o **0,119899 m**, navíc vyžaduje conforming změnu sousedů. Proto má indexová změna diagonály přednost před tímto rozsáhlejším přetvarováním.

## Far: rozdělení skutečných zdrojových komponent

Opakovaný stejný coarse ray grid má **2 870 referenčních paprsků, 28 prázdných průniků a 8 propadlých průniků >5 cm**, shodně s historickým auditem. Zahrnuje jen Body:black/paint a vynechává kola, skla a interiér. Nově je u průniku uveden konkrétní zdrojový objekt:

- **22 z 28 prázdných paprsků** mají oba původní zásahy v `Brake caliper{.001–.003}`. Nejsou důkazem 22 děr lakované karoserie. Zjednodušený třmen v podběhu je nutno posuzovat v úplném autě s kolem a z příslušné LOD vzdálenosti.
- **5 prázdných paprsků** zasahovalo `Wheelhouse inner liner{.001–.003}`.
- **1 prázdný paprsek** zasahoval `Rolled fender lip` a `.001`.
- **7 z 8 propadlých průniků** odpovídá `Rolled fender lip{.001–.003}` a **1** hlavnímu lakovanému shellu. Některá historická „propadnutí“ skoro 1,94 m znamenají, že paprsek prošel chybějící stranou a zastavil se až na protější; nejsou velikostí posunu jednoho vrcholu.

Konkrétní reprodukční místa (souřadnice v metrech, trojúhelníky od nuly):

| Ray Y/Z | Near část a triangles | Původní source komponenta/triangles | Výsledek far |
|---|---|---|---|
| `0,5 / −1,375` | Body:black `21673 / 20896` | Wheelhouse inner liner `.003 / .002`, `98 / 101` | Obě strany chybí |
| `0,5 / 0,725` | Body:black `20113 / 19336` | Wheelhouse inner liner `.001 / základ`, `98 / 101` | Obě strany chybí |
| `0,5 / 1,375` | Body:black `20673 / 19896` | Wheelhouse inner liner `.001 / základ`, `658 / 661` | Obě strany chybí |
| `0,55 / 0,75` | Body:black `20145 / 19368` | Wheelhouse inner liner `.001 / základ`, `130 / 133` | Obě strany chybí |
| `0,675 / 1,225` | Body:paint `7731 / 6953` | Rolled fender lip `.001 / základ`, `499 / 501` | Obě strany chybí |
| `0,7 / 0,95` | Body:black `20321 / 19544` | Wheelhouse inner liner `.001 / základ`, `306 / 309` | Obě strany chybí |
| `0,45 / −1,4` | Body:paint `8843 / 8065` | Rolled fender lip `.003 / .002`, `51 / 53` | Jen pravá strana; far triangles `701 / 702` |
| `0,925 / 1,6` | Body:paint `15638 / 16063` | Watertight shell paint primitive0, `1298 / 1723` | Jen pravá strana; far triangle `1248` |

Far triangle, který na daném místě chybí, samozřejmě nemá vlastní ID; tabulka proto identifikuje near/source plochu, kterou má derivát reprezentovat, a existující far protilehlý zásah. Úplné případy a indexy jsou v nové diagnostice.

Omezená far implementace má cílit na **čtyři Rolled fender lip, čtyři Wheelhouse inner liner a doložený shell patch**. Nejprve je v odvozené editovatelné kopii oddělit podle source lineage/geometrie a prověřit, zda decimace opět pracovala s rozpojenými UV/normal ostrovy. Případný lokální weld smí spojit pouze shodné pozice v rámci téže původní komponenty, s původními UV a normálami po smyčkách. Poté zjednodušovat komponenty zvlášť se zachováním podběhové siluety a hran; nevyplňovat libovolnou plochou otvor pro celé kolo. Současné K wheel části se nepřegenerují. Oprava shellu nesmí překrýt funkční otvor ani přemostit dvě nesouvisející části jen kvůli splnění paprsku.

## Invarianty a předání do implementace

1. Zmrazený M3 a původní source GLB/.blend zůstanou neměnné. Nový body baseline musí být explicitní: dnešní `build-car-wheel-pack.mjs` záměrně kopíruje J body a bez změny reprodukovatelné pipeline by pozdější export opravu přepsal.
2. Near kandidát mění pouze uvedenou dvojici triangle indexů a odpovídající editovatelnou topologii. Počet částí **26**, počty tri, všechna původní vertex pole, PBR materiály, embedded images, uzly, jejich transformace, čtyři wheel pivots a light centres zůstávají stejné. Není důvod měnit kolize, nápravy, rozvor, radius, kořenový offset nebo grounding.
3. Far nová geometrie zůstane ve stejných material batches; ověřit exact preservation nedotčených komponent a všech K wheel atributů. Žádné nové průhledné vrstvy, materiálové průchody či draw calls. Počet trojúhelníků uvést skutečný; limit neskrývat za nové díry.
4. Regrese musí ověřit finální **export**, nikoli pouze předexportní BMesh: obvod lokální opravy, konečné atributy, UV seam zachování, orientaci, neexistenci nových degenerátů a nepřesáhnutí dosavadního sdíleného fyzického envelope. U far použít komponentně rozlišený ray grid a siluetu s kompletními koly.
5. Následuje koordinovaná skutečná vizuální kontrola near interiéru a podběhů, medium→far v běžné herní vzdálenosti, samostatných kol při zatočení a plné hry při jízdě. Teprve finální stabilní source checkpoint patří do build/test/integration a příslušného měření. Zde uvedené výpočty nejsou GPU akceptace.

## Připravený integrovatelný near kandidát

Původní integrační patch je `.cache/vehicle-pilot-repair-20261011/candidate/implementation.patch`; po `git apply --check` **PASS** byl aplikovaný až po dokončení M3. Následoval cílený refaktoring helperů bez změny výstupních assetů. Implementace obsahuje:

- `scripts/car-inner-shell-repair.py`: společná importovatelná oprava dvou normalizovaných source faces podle poloh a UV, nikoli slepé použití Blender polygon indexů. Žádné samostatné file IO.
- `scripts/repair-car-near.mjs` a `.d.mts`: přesný binární zápis šesti UINT16 indexů s kontrolou nezávislého vstupního SHA, obvodu, rovinnosti a orientace. Nezmění JSON ani žádné jiné GLB byte offsety.
- `scripts/create-realistic-car.py`: po existujícím exportu a repacku barvy aplikuje společný helper na master, uloží jej a provede index-only krok do near. Původní source, všechny materiálové receptury a normalizace zůstávají stejné.
- Aktualizované současné near/master SHA guardy v `scripts/create-car-lods.py`, `scripts/build-car-wheel-pack.mjs` a `tests/car-wheel-topology.test.ts`. Původní J body baseline ani všechny medium/far wheel výsledky se nepřepisují.
- `tests/car-inner-shell-repair.test.ts`: do běžné testovací sady doplní přesnou kontrolu byte rozdílů, směrovaného obvodu, všech atributů a odmítnutí jiného source checkpointu. Referenční předchozí GLB lze rekonstruovat pouze šesti doloženými indexy a musí vyjít nezávislý historický SHA; nevzniká dalších 5 MB duplicity assetu.

| Kandidát pro integraci | SHA-256 |
|---|---|
| `.cache/vehicle-pilot-repair-20261011/reproduction/public/models/vehicles/campus-hatchback-near.glb` | `7491240d9c5acc10375a394bc9b56a02f314da749dfb63e397506d90ae33c853` |
| `.cache/vehicle-pilot-repair-20261011/reproduction/assets/blender/vehicles/innerscene-hatchback/campus-hatchback-master.blend` | `2a1da0d7b9e99b8d0946615559b1bfc230382071570c39a62c1e98695c606375` |

Near stále má **138 750 trojúhelníků, 26 částí a 5 351 716 B**. Změna šesti indexů mění skutečně **10 bajtů**, pouze uvnitř offsetů `1403440..1403451`. Celý zbytek GLB včetně původních POSITION/NORMAL/UV polí, vložených obrázků, PBR parametrů, uzlů a transformací je byte-for-byte shodný. Maximální posun vrcholů je **0 m**.

Samostatná kopie existujícího masteru byla opravena v polygon pair **18116/18117**, loop **54348–54353**. Všech **93 099 nedotčených** corner indexů, UV a packed custom normal hodnot zůstalo přesně shodných; dekódované normály těchto cornerů mají rovněž odchylku **0**. Původní pokusy s globálním re-encodingem normál failnuly kontrolu ještě před uložením, proto finální helper obnovuje všechny nedotčené packed hodnoty a lokálně řeší pouze šest upravených cornerů. Blenderová změna zakódování ve dvou dotčených corner normálách je pod `7,81e−5` ve vektorové délce; následný glTF export má díky původní přesnosti formátu **všech 34 939 Body:black triangle corner POSITION/UV/NORMAL přesně shodných** s canonical index-only kandidátem. `mesh.validate()` neprovedl opravu.

Je ověřena také **celá izolovaná reprodukce z immutable `original-source.blend`**: generátor vytvořil starý near SHA `2805…a665`, následný opravný krok přesně nový SHA `7491…c853`. Opravený generovaný `.blend` byl znovu otevřen a export Body:black opět porovnán po všech indexovaných cornerech: **0 chybných pozic, UV i normál**, stejný počet trojúhelníků. Nejde tedy pouze o stav paměti Blenderu před uložením. Při původním source batching se objevují dosavadní hlášky „No mesh data to join“; konečné výstupy prošly uvedenými konkrétními kontrolami a hlášky nejsou vydávány za nový bezchybný exportní log.

Cílené běhy: **3/3 Node testy PASS**, **3/3 stejné připravené produkční TypeScript testy PASS**, cílený `tsc --noEmit` **PASS**. Jde o dvě provedení tří kontrol, nikoli šest různých testů. Audity: `candidate/{repair-audit.json,master-repair-audit.json,master-export-audit.json,reopen-audit.json}`, reprodukční audit `reproduction/docs/vehicles/near-inner-shell-index-audit.json` a `reproduction/generator.log`.

Po integraci bylo ověřeno **19/19 cílených car testů PASS** a cílený TypeScript **PASS**. Oba manifesty jsou znovu vygenerované a shodné; near SHA a rozměry odpovídají kandidátu. [Aktuální integrační audit](vehicles/inner-shell-repair-audit.json) obsahuje before/after hash, exact byte a master/export důkazy, soubory zachované beze změny i rozlišené far případy; [log testů](vehicles/inner-shell-repair-tests.log) není přepsaný historický K log. Zbývá root vizuální kontrola nového assetu a finální stabilní full suite/build/integration. Far body/arch geometrie je **beze změny**; její zdrojově rozlišená diagnóza výše zůstává dalším konkrétním úkolem.

## Přenositelnost integrovaného masteru

[Read-only reopen audit živého masteru](vehicles/inner-shell-master-portability.json) potvrdil vůči původní záloze stejné **27 named scene objects (26 meshů), 12 materiálů a 10 obrázků**. Názvy, transformace, přiřazení materiálů a vazby image nodes jsou přesně stejné. Všech 10 obrázků je zabalených v `.blend`; SHA všech packed dat je shodný s předchozím masterem. Externí knihovny: 0, chybějící povinné obrázky: 0, nezbytné cache závislosti: 0.

Generovaný kandidát měl u neutrálního laku nepovinný absolutní filepath do reprodukční cache, přestože jeho pixely byly packed. Ten byl samostatně vyčištěn na platný relativní `//paint-neutral-microvariation.png`; stejná normalizace je součástí generátoru. [Oddělený metadata audit](vehicles/inner-shell-master-portable-metadata.json) potvrzuje, že tento krok nezměnil žádné pozice, indexy smyček, UV, normály ani transformace žádného meshe, ani packed pixely. Jde o změnu cesty a serializace masteru, nikoli další geometrickou opravu.

**Aktuální přenositelný master SHA:** `903eaf0fcfaa7a4ef1ce15a89435e3e4186db8190907e0099b5be7f52e44e83f`. Předchozí geometricky opravený cache kandidát měl `2a1d…6375`; tato hodnota zůstává historickým bodem reprodukčního důkazu výše. Near GLB má stále přesně `7491…c853`. Po metadata změně proběhlo nové cílené ověření **19/19 PASS**; hash guardy a aktuální runtime audity odpovídají přenositelnému masteru.
