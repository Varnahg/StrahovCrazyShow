# Editovatelný originální fotogrammetrický master Strahova

`assets/blender/photogrammetry/strahov-ipr2023-master.blend` obsahuje **celý stažený výřez nejpodrobnější úrovně L16** původní fotogrammetrie IPR Praha z léta 2023. Nejde o odhad budov vytvořený podle několika fotografií. Podklad je původní integrovaná fotogrammetrická síť včetně povrchů, stadionu, bloků, hřišť a zachycené vegetace. Jednotlivé stromy zůstávají součástí skutečně snímané geometrie a atlasů; import nepřidává náhodné kopie stromů.

Zpětné ověření uloženého souboru: **PASS**, **2 588 objektů, 3 955 667 trojúhelníků, 11 867 001 původních vrcholů a 2 588 originálních atlasů**. Komprimovaný `.blend` má **233 080 977 bajtů**, SHA-256 `020eb74ce4b5068ceb9c5d7ff55ae9413e441fc582c088879940425123370ecf`. Každý lokální vrchol i obě UV vrstvy souhlasí s importovaným originálem; největší odchylka středu dlaždice způsobená float32 souřadnicí Blenderu je **0.00002604 m**. Žádný zdrojový soubor se nezměnil.

Zdroj: [IPR Praha – pražský fotogrammetrický mesh 2023](https://www.arcgis.com/home/item.html?id=92d2d376599c4fd2b6600ed46db7402e), [původní I3S vrstva](https://tiles.arcgis.com/tiles/SBTXIEUGWbqzUecw/arcgis/rest/services/praha2023_merged_WM/SceneServer/layers/0). Licence podle zdrojového záznamu **CC BY**, povinná atribuce **datový podklad © IPR Praha**. Zdrojová metadata jsou archivovaná ve stejné složce dokumentace. Zachycený stav pochází z léta 2023, nikoli z aktuálního zaměření roku 2026.

## Co master zachovává

- Každou nejpodrobnější L16 dlaždici se všemi původními trojúhelníky, jejich pořadím a orientací. Žádné svařování vrcholů, decimace, vynechání trojúhelníků nebo ořezání dlaždic na hranici herní mapy.
- Původní nepozměněné JPEG atlasy v jejich původním rozlišení. Materiály odkazují relativně na `public/models/photogrammetry/ipr2023`. Obrázky nejsou přebarvené, znovu komprimované, zmenšené ani zabalené jako další kopie do `.blend`.
- Původní float32 souřadnice každého vrcholu v atributu `ORIGINAL_I3S_POSITION` a původní atlasové souřadnice v UV vrstvě `ORIGINAL_I3S_UV`. Vrstva `UVMap` pouze převádí počátek obrázku pro Blender: `(u, 1-v)`.
- Source ID, SHA-256 geometrie i atlasu, původní feature IDs a jejich inkluzivní rozsahy trojúhelníků v uživatelských vlastnostech každého objektu. Scéna obsahuje licenci, atribuci, datum snímání, CRS, zeměpisný počátek a hash manifestu.

Osvětlení a stíny jsou už součástí fotografických atlasů. Materiály proto používají původní sRGB atlas přes emisní shader o síle 1, který nepřidává druhé smyšlené osvětlení. Tento master je archiv editovatelného zdroje; zdrojové atlasy samy o sobě nejsou fyzikálně rozdělená PBR sada albedo/roughness/normal a předstírat takové rozdělení by měnilo jejich význam.

## Zasazení a souřadnice

Jedna Blender jednotka odpovídá jednomu metru. Osy Blenderu jsou **X východ, Y sever, Z výška**. Pro hru platí `(game.x, game.y, game.z) = (Blender.X, Blender.Z, -Blender.Y)`.

Horizontální zdroj je EPSG:3857, výšky jsou Bpv. Původní středy dlaždic se vztahují k manifestovému počátku `50.08065 N, 14.39175 E`. Horizontální Mercatorovy metry mají převod `0.6417086829273079` do fyzických metrů; **výška se tímto faktorem nenásobí**. Výškový počátek je `326.392 m Bpv`. Každá dlaždice používá vlastní střed objektu a lokální vrcholy, aby se předešlo ztrátě přesnosti na milionových zeměpisných souřadnicích.

Tento zdrojový master nemá druhý terén pod původní sítí, dodatečně posazené procedurální budovy, herní vyříznutí B6 ani opravy povrchů pro ovladač postavy. Takové zásahy patří do oddělené odvozené herní vrstvy, kterou lze porovnat s nedotčeným masterem. Změny původní fotogrammetrie ukládejte jako novou pracovní kopii `.blend`.

## Reprodukce a ověření

V PowerShellu z kořene projektu:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/import-photogrammetry-blender.py -- --render-preview
```

Samostatné opakované ověření již uloženého masteru:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/import-photogrammetry-blender.py -- --verify-only
```

Importér po uložení **znovu otevře skutečný `.blend`** a čte všechna data zpět. U každého objektu porovná počty a pořadí trojúhelníků, lokální polohy, bitovou shodu originálních souřadnic a UV, převod UV pro Blender, polohu středu a metadata. Znovu spočítá SHA všech propojených originálních JPEG i geometrických souborů. Ověří, že není použitý decimační či jiný modifikátor, obrázky zůstaly externí a sRGB a zdrojový manifest se během importu nezměnil.

Konkrétní výsledky, velikost a SHA `.blend`, rozsah celé sítě a záznamy pracovní paměti jsou v [úplném strojovém auditu](blender-master-audit.json). Ukázkový [letecký render centrální části](evidence/blender-master-central-aerial.png) používá původní atlasy a krátký CPU render. Maska centrální části se používá jen při vykreslení ukázky a **neukládá se do masteru**; celý nejpodrobnější výřez zůstává ve scéně.

V ověřeném běhu Blenderu 5.2.2 trval import 37.5 s, uložení přibližně 8.4 s a celý import včetně nového otevření, číselného auditu a ukázkového renderu **93.4 s**. Pracovní paměť Blenderu na konci importu byla přibližně 1.16 GB, po opětovném otevření a kontrole 2.26 GB. CPU render centrálních 862 dlaždic v rozlišení 1024×768 trval 14.4 s. Ukázka byla také vizuálně otevřena a zkontrolována: atlasy správně navazují na geometrii, kampus obsahuje skutečné barvy kurtů, parkování, označení Silicon Hill, rozdílné koruny stromů a podélnou tribunu stadionu. Obraz ukazuje rovněž skutečné nedostatky leteckého zdroje, zejména hrubší drobné detaily a statickou fotograficky zachycenou vegetaci.

Jde o ověření importu a zachování zdrojových dat. Časy procesu, jeho pracovní paměť ani CPU render nejsou měřením FPS hry. Audit rovněž neprokazuje, že zdrojová letecká rekonstrukce nemá díry, rozmazané či zakryté fasády nebo zachycené dočasné objekty. Fotogrammetrie zachovává i tyto skutečné vlastnosti zdroje; jejich procházení a opravy pro hru se vykazují samostatně.
