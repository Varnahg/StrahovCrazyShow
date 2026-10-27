# Samostatné stromové LOD · rozhodnutí před implementací

Task `trees-20261025-streaming`, owner `trees-streaming-01a16b37`, baseline `8516c7b1`. Předané runtime WIP je doložené v runtime handoffu. Game, Vegetation, shader, litter a R5 vstupy mají jiné vlastníky.

## Zjištěný mechanismus a volba

V2 `loadPilot` fetchuje jeden GLB a dekóduje všechny tři LOD před prvním zapnutím. R4 vlastní dvojice má 74 674 952 zdrojových bajtů; její LOD2 atributy jsou přibližně 5,1 MB. Je doložen rozdíl payloadu, nikoli GPU/FPS nebo VRAM. Původní samostatný v1 detail scheduler již má limit dvou jobů a rezervace. Babylon 9.30 `Mesh.dispose(false,false)` uvolňuje poslední vlastní geometry přes `releaseForMesh`, zachovává zapůjčené materiály.

Porovnáno: ponechat monolit (nejmenší změna, stejná startovací alokace), HTTP range monolitu (nová server/cache a integrity sémantika), pouze rozdělit soubory a stále eager fetchovat (bez startovací úspory), nebo rozdělit soubory a načítat detaily podle potřeby. Zvolena poslední varianta: statické immutable GLB pro každý LOD, stejný SHA/bytes kontrakt, počátečně pouze LOD2, společný v1/v3 detail scheduler. Žádné přepisování geometrie, UV, normál, ranků nebo shaderů. V1/v2 a veřejné options/litter API zůstanou kompatibilní.

V3 přidá explicitní verzi manifestu, tři odlišné soubory na prototyp a validaci celého seznamu proti skutečným shared source ID, rootům a trunk radius. Počet a far součet mají konečný limit; celá populace je možnost kontraktu, nikoli tvrzení, že dnešní dvě pilotní identity nahradily 110 stromů. Detail cache a rozpracované rezervace sdílejí tvrdých 32 položek / 64 MiB; pro v3 jde o zdrojové GLB bajty, pro staré v1 zůstává konzervativní přídavek odvozených normál. Far pilot má samostatný 96 MiB admission cap. Geometry a season payload se evidují odděleně a nesčítají jako VRAM.

Při tlaku se vyřadí nejdéle nepoužitý neaktivní/nežádaný detail; pokud není místo, zachová se dostupné vzdálenější LOD. Po načtení se před aktivací použije aktuální root, požadované LOD a sezóna; explicitní zima nesmí pozdním načtením obnovit listí. Vlastník loaderu abortuje všechny fetch při dispose. Chybný detail se uklidí atomicky a zůstane far fallback. Neexistuje každoframové vytváření geometrie.

## Primární podklady

- Aktuální `client/tree-renderer.ts`, `client/tree-asset-loader.ts`, season geometry helper a runtime regrese, čtené 25.10.2026.
- Pinovaná lokální Babylon 9.30 implementace `Meshes/mesh.pure.js`, `Meshes/geometry.js`, `glTFFileLoader` a `glTFLoader` (disposal, GLB ownership, CCW konvence).
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout), čteno 25.10.2026: GLB JSON/BIN chunks a bufferView/accessor zarovnání. Export kopíruje pouze referencované view bajty, přemapuje indexy, zachová accessor metadata a node extras.
- Neměnný R4 `public/models/vegetation/seasonal/runtime-contract.json`. Produkční export vyžaduje samostatný `trees-20261025-streaming-export` heavy claim. R5 se tímto exportem nepřebírá.

## Ověření

Následují syntetické regrese samostatného LOD exportu/dekódování, skutečné source-byte identity, max concurrency, priority, cache/reservations, pozdní season/root/quality, partial cleanup a dispose. Žádný build, celá testovací sada, Blender ani GPU v authoring tasku. Výkonová a vizuální přejímka patří rootovi.

## Implementace a CPU přejímka

