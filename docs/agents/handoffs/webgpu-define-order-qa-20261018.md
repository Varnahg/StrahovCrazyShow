# Předání: webgpu-define-order-qa-20261018

- Vlastník `webgpu-define-order-qa-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, počáteční HEAD `921bff0fed405892ea631e4eb51a19b75403af84`.
- Výsledek: izolovaný projektový QA kandidát, vlastní fyzické core/loaders, cílené testy a whole-patch roundtrip. Není produkčně přijatý ani commitnutý. Žádný další BMAD workflow.
- Zápisy jen tento handoff a `.cache/webgpu-migration-checks/define-order-qa-20261018/`. Native/main, původní proof, V4/V5, readonly dependencies a hrané buildy se nemění; cizí WIP není převzatý.
- Vstupy: frozen V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`, proof `96eb1c7cc96c2a97d3c6eccc03d6c82714dcf5401a3b6b234b959ff4a50af355`, canonical kontrakt `b4892c57e483f6b4a06ff97c59c1378cb9682cb17f3be2acb942644c28883dc2` a původní inactive-light QA core/loaders.

## Přesný rozsah a rozhodnutí

Jediný library runtime soubor: `dependencies/node_modules/@babylonjs/core/Materials/materialDefines.js`, zmrazený SHA `43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4`. Původní toString čte beze změny a poté vrací soukromý bounded canonicalResult. Helper není exportovaný, žádný aplikovaný prototype wrapper nebo další cache. _keys/rebuild/clone/reset/isEqual i původní shader/Effect/readiness lifecycle zůstávají.

Copied source overlay:

- `patches/@babylonjs__core@9.30.0.patch` a `pnpm-lock.yaml`: staré patch bytes zachované, jediný nový hunk, přesně šest SHA substitucí bez installu.
- Nové `tests/material-defines-serialization.test.ts` a `tests/material-defines-wgsl-order.test.ts`.
- Nový povolený fixture prefix `tests/fixtures/material-defines-order/`: `scenario.ts`, `baseline.json`, `provenance.json`.
- Rootem výslovně povolené odstranění pouze dvou historických path assertions v copied `tests/inactive-light-defines-helper.test.ts`; realpath equality a actual tiny-GLB instanceof/dispose assertions beze změny. Žádné přeskočené testy ve finálním běhu.
- Tři výslovně povolené fyzické testové kopie `public/models/vehicles/campus-hatchback-{near,medium,far}.glb`, celkem 7 901 328 B; původní V4 assets beze změny. `test-assets.json` má input/output/before-after SHA. Root má ve full snapshotu použít původní readonly public s ověřenými shodnými bytes.

Ostatní copied source je byte-identický. Všech 15 V4 etap, 30 s deadline, skutečné ready draws a final submit jsou stejné. `decision.md` porovnává varianty a explicitně odmítá automatické ztotožnění tohoto mechanismu s B6 exit burstem. Normalizace zachovává úplnou původní serializaci pro neznámé bloky; flat-valid multiline property se podle původu nerozpozná. Custom order-sensitive processor je prokázaný nepodporovaný případ, nikoli univerzálně bezpečný API kontrakt.

## Ověření

- Původní `targeted-red.log`: 18 testů, 3 PASS / 15 FAIL proti neupravenému serializeru, skutečné ordering/reuse assertion failures. Tento log zůstává zachovaný.
- Finální **`baseline-final-red.log` + `baseline-final-red-run.json`**: nové oddělené staging, původní readonly `materialDefines.js` SHA `fcb89b6c947b81c0907b80caf9f3259b83b0f597922a149f5288f1e9082ca847`, **3 PASS / 15 FAIL**, exit 1 očekávaný. Finální oba testy a tři fixtures jsou byte-identické s GREEN; manifest tento vztah ověřuje. Nejde o parser/import/JSON chyby.
- **`targeted-final.log` + `targeted-run.json`: 18/18 PASS**, exit 0, UTC 05:24:03.506–05:24:08.795. Actual patched MaterialDefines, whole-block fallback/caps/getter order/throw/later mutation/clone/reset; 10 skutečných PBR/Standard/WGSL/plugin/regular/thin-instance cest; genuine value change zůstává jiným Effectem; extra native ref/release a úplný teardown. Actual tiny GLB má jednu core/loaders class identity.
- **`related-final.log` + `related-run.json`: 103/103 PASS, 0 skipped**, exit 0, UTC 05:21:57.382–05:22:27.168. Celých 14 relevantních souborů: původní ownership/exposure/shadow/sky/window/include/budget/stable-light, WGSL surface/avatar-car/vegetation a inactive-light regrese. Car test používá skutečné 3 LOD assets včetně mirrored/quality větve.
- **`scoped-types-final.log`: 3170 source files, 0 errors**, exit 0; pouze nové testy a jejich transitive closure.
- **`patch-applicability.json/log`: 7/7 exact**, reverse celého starého patch na vlastních kopiích → check/apply celého nového patch → všechny výsledné bytes shodné s QA packages. Starý inactive-falloff hunk zůstává.
- Přímý Node/tsx s `TSX_DISABLE_CACHE=1`, žádný pnpm/install, fullsuite/build/integration/GPU/port. Finální runtime zůstává od ohlášení review SHA beze změny.

## Přenosové chyby a neověřené hranice

`targeted-green-01.log` byl lokální chybný transfer: String.replace interpretoval '$`' z regexp template; runtime syntakticky neplatil. Opraveno callback replacement a parse gate. `materialDefines.failed-01.js` a `patch-record-01.json` zůstávají mimo candidate jako archiv. `targeted-green-02.log` selhal při porovnání in-memory undefined properties s JSON baseline, který je neobsahuje; same-engine exact assertion nebyla oslabena. Finální cross-JSON porovnání používá stejnou serializaci. Tyto chyby nejsou baseline RED a nebyly publikované.

`related-first-final.log` má 101/103: historická absolutní path assertion a chybějící existující car assets. Root scope výslovně rozšířil, finální celý běh má 103/103. `scoped-types-01.log` měl jednu unknown→string hranici ve read-only prefix collector fixture; explicitní assertion ji opravila. Žádná z těchto harness oprav neměnila zmrazený runtime/helper kontrakt.

Původní mirrored car-fallback proof RED je byte-preservovaný v `accepted-proof/` a nadále nevyřešený; passing širší car regression jej nenahrazuje. Custom order-sensitive hook skutečně změní kód a je výslovný limit. NullEngine pipeline/draw není driver WGSL validace, GPU/FPS/startup přínos ani obrazová přejímka. Úplný aktuální svět, počasí/multiplayer a všechny externí pluginy nejsou pokryté.

## Freeze, procesy a další krok

`manifest.json` / byte-identický `overlay-record.json` má `baseSnapshotId`, čitelné `changes[]`, `candidateFiles`, dependency input/output manifest, testAssets, evidence a handoff SHA. Core/loaders jsou fyzické nlink1 kopie; pouze jiné balíky jsou readonly junctions. Root může vytvořit define-order-v6 přímo z V4, nikoli V5. Jedna own QA core identita je zachovaná přes app/test/loaders.

Vlastní testy/typecheck ukončené, žádná služba ani GPU scéna spuštěná. Po předání release bez commitu; stav tasku a integraci vede root. Následuje nezávislé review, full snapshot validace a skutečné startup/Golden/F/B6 inward/outward/exit měření bez detailního profileru. Bez přínosu nebo při regresi se kandidát nepřijme automaticky.
