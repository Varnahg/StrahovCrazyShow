# Fasádní hloubka a návaznost střechy R-ka — 2026-10-12

Pracovní větev `codex/campus-material-depth`, výchozí commit
`76ae037be933817ec7dc60935e684de10f323657`. Jde o odvozenou runtime geometrii;
původní fotografie, OSM body, fotogrammetrie a archivované GLB se nemění.
Tento záznam dokládá CPU geometrii a fyziku. **Neobsahuje GPU vizuální PASS ani
měření FPS.** Praktické porovnání celé hry řídí hlavní vlákno.

## Podklady a interpretace

- [IPR Praha, léto 2023, původní západní fasáda B6](../west-original.png),
  [provenience a SHA originálů](../study.json): viditelné hlubší okenní otvory,
  světlé omítnuté pilastry, tmavší základ a subtilní hrana střechy.
  **datový podklad © IPR Praha**, CC BY. Fotografie má zapečené světlo, stromy
  a vady rekonstrukce; ty se do geometrie ani albeda nekopírují.
- [Identifikovaný detail B12, 2009](../../../world-architecture/media/b12-detail-2009.jpg),
  Ondrej.konicek, CC BY-SA 3.0: profil ostění, úzké rámy, transom a plechový
  parapet. Staré poškození omítky není vydáváno za současný stav.
- [Stávající fasádní identifikace a odkazy](../../architecture/README.md),
  `shared/data/facade-reality.json`: zachovány všechny schválené otvory,
  jejich typologie, půdorysy a nejistota přesných dveří R-ka.
- Okenní bevel **12 mm** je konzervativní konstrukční herní interpretace,
  nikoli nové zaměření. Existující hloubka ostění 18–20 cm a posun rám/sklo
  17 mm se zachovávají. Nejsou přidána náhodná okna, dveře ani kolejní prvky
  na stadion.

## Opravená mezera R-ko

Hlášení celé hry: hráč `(130.63, −53.46)`, pohled sever; též
`(100.68, −54.16)`. Výchozí screenshot je v primárním checkoutu
`.cache/gameplay-quality-20261012/u1-rko-south.jpg`.

Fasáda a stěnové kolidery používají medián výšek původního **uzavřeného** OSM
prstence. Střecha předtím používala prstenec po odstranění opakovaného bodu.
Na tomto svažitém půdorysu to dává jiný medián:

| Hodnota | Výška světa, m |
| --- | ---: |
| Základ fasády / stěnové fyziky | −3.9207787818 |
| Dřívější základ střechy z otevřeného prstence | −3.6059025526 |
| Horní hrana stěny, výška budovy 3 m | −0.9207787818 |
| Dřívější střecha včetně přídavku 0.025 m | −0.5809025526 |

Skutečná mezera byla **0.3398762292 m**. Není to problém cullingu ani LOD.
Střecha nyní používá původní body pro základ a končí přesně na horní hraně
stěny; jen triangulace používá otevřený prstenec. Lem spočívá na střeše.
Stejná `roofData` nadále vstupují do rendereru i oboustranné Rapier kolize.
Vydání musí aktualizovat klienta a server společně.

## Integrované detaily

- Near ostění dostalo vnitřní sraženou hranu uvnitř původního otvoru.
- Původní plochy rámů mají vnitřní boky až ke sklu; šikmý pohled již nevidí
  chybějící 17mm propojení.
- Pilastry mají oba boky a horní plochu ve stávajícím 7.5cm rozsahu.
  Oba boky jsou omítka; dřívější tmavý náhradní materiál jednoho boku se
  nesnaží napodobovat trvalý stín.
- Existující 3cm vystouplý střešní lem má horní návrat ke zdi.
- Šikmé parapety mají geometrický normál a metrické UV. Svislé ostění
  používá svou skutečnou délku, ne šířku okna.
- UV základových soklů používají vodorovné metry a světové Y po 4 m na
  opakování. Dřívější `0..1` přes celou hranu a výšku natahovalo texturu.
  Poloha, indexy, normály a dolní hranice terénního soklu jsou beze změny.

