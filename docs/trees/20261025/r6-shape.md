# B5 R6: nativní prostorový pilot větve 3

Samostatný autorský experiment KEY-62 dne 26. 10. 2026. Nejde o herní screenshot ani přijatou změnu katalogu. R5 a zmrazená v9 hra zůstávají nedotčené; botanický druh `ipr-crown-014` je neznámý. Prioritou uživatele je realistický habitus před přesnou kopií fotografie.

## Průzkum a volba před kandidátem

Skutečně prohlédnutý v9 `v9-webgpu-own-b5-near-summer-medium.png` má centrální vlastní B5 s dlouhými olistěnými rameny v patrech; pravý strom je legacy. R4 nativní kontrolní kostra a nové celé R5 kontroly `control-00-bare.png` / `control-00-summer.png` potvrdily mechanismus v samotné geometrii: pravidelně rozmístěné druhotné větve dlouhých ramen, bez nezávislého posunu listů. Problém není doložen jako chyba atlasu. Nativní snímky používají původní mapy, stejné světlo pro oba stavy a pohled přibližně západ–východ; neimitují herní osvětlení.

Primární zdroje jsou přesné R5 `.blend`, původní osy a R4 metadata, původní `add_foliage.py`, R5 `wood_preview.py` a `full_coverage.py`. Piny jsou v `scripts/trees-20261026-r6/prepare.mjs`. Místní reference a jejich nejistoty jsou v [research.md](research.md); neexistuje pozemní druhové zaměření B5. Zachování fyzické velikosti a atlasových částí vychází z původního `tree-leaf-components.json`, nikoli ze změny hustoty.

| Varianta | Přínos a náklad | Rozhodnutí |
| --- | --- | --- |
| Změnit pouze materiál/normály | Mohlo by oddělit tóny; neřeší pravidelnou kostru a míchá příčiny | Odloženo |
| Přidat listy nebo je rozptýlit do objemu | Rychlé zaplnění, ale mění populaci, výkon a anatomické podpory | Odmítnuto |
| Změnit celou korunu/generátor | Větší možný účinek, rozsáhlá nejistota a potřeba nových LOD | Odloženo do přijetí malého pilotu |
| Otočit celé rameno | Jednoduché, ale nemění rozložení jeho výhonů | Nedostatečné pro tuto hypotézu |
| Rigidně přeskupit 12 existujících druhotných podstromů jedné větve | Izoluje prostorové rozložení; stejné listy a jejich podpory, žádný nový runtime stav/cache | Zvolený malý kandidát |

Vybraná skutečná osa **3**, parent 0, má začátek `[1.0703536,0.1917559,4.0916798]`, konec `[-1.3058765,-6.1374843,7.4755321]` v root-local Blender Z-up. V požadovaném západním pohledu je to pravé rameno. Podstrom má 733 větví a 10 256 z celkových 82 100 fotografických listů. Osa 3 sama a kmen zůstávají identické; mění se 732 potomků.

Explicitní ID, cílové `t`, yaw/elevation a skupiny obsahuje `B5_BRANCH3_EDITS`. Nová kotva každého podstromu je přesně `sample(originalParent3,t)` s původní indexovou interpolací. Transformace je `newAnchor + R*(position-oldAnchor)`; stejná matice patří všem potomkům i listům. Žádné měřítko ani náhodný posun. Tři nepravidelné skupiny a úhly jsou autorská interpretace k obrazovému porovnání, ne botanické měření. Současný rozsah nemění veřejné assety, runtime LOD/cache ani lifecycle hry.

## Ověření

`node node_modules/tsx/dist/cli.mjs --test tests/tree-r6-shape.test.ts`: **5/5 PASS**, bez skip. Testy ověřují úplnost potomků nezávisle na pořadí ID, napojení, rigidní vzdálenosti/handedness a odmítání neplatných stromů; také segmentový test křížení. Úzký TypeScript check testu a `node --check` obou modulů prošly. Nejde o GPU test.