V3 zachovává původní `TreePilotOptions`: explicitní URL je `/models/vegetation/seasonal-streamed/runtime-contract.json`, výběr source/prototype zůstává stejný. V2 nadále dekóduje monolit a všechny jeho LOD. V3 počáteční far fronta má dva pracovníky; společný v1/v3 detail scheduler má nejvýše dva joby, nejprve požadovanou úroveň a potom vzdálenost. Při neproveditelném/neplatném v3 near může přijít mid; starý v1 fallback kontrakt se tím nerozšiřuje. Právě nahrazované pilotní source ID nespouští nové legacy detaily. Dřívější úspěch i chyba se kontrolují proti aktuální generaci skupiny.

Konstrukce pilotních meshů a jejich partial cleanup mají jednu sdílenou cestu. Normály a CCW zůstávají původní, žádné geometrické zjednodušení ani přepočet UV. Wood-only far je platný; materiálový pool proto vychází ze sjednocení deklarovaných rolí všech LOD a pozdní detail nepotřebuje další texture IO. Při eviction se uvolní vlastněné meshe/geometry, zůstávají sdílené materiály a zapůjčené litter zdroje. Rezervace se při commitu nahradí záznamem cache, nikdy se nezapočítá současně dvakrát.

Samostatný export task vytvořil 12 R4 souborů a ověřil všech 108 raw accessor bajtových sad včetně významových metadat. Vlastní dvojice má LOD2 soubory **5 112 460 B** proti původním monolitům **74 674 952 B**. URL nového kontraktu je výše, jeho SHA-256 je `4bbf10ef9de52176fc70f8dda30de57fe399dffd80821990b402a71676897e43`; vstupní R4 kontrakt `cdffb0aded889938b58fa7a4a54a4f1297bb6e2518471323971c0bc98390d59f`. R4 výstupy zůstávají neměnný checkpoint; pozdější R5 vyžaduje jiný adresář a novou rezervaci. Monolit může sdílet některé accessor ranges mezi LOD; samostatné soubory proto nemusejí v součtu zabírat méně místa. Počáteční payload se uvádí samostatně.

Finální cílený příkaz `node node_modules/tsx/dist/cli.mjs --test tests/tree-asset-loader.test.ts tests/tree-streaming.test.ts tests/vegetation-runtime.test.ts tests/vegetation.test.ts tests/tree-appearance.test.ts tests/tree-season-geometry.test.ts tests/tree-season-material.test.ts`: **48/48 PASS, 0 fail, 0 skip**, exit 0, 25,84 s. Log `.cache/trees-streaming-20261025/targeted-final.log`. `node node_modules/typescript/bin/tsc --noEmit --pretty false`: exit 0, prázdný `.cache/trees-streaming-20261025/tsc-final.log`. První TypeScript běh nových testů našel tři chyby testových typů (readonly poškozované fixture a Buffer/BodyInit); opraveno bez změny runtime. Původní diagnostika je zachována v `tsc-final-first.log`. Před exportem měl skutečný asset gate jeden záměrný skip, finální test už chybějící export nepřeskakuje.

Nezávislý čtecí reviewer našel a po opravě potvrdil dva okraje: starý v1 rejection nesmí otrávit v3 failure klíč a wood-only far musí připravit budoucí foliage material. Oba mají regresi spolu se smíšeným v1/v3 concurrency. Čtecí review samo znovu nespouštělo testy.

Zůstává **dva pilotní source stromy + 108 legacy**, i když v3 validace umí přijmout všech 110 známých ID. Legacy bootstrap proto dnešní pilot stále potřebuje. Žádné měření FPS/p95/p99, GPU paměti, kompilace nového herního snapshotu nebo obrazová přejímka neproběhly v tomto tasku. Source-byte cache nezahrnuje veškeré odvozené Float32 COLOR/season buffery ani dočasné kopie fetchu; ukazatele se částečně překrývají a nejsou VRAM.

