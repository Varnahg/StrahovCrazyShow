# Zdrojový plán celého stromového katalogu

26. 10. 2026, task `trees-20261026-catalog`, baseline `8516c7b1`. Tento krok dodává použitelný offline plán všech 110 stromů a čisté helpery pro navazující výrobu. Nevydává plán za hotové modely, nový runtime kontrakt ani GPU přejímku.

## Doložené vstupy a volba

Skutečný `TREES` má 107 listnáčů, dva jehličnany a jeden referenčně holý strom. Všechna `botanicalSpecies` jsou `null`. Rozměry listnáčů sahají od 5 do 24 m výšky, od 5,5 do 21,91 m průměru koruny a od 0,148 do 0,592 m poloměru kmene. Jde o odhad z identifikovaných historických podkladů, ne zaměřenou botanickou geometrii. Plán kopíruje jejich provenienci, nejistotu a původní reference; nepřidává stromy.

Porovnáno:

- Škálování hotového GLB: nejlevnější implementace, ale současně mění fyzickou velikost listů a nutí šířku koruny a tloušťku kmene do stejného poměru. Odmítnuto.
- Nová nezávislá generace každého stromu: dovoluje libovolný habitus, ale znovu otevírá přijetí celé anatomie a napojení, přestože R6 kostra už byla přijata. Není nejmenší další krok.
- Přizpůsobení přijatých os, samostatné radii a nové metrické kotvy: zvoleno. Použije přijatou hierarchii, umožní oddělit rozměry a nevyžaduje novou runtime deformační shaderovou větev. Blízké exporty mohou využít dnešní streaming; FAR banka je samostatný koordinovaný krok.

Pinované osy:

| Zdroj | Bajty | SHA-256 |
|---|---:|---|
| R6 B5 `.cache/trees-r6-crown-20261026/updated-axes.json` | 2 506 322 | `8ddb2dd5d5e6aee513727d85b5eeee16ea520ae3d4d595b7ef0e83f78e32555c` |
| R5 jehličnan `.cache/trees-pilot-20261025/own-conifer-axes.json` | 2 473 502 | `ca7d415c6ebd73f0741c37d247be07535289992cdb360b1825fd2bbdca31a80a` |

Oba vstupy jsou pouze čtené. Jehličnaté osy jsou původním zdrojem nezměněné R5 geometrie. Schválené pilotní osy mají odchylky od parent kotev nejvýše 5,48e−15 a 3,59e−15 m. R5/R6 fotografie, native soubory a exporty tento task nemění.

## API a souřadnice

`catalog.mjs::buildTreeCatalog(rows)` přijímá skutečné runtime stromy a výsledky `treeTrunkCollision()` / `groundHeight()`. Neimplementuje jejich pravidla znovu. Výstup je deterministicky řazen podle source ID, obsahuje X/Z kořen i terénní Y, rozměry, původní reference, nejistoty a rodinu. B6 severní jehličnan správně používá `[-10.5, -76.5]`, nejistotu 2 m a záznam opravující původní polohu. Holý B6 dostává `existing-source-bare-wood`, `foliage:false` a žádný půjčený listnatý fit.

`fit.mjs::createAxisFit(sourceDimensions,targetDimensions)` vrací malou afinní matici pro centerlines a samostatný `radiusScale`. Výška, hlavní a vedlejší poměr koruny, relativní azimut a rozdíl crown offsetu pocházejí z katalogových odhadů. Světové X/Z se převádí do Blender X/−Y. Rozdíl offsetů se aplikuje lineárním shearem podle původní výšky, takže kořen zůstává `[0,0,0]` a interpolace parent kotev se zachová. Toto je **relativní přizpůsobení přijatého tvaru**, nikoli tvrzení, že výsledný mesh přesně odpovídá PCA nebo dosáhne přesně nominálního bbox. Původní radial outline se uchovává jako reference; netlačí se do nové koruny.

`fitAxes(axes,fit)` zachovává ID, parent, depth a attachmentT. Ověřuje jediný rooted strom, nezáporné konečné radii s taperem, neporušenou hierarchii a skutečné napojení. Radii se mění podle cílového collision radius nezávisle na centerlines. Identický source/target vrátí numericky nezměněné osy v nových polích. Žádný vstup se nemutuje. U nových rozměrů musí exporter z os znovu vytvořit dřevo; nelze afinní matici použít přímo na staré hotové radiální povrchy.

