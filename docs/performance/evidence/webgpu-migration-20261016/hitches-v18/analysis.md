# Pořadí hotových defines: CPU proof a omezený counterfactual

Výsledek18.10.2026: v jednom enginu se podařilo vytvořit dva různé Effecty/cache keys se shodnými finálními public define hodnotami, světly, materiálovými vlastnostmi a geometry/buffer daty. Liší se pořadí hotového řetězce. Čisté přeuspořádání celého validního literal bloku tuto duplicitu ve fixture odstraní. **Není to důkaz startup/FPS/GPU přínosu ani přijatý vendor patch.**

## Zdroje a reprodukce

- Frozen V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`, jeho actual pinned9.30.0 core/loaders. MaterialHelper SHA `a6d21d15070f52d3a94ec7fd40eb22356a76a723165ce05afa67dbeded0e88ac`. Importované vlastní zdroje a test NativeProcessingEngine ověřeny proti source manifestu; dependency realpaths odpovídají V4. Native a dependencies filesystem se neměnily.
- Přijatý B6 exit manifest `97fd7099d849864d67429a9cc082276458b594dadbed34ace91815c469bdd17f`. Jeho dřívější fresh-inside/outside-first pořadí je vstup, nikoli same-engine důkaz. Všechny jeho manifestované výstupy byly na konci zkontrolovány bez změny.
- `NativeProcessingEngine` se získá AST z původního `tests/wgsl-surface-materials.test.ts:29`; jeho tělo zůstává beze změny. Nad ním pouze process-local evidence zachytává skutečný `_convertDefinesToConst` return. Žádné nahrazení readiness, draw, materiálových flags nebo light setters.
- Skutečné PBR/Standard, dva geometricky shodné boxy/materials v jednom Scene/engine, actual Point/Spot/Directional/Hemispheric a `GltfLightBudget`→`StableLightState`→`scene.render`. A nejprve kreslí S,D,H, potom S,P,D,H; B se poprvé skutečně vykreslí až v S,P,D,H. Početsvětel4 i cap4, všechny finální public define hodnoty jsou v pozitivních větvích exact shodné.
- Engine používá skutečný WGSL processor/context/shader stores/includes/plugins. Pipeline creation a draw submission zůstávají NullEngine. Textura je původní NullEngine URL texture IO dummy; žádný velký asset/download. Caps instancing zapnuto pouze pro jeho skutečné větve. `unbindInstanceAttributes` je stejně jako v existujícím car testu NullEngine GPU-only no-op; skutečná selekce instancí, buffer vytvoření, bind a draw dispatch se nezastupují.

## Výsledek stejného enginu

V každé z deseti podporovaných větví baseline vytvoří čtyři programy: A3, A4, duplicitní B4 a B se skutečně změněnou hodnotou. Counterfactual vytvoří tři: A3, společný A4/B4 a hodnotově odlišný B. B repeat4 vždy reuse. Mezi různými baseline/counterfactual enginy se identity neporovnávají jako důkaz reuse; podstatný je A4/B4 uvnitř jednoho enginu.

| Actual větev | Baseline A4 / B4 | Counterfactual A4 / B4 | Další ověřená větev |
|---|---:|---:|---|
| PBR |1 /2|5 /5| NUM_SAMPLES="0", ALPHATESTVALUE="0.5"→"0.25" |
| Standard |8 /9|12 /12| disableLighting vytvoří nový Effect |
| CampusSurfaceArt asphalt |15 /16|19 /19| custom albedo/roughness kód + UBO |
| PhotogrammetryNight |22 /23|26 /26| alpha-test, texture/sampler, facade shader + UBO |
| TreeWind |29 /30|33 /33| vertex injection + actual hardBind UBO |
| CarPaintFallback native instance |36 /37|40 /40| actual regular instance + instanceColor, INSTANCES/INSTANCESCOLOR true |
| PhotoGrassWind regular |43 /44|47 /47| žádný photoGrassFade attribute |
| PhotoGrassWind thin |50 /51|54 /54| actual thin matrix + photoGrassFade buffer/attribute |
| GrassWind thin |57 /58|61 /61| actual thin matrix/world0..3 + varyings/UBO |
| StudentHairTint |64 /65|68 /68| actual PBR ALBEDO alpha-test tint callback |

Čísla jsou lokální Effect IDs z finálního procesu, nikoli raw produkční IDs. PhotogrammetryNight je dostupný testovaný plugin; jeho aktivní callsite v měřeném benchmarku nebyl doložen. Malé boxy ověřují skutečnou plugin/attribute cestu, nikoli kompletní car LOD, avatar skeleton, MakeHuman hair geometry nebo celou vegetaci.

Report obsahuje původní a výsledné defines stringy, public hodnoty, kopie `_keys`, Effect IDs a celé cache keys, full processed vertex/fragment WGSL, actual generated prefix i zbytek zdroje a celý serializovatelný WebGPUShaderProcessingContext. Pro všechny pozitivní větve:

- finální public key/value a světelný layout shodný;
- actual shader language WGSL;
- prefix má identické řádky/počty/hodnoty, mění pouze pořadí;
- po vyjmutí **přesně zachyceného** generated prefixu je veškerý ostatní vertex/fragment kód byte-exact shodný mezi A/B i baseline/counterfactual; nevystřihují se libovolné authored const;
- attribute/varying, uniform/buffer, texture/sampler a bind-group metadata jsou deep-exact shodná;
- skutečné plugin bind/hardBind uniform hodnoty jsou stejné;
- jiná skutečná hodnota zůstává jiným Effectem, žádné nesprávné sloučení.

## Zvolený kontrakt a varianty

`canonical-result.ts` je pouze testový counterfactual. Originální MaterialDefines.toString se nejprve vykoná se stejným receiverem/args; teprve jeho hotový string se parsuje. Celý blok musí mít unikátní ASCII identifier řádky přesného formátu `#define NAME` nebo `#define NAME DECIMAL`, ukončenéLF. Podporované jsou prázdné boolean hodnoty a konečné podepsané decimal konstanty včetně exponentu; spelling se nemění. Žádný symbolický výraz, suffix, hex/octal nebo property value interpretace. PBR numeric strings0/0.5 jsou zahrnuté.

