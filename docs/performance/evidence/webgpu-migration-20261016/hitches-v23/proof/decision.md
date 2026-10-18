# Výzkum před změnou: čistý serializer

18.10.2026. Task je QA-only, nikoli nativní integrace. Přijatý material-switch proof V2 `7a25099d…dda23` měří celé MaterialDefines.toString včetně původního property loop a canonicalResult. Neodděluje cenu regexu, record alokací a sortu; není důkazem browser/GPU úspory. Původní reference `Materials/materialDefines.js` má SHA `43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4` ve frozen define-order QA dependencies.

## Kontrakt a rozumné varianty

Původní toString čte properties podle mutable _keys, včetně getters/throws a string interpolation. Teprve hotový text se validuje. Rebuild/clone/equality a callbacky materiálů/engine cache ownership zůstanou beze změny. Unknown block vrací původní bytes, nezpracovává ho po částech. Platí stejné32768/1024 limity, ASCII, unique/reserved names, numeric spelling/finite pravidla. Stejný aktuální výstup znamená stejný shader/cache key; známá nepodporovaná order-sensitive custom větev se neopravuje ani nerozšiřuje.

1. **Current records**: přesný načtený originál, referenční výstup i čas. Vytváří lines, regex matches, Set, records s name/line, JS comparator a map na výstupní lines.
2. **Validated lines sort**: zachovat celý validator/regex/Set, odstranit records objekty, jejich pole, JS comparator a výstupní map; seřadit již validované lines přímo. Nejmenší kandidát, rychlost ale musí ukázat měření.
3. **Test + indexOf**: stejná regex grammar, pouze test místo vráceného exec match; po úspěchu odvodit name/value ze známých delimiters. Může omezit exposed match array/destructuring, ale přidá indexOf/slice a nemusí být rychlejší. Žádný nový ruční numeric scanner ani širší gramatika.
4. **Bounded memo hotového raw stringu** pouze kvalitativně: původní reads/throws musí vždy proběhnout, memo by následně šetřilo canonicalizer. Potřebuje entry/byte limit, eviction a jasné module/engine ownership. Modulová cache by přidala cross-scene životnost a retenční paměť; engine cache zase nové API/vazbu čisté funkce. Unknown/custom blocks stále opaque. Tento task žádné memo neimplementuje.
5. **Žádná změna**: pokud varianty nepřinesou reprodukovatelný přínos, předat negativní výsledek. Nelze vybírat kandidáta podle snadného GREEN.

## Proč je lexical sort shodný s name comparator

[ECMAScript2025 CompareArrayElements](https://tc39.es/ecma262/2025/multipage/indexed-collections.html#sec-comparearrayelements) bez comparatoru porovnává stringy přes IsLessThan. [IsLessThan](https://tc39.es/ecma262/2025/multipage/abstract-operations.html#sec-islessthan) u stringů používá pořadí code units a kratší prefix. To neurčuje rychlost V8.

Naše inference pro **již kompletně validovaný** blok: všechny lines mají stejný prefix `#define `. Při prvním rozdílu uvnitř jména se tedy srovnává stejný ASCII code unit jako u name comparatoru. Je-li jedno jméno prefixem druhého, kratší řádek buď končí, nebo následuje space32 před numeric hodnotou; pokračování identifikátoru má code unit nejméně48. Kratší jméno je v obou případech první. Stejná jména guard odmítá. Hodnota se nikdy nestane rozhodujícím znakem. Proto lze primitive lines.sort použít bez změny pořadí; žádná locale collation ani numeric sort.

## Ověřovací návrh před výběrem

Načíst skutečný aktuální modul, připravit přesně označené isolated variant modules a pouze v proof harness exportovat helper/raw-loop. Původní toString body i ostatní class bytes ověřit shodné. Differential corpus má actual material value blocks, prefix/digit/underscore/case, numeric hrany/finite, opaque injection, duplicates, bounds a deterministické mutation cases. Testovat skutečnou aktuální a variantní funkci, nikoli její ruční kopii. Raw loop se získá z actual toString nahrazením pouze posledního návratu v test-only modulu; helper timing pracuje s předem hotovými real raw blocks. Full serializer používá actual MaterialDefines instances s hodnotami z actual warm fixture, následně actual renderer proof ověří real PBR/Standard/plugin řetězec.

Před časováním získat root CPU okno. Více samostatných procesů s proloženým pořadím A/B/C a raw/helper/full fází; žádný přepočet na celouhru. Teprve po sémantické shodě a reprodukovatelném výsledku vznikne fyzická vlastní core+loaders QA kopie, přesný patch/lock a18 dosavadních class/WGSL/plugin regresí. Actual warm proof použije jeden core v každém procesu, zachová Effects/defines/WGSL/layout/uniform/refcount/cleanup. Raw test chyby zůstanou zachované. GPU/build/fullsuite/install nejsou součástí.
