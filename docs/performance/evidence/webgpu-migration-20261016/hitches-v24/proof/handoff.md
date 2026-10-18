# Předání: webgpu-define-memo-proof-20261018

- Vlastník: `webgpu-define-memo-proof-01a14497`; příjemce: koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; výchozí commit při převzetí `17bc0c2`. Koordinátor během práce dále commitoval metadata; identitou tohoto výsledku je vlastní manifest, nikoli aktuální HEAD.
- Výsledek: dokončený izolovaný CPU experiment. Bounded memo zrychlilo celý ověřovaný warm řetězec, ale zhoršuje miss churn. Žádná produkční cache, vendor změna ani nativní kandidát nevznikly. Produkční ownership a browser/GPU přínos jsou otevřené.
- Změněné soubory: pouze tento handoff a vlastní prefix `.cache/webgpu-migration-checks/define-memo-proof-20261018/`. Úplný přesný seznam, velikosti a SHA všech zdrojů, převzatých testů, fixtures, raw běhů a výstupů je v `manifest.json` tohoto prefixu. `node_modules` a `fixture/node_modules` jsou pouze junctions do existujících readonly dependencies, obsah se nekopíruje ani nemění.
- Cizí WIP: žádný převzat. Původní dirty task/handoff čistého serializer experimentu a task JSON tohoto proofu jsou vlastnictvím roota a zůstaly beze změn. Hrané snapshoty a služby se neměnily.

## Mechanismus a volba

`decision.md` předchází implementaci a porovnává referenci A, čistou C, explicitně vlastněné FIFO memo, LRU a produkční lifetime varianty. Pure C předtím zlepšilo jen serializer o 3–5 %, celý warm render se nezlepšil; nebylo zavedeno. Nynější experiment používá původní A, nikoli C.

Původní `MaterialDefines.toString` property loop vždy doběhne se všemi getter reads a původními throws. Teprve jeho hotový exact raw string je klíčem. Miss volá skutečný A canonicalizer. Ukládá se jen změněný výsledek `canonicalResult(raw) !== raw`, takže unknown/fallback i již seřazené vstupy nic neukládají. Experiment má 64 položek a 262144 kombinovaných UTF-16 code units klíče a výsledku, FIFO bez změny pořadí na hitu. Větší položka nevyhodí ostatní. Menší testovací konfigurace ověřují hranice; konfigurace je po konstrukci immutable.

Refaktoring oddělil `memo-owner.mjs` od testového `owner-control.mjs`. Test-only loader zachovává jednu skutečnou core/loaders module identitu a veřejný namespace. Owner vzniká a končí výslovně pro každý test; položky obsahují pouze primitivní stringy. `dispose` je idempotentní, vyprázdní mapu, po dispose se používá reference bez ukládání. Getter throw/reentry nevytváří částečnou vnější položku. Žádný LastCreatedEngine/Scene, resource lookup ani skrytá GPU cache.

## Výsledek a skutečné meze

Šest samostatných procesů v pořadí A,M,M,A,A,M. Mediany celého synchronního budget/order/render řetězce nad 36 actual submeshes:

| Materiál | Reference A | Memo | Rozdíl ve fixture |
|---|---:|---:|---:|
| PBR | 8.74455 ms | 5.57915 ms | −36.20 % |
| Standard | 6.23860 ms | 4.54430 ms | −27.16 % |
| PBR + CampusSurfaceArt | 8.70680 ms | 5.52245 ms | −36.57 % |

Každý memo process median je nižší než každý A process median pro příslušný druh. Vnořené serializer/createEffect scopes se nesčítají a nejsou vydávané za exkluzivní náklady. Trace zachovává původní post-call observer režii. Warm přepnutí stále vyvolá 36 původních native cache hits/Effectchanges/events/reset, ale nula nových programů; genuine změna vytvoří jeden program. Forwarded uniforms, WGSL, defines, layout, refcounts a celé snapshoty jsou exact.

Mixed corpus čte původní úplnou baseline gzip: 50 baseline stavů deseti plugin/regular/thin větví, 28 unikátních raw textů. Canonical větev slouží jako expected output, ne jako raw access trace. Pořadí mixed workloadu je deterministicky testové. Full serializer vždy znovu vytváří raw string; helper měření používá již připravené stringy a je označeno odděleně.

- Mixed warm full: A 92.758 → M 23.798 µs/call.
- Mixed cold je **clear-per-sweep**, nikoli miss-only: 50 bloků, 28 misses a 22 hits uvnitř každého sweepu. A 91.814 → M 73.545 µs/call.
- 129 unikátních variant s FIFO churn: A 98.351 → M 105.967 µs/call, tedy přibližně **7.74 % horší**, nula hits. Peak 44 položek / 262106 kombinovaných code units; paměťový limit je aktivní.
- Malé unique misses a unknown fallback také přidávají režii. Všechny negativní raw běhy jsou zachované.

