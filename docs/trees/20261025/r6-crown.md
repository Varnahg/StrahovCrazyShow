# R6 celá B5 koruna

26. 10. 2026, KEY-62. Koordinátor po prohlédnutí nativního R6 ramene 3 přijal směr: lepší objem a mezery, celá koruna ještě nehotová. Nový disjunktní task zachovává původní experiment i jeho generátory neměnné. Jde o autorskou interpretaci, botanický druh B5 je neznámý.

## Průzkum a volba

Původní pinované osy mají kmen 0, osm hlavních ramen 1–8 a na každém 12 druhotných podstromů. Jejich dlouhé větve v pravidelných rozestupech jsou viditelné na skutečných R5/R6 kontrolních obrazech 0°/45°, s listy i bez. Zdrojem je R5 native, R4 metadata/osové JSON a původní tube/foliage generátory; nejde o nové zaměření místního stromu.

Porovnáno ponechání jedné změněné větve (neřeší zbytek koruny), kopie stejného vzoru všude (nová pravidelnost), změna hlavních os nebo kompletní regenerace (větší změna siluety a nová nejistota), změna listové hustoty/materiálů (míchání příčin), a individuální rigidní uspořádání existujících podstromů. Zvolena poslední varianta. Zachovává hlavní opěrné osy 0–8, root/collider, všechny fotografické listy a jejich velikost/UV/rank/material. Geometrické rozpočty a původní LOD populace zůstávají; nevzniká runtime cache/lifecycle.

Tabulka `CROWN_EDITS` je explicitní: ramena 1/3/5/8 mají 3 různě rozložené skupiny, 2/6 mají 4 a 4/7 mají 2. Rozteče, yaw i elevace se liší; horní 7/8 mají nižší elevaci a několik mírně klesajících konců. Parametry ramene 3 jsou přesně převzaté z přijatého pilotu. Celkem 96 rigidních transformací přenáší 5 856 potomků; stejné matice platí pro každý existující LOD i pozdější FAR podklady.

Změna kotvy je opět `sample(originalPrimaryAxis,t)` v původním indexovém parametru. Přesouvá se celý podstrom. `updated-axes.json` aktualizuje body a přímé `attachmentT`; výsledný source delta/metadata musí být svázán s pinovaným zdrojem. Původní R5 FAR subset zůstává známým omezením pro navazující atlasový krok. Nový pilot není runtime export ani GPU výkonový důkaz.

## Praktická rozhodnutí při kontrole

První explicitní tabulka měla v omezeném screeningu silných os pět nových křížení. Opraveny konkrétní směry 70, 131, 2388 a 3730; srovnané počáteční parametry a log jsou zachované v `plan-initial-crossings.json` a `prepare-initial-crossings.log`. Finální původní stav má 2, kandidát 0 křížení v testu depth ≤ 2, menší poloměr ≥ 15 mm, mimo přímého rodiče a první junction segment. Nejde o vyčerpávající kontrolu všech drobných průniků.

Nezávislý čtecí audit potvrdil přesný native LOD recept: `wood_lod(originalAxes,1/2)` ponechá 600/109 větví, původní pořadí, quady + dvě ngon čela. Neimportuje se `build_pilot.py` s vedlejšími zápisy. Pruning se nepřepočítává z nových os. Původní `t` zjednodušených bodů se obnovuje ze zdrojových knotů a původních junctionů, nikoli normalizovaným indexem nového pole.

První native běh odhalil child 4096 na hlavní ose 6: při navrženém t=.72 byl FAR offset 38,793 mm, konzervativní inscribed radius 36,505 mm. Porovnání okolních kotev (`junction-probe.log`) vedlo k t=.69, které zůstává ve stejné skupině; poměr k vnitřnímu poloměru klesl na 0,889. Původní selhání zůstává v `build-failed1-far-junction.log`; žádný původní LOD mesh nebo pruning se kvůli tomu nemění.

## Ověřený výsledek

`tests/tree-r6-crown.test.ts`: **4/4 PASS**, úzký TypeScript a JS syntax check PASS. Testy kontrolují všech 96 disjunktních transformací, ochranu os 0–8, úplná napojení aktualizovaných os, nezměněné parametry přijatého ramene 3 a společné transformace odpovídajících LOD rohů. Skutečný native audit a znovuotevření pak ověřují celý source model, nikoli pouze fixture.

| LOD | Zachované větve | Fotografické listy / ranky | Listy s vlastní původní dřevěnou větví | Původně odstraněná vlastní větvička |
| --- | ---: | ---: | ---: | ---: |
| Near | 5 865 | 82 100 / 16 019 | 82 100 | 0 |
| MID | 600 | 82 100 / 16 019 | 10 413 | 71 687 |
| FAR | 109 | 16 383 / 3 214 | 149 | 16 234 |

