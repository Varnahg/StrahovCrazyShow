# Neměnná uživatelská verze4202 — odstaveno 19. 10. 2026

## Koordinované odstavení

Stav k 2026-10-19 20:26:10 UTC (22:26:10 Praha): vlastní služby jsou ukončené podle ověřeného lidského pokynu „ostatní relace klidně odstav“ v koordinačním chatu `01a155b2-1927-7681-9a9e-090b6c7bd974`, zpráva `01a155d5-373c-7601-862a-9a983e7eeb54`. Původní informace o aktivním servírování níže jsou historické.

- Ověřen PID, přesný start, executable, příkaz a parent vztahy. Ukončeny API `29960` a preview `28192`; pomocné procesy `29484`, `26412`, `39004` také zanikly. Kontrola potvrdila nepřítomnost těchto procesů a listenerů `4202/2597`.
- Důkazy: `.cache/webgpu-garment-user-build-20261019/live/shutdown-20261019-before.json` a `shutdown-20261019-after.json`. Snapshot, dist, logy a původní runtime metadata zůstaly zachované; žádné testy, build, GPU, commit ani integrace.
- Připraveno pro release `webgpu-garment-user-build-20261019` / `webgpu-01a15102-garment-user`; konečný výsledek release je v živém registru. Nadále zachovat readonly `.cache/webgpu-shadow-share-native-qa-20261019/clean/node_modules/`: používají je také předané reprodukce. Uvolnění serveclaimu není povolení SDK či frozen snapshot přepsat/smazat. Restart pouze po nové rezervaci.

## Původní předání

**http://127.0.0.1:4202/?renderBackend=webgpu** — source `c29a7da7dd9e66024a8ae59db803ef1b0e16a74d62ab0e533d8ac2821c49fe58`. Aktivní task `webgpu-garment-user-build-20261019`, owner `webgpu-01a15102-garment-user`, porty4202/2597. Stav ready zde znamená aktivní servírování, nikoli hotovou migraci; rezervaci držet a obnovovat.

-595 source/test souborů z již přijatého combined checkpointu, vlastní fyzická kopie7555dist souborů/1326456205bytes. Všech21JS/HTML/CSS/WASM codeSHA ověřeno proti testovanému buildu a skutečnému HTTP, embedded sourceIDc29 a APIhealthOK. Nejde o nový build nebo další GPU měření; binární copy se neprohlašuje za samostatný audit všech assetů.
- Obsahuje native SDWf8 sharing a app garment inicializaci main145cbe95, vedle dříve přijatých combined změn. Žádný nepřijatý UVguard/Textureprobe/JSselfprofiler/nováshadercache. Původní4201/F3,4199,4192,4188 a další hrané buildy neměnné.
- Rodinná garment CPU traversal úspora352→32 pro6presetů a1474clean/1534combined/fullTS/build/4integration+actualEdge6preset/game smoke jsou doložené v `garment-init-qa/`. **Zbývající záseky tím nejsou vyřešené:** neporovnatelný GPU smoke max303,2ms/6>=100ms, žádná FPS A/B garance ani defaultflip.
- Static source assets/public/docs a server node_modules jsou read-only junctions; samotný servírovaný dist má vlastní kopii. Pinned fresh nativeSDWf8 packages pod `.cache/webgpu-shadow-share-native-qa-20261019/clean/node_modules/` jsou součástí ochranné rezervace tohoto serveru: nereinstalovat/nepatchovat je. Další experiment vyžaduje nový isolated runtime nebo build-only transform.
- Runtime/logy pouze `.cache/webgpu-garment-user-build-20261019/live/`, fyzický snapshot+dist v témže task prefixu. PID/start/path jsou jen v ignored runtime.json; žádný nový HMR. Ukončení pouze stop.ps1 s task/cwd/PID/start/path/command guardem, nikdy podle portu samotného.
- Při předání nebyla otevřena nová GPU karta; URL je připravená pro ruční test. Pokud ji uživatel otevře, další GPU měření se musí koordinovat podle skutečných scén. Živé4201 a4202 je nutné heartbeatovat nejpozději po15min a ponechat je běžet do koordinovaného ukončení.
