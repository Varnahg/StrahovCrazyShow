# Grafická větev D: menší CPU zásek při načítání stromů

Práce navazuje na6805bcd4 v explicitně zadaném D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104, větev codex/graphics-smoothness-20261104. Původní C/main, produkční8080 a cizí WIP se nemění. Příprava prostředí a úzké povolení D v existujícím harnessu:613da4a0cfc62b97e9638a2b18d1843b29148e6c.

**Aktuální výsledek:** privátní dekódování stromových detailů využívá atributy, které už v témže synchronním volání ověřilo. Odstraněny opakované finite průchody, zachované type/componentType/bounds/index/unused-data kontroly. Veřejný readTreeGlb dál prověřuje pozdější mutace bufferu a JSON. Modely, LOD, sezóny, materiály, shaderové vstupy a fetch/abort lifecycle zůstávají stejné.

## Proč tato změna

[Průzkum](research.md) odděluje post-fetch CPU LoAF112–529ms od delších4–7,5s mezer s malým JS a prací GPU procesu. Předchozí resync guard odstraňuje redundantní server reset; neřeší tyto renderové prodlevy. Profil konkrétních produkčních crown032/033 ukázal větší cenu decoderu než řazení listů. Proto se v tomto celku nemíchá counting sort, worker ani další LOD změna.

## Naměřený CPU výsledek

[Stejný měřič](tree-cpu-profile.mts) používá skutečný decoder, season plán a createPilotMeshes nad NullEngine. Načtení dat, material setup a explicitní GC jsou mimo intervaly. První běh je zachovaný zvlášť; tabulka uvádí medián sedmi dalších opakování. Season je podmnožina createMeshes, celkový údaj sčítá jen decode+createMeshes.

| Model | Decode před → po | Celá CPU příprava před → po | Změna celku |
| --- | ---: | ---: | ---: |
| crown032 MID |183,37 →83,23ms|247,53 →151,22ms|−38,9%|
| crown033 MID |130,97 →59,88ms|164,91 →91,00ms|−44,8%|
| crown032 malý FAR GLB |4,98 →2,39ms|6,60 →4,07ms|−38,4%|

[Baseline](tree-cpu-baseline.json), [kandidát](tree-cpu-candidate.json), [výpočet podmínek](tree-cpu-comparison.json). Oba MID překročily předem zvolených20% pro decode a15% pro celý CPU úsek; malýFAR se nezhoršil. Samostatný season čas maléhoFAR kolísal0,45→0,93ms, ale tento kód se nezměnil a netvoří samostatný přijatý výkonový claim. FAR GLB neobsahuje celou v4clusterovou korunu.

Tohle je **CPU měření v Node, nikoli GPU/FPS zisk nebo oprava několika sekund čekání prohlížeče**. Počítač/takty nejsou laboratorně řízené; skutečná hra vyžaduje samostatný důkaz. Rozdíl dekódovaných dat se neodhaduje podle screenshotu: [baseline bytehashy](decode-parity-baseline.json) a [kandidát](decode-parity-candidate.json) jsou shodné pro všech12 částí6 skutečnýchGLB (crown032/033, LOD0/1/2), včetnětypů pozic/normál/UV/indexů/barvy. [Reprodukce parity](decode-parity.mts).

## Správnost a rozsah

- Nové regrese pokrývají wrong-type cachehit, componentType, nepoužitéNaN/Infinity/bounds, tvar a rozsah indexů, dvě oddělená decode volání, veřejnou následnou mutaci a plnou legacy chunk validaci.
- Leaf cílená sada64/64 PASS; po doplnění poslední legacyNaN regrese finální nový soubor7/7 PASS. Původní streaming testy nebyly upraveny.
- Scoped i celý TypeScript PASS. Nezávislé čtecí review runtime/test diffu bez nálezů. Finální kompletní sada, produkční build/SDK a Edge jsou v navazujícím ověřovacím checkpointu; zatím se nezaměňují za dokončenou globální přejímku.
- Cache je malá lokální mapa uvnitř jednoho synchronního decode. Žádná persistent cache, nový worker, přesun buffer ownership či další GPU prostředky. Výstup ji nedrží; kopie celého parseru nevzniká.

## Zbývající delší mezery

NVIDIA GPU proces v uloženéA75 relaci při4–7,5s mezerách zaměstnává zhruba jedno CPU jádro, zatímco renderer má malýJS čas aGPUutil0–6%. To připouští driver/pipeline/buffer práci, ale není to callstack konkrétní příčiny. Babylon9.30 pipeline key závisí na shader/layout/render-target stavech, nikoli samotném novém buffer ID nebo počtu trojúhelníků;16/32bit indexy nejsou pro triangle-list stripIndexFormat klíč.

Existující post-ready logy nemají potřebné pipeline delty. Běžný kompletní benchmark je však obsahuje v compilation.start/end (shaderModule, syncPipeline, asyncPipeline, submit, cachemiss a pending/completion); serverový whitelist toto pole vynechává. Plánovaný jediný Edge průchod proto zachová i celé UI reporty mimo časované intervaly. Lifecycle upload čítače dodá existující profileFrameLifecycle=1. Ani kladná pipeline delta sama nevysvětlí celou driver pauzu; nulová by vyřadila nové aplikační kompilace daného intervalu.

