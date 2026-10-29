# KEY-67 · průběh integračních oken

Vlastník `rag-auto-integration-01a17e9d`, pracovní kopie `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`. Tento záznam není přijetím celého automatického ingestu.

## První preflight accepted-main synchronizace

Ověřovaný vlastní HEAD `0ff4209cfbf854066530c8ee4802f3f2ede81770`, přijatý main `801b2d07c884c51e42b0fc1a890e7a0f9dbc0196`. Vlastní předchozí checkpointy: routing closeout `14218a50`, acquisition `3d445f08`, extractor `0ff4209c`. Index byl prázdný; untracked KEY-67 metadata/PDF komponenta zůstaly nedotčené.

Při vlastním úspěšném integračním claimu proběhl pouze `merge-tree` a čtení očekávaného diffu/živých vlastníků. Předpokládaný tree `d6830ca5225dee7ee54b6cd07dd7a3f14f35fe38` má přesně dva add/add konflikty, oba ve vlastním research scope: `spec-key-68-decisions-routing.md` a `decisions/verification.md`. Vlastní verze mají konečné přijetí, main starší předintegrační evidenci; řešení má zachovat vlastní closeout. Žádný source/runtime konflikt.

Ostatní incoming cesty jsou již přijaté Jantar UI/assets/testy a dokumentace. Zdrojové UI nemá aktivního writera. Překryv živých vlastníků je pouze v přijatých Jantar/tree-wait task JSON (admin) a dvou publikovaných serving handoffech (Jantar). Konkrétní byte-identický import těchto metadata souborů do této pracovní kopie byl před fyzickým merge předán oběma vlastníkům. Jejich jiné pracovní kopie ani frozen služby se nemění.

Fyzický merge dosud neproběhl. Nebyl spuštěn build, fullsuite, DB, Docker, GPU, listener ani placené API. Žádné vlastní pomocné procesy neběží; po tomto mezihandoffu se všechny čtyři integrační resources uvolňují během čekání na předání překryvu. Před samotnou synchronizací nový claim a čerstvý preflight/hash WIP.

## Dokončená synchronizace

Po předání byl získán nový claim. Jantar výslovně předal pouze byte-identický import dvou publikovaných serving handoffů; před fyzickým merge byly ověřeny jejich incoming bloby `c4413d3f404f13dd4ca503041dcaba2dca14d9b2` a `3ed04c447a72207b20f7ad4b22374a51873acf96`. Provozní cache/porty se nepředávaly. Admin potvrdil, že krátký private sync neblokuje jeho následný dokumentační checkpoint; jeho jiné pracovní kopie se neměnily.

Výsledek: **`0f80ac852e499b7cec1d19fa7bea81254254ba9c`**, tree **`c0dd6cefeae6685dc24f9b2c7b08b9683bf3dfa1`**, rodiče původní `0ff4209c` a accepted `801b2d07`. Přesně 57 skutečně změněných incoming cest bylo předem ověřeno jako byte-identické s accepted main. Dva vlastní add/add dokumentové konflikty zachovaly dokončený closeout; zdrojové soubory se ručně neupravovaly.

Hashy všech 20 untracked souborů zůstaly shodné před/po merge, stejně jako 26 kódových/datových souborů acquisition/extractor checkpointů. Větev nebyla přepnuta, index je čistý, žádné checkout/reset/stash. Evidence je `.cache/rag-auto-integration-20261028/before-sync.json` a `sync-receipt.json`. První helper preflight správně zastavil operaci kvůli rozdílu pouhého conflict-marker labelu HEAD versus plné SHA; před fyzickou změnou byl sjednocen se zkontrolovaným preflightem. Žádné neznámé konflikty nebyly ignorované.

Toto je pouze synchronizace, nikoli test nové celé pipeline. Žádný build, DB, Docker, placené API, GPU nebo hraná služba se nespouštěly ani neměnily. Vlastní pomocníci skončili; integrační resources se po doplnění uvolňují pro dalšího vlastníka.

## Scratch DB přejímka v3 store

