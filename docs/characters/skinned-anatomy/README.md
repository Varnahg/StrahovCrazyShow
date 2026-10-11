# Anatomické avatary – 11. 10. 2026

Tato zpráva zachycuje předchozí anatomickou fázi. Produkční oblečení a aktuální rozpočty nahrazuje [šité studentské oblečení](../student-garments/README.md); místní `preview.html` zachovává výslovně původní oděvy pro A/B srovnání.

Herní `createAvatarRig` nyní používá souvislou anatomii těla, skutečnou modelovanou lidskou hlavu a GPU skinning. Kolenům a loktům už neodpovídají oddělené válce s kulovými krytkami. Jde o další kvalitativní základ pilotu, nikoli o dokončené postavy úrovně Hogwarts Legacy.

## Zdroj a editovatelné modely

Primární předloha je [Blender Studio Human Base Meshes 1.4.1](https://www.blender.org/download/demo-files/), oficiálně CC0. Použité objekty jsou `GEO-body_male_realistic` a `GEO-body_female_realistic`. Autoritativní doklad je README textový blok uvnitř neměnného zdrojového `.blend`; jeho přesná zachovaná kopie je `assets/sources/characters/blender-human-base/source-license.txt` (1 134 bajtů, SHA256 `98d7fbbdecead1b44a1e694de0e1a7175253e2d973195fe595ac8d2997133ad8`). Vedlejší `source.json` zaznamenává cestu, hash a původ. Stejné bajty jsou pro čtení také zde v `source-license.txt`, ale test ani samostatný balíček nepotřebují složku `docs`. Licence se kopíruje spolu s původním modelem v `assets`; test ověřuje její skutečné bajty, deklaraci CC0 i neměnný hash zdrojového `.blend`. Generátor porovnává text s původním README a zachovává kanonické licenční bajty. Balík obsahuje i jiné rigy, které se nepoužívají.

Ověření přenositelnosti licenčního dokladu: `tests/skinned-avatar.test.ts` prošel 6/6 v běžném projektu i při spuštění z odděleného pracovního adresáře bez složky `docs` (pouze `assets` junction). Test se nevynechal; přečetl a ověřil skutečnou kopii licence i původní model. Nová metadata jsou jen ve zdrojovém `assets/.../source.json`; runtime anatomie a její úplný SHA256 `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc` zůstaly nezměněné.

Původní ZIP o velikosti 50 643 039 B a původní `.blend` zůstávají v `assets/sources/characters/blender-human-base`. Datum skutečného stažení, SHA256 a primární odkazy jsou v `source.json`. Žádný studentský obličej ani fototextura skutečné osoby se nesbírají.

Editovatelný derivát je `assets/blender/characters/skinned-anatomy.blend`: dvě oblečená anatomická těla s vahami a armaturami, zdrojové objekty, skutečná hlava, šest prototypových účesů, brýle a vousy. Souřadnice exportu jsou metry, chodidla v nule a tvář ve směru +Z. Původní nejvyšší zdroj zůstává nezměněný; střední detail je odvozený.

Generování: `Blender --background --threads 2 --python scripts/create-skinned-characters.py`. Poslední reprodukovaný běh Blenderu 5.2.2 trval přibližně 9–12 s. Výsledná data mají SHA256 `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`; úplný audit zdroje a masteru je v `final-source-audit.json`.

## Co se změnilo

- Zdrojová A-pose se převádí standardními bind maticemi a spojitými kostními vahami. Původní TransformNode pivots, třináct kostí, IK, nulová výška chodidel a stabilní výška očí zůstávají kompatibilní s hrou.
- Čtyři materiálové části sdílejí polohy, váhy i normály na švech. Nejbližší i střední detail mají bitově stejné normály všech 150 / 128 společných bodů. Oddělený výpočet normál a následná decimace předtím vytvářely falešné tvrdé hrany na ramenou.
- Oblečení má vyhlazenou povrchovou rezervu, společný zdrojový tvar a uzavřený límec. Vnitřní body hrudníku mají váhu páteře, ačkoliv patří do původních arm face-sets. Spodní uzávěr krku je zatažen dovnitř oděvu.
- Vlasy vycházejí z povrchu nové lebky. Brýle jsou jediný sdílený model místo devíti samostatných boxů. Jemné vousy mají vlastní materiál nad neprůhlednou hlavou; jejich záměrné prolnutí nevytváří díru v kůži. Tělo, oděv a hlavní účesy jsou neprůhledné.
- Prsty jsou předem lehce uvolněné ze široce roztažené sculpting pose. Výška vizuální pánve při chůzi vychází z dosažitelných opěrných chodidel; původní stálý podřep o 8–10 cm zmizel. Kamera ani kolize nedědí tento pohyb. Chůze má mírnější flexi loktů než běh.
- Šest presetů i volby pleti, vlasů, oděvu, kalhot, šířky tváře, brýlí, vousů a odznaku zůstávají zachovány. Materiálové reference přežijí dočasné odebrání vzdáleného těla ze scény a uvolní se až s posledním vlastníkem.

## Ověření

`pnpm exec tsx --test tests/animation.test.ts tests/avatar-lod.test.ts tests/skinned-avatar.test.ts`: **25 / 25 PASS**. `pnpm exec tsc --noEmit`: **PASS**. Testy zahrnují skutečné Babylon bone matice, bind pose, normalizované váhy a normály, shodné švy i po středním LOD, uzavřený povrch hlavy, životnost materiálů a 100 současně reprezentovaných identit. Opěrné kotníky mají při rychlostech 1,8 / 4,6 / 7 m/s odchylku pod 12 mm. Rychlost kroků se ověřuje při 30 / 60 / 144 aktualizacích za sekundu; tato čísla nejsou změřená GPU FPS.

Samostatný vývojový náhled `http://127.0.0.1:5173/docs/characters/skinned-anatomy/preview.html` používá skutečné herní třídy. V browseru byly vykresleny všechny presety, čelní obličej, tři čtvrtiny, chůze s ohnutým kolenem, gesto s ohnutým loktem a skutečné přepnutí LOD. Důkazy jsou v `evidence/` a číselný záznam v `browser-audit.json`. Nový běh má **0 nových shaderových chyb**. QA běželo na Intel UHD 630, CSS i interní plátno 980 × 635 v okně 1280 × 720. Náhled není výkonovým benchmarkem produkční hry.

Aktivní rozpočty celého avatara, bez vypnutých LODů:

| Preset | Nejbližší trojúhelníky | Aktivní meshe |
| --- | ---: | ---: |
| Alex | 22 322 | 22 |
| Robin | 22 442 | 19 |
| Eli | 22 070 | 23 |
| Sam | 24 454 | 19 |
| Mia | 22 726 | 19 |
| Niki | 22 322 | 22 |

Tělo tvoří čtyři skinned drawy. Střední detail má přibližně 9,7–12,4 tisíce trojúhelníků a 8–9 aktivních meshů; vzdálený detail jednu sdílenou instanci o 192–204 trojúhelnících. Méně meshů samo o sobě nedokazuje vyšší FPS než předchozí globální instancování. Celá produkční hra s relacemi a HUD musí projít závěrečným měřením zvlášť.

## Známé vizuální meze

Oděvy stále zřetelně vycházejí z anatomické základny: deltoidy jsou výrazné a podpaží při velkém gestu potřebuje další ruční retopologii a střih oděvu. Číselně spojité švy neznamenají dokončenou módní/modelářskou práci. Účesy jsou uzavřené prototypové plochy, nikoli produkční strand/card groomy; krátké varianty si jsou podobné. Šest presetů používá společný základ hlavy a omezenou změnu šířky, nejsou to šest samostatných realistických identit. Kůže má základní pigment a jemnou analytickou mikrostrukturu, nikoli hotovou fotografickou sadu skin/roughness/displacement. Animace je procedurální IK, bez mocapu, prstových gest a mimiky. Tyto limity se nesmějí označit za vyřešenou AAA kvalitu.

Plný `pnpm test`, `pnpm build`, izolovaný integrační běh a produkční FPS provádí integrující hlavní proces nad společnou ustálenou verzí.