Nejvýše32768znaků a1024defines. Všechny řádky se validují před sortem. Duplicate, komentář, expression, conditional, undef, function macro, CR/tab/Unicode/control linebreak, reserved GL_/double-underscore/engine/Object-prototype macro, invalid/nonfinite numeric, mezera navíc či neznámá syntax vrací byte-identický celý vstup. Empty block beze změny. Řadí se ordinal ASCII podle jména; původní řádkové bytes zůstávají. Není zde persistentní cache nebo mapování Effectů.

Zásadní omezení: parser hotového bloku nemůže poznat, zda dvě validní literal definice vznikly z jedné multiline string property. Takový hotový flat block přijme; test to explicitně ukazuje. Nejde o blanket odmítnutí všech multiline properties. Nejde ani o validátor, že každé přijaté jméno/literal tvoří platný shader ve všech jazycích.

Srovnávané alternativy:

1. Třídit `_keys` při rebuild mění sdílený stav, clone/equality a pozdější opaque hodnoty. Nezvoleno.
2. Guard jen při rebuild přehlédne pozdější změnu value/getter. Bool/number-only guard mine skutečné PBR numeric strings. Nezvoleno.
3. Předdeklarovat všechny sloty mění existenci klíčů a needRebuild; širší cache zavádí zbytečné ownership/lifecycle. Nezvoleno.
4. Čistý bounded hotový-result transform zachová původní getter pořadí/throw, pozdější hodnoty a clone/equality stav. Zvolen výhradně jako counterfactual pro tento důkaz. Přidává parsování/Set/array/sort/string alokace a nemá univerzální bezpečnost vůči pořadí-sensitive callbacks.

## Primární řetězec a důvod omezení hooků

Připnuté soubory pod V4 `node_modules/@babylonjs/core/`:

- `Materials/materialDefines.js:141` rebuild zachová insertion order; `:214` toString tímto pořadím serializuje.
- `Materials/materialHelper.functions.js:861` zakládá LIGHTn; `:702` LIGHTCOUNT/MAXLIGHTCOUNT; `:711` rebuild. To vysvětluje historické pořadí bez hodnotové změny.
- `Materials/PBR/pbrBaseMaterial.pure.js:1182` předá serializaci do Effect; `Engines/webgpuEngine.pure.js:1513` dělá key z celého fullDefines. CPU NativeProcessingEngine používá ThinEngine cache (`thinEngine.pure.js:1682`), nikoli skutečné GPU zařízení; WebGPU key mechanismus je ověřen zdrojově.
- `Engines/Processors/shaderProcessor.js:233` převede defines array na preprocessor objekt; `:34` může předat celé pořadí do processCodeAfterIncludes; `:265` je předá do preProcessor.
- `Engines/WebGPU/webgpuShaderProcessorsWGSL.pure.js:215` iteruje preprocessor objekt a vytvoří generated const; `:279` je přidá před shader. Capture zde zavolá originál jednou a eviduje jeho původní návrat.
- `Materials/materialPluginManager.pure.js:270` injektuje vlastní plugin kód a respektuje existingCallback; plugin a uniform order se neměnil.