## V4: společná banka vzdálených listových skupin, 26. 10. 2026

Root výslovně předal stávající streaming WIP agentovi `trees-v4-streaming-probe-20261026`. Zadání a nový rozsah jsou v task JSON; modeler vlastní nové bitmapové/native/modelové výstupy, root vlastní čistý parser banky a decoder placementů. Tento zásah je jejich runtime integrace, nikoli změna zdrojových kořenů, kolizí, výchozího manifestu nebo shaderů.

### Zjištění, varianty a rozhodnutí

Původní FAR nese jen podmnožinu přesných listů. Zachovat tento payload by nevyřešilo pokrytí koruny; rozbalit všechny zdrojové listy do FAR by výrazně zvýšilo soubory i vykreslovanou geometrii. Vybraná autorská alternativa používá dohledatelné rigidní skupiny a sdílený atlas. Runtime je rozbalí jednou při načtení do stejných sezonních atributů, místo zavádění dalšího instančního shaderu či změn existujícího větru. Blízké/střední GLB a nepřevoditelné FAR skupiny zůstávají přesné. Výběr, kvalita atlasu a skutečný GPU přínos mají samostatné důkazy modelera/roota; samotný kompaktní soubor není důkazem levnějšího snímku.

Primární podklady: aktuální loader/renderer a jejich původní v1–v3 regrese; `shared/tree-cluster-types.ts`, `client/tree-cluster-geometry.ts`; původní Babylon 9.30 `Texture`, `PBRMaterial`, mesh/geometry disposal a vlastní season geometry/shadow wrapper. Dohodnutý autorský kontrakt je `public/models/vegetation/seasonal-r6-far/runtime-contract.json`, publikovaný vlastníkem modelů. Root má nezávislé porovnání rozbalení proti skutečné autorské geometrii; tento task prováděl přenosné syntetické lifecycle testy.

### Kontrakt a vlastnictví

- V4 má `banks: Record<bankId, {url, bytes, sha256}>`, 1–16 bankových JSON nejvýše 2 MiB. Volitelný `prototype.farCluster` obsahuje `{bankId, placements: {url, bytes, sha256}, groupCount}`. Placement má přesně `32 * groupCount` bajtů, nejvýše 65 534 skupin. Detailní a FAR GLB mají nadále tři odlišné URL a původní mesh naming/extras.
- Banka drží karty v metrech/glTF Y-up a čtyři integrity popsané mapy. Decoder vyžaduje skutečné ranky z indexovaných fallback GLB trojúhelníků. Sentinel 65 535 v placementu nemůže sám deklarovat existenci chybějících listů; duplicity, vynechané a cizí fallback ranky končí chybou před vytvořením meshů.
- Sdílená banka se načte a parsuje jednou. Atlasové textury a materiál se také sdílejí; textura s jinou gamma/normal strength má jinou vlastní instanci. Zdrojové bajty se přesto počítají jednou podle URL a shodného SHA/bytes. Rozporné identity stejné URL se odmítají.
- Materiál karet je samostatný. Pouze na něj se vztahuje bankové `alphaCutoff` a `normalMapStrength`; vybraný atlas nyní uvádí `.2` a `1`. Přesný fallback, detail i opad nadále používají původní LeafSet. Ruční normal-map orientace, sRGB/linear sémantika, opacity alpha test a season/wind plugin zůstávají společné.
- Nové banky, materiály, mapy a meshe se nejdřív připravují odděleně. Při poškozeném payloadu, chybě dekódování textury, partial mesh allocation nebo zániku rendereru se uklidí nové zdroje; převzaté mapy ani již existující strom se neodstraňují. Publikace nastává po kompletní validaci a konstrukci. Pozdní detail zůstává pod původním limitem dvou jobů a použije aktuální transform/season.

### Rozpočty a refaktoring

