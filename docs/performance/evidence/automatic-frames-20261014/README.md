# KEY-19: automatický frame sběr a izolace kontextu

Ověřeno 14.10.2026. Výchozí main f4f6116; přijatý zdrojový snapshot **4dcb3f6fc34a560b455c0ee5c4f02a014105142d4bcce392f2628bca0e012ca0** obsahuje 8398 vstupů, včetně 160 testovacích souborů a dříve ověřených 12 materializovaných LFS objektů. Checkpoint je reprodukovatelný přes baseManifest a přesný delta seznam.

## Výsledek

Game.frame nyní bez benchmarku předává každé dokončené vykreslení automatickému recorderu. Raw frame interval zůstává předcházející interval; šest CPU fází a cpuMs končí společným timestampem po labels. Pozdější HUD/benchmark práce a recorder nejsou v tomto cpuMs. GPU hodnota vzniká jen při novém asynchronním výsledku, bez opakovaného započítávání cache. Výkon ani GPU správnost tím nebyly změřeny.

Kontext používá omezená technická pole. Vlastní server clock/queue, transport a timeline mají explicitní whitelisty. Platná autorita se nesmí ztratit kvůli volitelné diagnostice; timeline dostává pouze časové frontiers. Guest nevyhodnocuje transport callback. Bind/rebind, leave, změna identity a dispose oddělují diagnostické relace, aniž by diagnostický reset měnil predikci nebo fyziku.

Recorder dokončí staré okno a zruší cache/předchozí frame před lifecycle událostí, i když je event limit vyčerpaný. Vynechané seq u odmítnuté boundary je konzervativní bariéra pro offline report. Při selhání nové context factory je aktuální kontext prázdný.

## Důkazy

- Cílený producer/Game/UI běh 49/49 PASS; independent projection 10/10 PASS; recorder+report 55/55 PASS. Jde o překrývající se cílené sady, nesčítají se jako nové unikátní testy.
- RED proti přesnému main Game: 0 frame-window místo 1. Mutace bez integer guardu selže 4/10; mutace bez seq bariéry chybně spojí čítače 100→900.
- Skutečná metoda Game.frame (scene/IO doubles, bez GPU) → SessionDiagnostics → sdílený wire validator → skutečný in-process HTTP handler → JSONL na disk → offline CLI summary: 3 okna, 120 callbacků, +283.33ms server drop; vložené token/profile/peer sentinely se neuloží.
- Finální **pnpm test: 916/916 PASS**, **pnpm build: PASS**, **pnpm test:integration: PASS** na rezervovaném 2568. Přesné příkazy, časy, snapshoty a SHA logů jsou v pipeline.jsonl. Automatická SDK/HTTP integrace není ruční herní přejímka.
- 45 actual recovery/UI callback testů PASS také nad konzervativně přizpůsobeným historickým Game/UI WIP. Právě 1 recorder callsite; ostatní Game členy a širší rozpracované profilery zachované. Nejde o přijetí celého WIP.
- První checkpoint 00538ba8 měl 916 testů PASS, build ale našel chybějící povinné receivedSeq v nové fixture. Root doplnil receivedSeq: 10 odpovídající ack 10, bez runtime změny. Původní výsledek je zachovaný v initial-00538ba8; finální pipeline běžela znovu nad opraveným snapshotem.
- Post-check: všech 8398 vstupů beze změny, původní main instalace/realpaths nezměněné. Žádné instalace, browser/GPU, úpravy assetů ani změny běžících preview.

## Integrace a omezení

Commit používá přesné čisté source/test blobs z validovaného checkpointu. Pracovní main Game/UI obdrží jen odděleně ověřenou adaptaci; širší historický WIP se necommituje. docs/verification.md získá pouze novou přílohu. Původní dev/preview procesy a jejich buildy zůstávají původní.

KEY-19 je úzké dokončení existující části KEY-2. Render-pass příčiny, skutečná režie recorderu, FPS/p95/p99 v produkční hře, obraz a širší KEY-2 zůstávají otevřené. Výsledky starších 4176/4187 buildů se nepřipisují tomuto snapshotu.
