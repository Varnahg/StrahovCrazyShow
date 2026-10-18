# Předání testovacího buildu 4197

URL: http://127.0.0.1:4197/?renderBackend=webgpu, API 2592. Owner `webgpu-low-vehicle-user-build-01a14497`, task `webgpu-low-vehicle-user-build-20261018`; služby a rezervace zůstávají aktivní.

Neměnný zdroj `5c6b36ad783a332030bf21f25344d17b43e6ea0005c9f0bb5a754bae7444c483`, 580 source/test souborů a 17 distribučních souborů. Vlastní `.cache/webgpu-low-vehicle-user-build-20261018/snapshot/` sdílí pouze dokončené immutable dist/packages/assets read-only. `build-identity.json` obsahuje všechny hashe; `runtime/runtime.json` lokální identity procesů. Nikdy nezastavovat proces jen podle portu a tuto kopii nepřebuildovat.

Runtime `a86136ef` → main `42f7336f`. Clean 1387/1387 a combined 1447/1447, oba TypeScript/build/integration PASS. Produkční A/B/A doložilo omezení kompilací a menší maximum prvního průjezdu; celková plynulost zůstává nevyřešená. [Úplné výsledky a omezení](../../performance/evidence/webgpu-migration-20261016/low-vehicle/README.md).

HTTP health a skutečný Edge vstup ověřeny. Běžné počasí, žádný jemný profiler; 41 přípravných etap complete, network-connect→ready 65,42 s, health valid/pending0/render/asset errors0. Stacionární smoke: auto low77 %, CSS1912×866/interně1470×666, 57,8 FPS, p95 22 ms, p99 30,9 ms, max 63,1 ms. Nejde o měření hladké jízdy. Root odešel do menu; uživatelská karta zůstala otevřená. Původní 4196/4195/4193/4192/4188 se nemění.

Root smoke je zmrazený v evidenci; živý application session log může později obsahovat další uživatelský průchod. Rozlišovat segmenty podle ready/dispose, nikoli podle samotného názvu souboru. Uživatel dostal otázku, zda nyní testuje; při jeho testu nepouštět GPU ani náročné testy.