Nativní audit ověřil všech 116 267 vertexů dřeva vůči pinovanému R5 generátoru (max. chyba 0,661 µm) a všech 82 100 listových vazeb rank + fotografická UV část + původní kotva. Přesunul pouze 10 256 listů a 732 větví; 71 844 ostatních listů zůstalo byteově identických. Indexy, UV, ranky, počet vertexů/trojúhelníků a původní materiály jsou stejné. Dřevo má 209 074 tri, listy 328 400 tri.

U každého přesunutého listu kontrola měřila vzdálenost kotvy k **jeho vlastnímu** skutečnému native branch meshi. Všech 10 256 splnilo původní podporový limit `max(0.008, supportRadius+0.005)` metru. Tento limit není vždy 8 mm: kotva leží na středové ose a u silnější větve má přirozeně větší vzdálenost od povrchu. Maximum vzdálenosti je 24,761 mm, maximum poměru k příslušnému limitu 0,730. Změna vzdálenosti před/po transformaci je nejvýše 0,389 µm; změna párových vzdáleností listových vertexů nejvýše 1,155 µm (Float32). Všech 720 vnitřních napojení transformovaných podstromů zůstalo shodných do `3.67e-15 m`. Dvanáct nových kořenových kotev je přesně na `sample(originalParent3,t)`; vůči zjednodušené native ose je maximum 0,228 mm při rodičovském poloměru 28,871 mm. Kořen stromu a collider jsou původní.

Bounds celé koruny před/po jsou přesně stejné: `[-7.408803,-9.228651,-0.035729]` až `[8.708602,8.631116,13.501535]` m. Konzervativní průzkum silnějších os depth ≤ 2, s menším poloměrem alespoň 15 mm a bez přímého parent/junction úseku, našel v originálu jedno křížení (1595/1656), v kandidátu žádné. Nejde o úplný test všech jemných mesh průniků.

Samostatné znovuotevření `.blend` prošlo: všech 12 původních objektů má stejné mesh atributy a metadata, 2 kandidátní objekty stejné zkontrolované atributy, 14 používaných packed images přesně stejné bajty. Oba kandidátní meshe mají 12 pojmenovaných vertex groups pro editaci konkrétních původních podstromů. Framing celé koruny v obou úhlech má rezervu; neřeže korunu. Nativní soubor má SHA-256 `c222d6c2a3f623e23821678c845dc8ae54c099366644d38e53c5dcc170e22220`, 108 152 459 B.

První kontrolní render doběhl, ale zápis JSON narazil na serializaci Blender `IDPropertyArray`; `control.log` zachovává chybu. Oprava převádí pole na běžný seznam, nemění geometrii ani PNG. První dva candidate běhy odmítl příliš úzký 2 µm invariant Blender BVH (naměřeno 2,776 µm); geometrie zůstala stejná, malý přímý float64 triangle/edge oracle odstranil závislost na BVH numerice a prošel i třemi analytickými případy. První readback kontrola chybně srovnávala původní `0.48399999999999993` s ideální konstantou `0.484`; opravená kontrola porovnává kandidáta přesně se zdrojem. Všechny neúspěšné logy zůstávají v cache, poslední candidate/readback mají exit 0.

## Obrazový výsledek a hranice

Skutečně prohlédnuté celé snímky 0° a 45° ukazují změnu pouze pravého ramene 3. Výhony více stoupají a mění směr do prostoru; mezi skupinami jsou čitelnější mezery. Při 45° roste objem nad ramenem a mění se překryv se středem koruny. To je přijatelný izolovaný experiment pro další rozhodnutí, nikoli důkaz celkově realistického stromu. Ostatní dlouhá patra koruny a celkové tonální oddělení zůstávají otevřené. Žádný GLB, LOD, veřejný asset, runtime kód ani GPU měření nevznikly.

Všechny PNG jsou **Blender Cycles CPU authoring preview**, 1100 × 900, 12 samples, 2 threads, seed 62. Ortografický pohled je orientován podle západního směru uživatelské kamery a druhý má +45°; ortografická projekce a studiové světlo nejsou herní kamera ani vzhled produkční hry. Podklady, příkazy a manifest obsahuje [předání](../../agents/handoffs/trees-20261026-r6-shape.md).
