# Převzetí a aktivace katalogu110

27. 10. 2026 · root `trees-catalog-game-root-01a16b37`, D pracovní kopie, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.

Přijatý autorův handoff: `trees-20261026-catalog-export.md` a `.cache/trees-catalog-export-20261026/handoff-final-manifest.json`, SHA `5fabba5d0a2fb5717d1d36753754f613cddd5b87474e89a4b694ec10c60362c7`. Po jeho ukončení procesů a release převzal root původní export scope jako `trees-catalog-export-root-01a16b37` s doloženým `--adopt-dirty`. Tím se nepřijímají odmítnuté výrobní pokusy do Git; platí jednotlivé cesty accepted release seznamu.

Nový skutečný descriptor `shared/data/assets/tree-catalog.json` odkazuje na atomicky publikovaný v4 katalog všech110. `Game.start()` používá jednu z voleb: platnou lokální QA dvojici nebo úplný katalog. Vegetation předává descriptor existujícímu loaderu. Běžný host a multiplayer mají stejný katalog. Žádné URL z query nebo další chybový/fallback systém nepřibyl.

Release seznam je byteově převzatý do `docs/trees/20261025/catalog-release.json`, SHA `791523688bb546022a87c40bb28a5d8b4e60525369a9c6ec2b0d6fb93fe940a4`. Nový `tests/tree-catalog-release.test.ts` kontroluje110identit, původní kořeny/radii/rozměry/family/nejistoty, všechny runtime odkazy a mapy, unikátní native modely a shodu s publikovaným native katalogem, relativní knihovny a skutečné SHA/bytes všech588souborů. Proudové hashování probíhá jednou za soubor.

Skutečné ověření: tři cílené Game startup případy PASS; jeden celý skutečný release test PASS, 16,03s. Čtecí review aktivačního diffu nenašlo runtime blocker; doporučená kontrola unikátních native cest a vazby na native-catalog byla doplněna před PASS. Logy ve `.cache/trees-catalog-game-20261026/`.

27.10: stabilní candidate-v13 se připravuje s accepted output filtrem a byteově ověřeným reuse pouze starších neměnných assetů. Obsahuje i release fixture a testy. Build/GPU/celá sada/integrace/commity/main ještě nejsou dokončené; žádný výsledek nevydává samotný decoder audit za GPU důkaz.

Aktualizace27.10: v13 `d381c244f9e667ebfe85c420133effbca0fa0c4b9326d27f8593cd148a13a9f7` má build a izolovanou integraci PASS. Celá sada2345:2337PASS/5FAIL/3SKIP; pět chyb fixture opraveno ve vlastním navazujícím tasku, všech5cílených testů PASS. Root po přečtení dvouřádkového diffu a manifestu `5a63a25955be5a9cc4b4fbd4d72e2a9d5f1c00a1afc25a54a5bbc4c306a16950` převzal `trees-20261027-snapshot-fixture` jako `trees-snapshot-fixture-root-01a16b37`. Audit9444vstupů potvrdil pouze tento testový rozdíl, runtime/modely beze změny.

Dva Edge starty selhaly s přibližně1Hz callbacky během přípravy; druhý měl před startem59,9Hz, takže pouhá aktivace karty nestačí. Potřebné lidské potvrzení popředí bylo vyžádáno a dosud nedorazilo. GPU přijetí ani commit/main nejsou hotové. Podrobnosti `docs/verification-evidence/trees-20261025/webgpu-v13.md`. Starší `.cache/trees-20261025/live-state.json` je neaktuální; pro pokračování použít toto předání a skutečný registry/process stav.
