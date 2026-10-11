# Noční svět se skutečnou fotogrammetrií

Komponenta `client/photogrammetry-lighting.ts` přidává simulované teplé osvětlení
**přímo do fragmentů původního IPR meshe**, bez vložených obdélníků před fasádou.
Nahrává stále stejné původní JPEG atlasy přes stejné původní UV. Nevytváří žádné
další fasádové draw calls ani další textury. Jas ani rozsvícení nepředstavují
skutečnou přítomnost v pokojích.

## Podklady a odvození

- Zdroj: [IPR Praha, integrovaný 3D model Praha 2023](https://www.arcgis.com/home/item.html?id=92d2d376599c4fd2b6600ed46db7402e),
  licence CC BY, atribuce **datový podklad © IPR Praha**, snímání léto 2023.
- Manifest originálu SHA-256:
  `d556d38d5c32d9d039479e492d7937e2c358df90cf94f7aee232f5e1ba330d93`.
- `inspect-night-facades.py` dekóduje nejpodrobnější zdrojové I3S listy, zachová
  jejich původní JPEG/UV a rekonstruuje samostatné ortogonální pohledy na dlouhé
  fasády. Půdorys OSM slouží k identifikaci budovy. Skutečná rovina fasády je
  odvozena z četnosti poloh zdrojových trojúhelníků, po 0.05 m.
- Ve `night-evidence/*-source.png` je 15 prohlédnutých fasád B2–B10. Výšky pásem
  jsou **interpretace naskenovaného zdroje**, nikoliv nově zaměřená geometrie.
  B5 má horní řadu přibližně Y18.6, B10 Y10.9; jednotná výška vůči ploché zemi by
  na svahu rozsvěcela špatné části budov.
- `fit-night-window-bands.py` z prohlédnutých pohledů zapisuje malé anotace do
  `client/data/photogrammetry-lighting.json`. Každá obsahuje původní source node
  IDs, rovinu, směr, vlastní výšky oken, toleranci a confidence.

## Maska a atmosféra

Fragment musí současně ležet těsně u doložené roviny, uvnitř délky fasády,
v jednom z jejích šesti prohlédnutých výškových pásem a na téměř svislém
trojúhelníku orientovaném stejně jako fasáda. Teprve potom se použijí tmavé
neutrální pixely **původního** atlasu jako konzervativní maska skla. Světlá
omítka, zelená vegetace, střechy a zem se do ní nezahrnují. Emise prochází
stejnou mlhou a tone mappingem jako zbytek PBR obrazu.

Fiktivní obsazenost je deterministická pro pěti metrové fasádové skupiny a
podlaží. Není to číslování skutečných pokojů a nepoužívá žádná data hráčů či
obyvatel. Simulovaná četnost rozsvícení se mění podle času v Europe/Prague.
Světla plynule zhasnou při skutečném daylight >= 0.35, v noci zůstane teplá
vnitřní barva. Dnešní denní fotogrammetrický podklad se tím nemění.

Volitelná dvojice PointLight se přesouvá pouze k nejbližším z 36 mapovaných
OSM pólů. Low používá nejvýše jeden, medium/high dva, přes den žádný. Poloha
pólu je mapový údaj; výška a teplá barva svítidla zůstávají výslovně odhad a
simulace. Nevzniká nový model lampy, ani nesouvisející světlo uprostřed cesty.
PointLight osvětlí avatary, auta a doplněné PBR povrchy; původní unlit
fotogrammetrický mesh tím fyzikálně znovu nasvícen není.

## Integrace

```ts
const photoNight = createPhotogrammetryLighting(scene, {
  manifest,
  lampLights: true, // Pouze pokud nejsou stejné lampové PointLights jinde.
});

// Po vytvoření každého originálního fotogrammetrického PBR materiálu,
// před jeho prvním vykreslením:
photoNight.attach(material, sourceNode);

// V herním update se skutečným okamžikem astronomického osvětlení:
photoNight.update({ daylight, player, quality, instant });
const diagnostics = photoNight.stats();

// Při opuštění/dispose světa:
photoNight.dispose();
```

Materiály zůstávají vlastnictvím fotogrammetrického loaderu. Jejich eviction
automaticky odstraní položku z lighting registry. Různé kombinace fasád mají
odlišné effect cache keys. Source UV, atlas, albedo gamma flag a odstín materiálu
se připojením pluginu nemění. Implementace shaderu je GLSL pro aktuální WebGL
renderer; samostatná WGSL/WebGPU implementace není součástí této změny.

## Ověření

- `pnpm exec tsx --test tests/photogrammetry-lighting.test.ts`: **6/6 PASS**.
  Testují roviny, normály, pásy, barvu, čas, tile broad phase, nulové přidané
  fasádové meshe, zachování textury/UV offsetů, lifecycle a lampový budget.
  NullEngine zde ověřuje kontrakt a geometrii; **není důkaz GPU výkonu ani
  kompilace shaderu na skutečné kartě**.
- `pnpm exec tsc --noEmit --pretty false`: **PASS**. Samostatně typově
  zkontrolovaný `night-preview.ts`: **PASS**.
- Source broad-phase audit `night-evidence/shader-budget.json`: z 2588
  nejpodrobnějších zdrojových listů nepotřebuje 2440 žádný plugin, 107 používá
  jednu fasádovou masku a 41 dvě. Na nejpodrobnějším listu tedy nejvýše dvě
  analytické masky, žádný další atlas sample a žádná nová fasádová draw call.
- `audit-night-masks.py` kontroluje SHA **148 různých originálních zdrojových
  JPEG/bin**. Všechny zůstaly shodné s manifestem.
- `night-evidence/night-mask-audit.json`: **5556** zdrojových triangle centroidů
  vyhovuje konzervativní masce; **0** vyhovujících vodorovných ploch, **0**
  zelených pixelů vegetace a **0** bodů mimo okenní výškové pásy.
- Ruční kontrola původních projekcí a barevných heatmap obou fasád B6 potvrzuje
  návaznost na fotografované sklo. Střecha, trávník a podloží zůstávají bez
  světel. Heatmapa ukazuje všechny kandidáty před fiktivní obsazeností.
- GPU stránka `/docs/photogrammetry/night-preview.html` umožňuje měnit den/noc,
  vypnout emisi a přepnout B6 z obou stran, B5, B10 a celý areál. Diagnostika
  uvádí GPU a chyby kompilace. GPU kontrola a výkon celé produkční hry se mají
  uvést zvlášť v hlavním předávacím auditu; tato stránka je funkčně nesupluje.

## Přiznaná omezení

Původní fotogrammetrické fotografie mají stále zapečené denní osvětlení a
stíny. Tato vrstva je poctivě označený umělecký noční doplněk, **nikoliv úplné
fyzikální de-lighting/inverse rendering**. Světlé odrazy skla mimo konzervativní
masku zůstávají tmavé. Jemné tmavé okenní rámy mohou dostat část emise, protože
fotografie není sémantická mapa materiálů. Geometrická/barevná auditní pravidla
neprokazují klasifikaci každé větvičky či každého pixelu omítky.

Anotované jsou hlavní dlouhé fasády B2–B10. Nezaměřené koncové stěny, B1,
B11/B12 a interiéry obchodů se neosvětlují vymyšleným rastrem. Okupance skupin
je simulace. Skutečná současná výška svítidel ani stav rozsvícení není zjištěn.
Obloha, skutečný sun/moon okamžik, počasí a B6 vnitřní lampy zůstávají v jejich
samostatných herních systémech.
