# CPU kernel WGSL: includes, parse a variantní průchod

Výzkumný výsledek 3. 11. 2026, bez produkční optimalizace. **V tomto vybraném native-material corpus tvoří expanze include přibližně39 % a parsování32 % instrumentovaného CPU času.** Bezpečnější první kandidát pro samostatný experiment je bounded immutable AST cache na přesném vstupu parseru. Žádná cache nebyla implementována, žádný FPS/GPU přínos se netvrdí.

## Reprodukovatelný rozsah

`fixtures.mjs` skutečně volá připnuté StandardMaterial/PBRMaterial/ShadowGenerator readiness cesty a zachytí jejich Effect kontrakty těsně před GPU kompilací. Má32 fixture případů:12 Standard,12 PBR,8 shadow; celkem **24 unikátních native Effect(name+defines) klíčů**,24 unikátních define bloků a3 raw shader families. Dvě základní světla (hemispheric+directional) doplňuje0/1/2 point a volitelný spot při maxLights4; překročení limitu vytváří záměrné duplicitní případy, které census odečítá. Textury bez IO mají stubnutou readiness, finální Effect je stub. Nejde o render ani validaci GPU shaderu.

`kernel.mjs` používá skutečné `Initialize → Process(vertex) → Process(fragment) → Finalize` a skutečný WGSL processor/context. **pureMode=false**, WGSL1, UBO=true, WEBGPU/version100, half-Z=true, reverse-depth=false, exact-sRGB=false; indexParameters jsou přímo zachycené z materiálů (maxLights4/morph0, shadow morph0). Vertex+fragment zůstávají ve stejném synchronním turnu. Interní afterIncludes callback materiálu se zachovává. Ověření zahrnuje celý výsledný WGSL a všechny serializovatelné vlastní položky processingContext, nikoli jen několik uniform names. V každém výsledku je skutečně přítomen buffer Internals.

To je reprezentativní podmnožina nativních cest, **nikoli přesná kopie312 browser WGSL párů**. Chybějí herní material plugins, avatar/skinning/morph/thin-instance kombinace, plné texturové konfigurace, vlastní ShadowDepthWrapper a skutečné GPU caps/binding acceptance. Node/V8/JIT a syntetické váhy případů se liší od Edge a celé scény. CPU timing opakovaných kernel vstupů slouží k lokalizaci práce; opakování téhož Effectu není předpověď přínosu nové cache, protože engine již Effect klíče cachuje.

## Příkazy

Pouze z kanonického checkoutu na main, pod rezervací heavy-validation. Každý output adresář musí být nový; žádný projekt/checkout se nekopíruje. Instrumentovaný **jednotlivý modul** vznikne v přidělené `.cache`, relativní importy míří na tytéž instalované moduly. `node_modules` ani klientské zdroje se neupravují.

```powershell
node --test docs/performance/evidence/shader-cpu-kernel-20261103/kernel.test.mjs
node docs/performance/evidence/shader-cpu-kernel-20261103/harness.mjs --out .cache/shader-cpu-kernel-20261103/NEW-paired --iterations 12 --rounds 5
New-Item -ItemType Directory -ErrorAction Stop -Path .cache/shader-cpu-kernel-20261103/NEW-profile
node --cpu-prof --cpu-prof-dir=.cache/shader-cpu-kernel-20261103/NEW-profile --cpu-prof-name=kernel.cpuprofile docs/performance/evidence/shader-cpu-kernel-20261103/harness.mjs --out .cache/shader-cpu-kernel-20261103/NEW-native --iterations 24 --rounds 1 --mode native
node docs/performance/evidence/shader-cpu-kernel-20261103/profile-summary.mjs .cache/shader-cpu-kernel-20261103/NEW-profile/kernel.cpuprofile .cache/shader-cpu-kernel-20261103/NEW-profile/summary.json
node docs/performance/evidence/shader-cpu-kernel-20261103/survey.mjs .cache/shader-cpu-kernel-20261103/NEW-survey
```

## Naměřeno

Node24.22.1, Intel Core i7-8750H @2.20GHz,12 logických CPU. Pět kol střídá native/instrumented a instrumented/native; každá větev má384 WGSL párů po společném warmup. Následují **všechny** raw součty, žádné outliery nejsou odstraněné:

| Kolo | Pořadí | Native ms | Instrumented ms | Poměr I/N |
| --- | --- | ---: | ---: | ---: |
| 0 | N/I | 4224.0732 | 3485.1971 | 0.8251 |
| 1 | I/N | 3308.3703 | 3468.6867 | 1.0485 |
| 2 | N/I | 3246.9460 | 3438.2003 | 1.0589 |
| 3 | I/N | 4444.1123 | 3572.1363 | 0.8038 |
| 4 | N/I | 3240.9224 | 3483.6642 | 1.0749 |

Native má dvě výraznější odchylky. Celý proces nebyl izolovaný od OS/JIT/GC, proto z těchto poměrů nevyvozujeme konstantní režii ani instrumentované zrychlení. Mediány součtů jsou3308.3703 a3483.6642ms. Časové brackety neobsahují tvorbu contextu, následnou JSON serializaci contextu ani hashování outputu.

Z instrumentovaných1920 párů (celkem17447.8846ms):

