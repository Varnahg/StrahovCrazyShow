# Ruční test4203 — odstaveno 19. 10. 2026

## Koordinované odstavení a zbývající práce relace

Stav k 2026-10-19 20:26:11 UTC (22:26:11 Praha): vlastní služby jsou ukončené podle ověřené lidské zprávy `01a155d5-373c-7601-862a-9a983e7eeb54` „ostatní relace klidně odstav“ v chatu koordinátora `01a155b2-1927-7681-9a9e-090b6c7bd974`. Implementace migračního cíle zůstává pozastavená. Níže uvedené původní živé předání je historické; ruční test již skončil.

- Po ověření PID, přesného startu, executable, příkazu a parent vztahů ukončeny API `36416` a preview `32428`; pomocné procesy `26236`, `17360`, `31320` také zanikly. Následná kontrola: žádný z těchto procesů ani listener `4203/2598`.
- Důkazy před/po: `.cache/webgpu-medium-vehicle-user-build-20261019/live/shutdown-20261019-before.json` a `shutdown-20261019-after.json`. Source `65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60`, snapshot/dist/logy i runtime metadata jsou zachované. Žádný test, build, GPU, commit ani integrace nebyly při odstavení spuštěny. Starší cizí snapshoty/procesy se neukončovaly.
- Připraveno pro release `webgpu-medium-vehicle-user-build-20261019` / `webgpu-01a15102-medium-vehicle-user`; výsledek následného release ověřit v registru. Frozen soubory a vypůjčené SDKf8 zůstávají readonly i po release. Restart potřebuje nový claim a ověření identit/portů.
- Nezávislý čtecí audit před odstavením: 138 dirty cest, prázdný index, pouze tři vlastní serveclaims (4201–4203), žádný vlastní aktivní source claim ani nepředaný runtime zásah. Cizí WIP se nepřebíral. Následující vlastní pending soubory jsou zachované, bez commitu a bez označení za přijatou implementaci:
  - `_bmad-output/implementation-artifacts/webgpu-medium-vehicle-qa-20261019/spec-key-31-medium-vehicle.md`;
  - tento handoff a `docs/agents/tasks/webgpu-medium-vehicle-user-build-20261019.json`;
  - `docs/agents/handoffs/webgpu-shadow-pass-state-helper-20261019.md` a `docs/agents/tasks/webgpu-shadow-pass-state-helper-20261019.json`.
- Medium/High kandidát byl dříve předán a archivován v `docs/performance/evidence/webgpu-migration-20261016/medium-vehicle-qa/` (WT `fa6d04cd184d7e165fbbdfe63ebc89c3d4d16f3f`, main `6a402ea39a99eeca29c12ff82aaacccd5f864289`). Osm přesných runtime/test vstupů je archivováno; není to přijetí kandidáta do nativního runtime. Obnovitelný helper `.cache/webgpu-medium-vehicle-helper-20261019/` má manifest SHA-256 `b7f2ddfb9c7230972b0411b254fb11f2e44923c874f70659630e0cceefd322d2`.
- Shadow-pass reproduktor zůstává explicitně RED, bez runtime opravy. Předání výše, 31 artefaktů v `.cache/webgpu-shadow-pass-state-helper-20261019/`, manifest SHA-256 `eceb2f51c9a2258c1b24d98af72c92ed385aefecd2eb7ef76fce5ae137ca29c6`. Další implementace vyžaduje pokračování uživatelského cíle a nové přidělení rozsahu; zde se nespouští.
- Systémový GPU sampler již dříve skončil bez cleanup chyb. Ruční test a jeho vyhodnocení jsou zachované v `.cache/webgpu-system-telemetry-20261019/manual-analysis-01/` a `docs/performance/evidence/webgpu-migration-20261016/system-gpu-telemetry/`. Dřívější předání koordinace: `coordination-handoff.md` v posledním uvedeném adresáři. Toto odstavení nemění výsledky ani neuzavírá KEY-31/32 či migraci.

## Původní předání

- Vlastník `webgpu-01a15102-medium-vehicle-user`; task drží4203/2598. Výslovný požadavek uživatele připravit hru a naslouchající logy,19.10.2026.
- URL `http://127.0.0.1:4203/?renderBackend=webgpu`; Edge karta2070823219 otevřená pro uživatele. Žádný HMR/profiler/donor overlay. Starší4201/4202 a chráněné hrané buildy neměněné.
- Source `65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60`,582zdrojových souborů včetně testů. Fyzická kopie7555distfiles/1326415671bytes;21kódovýchsouborů ověřeno přesHTTP protiSHA, embeddedsource správný,APIhealthOK. Read-onlyassets/deps ze stávajícího přijatého f8; žádná instalace či rebuild.
- Kandidát obsahuje Medium/Highvehicle přípravu a boundedlatequality;154ms+záseky zatím nevyřešené a navazující cachedshadowbase fix ještě NEobsahuje. Je to ruční test kandidáta, ne dokončená přejímka či runtimepromotion.
- `live/runtime.json` má skutečnéPID/start/path/cwd:API36416,preview32428 při startu15:34:46UTC. Nesmí se ukončovat podle samotného portu. Procesní logy vownlive/. Automatické herní záznamy v snapshot/.cache/game-diagnostics/, skutečné EdgePOSTy ověřené v `log-listening.json`. Zdroj/dist/server nechat během testu neměnné.
- `manual-test-window.json` rezervuje klid pro ruční test. RootGPUměření/buildy/zátěžovéCPUtesty stojí; helper zastavil testy15:33:38.325UTC, dalšíběhy pouze po dokončení ručního testu. Nejde o pause migračního cíle.
- Build zůstává živý pod touto rezervací. Nedělat release při běžícím serveru. `stop.ps1` ověřuje identitu vlastních procesů; dosud nebyl použit. Definitivnívyhodnoceníuživatelského testu se doplní po testu.
