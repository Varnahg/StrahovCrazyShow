# B6: povrchy podle dodaných fotografií

## Revize kvality R2 — 25. 10. 2026

Předchozí uživatelský pohled nebyl přijat jako konečná kvalita. Nová revize používá dvě sdílené bitmapy vytvořené built-in `image_gen` s celou `room.png` pouze jako referencí. Nejde o přímé fotografické texely. Tool dodal **1254 × 1254 RGB**, nikoli preferovanou1024²; původní PNG jsou beze změny bajtů, bez cropu/resize/editace. Výstupy zůstávají v CODEX_HOME a identické kopie v ignorované `.cache/b6-photo-finishes-20261024/quality-r2/`. PNG ani user fotografie se necommitují.

- `wood-veneer.png`: SHA256 `fcb93758bf8bfe5709f1bdf30807755e3402f2c39a15056fe27d7e90ab7eefa0`, perioda1×1m, vlákna veV.
- `brown-lino.png`: SHA256 `80c631741555ca9271c9e34493592f703a4e075225c2e2cff46c0a39b045b129`, perioda1,6×1,6m.
- Přesné prompty, reference SHA a path obsahuje `texture-overrides.json` v této cache. Výstupy byly prohlédnuté. Bezešvé opakování není prohlášeno za dokonalé: MAE protilehlých hran woodX/Y8,52/7,68 a lino20,02/19,24 sRGB úrovní; sousední texely wood8,18/3,08 a lino9,75/9,83. Finální opakování ověří root render. Nejde o kalibrované albedo nebo normal/roughness mapy.

API: `B6Finishes(recipe, texture_overrides=None)`. Jen povolené klíče `b6_wood`/`b6_bedroom_floor`; každý obsahuje absolutní `path`, SHA256 původníchPNGbytes, kladné `periodMetres`, `sourceProvenance` s generator/referenceSha256/prompt. Odmítnut je jiný hash, relativní cesta, ne-RGB/8bitPNG, rozměr nad4096px/32MiB nebo chybějící původ. PNG se beze změny zabalí. Privátní path se do materiálu nezapisuje. `textureGeneration`, `textureOverrideSha256`, `texturePeriodMetres` na material/image doplňují původní manifest; `finishSpecification` popisuje fallback. Explicitní override perioda/zdroj určují použitou bitmapu. Chybný explicitní override se nezamění tiše za fallback.

`uv_for_face(..., uv_frame=None)` přijímá společné panelové `origin` a ortonormální Blender `axes=[acrossGrain,alongGrain,thickness]`. Čela i bevel používají stejný rámec. Nový `b6_laminate_ivory` pokrývá světlá dvířka a parapet; hloubku/duplicitu parapetu vlastní jiný task. Fallback wood má periodické frekvence7/17/29cyklů na tile pod Nyquist i128px rastru; furniturewood fallback má512².

Ověření R2: **21/21 finishes CPU PASS**, poslední1,247s; původní PNGbytes/hash, metrická override perioda, panelová UV při rotaci/translaci. Nativepacking/export a vizuální přejímka patří rootu. Neměnný uživatelský snapshot2591/source-v4 je beze změn.

Stav 24. 10. 2026: implementace klasifikace, metrických UV a autorských PNG; nativní zabalení, export a obrazové ověření provádí integrátor. Jde o rekonstrukci vzhledu podle fotografií, nikoli o kopii fotografických texelů nebo zaměřený katalog povrchů. Tento modul nemění geometrii, půdorys, podlažní výšky ani kolize.

## Podklady a rozhodnutí

Uživatel dodal šest celých fotografií. Původní soubory zůstávají pouze v ignorované `.cache/b6-photo-refinement-20261024/references/`, s jejich manifestem. Do modelu se nevkládají jejich pixely, osoby, stíny ani původní přílohy. SHA-256 a význam zdrojů jsou v `b6_finishes.SOURCES` a v odvozených material/image custom properties.

