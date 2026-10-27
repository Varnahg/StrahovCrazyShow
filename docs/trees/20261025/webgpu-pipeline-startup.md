# WebGPU startup pipeline — bounded diagnostika

26. 10. 2026, task `trees-20261026-webgpu-pipeline-diagnostics`, owner `trees-webgpu-pipeline-diagnostics-01a16b37`.

## Důkaz a otázka před implementací

Frozen v6 `17685dbb874097ba96b3c3951c191d3b947dcb10f76847469c1a0de9116dcf38` timeoutuje v low/current-on. Záznam `.cache/trees-gpu-20261025/v6-webgpu-pipeline-timeout.json` ukazuje 852 ticks, 140 renders, 0 restarts, 112 pipeline waits a nulové mesh/precipitation waits. Všechny zaznamenané async/sync pipeline operace jsou dokončené bez pending/failures. To dokládá čekání na startup pipeline adapter, nikoli samotnou pomalou/nezaktivovanou kartu. Ještě to neurčuje jeho vnitřní blokující podmínku.

Primární podklady jsou připnuté Babylon 9.30 soubory `Engines/WebGPU/webgpuCacheRenderPipeline.js`, `webgpuCacheRenderPipelineTree.js`, `Buffers/buffer.nonFloatVertexBuffers.js`, `Materials/effect.pure.js` a projektový `client/webgpu-pipeline-preparation.ts`. Descriptor builder může synchronně přegenerovat shader při non-float vertex změně; adapter potom právem odmítne starou identitu před async dispatch. Token mění cache lookup, nikoli přímo descriptor builder. Stabilní typ se zapíše do zachovaného contextu; opakovaný churn by vyžadoval další mutation či střídání typů. Tento mechanismus zatím není doloženou příčinou v6.

## Porovnané varianty

| Varianta | Přínos a cena | Rozhodnutí |
| --- | --- | --- |
| Znovu zopakovat současné GPU měření | Zachová kód, ale neodliší hotové nevyzvednuté položky, incomplete frame a descriptor skip | Samotné opakování nestačí |
| Opt-in čítače na existujících rozhodnutích + jednorázový snapshot | Ověří přesnou větev bez dalšího GPU/readiness volání; konstantní paměť, snapshot prochází nejvýše existující bounded work | Vybráno |
| Neomezený log každého draw/descriptoru | Detailní, ale může držet GPU objekty a měnit paměť i časování | Zamítnuto |
| Přidat další isReady/probe, prodloužit deadline nebo guard přeskočit | Mění původní experiment/readiness a může zakrýt závadu | Zamítnuto |

## Veřejný diagnostický kontrakt

`options.diagnostics?: boolean` je ve výchozím stavu vypnutý. `snapshot()` mimo opt-in vrací `null`; zapnutý vrací pouze čísla, booleany, null a omezené prosté stringy. Nevolá `check`, `prune`, `isReady` ani GPU API. Obsahuje render/readiness čítače, aktuální entries/work, serialy, skip důvody a jediný poslední skip sample s efektovým ID/názvem a názvy změněných identity polí. Neuchovává renderer/effect/descriptor reference. Snapshot je nezávislá kopie.

Čítače jsou saturované na `Number.MAX_SAFE_INTEGER`. Jméno má nejvýše 120 znaků, reason/identity field názvy pocházejí z pevné množiny. `lastSkip` je historický poslední skip, nikoli tvrzení aktuální chyby; `readiness.lastResult` je poslední skutečně provedená kontrola. `entries.ready` znamená dokončený nevyzvednutý výsledek, ne již instalovanou nativní pipeline. `work.retiredPending` zahrnuje již odstraněnou identitu, jejíž Promise se ještě musí vypořádat.

Game wiring, frozen snapshot a GPU důkaz vlastní koordinátor. Readiness guards, pořadí vyhodnocení, cache insertion, dva ready draw, timeouty a cleanup musí zůstat stejné. Případná funkční oprava smí následovat pouze doloženou reprodukci.

## Implementace a cílený refaktoring

Snapshot má `renders.{total,complete,incomplete}`, `readiness.{checks,waits,lastResult}`, `entries.{total,pending,ready}`, `work.{total,pending,retiredPending}`, `completionSerial`, `provenSerial`, `lastRenderComplete`, `skips`, `retirements` a `lastSkip`. Skip důvody jsou `pending-entry`, `capacity`, `descriptor-disabled`, `descriptor-token`, `descriptor-identity`. Retirement čítače rozlišují neplatnou identitu, disabled cache a nevyužitý hotový výsledek po skutečném retry.

