# Propojení sezónního stromového pilotu

Základ `8516c7b1`, 25. 10. 2026. Implementace je rozpracovaná; tento záznam neprohlašuje GPU přejímku ani nasazení celého katalogu.

## Rozhodnutí a chování

UI uchovává původní osvětlení odděleně od efektivního sezónního náhledu. Výběr sezóny nejprve zvolí datum a nad ním znovu vyhodnotí světelný náhled. Návrat k reálné sezóně obnoví původní osvětlení; návrat obou voleb na real používá skutečné UTC. Game předává stejný instant astronomii i `getTreeSeasonState`. Nenulové `timeOverride` má provenienci `demo`, nikoli živou stanici. UI má CZ/EN označení a samostatný údaj o regionálním odhadu.

Zvolený způsob zachovává jeden čas hry a nemění data počasí. Nezávislé kalendáře stromů a oblohy by vedly k nesouladu; přepis základního osvětlení efektivním datem by porušil návrat z náhledu. Sezónní změna květů prochází původním výběrem a společným rozpočtem trávy, přičemž bloom invalidace nesmí být spotřebována před uplynutím pohybové cadence.

Pilot `own` nebo `mtree` se načítá jen při explicitním pevném lokálním guest QA. Běžná hra zatím drží legacy katalog. Actual runtime potvrdí variantu až po úspěšné validaci a atomickém nahrazení obou zdrojových stromů. Benchmark zaznamenává poslední skutečně aplikovaný sezónní stav, ne nově odvozené datum nebo samotný query požadavek.

## Opad, příprava a vlastnictví

TreeRenderer poskytuje stávající fotografické PBR mapy a seznam skutečných kořenů, family a seed. VegetationController vytvoří opad až po úspěšném načtení těchto map; pouhé zapůjčení neprovádí další IO. Změna transformu obnoví zdrojový seznam. TreeLitter se disponuje před vlastníkem textur. Chybějící legacy mapy nezpůsobují druhé načtení jen kvůli baseline srovnání.

Původní přípravné API vegetace slučuje grass a litter lease. Stabilní revision se mění pouze při změně skutečných zdrojů. Při selhání druhé přípravy se první vrátí zpět; vrácení lease je idempotentní. Shaderové helpery patří pod skutečný herní preparation cover a musejí mít stejné atributy i světelné varianty jako pozdější patche.

## Průběžné důkazy

- Bloom/preview: 17/17 cílených CPU kontrol PASS, `bloom-preview-tests.log`.
- Skutečný Game startup, bezpečná pilotní volba, loader/material/root/season lifecycle: 28/28 PASS, `startup-tree-loader-tests.log`.
- Skutečný VegetationController včetně opadu, sdílených map, zdrojových transformů, prewarm lease a pořadí dispose; zachované legacy exporty a B6 kořen: 5/5 PASS, `litter-wiring-tests.log`.
- Nezávislý čtecí review původního UI/clock/bloom propojení: bez doložených nálezů, 31 cílených CPU kontrol PASS. Digest sedmi čtených souborů `9a6891151bd3e5eebc2af1232270c7d12fac8e238089ea46d045ccb39e888440`; pozdější pilot/litter změny tím nejsou pokryté.
- Rozšířené statické QA: samostatné `qa-views.md`, 20/20 PASS. Game VM vazby a skutečný společný čas: `game-fixtures.md`, 38/38 PASS. Původní selhání low-vehicle fixture bylo zachováno a opraveno skutečným importem, nikoli oslabením testů.

Logy rootových běhů jsou v `.cache/trees-integration-20261025/`. Kompletní stabilní pipeline, skutečná Edge GTX 1060 přejímka, nezávislé závěrečné review a integrace do main dosud neproběhly. Oba uložené buildy a servery 4179/2592 zůstávají neměnné. Při kontrole browser inventory již původní herní karta nebyla otevřená; pro autorizované testování vznikne nová Edge karta, nikoli změna cizího webu.

## Oprava z nezávislého runtime review

Reviewer na skutečném `own-conifer__lod2__wood` porovnal nativní Babylon glTF import s vlastní v2 factory. V pravotočivé scéně nativní import nastavuje `CounterClockWiseSideOrientation`, zatímco výchozí `new Mesh` ponechal opačnou orientaci. Chyba ovlivňovala front-facing osvětlení foliage; u samostatného nového bark s back-face culling také viditelnost. Během dnešního pilotu je část kůry půjčená z double-sided legacy materiálu, takže tento rozdíl není vydáván za doložený culling všech pilotních kmenů.

Zvolená oprava přesně přebírá větev z připnutého `glTFLoader.pure.js`: RH = CCW, LH = CW, bez přepisování indexů nebo původních normál. Dvojstranné vykreslování jako obcházení by ponechalo obrácené osvětlení a zvýšilo náklad; změna původních indexů by poškodila zdrojový kontrakt. Nová regrese importuje totožné GLB oběma skutečnými cestami a ověřuje orientaci i nezměněné pozice/indexy v obou soustavách. Celý cílený loader běh **11/11 PASS**, `tree-facing-tests.log`.

Čtecí review jinou doloženou chybu pozdního loadu, cache a litter lifecycle nenašlo; 24/24 CPU kontrol PASS. Auditovaná verze rendereru před opravou měla SHA `0c6e15676072a2312a4928809807f0337e7eee34619dafebac6869f209478189`. Nová bounded litter cost projekce prošla 10/10 pure kontrolami, `litter-cost-projection.log`.

Globální katalogový `agent-tasks validate` v tomto D worktree narazil na existující unrelated task scope `node_modules/`, který míří přes readonly junction. Jednotlivé task claims prošly; junction ani cizí katalogové tasky se nepřepisovaly kvůli tomuto omezení. Nejde o selhání herních testů.

## WebGPU startup: využití původního časového rozpočtu

26.10.2026 po odstranění PCF shader churnu v8: actual low příprava27,38s prošla, high po30,245s narazila na limit u12/13etap. V teplých low etapách kontrolní dávky spotřebovaly dohromady45ms při32tickách; high83ms při39tickách. Vedle pevného4ms wall budgetu má helper128mesh count cap, takže levné kontroly mohou vrátit řízení již asi po1,4–2,1ms a čekat na dalšíRAF.

Porovnány varianty: ponechat128 (bez zlepšení),512 při stejných4ms (využije čas, stále pevně bounded), bez count cap (zbytečně odstraní druhou mez), prodloužitdeadline (neřeší práci), vynechat ostatní kvality nebo cachovat staréready výsledky (mění pokrytí a lifecycle). Vybrán kandidát512 pouze proWebGPU vGame; WebGL a helperdefault zůstávají128. Nejde o tvrzení optimálního počtu bezGPU porovnání.

Smyčka nadále před každým meshem hlídá dispose/viditelnost/deadline, kontroluje čas i počet, zachovává frontu/retry/revision a obě skutečná potvrzení renderu. Jediný synchronní isReady může překročit4ms už dnes; další kontrola potom nezačne. Nepřibývá stav/cache. Čtecí nezávislý audit souhlasí. RED actualGamefixture zachovala128 místo požadovaného512; log `batch-budget-red.log` vcache fixtures. Následuje GREEN/regrese a skutečný nativeGPU kandidát.