| Zdroj | Doložený vzhled | Co z něj nelze určit |
| --- | --- | --- |
| `corridor.png`, `79edd7ae…a3bec` | Střídavé modré a tmavé řady dlaždic, béžová spodní malba, světlá horní malba a strop, béžová dveřní křídla se světlým rámem | Přesný rozměr dlaždice/spáry, kalibrovanou barvu, povrch všech chodeb |
| `room.png`, `a6899509…0e9` | Hnědé skvrnité linoleum, světlé stěny a vnitřní rámy, nábytkové/textilní barvy | Inventář a rozložení každého pokoje |
| `bathroom.png`, `8bd41d96…126` | Bílý obklad se spárami, světlá modrá dolní zóna, keramika, chrom, lila závěsy | Přesnou výšku pásu, rozměry obkladu, vybavení neoznačených místností |
| `b6-front.png`, `748bacdc…366c`; `b6-rear.png`, `0a483787…841` | Teplá světlá dlouhá fasáda, bronzové/tmavě hnědé vnější rámy, šedozelená servisní hmota | Datum zachycení, přesnou barvu bez vlivu světla, detail skrytých ploch |
| `b2-typology.png` | Pouze typologické srovnání jiné budovy | Není použit jako zdroj povrchů B6 |
| `docs/references/media/user-b3-stair-20261011.png`, `6e4913f3…594` | Šedé terrazzo, světlé boky/podhled, tmavé tenké sloupky, hnědé madlo, řadová dlažba podesty | Snímek je výslovně BLOK 3; jde o přiznanou typologickou interpretaci pro B6, nikoli o B6 fotozaměření |