Samostatný untimed actual capture zachytil přesnou posloupnost 2953 helper vstupů / 9 textů / 0 omitted, včetně názvů testů a owner boundaries. Jde o řízený homogenní warm fixture, nikoli produkční hitrate. Mixed full reconstruction zachovává aktivní pořadí raw řádků, připojuje původní false values; netvrdí znalost původního pořadí neaktivních `_keys`.

## Ověření a provenance

- `node --test functional.test.mjs`: 10/10 PASS; `functional-01.log`.
- `node run.mjs regression-v2`: A 18/18, M 18/18 původních class/WGSL/plugin/attribute testů; `regression-v2-runs.json` obsahuje přesné příkazy, cwd, env, časy UTC, exit codes a source/log SHA.
- `node run.mjs capture-v2`: 5/5 PASS; `capture-v2-runs.json`, `capture-02-owners.json` a source receipt.
- `node run.mjs timed`: šest warm procesů po 5/5 PASS a šest micro procesů exit 0; přesné příkazy a proložené pořadí v `timed-runs.json`. Celkem 54/54 crossvariant snapshotů exact.
- `node types.mjs`: scoped TS 3172 souborů / 0 chyb, exit 0; `types-01.log`. Jde o copied TS closure; není to tvrzení, že TypeScript ověřil JS memo/loader.
- `node analyze.mjs`: `analysis-02.log`, `summary.json`; žádný výběr pouze rychlých procesů. První parser chyba reportovacího skriptu zůstává v `analysis-01.log`, raw měření nezměnila.
- V1 původní namespace assertion správně zachytila test-only exporty: 5 PASS / 1 FAIL v `regression-reference-class.log`. Assertion nebyla odstraněna ani oslabena, controller se přesunul mimo core. V1 modules/receipts/logy i přesné obnovené V1 loader/hook/micro zdroje dle původních SHA jsou zachované v `review-v1/`.
- `node freeze.mjs`: pouze čtení/hash vstupů a zápis vlastních evidence/manifest výstupů. `validation-integrity.json` ověřuje původní dependency bytes, 51 vstupů/copied sources, pouze tři side-effect import adaptace beze změny assertions a všechny finální measured receipts. Nejde o full dependency tree sweep.
- První metadata freeze odkazoval navíc na neexistující `materialHelper.functions.pure.js`; správný `.functions.js` byl již v seznamu. Původní metadata script i diagnostika jsou zachované; oprava reference nemění žádné měřené bytes ani raw výsledky.

Reference je přijatý actual `Materials/materialDefines.js` SHA `43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4`. Pure task manifest `f3ca7da09c745b34511097c5126d08c33e0a5b6619dafda28ae1ff6641b62197`; warm V2 manifest `7a25099dad279c07ef5cf203004802438fe657db392bb209a7dc1a91ec1dda23`. Původní baseline fixture plain SHA `355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f`. Snapshot testy i raw jsou zahrnuté ve finálním manifestu; jeho SHA bude předáno přímo koordinátorovi po freeze bez kruhové self-reference.

## Lifecycle, omezení a další krok

CPU okno bylo předem potvrzené koordinátorem a bylo uvolněné po skončení všech vlastních child procesů. Žádný vlastní proces ani port nezůstává; žádný browser/GPU/fullsuite/build/install neproběhl. Metadata freeze již nic nečasuje. Rezervace bude uvolněna po předání tohoto checkpointu; provozní registry poskytují skutečný čas release. Task status mění koordinátor.

Owner po každém testu vykazuje nula retained entries/code units a controller nemá aktivního ownera. To není fyzický heap ani GPU leak proof. Logický UTF-16 budget nepočítá Map overhead, dočasné stringy, ropes/sliced backing storage, interning nebo GC. Warm CPU fixture má vypnuté shadows a nenahrazuje celou hru, browser driver, skutečné GLB/LOD pokrytí, relace, HUD ani FPS. Výsledek nelze přepočítat na produkci násobením počtu Effectchanges.

Projektová cache ownership pravidla požadují engine/device generation. Čistý module memo sice nemá GPU resource references, ale přežívá jednotlivé scény a není automatickou výjimkou. Engine-owned varianta potřebuje explicitní binding, protože MaterialDefines engine nezná; per-Defines WeakMap nededuplikuje submeshes a sám nezajišťuje celkový cap. Tato volba zůstává otevřená. Pro jakýkoli následný produkční experiment je potřeba samostatné rozhodnutí a srovnatelný celý day13 startup/Golden/F při nezměněném scheduleru, včetně cold/miss churn nákladů. Tento handoff nepřijímá produkční cache ani netvrdí zlepšení FPS.

Integrátor: `/root` přebírá pouze izolovaný důkaz, provede nezávislé review a rozhodne o případném dalším úkolu. Žádný commit z leafu.
