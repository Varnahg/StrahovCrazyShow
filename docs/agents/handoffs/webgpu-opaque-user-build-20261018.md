# Frozen build WebGPU opaque ordering

18. 10. 2026, root `webgpu-opaque-user-build-01a14497`.

[Spuštěný build](http://127.0.0.1:4196/?renderBackend=webgpu), API2591. Source snapshot `5d247248f50a762877e9079bb4fcd65280e959e8014eb3f65b2662e397c518cb`, 578 source/test souborů a17 distribučních souborů. Runtime commit WT `03d4480019366e8586ecc4c94b4541dddecaac0a` → main `a1d954221c1585800f84c1e5dfdb46c3bb36a798`. Clean1375/1375 a combined1435/1435, fullTS/build/integration PASS; zdroje a dependencies během kontrol neměnné.

Vlastní prefix `.cache/webgpu-opaque-user-build-20261018/`: `snapshot/` obsahuje vlastní kopii zdrojů/testů, readonly junctions na dokončené dist/assets/public/docs/packages; `build-identity.json` zaznamenává hashe distribuce. `runtime/runtime.json` drží aktuální identity dvou skrytých Node procesů. PID/start časy se necommitují. `start.ps1` kontroluje skutečné porty, `stop.ps1` kontroluje task/owner/cwd/PID/start/executable/command. Snapshot se nikdy znovu nebuildí; další změny potřebují nové dist a URL.

HealthHTTP a skutečný Edge vstup ověřeny. Nový defaultauto průchod používá běžné čerstvé počasí; ready po57,83s. Jeden Alex, CSS1514×643, medium77 %/interně1164×494:52,1FPS,p9524,4ms,p9927,5ms; health valid,pending0,errors0 na obou koncích benchmarku. Není to matched výkonový pár. [Původní export a obraz](../../performance/evidence/webgpu-migration-20261016/opaque-order/README.md) a627souvislých raw záznamů obsahují ready i disposal; rawSHA `d40aaf724737dd461f4be51f905af233c95b0289bd267eaa4425d8468ba0dfa7`.

Vlastní QA hráč odešel do menu; Edge karta4196 zůstává označená jako uživatelský výstup. Služby4196/2591 nadále běží, rezervace zůstává aktivní. Hraný4195/4193/4192/4188 a jejich soubory/služby byly ponechány beze změny.

Omezení: výchozí backend bez query se ještě nepřepíná; WebGPU compatibility mode zůstává kandidátem. B6 první svítilna má stále chybějící varianty a sekundový zásek; celková1/3relace funkční/FPS přejímka a60FPS nejsou splněné. Material-first úspora nemění alpha/transparent/shadow fronty ani herní kvalitu a pro WebGL zachovává původní řazení.
