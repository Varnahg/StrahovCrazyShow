# Neměnná hra B1+B6 k uživatelskému testu

URL http://127.0.0.1:2590/; source-v3 841637d90c3a7d5ad99114ee1a0b76001edfc8093f8775353a5b18f6f5eb0ed5. Samostatný produkční server, bez HMR, HOST127.0.0.1,STATIC_DIRabsolute source-v3/dist. Vlastní ověřený NodePID26016, tool session9116, log b01-playtest/server-v3.log. Živý port2590 zůstává rezervovaný ownerovi cad-buildings-01a16b37-playtest. Pro pozdější STOP nejdříve ověř PID,commandline a skutečný port, neukončuj cizí proces podle portu.

V1 server53664 ukončen po kontrole vlastní identity; V2 nebyl servírovaný. V3 má8606 souborů a nezměněné runtime/test vstupy protiověřenémuV2 plus3 statickéfixtures. Reference7038IPRfiles se sdílejí pouze s předchozí neměnnou vlastní kopií; originální authordata se nekopírují doGitu. Node_modules je vlastní frozenpnpm instalace přes junction, package/lock svázanýmanifestem.

## Přijatý herní checkpoint B1+B6, 24.10.2026

Aktuální rozsah jsou pouze B1 a B6: samostatné editovatelné Blender modely, konstrukční interiéry podle půdorysů, odvozené IPR2023 textury a rigidní usazení. Nativní GLB a fyzika používají stejnou geometrii i transform. Původní CAD soubory a jejich kopie nejsou v Gitu. Chybějící svislé kóty, tloušťky některých krytů a rozdíly historických podkladů jsou popsané v modelech; nejde o nové zaměření ani kompletní vybavení pokojů.

Modelové commity: B1 foto `30c13354`, B6 `dea1b67f`; runtime a regrese `a31f743a`. Finální izolovaná produkční hra: **http://127.0.0.1:2590/**, source ID `841637d90c3a7d5ad99114ee1a0b76001edfc8093f8775353a5b18f6f5eb0ed5`. Žádný HMR. Uživatelův původní primary-main WIP zůstal nedotčený.

### Skutečné výsledky

- Souvislé finální full-world přehrání skutečného Actoru: **B1 574/574, B6 1406/1406 dveřních bodů**, všechny sessions PASS, bez teleportu/recovery. Samostatné schodišťové průchody **44/44 a 74/74 směrů**. B6 obsahuje šest vyšších terasových prahů a jeden venkovní P01 návrat ověřený standardním skokem, nikoli zvýšeným autostepem.
- Nativní exportní audity ověřily Blender/GLB trojúhelníky, normály, UV, PBR a packed PNG; Babylon skutečný GLB transform a společné terrain/render kolize prošly. B6 má372 vzorků světlosti/opory PASS. Finální overall, všech osm půdorysů a tři dokončené interiérové rendery B6 byly prohlédnuté. Další obdobný render batch byl vědomě ukončen; tyto nevytvořené obrazy nejsou označené za důkaz.
- Úplné `pnpm test` nejprve dalo1943 testů:1914 PASS,27 FAIL,2 platformní skip,1622,65s. Následovaly doložené opravy starých fixtures a skutečných návazností: kritický CAD startup, navigační capsule, NPC výška a17,5mm near-flat DEM hover. Přísný3mm limit stability zůstal; finální residual range0,156mm. Nezměněné dlouhé autodev/coordination testy již prošly a neopakovaly se.
- Finální produktová sada s concurrency4 ve frozen-v2:1786 testů,1781 PASS,3 chybějící static fixtures,2 platformní skip. Frozen-v3 doplnil pouze Dockerfile,compose.yaml a diagnostický JSONL; **všech8603 ostatních hashů je totožných**. Tyto tři testy nyní PASS. Celý produktový rozsah je tedy **1784 PASS a2 platformní skip** napříč tímto doloženým během a doplněním, nikoli tvrzení nového jediného plného pnpm test běhu. Dvě původní WGSL readiness chyby se izolovaně i v tomto běhu neopakovaly; shader ani timeout se neměnily.
- TypeScript a produkční `pnpm build` frozen-v3 PASS. Plná izolovaná `pnpm test:integration` nad totožnými runtime/test vstupy frozen-v2 PASS, protokol12, společný svět, vlastní odpovědi, pohyb/vozidlo/recovery a feedback hranice. Port2568 byl po testu uvolněný.
- Skutečná hra v Edge/WebGL2 na **GeForce GTX1060**, medium, CSS i interně **1528×650**, tři současné skutečné relace a tři různé avatary: **59,2 FPS**, p95 **19,5ms**, p99 **25,1ms**,10s. Renderer ready/valid,0 render chyb,0 asset chyb. Oba CAD modely skutečně načtené:225meshů/49materiálů. Jde o tento denní pohled a konfiguraci, nikoli slib výkonu všech scén nebo optimalizační srovnání. Dva pomocní SDK hráči byli následně odpojeni.

Důkazy jsou v lokální vlastněné cache: `world-paths/{b01,b06}-final-world.json`, `b01-playtest/{final-game-tests.log,supplemental-fixtures-v3.log,v2-v3-equivalence.json,build-v3.log,integration-v2.log,benchmark-v3-medium-three-peers.json}` a `publication/final-evidence.json`. Snapshot obsahuje testy i všechny jejich použité statické vstupy. Venkovní cestování před anotovanými vstupy a všechny kombinace dynamické dopravy nejsou zahrnuté do tvrzení o úplném dveřním pokrytí.


QA SDK helper byl ukončen přes vlastní stopfile; obě relace korektněleave, žádné testovací zprávy jiným lidem nebyly odeslané. Uživatelská karta má být ponechána pro hraní, podklad ani build se během testu nemění.
