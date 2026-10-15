# Předání: prepare-main-playtest-20261015

- Vlastník: playtest-main-20261015-prepare; příjemce: root serve-main-playtest-20261015. Nové AGENTS15.10 načtené.
- Výzkum před změnou: main e1b03fe má validovaný snapshot4dcb3f6fc34a560b455c0ee5c4f02a014105142d4bcce392f2628bca0e012ca0,916 testů/build/integrace. HMR nad dirty main by opakoval původní restartový problém; starý4187 má jinou skladbu. Rebuild nezměněného obsahu nepřináší další důkaz. Vybrána fyzická kopie ověřených vstupů/dist a porovnání bytes.
- Výsledek15.10:8398 source vstupů včetně160 testů,496 committed main blobs a7809 dist souborů porovnané SHA; vše shodné. Žádná runtime změna ani nový GPU výsledek. Patched Babylon závislosti odpovídají předchozímu ověřenému checkpointu.
- Frozen export: idle key17-ownership-integration WT/.cache/main-playtest-20261015/frozen; kopie zdrojů/dist, junction pouze na vlastní instalaci node_modules. Tato instalace se během testu drží neměnná.
- Launcher odvozen z již ověřeného hiddenStart-Process helperu, pouze root/ports/hash/task. PowerShell parser PASS. Export má GIT_CEILING_DIRECTORIES na rodiči, aby diagnostika nevydávala historický ancestor HEAD2c7aec9 za source commit; skutečný buildSnapshotId a content hash se ověřují HTTP.
- Přesné soukromé provozní záznamy: .cache/main-playtest-20261015/prepared.json (manifest včetně dist/deps), hardware.json, prepare.mjs a live/start.ps1/stop.ps1/verify.mjs. PID nejsou verzované.
- Všechny vlastní přípravné procesy ukončené, těžká rezervace se uvolní před spuštěním samostatného serve tasku. Původní WIP, instalace main a stale claims nedotčené.
