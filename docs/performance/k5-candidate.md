# K5: přesné statické SubMesh buňky

Kandidát rozděluje původní terén, čtyři street materiály a šest landcover meshů do 96m XZ buněk. Žádný vrchol, normála, UV, barva, poloha, world matice, root, materiál nebo kolize se nezmění. Každý původní indexový trojúhelník se zachovaným windingem je zařazen právě jednou; mění se pouze pořadí runtime indexů a jejich SubMesh rozsahy. Originální runtime indexový master zůstává v WeakMap a zdrojové JSON/GLB/Blender soubory zůstávají zachované.

`client/static-submesh-chunks.ts` zachovává stejné VBO objekty i indexovou šířku, nevytváří nové mesh roots nebo vertex buffery a neprovádí decimation, clipping, interpolaci ani přepočet normál. Trojúhelník přesahující hranici buňky není rozříznut: jeho buňka má bounds přes celý původní trojúhelník. Sdílená geometrie, instancované nebo více-materiálové mesh nejsou pro tento helper přijímané. Jednobuněčný mesh si ponechá i původní indexový stream.

Původní root/material zůstává jediný. Nativní Scene frustum culling nyní může odmítnout jednotlivé SubMesh ranges a K4 opaque comparator dostává jejich lokální bounds. Celá scéna ani její aktivace se nezmrazují.

## Shadow contract

Landcover měl už před K5 původní opaque caster policy; ta nebyla potichu vypnuta. Explicitní shadow render lists Babylonu necullují SubMesh stejným způsobem jako hlavní Scene, proto by samotné rozdělení násobilo stínové draw calls.

`client/static-submesh-shadows.ts` se instaluje přes veřejný `ShadowGenerator.customAllowRendering` pouze pro **označené neinstancované statické mesh**. Čte aktuální veřejný light transform a SubMesh world bounds se stejným 0,05m solar / 0,02m headlight paddingem jako původní producer. Výsledek jakéhokoli předchozího callbacku zachovává. Pro všechny neoznačené objekty, instance, thin instances, avatary, stromy/vítr a car proxy žádný další prostorový filtr nepřidává; jejich policy zůstává původní.

Integrace v Cinematic a VehicleLighting přidává pouze tento callback. Rozlišení map, světelné sloty, bias/normal bias, caster klasifikace a wind wrappers se nemění; callback zůstává na stejném generatoru i po změně velikosti jeho mapy.

## CPU studie před implementací

Nezávislá cache studie použila skutečnou zmrazenou geometrii K3, jejíž zdrojové TS/JSON měly před implementací K5 shodné SHA s K4. Všech **286 956 trojúhelníků / 11 meshů** zachovalo Float32 attribute hashes, materiálovou identitu a přesné rekonstruované původní indexové trojice. Zaznamenaná K3 kamera je skutečná; další tři směry jsou označené hypotetické CPU pohledy, nikoli GPU měření.

V zaznamenaném frustumu bylo původně 9 viditelných ground meshů / 285 138 trojúhelníků:

| Buňka            | Main trojúhelníky | Main draw ranges | Solar draw ranges po správném filtru | Solar trojúhelníky |
| ---------------- | ----------------: | ---------------: | -----------------------------------: | -----------------: |
| Původní monolity |           285 138 |                9 |                                    4 |             42 145 |
| 64 m             |            48 814 |               90 |                                    4 |              2 984 |
| **96 m**         |        **60 239** |           **49** |                                **3** |          **3 832** |
| 128 m            |            86 161 |               50 |                                    2 |              6 766 |

Naivní 96m shadow dispatch by měl **72** landcover draw ranges místo původních čtyř, což je důvod pro povinný tagged filter. Správná 96m varianta představuje v tomto view 52 main+solar ground draw ranges proti původním 13, tedy o 39 více, při menším počtu odeslaných indexů. Ve zkoumaném západním směru má 96m varianta 150 main ground ranges; univerzální výkonnostní zisk z tabulky neplyne.

Výstup je `.cache/terrain-chunk-study/results.json`. Nejde o FPS, GPU overdraw counter ani slib zrychlení. Člověkem dodané měření J na GTX 1060 ukazuje vysoký CPU render čas, proto je dodatečný draw-call náklad podstatný a musí se měřit také na této cestě. K4 historie ani jeho GPU výsledky se nemění.

## Ověření

První širší běh: **63/63 PASS, exit 0**, concurrency 2, přibližně 45,5 s. Zahrnuje terrain/Rapier, court patch, street/footpath/PID alignment, material transitions, vegetation, cinematic/night, car proxy, opaque sort a headlight regrese. Po finálním zpřesnění zachování předchozího callback výsledku: **13/13 static/headlight PASS**, přibližně 11,4 s. TypeScript celé aplikace: **PASS, exit 0**.

Šest nových static testů ověřuje:

- stejné vertex buffer objekty a bitové hodnoty všech atributů, index master/triples/winding/width, root, material, world pose a floor bounds;
- odmítnutí sdílené geometrie před mutací a neměnnost jednobuněčného streamu;
- skutečný terrain builder proti kanonickému render/collision zdroji;
- všech 11 skutečných builder výstupů proti nezávislé před-K5 fixture `tests/fixtures/static-ground-source.json`;
- skutečný Scene main dispatch a skutečný ShadowGenerator dispatch: tři původně dispatchované chunks → jeden blízký, vzdálené odmítnuté;
- zachování neoznačených/instancovaných a předchozích callbacků, solar i 256/512 headlight integraci včetně resize a low návratu.

Full frozen test/build/integration a více-pohledové produkční GPU/CPU A/B následují na rootu. NullEngine test není GPU důkaz.

## Oddělená diagnostika blikání podkladu

Uživatel hlásí rychlé přepínání barev u více bloků. K5 audit potvrzuje, že kandidát nepřesouvá nebo netvaruje původní podklad; samotný index scheduling ovšem nevylučuje existující problém vrstev nebo jejich draw order. Žádná oprava tohoto symptomu nebyla připojena jako slepé navýšení biasu.

Samostatný F32 surface audit v `.cache/ground-layer-study/height-audit.json` zkoumal 70 315 top-layer bodů na 1m mřížce mimo budovy. V této sondě nenašel prohození výšek: grass/base 2,496–2,507 mm, road/grass 15,499–15,501 mm. V zaznamenaném K3 frustumu nenašel top pair se stejným biasem a odstupem pod jedním D24 LSB. To neprověřuje úzké švy, jiný pohled, polygon-offset rasterizaci nebo skutečný GPU flicker. Photo asphalt má factor −1/units 0, grass factor −1/units −1; tato různá units priorita je zaznamenaná, příčina není potvrzená.

ActualGame diagnostika `docs/verification/ground-seams.html` umožňuje blokové/přesné CPU body, micro-orbit, izolaci všech ground vrstev, stínů, normal map a neosvětlených plných barev. Volitelný framebuffer pixel probe a skutečný GL bias pomáhají reprodukci, nejsou automatickým určením příčiny ani měřením FPS. Flicker zůstává samostatný otevřený nález do skutečného render ověření.