Při novém vlastním claimu ověřen původní stopped kontejner `strahov-rag-20261028`, label rag-vector-20261028, port127.0.0.1:5468 a zachovaný volume. Spuštěn pouze tento kontejner. Dva nové vlastní `*_test` DB běhy používaly immutable snapshot core+foundation z commitu a0c32275 a přesné store WIP hashe; souběžný chat wiring nebyl do snapshotu přibalen.

První běh `db-5891f7ae` zachytil syntax chybu CASE v PL/pgSQL. Opravený `db-0dadab17` prošel19/19 za3,45s. Původní paid DB public head i90vectors byly před/po obou bězích shodné. Logs/receipts jsou pouze vlastní cache, žádné connection stringy nebo klíče v metadatech. Scratch databáze zachované pro navazující izolovanou QA; stará DB se nemigrovala. Žádná API/inference/GPU nebo hra. Po uzavření kontrol se vlastní kontejner zastaví a integrační resources uvolní, do prvního skutečného importu se nepředstírá end-to-end dokončení.

## Čistý export a PR37

Po skutečném E2E a uzavřeném společném review byl vytvořen čistý export13vlastních commitů nad přijatým main3644d773. Head `fabf7978e59adf18eba431e46a10f65985cb9fd1`, tree `882722a3f6a58768ec100c086bcdaa940e8ef832`,80source/test/evidence cest. Všechny jejich konečné bloby se shodují s ověřenou pracovní větví; mimo scope zůstává přijatý main. Untracked task catalog/research, stará koordinační metadata a pracovní index nebyly přibalené ani přepsané. Export použil pouze vlastní dočasný index a Git objekty, bez checkout/reset/stash.

[PR37](https://github.com/Varnahg/StrahovCrazyShow/pull/37) je draft, navazuje CI. Python testy/lock jsou zahrnuté. Jediný review nález citation cap byl opraven před exportem;162targeted+TS a nezávislé původní repro nyní procházejí. Celý katalog/crawler/deployment není tímto dokončený. Testserver a vlastníDB kontejner už skončily, volume zůstává zachovaný; po exportu se lokální integrační resources uvolňují během remoteCI.

## PR37: oprava testovací synchronizace

Původní verify40859139264 skončilo2807PASS/1FAIL/2skip; build/SDK se nespustily. Převzat samostatný test-only commit0484541ce3756c8ae0b7b118772021b2e3aae646 po8/8cílených testech, strictTS, deterministické delayed-digest probe a úzkém review. Původní14setImmediate nahrazuje skutečná loadDetail completion; runtime nezměněn. Export do existujícího PR37 je632c61c1825d589799d7afb5174855aedb193786, tree23aa5a8c2d8a55aaa638634cb9f283c9d7f22f1c, base3644d7735492a5eb953413b33ec5ed15d9df06fe. Export pouze2předané cesty, bez změny pracovního indexu či checkoutu. NovéCI pending; žádné main přijetí. Lokální pomocníci skončili, integrační zdroje se během remoteCI opět uvolňují.


## Přijetí PR37 do main

Exact head632c61c1825d589799d7afb5174855aedb193786/base3644d773: verify40862637490 SUCCESS,2810total/2808PASS/0FAIL/2optionalskip,PG18subtestsPASS,strictTS+VitebuildPASS,SDK4blokyPASS včetně12hráčů. Oba source-secret checksSUCCESS. Project acceptance https://github.com/Varnahg/StrahovCrazyShow/pull/37#issuecomment-6495366994.

PR37 byl29.10.2026 v11:26:31UTC skutečně sloučen normálním merge s očekávaným headem. Remote main je8d3e69eccbce326ea198351507b5ea3a52e7cf82, tree23aa5a8c2d8a55aaa638634cb9f283c9d7f22f1c. Fresh fetch a nulový diff vůči accepted headu potvrzují shodný celý obsah. Dmain synchronizaci přebírá jeho dosavadní vlastník/admin. Žádné lokální pomocné procesy neběží, integrační resources se uvolňují.

Přijat je funkční dokumentový RAG/chat checkpoint. Celý katalog, další místní služby, crawler/scheduler a veřejné nasazení zůstávají otevřené; viewport/SCS loader a WebGPU timeout jsou samostatná navazující práce.

