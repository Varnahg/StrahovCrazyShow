# Oprava geometrie kol v LOD K

Oprava se týká pouze odvozených medium/far kol. Původní CC0 zdroj, nejvyšší near GLB a editovatelný near master zůstaly byte-for-byte stejné. Veškeré části karoserie, jejich souřadnice/normály/UV/indexy, PBR materiály, vložené obrázky a všechny transformace uzlů jsou přesně převzaté z J. Fyzika ani čtyři nezávislé wheel pivots se nemění. **Uzavřenost kol není tvrzení, že je celá far karoserie vodotěsná nebo fotogrammetricky dokonalá.**

## Konkrétní příčina a oprava

Původní součet normál vůči geometrickému cross productu dával near95, medium269 a far187 záporných dotů pod−0,01. Tento počet není automatický důkaz obráceného windingu. U near byly83 případů v černých těsněních/spárách a12 v chromovém lemu. Třináct ze čtrnácti dotčených černých komponent i chromový lem byly uzavřené, orientačně konzistentní s kladným objemem. Hladké normály na ostrém zakřivení mohou být proti malé ploše; globální převrácení trojúhelníků by poškodilo správnou geometrii.

Samostatná kontrola ale odhalila skutečné nové mezery v odvozených kolech. Importovaný source měl shodné pozice rozdělené na UV/normálových švech, takže decimátor viděl oddělené ostrovy. Near pneumatika má jeden uzavřený4428-triangle shell a192 samostatných uzavřených tread boxů. U původního medium Wheel0 vzniklo2285 boundary edges, z nich851 geometricky odpovídalo hlavnímu shellu; nejdelší měřila0,255m a loop sahal přes průměr0,671m. Původní medium disk měl1342 boundary edges. Nebyl to jen neškodný detail běhounu.

Generátor proto nejprve svaří pouze shodné pozice do1µm. **Každá původní per-loop UV hodnota a source custom normal jsou přes weld zachované**; SHA seznamů UV před a po je shodná pro všech32 případů. Medium poté používá původní decimate poměry.

Prostý weld sám nestačil u far. Blender zkolaboval drobné uzavřené komponenty na dva duplicitní opačné trojúhelníky; při skutečném exportu je `mesh.validate()` zredukoval na otevřené úlomky. Nová far pneumatika proto zjednodušuje hlavní shell samostatně, ponechává čtyři celé původní tread boxy na radiálních extrémech a ostatní celé drobné boxy vynechává. Zachovává tak zdrojové krajní body a nevytváří roztrhaný zbytek běhounu. Černé cap/lug komponenty zůstávají všechny, s minimem čtyř trojúhelníků na uzavřenou komponentu. Disky a steel části používají původní poměry. Žádné otvorové capování ani automatický flip normál se neprovádí.

## Skutečné výstupy

| Model | Trojúhelníky J → K | GLB bajty J → K |
| --- | ---: | ---: |
| Near | 138750 →138750 | 5351716 →5351716 |
| Medium | 42740 →42732 | 1926820 →2063852 |
| Far | 9431 →9202 | 486456 →479460 |

Medium má o8 a far o229 trojúhelníků méně. Medium soubor je větší, protože správně spojená geometrie a zachované UV/custom-normal atributy mají jinou vertex strukturu než původní rozpadlé ostrovy; velikost se neskrývá za počet trojúhelníků. Oba výstupy nadále mají26 částí. Source near/master nebyl kvůli výkonu zjednodušen.

SHA-256:

- Původní CC0 GLB: `107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7`.
- Near GLB: `2805ecfd4dd14ad3ea0511efce8c78d9dd8fc07c9d55dc28bf02e61831afa665`.
- Editovatelný near master: `3b72d0f6f89d3a6719eda6588422f087ed5fae5a0a454103efe72a62e3317a6e`.
- Medium K: `0bef8a689cf02ed048c5db28cfd050154144aab386e1e5b67a583de8ec95b82c`.
- Far K: `98254bb33689919998a83fd28aae77a6aa31da5826afda368f9f4c4e7f2ead58`.