Celá native topologie, vertex počty, UV, rank atributy, materiálové sloty a původní LOD populace jsou zachované. Near/MID fotografické komponenty a jejich transformované rohy jsou přesně shodné. FAR zachovává stejné source indexy, nové komponenty se neztrácí. Všech 82 100 near podpor splňuje `max(8mm,supportRadius+5mm)`, max. poměr 0,756. Max. změna vzdálenosti k vlastní větvi je near/MID/FAR 0,463/0,412/0,388 µm. Max. změna párové vzdálenosti listových vertexů je 1,155 µm, v rámci odůvodněné Float32 tolerance 5 µm.

**Nižší LOD nejsou nově anatomicky kompletní.** Již původní MID/FAR odstraňují jemné podpůrné větvičky a u ponechaného zjednodušeného dřeva mohou překročit near podporový limit. Kandidát zachovává stejný pruning a původní podporové vzdálenosti do uvedených numerických tolerancí. FAR proto zůstává řídký a v blízkém studiovém pohledu zřetelně nevhodný; navazující atlasový krok se tím nenahrazuje.

Ponechané přímé junctiony mají počty 96/95/67. Konzervativní max. offset vůči native osám je 1,712/11,524/34,770 mm. Následný reopen ověřil **všech 258 kořenů uvnitř skutečné rodičovské polygonální trubice** pomocí solid-angle winding nad Blender `loop_triangles`, nikoli jen neznaménkovou vzdáleností k povrchu. Aktualizované leaf kotvy souhlasí se svými novými osami do `4.08e-15 m`, všechny source branch junctiony do `5.48e-15 m`.

Near bounds před změnou: `[-7.408803,-9.228651,-0.035729]` až `[8.708602,8.631116,13.501535]`; po změně `[-7.561464,-8.928595,-0.035729]` až `[8.402913,8.779068,13.426849]` m. Největší přesah proti původní obálce je 153 mm, celková šířka i výška mírně klesly. Osy 0–8, jejich mesh vertex rozsahy ve všech LOD, root a collider zůstaly přesně stejné.

Native reopen **PASS**: 12 původních objektů a 6 kandidátních, 14 používaných packed images byteově shodných, původní sdílené materiály, žádné zastaralé custom normals; všech 12 kombinací kontrola/kandidát × LOD × úhel má celou korunu v záběru. Nezávislý čtecí audit implementace nenašel doloženou materiální chybu.

## Předané podklady a obrazové posouzení

- `assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend`, 118 879 646 B, SHA `1c212a55abf286894c874cd1da1b8f20b0ba30a59d02317c4180ba4580ce596c`. Kandidátní meshe mají pojmenované původní subtree vertex groups; zobrazuje se právě jedna dvojice LOD. Původní R5 objekty jsou uvnitř zachované.
- `.cache/trees-r6-crown-20261026/updated-axes.json`: všechny nové osy, přímé attachmentT a původní radii; SHA `8ddb2dd5d5e6aee513727d85b5eeee16ea520ae3d4d595b7ef0e83f78e32555c`.
- `.cache/trees-r6-crown-20261026/source-delta.json`: pinovaný původní manifest, plán, SHA nových os, 82 100 nových kotev se stabilním `sourcePartIndex` a přesné source členství každého LOD; SHA `aec28ce40e676a33c1068bd3e4883520411819d433578b2ac52d7cebdb0d8c56`. Původní pole `attachmentDistance` je historická R4 hodnota, nikoli nově měřená vzdálenost; skutečné nové kontroly jsou v `report.json`. Leaf `branchT`, rank, partId a supportRadius se rigidní transformací nemění.
- `control-lod0-{00,45}-{bare,summer}.png`, `candidate-lod0-{00,45}-{bare,summer}.png` a `candidate-lod{1,2}-{00,45}-summer.png`. Všech 12 bylo prohlédnuto. Jsou to **Cycles CPU authoring preview**, 2 threads, 12 samples, seed 62, 1100 × 900, stejné původní materiály a studiové světlo. Nejde o herní snímky ani měření GPU.

Koruna má v obou pohledech méně souvislých vodorovných pásů, více nepravidelně stoupajících skupin a mezer. Hlavní ramena zůstávají záměrně zachovaná; tón a atlas nebyly změněné. Near a MID drží stejnou plnou populaci. FAR je stále řídký zdrojový subset. Estetické přijetí celé koruny, následný FAR a skutečná herní přejímka patří koordinátorovi. Žádný runtime/public export, build, fullsuite, instalace nebo GPU práce nevznikly.
