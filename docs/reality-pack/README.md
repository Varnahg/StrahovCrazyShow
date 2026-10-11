# Reality Pack: doložené rozložení a přesvědčivější materiály

Balíček je zapojený do hlavní hry, nikoli pouze do modelových náhledů. Věrnost se posuzuje po jednotlivých prvcích vůči identifikovanému podkladu. Fotografie a panoramata slouží k inspekci; herní textury nejsou hromadně stažené screenshoty Google Street View nebo Mapy.com.

| Vrstva | Co hra používá | Podklady, náhled a omezení |
|---|---|---|
| Terén | ČÚZK DMR 5G, 4m vrcholy, shodné renderovací a fyzikální trojúhelníky | [Terén a parkoviště](terrain/README.md), [ortofoto/3D komparátor](terrain/preview.html) |
| Ulice a chodníky | Spojené polygony OSM, rozlišení povrchů, přechody, mapovaná svítidla; povrchy kopírují reliéf | [Audit ulic](../streets/README.md); šířky bez zdrojového údaje zůstávají odhadem, svítidla nejsou úplně zaměřená |
| Centrální parkoviště | Asfaltový dvůr, 73 interpretovaných čar, 24 reprezentativních míst, nápis Silicon Hill | Ortofoto IPR Praha 8. 6. 2024; značení je vlastní kreslená interpretace a obsazenost aut simulovaná |
| Fasády | Rozdílná čela a dlouhé strany, hlubší okenní moduly, štítová čísla, zvláštní typologie B12/Menzy/R-ka/stadionu | [Architektura a konkrétní fotografie](architecture/README.md), [atlas budov](../world-architecture/atlas.html) |
| Interiér B6 | Vstupní schody, recepce, podlažní chodby, pokoje, hygienické vybavení, původní Blender rekvizity | [B6](b6/README.md); orientační plán a historické typologické reference, nikoli kompletní aktuální zaměření B6 |
| Materiály a světlo | CC0 PBR kanály ve fyzickém měřítku, sklo a maskovaná okna, měkké skutečné stíny, atmosférická perspektiva | [Materiály a WebGL kontrola](materials/README.md); obecné materiálové rodiny, nikoli skeny konkrétních fasád |
| Vegetace | Mapované plochy a interpretované koruny; kmeny na terénu, tráva a listí reagují na vítr | [Vegetace](../vegetation/README.md); polohy korun nejsou přesné zaměření kmenů |

Výtvarným cílem je přirozenější architektura, měřítko, světlo a čitelné opotřebení inspirované kvalitními 3D hrami. Současné demo nemá skenované tváře, velkou knihovnu realistických pohybových klipů, plnou globální iluminaci ani detail velké komerční hry. Tato omezení nelze nahradit příslibem „Hogwarts Legacy v prohlížeči“.

Geometrie a kolize sdílejí `shared` data. Kontroly průchodu zahrnují venkovní reliéf, vstup B6 bez teleportu, schody, dveře a skutečné skleněné překážky. Souhrn běhů a GPU měření je v [ověření](../verification.md); samostatný hezký náhled není důkazem výkonu celé hry.
