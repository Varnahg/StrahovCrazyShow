# První fáze: pure equivalence a rozdělení ceny

Zatím bez vybraného QA runtime kandidáta. `differential-01.log`:6/6 PASS, skutečný current source a dvě minimální varianty. Změna class/toString raw loop bytes je zakázaná a příprava ověřila jejich shodu. `variants/*-harness.mjs` pouze pro test exportují helper a raw class s jedinou nahrazenou návratovou větou; production variant modules žádný nový export nemají.

9 samostatných procesů s pořadím A/B/C/C/A/B/B/C/A,5batches×9actualblocks×256calls pro každý raw/helper/full scope. Fáze jsou v každém procesu rotované, naměřené přímo (žádný odečet). `micro-runs.json` a `micro-summary.json` zachovávají všechny pořadí/časy/min/max/per-kind/per-process, žádný run se nevyřadil.

Medián ms na jedno volání podle skutečného material block typu:

| Druh / fáze | A current | B lines | C test+index |
|---|---:|---:|---:|
| PBR raw |0,01382|0,01482|0,01442|
| PBR helper |0,06696|0,06727|0,06536|
| PBR full |0,08668|0,08710|0,08389|
| Standard raw |0,01032|0,01120|0,01058|
| Standard helper |0,03564|0,03556|0,03454|
| Standard full |0,04834|0,04940|0,04745|
| Surface raw |0,01379|0,01502|0,01435|
| Surface helper |0,06764|0,06615|0,06527|
| Surface full |0,08616|0,08668|0,08585|

Raw loop je byte-identický, přesto časy kolísají; je to viditelná hranice malých rozdílů. B není konzistentně lepší. C má malé rozdíly, které samy neopravňují k shipping QA volbě. Následující actual warm PBR/Standard/plugin porovnání se stejnými instancemi/callbacky/trace je nutné před rozhodnutím. Časy z Node nejsou GPU výkon, celé hře se nepřepočítávají.

## Raw corpus a memo hranice

Samostatný untimed actual warm pass5/5 PASS zachytil na vstupu skutečného canonicalResult2953raw calls,9exacttextů,0omitted. Součet jejich logických UTF-16 délek je45156B. Každý z9zaznamenaných material value bloků microbench po původním raw loopu odpovídá jednomu skutečně zachycenému textu byte-exact. Corpus uložen v `actual-raw-corpus.json`, zdrojový tap s before/after SHA v jeho provenance; mění pouze in-memory testový modul, fyzické dependency bytes zůstávají stejné. Capture run se **nepoužívá pro timing**.

Četnosti612/505/36/468/396/36/468/396/36 dávají horní mez opakování99,695 % za hypotetického uchování všech9klíčů od jejich prvního výskytu. Není to Effect-cache odvození, LRU hitrate, produkční hitrate nebo důkaz paměti. Neuchovává se pořadí přístupů; nelze tedy spočítat menší kapacitní eviction. Text key+value by při odděleném uchování měl logický součet nejvýše zhruba2×45156UTF-16B; skutečný V8heap se může lišit kvůli jednobajtovým stringům, sdílení, objektům a Map overhead. Žádné heap měření neproběhlo.

Per-instance WeakMap by držel raw+canonical text pro každý Defines objekt a nepomohl automaticky stejným hodnotám36různýchsubmeshes; střídání OFF/ON může last-entry memo stále vyhazovat. Globální bounded text→text map by sdílel výsledky, ale držel je napříč scénami a potřeboval entry i byte limit/eviction a jasný ownership. Max32768chars/entry není sám celkový cache limit. Cache lookup se smí stát až po původních getter/throw reads; memo hotového textu nesmí skrýt jejich side effects. Tato varianta je pouze analyzovaná, žádná cache zde nevznikla.
