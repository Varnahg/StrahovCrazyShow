# Fasády Strahova podle identifikovaných předloh

Tato část reality packu nahrazuje původní opakující se fasádní mřížku skutečně modelovanými rámy, špaletami, parapety, pilastry a různými typy koncových stěn. Zachovává původní OSM půdorysy; B6 zůstává dokumentovaný přibližný průchozí interiér, který dosud není přesně pootočen podle OSM.

Otevři [porovnávací scénu](http://127.0.0.1:5173/docs/reality-pack/architecture/preview.html) při spuštěném Vite. Každý pohled má přímo odkaz na konkrétní primární předlohu, datum a omezení. Screenshoty v této složce pocházejí ze skutečného Babylon/WebGL renderu. Porovnávací scéna má vlastní osvětlení a není výkonovým testem celé hry.

| Objekt | Co bylo přímo viděno | Co je interpretace |
| --- | --- | --- |
| B4 | [ČVUT, 20. 6. 2024, snímky 1, 2, 8](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov): šedý beton, malé páry oken, široké prázdné panely, modrobílá čtyřka. | Rozměry otvorů, umístění čísla a poměr stavebního modulu. Zavěšená cedule je zjednodušená na fasádní plochu. |
| Standardní dlouhá fasáda | ČVUT, stejné album, snímky 3, 6, 7, 11, 12: světlá omítka, hnědé čtyřdílné rámy, parapety, svislé pilastry, různě stažené žaluzie. | Sdílená typologie ostatních bloků. Samotné tyto snímky neprokazují číslo každého zobrazeného bloku. |
| B6 | [Google Street View, září 2025](https://www.google.com/maps/@?api=1&map_action=pano&pano=gWCshoWQgiJdy1QWcqe1eQ&heading=178.82123&pitch=20&fov=90): severní betonové pilíře, úzký zapuštěný pás schodiště, malé páry oken, bílá šestka na západním rizalitu, krytý vstup. [Wiki plán](https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg) lokalizuje vrátnici. | Kóty, výškové osazení a konstrukce schodiště nejsou zaměřené. Západní vstup je přibližně x −7,6 / z −73,5 m s nejistotou 2 m. Rozvržení interiéru řeší samostatný modul. |
| B7 / 007 | [Google Street View, květen 2024](https://www.google.com/maps/@?api=1&map_action=pano&pano=2UCXwe4UgzW5bAoI5ZFssA&heading=348.27243&pitch=12&fov=90): jižní čelo, číslo 7, tmavý vstup 007 pod schodištěm na východní straně. | Souřadnice klubu x 68,3 / z −31,5 m má nejistotu asi 4 m. Klubový portál je zavřená dekorace; není zde hotový průchozí interiér. Západní recepce je jiný vstup. |
| B8 | [Wiki B8](https://wiki.sh.cvut.cz/kolej/bloky/blok_8) výslovně identifikuje červený blok naproti menze; ČVUT snímek 10 ukazuje červený akcent a jiné rámy. | Rozsah červeného opláštění je typologický odhad. Není tvrzeno, že celý anonymní snímek byl jednoznačně lokalizován. |
| B12 | [Ondrej.konicek, 6. 10. 2009, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Strahov,_studentsk%C3%A1_kolej_%C4%8D.12.JPG): úzká vysoká okna s příčkou a nápis 12 B. OSM uvádí tři podlaží. | Pouze historická okenní typologie. Poškození omítky z roku 2009 není kopírováno jako současný stav. |
| Menza | ČVUT snímek 9: vysoké kovové prosklení, horní šedé panely, krémový obklad a modrý nápis MENZA STRAHOV. | Severočelní umístění prosklení směrem do kampusu a rozsah vstupní části jsou interpretace. Schody nejsou zaměřené. |
| Potraviny / R-ko | [Mapy.com / Cyclomedia, 1. 6. 2023](https://mapy.com/cs/zakladni?q=Recharging%20bar&source=firm&id=13296995&pid=101883310&newest=1&yaw=4.343&x=14.3938139&y=50.0812633&ds=2&z=17&ovl=8): východní štít, čtyři malé horní otvory, dolní zamřížované ventilace, malovaná fasáda a kulatý kouřovod. | Přesné muralové dílo neznámého autora není kopírováno. Vlastní barevné plochy jen naznačují charakter malované stěny. Vstup R-ka není tímto záběrem prokázaný. |
| B1 | Identita administrativy a nízký složený půdorys z existujícího katalogu a OSM. | Dosud chybí identifikovaná prohlédnutá fasádní fotografie. Nejsou přidána vymyšlená kolejní okna nebo detail recepce. |

## Společné rozměry a integrace

- `shared/data/facade-reality.json` obsahuje zdroje, rozlišení jistoty, parametry typů a `landmarkEntrances` pro mapu a události. Souřadnice R-ka jsou obchodní POI, nikoli prokázané dveře.
- B6 má 22 fasádních modulů na délce 70 m, tedy rozteč 3,1818 m. Jde o kalibraci modelu, ne zaměřený počet pokojů. Okno má interpretované rozměry 2,18 × 1,50 m, parapet 0,85 m, nadpraží 2,35 m. Západní okna se oříznou u z −70 a nezasahují do rizalitu recepce.
- `buildArchitectureReality({ scene, baseElevation? })` nahradí staré vnější `building()` a fasádní část `b6()`. B6 fyzická/interiérová geometrie zůstává společná. Staré vnější plochy se nesmějí vykreslovat pod novou slupkou.
- `baseElevation(x, z, building)` vrací celkovou výšku základu jednou. Renderer nepřičítá skrytý offset; pro B6 hlavní integrace přidává interpretované zvýšení 0,9 m právě zde, stejně jako u sdíleného interiéru. Výška je odhad šesti stupňů po 0,15 m, nikoli zaměření.
- Vrácený `update(position, quality)` přepíná detail s hysterezí. Nízká kvalita používá hranici 55 m plus poloměr objektu a 9 m hysterezi. Všechny okenní detaily nejsou aktivní v celém kampusu současně.
- B6 má vlastní průhledné varianty skla (`metadata.realityGlass`, `block: 6`), ostatní neprůchozí domy mají neprůhledné sklo, aby neukazovaly nehotový interiér. Celohrový modul může přidat oblohový odraz a Fresnelův efekt. Samostatná porovnávací scéna tento celohrový odraz zatím nemá.
- Materiály omítky a betonu označují `surfaceKind`, UV opakování je 3 m. Fasádní atlasy se nesmějí přepsat uniformním povrchovým materiálem, protože obsahují přesné okenní masky. `nightWindows` rozsvěcuje pouze simulované části skla.
- Žádná nová pochozí veranda, schod nebo jiná překážka nebyla umístěna mimo společnou kolizní geometrii. Svícení oken je demonstrace, není údajem o obyvatelích.

## Modely, textura a ověření

`scripts/create-architecture-reality.py` v Blenderu 5.2 vytvoří dva editovatelné `.blend` a `.glb` moduly (čtyřdílné okno a malé betonové okno) i deset vlastních bezešvých diffuse/normal PNG. Fotografie nejsou texturami. Moduly slouží jako editovatelný zdroj; hra stejné rozměry batchuje v Babylonu s nižším počtem trojúhelníků. Není tvrzeno, že hra načítá tyto dva GLB místo batchů.

Spusť:

```powershell
pnpm exec tsx --test tests/architecture-reality.test.ts
pnpm exec tsx docs/reality-pack/architecture/audit.ts
```

Pět testů ověřuje rozteč a meze oken, severní čelo, rozdílný nízký typ B12, správnou polohu 007 s nejistotou a skutečnou absenci trojúhelníků zakrývajících průchod recepce. GPU kontrola v porovnávací scéně odhalila a opravila opačný výchozí winding Babylon RH, zrcadlené textové UV, násobení barev skla a černou ceduli z nepodporovaného tříciferného hex zápisu. Zkontrolovány dlouhá fasáda, severní čelo, B4, Potraviny a noční masky.

`audit.json` uvádí skutečné počty geometrie a SHA-256 souborů i GLB. NullEngine audit je pouze kontrolou geometrie, nikoli měřením GPU FPS. Výkon celé produkční hry, průchod interiérem a síťové relace musí být ověřeny hlavním integračním během a zapsány v `docs/verification.md`.

`browser-qa.json` zaznamenává praktickou vizuální kontrolu na Intel UHD Graphics 630 / ANGLE D3D11, WebGL 2.0, canvas CSS i interně 970 × 720. Pět uložených screenshotů je důkazem těchto konkrétních záběrů. Nejsou měřením 30 nebo 100 skutečných relací.

Známá omezení: chybějící kompletní per-fasádní fotoprůzkum, odhadované konstrukční rozměry, neověřená orientace prosklení menzy, zjednodušené závěsy čísel, chybějící zaměřený terén a přesné vnější schody. Tato konkrétní sada sama o sobě nezajišťuje atmosféru ani technickou úroveň Hogwarts Legacy; osvětlení, vegetace, postavy a okolní terén řeší integrované herní moduly.
