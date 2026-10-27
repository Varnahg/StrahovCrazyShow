# Game fixture a společný sezónní čas

Task `trees-20261025-game-fixtures`, owner `trees-game-fixtures-01a16b37`, baseline `8516c7b1`. Rozsah je pouze ve třech testech, dokumentaci a vlastní cache; runtime Game/Vegetation ani cizí modelové/season/litter soubory se neupravují.

## Doložený mechanismus a volba

Původní root reprodukce low-vehicle preparation měla 13 PASS / 8 FAIL. První příčina je `ReferenceError: getTreeSeasonState is not defined` ve skutečné metodě `Game.updateRenderEnvironment`, převzaté do VM. Metoda už nově volá sezónní helper, ale VM neměla jeho lexikální binding ani hodnotu v env. Pokud fixture nemá vegetation, optional call tuto větev vůbec nevyhodnotí, takže authored-light/diagnostics obsahovaly stejnou latentní mezeru. Ostatní pády restore/FAR jsou kaskáda po chybě, nikoli důvod oslabit jejich původní aserce.

Porovnána náhrada helperu stubem, kopie výpočtu sezóny do testu a doplnění skutečného importu do existujícího VM. Zvolen skutečný import/binding: zachovává úplnou produkční metodu, původní shader/light/cache/lifecycle důkazy a umožňuje přímo kontrolovat předaný modelový stav. Ve všech třech testech je skutečný `getTreeSeasonState`; žádný sezónní stub ani runtime workaround.

Původní log `.cache/trees-integration-20261025/vehicle-season-preparation-before.log` zůstává nedotčený. Jeho přesná kopie je v taskové cache, oba SHA-256 `341729a4fd49391376887473700dde7042bd6aa168ac5b8cbfa2abb8b23006bf`.

## Přidané ověření

- Low-vehicle fixture při každém skutečném sky→vegetation update porovnává předaný immutable season objekt se skutečným modelem ze stejného posledního sky instantu a source podle `timeOverride`. Původní skutečný FAR helper, všech 41 stages/tři quality passes, resource replacement, stale lease a cleanup aserce se nemění.
- Diagnostics fixture nastavuje `timeOverride: null` podle skutečného Game constructor defaultu. Nový test vykonává aktuální produkční `updateRenderEnvironment`, používá skutečné `sunState`, `moonState` a `getTreeSeasonState` a pouze zachytává vstupy IO/controller hranic.
- Pět průchodů pokrývá reálný UTC čas, přechod minuty/přestupného února do března, explicitní demo bez čtení `Date.now`, dočasný přípravný instant odlišný od zachovaného preview a návrat do aktuálního reálného času. Kontrolují se source `regional-model`/`demo`, minute sampledAt, daylight, player a skutečný vítr předaný vegetation.
- `Object.create(VegetationController.prototype)` ve FAR fixture zůstává s původními nevyplněnými nesouvisejícími private fields. Nepřidává se maskující náhrada litter/renderer state; forwarding getter/lease musí bezpečně zvládnout chybějící controller.

## Ověření a rozsah důkazů

První opravený běh `node node_modules/tsx/dist/cli.mjs --test tests/game-low-vehicle-preparation.test.ts tests/game-authored-light-preparation.test.ts tests/game-diagnostics.test.ts`: **38/38 PASS, exit 0**, 8,52 s. Výstup `.cache/trees-game-fixtures-20261025/targeted-first.log`. Diagnostics testový collector je přímé volání handleru bez socketu/serveru; jeho temp data jsou přesměrovaná pomocí `GAME_DIAGNOSTICS_TEST_CACHE` do taskové cache. `PROOF_RUN` je pro tento shell prázdný, tedy nevznikají reporty v cizích cestách.

Po potvrzení stabilního root Game/Vegetation checkpointu včetně nového složeného grass/litter preparation getteru a lease proběhl závěrečný stejný příkaz: **38/38 PASS, exit 0**, 9,37 s; `.cache/trees-game-fixtures-20261025/targeted-final.log`. Částečná Vegetation fixture dál funguje bez doplnění maskujícího litter/renderer state a všechna původní readiness/restore tvrzení zůstala.

`node node_modules/typescript/bin/tsc --noEmit --pretty false` skončil **exit 0**, bez diagnostik; `.cache/trees-game-fixtures-20261025/tsc-final.log`. `git diff --check` pro tři testy exit 0.

Jde o CPU lifecycle/GLSL frontend/IO důkazy, nikoli pixely, WGSL/GPU výkon nebo přijetí stromových modelů. Neběží port, server, browser, Blender, build ani full suite. Společnou vizuální a produkční přejímku provede root.
