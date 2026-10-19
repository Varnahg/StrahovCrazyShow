# KEY-31: exact native shadow sharing transfer

- Task `webgpu-shadow-share-native-20261019`, owner `webgpu-01a15102-shadow-share-native`, root integrátor. Přímý BMAD leaf; žádný další renderer/podagent/commit.
- Frozen manifest `.cache/webgpu-shadow-share-native-20261019/manifest.json`, SHA256 `72ad99fd12f9d5c46fb7c8598267d87cebfd6af6ca54b9c47c6ee420995ffbfb`. `files` mapuje přesných sedm repo payloadů; handoff je samostatný. Po zveřejnění manifestu se payloady nemění.
- Runtime beze změny algoritmu: přesný reviewed `f8a8c6091af9caa96ba897f28d7d490f3607d7856dee86b3a05321e1477aba29`. Jediná změněná sekce v `patches/@babylonjs__core@9.30.0.patch` je `Materials/shadowDepthWrapper.js`; ostatních osm sekcí byte-exact, včetně MaterialDefines `3cc739…`.
- Patch SHA256 `a586e550…` → `965f9774f8fd436bcd699d6f54c0a1b64a318f554bb261a85aa9189828f55c49`; lock SHA256 `35e3b0d6…` → `89cc1fb1c60b6a0a79d97e102da09ecf96bfb4ea68d22213bdba640240349315`. Pouze šest souvisejících hash referencí nahrazeno, inverse obnoví původní lock byteově.

## Přesnost patche a locku

- Současný patch SHA256 přesně odpovídal všem šesti64hex lock referencím ještě před změnou. Primární předchozí ověření stejného pinned pnpm11 postupu: `docs/agents/handoffs/webgpu-schema-native-20261019.md`, `.cache/webgpu-schema-native-20261019/patch-proof.json` a root fresh frozen-lockfile instalace nativního F3. Neodvozuje se neověřený base32 či nový lock formát; žádný install leaf nespouštěl.
- Reverse původní SDW sekce na accepted `bd2bfe313728751f375d613492e7210adb09733556dcb8e6f2d8e720b55f122c` obnovil pristine reverse preimage `1dd9f41786ad5c61b992cd94dc8840c0d83217d5fd2f445f13d94f41dc0848a5`; nový upstream→candidate diff přesně obnovil f8a8c609. Zpětné nahrazení sekce obnoví celý původní patch.
- Navíc celý původní patch byl reverzně aplikován na devět actual pinned F3 modulů ve vlastní izolované Git fixture; celý nový patch aplikován vpřed. **9/9 výsledků byte-exact**, jediný nový SDWf8, MD3cc i ostatní soubory zachované. Konkrétní SHA/preimages/diffy/lock inverse v `patch-proof.json` a vlastním cache. Žádný upstream tarball či závislost se nepřepisuje; finální fresh pnpm aplikaci ověřuje root.

## Portable19 regresí

- Nový `tests/webgpu-shadow-sharing.test.ts` je pouze modulový top-level wrapper, který dynamicky importuje MJS test URL a registruje všech19 případů v běžné sadě.
- `tests/fixtures/webgpu-shadow-sharing/loader.mjs` používá `import.meta.resolve("@babylonjs/core/Materials/shadowDepthWrapper.js")`; od této skutečné installed URL řeší ostatní core moduly. **Žádný source overlay, env override, absolutní cesta či QA cache v default portable testu.**
- `fixture.mjs` a `shadow-share.test.mjs` jsou byteově nezměněné reviewed helper testy; vlastní loader byl refaktorován na portable installed resolver. Provenance JSON popisuje pinned modul/helper SHA a CPU-only hranice. Testy zachovávají actual Effect/engine cache/refcounts a samostatné actual WebGPU Draw/Material contexts na NullEngine substrate, včetně WebGL kontroly.
- `node .cache/webgpu-shadow-share-native-20261019/run-light.mjs`: skutečný unchanged installed bd2 **RED13pass/6fail**, exit1; v explicitně izolovaných vlastních child procesech s jediným source overlay f8 **GREEN19pass/0fail**, exit0; scoped strict TypeScript wrapperu exit0. Raw `red.log`, `green.log`, `types.log`, `light-results.json` jsou zachované a hashované.
- GREEN overlay kód existuje výhradně ve vlastní cache, není součástí repo portable fixture. Žádná změna dependency bytes; vlastní sandbox jen kopíruje pět testových/fixture souborů a junction na readonly F3 dependencies. První portable RED/GREEN/type pokus měl uvedené očekávané výsledky bez harness opravy.

## Převzetí

- Root může převzít sedm `manifest.files` cest, připravit clean3c4/acceptedcombined77d se skutečným fresh frozen install, zkontrolovat jedinou core/loaders identity a10860 souborů, fullsuite/TS/build/integration a integraci. Leaf nic z těchto heavy/GPU/install gate nespouštěl.
- Root actual QA6programs/7sync a smoke jsou kontext předchozího přijetí, nikoli nový výsledek tohoto přenosu. ≥100ms záseky a další přejímka zůstávají; tato jednotka omezuje násobení odvozených programů a **neuzavírá KEY31/32 ani migrační cíl**.
- Hrané4201/4199/4188/4192 a cizí WIP beze změny. Vlastní procesy dokončeny; žádný server neběží. Po předání release, task stav/commit/Linear řídí integrátor.
- Metadata oprava po prvním release: doložený původní vlastník znovu claimnul vlastní osm dirty cest přes adopt-dirty pouze pro opravu počtu pěti sandbox test/fixture kopií v tomto handoffu. Sedm manifest.files payloadů i frozen manifest zůstaly beze změny; následně opět release.

Root převzetí: webgpu-01a15102-shadow-native-integration převzal přesně frozen7payloadů a vlastníhandoff podle leaf předání; claim/adopt-dirty chrání patch/lock/testy během fresh-install přejímky. Žádný nový runtimealgorithm ani cizíWIP není přebírán.

Root přijetí: clean1472/1472,combined1532/1532,obabuildy/fullTS a2×4isolatedintegration PASS;freshinstall10860files přesněF3 kroměSDWf8. Actualnativecombined Medium6programs/7sync/errors0,5>=100ms přetrvává. Přijato pouze jako omezení násobení programů a portablepin,neceláplynulost/default/KEY31. Detail QA evidence v navazujícím tasku webgpu-shadow-share-native-qa-20261019.
