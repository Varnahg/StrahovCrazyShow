# Předání: serve-main-playtest-20261015

- Vlastník: playtest-main-20261015-live; služby zůstávají pod aktivním claimem.
- URL: http://127.0.0.1:4188/; izolované API2583. Source commit e1b03fe8a6c14f25c14bb6173ce90c29050ed9ea, snapshot4dcb3f6fc34a560b455c0ee5c4f02a014105142d4bcce392f2628bca0e012ca0.
- Cwd: vlastní key17-ownership-integration WT/.cache/main-playtest-20261015/frozen. Převzato po dokončení prepare tasku a uvolnění jeho zdrojů. Sources/dist i borrowed own node_modules jsou během testu immutable.
- Ověření15.10: HTTPhealth200, recorder status200/enabled, server buildSnapshotId a client bundle marker shodné;5 skutečně servírovaných HTML/JS/CSS souborů SHA shodných s dist. GIT_CEILING chrání před nepravdivou ancestor Git identitou.
- Skutečný nový POST201/receipt a diskJSONL PASS; d6164e33-2721-4518-9ba4-3ed54f15fcd8 je označený synthetic agent-collector-smoke, nikoli hraná relace. Nové uživatelské logy jsou ve frozen/.cache/game-diagnostics/.
- Procesní identity/cmd/startUTC/port jsou pouze v .cache/main-playtest-20261015/live/current-runtime.json a příslušném runs/runtime.json. Hidden launcher, porty předem volné; stop.ps1 smí zastavit pouze ověřené vlastní identity. Služby běží, serve rezervace se neuvolňuje.
- Browser panel byl požádán přímo o URL. HTTP ověření není potvrzení GPU/renderu; ruční test provede uživatel. Měřicí okno rezervuje samostatný user-playtest-window-20261015.
- Postup: jedna herní karta; společný svět; medium den→noc stejná trasa,3./1.osoba, B6 vstupy/obě schodiště/F,low/high/auto,editor/avatar,mapa,auto,tab background,R a přechod solo/multi. Zakončit návratem do menu a5s na flush.
- Meze: automatické frame/network/quality/viewport údaje ano; camera/flashlight/lighting selection a obraz nejsou úplně zachycené. Uživatel stručně doplní krok/místo/den-noc a viditelný jev. Nejde o nové FPS nebo odstranění všech nálezů.
