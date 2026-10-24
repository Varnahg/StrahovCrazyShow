# Předání: webgpu-completion-native-instance-buffer-20261021

- Owner `webgpu-completion-01a15a3e-instance-native-v1`, příjemce root KEY-22. Přímý implementační leaf, bez dalšího BMAD/podagentů/commitu.
- Cwd `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/webgpu-completion-20261021`, baseline `77efa9d1052c5b68cbf07493b06810336bfd979d`.
- Výsledek: lokální native pinpatch kandidát pro NCM regular-instance vertex bindings. Sdílená installed knihovna zůstává původní a běžící root source5/helpera5/frozenv6 se nezměnily. Nejde o přijetí GPU/defaultu/migrace nebo přiřazení původního actual buffer37326.
- Cizí WIP: nic nepřevzato. Game/UI/render-startup/startup-view a cizí tests zůstaly pod jejich vlastníkem. Pouze přidělený patch/lock/portable fixture/evidence/own cache/handoff byly změněny.

## Podklady a volba

[Research/varianty před implementací](../../performance/evidence/webgpu-completion-20261021/native-instance-buffer/README.md) a přesná úspěšná předchozí inline verze `inline-red-repro.mjs` byly zapsané před patchem. Full native cold Mesh.render→Material preBind/bind→instances→Geometry→native cache/draw prokázal2048→4096 stale raw handle reuse a původní ref0/deferred destroy. Pouze připravený Effect a terminální GPU/raster IO jsou fake; native base Material není celá Standard/PBR/Game/GPU přejímka. MDN submit validation je primární API podklad potvrzený rootem; plný W3C submit dokument se neoznačuje jako přečtený. PR18238 SelectionOutlineLayer je již přítomný a nemá automaticky stejný active-draw lifecycle.

Vybrán per-active DrawContext current/previous actual DataBuffer ID guard před každým skutečným regular-instance _bind/_draw. Na změně nebo neznámé/null ID invaliduje pouze fastBundle a uloží dva scalar IDs. Žádná per-draw alokace, scene/context/attribute scan, GPU/readiness/fence/timeout/cache-disable; žádné přepsání UBO/indirect/material/Effect ownership. Lazy kontrola chrání i jiný pozdější renderpass/submesh/temporary shadow override. GL/CM bypass a explicitní useVertexPulling=true passthrough jsou zachované. Samotná jednorázová growth invalidace current contextu nestačí; mesh/context.reset/dispose po preBind by zahodil již navázaná UBO/indirect data a byl odmítnutý. Generic vertex/index/geometry/thin nebo vertex-pulling storage refresh jsou mimo tento fix.

## Přesný payload

- `patches/@babylonjs__core@9.30.0.patch`: přidaná pouze sekce `Meshes/mesh.pure.js`, ostatních9sekcí tvoří byteově shodný prefix. Refaktoring cache aliasu `drawContext` sjednocuje původní useInstancing a nové2ID porovnání; bez dalších lifecycle změn.
- `pnpm-lock.yaml`: pouze6souvisících64hex hash referencí. Zpětná náhrada přesně obnoví původní bytes.
- `tests/webgpu-instance-buffers.test.ts`: portable TS module wrapper.
- `tests/fixtures/webgpu-instance-buffers/loader.mjs`, `fixture.mjs`, `instance-buffers.test.mjs`, `provenance.json`: normálně pouze actual installed package přes import.meta.resolve; bez env přepínače, absolutní QA cesty nebo overlay v repo fixture.
- `docs/performance/evidence/webgpu-completion-20261021/native-instance-buffer/`: výzkum/rozhodnutí, původní přesný inline reproduktor, own prepare/verify utility, red/green/inline/type logy, patch-proof/verification a finální manifest. Development loader/fixture failure logy jsou zachované odděleně.
- `.cache/webgpu-completion-native-instance-buffer-20261021/`: pouze vlastní baseline byte copies, isolated source/patch fixture a child import hook; žádný payload pro instalaci do root node_modules. Vlastní vnořený Git adresář slouží jen confined reverse/apply ověření.
- Tento vlastní handoff.

## Identita a přesnost patche

- Installed/baseline Mesh SHA256 **`e9ddcb55af0e64211628fcb3938c50271cc672836737618e1ec023e208400bc1`**, kandidát **`7ceb79d2f4eaa72665e5084ffc6e752bbbb93dd84a7f97801c9cf2431afa459a`**.
- Patch `965f9774f8fd436bcd699d6f54c0a1b64a318f554bb261a85aa9189828f55c49` → **`597beca732c25cbb128271fad6681fd0176726962ede3218db41057359ea9b72`**.
- Lock `cb0c10f624a76ccd59ef44ed6a61935c58512a2a13711d6bf439a68f015359a7` → **`d91d6f2cdc70196ee1a44b7ae9b1adab8b8bd48f2092b138a4def94a12c668df`**.
- Complete old patch reverse + complete new patch apply ve vlastní fixture:10/10files přesné, všech9starých patched source beze změny, jen nový Mesh. `patch-proof.json` obsahuje každý SHA. Globální core.autocrlf=true první development pokus převáděl LF na CRLF; vlastní apply nyní explicitně používá `git -c core.autocrlf=false`, bez změny globálního/project configu. Byte-exact je prokázaný po tomto explicitním nastavení.
- Lock inverse obnoví původní bytes; patch prefix obnoví všech9původních sekcí byteově. App/loaders actual core singleton a9.30.0 verze ověřené. Used native source SHA before==after v verification.json; žádná sdílená dependency nebyla přepsaná.