V4 admission započítává unikátní vybrané FAR GLB, placement binárky, bankové JSON a atlasové mapy do existujících **96 MiB zdrojových bajtů**. JSON je nutné načíst před znalostí mapových descriptorů; mapy a geometrie se po jejich součtu nad limit už nenačítají. Detail zůstává 32 položek / 64 MiB. Základní existující Bark/LeafSet textury mají původní samostatnou evidenci. Metriky `treePilotSourceBytes` zahrnují GLB/placement/JSON, `treeTextureSourceBytes` mapy; expanded geometry a sezonní index/rank buffery jsou samostatné metriky, ne tvrzení o celkové VRAM.

PBR nastavení má jedinou sdílenou továrnu, staging používá společný cleanup a geometry konstrukce stále jednu cestu. Statistiky unikátních souborů se přepočítají pouze po load/eviction/clear; běžný frame nevytváří nové deduplikační mapy nebo geometrii. Vyhodnocení zimy se vztahuje na karty i přesné fallback listy v neaktivních LOD.

### Cílené ověření

- `tests/tree-cluster-streaming.test.ts`: **9/9 PASS**, `v4-lifecycle-final.log`. Sdílení bank/maps, source accounting, samostatný atlas/fallback/detail/litter, winter late load, skutečná rank coverage, budget, SHA corruption, partial allocation, rollback s půjčenými již publikovanými mapami, dispose při bank/atlas IO a wood-only fallback.
- Nezměněné `tests/tree-asset-loader.test.ts` + `tests/tree-streaming.test.ts`: **26/26 PASS**, `v4-compatibility.log`. Zahrnují v1/v2/v3, původní R4 raw accessor shodu a detail/cache lifecycle.
- První cílený TypeScript projekt nad runtime a testy: **PASS**, dokončený tool session 50923, `v4-types.log`. Následná kontrola po dvou přidaných lifecycle testech má prázdný `v4-types-final.log`, ale výstupní wrapper nezachoval její ukončovací status; není vydávána za samostatný doložený finální PASS. Finální typovou přejímku pokryje jediný plánovaný produkční build roota, bez dalšího opakování této sady.
- Kontrola whitespace rozdílu proti v11 pro tři runtime soubory nevypsala chybu. Snapshot/diff je `.cache/trees-streaming-20261025/v4-followup/manifest.json`.

Neběžel build, celá sada, integrace, Blender ani GPU. **Automatické trilineární mipmapy atlasu dosud nejsou prakticky přijaté**: nativní masková shoda a padding nejsou důkazem potlačení prolínání buněk v Edge. Root řeší skutečné snímky nové dokončené funkce a případnou navazující opravu; výchozí Game/QA cestu tento agent neměnil.

## Explicitní načtení úplného katalogu, 26. 10. 2026

Koordinátor znovu výslovně předal streaming WIP agentovi `trees-catalog-loader-20261026`. Vstupní problém: Game by při aktivaci všech modelů musel duplikovat mapu 110 source/prototype výběrů v kódu, nebo by runtime bez explicitního souhlasu přebíral vše z libovolného pilotního manifestu. Porovnány byly hardcoded mapa, automatická aktivace libovolného manifestu a samostatný integrity descriptor kompletního katalogu. Vybrána poslední možnost: minimální explicitní konfigurační vstup, stejné zdroje pravdy a ověřená stávající load/cache cesta. Primární podklady byly aktuální `loadAll`, `validatePilot`, staging/cleanup, `jsonAsset`, shared `TREES` a existující v2/v3/v4 lifecycle regrese. Žádný asset, geometry decoder nebo source generátor se neměnil.

Nové options API je `treeCatalog?: TreeAssetFile`, vzájemně výlučné s `treePilot`. Finální descriptor poskytne vlastník exportu; zde nebyla přidána URL do Game ani zapnuta produkční populace. Manifest se načte jednou přes byte/SHA kontrolu. `jsonAsset` nejdřív validuje lokální modelovou URL, kladnou celočíselnou velikost do 2 MiB a SHA; descriptor zkopíruje před await, takže změna původního options objektu za běhu neovlivní integrity kontrolu.