Původní OR guard byl rozepsán do stejných sekvenčních podmínek; první rozhodující podmínka nadále ukončí draw. Diagnostika používá již načtené identity. Poslední sample opakovaně využívá jeden objekt a pole; neexistuje rostoucí event queue. Metadata čte pouze z vlastních data properties, ne z getterů; případná nepřístupná metadata zůstanou null. Lifecycle a cache acceptance beze změny. Nebyla provedena spekulativní funkční oprava.

## Ověření 26. 10. 2026, 10:38–10:40 UTC

- Přímý `node node_modules/tsx/dist/cli.mjs --test tests/webgpu-pipeline-preparation.test.ts`: **37/37 PASS**, exit 0, před i po cíleném omezení alokací posledního sample. Finální log `.cache/trees-webgpu-startup-20261026/targeted-tests-final.log`.
- Cílený TypeScript project, dědící skutečný kořenový `tsconfig.json` a zahrnující pouze adapter/test + importy: **PASS**, exit 0. Příkaz `node node_modules/typescript/bin/tsc --project .cache/trees-webgpu-startup-20261026/tsconfig.targeted.json`, log `targeted-types-final.log`.
- První ad hoc TypeScript příkaz bez projektového `strict` nastavení skončil chybou narrowing `unknown` v nezměněném `webgpu-compilation-profile.ts:479`. Byl nahrazen přesným zděděným projektovým nastavením; cizí soubor nebyl upraven. Původní výstup zachován v `targeted-types.log`.
- `git diff --check` nad oběma změněnými soubory: **PASS**.

Nové regrese dokazují opt-in, oddělení pending/ready nevyzvednutých položek, snapshot bez check/prune/isReady, nezávislé kopie, string bounds, saturation, retired pending cleanup, capacity/unused-result retirement a první rozhodující descriptor skip bez dalšího dispatch/probe. Používají skutečný připnutý cache lookup/descriptor builder s nahrazeným device IO.

Non-float CPU reprodukce přes skutečný pinned checker prokazuje konvergenci jednoho keep-context přegenerování: první render skipne starou identitu, druhý vytvoří jedinou async pipeline a po completion další render dosáhne ready. Kontrolované střídání FLOAT/UINT nad stejným efektem naopak během 6 renderů vyvolá 12 identity skipů a 0 async requests. Shader/device IO v této reprodukci je nahrazené přesným keep-context/stage-change výsledkem; nejde o reálný shader compile ani důkaz, že se tato podmínka děje ve v6.

Bez GPU, instalace, buildu, celé sady a integrace. Koordinátor zapojuje snapshot do Game a pořídí v7 důkaz, který určí konkrétní příčinu.

## Navazující oprava NCM, 26. 10. 2026

Koordinátor předal vlastní rozpracovaný adapter/test agentovi `trees-ncm-startup-probe-20261026` a uvolnil stejný task. Následující zásah rozšiřuje přípravu o explicitní experimentální `webgpu-fast`; výchozí WebGPU CM a Game/UI zůstávají beze změny.

### Doložený mechanismus a hranice důkazu

Frozen v11 `879d5008c7483439a0eaa8997c3d548561afa64ccf643509a99c0eac9cf198e0` už prošel opraveným guardem tree draw cache. Záznam `.cache/trees-gpu-20261025/v11-fast-startup-first.json` končí timeoutem low/night-1-on po 30 364,1 ms, bez pozastaveného času. Adapter je `inert:true`: konstruktor přijímal pouze `compatibilityMode === true`, proto NCM nepoužil žádnou z jeho asynchronních pipeline operací. Profil obsahuje 314 synchronních a 0 asynchronních pipeline volání. Osm dosažených etap spotřebovalo 19 355,3 ms uvnitř render callbacků; nejdelší jednotlivý render 4 384,9 ms. Samotné synchronní `createRenderPipeline` API mělo jen 9,7 ms součtu. Z těchto údajů nelze přiřadit dlouhý render konkrétně kompilátoru, dokončení bundle nebo ovladači. Oprava prokazatelně odstraňuje chybějící asynchronní přípravu, zatím neprokazuje vymizení GPU timeoutu ani rychlejší hraní.

