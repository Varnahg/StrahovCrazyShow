# Předání: webgpu-standard-ibl-native-20261018

- Vlastník: webgpu-standard-ibl-native-01a14497-child; příjemce: root, webgpu-migration-01a14497-root.
- Pracovní kopie: C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow; větev codex/webgpu-migration; výchozí HEAD 26378f4a05d8668f0416b031901b5fb8ae815f8b.
- Výsledek: nativní vendor přenos obou ověřených Standard IBL deklarací a přenositelná regrese jsou připravené k převzetí. Bez commitu a stagingu; integraci provádí root.

## Rozhodnutí a příčina

StandardMaterialDefines registroval klíče před tím, než shared IBL helper dodatečně přiřadil USESPHERICALFROMREFLECTIONMAP a LODBASEDMICROSFURACE. Registrace závisela na předchozím rebuild při přidání světelného slotu každého submeshe. Čerstvý přijímač proto mohl dostat jiný serializovaný shader key než už připravený přijímač stejného materiálu, geometrie a světel. Volba je explicitní false deklarace obou polí před constructor.rebuild a odpovídající d.ts. Zachovává skutečné IBL hodnoty; nemění cap, textury, světla, warm etapy ani global cache.

Širší alternativy byly porovnány v předchozích proofech: shared IBL guard/reset by ovlivnil další materiálové rodiny; dodatečný rebuild přidává práci a registruje i jiná pole; opakované warm etapy neřeší čerstvý submesh; falešná textureLOD=false mění PBR; PersistentMode ani globální cache není součást řešení. CPU parity je doložena předchozím proofem, nikoli předpokládaná z pouhé deklarace.

## Přesné soubory a vlastnictví

- patches/@babylonjs__core@9.30.0.patch: přidáno 24 řádků, jen JS+d.ts dvě pole. Každý původní byte zachován jako prefix.
- pnpm-lock.yaml: pouze 6 výskytů starého patch SHA nahrazeno novým; zpětná substituce vrací byteově preimage.
- tests/standard-ibl-defines.test.ts: nový přenositelný test se 4 případy.
- .cache/webgpu-standard-ibl-native-20261018/: vlastní test closure, readonly node_modules junctions, preimages, první neúspěšné pokusy, finální logy, apply fixture a manifest.
- Tento handoff. Žádná změna package.json, Game, helperu, cizích WIP, shared dependencies ani běžících buildů. Ostatní dirty soubory v checkoutu patří ostatním vlastníkům a nebyly převzaty.

## Ověření a refaktoring

Test používá skutečný StandardMaterial, RawCubeTexture, světla, fog, shader preparation a camera-pass draw. NullEngine adaptér nahrazuje pouze raw cube upload. Fresh mesh je geometrický klon vytvořený před warm 0/1, sdílí exact material/geometry, je disabled a nemá Effect/defines před prvním aktivováním. Pro oba textureLOD caps testuje strict Effect a nenulový pipeline context reuse i replay 0/1/0. Druhý případ ověřuje null→cube→null→cube, skutečné defines a zachování živé textury.

Společná fixture sjednocuje readiness, draw witness a dispose. Každý test zruší scénu i engine a ověří prázdné mesh/material/texture seznamy. Identitní assert porovnává boolean, aby při negativním výsledku negeneroval obří diff cyklických Babylon objektů. Žádný produkční runtime refaktoring nebyl potřebný.

- node .cache/webgpu-standard-ibl-native-20261018/run.mjs red 04: exit 1, 0/4 PASS. Oba fresh případy selžou přesně na warmed Effect identity; oba cube případy na chybějícím serializovaném USESPHERICALFROMREFLECTIONMAP. Log red-04.log, timestamp a runtime/test/core hash v red-04.json.
- node .cache/webgpu-standard-ibl-native-20261018/run.mjs green 04: exit 0, 4/4 PASS. Log green-04.log a green-04.json. Cílené CPU testy doběhly; žádný vlastní proces/port nezůstává.
- Pokus 01 zachován: RED timeout 30 s, neplatí jako discriminating RED; GREEN 2/4 kvůli chybnému testovému přístupu k neexistujícímu cube.isDisposed. Nahrazeno veřejnou scene membership + isReady kontrolou. Pokus 02 RED 0/4 / GREEN 4/4; pokus 03 přidává výslovnou non-null context kontrolu; finální pokus 04 převádí readiness čekání z počtu iterací na 4 s wall-clock deadline. Oba mají RED 0/4 / GREEN 4/4.
- git apply --check a následný apply pouze nových hunků na vlastní fyzickou kopii dvou starých souborů: exit 0; výsledek přesně odpovídá privátnímu JS716dfac1…552dc37 a d.tsdef7952e…04488c.
- git diff --check pro vlastní patch/lock/test: exit 0.

Nezávislý read-only review /root/functional_record: žádný konkrétní runtime/patch nález ([]). Neblokující riziko pomalých async importů při limitu 40 event-loop iterací bylo vyřešeno limitem 4 s skutečného času; guard stále vyžaduje skutečný camera-pass draw a Effect.isReady. Nové cílené RED/GREEN výsledky jsou výše. Reviewer nespouštěl testy ani GPU.

## Identita checkpointu

- Patch SHA256: 4b5db0c0716db43a7225b78fc2914f2e6f0d88e7a95c7408cf9f5c2312a99f15.
- Lock SHA256: 8550e368c800f23b0763aa1e6a9e317ef4de90d272da2b7e9a1aa6a9ea11f0b6.
- Test SHA256: 0cc147d6728d2e2132310d44422025b54fc6aef5814d4cf0bbefb8c45761cedb.
- Manifest: .cache/webgpu-standard-ibl-native-20261018/manifest.json; SHA256 893b10a0f960e9e5892c8cd8dbc5ded72cdd3797a968f8f5074bafcae6d1e11b. Obsahuje preimages, inputcore, logs, přesné argumenty i neúspěšné pokusy.
- Prior LOD proof: docs/agents/handoffs/webgpu-standard-lod-define-proof-20261018.md; manifest 3c2c0873e65e518950213bf9e075e6952c0fd2d5b9c145e4b30e1688654d5e73. Obsahuje 28/28 actual Game/fresh/history/caps ověření a exact GLSL/WGSL source/layout parity.

## Omezení a převzetí

NullEngine není GPU/obrazový/FPS důkaz. Tato relace nespouštěla install, full TypeScript, fullsuite, build, integration ani GPU. Root má provést čistou izolovanou instalaci nového patche, celý stabilní checkpoint a vlastní přejímku. Root již hlásí actual GPU candidate 1bc02a… s 0 novými programy/moduly; zůstává 13 synchronních pipeline a max 471,5 ms. To není dokončení KEY31 ani celého migračního cíle.

Rezervace je po předání uvolněna příkazem release; dirty vlastní soubory jsou výslovně předané rootovi a nejsou volná neznámá práce. Stav tasku, Linear, integrace a docs/verification.md patří integrátorovi.

## Root integration and remaining GPU work

18.10.2026 root integrated vendor WT418a3824→main8b949b7a and receiver WT b033b386→main246002fc. Fresh native1439/combined1499, both full TS/build/isolatedintegration PASS. Evidence docs/performance/evidence/webgpu-migration-20261016/authored-native/README.md. Combined diagnostic0programs/max471.5ms; subsequent normalnative5programs/max573ms, so full native GPU acceptance remains OPEN. Protected builds unchanged; ownQA stopped.