`relocateLeafComponent(component,sourceAxis,fittedAxis,targetT?)` přenáší skutečnou kotvu a pouze **rigidně rotuje** metrické leaf offsets a případné normály mezi tangenty. Zachovává délky, UV, part ID, rank a konzistentní transformaci všech LOD rohů. Ošetřuje i protisměrné tangenty. Afinní crown matrix se na samotný list nikdy neaplikuje.

`prepareLeafAnchors(axes,family)` je připravený plán nového vzorkování. Používá fyzickou délku větve, původní umělecké rozestupy 0,028/0,10 m a limity 3–22 částí na větev, poté vzorkuje obloukovou délku. Vrací skutečný indexový `branchT` používaný existujícími osami. Listnaté skupiny mají nejvýše šest kotev a prostorový span 0,39 m; jehličnatá skupina odpovídá jedné větévce. Helper neurčuje novou velikost listu a nevymýšlí nové texely. Ranky má přidělit jednou následný exporter a sdílet je všemi LOD. Plán nenahrazuje následnou kontrolu podpory listu vůči skutečnému tube/BVH povrchu.

Matematika, validace rozměrů a konstrukce výstupů jsou soustředěny do dvou čistých modulů. Nemají top-level IO, neudržují globální cache a negenerují nic per-frame. Oddělený CLI adapter vlastní explicitní čtení pinů a malý výstup; nezávisí na pořadí source vertexů nebo neověřených alias ID.

## Skutečné výstupy a ověření

```powershell
. .cache/trees-20261025/activate.ps1
node node_modules/tsx/dist/cli.mjs scripts/trees-20261026-catalog/prepare.ts --plan
node scripts/trees-20261026-catalog/verify.mjs --audit
node node_modules/tsx/dist/cli.mjs --test tests/tree-catalog.test.ts
```

CLI používají výlučný zápis `wx`; opakovaný běh nepřepíše předaný důkaz. Source plán má 365 824 B, SHA `97010582490d8c469d595543651eae3299741bcc4e8d67ee2cc4304f78d4db1d`, přesně 110 identit a 107/2/1 rodiny. Ukládá přímo vypočtené kořeny a výšky, SHA přímých source souborů a axis piny. Tento seznam přímých podkladů není tvrzení úplného hashe všech tranzitivních world dependencies; ten dodá integrační snapshot.

Malý skutečný audit provedl identický fit obou pilotů a tři mezní cíle: 5m listnáč `4314257232`, 24m `ipr-crown-074` a druhý jehličnan. Všech pět prošlo; maximální parent odchylka byla 7,36e−15 m. Radius odpovídá cílovým source hodnotám v toleranci 1e−8 m. Nevytvářely se všechny modely. `axis-audit.json`: 5 843 B, SHA `d600af42f53137f5daab83d26371390c2237bb323d618fd0f57fb5e724508845`.

Šest cílených testů prošlo, včetně celého source inventáře, identity, nerovnoměrného fitu, chybných vstupů, rigidních listů/normál a obloukového vzorkování. Poslední behavior run po zpřesnění validace nekonečné sample pozice měl 1,80 s, 0 fail/skip (`tests-input-validation.log`). Úzký TS check nejprve našel chybějící typ callbacku v testu; oprava je pouze anotace `number`, bez změny chování. Původní diagnostika zůstává v `typecheck.log`; opravený check PASS s exit0 je v `typecheck-corrected.log`. Nebyla spuštěna celá regresní sada, build, integrace, Blender ani GPU.

## Před následným exportem

Dále je potřeba vytvořit dřevěné povrchy, zkontrolovat změněné junction objemy/křížení, nové leaf support a společné LOD ranky; přijmout a sdílet FAR banku; uložit editovatelné native modely a zapojit kompletní katalog. Současný v3 stále váže source ID 1:1 na prototyp a nepočítá sdílené buffery. Tento task to obchází pouze v offline plánu, nikoli oslabením validace runtime. FPS, vzhled, konečná paměť a dokončení 110 modelů zde nejsou prokázány.
