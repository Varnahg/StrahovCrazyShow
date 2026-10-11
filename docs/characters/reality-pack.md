# Postavy: aktuální anatomie a materiály

10. 10. 2026. Editor a hra používají stejný synchronní `createAvatarRig`. Nová geometrie a materiály jsou původní práce pro toto demo, bez fotografií studentů, převzatých herních postav nebo lidských skenů.

## Skutečně zapojené změny

Hlava je souvislá uzavřená plocha s čelistí, bradou, lícními kostmi, očními důlky, nosním hřbetem, špičkou nosu a reliéfem rtů. Nahrazuje původní hlavu ze šesti prstenců a přilepených nosních válců. Bělmo, duhovka, zornice a obočí se usazují podle skutečného povrchu vytvořené hlavy. Šest uzavřených účesů ponechává oči odkryté; vousy kopírují čelist a nechávají volná ústa.

Torzo, kalhoty a rukávy mají zúžení a mírné nepravidelné záhyby přímo v geometrii. Dlaně používají vlastní profil. Zachovány jsou barevné úpravy, šest předloh, brýle a odznaky. Základní postava měří přibližně 1,74 m, její proporce zůstávají kolem 7,2 hlavy.

PBR materiály rozlišují kůži, vlasy, látku, denim, boty, oči, kov a pryž. Zvolená sRGB barva se převádí do lineárního prostoru; vzdálená silueta ji převádí zpět do své stávající vertexové palety. Tři společné analytické normálové textury přidávají jemnou strukturu pokožky, tkaniny a vlasů. Nejde o sken. Kůže používá slabý široký odlesk, látka vyšší drsnost a jemný sheen; nejsou zapnuté drahé celoplošné průchody rozptylu pod povrchem.

Editor má **Detail tváře / Celá postava**, otočení a přední pohled. Celkový pohled nechává boty nad ovládací lištou. Vykresluje na vyžádání, bez trvalé animační smyčky.

## Sdílení a rozpočet

Pool sdílí GPU geometrii i mezi různými barvami stejného tvaru. Materiály vznikají podle role a barvy a sdílejí se mezi postavami. Úprava profilu prořezává nepoužité zdroje; tři malé normálové textury patří celému poolu.

| Předloha | Blízké trojúhelníky | Střední | Vzdálené |
| --- | ---: | ---: | ---: |
| Alex / Niki | 13 348 | 8 384 | 216 |
| Robin / Mia | 12 856 | 8 128 | 204 |
| Eli | 12 808 | 8 128 | 204 |
| Sam | 13 744 | 9 508 | 240 |

Blízko je 40–48 instancí, ve střední vzdálenosti 19–22 a daleko jedna uzavřená barevná silueta. `metadata.avatarDetail = "micro"` vyřazuje oči, obočí a drobné doplňky ze skutečného průchodu scénou ve středním LOD. Všichni hráči zůstávají reprezentovaní. Počty ani NullEngine test nejsou důkazem FPS; produkční měření celé hry musí zahrnout tyto nové materiály.

## Zdroj a reprodukce

- `scripts/create-avatar-reality.py`: původní generátor ploch pro Blender 5.2.2.
- `assets/blender/characters/avatar-reality.blend`: editovatelná knihovna jednotlivých anatomických a oděvních ploch.
- `public/models/characters/avatar-surface-library.glb`: referenční glTF export týchž ploch, včetně vertexového tónování.
- `client/data/character-geometry.json`: pozice, normály, UV, indexy a jemné tónování, které hra přímo instancuje. Nečeká na GLB pro každého hráče.
- `public/models/characters/geometry-manifest.json`: provenience, počty trojúhelníků a SHA-256 runtime geometrie.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-avatar-reality.py
pnpm exec tsx --test tests/animation.test.ts tests/avatar-lod.test.ts
```

Blender soubor je knihovna ploch pro editaci, sestavení a pivoty postavy zůstávají v `client/avatar-renderer.ts`. Autorské plochy mají výslovně CCW orientaci; Babylonova pravotočivá výchozí orientace primitiv by jinak zobrazila vnitřek hlavy a skryla čepici vlasů.

Technické primární zdroje: [Babylon instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances), [Babylon PBR](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR), [glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html). Určují kompatibilitu; jejich obrazové assety se nekopírují.

## Ověření

**19/19 PASS** v cílených animačních a LOD testech: 11 scénářů animace/anatomie a 8 LOD scénářů. Zůstává kontrola chůze/běhu/sprintu při 30/60/144 aktualizacích za sekundu, opory světových kotev chodidel do 1,2 cm, skoku, gest, zastavení, teleportu a nejkratšího otočení. Nové kontroly pokrývají uzavřenost všech tvarů, normály a orientaci, nezakryté zornice všech šesti účesů, zachování barev PBR i siluet, sdílení geometrie a uvolnění materiálů. Hodnoty 30/60/144 v těchto testech nejsou GPU měřením FPS.

`AvatarRig.eyeHeight` a `bodyHeight` jsou klidové vzdálenosti od chodidel ve světových metrech. Neutrální Alex má oči 1,62946 m nad chodidly. IK a gesta tato čísla nemění. První osoba tak může použít odpovídající výšku bez houpání kamery. API pivotů, animátoru a síťová konfigurace zůstávají kompatibilní.

Snímky skutečného editoru jsou v `docs/characters/evidence/`. Kontrola všech šesti předloh nezaznamenala chybu konzole a odhalila/opravila opačné plochy, prosvítající pokožku přes vlasy, dlouhé vlasy zakrývající oči a oříznuté boty. Jde o kontrolu vzhledu; celá produkční hra a její FPS se ověřují samostatně.

Nový model se načetl také ve skutečné samostatné prohlídce na vývojovém klientu `127.0.0.1:5173`. Denní náhled a skutečný stisk W po 1,8 s ověřily vykreslení a pohyb ve světě; snímek `evidence/game-day-after-walk.png` je z této scény. Nevznikla chyba konzole. Hra zároveň vypisovala varování o nastavování `visibility` instancím, předané integračnímu agentovi. Údaj FPS na snímku je okamžitý HUD z nezmrazeného vývojového klienta v pomocném prohlížeči a není produkční benchmark.

## Zbývající rozdíly

Výsledek je původní semi realistická stylizace s analytickými materiály a procedurální IK. Není to fotogrammetrie, lidský sken nebo produkční kvalita Hogwarts Legacy. Chybí facial capture, detailní prsty, fyzikální vlasy/oblečení, realistické skinned klipy a rozsáhlé obličejové blendshapy. Rozdíly zůstávají viditelné v detailu a nejsou vydávány za hotovou AAA postavu.
