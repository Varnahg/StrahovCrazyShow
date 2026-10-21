# Průběžné předání: KEY-22 praktická přejímka21Oct2026

Koordinátor a vlastník: webgpu-completion-01a15a3e-validation v pracovní kopii `.cache/player-feedback-20261020`, větev `codex/webgpu-completion-20261021`. Rezervace nadále aktivní: vlastní API/preview služby nejsou ukončené. Release ani přijetí migrace se tímto nevydává.

## Skutečně provedené kontroly

- Původní main9341bcef:3 skutečné WebGPU a1 WebGL reprodukce měly přibližně1Hz prezentační RAF a light startup timeout. Raw důkazy v sousedních preflight JSON; příčina není označená za GPU výkon. Editor všech6presetů má samostatné ready obrázky, nikoli dřívější mezistavy při rychlém přepínání.
- Snapshot candidate1 `40a3639c…` obsahoval8561 vstupů. Celá lokální sada skutečně skončila1912PASS/9FAIL/2SKIP/0cancel z1923 za1,529,070ms. Přesný log hash a9příčin zachovává `validation/candidate-1-full-tests.json`.6VM startup fixture opravujea5c7ed5d (22/22),3chybějící statické snapshot vstupy517361c8 (9/9). Pozdější celý PASS se z těchto cílených testů neodvozuje.
- Vanilla candidate2 `97863f520c22d6fab05349530ea84c88d4063226ef57b276e2078619a066bd67` / testovaný source head517361c8:8564 skutečných runtime/test/asset souborů, po buildu byteově ověřených. Původní produkční zdroje/config, žádný QA transform/clock. TypeScript+Vite build PASS19,39s.18 skutečně servírovaných bundle souborů má shodné SHA.
- Izolovaný plný `pnpm test:integration` na2568 PASS:12 autentizovaných peers v jednom světě, SDK vozidlo/respawn/movement/ack/rejoin, protokol11 timeline/burst/recovery, izolace hosta i veřejného HTTP, durable feedback duplicate/conflict/malformed. Raw integration.log zachovaný;4002 jsou očekávané testovací odchody.
- build.log/integration.log zachovávají přesné stdout bajty včetněCRLF, trailing spaces a finálního prázdného řádku; jejich SHA je vverification.json. Hlášení git whitespace kontroly pouze na těchto raw logách není důvod změnit důkaz. Ostatní vlastní staged texty prošly běžnou kontrolou.
- Skutečný editor i MP hra bez query na2597 používají WebGPU (nvidia/pascal), ready.41 světelných variant dokončeno za28,805.7ms/741taskticks;247/247shaderprep,462/462asyncpipeline,494/494shader validation,0failure/pending a0GLSL→SPIRV. Celý game-ready v67,586.3ms od page; renderer-ready v26,002ms. Konzole bez pozorovaného warn/error.
- Obraz actual feedback dialogu obsahuje automatický snímek bez HUD. Nic nebylo odeslané; serverový provider credential je v procesu prázdný. Blob download browser nepodporuje, proto jde o vizuální kontrolu náhledu, nikoli tvrzení exportu přesných blob bajtů. Stale native AX text „Přijato“ se v čerstvém DOM nepotvrdil; formulář byl prázdný s disabled Odeslat.

## Otevřené přijetí

Skutečné hraní přetrvává kolem1FPS/1015ms raw intervalů, zatímco CPU frame přibližně16–26ms a GPU timer nedostupný. Uživatel požádal přepnout test dopředu. Browser management úspěšně nastavil window focused=true, ale test tab je active=false. `tabs.update active:true` bylo odmítnuto jako unsupported; samotné window focus frekvenci nezměnilo. Tento rozdíl je doložený stav, ne důkaz přesné interní příčiny Edge nebo GPU nedostatečnosti. Produktové RAF, browser flags a nastavení nebyly měněné.

Žádný1Hz interval není přijat jako GPU výkon. Úplná funkční/obrazová matice, srovnatelné WebGL/CM/NCM série,1/≥3 skutečné renderované relace, thermal/clock a60FPS/p95/p99/hitch cíl zůstávají otevřené. QA helper07b3e1cd… má31/31CPU PASS a je převzatý do větve545724c5; actual clock server/client hooky dosud neověřené. Default kandidát není publikovaný do main. Required project-acceptance se nevydává před praktickým přijetím.

## Pokračování a vlastnictví

Aktuální produkční URL je `http://127.0.0.1:2597/` bez query. Nejde o HMR. Přesné procesní PID/start/path a vlastní exec sessions jsou pouze v ignorované root validační cache, zejména `candidate-2/runtime.json` a preflight runtime. Před ukončením ověřit vlastní identitu, nikdy neukončovat proces podle samotného portu. Baseline API2596/preview4211, diagnostický4212 a vanilla2597 jsou vlastní oddělené služby; cizí4188 a cizí worktree nebyly změněné.

Před dalším GPU měřením ověřit skutečnou aktivní kartu, URL/backend/source a běžící3Dscény. Neměnné snapshoty se nepřepisují. Nové QA clock služby případně nahradí až ověřeně ukončený vlastní vanilla2597, nikoli baseline2596. Rezervace resources a konkrétní výstupy zůstávají podle task JSON/společného registru.
