# Předání F3 verze4201 — odstaveno 19. 10. 2026

## Koordinované odstavení

Stav k 2026-10-19 20:26:09 UTC (22:26:09 Praha): vlastní služby jsou ukončené. Nový pokyn koordinátora z chatu `01a155b2-1927-7681-9a9e-090b6c7bd974` navazuje na ověřenou lidskou zprávu `01a155d5-373c-7601-862a-9a983e7eeb54` „ostatní relace klidně odstav“. Následující původní záznam živého předání je historický.

- Ověřen PID, přesný čas startu, cesta executable, příkaz a parent vztahy. Ukončeny API `11976` a preview `39820`; jejich pomocné procesy `20816`, `36272`, `35440` také zanikly. Po kontrole nezůstal žádný z těchto procesů ani listener na `4201/2596`.
- Při druhé kontrole Windows již znovu použil číslo PID `11976` pro cizí `msedgewebview2.exe` se startem `2026-10-19T20:27:28.7166818Z`. Tento proces se neukončoval. Původní Node API se startem `2026-10-19T11:04:35.4278900Z` skončilo; konečná kontrola porovnává celou identitu, nikoli pouhé číslo PID.
- Důkazy před/po jsou v `.cache/webgpu-f3-user-build-20261019/live/shutdown-20261019-before.json` a `shutdown-20261019-after.json`. Původní `runtime.json`, logy, source snapshot, dist a SDK jsou zachované. Nebyl spuštěn build, test, GPU scéna ani commit/integrace.
- Handoff je připravený pro release `webgpu-f3-user-build-20261019` / `webgpu-01a15102-f3-user`; následný výsledek release určuje živý registr. Uvolnění služby neznamená přijetí migrace ani svolení přepsat či smazat obnovitelný frozen dist a dependencies. Restart vyžaduje nový claim a kontrolu portů/identit.

## Původní předání

**URL:** http://127.0.0.1:4201/?renderBackend=webgpu. Owner `webgpu-01a15102-f3-user`, task `webgpu-f3-user-build-20261019`, cwd29fa. Rezervace portů4201/2596 i immutable vypůjčeného dist/deps **zůstává aktivní**, protože služby běží pro uživatele. Task zůstáváready; nejde o Done celé migrace.

- Source `77d6064f02cd5bfb6cc394dc22858bc56996be77dbf6482fd11cb765e39d2a52`, MaterialDefines `3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768`. Přesně již přijatý native-combined F3,589source/test files a19distcode SHA. Žádný nový compile ani odmítnuté sparse/primitivecache/routineprofiler; stávající automaticdiagnostiky knowncombined verze zachované.
- Vlastní `.cache/webgpu-f3-user-build-20261019/snapshot` obsahuje přesné kopie manifestu; readonly dist vede do frozen native-combined F3 a dependencies do frozen fresh native-clean F3. Tyto vstupy jsou explicitně chráněné claimem. **Nikdy tyto dist/deps ani snapshot nepřebuildovat/neinstalovat za běhu.** Další opravy do jiné kopie/portu.
- Služby: `node --import tsx server/index.ts` se cwd vlastnísnapshot, HOST127.0.0.1/PORT2596/TSX_DISABLE_CACHE1/STRAHOV_SOURCE_SNAPSHOT_ID; preview `node <owncache>/preview.mjs`, stejnécwd,4201proxyAPI/WS2596. Pouze127.0.0.1. SkutečnéPID/startUTC/path jen v ignored `live/runtime.json`; stdout/stderr ve stejném liveadresáři.
- Start `powershell -NoProfile -ExecutionPolicy Bypass -File .cache/webgpu-f3-user-build-20261019/start.ps1`; READY potvrzeno a `verify.mjs` ověřilHTTPhealth,589source bytes a všech19skutečněservírovanýchbajtovýchSHA, embeddedsource77d a jednotnoucore/loadersidentitu. Ověření browser/GPU se zde znovu nespouštělo. Předchozí nativecombined1513/1513+fullTS/build+4integrace a omezenýnativeGPU smoke patří k přesně stejnému source/dist, viz navazující evidence.
- Původní4199 má aktuálně shodných17deliveredcode SHA a servírovanéHTML proti původní buildidentity.4188/4192/starší snapshoty se neotevřely k zápisu. CizíWIP zůstává mimo změny.
- Ukončení jen přes vlastní `stop.ps1`, které ověří task/cwd/PID/start/path/command a ukončí pouze shodné vlastníprocesy. Pak zkontrolovat4201/2596nenaslouchají a teprve následněrelease. Nezastavovat podleportu/stáří. Do té dobyheartbeat≤15min.

Evidence: `docs/performance/evidence/webgpu-migration-20261016/f3-user-build-4201/README.md`. Build zpřístupňuje dílčí přijatéF3;≥100ms hitches, Medium,≥3actual, úplnáfunkčnípřejímka a default zůstávají otevřené. Staré pilotní157,6→128,6ms nejsou novým měřením tohoto webserveru.
