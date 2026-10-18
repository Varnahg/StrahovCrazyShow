# Předání: webgpu-define-serializer-qa-20261018

- Vlastník: `webgpu-serializer-qa-01a14497`; příjemce `/root`.
- WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`. Přímý BMAD podúkol, bez nového workflow či commitu.
- **Výsledek: negativní experiment. Žádný čistý kandidát nebyl vybrán pro QA build.** Dvě varianty zachovaly chování, ale neprokázaly zrychlení celého actual warm přepnutí. Nevznikl nový vendor patch/lock, fyzická dependency kopie, cache ani produkční diagnostika. Day13/native/main i hrané verze beze změny.
- Zapsáno pouze do vlastního cache prefixu `.cache/webgpu-migration-checks/define-serializer-qa-20261018/` a tohoto handoffu. Cizí WIP nepřevzat, nic nestagováno. Přesný seznam souborů/preimages/SHA je ve finálním `manifest.json`.

## Výzkum, implementace a výsledek

Přečtena actual MaterialDefines implementace a navazující getters, pluginy, cache/lifecycle; původní warm proof V2 i primary ECMAScript CompareArrayElements/IsLessThan. `decision.md` zachycuje volbu před změnou a formální argument: po validaci unique ASCII jmen je lexical sort celých řádků shodný s name comparator (společný prefix; konec nebo mezera32 před pokračováním identifieru s code unit nejméně48).

A je exact current records+name comparator. B zachová validator a použije lines.sort bez record objektů a výstupního map pole. C navíc použije stejnou regex grammar přes test a indexOf/slice místo exposed exec match. Původní class, raw property loop, `_keys`, getter/throw pořadí, receiver, rebuild/clone/equality, whole-block fallback, numeric spelling, reserved names a limity32768/1024 zůstávají shodné. Pure micro harness exporty/raw-loop adaptace jsou pouze testové. Actual warm/class testy načítají kompletní originální nebo variantní module source na stejné fyzické URL pomocí přesně kontrolovaného test-only loaderu; žádný prototype wrapper nebo druhý core.

Pure micro rozlišil raw/helper/full přímým měřením, bez odečtu. PBR v A přibližně0,0138/0,0670/0,0867ms na volání. B nebyl konzistentně rychlejší, C měl malý rozdíl. Actual warm mediány pro36submeshes:

| Typ | A serializer / celý sync render | C serializer / celý sync render |
|---|---:|---:|
| PBR |4,600 / 8,687ms|4,378 / 8,759ms|
| Standard |2,861 / 6,609ms|2,763 / 6,756ms|
| PBR+CampusSurfaceArt |4,544 / 8,261ms|4,399 / 8,318ms|

C samotné toString zkrátil o zhruba3–5 %, celý render se podle mediánů nezlepšil. B měl větší mezi-procesové kolísání a také žádný celkový benefit. Nelze vybrat jeden rychlý proces ani přepočítat36→794. Je to Node/NullEngine, nikoli browser/GPU úspora. Výsledek nevyvrací jiné čisté optimalizace; ruční scanner či memo nebyly implementované.

## Ověření

- Differential **6/6 PASS**: skutečný A/B/C source,9actual raw/value bloků,4096generated +1024mutation bloků, prefixy/case/digits/underscore, finite/numeric edge, opaque/duplicate/reserved/limits, getters/late mutation/falsy throws.
- Micro: **9 proložených procesů** A/B/C/C/A/B/B/C/A; raw/helper/full zvlášť. Všechna pořadí, vzorky a maxima v `micro-runs.json`/`micro-summary.json`/raw.
- Warm: **9 proložených procesů, každý5/5 PASS**, tři skutečné druhy materiálu a36actual submeshes. Pro variantu/druh48přepnutí +48nezměněných snímků. Warm0 nových programů,36cachehit/callback/change/reset; genuine změna1nový program, správný návrat. **27/27 celých cross-variant snapshots exact**, včetně WGSL/defines/Effect/key/layout/uniforms. Refcount, actual plugin UBO a cleanup shodné.
- Dosavadní actual class/WGSL/plugin/attribute/tinyGLB identity testy: **A18/18, B18/18, C18/18 PASS**, compressed baseline byte-identická. Známá unsupported custom order-sensitive větev zachovaná. Scoped TS **3172/0**.
- Zachován první harness neúspěch `regression-records.log`:6PASS/1FAIL kvůli EEXIST společného receipt názvu dvou test child procesů. Opraven jen nový V2runner s výstupem perfile; ne runtime/test assertions či měřený loader. Finální všechny regrese bez skipu.
- Exact commands/UTC/exit codes a module source receipts v `micro-runs.json`, `warm-runs.json`, `regression-v2-runs.json`. No pnpm/install/fullsuite/build/GPU/port. Typy a testy ukončené, žádný vlastní proces nezůstal.

## Raw corpus a memo hranice

Oddělený untimed capture pass5/5 PASS, pouze testový tap před skutečným helperem **po původním raw loopu s jedním getter read**. Actual corpus2953calls /9textů /0omitted; všech9micro raw bloků exact odpovídá. Četnosti dávají pouze horní mez opakování99,695 % při uchování všech9klíčů, nikoli LRU či production hitrate. Pořadí přístupů neukládáno.45156B je logický UTF-16 součet raw délek, ne skutečný heap; dvojice key/output a JS objekty mohou zabrat jinak podle encoding/sharing.

Memo se jen analyzovalo: WeakMap perDefines má per-instance retenci a alternating miss riziko; globální bounded string map sdílí výsledky, ale přežívá scény a potřebuje jasný byte/entry limit, eviction a ownership. Getter/throw loop musí vždy proběhnout. Žádná cache přidaná, žádná automatická volba dalšího řešení.

## Izolace, procesy a další krok

Frozen dependencies z define-order QA byly pouze čtené; jedna fyzická core/loaders identity v každém actual procesu. `baseline/` obsahuje omezenou47souborovou closure a copied warm fixture. `candidate/` je **nevybraná** předběžná source staging kopie bez dependency/build identity, její patch/lock jsou původní beze změny. Není určená root assembleru jako nový checkpoint. Změněné variant modules zůstávají pouze proof vstupy, `selectedVariant` ve manifestu je null.

CPU okna07:44:00–07:44:35 a07:50:39–07:52:35UTC koordinovaná bez souběžné root CPU/GPU práce; po dokončení explicitně uvolněná. Žádné další testy po předání. Rezervace bude uvolněna po tomto frozen handoffu; potvrzení v registru/zprávě integrátorovi. Root převezme read-only review a rozhodne další samostatný task. Žádná doporučená runtime integrace ani GPU A/B pro tyto dva nepodložené kandidáty.
