# Skutečný terén, centrální asfalt a nápis Silicon Hill

Balíček přidává skutečný výškopis, společnou geometrii vykreslení/kolizí a fotograficky identifikované detaily centrálního parkoviště. [Komparátor ortofota a 3D modelu](preview.html) běží přes lokální Vite na `/docs/reality-pack/terrain/preview.html`. Jeho budovy jsou pouze kontrolní hmoty; vzhled fasád se ověřuje v celé hře.

## Primární podklady a jejich význam

- [ČÚZK DMR 5G – oficiální veřejný ImageServer](https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer): skutečná výška terénu bez budov a vegetace, F32, původní rastr služby 2 m, Bpv / Baltic 1957, vertikální EPSG 8357. Export 10. 10. 2026 převzorkuje terén na pravidelné 4m vrcholy. Služba uvádí celostátní pořízení lidarových dat 2009–2013 a přesnost 0,18 m v otevřeném / 0,3 m v zalesněném terénu. Datum aktuálního konkrétního místního listu služba neposkytuje. Nezaměňujeme ho za rok 2023 nebo čerstvé zaměření Strahova. Licence [CC BY 4.0](https://ags.cuzk.gov.cz/opendata/), atribuce © ČÚZK, upraveno.
- [IPR Praha, ortofoto 8. 6. 2024](https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer): skutečná přítomnost centrálního asfaltového dvora, nápisu Silicon Hill a parkovacích řad. Vstupní snímek, extent, datum, licence CC BY 4.0 a SHA-256 jsou v `docs/streets/ortho-georeference.json`. Interpretace zůstávají přibližné, se zdrojovými pixely a reprojekcí, nikoli geodetickým zaměřením.
- [OSM way 155743958](https://www.openstreetmap.org/way/155743958) a již importované `shared/data/streets.json`: půdorys centrálního parkování a spojené mapované komunikace. Fotografická interpretace se proti existujícím povrchům odečítá přes GIS, takže přidává jen **66,367 m²** chybějících okrajů a nezakládá druhou překrývající se asfaltovou plochu.
- [IPR popis nového DTM z roku 2023](https://geoportalpraha.cz/data-a-sluzby/clanky-a-projekty/3D-model/3D-model-dtm) byl prověřen, ale veřejná image directory nabízela stínovaný reliéf, sklonitost a výšku terénu **s budovami**. Ty se nepoužily místo čistého terénu. ČÚZK `getSamples` vrátil 403; veřejně funkční `identify` a `exportImage` poskytly potřebná data bez účtu, klíče či obcházení přístupu.

Archivovaný F32 TIFF `dmr5g-strahov-4m.tif`, služební metadata, žádost, skutečně vrácený extent a SHA jsou u tohoto návodu. `shared/data/terrain-grid.json` má 131 × 83 vrcholů, x −160 až 360 m, z −180 až 148 m. Číselné hodnoty **310,730–339,621 m Bpv** nejsou vytvořené z fotografického stínu nebo náhodného šumu.

## Výšky a společná fyzika

Počátek mapy je 50,08065 N / 14,39175 E; +X východ, +Z jih. Referenční DMR výška u západního vstupu B6 (x −7, z −73) je **326,392 m Bpv**, tedy herní y = 0. Není to zaměřená výška prahu. `sourceGroundHeight` zachovává surový zdroj; `groundHeight` je přesná trojúhelníková interpolace se stejnou diagonálou NE–SW jako Rapier.

Existující schematický interiér B6 a suterén mají explicitní herní základovou adaptaci: obdélník x −12 až 20, z −96 až −16 je rovný na y = 0 a na čtyřmetrovém okraji přechází do DMR. Zdrojové vzorky se nepřepisují. Toto je známé herní přizpůsobení, nikoli tvrzení o přesné skutečné terénní úpravě kolem budovy.

`createTerrainTiles(GROUND_RECTS, coverage)` zachovává otvor B6 podle sdílených obdélníků. U oříznutých dlaždic vzniká přesný trojúhelníkový mesh, protože oříznutí heightfieldu na x = −7 by jinak změnilo diagonály a výšky. Doporučená jednoduchá integrace používá jeden společný collision mesh:

```ts
const tiles = createTerrainTiles(GROUND_RECTS, coverage);
const collision = terrainCollisionData(tiles);
world.createCollider(RAPIER.ColliderDesc.trimesh(
  collision.vertices, collision.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
));
buildTerrain({ scene, rects: GROUND_RECTS, bounds: coverage });
buildRealityGround({ scene });
```

Vykreslení a kolize mají stejné trojúhelníky; collision export pouze obrací winding pro skutečné matematické normály Rapieru. `drapeTriangles` řeže komunikace, parkování, přechody, lampové světelné plochy a landcover po **každém podkladovém terénním trojúhelníku**, takže velké polygony nepřeklenou svahy. Drobné slivery pod 1 mm² se odstraňují; komunikace také odstraňují slivery vzniklé rozdílem centimetrového zaokrouhlení půdorysů a milimetrového zaokrouhlení GIS povrchů.

Lampy a jejich kolize sdílejí `lamp.groundY`; každý strom je osazen na `groundHeight`; každé stéblo má vlastní terénní výšku a normálovou orientaci. Strom zůstává svislý ve směru gravitace. Vítr koruny pracuje s lokální výškou modelu, takže záporná herní y neznamená nepohyblivý strom. Při nulovém větru zůstává pohyb nulový.

Budova má jeden vodorovný anchor `buildingBaseHeight(points)` (medián terénu v obvodových vrcholech), nikoli křivý pás oken. `buildingFoundationData` vytváří sokl až pod lokální terén. Skutečné výšky podlaží, prahů, obrub a venkovních schodišť nejsou z těchto dat určené; vyžadují další podklady nebo zaměření.

## Parkoviště a označení

`shared/data/reality-ground.json` uchovává zdrojové pixely každé interpretace. Nápis je na x **89,043–122,412**, z **−4,927–3,291**. Text a jednoduchá silueta jsou vlastní kreslená aproximace skutečně viditelného značení, nikoli screenshot použitý jako herní textura nebo přesný vektorový branding. Má mipmapy a správně ověřené UV, takže se neobrací vzhůru nohama.

Data obsahují 73 interpretovaných dělicích čar a **24 reprezentativních parkovacích míst**. `PARKING_SLOTS` jsou určené pro simulované dekorativní vozy se sdílenou kolizí; nejsou živým stavem obsazenosti, identitou nebo přesným typem aut z fotografie. Texturování povrchů může kořenový renderer nahradit přes `material.metadata.surfaceKind` a `uvMetresPerRepeat` (komunikace 4 m, landcover 5 m).

Pro vegetaci se kromě původních mapovaných povrchů odmítá i `isRealityGroundSurface(x,z)`. Mesh metadata pro osvětlení: `shadowCaster`, `depthCaster: 'opaque' | 'alpha-test' | false` a `windDeformed`. Tráva má shadow caster vypnutý kvůli rozpočtu; koruny označují nutnost správné alpha test / wind varianty stínového shaderu.

## Ověření a hranice

`pnpm exec tsx --test tests/terrain.test.ts tests/streets.test.ts tests/vegetation.test.ts` ověřuje skutečné raycasty Rapieru, nezavřený suterén, styk povrchů, zachované otvory, nativní Babylon winding, průchod postavy přes centrální dvůr a klidové chvění pod 3 mm. Kompletní herní testy, produkční build, izolovaný multiplayer a GPU/FPS celé hry integruje a předává kořenový tým.

`pnpm exec tsx docs/reality-pack/terrain/verify.mts` zapisuje `audit.json` s hashi zdrojů, počty trojúhelníků a skutečnou maximální chybou výškového raycastu. **NullEngine zde není důkaz FPS.** Praktická WebGL kontrola proběhla v Chromium na komparátoru; screenshoty `browser-parking.jpg` a `browser-terrain.jpg` dokazují načtenou geometrii a čitelný nápis. Klik do skutečného místa nápisu na ortofotu vrátil x 105,1 / z 0,1 a 323,34 m Bpv. Náhled byl zavřen, aby nespotřebovával GPU při měření hlavní hry.

Audit 10. 10. 2026: terén 20 121 trojúhelníků; komunikace, přechody a svítidla 61 929 v osmi meshech; landcover 19 027 v šesti meshech. Celkem 2 983 výškových raycastů a 27 kontrol suterénní výluky, maximální **numerický rozdíl** render/kolize 0,0184 mm. Toto číslo popisuje shodu herních systémů; **nezlepšuje** původní decimetrovou přesnost DMR ani 4m prostorové rozlišení exportu.

Reprodukce dat:

```powershell
# Python s Pillow, veřejný F32 export ČÚZK:
python scripts/fetch-terrain.py
# Python s Pillow a Shapely (v ověřené místní instalaci Python 3.13 z Blenderu
# a .cache/street-python); offline pixelové interpretace a GIS difference:
python scripts/fetch-terrain-ground.py
```

Ověřená místní cesta k druhému interpretru je `C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe`. Jeho GIS knihovny jsou instalované do projektové `.cache/street-python`; na čistém stroji použij Python stejné verze a `python -m pip install --target .cache/street-python pillow shapely`. Běžný lokální start hry Python ani GIS knihovny nepotřebuje, protože výsledná data jsou součástí projektu.

Terénní rastr 4 m zachytí skutečný reliéf kampusu, ale ne milimetrové obruby ani schody. Centrální parkování a nápis jsou doložené z 8. 6. 2024; nové stavební změny po tomto datu se z fotografie nevyvozují. Počet svítidel a jejich generický vzhled zůstává omezený aktuálním OSM inventářem, nikoli kompletním zaměřením.
