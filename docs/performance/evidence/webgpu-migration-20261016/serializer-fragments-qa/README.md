# Per-call fragment zápisy — kandidát nepřijatý, 19. 10. 2026

Vynechání zápisů neemitovaného `undefined` do lokálního null-prototype fragment bufferu zachovalo ověřené chování, ale nepřineslo dostatečný a konzistentní zisk celého materiálového řetězce. **Do runtime se nepřijímá.** Žádný nový produkční build/GPU pilot pro tuto změnu nevznikl; původní F3 a hrané buildy zůstávají stejné.

| Celý CPU řetězec, medián tří procesních mediánů | Aktuální F3 A | Kandidát S |
| --- | ---: | ---: |
| Warm PBR | 4,7073 ms | 4,6211 ms |
| Warm Standard | 4,0861 ms | 3,9839 ms |
| Warm surface plugin | 5,0113 ms | 4,9520 ms |
| Cold PBR | 10,7174 ms | 11,1265 ms |
| Cold Standard | 7,2825 ms | 7,3026 ms |

Pořadí procesů A/S/S/A/A/S, pro každý warm/cold. Warm znamená 24 neinstrumentovaných celých render intervalů s předehřátými Effecty v každém procesu; tabulka používá jejich procesní medián a pak medián tří procesů. Cold používá čtyři čerstvé kohorty po36 submeshech a median stejně. PBR cold S procesní mediány13,9247/10,6405/11,1265ms ukazují variabilitu. Jediný synthetic96-shape churn48,7753→47,2923ms,288 volání, není statistický ani GPU důkaz. Nelze tvrdit kauzální regresi cold ani převádět 1–2,5% warm změnu na FPS hry.

## Výzkum a rozhodnutí

Předchozí aktuální F3 Edge profil prokázal toString37,4ms/499 při prvním vstupu do auta a24ms/431 při další revizi světel. Neprokázal cenu jednotlivého vnitřního zápisu. Tento nejmenší experiment přesunul jediný `fragments[index] = fragment` do stávající větve `fragment !== undefined`. Nic neodstraňuje z čtení `_keys.length`, `_keys[index]`, `this[prop]`, inline coercion, throw identity ani canonical fallbacku; nevytváří nový persistentní stav.

Srovnané alternativy: F3 hit už neparsuje/nesortí, string-value regex se kvůli multiline/01/NaN nesmí bez náhrady odstranit. Obyčejné densearray indexy mohou aktivovat zděděné settery; pooling ohrozí reentranci a retenci. Immutable prefixy znamenají další řetězce a jiné paměťové limity. Complete-value memo nemá přijatý produkční přínos. Globální light invalidace je širší zásah do světel/readiness/vzhledu. Tyto varianty nejsou tímto experimentem přijaty ani zamítnuty měřením; zůstávají oddělenými možnostmi. Další oprava má odstraňovat podstatnější opakovanou práci nebo prokázat větší přínos, nikoli přibírat tuto malou změnu automaticky.

## Důkazy a omezení

- Přesný základ native-clean F3 `3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03`; MaterialDefines A `3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768`, S `51b6ffb3ce0e471e4547b859f52b9ee592e14d6984e5a7ef1b2a2797868d2b89`. Přesná inverze jediného source delta. Pinované fyzické balíčky pouze čtené, nic se neinstalovalo.
- A i S **26/26 PASS**:52 differential případů/156 volání, dvě partial-initialization hranice, stávající canonical a shared/bounds/reentrant kontroly, skutečný native WGSL/order scénář včetně11 typů/55 stavů a malé GLB identity. Přidaný prototype-getter/setter test prošel v obou. Inspector a boundary probe čtou skutečné zvolené bytes, nikoli náhodou původní F3.
- Dalších šest warm procesů po5 testech a šest cold procesů po2 testech PASS; oba churn běhy PASS. Šest warm procesů má shodné skutečné hodnoty/Effecty, shader sources, layouty a uniform updates napříč A/S; cold Effect IDs a define SHA jsou stejné. Cleanup původních fixtures PASS. Source receipt24 souborů dokládá zvolené SHA a u enginového řetězce přesné fyzické MD URL, se zachováním jediné core/loaders identity.
- Node CPU/NullEngine IO, skutečný WGSL processing a WebGPUEngine.createEffect; GPU buffers, pipeline, draw backend a driver se zde neměří. Fixture používá36 submeshů a jednoduchou scénu, nikoli celou hru. Nelze z toho odvodit FPS nebo odstranění herních≥100ms záseků.
- `runs-01` zachovává chybné Windows --import cesty (opravena file:// URL), `runs-02` chybějící WGSL fixture (14 testů prošlo, chybějící vstup neprošel). `runs-03` je úplný přijatý protokol. Po prvním pokusu kopie byl navíc doplněn skip readonly node_modules junction; neproběhla mutace dependencies. Assertions originálních testů se nesnižovaly. Prepare + complete-fixtures jsou dva explicitní kroky reprodukce, pak run.
- TypeScript/full suite/build/integrace/GPU se pro odmítnutý runtime kandidát neopakovaly; nevznikla herní změna k integraci. Předchozí přijaté F3 gate tím nejsou nahrazené. Žádný nový server/prohlížeč, hrané snapshoty nebyly otevřené k zápisu.

BMAD čtecí scope review bez nálezů; raw porovnání a konečné rozhodnutí samostatně v review.json. [artifact-manifest.json](artifact-manifest.json) obsahuje encoded/decoded SHA i délky přijatých skriptů, vstupů, fixtures a všech zachovaných běhů. Celá migrace, KEY31/32 i default zůstávají otevřené.
