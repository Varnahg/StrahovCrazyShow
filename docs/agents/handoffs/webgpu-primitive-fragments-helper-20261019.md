# KEY-31: bounded primitive fragment reuse — private CPU proof candidate

- Task `webgpu-primitive-fragments-helper-20261019`, owner `webgpu-01a15102-primitive-helper`, příjemce root. Přímý leaf pod root BMAD/spec; bez dalšího workflow, podagentů a commitů.
- Frozen manifest `.cache/webgpu-primitive-fragments-helper-20261019/manifest.json`, SHA256 `4d89e6f7ef117daae40a1a891ec63db956830a6a02fe9f05e10c02b70b320b1d`.
- Jediný runtime payload `candidate/Materials/materialDefines.mjs`, SHA256 `084ce46889d79c37867b8fb97bd64f21d9bb2545ccd205983b427fab274293e2`. Root může tento obsah převzít jako isolated vendor JS; nejde o nativní patch ani přijetí do main.
- Přesný base F3 `3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768`; sedm přesných hunků v `source-inverse.json`, inverse obnovuje původní zdroj. Input manifest připíná deset source vstupů; final manifest všech26 vlastních artefaktů včetně testů, adaptérů, logů, preimage, generatoru a inverse. Licence/provenance oracle zůstává zachována.

## Mechanismus a refaktoring

- Původní F3 names/order cache, plný observed-name check, původní čtení `_keys.length/index/value`, canonical fallback a jeho limity zůstávají. Není přidán sparse zápis, dense array, prefix metadata ani whole-result memo. Original formatting se provede vždy mimo exact primitive name/value hit.
- Oddělená WeakMap receiver→holder drží poslední dokončený bezpečný immutable payload `{names,values,fragments,slots,stringUnits}`. Povolené hodnoty jsou finite number, valid numeric string, boolean/null/undefined; žádné object/function/symbol values či receiver/GPU reference. `Object.is` rozlišuje typy a signed zero. Snapshot implicitně dokládá safe-literal validity, takže hit vynechá formatting i jeho regex/Number validaci, žádný původní property read.
- Každé volání má lokální snapshot a scratch. Při prvním miss se připraví vlastní values; po úspěšném dokončení se vlastní null-prototype scratch přímo zmrazí místo další kopie. All-hit call bez reentrance ponechá stejný payload. Pokud inner call mezitím publikoval/eviktnul payload, outer completion znovu publikuje svůj immutable snapshot. Throwing/unsafe outer nic nepublikuje.
- FIFO používá null-prototype indexovaný storage, nikoli Array.push: nový receiver s již sdíleným F3 name schema tak nezavádí nový inherited numeric-setter efekt. Každý resident holder má jedinou queue položku, replacement ponechá FIFO pozici. Eviction maže payload i ze stále živého weak holderu a odečte oba účty.
- Limity:1024 resident holders,524288 value+fragment slots,4194304 UTF16 value-string+fragment units; na payload≤1024keys/32768emitted text units. Metadata names používají původní zmrazené F3 pole a jeho≤32768nameunits. Jde o logical retained-payload cap; objektová/WeakMap režie, existující F3 metadata, další name references a in-flight snapshots nejsou celkovým heap/GC limitem. `CONTRACT.md` toto výslovně uvádí.

## Ověření

- `node .cache/webgpu-primitive-fragments-helper-20261019/prepare-tests.mjs`; `node .cache/webgpu-primitive-fragments-helper-20261019/run-light.mjs`: **25/25 PASS**,0fail; scoped strict TS nových copied public/schema fixture exit0. Žádný skutečný timing benchmark.
- Rozpad:10 nových fragment tests;8 existujících differential tests včetně9 actual material blocks,4096 generated a1024mutation kontrol; veřejný52-case/156-call corpus+2init probes;5 původních F3 schema/shared kontraktů. Původní public/shared test bytes jsou nezměněné; soukromý fixture pouze přesměruje import na kopii kandidáta. Starý differential mění pouze dvě import paths. Nejde o18 actual package/core regresí, které vlastní root.
- Nové kontroly: unchanged hit skutečně vynechá literal regex; typed mutation a unsafe fallback; proxy/getter/key-coercion/throw identity; full middle/count name mismatch; nested completion/throw; nested eviction+outer re-admission; count/slot/string-unit eviction při živých receivers; úplný immutable/primitive payload účet; numeric Array.prototype setter poisoning.
- První lehký běh24/24 před doplněním explicitního nested-eviction testu je zachován v `first-light-results.json`/`first-js.log`; finální25/25 v `light-results.json`, `js.log`, `public-schema.log`, `types.log`. Žádná assertions nebyla oslabena. Reentrant skip problém byl nalezen před prvním spuštěním a opraven; root upozornil souběžně na stejný edge.

## Převzetí

- Root vlastní actual18 regresí,11WGSL/55states parity, current wholewarm/cold a případný production A/B/GPU. Tento helper nedokládá rychlejší render ani FPS; extra comparisons, fragment retence, freeze a miss publication mohou zisk zrušit. Při nedostatečném přínosu kandidáta odmítnout.
- Beze změny main/dependencies/patch/lock/Game/testované snapshoty a cizí WIP. Node/tsx/TypeScript závislosti jsou pouze read-only junction do vlastního cache fixture; TSX_DISABLE_CACHE=1. Všechny vlastní child procesy dokončeny, žádný server/GPU/heavy benchmark nebyl spuštěn. Po předání release; task acceptance/commit rozhoduje root.