J odvozené GLB jsou archivované v `assets/blender/vehicles/innerscene-hatchback/lod-baseline-j`. [Pack audit](./wheel-repair-pack-audit.json) zachycuje vstupní/výstupní SHA, počty a zachování těla/materialů/obrázků. Oba kanonické/public manifesty uvádějí aktuální K výstupy.

## Ověření a praktické limity

**Skutečně exportovaných32 wheel částí** prošlo kontrolou nulových boundary, nonmanifold a orientation-error hran a nulových degenerovaných trojúhelníků. Jde o následné GLB, nikoli pouze o stav BMesh před exportem. `mesh.validate()` nyní ve všech32 případech nic neopravuje. Pozice, normály a UV jsou konečné; normály jednotkové. [Weld audit](./wheel-weld-audit.json) a [CPU audit publikovaných GLB](./wheel-export-audit.json) obsahují konkrétní části a hodnoty.

Obousměrné vzorkování nejbližšího povrchu používá skutečné vrcholy, středy hran a středy trojúhelníků. Největší zaznamenaná odchylka medium je4,51mm; far28,49mm na drobném černém trimu, far rubber nejvýše20,1mm. Nejde o matematický důkaz přesné Hausdorff vzdálenosti. Boční ray grid kompletního Wheel0 po5mm má vůči13289 near hitům91 nových missů u medium(0,685%) a444 u far(3,341%); zahrnuje změnu siluety a mezer mezi paprsky disků. **Netvrdíme shodné pixely nebo stejnou siluetu z bezprostřední blízkosti.** Zbývající záporné průměry hladkých normál jsou vykázané zvlášť a nepřevracejí jinak uzavřený winding.

`pnpm exec tsx --test tests/car-wheel-topology.test.ts tests/realistic-car-pack.test.ts`: **11/11 PASS**. Zahrnuje5 nových regresí, source/master SHA, bitovou shodu J těla/PBR/obrázků/uzlů, skutečnou topologii32 částí a import všech tří GLB skutečným Babylon loaderem. Zachované původní pack testy ověřují kola/fyzický envelope, instance LOD, nezávislé rigy, paletu,24 parkovacích kontaktů s DMR a lens emisi. Záznam: [wheel-repair-tests.log](./wheel-repair-tests.log).

Část v NullEngine neověřuje GPU pixely/FPS ani shader kvalitu. Hlavní proces následně provádí cold WebGL kontrolu near/medium/far a celé hry K; výkon naměřený pro J se nesmí vydávat za měření K. Poslední workspace TypeScript kontrolu po souběžných opravách Game rozhraní hlavní proces potvrdil jako exit0.

Zůstává konkrétní malý near vnitřní fold: Body:black triangle18117 odpovídá source triangle537 ve `Watertight 14-station body shell`, centroid přibližně `(0,8053;0,5874;−0,4213)m`, plocha0,00048446m² a hrana1,695m. Source měl dot+0,999999995; dlouhá přímočará aproximace přes piecewise normalizační knoty se překlopila. Izolované conforming knot dělení opraví matematiku, ale plná varianta mění některé plochy až o0,217m. **Do K se neintegruje bez nového zdrojového/vizuálního review.** Oddělené far body/arch coverage vady z J rovněž nejsou touto wheel opravou vyřešené.

## Opakování

```powershell
blender -b -t 2 --python scripts/create-car-lods.py
pnpm exec tsx scripts/build-car-manifest.ts
blender -b -t 2 --python scripts/audit-car-wheel-exports.py
pnpm exec tsx --test tests/car-wheel-topology.test.ts tests/realistic-car-pack.test.ts
```

Generátor zachovává SHA near/master, odvozuje editovatelné medium/far `.blend`, exportuje wheel-only GLB a skládá je s archivovanými J body částmi přes `build-car-wheel-pack.mjs`. Úmyslné pozdější přepracování těla vyžaduje nový doložený body baseline; současný generátor jeho změnu nepřijme potichu. Blender používá nejvýše dvě CPU vlákna a neprovádí render.
