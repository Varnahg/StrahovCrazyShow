# Čisté jednotlivé stromy podle předlohy

Změna z 11. 10. 2026 vrací do hry samostatné herní stromy. Historický letecký sken IPR slouží jako **vodítko tvaru**, jeho trojúhelníky ani zapečené stíny, tráva, auta a kusy chodníků se do stromového modelu nepřebírají.

Zdrojový katalog obsahuje **110 kandidátů**, současná bezpečná pravidla umístění zařazují **109 stromů**. Jde o 47 zachovaných mapových uzlů OSM a 62 interpretovaných korun. Filtr odmítá středy v budovách a komunikacích. Žádný odmítnutý strom se náhodně neposouvá na jiné místo.

Každý strom má stabilní zdrojové ID, vlastní `TransformNode`, samostatně vytvořenou geometrii kmene, větví a koruny i tři uchované úrovně detailu. Sdílejí se pouze materiály. Barva, koruna a větvení nevznikají načtením jedné koule a jejím přeměřováním: geometrie má samostatný deterministický seed, asymetrii, obrys v 16 směrech, rozměry a orientaci. Detailní zdroj zůstává v editovatelném Blender souboru.

## Co je doložené a co je interpretace

- Poloha pochází z konkrétního OSM uzlu, nebo z ručně anotovaného středu koruny na [ortofotu IPR z 8. 6. 2024](https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer). Střed letecké koruny není přesně zaměřený kmen; uvádíme až 2,5 m nejistoty.
- Měkký obrys koruny se čte ze zelených pixelů původního ortofota. Zelené body [IPR modelu z léta 2023](https://www.arcgis.com/home/item.html?id=92d2d376599c4fd2b6600ed46db7402e) poskytují orientaci/asymetrii pomocí PCA a orientační výšku nad DMR. 106 kandidátů má dostatek oddělených zelených bodů; u ostatních zůstává přiznaný herní odhad. Metoda může zachytit sousední korunu, proto výsledek není tvrdě vynucovaná kopie skenu.
- Holý strom před B6 a jehličnany jsou zvlášť popsané podle siluety na dodaném Street View a ortofotu. Severní jehličnan je v katalogu, ale jeho odhadnutý střed neprošel bezpečnou mapovou výlukou; záměrně ho nepřesouváme náhodně. Přesné větvení ani botanický druh tím nejsou změřené.
- U neověřených stromů používáme obecnou listnatou podobu. Katalog nenabízí falešné druhové názvy. Historické snímky z let 2023/2024 a dodaný Street View mohou ukazovat odlišný stav než současnost.

Záznamy `shared/data/tree-reconstruction.json` uchovávají zdrojové uzly, počet použitých zelených bodů, data pořízení, SHA původního manifestu/ortofota, parametry a nejistoty. Nejde o kompletní současnou dendrologickou inventarizaci Strahova ani přesnou fotogrammetrii jednotlivých větví.

## Materiály a zasazení

[ambientCG LeafSet001](https://ambientcg.com/view?id=LeafSet001) poskytuje původní 2K listový atlas a [LeafSet019](https://ambientcg.com/view?id=LeafSet019) samostatný jehličnatý atlas s neprůhledností, normal mapou a drsností; poskytovatel uvádí techniku Approximation. [Bark012](https://ambientcg.com/view?id=Bark012) je obecná 2K textura kůry vytvořená povrchovou fotogrammetrií. Zdroje mají [CC0 licenci](https://docs.ambientcg.com/license/), nesimulujeme tím určení konkrétního strahovského druhu. Původní stažené kanály se ukládají beze změny s SHA v `texture-manifest.json`. Jehličnany mají vlastní větvení a průhledné shluky jehličí, nikoli listnatý atlas přelepený na kužel.

Runtime používá PBR s alpha testem listí, oboustranným osvětlením, správným sRGB převodem barvy a lineárními normal/roughness kanály. Babylon může provádět sRGB převod přímo ve formátu GPU textury; proto samotné `gammaSpace=false` u barevné textury neznamená chybějící převod, pokud má `colorHardwareSRGB=true`.

Každý kořen se umísťuje přímo na `groundHeight(x,z)` stejného nativního terénu jako fyzika. Strom stojí svisle a báze kmene se mírně zapouští (4 cm), aby se na šikmém povrchu nevytvářela bílá mezera. Export `treeTrunkCollision` dává rendereru/fyzice jednotný poloměr kmene a polohu. Výkyv listí používá skutečný směr proudění a sílu větru; při nule je posun nulový. Větrný PBR shader má odpovídající `ShadowDepthWrapper`, takže se nedeformuje pouze obrázek listů bez stínu.

## Detail a reprodukce

Nejbližší strom vždy používá nejpodrobnější uloženou geometrii. Přepínání detailu nemění ID, polohu ani kořen. Dosah vysokého detailu je 22/30/40 m pro low/medium/high, prostředního 75/100/135 m. Za hranicí se strom neztratí, zůstává třetí model. Travní rozpočty 16/24/32 aktivních dlaždic se touto změnou nemění.

Generování z kořene projektu:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/tree-pack-fetch.py
node --import tsx -e "import('./shared/world.ts').then(m=>require('fs').writeFileSync('.cache/tree-pack/placements.json',JSON.stringify(m.TREES)))"
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/tree-pack-reference.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-vegetation.py
pnpm exec tsx --test tests/vegetation-realistic-pack.test.ts tests/vegetation.test.ts
```

`tree-pack-reference.py` čte původní lokální zdrojové soubory; je potřeba dříve získaný manifest, IPR node geometry/textures, DMR a ortofoto. Generátor nesmí být spuštěný souběžně s kontrolou SHA nebo zmrazením finálního snapshotu. Vizuální komponentový náhled je na `/docs/vegetation/realistic-pack-preview.html`; neobsahuje celou hru a jeho FPS nejsou výkonnostním důkazem finální scény. Aktuální počty trojúhelníků, velikosti a SHA ukládá `realistic-pack-geometry-audit.json`.

## Ověření

Cílené testy kontrolují původ a nezměněné kanály, skutečný GLB a Blender SHA, unikátní vertex data každého ID, uchované úrovně, absenci listů u holého stromu, umístění, společný poloměr a zachované limity trávy. Reálný WebGL náhled ověřuje shader, alpha hrany, PBR kanály, nativní výšku kořene a jednotlivé podoby; obrázky a JSON jsou ve vedlejších souborech `realistic-pack-*-browser.*`. Výkon celé produkční hry musí znovu změřit integrační audit; stará FPS se na tento pack nepřenášejí.