Read-only vyhledání vlastních client zdrojů nenašlo přímý custom preProcessor/processCodeAfterIncludes/processFinalCode/customShaderNameResolve. To není univerzální kontrakt Babylon rozšíření. Pozitivně ověřené projektové pluginy jsou vyjmenované výše; test neprohlašuje všechny budoucí pluginy za bezpečné. Shadow-readiness parsing slotů a diagnostické hashy nebyly tímto runtime testem zahrnuty; zejména hash řetězce by se záměrně změnil.

**Negativní actual hook důkaz:** pouze ve zvláštní fixture se vlastní preProcessor podívá, zda LIGHT3 předchází LIGHTCOUNT, a vloží `const syntheticOrderWitness =1` nebo2. Bounded syntax guard obě varianty považuje za validní, ale baseline a counterfactual mají odlišný jiný WGSL kód. Test to potvrzuje přes actual pinned processor. Syntaktický guard tedy neprokazuje ekvivalenci libovolných hooks; není podkladem k univerzálnímu vendor patchi.

Externí primární podklady načtené18.10.2026: [WGSL Declaration and Scope](https://www.w3.org/TR/WGSL/#declaration-and-scope) popisuje module-scope platnost deklarací přes celý program; to podporuje přeuspořádání vzájemně nezávislých literal konstant. [GLSL4.60 Preprocessor](https://registry.khronos.org/OpenGL/specs/gl/GLSLangSpec.4.60.html#preprocessor) popisuje makra a rezervované názvy. Ani jeden zdroj negarantuje pořadí-independenci Babylon callbacků; zde ji nahrazuje jen konkrétní native-processing/parity důkaz podporovaných větví.

## Neuzavřená mirrored instance hranice

Samostatně zmrazené `proof-mirror-red.test.ts`, `report-mirror-red.json`, `run-mirror-red.log`; příkaz:

```
TSX_DISABLE_CACHE=1 node --import tsx --test --test-name-pattern="same-engine car-fallback" proof-mirror-red.test.ts
```

Výsledek0/1, exit1,3.093s. **canonical:false**, původní toString bez wrapperu. Skutečná mirrored InstancedMesh má source i vlastní lightSources S,P,D,H, ale její camera-pass submesh po16actualdraw stále drží LIGHTCOUNT3 a `_areLightsDirty=false`. Fresh B v předchozím širokém runu měl4. Proto zde nejsou shodné koncové values a tato větev se nesmí použít jako pořadová ekvivalence. Counterfactual se v samostatném RED běhu vůbec nespustil.

Žádná dirty/readiness oprava, ruční přepsání flags ani loop prodloužení. Jde o samostatnou neuzavřenou fixture/runtime hranici, nikoli prokázanou regresi canonicalizeru nebo atribuci produkčního auta. Přesný source/report/log a cleanup zachované pro další rozhodnutí rootem. Pozitivní matrix ji nezahrnuje a nepoužívá skip k předstírání pokrytí.

## Cena, ověření a předání

Finální pozitivní/control sada `run-09-final.log`:16/16PASS, exit0,4.725s. Obsahuje10actual shader/plugin větví, syntax/bounds/idempotence, getters/throw/later values/receiver/args/clone/equality, negativní custom hook a lokální microbench. Samostatný mirrored baseline RED zůstává explicitně neuzavřený.

Microbench:2000transformací dvou3073znakových actual B6 strings,146.202ms celkem,73.101µs/průměr. Jediný Node CPU microbench na sdíleném stroji, bez baseline startup měření; nelze extrapolovat na FPS, GPU compile/fence nebo úsporu celé hry.

Refaktoring sjednotil validaci celé odpovědi, fixture/render/sample/cleanup, actual draw-submesh ownership a bounded strict čekání na požadovaný LIGHTCOUNT plus ready requested Effects. Přednost má actual positive assertion; starý ready hot-swap není nová připravená varianta. Dokončení case uvolní observers, budget/stable, scene/materials/textures, owned cached Effects, engine a testové prefix/source evidence refs. Původní MaterialDefines.toString descriptor se obnoví identicky v finally i při throw.

Předchozí logy zůstaly: run01 nesprávně použitá testová Effect accessor metoda, run03 synthetic const původně připojená za trailing shader directive (změněno na preamble), run05/06/07/08 rozšíření a zjištění mirrored fixture hranice. Nejsou to runtime opravy. Žádný build/fullsuite/TS celé aplikace/GPU/install/port/commit. Další rozhodnutí a reálný QA experiment patří rootovi; tento proof samotný nepovoluje produkční patch.
