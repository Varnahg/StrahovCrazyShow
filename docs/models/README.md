# Blender modely prostředí

Osm hotových modelů v metrech, s editovatelnými částmi v Blenderu a úsporným GLB exportem. Všechny vznikly vlastní geometrií; neobsahují fotografie, textury ani cizí modely. [Náhled celé sady](environment-preview.png) byl vykreslen v Blenderu z **opětovně importovaných GLB**, nikoli z odlišné ilustrační geometrie.

| ID | Rozměry X × Y × Z v metrech | Trojúhelníky | Materiály | Vhodné použití |
|---|---|---:|---:|---|
| `dorm-bed` | 2,04 × 0,82 × 0,94 | 308 | 3 | Demonstrační typový pokoj, dlouhá bočnice u zdi |
| `dorm-desk` | 1,20 × 0,77 × 0,62 | 352 | 2 | Pokoj či studovna, přední otevřená strana k hráči |
| `dorm-chair` | 0,514 × 0,860 × 0,538 | 532 | 2 | Stůl, studovna či klubovna |
| `dorm-wardrobe` | 0,98 × 2,31 × 0,633 | 600 | 2 | Typový pokoj, zadní strana u zdi |
| `dorm-nightstand` | 0,40 × 0,575 × 0,459 | 392 | 2 | Vedle postele, otevřená přihrádka směrem do místnosti |
| `dorm-wall-shelf` | 1,15 × 0,33 × 0,25 | 220 | 1 | Nad postelí, spodní hrana přibližně 1,45 m nad podlahou |
| `dorm-kitchenette` | 1,60 × 2,00 × 0,62 | 1 322 | 3 | Demonstrační kuchyňka, zadní strana ke zdi |
| `campus-bench` | 1,80 × 0,864 × 0,518 | 692 | 2 | U pěší cesty nebo sportoviště, mimo průchozí koridor |

Celkem **4 418 trojúhelníků a 310 352 bajtů GLB**. Každý model má jeden mesh a 1–3 materiálové primitives. Všechny používají běžný glTF 2 bez potřeby dekodéru a bez textur. Tyto hodnoty jsou audit formátu a geometrie; měření FPS ve hře provádí samostatný herní benchmark.

## Reference a přesnost

Postel, stůl, židle, stolek a police vycházejí z [pokoje zachyceného v roce 2016](https://media.cvut.cz/sites/media/files/content/photos/45cbe750-1f12-495b-98d7-47a7d17c33f2/1a0d26c4-1e5a-40f7-86b1-8399f384e3f6.jpg). Rozpoznatelné jsou nízká postel s dlouhou bočnicí, panelové podpěry stolu, kovová čalouněná židle, otevřená horní přihrádka stolku a dvě přečnívající desky nástěnné police. [První snímek stejné galerie](https://media.cvut.cz/sites/media/files/content/photos/45cbe750-1f12-495b-98d7-47a7d17c33f2/714b5818-d9b5-482e-97d2-1c9a7b30cd52.jpg) doložil vysokou skříň s oddělenými horními dvířky.

Kuchyňka vychází ze [sedmého snímku galerie 2016](https://media.cvut.cz/sites/media/files/content/photos/45cbe750-1f12-495b-98d7-47a7d17c33f2/1bd4563f-0594-4378-a02e-6254dce72499.jpg): nízká lednice vlevo, dvouvařič, otevřený prostor pod dřezem a horní dřevěné skříňky kolem bílých otevřených polic. Dřez má skutečně otevřenou prohlubeň a vyříznutou pracovní desku. Neobsahuje neviditelnou plnou desku přes otvor.

Lavička má nižší jistotu: [exteriérový snímek 2024](https://media.cvut.cz/sites/media/files/content/photos/4747a232-056d-41a1-8baa-a2255d7d7efb/11aa8468-49c4-4f9b-972f-4acb047ea157.jpg) ukazuje vzdálené tmavé lavičky s opěradly u oploceného sportoviště vpravo. Konstrukční spoje a přesné počty lamel snímek nerozlišuje, takže model zachovává typ a měřítko, ale nedeklaruje přesnou rekonstrukci konkrétní lavičky.

**Rozměry jsou modelářské odhady, žádný kus není zaměřený.** Blok v pokojové galerii není bezpečně identifikovaný a fotografie pocházejí z roku 2016; modely proto nejsou dokladem současného interiéru B6 ani nového vybavení B4 po rekonstrukci. Dřevo a čalounění jsou převedeny do [společné herní palety](../art-direction/ART_DIRECTION.md). Vstupní modul B6 v této sadě není, protože pro jeho jednotlivé stavební části nebyly doloženy dostatečné rozměry a tvary. Rozmístění místností nadále určuje půdorys B6, nikoli tyto modely.

## Integrace

Strojově čitelný seznam je v `public/models/environment/manifest.json`. `url` je cesta pro načtení ze serveru klienta, `sourceBlend` cesta z kořene projektu. `dimensions` jsou **X šířka / Y výška / Z hloubka**. `bounds` odpovídají skutečně exportovaným vrcholům.

- GLB je Y-up, předek nábytku směřuje k **+Z**. Záda ke zdi směřují k −Z. Postel je dlouhá podél X; bočnice leží na straně −Z, polštář u −X.
- Kořenový pivot je na podlaze v `[0, 0, 0]`; u police jde o její spodní opěrnou hranu, tedy po zavěšení posunout Y.
- `defaultRotation` je Euler XYZ v radiánech. Modely zachovat v jednotkovém měřítku.
- `collisionBoxes` obsahují **lokální střed a celé rozměry** v metrech. Pro Rapier cuboid vydělit rozměry dvěma a transformovat střed stejným natočením jako model. Vizuální GLB není náhradou serverových kolizí.
- Kolize jsou záměrně jednoduché a konzervativní, například prostor pod lavičkou. Nejsou přesnou simulací jednotlivých lamel a kování. Ověřit ve hře obcházení, pohyb kamery a kontakt s podlahou.
- Načíst jednou a opakované kusy instancovat; v interiéru je možné používat sdílené modely v sousedních pokojích. Nenačítat kopii pro každý kus.

## Reprodukce a ověření

Z kořene repozitáře v PowerShellu:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-environment.py
node docs/models/verify-environment.mjs --write
```

Skript znovu vytvoří osm `.blend` souborů s pojmenovanými samostatnými díly, osm GLB, manifest a kontaktní náhled. Samostatný Blender soubor `assets/blender/environment/environment-preview.blend` obsahuje pouze sestavu pro kontrolní render; do hry jej nenačítat.

[Audit GLB](environment-audit.json) čte přímo binární pozice a indexy, aplikuje glTF transformace a porovnává Y-up rozměry s manifestem s tolerancí 0,1 mm. Kontroluje 1 mesh, 1–3 materiálové průchody, skutečné trojúhelníky, nulové textury, platné kolizní kvádry a existenci editovatelných zdrojů. Audit neověřuje přesnost fyzického Strahova ani herní kolize za běhu.