Při dohledání přímého zdroje pro schody byla ověřena [oficiální stránka bloku 6 SH](https://wiki.sh.cvut.cz/kolej/bloky/blok_6); nedodala nový ověřený detail povrchů schodiště. Detail ELSA se při přímém načtení neotevřel, není proto použit jako prohlédnutý obrazový důkaz. Starší `docs/reality-pack/b6/stair-photo-reconstruction.md` a `stair-photo-verification.json` slouží pouze k provenienci existujícího B3 snímku; jejich dřívější schématická geometrie se nepřebírá.

Porovnané varianty:

1. Další projekce IPR na celou fasádu zachovává textury skenu, ale přenáší i konkrétně pozorované zubaté tmavé fragmenty, stíny a rozmazání. Zvýšení rozlišení atlasu je neodstraní.
2. Jednotné barvy jsou jednoduché a stabilní, ale vynechávají doložené řady dlaždic, spáry a barevné pásy.
3. Zvolená autorská rekonstrukce vytváří deterministické opakovatelné PNG a PBR parametry. Zachová rozpoznatelné povrchy, přesné UV v metrech a jejich původ. Nevyplňuje obraz ze skenu a nepředstírá fotografickou kopii. IPR střechy a existující sklo zůstávají mimo tento modul.

Dlaždice chodby 0,15 × 0,15 m se spárou 2,5 mm; hygienické obklady/podlahy 0,20 × 0,20 m se spárou 3 mm; spodní béžová malba 1,35 m a modrá zóna 0,90 m jsou **výtvarné rozměrové odhady**. Totéž platí pro barvy, roughness, metalness a 3m periodu spár servisní fasády. Tato měřítka nepředstavují nové zaměření budovy. Lesk je základní PBR; modul nevytváří normal/height mapu. Zrcadlo je kovový PBR povrch bez dynamického zrcadlového renderu.

## Integrace

`B6Finishes(recipe)` přijme jen `buildingId == 'b06'`. `face_material(floor, role, points_blender, default_material)` vrací klíč materiálu. `uv_for_face(floor, role, points_blender, material_key)` vrací UV pro každý předaný vrchol nebo `None` pro materiál mimo vlastnictví helperu. `create_materials()` importuje `bpy` teprve při zavolání a vrací slovník Blender materiálů.

Souřadnice jsou místní Blender metry `(-CADY + 8, CADX - 35, výška)`. Používá se orientovaná normála polygonu, několik bodů uvnitř jeho hran a omezené hledání místnosti po normále. Pro odlišení vnější strany se čte i opačná strana a skutečné slab obrysy daného patra. Žádný nový obal budovy nebo collider se nevytváří. U rozporu stejné úrovně a různých `usage` se ponechá neutrální původní finish; pořadí room records není zdrojový důkaz.

Podporované usage: `bedroom`, `corridor`, `bathroom`, `wc`, `other`. WC používá hygienický finish; umyvadlo samo o sobě neurčuje bathroom. Výškový počátek pásu pochází z `room.levelKey` → `floor.levelElevations`, nikoli z označení patra. Nepřekrývá pás sousedního mezipatra. Vertikální atlas má rozsah 8 m, který pokryje i delší stěnu bez opakování barevného pásu; překročení rozsahu nebo ztracená vazba na místnost skončí chybou.

Původní uzavřené collision/render meshes se zachovají. Integrátor přidává materiálové sloty a index po jednotlivých plochách, ne otevřené barevné objekty místo konstrukce. Dlouhé základové/slab trojúhelníky mohou protínat více místností, proto se nebarví podle jediného centroidu. Příprava dodá přesné `room.finishTriangles`; builder vytvoří nekolizní `floor-finish` o 0,002 m nad skutečnou podlahou. Střešní materiál `roof`, sklo a těsnění vrací helper nezměněné. Názvy původních konstrukčních objektů zůstávají stabilní pro IPR roof target IDs.

UV podlah používá Blender X/Y, takže barevné řady chodby jsou napříč dlouhou CAD osou X. Ostatní plochy používají metrickou tečnou bázi; wall pásy mají V výslovně od vlastní podlahy. Spáry se rasterizují podle analytického pokrytí texelu, ne rozšířením na dva celé pixely. Linoleum používá periodickou plynulou skvrnitost; ne pravidelnou tkanou mřížku. Nezměněné materiály vracejí `None` a zachovávají dosavadní UV.

Nábytkový kontrakt se sousedním taskem: `b6_wood`, `b6_fabric_cream`, `b6_fabric_teal`, `b6_fabric_blue`, `b6_metal`, `b6_ceramic`, `b6_mirror`, `b6_curtain`, `b6_shower_curtain`, `b6_chrome`, `b6_radiator`. Explicitní známý b6 klíč není přebarven pokojovou klasifikací. Dřevo a textilie jsou autorské jednoduché vzory, nikoli produktové textury.

Texturované materiály: `UVMap.UV → TexImage.Vector`, `TexImage.Color → Principled.Base Color`; faktor BaseColor je 1. PNG je RGB se sRGB značkou, zabalený bez externí cesty. `imageSha256` označuje skutečné packed PNG bytes. Image i material nesou `provenance='B6-photo-informed-authored'`, `sourceIds`, `sourceHashes`, `sourceManifestSha256`, `finishSpecification`, `sourcePixelsEmbedded=false`, `dimensionsMeasured=false`. `sourceManifestSha256` je SHA-256 kanonického JSON objektu `SOURCES` (`sort_keys=True`, separátory `(',', ':')`), nikoli SHA uživatelova privátního přílohového manifestu. Výstupní GLB audit musí zachovat embedded PNG bytes, aktivní UVMap/TEXCOORD_0, sloty a ostatní PBR parametry.

Spatial index je per-floor XY mřížka; omezená LRU cache 32768 dotazů patří konkrétní instanci receptury. Material set se vytváří jednou na instanci. Modul nespouští procesy a nedrží zdrojové fotografie. Životnost materiálů/images při zavírání Blender dat spravuje nativní builder; metoda se nemá znovu používat po externím vymazání těchto datablocků. Výkon celé hry ani GPU dopad zde nejsou měřeny.

## Důkazy a meze

`py -3.14 -B scripts/cad-buildings/test_b6_finishes.py -v`: 18 čistých CPU testů PASS, naposledy 1,279 s. Regrese pokrývají normály, obě strany příčky, metrické UV, skutečné main/mezz počátky, nebarvení velkého slab přes různé místnosti, neutrální konfliktní overlap v obou pořadích, vlastnictví cache, nábytkové klíče, schody/rámy, byte-exact PNG a nepoužití B2.

Malá zdrojová kontrola spojila existující recepturu s `source-contract.json` jen v paměti: jeden největší `finishTriangle` v každé známé místnosti. 228 bedroom + 24 WC + 12 bathroom + 21 corridor přiřazeno správně. Dva suterénní corridor polygony s192/s193 překrývají uzavřené podschodové místnosti s120/s122; helper je ponechá neutrální. Kolize předána přípravě, která řeší zdrojové odečtení oblastí, nikoli náhodnou prioritu materiálu. Toto je kontrola 287 reprezentativních ploch, ne audit všech stěn.

Ignorovaná evidence: `.cache/b6-photo-finishes-20261024/source-check.json`, reprodukční `check-source.py` a pět autorských PNG náhledů. Prohlédnuty skutečné autorské náhledy chodby a linolea. Nativní načtení/packing, materiálové sloty exportu, celkové osvětlení, kontinuita na spojích, pohledy v pokojích a produkční hra musí projít koordinovaným ověřením integrátora. CPU test ani samostatný raster není důkaz hotového vzhledu budovy.

Koordinátor doplnil fasádní materiál vnějších svislých hran podlahových desek. Protože deska leží těsně pod intervalem místnosti, její stejná plocha se pro výběr přilehlé fasády vzorkuje o0,24m výš. Původní obvod, horní plochy, interiéry a kolize se nemění.19/19 finálních material testů PASS; native geometry digest před/po shodný. Povrchová úprava proběhla přímo na nativním masteru s přepočtem UV pouze dotčených hran a přenosným GLB auditem.
