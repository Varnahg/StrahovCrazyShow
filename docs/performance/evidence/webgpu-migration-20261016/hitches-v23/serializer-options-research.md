# Čtecí varianty serializace

18. 10. 2026, nezávislý průzkum functional_record a root. Přijatý hitches-v21 měří celétoString; aktuální MaterialDefines SHA43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4. Původníloop a canonicalizer je nutné měřit přímo, ne odečtem mediánů.

Po nezměněném whole-block guardu lze sortovat celé řádky: společný prefix '#define ', unique ASCII jména; u prefixu kratší řádek končí nebo má space32, pokračování identifikátoru má nejméně48. Výsledek odpovídá ordinal sortu jmen, hodnoty nerozhodují. ECMAScript2025 CompareArrayElements/IsLessThan definují lexikografické pořadí, ne rychlost. Nepoužít localeCompare. Tato varianta vynechá record objekty, records/map pole a JS comparator, ale řadí se společným prefixem.

Regex test+indexOf může omezit vracená match pole, ale přidává scan/slices. Jednoprůchodový scanner má větší riziko změny numeric/name grammar. parseFloat, trim a přepis spellingu nejsou ekvivalentní. Zachovat ASCII/LF, reserved/duplicate names, finite Number,1024řádků/32768znaků a celý původní output při neznámé řádce. Původní _keys/getter/throw/receiver/rebuild/clone/equality kontrakt se nemění.

Memo by smělo začít až po celém původnímloopu a použít exact hotovýstring. Effectcachehit není důkaz raw-stringhitu. Globální bounded string→string mapa má module lifetime a texty přes scene dispose; WeakMap podledefines neomezuje součetretence a jedna položka thrashuje přiOFF/ON. Početcodeunits není záruka skutečného JS heapu. Žádné memo není tímto čtecím rozborem přijaté. Homogenní36submeshfixture musí být doplněn směsí skutečných plugin/instance variant a unikátními vstupy, pokud se bude memo dále zkoumat.

Aktuální QA task porovnává tři čisté varianty a omezený actual raw corpus. Mikrobench samotný nevybírá vítěze; rozhoduje actual warm řetězec, invariants a pozdější GPU/startup pilot. Méně objektů v kódu není samo o sobě doložená optimalizace.

Primární standard: https://tc39.es/ecma262/2025/multipage/indexed-collections.html#sec-comparearrayelements a https://tc39.es/ecma262/2025/multipage/abstract-operations.html#sec-islessthan .
