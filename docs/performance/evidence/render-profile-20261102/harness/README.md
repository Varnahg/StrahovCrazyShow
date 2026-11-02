# Profilování neměnného produkčního main

Nástroje nemění produkční bootstrap, runtime ani starý low-tree harness. Práce zůstává v jediném kanonickém main, build a výsledky v `.cache/render-profile-20261102/`. Skutečné běhy spouští koordinátor s rezervací build/GPU/heavy-validation, portů2568/4179 a `.cache/game-diagnostics/`. Docker8080 zůstává nedotčený. Node24, instalace z aktuálního frozen lockfile a skutečné LFS assety jsou předpoklad.

## Sestavení a tři samostatné starty

Z kořene main:

```powershell
node docs/performance/evidence/render-profile-20261102/harness/run.mjs --build baseline
$env:STRAHOV_PERF_WEATHER_FIXTURE = 'C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/render-profile-20261102/weather.json'
node docs/performance/evidence/render-profile-20261102/harness/run.mjs --serve run1
```

Build vytvoří jednou `build/dist` s native Vite config loaderem, `envFile:false` a `publicDir:false`. Manifest zahrnuje source/test SHA, skutečné public bajty, všechny instalované Babylon core/loaders bajty, package metadata Vite/tsx/TypeScript/Colyseus a vlastní harness. Ostatní tranzitivní závislosti nejsou hashovány soubor po souboru; během kampaně instalaci neměnit. Před i po buildu se ověřují vstupy. `--serve run2` a `run3` použijí stejné dist po opětovné verifikaci; běhy se nepřekrývají.

Preview4179 servíruje nejprve dist a pak hashově ověřené public z main pouze pro čtení. Nic nekopíruje. API2568 je vlastní child s `windowsHide:true` a izolovanými provider credentials. Povinný weather fixture je načten jednou na začátku běhu, označen jako QA a uložen s hashem. Pro všechny starty použít stejný fixture, časový náhled, backend, viewport/backbuffer, kvalitu a profily. Metadata pomáhají shodu zkontrolovat; různé fixture hashe nejsou srovnatelný běh.

Každý run má nový adresář `runs/run1/` s `start.json`, `runtime.json`, `weather.json`, API logem a benchmarky. Existující adresář se nikdy nepřepisuje. Při selhání lze použít explicitní `run1-attempt2`; uchovat původní neúspěšný pokus. Již existující build adresář rovněž nelze přepsat.

## Dva skuteční stacionární peers

Nejprve vstoupit běžným UI přes profil do `http://127.0.0.1:4179/` (explicitní renderer dle kampaně), ověřit skutečnou připravenost a viditelnost. V samostatném vlastním terminálu:

```powershell
node docs/performance/evidence/render-profile-20261102/harness/run.mjs --peers run1
```

Helper ověří identitu běžícího API přes existující lokální diagnostiku. Až veřejná presence ukáže právě1 relaci, přidá dvě fiktivní postavy s preset1 a2 pomocí současného `/api/session`, `joinById` a aktuálního `PROTOCOL_VERSION`. Tato podmínka identifikuje pořadí vstupu do izolovaného světa, sama neověřuje GPU readiness browseru. Následně vyžaduje3 řádky skutečných autentizovaných motion dat, authority a odeslané platné vstupy před vytvořením `peers-ready.json`.

Každé SDK join má společný10s limit pro matchmaking i handshake. Ve skutečném SDK0.18.5 veřejné `ClientOptions.fetchFn` nese AbortSignal a deklarovaný protected subclass hook `createRoom` převezme vlastnictví před SDK `Room.connect`. Samotné `joinById`, endpointy a protokol zůstávají SDK. STOP/timeout zruší HTTP, zavře vlastní připojovaný socket a zakáže jeho reconnect; pozdní úspěšné dokončení se také uklidí. Nedokončené rooms zůstávají ve vlastní cleanup množině.

`ScriptTimelineClient` pumpuje30Hz neutrální vstupy `x=z=0`, bez běhu/skoku/vozidla. Není tu teleport, lokální pose injection ani pohyb po trase. Avataři zůstanou na autoritativních spawn místech; fyzický drift se měří, nenuluje. To neznamená, že budou viditelní v každém vzdáleném pohledu. Pětisekundové záznamy uvádějí skutečnou populaci, polohy, ack/počet příkazů, resync a největší horizontální drift. Session tokeny se neukládají. Ztráta populace nebo motion freshness po ready zneplatní helper; nesmí se vydávat za úspěšný3-player interval.

## Spolehlivé ukončení na Windows

Pro běh1 vytvořit marker (cesta je také v runtime metadata):

```powershell
New-Item -ItemType File -Path .cache/render-profile-20261102/runs/run1/STOP
```

Marker čtou oba procesy každých250ms. Peers odejdou standardním SDK leave a server počká na jejich cleanup, pak uzavře vlastní HTTP/WebSocket sockety a API. `PEERS_STOP` ve stejném adresáři ukončuje pouze peers. SIGINT/SIGTERM jsou další možnosti; správný shutdown na nich nezávisí. Každý proces má90min limit. Server při vlastním limitu nebo chybě také vytvoří STOP pro peers. Vlastní API dostane po5s neúspěšného graceful ukončení poslední kill; cizí PID ani proces podle portu se neukončuje.

Vyžadovat `peers-cleanup.json` bez chyby a zavřené relace, `cleanup.json` s `apiExited:true`, `failure:null`, žádnými cleanupErrors a revalidovanými vstupy, poté ověřit ukončení vlastních PID a uvolnění portů. Revalidace celých asset/dependency stromů může trvat; během ní nezahajovat další měření. Automatic session logy zůstávají v root `.cache/game-diagnostics/`, nemažou se.

Tento harness neovládá browser, nespouští GPU automatizaci a neměří FPS sám. Koordinátor použije skutečný produkční HUD benchmark a profilovací nástroje s jasnou identitou adaptéru/driveru/browseru. Neměnit zdroje, testy, public ani dependencies během běhu. Verifikace je na hranicích buildu/běhu; dočasnou změnu a vrácení uprostřed neodhaluje každý snímek. Všechny neúspěšné pokusy se uchovají.