| Nepřekrývající se vrstva | ms/pár | Podíl |
| --- | ---: | ---: |
| ProcessIncludes, bez callback/conversion | 3.5783 | 39.38 % |
| Parse stromu: split/cursor/MoveCursor/expression | 2.9290 | 32.23 % |
| root.process + variantní callbacks | 1.2828 | 14.12 % |
| preProcessShaderCode | 0.6047 | 6.65 % |
| finalizeShaders | 0.4175 | 4.59 % |
| postProcessor | 0.1708 | 1.88 % |
| initializeShaders | 0.0009 | 0.01 % |

Zbývajících přibližně1.14 % je neměřená orchestrující práce/hranice. **Nested položky nepřičítat znovu:** cursor0.8131ms a MoveCursor2.1140ms jsou uvnitř parse; BuildExpression1.1550ms je uvnitř MoveCursor. VaryingCheck0.6331ms je uvnitř walk (420240 volání na kolo). To není GPU čas ani celý createEffect.

Nezávislý nativní `--cpu-prof` měl6384 vzorků s celkovou vahou10341.934ms; raw timeDeltas jsou v archivovaném profilu a summary-v2. Měřených768 nativních párů trvalo7987.0966ms. **Disjunktní statistické kategorie celého procesu**: includes35.76 %, parse-tree/expressions19.30 %, cursor4.72 %, walk/callbacks9.96 %, preProcess5.52 %, generic conversion residual4.25 %, finalize3.68 %, post1.65 %, GC2.02 %, další importy/fixture/hashování13.08 %. Tyto podíly nejsou přímo zaměnitelné s přesnými pair brackety.

Původní classifier v1 chybně přiřazoval generic conversion callback pod jeho include předka. Nezávislé review odhalilo pořadí podmínek; v2 dává conversion a material afterIncludes callbackům přednost. Raw profil nebyl měněn ani opakován. Původní classifier/summary zůstávají v místní evidence, ale **pro závěry je platná pouze summary-v2**. Oprava má vlastní nested-stack regresi.

## První sweep a cache klíče

Untimed census má64 vertex/fragment evaluací32 případů, ale po odstranění8 duplicitních Effect klíčů zbývá **48 evaluací24 skutečně odlišných Effectů**. Ty sdílí6 přesných `preparedSourceCode` vstupů: **42 z48 evaluací může znovu použít již parsovaný vstup v tomto corpus**. To není výsledek opakovaných12 iterací benchmarku. Standard/PBR vstupy sdílí každý10 různých define bloků, shadow vstupy4.

Šest unikátních vstupů má747619 UTF-16 source units,19659 uzlů,5044 expression operátorů a678760 units řetězců v uzlech. Největší PBR fragment má348426 source units,9130 uzlů a2448 operátorů. **To nejsou heap bajty:** V8 může používat Latin1, sdílené substringy/ropes a další object overhead. Procesní memory snapshots jsou bez nuceného GC a neprokazují velikost budoucí cache.

## Volba dalšího kandidáta

1. **Bounded immutable parse cache:** zvolit jako nejmenší slibný následný experiment. Klíč musí být přesný text vstupující do EvaluatePreProcessors až po expanzi, afterIncludes callbacku a případném preProcessor. Čerstvé preprocessors/preProcessorsFromCode/options/context a celý variantní průchod zůstávají. Cache nesmí držet Effect/Scene/GPU objekty; limitovat počet entries, text units i node/operator counts. Lookup/hash/content equality, eviction a GC náklad se musí zahrnout do A/B. Žádný naměřený cache speedup zde zatím neexistuje.
2. **Include expansion cache:** větší možný CPU prostor, ale navíc mutable transitivní include dependencies, indexParameters, UBO režim, lazy load a callback/processor kontrakty. Identita store nestačí pro invalidaci. Neimplementovat jen podle39 %.
3. **Předklasifikace řádků / varyingCheck:** menší kandidát podle změřených6.97 %; nesmí přeskočit dynamické callback/binding side effects. Custom processor potřebuje fallback.
4. **Earlier admission:** může snížit blokování hlavního vlákna, ne součet této práce; vertex+fragment musí zůstat atomická synchronní jednotka stavového processoru.
5. **Worker:** největší rozsah a přenos/lifecycle náklady, žádný důvod jej nyní upřednostnit před čistou CPU cache.

## Ověření a evidence

- `kernel.test.mjs`: první běh2/2 PASS; po opravě classifieru druhý běh2/2 PASS (2055.97ms). Full WGSL/binding parity všech32 kontraktů, odlišný non-float context, recovery po odmítnutém chybějícím include a disjunktní classifier.
- Fixture preflight původně nesprávně očekával absent afterIncludes callback; dále narazil na nenačtený shadow shader a chybějící getEngine ve stubu při deferred cleanup. Vše opraveno před měřením; dostupné původní logy a záznam prvního selhání jsou zachované. Nešlo o selhání produkčního shaderu.
- [validation.json](validation.json) obsahuje SHA-256 raw podkladů, archivů a finálních zdrojů. [artifacts/](artifacts/) obsahuje gzip raw paired/native výsledků, CPU profilu, parity/klíčového censu, logů a opravený statistický souhrn. Benchmark metadata zachovávají tehdejší source hashe; změna classifieru/testu/survey po měření nemění naměřenou kernel/fixture cestu.
- Žádné produkční klientské/dependency změny, GPU/server/build/fullsuite/commit. Přijetí optimalizace a případný browser A/B jsou samostatná práce rootu.