## Dokončené ověření 4.11.2026

- Celá sada: **3085 PASS /0 FAIL /5 SKIP**, celkem3090, exit0; [log](full-test.log.gz), [receipt](full-test-result.json.gz). Trvala1510,3s a neběžela souběžně sGPU měřením.
- Celý TypeScript: [výsledek samostatného tsc](typescript-result.json), bez diagnostiky; není schovaný pod Vite logem. [Produkční Vite build](production-build.log.gz) a [SDK integrace](integration.log.gz), [receipt](integration-result.json.gz) PASS. Jde o jednu finální sadu a jeden produkční build; žádný další runtime zásah po jejich checkpointu.
- Zdroj/test SHA **3fe11a12ebd947e03581444e08f1b15b707f34abd6ec827badcb236841ef6132**, [build manifest](build-identity.json.gz). Public content45f088a91dbdc53456e8cfebb6fc50a2d3cd6914e9eba8ed197a946e947d2416; installed dependency52a77a182027e42a8c06d7e3f2c032ffe14f8c6a6a235efa11bc31e12955b9f6. Snapshot zahrnuje testy; runtime aAPI se shodovaly.
- Edge/WebGPU CM, GTX1060, CSS/backbuffer1280×720, Medium, cíl60FPS, pevnýday/autumn a označenéQA počasí. Dvě skutečné SDK relace měly neutrální vstupy a různé avatary. Hra dosáhla ready vprvnímstartu; příprava Medium36,66s/High3,48s/Low21,55s, dohromady61,69s aktivnípřípravy, bez změny60/180s limitů. Celýstartup zahrnuje další práci; ready při111094,3ms odpočátku klientského záznamu.
- Funkční chůze bez teleportu načetla **4 další soubory /43 941 676B** a změnila aktivní stromovéLOD. Oba [úplné UI reporty před](edge-before.json) a [po chůzi](edge-after.json) mají stejnougeneration1, healthvalid=true, asset/render errors0 a observerErrors0. Snímky [spawn](edge-spawn.png), [průchod](edge-walk3.png). Hodnoty29,6 a38,8FPS jsou různé pozice téhož instrumentovaného buildu, **ne A/B zisk opravy**.

### Co zůstává nevyřešené

[Celková offline přejímka](gameplay-acceptance.json) je **INCONCLUSIVE, exit3**, nikoli PASS. Snímkovývzorek současně porušuje limity: orientačně31,15FPS, p9547,8ms, p9959,7ms a maximum6083,9ms. Časové pokrytí je neplatné: seq872→892 má1,2ms překryv přes povolený1ms; seq1105 má598,1ms intervalů proti634,3ms oknu a seq7820 má780,4 proti819,2ms. Sekvence0–7866 nemá transportnídíru, ale to neopravuje časovépokrytí. Doloženýpohyb je konzervativně17,41s/89,13m;36s klávesovýchpříkazů ani602,7s viditelnosti nejsou souvislá pohybová přejímka. Žádný dalšíběh se nepoužil k přepsání tohoto výsledku.

[Delta čítačů během průchodu](edge-compilation-delta.json) je3shader preparations,6modules,3syncpipelines,0asyncpipelines/cacheMiss+3. SyncPipeline JS/API CPU byl jen0,2ms. Interval zhruba208,19–544,15s zahrnuje celou scénu včetně změn avatarLOD, **neobsahuje nejdelší6,08s zásek** v131,351–137,435s. Tři pipelines tedy tento zásek nevysvětlují.

[Širší delta mezi přípravou a prvním měřením](edge-prebenchmark-compilation-delta.json), která6,08s mezeru zahrnuje, ukazuje45příprav/90modulů/58syncpipelines,0asyncpipelines. Zahrnuje ale Low→Medium, denní/sezónní náhled a další čas; není izolací jednépříčiny. Async latence se překrývají a nesčítají jako GPUčas. Další potřebný důkaz je časově svázaná GPU-process stopa konkrétní pauzy s pipeline/upload/submit událostmi a CPU callstackem. Nezvyšovat timeout ani naslepo vracet shadercache nebo dalšíLODkalibraci.

[Úplný recording](edge-recording.jsonl.gz) a [systém](edge-system.jsonl.gz) jsou zachované. Systémovýsampler byl úmyslně zastaven před závěrečným UI úklidem; poslední obnoveníLow/odchodnení podložené jeho telemetrií. [Peers cleanup](edge-peers-cleanup.json) a [API/input cleanup](edge-cleanup.json) PASS; vlastní okno zavřeno, viewportresetován, původníLow preference obnovena. Porty2568/4179 volné;8080 nedotčené.

**Integrační rozhodnutí:** přijmout tento přesný CPU zásah s byteparitou, úplnými automatickými kontrolami a úzkým funkčním Edge důkazem. Širší plynulost a GPU-process příčina zůstávají otevřené vKEY-5. Nezávislé runtime review a datovýaudit bez blokujícího nálezu; opravený metadatový P3 harnessu je součástí613da4a0.

Původní PowerShell JSON receipty se zachovanými CRLF jsou archivované beze změny bajtů jako .json.gz; gzip round-trip ověřený. Nedochází k přepsání původních záznamů ani normalizaci jejich obsahu.
