# Úplné dekódování původních JPEG atlasů IPR

Stav: **PASS**, kontrola 2026-10-10T20:50:05.428660+00:00.

Všech **3518** původních JPEG atlasů prošlo samostatným čtením hlavičky SOF, `Pillow.Image.verify()` a následným novým otevřením s `Image.load()`. Nad všemi dekódovanými RGB pixely se skutečně spočítala minima a maxima kanálů. Nejde pouze o kontrolu JPEG hlavičky nebo přípony.

- Plné dekódování: **3518/3518**.
- Shodný SHA-256 s původním manifestem: **3518/3518**.
- Shoda rozměrů dekódovaného obrazu s nezávisle čteným SOF: **3518/3518**.
- Selhání: **0**, soubory s varováním dekodéru: **0**.
- Zdrojové barevné režimy: `{'RGB': 3518}`; ICC profil má 0 atlasů.
- Rozměry: 1024×1024: 197, 1024×512: 1670, 512×512: 1601, 512×256: 50.
- Celkem plně dekódováno **1,508,376,576 RGB pixelů**.
- Pillow 12.3.0, nejvýše **4 pracovní vlákna**, striktní `LOAD_TRUNCATED_IMAGES=False`.
- Doba: 10.546 s. Manifest se během kontroly nezměnil: **True**.

Manifest SHA-256: `d556d38d5c32d9d039479e492d7937e2c358df90cf94f7aee232f5e1ba330d93`.

[Úplný strojový výsledek](jpeg-decode-audit.json) obsahuje pro každý source ID SHA-256, velikost souboru, zdrojový barevný režim, SOF, rozměry, ICC metadata, dekódované RGB rozsahy a výsledek obou kontrol. Zdrojové soubory se pouze četly; nedošlo k úpravě, zmenšení, přepisu ani opětovnému stažení. Audit ověřuje integritu JPEG pixelů, nikoli úplnost fotogrammetrické rekonstrukce, geometrii nebo kvalitu fasád z pohledu chodce. GPU ani FPS se při tomto auditu neměřily.
