# Předání: client-threading-character-material-init-20261019

- Vlastník: `threading-character-materials-20261019-subagent`; příjemce: koordinátor vlákna `threading-01a15535`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/9b78/StrahovCrazyShow`, detached HEAD `737e0c7abfe3677240b97e243521be46a516fcdd`.
- Výsledek: implementace a cílené CPU ověření připravené k převzetí. Nejde o dokončení KEY-40, GPU přejímku ani integraci do main. Žádný commit/staging podagent neprovedl.
- Změněné verzované soubory: `client/character-materials.ts`, nový `tests/character-material-init.test.ts`, toto předání. Vlastní ignorované výstupy jsou výhradně v `.cache/client-threading-character-material-init-20261019/`.
- Cizí WIP: při vstupu široký dirty strom, z přidělených runtime/test cest žádná změněná. Claim úspěšný bez adopt-dirty. Žádná cizí změna převzata/upravena; kopie závislostí v testovacím snapshotu slouží jen ke čtení/testování.

## Doložený mechanismus a rozhodnutí

Babylon 9.30.0 `Material._markAllSubMeshesAsDirty` iteruje meshe, submeshe a existující draw wrappery celé scény. Materiálovou identitu ověřuje až čtením `subMesh.getMaterial(true, passId)`. Settery prostředí, metallic/roughness, textur a jednotlivých PBR konfigurací proto opakují cizí průchody i pro nový materiál postavy bez spotřebitelů. Veřejné `atomicMaterialsUpdate` blokuje pouze konkrétní materiál a v `finally` obnoví mechanismus; odblokování provede jeden `markDirty` průchod.

Primární zdroje ověřené 19. 10. 2026: skutečně spuštěné `node_modules/@babylonjs/core/Materials/material.pure.js` (218–244, 978–1004, 1376–1404), `Materials/PBR/pbrMaterial.pure.js` (dekorátory), app `character-materials.ts`, `avatar-hair.ts` a precedent `avatar-garments.ts`. [Veřejné API Babylonu](https://doc.babylonjs.com/typedoc/classes/BABYLON.Material#atomicmaterialsupdate), [upstream pin 9.30.0](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Materials/material.pure.ts). Rozhodující pro reprodukci je lokální vykonaný kód, jeho SHA jsou v manifestu.

Varianty porovnány před runtime změnou v `.cache/client-threading-character-material-init-20261019/research.md`:

- Ponechat settery: zachová 4–11 redundantních průchodů na cache miss.
- Dávkovat pouze inicializaci nového nesdíleného materiálu veřejným API: nejmenší zásah, jediný závěrečný průchod, zachování setterů a lifecycle; vybráno po RED.
- Prewarm/další cache: přesune práci do startupu nebo přidá vlastnictví; stávající cache hity už jsou bez průchodů.
- Worker: samotný přenos dat neodstraní setterové průchody scény; přesun renderování je výrazně širší lifecycle/message/resource změna bez zde změřeného přínosu.
- Scene-wide suppression, trvalé blokování a SDK patch: zbytečně široké riziko invalidace a údržby; odmítnuto.

Runtime delta pouze obaluje existující inicializační blok v `material.atomicMaterialsUpdate`, před `this.materials.set`. Cílený refaktoring odděluje `const cached` a `const material`, takže callback drží jednoznačně novou PBR instanci. Hodnoty, pořadí setterů, lazy textury, hair plugin, key a cache/prune/dispose logika zůstávají stejné. Žádný nový stav nebo cache; jedna krátce žijící synchronní callback funkce na cache miss.

## RED/GREEN a cílené ověření

Root `node_modules` není přítomen. Vlastní snapshot `.../.cache/client-threading-character-material-init-20261019/snapshot` obsahuje kopie klienta, shared, vybraných testů a konfigurace. Jeho `node_modules` junction čte již připravený donor `.cache/client-threading-lab-20261019/snapshot/node_modules` (Babylon 9.30.0, tsx 4.23.15, Node v24.19.0). `assets`/`public` junctiony jsou při testech pouze čtené. Neběhla instalace ani úprava donor dependencies.

1. **RED před runtime změnou**, 19. 10. 2026 19:54 CEST, exit **1**; log `.cache/client-threading-character-material-init-20261019/red.txt`. Z rootu:

   ```powershell
   node .cache/client-threading-character-material-init-20261019/snapshot/node_modules/tsx/dist/cli.mjs --test .cache/client-threading-character-material-init-20261019/snapshot/tests/character-material-init.test.ts
   ```

   16 skutečných cizích meshů, každý dva draw wrappery. Wrapper `getMaterial` pouze počítá a deleguje do původní Babylon metody. Všech 13 povrchů selhalo proti hranici 32; parent + cases = 14 failed, ostatní tři testy passed.

   | Povrch | RED cizích čtení | GREEN cizích čtení |
   | --- | ---: | ---: |
   | skin | 192 | 32 |
   | hair | 160 | 32 |
   | strands-short02 | 352 | 32 |
   | strands-short04 | 320 | 32 |
   | beard, cloth, denim (každý) | 224 | 32 |
   | leather, eye, iris, metal, rubber (každý) | 128 | 32 |
   | ocular | 320 | 32 |

2. **GREEN stejný příkaz po runtime změně**, 19:54 CEST, exit **0**, **17/17**; log `green.txt`. Cache hity mají 0 čtení; všech 13 povrchů jeden průchod. Kontroly hodnot, clearcoat/sheen/alpha, hair shader pluginu, textur, prvních ready defines, prune/recreate/dispose a pozdější invalidace prošly. Po `bumpTexture = null` dva existující spotřebitelé znovu dirty a oba připraví `BUMP=false`; cizích čtení opět 32, takže normální invalidace nezůstala blokovaná.

3. **Rozšířená cílená sada**, cwd vlastní snapshot, příkaz:

   ```powershell
   node node_modules/tsx/dist/cli.mjs --test tests/character-material-init.test.ts tests/student-garment-init.test.ts tests/student-hair.test.ts tests/student-eyes.test.ts tests/student-garments.test.ts
   ```

   První běh 19:55 CEST exit **0**, **34/34**, log `targeted.txt`. Finální běh po typovém zpřesnění testového observeru 19:57 CEST exit **0**, **34/34**, 10,7 s, log `targeted-final.txt`. Kontroluje navíc existující runtime UV/alpha zdroje, varianty/LOD, pupil/hair clearances, šest presetů a garment lifecycle. První příprava rozšířeného snapshotu omylem použila cwd snapshot místo rootu; chybějící fixture kopie byly opraveny před těmito doloženými rozšířenými běhy. Ten neúplný přípravný pokus není vydáván za rozšířenou přejímku.

4. **Cílená typová kontrola**, cwd vlastní snapshot:

   ```powershell
   node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --experimentalDecorators --useDefineForClassFields false --types node,vite/client tests/character-material-init.test.ts
   ```

   První běh exit **2**: TS2345 na sjednoceném poli Material/BaseTexture observerů (`typecheck-initial.txt`; původní `typecheck.txt` také zachován). Opraven pouze test: samostatné typované registrace volají společný ověřovací callback. Finální běh exit **0**, bez diagnostik, doložen výsledkem nástroje (session66366, dokončení chunk114477). Tichý výstup nevytvořil zamýšlený soubor `typecheck-final.txt` přes Tee-Object; samostatný finální textový log neexistuje. Runtime nebyl touto úpravou změněn.

5. `git diff --check -- client/character-materials.ts` exit **0**. Vlastní runtime diff je v `runtime.diff`; ignorování odsazení ukazuje pouze const split a nový veřejný wrapper.

## Identita a předání

- Manifest testovaného snapshotu včetně testů: `.cache/client-threading-character-material-init-20261019/manifest.json`, source-map SHA-256 **268a5a25e170a4b233db7aa4d5cdc89d610f4b41e77a3f52989b001bca0b0d6b** (234 souborů; nejde o kompletní produkční snapshot).
- Původní `character-materials.ts`: SHA-256 `c0b06d3bf1cc25b8ac33cf3a124c95b74fe3f99bad23a0553f6e4adb01935733`, kopie `baseline-character-materials.ts`.
- Finální runtime: SHA-256 `9746cccbc7590abd15735f19a1a441aaa56daaa6bbd35d2078b77e2ea0727fa3`.
- Finální test: SHA-256 `36afc651072b5db61139c6ddfd9868e6c1329a79e80a7d72be4f74f28d6f2230`.
- Procesy: pouze ukončené CLI/testy/typecheck; žádný server, port, GPU ani dlouhožijící pomocný proces. Heavy-validation, workspace-build ani GPU se nepoužily.
- Rezervace: předání dokončeno; vlastník bezprostředně poté uvolní svůj claim. Skutečné uvolnění potvrzuje koordinační registr a zpráva rodiči. Stav tasku mění až integrátor.
- Automatická kontrola zamítla volitelný úklid náhodné pomocné kopie pod vlastním `snapshot/.cache/` s textem „blocked by policy“, i po přesném ověření cesty. Kopie ponechána, není součástí manifestu ani importovaných/testovaných zdrojů; není to blokace předání.

## Omezení a další krok integrátora

NullEngine je pouze důkaz CPU traversal a Babylon ready/defines/lifecycle. Test zapne derivative capability a označí CPU raw-texture placeholders ready, protože NullEngine nemá skutečný driver/image decoder. Nekompiluje WGSL na GPU, neměří FPS ani obraz.

Transit envelope 78,9/69,9/46,6 ms zatím neatribuuje náklad této funkci. Snížení počtu redundantních průchodů není důkaz odpovídajícího snížení celého hitch ani dosažení FPS cíle. Plná sada, build, izolovaná integrace, frozen produkční vizuální parita a srovnatelné profilování nebyly podagentovi přidělené. Koordinátor převezme pouze tři výše uvedené vlastní soubory, review/ověří delta, aktualizuje Linear a `docs/verification.md`, provede rezervované přejímky a teprve poté samostatně commituje/integruje ověřený celek. Hrané frozen verze se neměnily.