`openingRing` sjednocuje bevel, ostění a rámový návrat; `metricFacadeFrame`
počítá normál/UV pouze při sestavení statické geometrie. Nevznikl nový shader,
materiál, observer, dlouhodobý registr ani práce za snímek. Detail sdílí
dosavadní per-building/per-material dávky a standardní stínové kandidáty.
Přijímání stínů nastavuje stávající `Cinematic.selectCasters`; nové plochy jej
nevypínají. Shaderový výsledek vyžaduje samostatnou GPU kontrolu.

## Skutečný rozpočet geometrií

[Úplné porovnání](geometry-budget.json) vzniklo ze současného builderu a
nepozměněného builderu z výchozího commitu v Babylon NullEngine. Zahrnuje
120 budov a 3258 oken.

| Všechny vytvořené geometrie | Před | Po |
| --- | ---: | ---: |
| Near trojúhelníky | 109483 | 166237 |
| Far trojúhelníky | 10927 | 10927 |
| Meshe obou LOD dohromady | 1104 | 1104 |
| Materiály v samostatné testovací scéně | 41 | 41 |

Celý near pack přidal 56754 trojúhelníků; zůstává pod původním limitem
180000. Near/far prahy a hystereze se nemění. Následující čísla jsou **LOD
enabled kandidáti před frustum/shadow cullingem**, nikoli počet skutečných
GPU draw calls. Ve všech 12 kombinacích místa/kvality zůstal počet enabled
meshů přesně stejný.

| Low pozice | Near budovy | Trojúhelníky před | Po | Přírůstek |
| --- | ---: | ---: | ---: | ---: |
| Spawn `(110,12)` | 3 | 30607 | 41259 | 10652 |
| R-ko jih `(130.63,−53.46)` | 3 | 21075 | 26585 | 5510 |
| B7 východ `(72,−52)` | 4 | 30351 | 40865 | 10514 |
| B6 sever `(1,−95)` | 3 | 39895 | 55557 | 15662 |

To není optimalizační ani FPS tvrzení. Zvýšení statických trojúhelníků je
vědomá cena blízké geometrické hloubky; ověřit na celé hře a cílové GPU.

## Ověření a omezení

- **32/32 cílených testů PASS**, exit 0, 8.30 s:
  `architecture-reality`, `architecture-depth`, `market-roof-continuity`,
  `building-foundation`, `building-roofs`, `campus-exterior`,
  `world-asset-identity`, `transit-navigation-source`.
- Nové regrese: jednotkové normály, shoda skutečné trojúhelníkové normály a
  RH windingu, nekolidující tangentový UV základ, skutečný šikmý ray proti
  boku rámu B12, LOD reuse/disposal, obě R-ko LOD a Rapier paprsky shora/zdola,
  metrické sokly B7/R-ko. Zachovány testy vstupu B6, oboustranných střech a
  průchodných bran.
- Scoped TypeScript `--noEmit` PASS; `git diff --check` PASS.
- `scripts/rebuild-campus-transit-navigation.ts` skutečně znovu spustil
  generátor. Všech **18 tras a 9 cílů přesně beze změny**, změnil se pouze
  source hash `shared/campus-exterior.ts`; žádná ruční hashová výjimka.
- LOD přepínání nevytváří nové meshe. Controller odstraní své geometrie a
  prázdné asset roots; původní materiály má dosavadní scene lifecycle a PBR
  náhrady vlastní SurfacePack. Nový detail nepřidává zdroje této životnosti.
- Archivované GLB nebyly přegenerovány; změna je ve skutečném runtime builderu.
  Detail a střechu musí ještě posoudit praktická celohrová GPU kontrola,
  zvláště šikmý denní pohled, spoj střechy R-ka, přepnutí LOD a noční světlo.
  Neobsahuje nové měření FPS, GeForce 60 FPS PASS ani nový plný checkpoint.

Finální runtime/test SHA jsou v [source-freeze.json](source-freeze.json).
