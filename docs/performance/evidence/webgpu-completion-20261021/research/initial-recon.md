# KEY-22: současný řetězec před novou GPU reprodukcí

Základ je přijatý main9341bcef; metadata větve jej nemění. Pin Babylon9.30 a konkrétní installed/patch SHA jsou v current-source.json. Průzkum provedli tři disjunktní čtecí agenti renderer/editor/performance, bez změn kódu nebo GPU běhu. Tento záznam není výkonová přejímka.

## Doložené současné mechanismy

Všechny 3D vstupy už používají jednu asynchronní factory. Game přebírá engine; editor má generation/abort/late cleanup, submitted-frame readiness, on-demand frame scheduling a device-loss terminaci bez tichého fallbacku. selectRenderBackend však bez query vybírá webgl2 a WebGPU zakazuje mimo loopback. KEY29/30 tedy vyžadují aktuální GPU přejímku, ne druhou implementaci factory.

Shadow include closure, nativní WGSL normal/fragment oprava, tree wrapper freshness a terminální endFrame veto jsou přítomné v main. CPU regrese používají skutečný shader processor/části pinovaného enginu, nikoli skutečné GPU. Custom ShaderMaterial wrappery s explicitními remapy mají jiné ABI; bez reprodukce se na ně obecný freshness guard nerozšiřuje.

F3 serializer, exact shadow effect sharing (DrawWrapper/context zůstávají vlastní) a atomic garment konfigurace jsou přijaté. First-UV guard není přijatý a novější uv-dirty-profile měl šest ≥100ms záseků při nule UV notifikací. Samotný starý UV mechanismus proto není doložená univerzální oprava dnešních hitchů. Medium/High vehicle příprava je stále nepřijatý kandidát; pět zbývajících programů dřívějšího g2 byly shadow SPOTLIGHT rodiny.

## Varianty a rozhodnutí pro první reprodukci

Nejmenší kandidát je normální WebGPU compatibility mode s existujícími opravami, nejprve na plné současné produkční hře. NCM je samostatná měřená varianta: současný startup async adapter je při compatibilityMode=false inert. Dvě různé kostry mohou sdílet garment material; oficiální caveat je riziko binding/bundle churn, nikoli již reprodukovaná obrazová vada. Pinned owner-keyed UBO je upstream mechanismus. Preventivní klonování materiálů, plošná nová cache nebo freeze by změnily cenu/ownership bez důkazu.

Původní backend matrix má jen1GL+1CM, jinou dopravu a žádný NCM engine. Proto je nutná nová srovnatelná série. Game.trafficInstant řídí také local simulation, ale server používá TimelineSimulationClock; jakýkoli budoucí QA traffic clock musí sjednotit render i autoritativní obstacles a během měření dál postupovat. Prosté zmrazení pouze klienta ani samotný lighting timeOverride nejsou korektní řízená herní trajektorie.

První neměnný main preflight použije existující produkční build/UI/benchmark a je diagnostický: zjistí skutečný adaptér, startup, shader/health a zbylé chyby. Nemá doložit kauzální FPS gain ani splněný finální cíl. Pro finální přejímku bude potřeba společný čas/scénář, skutečné1/3MP relace s různými avatary/HUD, raw intervals, přesné backend/MSAA/rozlišení, samostatný cold a steady scope a kontinuální systémové takty/teploty. Pro NCM samostatně dvě odlišné kostry se stejným garment family/part/color a odlišným pohybem.

## Podklady a meze

Aktuální zdroj/testy/installed pin, docs/performance/webgpu-migration.md a úzké poslední reporty f3-backend-matrix, medium-cpu-profile, uv-dirty-profile, first-uv-qa, garment-init-qa, shadow-share-native a medium-vehicle-qa. [MDN requestAdapter](https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter) potvrzuje secure context, null adapter a pouze doporučující powerPreference; [device.lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost) vyžaduje nový device/resources po ztrátě. [Babylon NCM](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/) a [misc](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUMiscellaneous/) stanovují měřit skutečné bundle reuse, materiálové vlastníky a invalidaci. Agent renderer nedostal odpověď dvou externích dokumentačních stránek; jeho závěry vycházejí pouze z pinovaných primárních zdrojů. Editor/performance agent oficiální stránky přečetli.

Původní WebGPU worktree má rozpracované pouze metadata; nepřebírají se.134dirty cest shared primary, čtyři obsazené KEY21 scopes i uživatelovy veřejné herní karty zůstávají nezměněné. Před novým měřením je nutná skutečná kontrola konkurujících scén. Celá migrace je stále In Progress, default se zatím nemění.