Katalog musí být streamovaný v3/v4, obsahovat přesně aktuálních **110 známých source identit**, stejný počet prototypů a právě jednoho kandidáta pro každý source. Není vybírán první z nejednoznačného seznamu. Přesně jednou se vytvoří a zmrazí source → prototype mapa; pak se použijí původní root/trunk/candidate, GLB a bank/placement validace i rozpočty. QA selections se také kopírují a zmrazí při vytvoření rendereru. Žádná pozdější větev znovu nečte mutable `options.treePilot.selections`.

Validní kompletní katalog používá stejnou počáteční FAR frontu a nastaví `bootstrapBytes = 0`; starý 76MB bootstrap se nenačítá. Chyba konfigurace, neúplný/neznámý/nejasný seznam, integrity chyba nebo runtime allocation problém se zapíše do `loadError` a načte se **celá původní populace**. Při chybě prvního použití již publikovaných katalogových meshů se před legacy fallbackem odstraní i tato populace; fallback nesmí přidat druhých 110 stromů. Dispose přeruší vstup a nespouští nový fallback.

Nový `tests/tree-catalog-loading.test.ts` pracuje se skutečnými malými syntetickými GLB pro všech 110 shared identit a skutečným compact decoderem. Nahrazuje pouze HTTP/bitmap IO a těžký legacy import; volbu fallback větve ověřuje úplnou syntetickou legacy populací. Nejedná se o obrazovou přejímku hotového katalogu.

- Sedm prvních katalogových případů **PASS** (`catalog-first.log`): cold full load bez bootstrapu, partial/unknown/ambiguous rejection, vzájemná výlučnost a SHA, rollback posledního staged source, late LOD/winter/transform, nezávislost na mutable descriptoru a dispose během fetch.
- Dodatečná úzká regrese chyby po publikaci celé populace **1/1 PASS** (`catalog-published-rollback.log`). Dříve prošlé katalogové případy se neopakovaly.
- Cílené původní případy v2/v3/v4: první běh **11 PASS / 1 FAIL** (`catalog-compatibility.log`). Jediná chyba byla testová synchronizace: 12 `setImmediate` ticků při souběhu s types nezaručilo doběhnutí skutečného SHA digestu. Fixture nově čeká na konkrétní čtyři atlasové požadavky s 5s testovým limitem; opravený případ **1/1 PASS** (`catalog-atlas-dispose-corrected.log`). Produkční čekání ani timeout se neměnily.
- Cílený TypeScript projekt **PASS**, zachovaný exit 0 v `catalog-types-result.json` (session 11386). Poté se změnila pouze synchronizace uvedené fixture a přibyl poslední rollback případ; finální build roota ověří celé sjednocené typy.

Refaktoring zrušil dva hardcoded přístupy k QA options ve sdílené load cestě a zavedl jeden immutable výběr. Nezměnil formát GLB/clusterů, sezonní výpočty, zdrojové rooty, cache limity ani backend. Žádná celá sada, build, integrace, GPU nebo Blender. Snapshot nové návaznosti: `.cache/trees-streaming-20261025/catalog-followup/manifest.json`. Root zapojí nové options a finální descriptor až po dokončení všech výstupů katalogu.

## Dokončení bez spuštění hry · rozhodnutí 27. 10. 2026

Uživatel převzal praktické herní testování a výslovně požaduje WebGL2 fallback. Čtecí audit prokázal, že samotný WebGL2 engine nestačí na vzdáleném HTTP: `TreeAssetLoader` volal bezpodmínečně `crypto.subtle.digest`, ačkoliv [SubtleCrypto vyžaduje secure context](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto). Stejná závislost se týká legacy fallbacku. Porovnáno: vyžadovat HTTPS (omezuje kompatibilitu, nepokrývá tento fallback), vynechat integrity kontrolu (nepřijatelné), přidat novou knihovnu (v projektu není deklarovaná vhodná přenosná implementace), nebo úzký fallback podle [FIPS 180-4, SHA-256 §6.2](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf). Zvolený helper preferuje native SubtleCrypto a jeho skutečné chyby propaguje. Pouze při absenci API použije blokový výpočet s pevným pracovním polem, bez kopie vstupu, s kooperativním uvolněním event loopu a AbortSignal. SHA kontrola se nezruší; nejde o náhradu autentizace přenosu HTTPS.