Primární kód připnuté 9.30: `webgpuEngine.pure.js` (`_draw`, `_clearFullQuad`, setter `compatibilityMode`), `webgpuClearQuad.pure.js`, `webgpuBundleList.js`, `webgpuCacheRenderPipeline.js`, `drawWrapper.js` a `shadowDepthWrapper.js`. `_draw` vyhledává pipeline před vytvořením NCM bundle encoderu. NCM clear naopak vytvoří lokální encoder před lookupem, ale hotový bundle uloží až po `finish()`. Pending výjimka proto nepublikuje nehotový bundle. `WebGPUBundleList.addBundle(undefined)` nevkládá undefined do seznamu vykonávaných bundles; nativní `_clearFullQuad` dál obnoví stencil reference. [Oficiální NCM dokumentace](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/) požaduje měřit skutečný přínos opakovaného použití bundles; NCM nemusí být rychlejší pro každou scénu.

### Varianty a zvolená oprava

| Varianta | Dopad | Volba |
| --- | --- | --- |
| Ponechat CM jako výchozí a NCM experiment bez přejímky | Funkční současná výchozí cesta; sama neodstraní chybějící NCM přípravu | Výchozí režim se nemění |
| Rozšířit stávající startup adapter o pevný NCM režim | Stejné native lookup/token/identity, bounded promises, readiness a cleanup; zvlášť ověřit NCM clear a bundles | Vybráno jako úzká oprava |
| Připravit CM a potom přepnout do NCM | Přidá přechod režimu a další dokazování aktuálnosti již existujících bundles; samotný setter žádnou invalidaci nedělá | Pro tento problém zbytečně širší lifecycle |
| Native `preWarmPipeline` nebo široký `resetDrawCache` | První zapisuje cache po Promise mimo původní identity guard; druhý zahazuje DrawWrapper/Effect místo úzké přípravy | Nevybráno |
| Zvýšit timeout nebo přeskočit etapy/ready gate | Zakryje symptom a změní přijímací podmínky | Nevybráno |

Adapter si při vytvoření uloží skutečný boolean `compatibilityMode`; oba režimy podporuje, ale změnu režimu během vlastnictví nadále odmítá. Pouze pro NCM přijímá `clear(null, …)` do stávajícího pending boundary. Hlavní i clear cache používají stejný `prepare`, serial, limit 64 a původní cleanup. Nepřibyla druhá fronta, mode switch, globální invalidace, nový timeout ani změna API Game. WebGL, chybějící mode a snapshot hosté zůstávají inertní. Test fixture sdílí command encoder a skutečné připnuté draw context/bundle list třídy, aby kontrolovala vykonané příkazy a ne pouze metadata.

### Ověření a předání

- RED před opravou: dvě NCM reprodukce očekávající odložený cold draw/clear selhaly, protože inertní adapter okamžitě přijal synchronní vykreslení (`ncm-red.log`).
- Po opravě cílený soubor **49/49 PASS**, exit 0 (`ncm-targeted-final.log`). Obsahuje skutečné native main draw, clear → bundle list → submission se stencil obnovou, dvě aliasové `ShadowDepthWrapper` větve se společnou pipeline a různými bundles, opakované použití bundles, odmítnutí změny režimu/device/cache, async rejection a late main/clear completion po abort/dispose.
- První rozšířený běh měl jednu chybu fixture: fake bind-group IO neodstraňovalo `materialContext.isDirty` tak jako skutečný `WebGPUCacheBindGroups`. Opraven pouze stub; původní výstup zůstal v `ncm-targeted.log`. Nešlo o produkční selhání adapteru.
- Zděděný cílený TypeScript projekt **PASS** (`ncm-types-corrected.log`). Předchozí výstup `ncm-types-final.log` zaznamenává chybějící zúžení `IDrawContext` na `WebGPUDrawContext` ve dvou testových přístupech; oprava jsou jen typové casts, proto se již úspěšná runtime sada znovu neopakovala.
- `git diff --check` **PASS**. Neběžel build, full suite, integrace, Blender ani GPU test. Native CPU fixtures nahrazují device/shader IO a nejsou dokladem GPU obrazu nebo výkonu. Praktickou kontrolu startu NCM provede root s další dokončenou funkční verzí, ne novou velkou sadou kvůli drobnému checkpointu.

Přesné zdroje/diff/logy: `.cache/trees-webgpu-startup-20261026/ncm-followup/manifest.json`. Další práce vlastní root: skutečný Edge/GTX1060 startup, NCM sezónní parita a srovnatelné měření, pokud bude tento experiment pokračovat. Funkční CM zůstává k dispozici pro dokončování stromů.