## Ověření

`node docs/performance/evidence/webgpu-completion-20261021/native-instance-buffer/verify.mjs` nad dosud původní installed knihovnou:

- **Installed RED4PASS/10FAIL**,14tests, exit1 očekávaně. Primární cold native chain je skutečný červený behavior witness, nikoli jen static/private property assert.
- **Isolated GREEN14PASS/0FAIL**, exit0. Explicitní child import hook v own cache nahrazuje jen zdroj Mesh modulu, všechny ostatní native dependency bytes zůstávají installed. Hook není v portable repo loaderu/testech.
- Strict scoped TypeScript wrapperu exit0; není to full-project sémantická kontrola.5MJS syntax kontrol exit0; diff-check vlastního scope exit0.
- Přesný uchovaný původní inline red soubor znovu běžel exit0 a zachoval1record/1reuse se zničenými old raw handles. Source/log SHA ve verification.json.
-14cases: full native cold current+previous2048→4096 bez seeded bundle/manualrelease, stable third reuse, zachovaný context/buffers/UBO bindings/bindGroups/indirect a žádné reset/dispose/UBO-slot release, jiný actual DrawContext/temporary SubMesh shadow override, další pass/storage, previous first-created při stejné capacity, no-effect/fillMode-undefined preparation→pozdější draw, null/undefined/disposed IDs a platná0ID, originální material dirty/outside-draw reset, přesné falsy draw/allocation throw/refcounts, GL/CM a explicitně nepokrytý vertex-pulling režim. Fake shader ABI při previous=false nepožaduje dosud neexistující previous atributy; jejich první vytvoření se ověřuje novým current a scalar previous ID.
- Development problémy byly pouze Windows --import path místo file URL, počáteční fake ABI žádající previous atributy před jejich vznikem a nesprávné očekávání NullEngine placeholder DataBuffer.capacity místo skutečné instance storage size. Finální native code se kvůli těmto fixture opravám neměnil. Zachované development logy nenahrazují finální green.

Aktuální raw commandy/čas/count/source/log SHA jsou ve `verification.json`, `red.tap`, `green.tap`, `inline-red.log`, `types.log`. Utility verify je leaf pre-install red/green důkaz: po root fresh instalaci správně čeká jiné installed bytes; root pak běžně spustí portable `node --import tsx --test tests/webgpu-instance-buffers.test.ts` bez overlay. Žádné source/hash override/env není v normální testové sadě.

## Omezení, procesy a převzetí

Bez GPU validátoru, skutečné grafiky/FPS nebo full Standard/PBR/Game binding reprodukce. Original37326 je stále owner unknown. useVertexPulling=true zůstává původní path, včetně jeho samostatně doložené storage-refresh meze; thin/custom/index/geometry mutace nejsou tímto patchem řešené. Skutečný výkon porovnání2IDs versus původní cache musí změřit root. Žádný nový install/fullsuite/build/server/browser/GPU nebyl spuštěn a žádný cizí proces nebyl ukončen.

Vlastní lehké procesy doběhly; žádný port/server ani dlouhožijící helper neběží. Root převezme pouze exact manifest payload, provede fresh frozen-lock install/core singleton/projection kontrolu, relevantní fullsuite/TS/build/integration a actual native NCM pass/health/trace přejímku. Změna neuzavírá KEY-22 a release není Done. Stage/commit/Linear/task/verification integraci provádí root.

Peer review: `/root/webgpu_renderer_audit` explicitně potvrdil finální **findings[]** a všechny Mesh/patch/lock SHA uvedené výše. Nezávisle ověřil6payload source/31pin SHA před/po i současné bytes, red/green/inline/TS logy, complete reverse/apply,9původních sekcí a6lockrefs/inverse, portable resolver a všechny uvedené hranice testů. Finální verification.json raw SHA **`0d44ac48f5b6a48814b143fd14065decb30d958d2a8fe9ac6f13ec320f950d82`**. Přesný read-only review záznam je native-instance-buffer/review.md.

Po tomto dokončeném předání vznikne `native-instance-buffer/manifest.json` s přesnými payload/evidence/handoff file SHA. `filesSha256` uvnitř manifestu je pouze digest minifikované files mapy; **raw SHA celého manifestu** je samostatně oznámen koordinátorovi a je správný pro byteový stage guard. Manifest nezahrnuje sám sebe. Bez dalších změn následuje CLI release vlastního tasku; skutečný výsledek release dostane root. Release není fresh-install/GPU přijetí nebo Done.