Druhý doložený rozdíl: native katalog nastavuje raw normal-map Strength 0,45 (`materials.py:22`), zatímco runtime nechával výchozí Texture.level 1. Připnutý Babylon glTF loader převádí `normalTexture.scale` přímo na Texture.level. Zvolená lokální kalibrace 0,45 platí pouze pro nově vytvořené raw materiály. Původní vypůjčený Bark se nemění; FAR banka zachová svou vlastní hodnotu 1, protože 0,45 již obsahuje pečená mapa. Nemění se fotografie, UV, geometrie ani generátory. Ověření bude omezené na přenosné hash vektory, chyby/abort a izolované materiálové regresní případy; žádná hra, browser, server, GPU nebo Blender.

### Implementace a offline ověření

`assetSha256(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<string>` vrací hex SHA-256. Vstupní pohled včetně byteOffset se nekopíruje; volající vlastní jeho neměnné bajty. Fallback používá osm stavových slov, jeden 64slovový schedule a pouze 64/128B padding. Zpracovává nejvýše256KiB před dalším kooperativním taskem. Abort ruší čekající timer/listener; native výpočet nelze zastavit, ale jeho pozdní výsledek/odmítnutí je pozorovaný a zrušený vlastník jej nepřevezme. Sdílený nebo během výpočtu odpojený buffer se odmítne. Existující SubtleCrypto se skutečným selháním se nepřepne na fallback. Loader předává svůj původní AbortSignal a dál ověřuje byte length i očekávaný SHA.

Nový helper má **7/7 PASS**: pevné standardní vektory včetně milionu `a`, srovnání s nezávislým Node crypto na padding/block/slice hranicích a nenulovém offsetu, native preference bez kopie, propagace odmítnutí, promptní abort a pozdní rejection, skutečné uvolnění event loopu u2MiB, odmítnutí sdíleného/odpojeného bufferu. Loader/materiálový výběr má **6/6 PASS**: actual fetch→hash bez SubtleCrypto, korupce, dispose při hashování, původní coalescing, nové raw mapy0,45, borrowed Bark beze změny a atlas s vlastními hodnotami0,75/1. Tyto isolated CPU případy nespuštěly Game ani herní server. Úzký TypeScript **PASS**. První typový pokus byl pouze chybou zápisu cache configu v shell příkazu; log zachovaný, skutečná typová kontrola následně skončila0.

### Skutečný rozsah FAR dat

Hotový `runtime-audit-all-4c6cf8495993.json` pro110 zdrojů uvádí3 255 786 card tri a318 551 exact/wood tri, celkem **3 574 337 FAR trojúhelníků**. Historický legacy FAR měl256 428, tedy současný celý katalog má přibližně13,94násobek. Ze skutečných počtů a šířek indexů decoderu (62zdrojů Uint16,45 Uint32) vychází **345 539 832B card polí**:312 555 456B vertex atributů a32 984 376B indexů. Exact/dřevo, další sezonní indexy, rank tabulky, textury a engine/GPU kopie jsou navíc. Jde o odvození z hotových dat a layoutu, nikoli měření VRAM nebo FPS. Zdrojový admission rozpočet49,5MB se nesmí vydávat za celkovou renderovou paměť či optimalizační důkaz.

Praktické posouzení vzhledu, vysokých atlasových mipů, přepnutí LOD a celého výkonu podle nového výslovného pokynu provede uživatel. V této návaznosti se neměnil žádný asset, source-byte limit, renderer backend nebo výrobní recept a nepřidával se neověřený instancing pipeline.
