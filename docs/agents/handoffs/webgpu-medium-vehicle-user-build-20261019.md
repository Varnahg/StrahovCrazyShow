# Živý ruční test4203

- Vlastník `webgpu-01a15102-medium-vehicle-user`; task drží4203/2598. Výslovný požadavek uživatele připravit hru a naslouchající logy,19.10.2026.
- URL `http://127.0.0.1:4203/?renderBackend=webgpu`; Edge karta2070823219 otevřená pro uživatele. Žádný HMR/profiler/donor overlay. Starší4201/4202 a chráněné hrané buildy neměněné.
- Source `65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60`,582zdrojových souborů včetně testů. Fyzická kopie7555distfiles/1326415671bytes;21kódovýchsouborů ověřeno přesHTTP protiSHA, embeddedsource správný,APIhealthOK. Read-onlyassets/deps ze stávajícího přijatého f8; žádná instalace či rebuild.
- Kandidát obsahuje Medium/Highvehicle přípravu a boundedlatequality;154ms+záseky zatím nevyřešené a navazující cachedshadowbase fix ještě NEobsahuje. Je to ruční test kandidáta, ne dokončená přejímka či runtimepromotion.
- `live/runtime.json` má skutečnéPID/start/path/cwd:API36416,preview32428 při startu15:34:46UTC. Nesmí se ukončovat podle samotného portu. Procesní logy vownlive/. Automatické herní záznamy v snapshot/.cache/game-diagnostics/, skutečné EdgePOSTy ověřené v `log-listening.json`. Zdroj/dist/server nechat během testu neměnné.
- `manual-test-window.json` rezervuje klid pro ruční test. RootGPUměření/buildy/zátěžovéCPUtesty stojí; helper zastavil testy15:33:38.325UTC, dalšíběhy pouze po dokončení ručního testu. Nejde o pause migračního cíle.
- Build zůstává živý pod touto rezervací. Nedělat release při běžícím serveru. `stop.ps1` ověřuje identitu vlastních procesů; dosud nebyl použit. Definitivnívyhodnoceníuživatelského testu se doplní po testu.
