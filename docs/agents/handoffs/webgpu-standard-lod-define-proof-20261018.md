# Předání: webgpu-standard-lod-define-proof-20261018

- Vlastník: webgpu-standard-lod-define-proof-01a14497-child; příjemce: root.
- Pracovní kopie: C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow, codex/webgpu-migration. Výstup pouze .cache/webgpu-standard-lod-define-proof-20261018/ a toto předání.
- Výsledek: izolovaný dvouřádkový kandidát prokázal RED/GREEN skutečné historie různých submeshů. Runtime přijetí, native patch/lock a GPU ověření zůstávají koordinátorovi.

## Mechanismus a volba

Actual GPU startup79/80 a drive415/416 používají stejné materiály, atributy a pass, ale jiné submeshe. Ve StandardMaterialDefines chybí LODBASEDMICROSFURACE. Lights mohou rebuildovat _keys před IBL přiřazením engine capu; následná nová světelná pozice zaregistruje již existující IBL hodnotu. Nový submesh tuto historii nemá. WebGPU má textureLOD=true, zatímco předchozí NullEngine měl false.

RED nad starým privátním core91e981 potvrdil u nových skutečných receiverů hodnotu=true, key=false a dva nové programy; připravené mají value=true/key=true. Jediný celý define rozdíl je chybějící LODBASEDMICROSFURACE; atributy jsou stejné. Nejde o doložené zmizení mipmap, změnu enginové capability nebo uvolnění Effectu.

Zvolená změna: Standard constructor přidá false deklaraci před rebuild; d.ts přidá boolean field. Původní USESPHERICALFROMREFLECTIONMAP deklarace a všechny další ownership/exposure/shadow/define opravy zůstávají. Sdílený IBL guard/reset by měnil další materiály a sampler/refraction kontrakty; helper rebuild registruje další dynamické položky; opakování warm etap neopraví nové submeshe; nepravdivé cap=false může změnit PBR filtraci. Žádná z těchto širších změn není součástí kandidáta.

## Izolace a přesné soubory

Fyzicky vlastní core (10037 souborů) a loaders (823 souborů), ostatní závislosti jsou read-only junctions. Počáteční kopie byla kompletně hashově porovnána. Původní setup node_repl překročil120s při inventarizaci; verify-inputs.mjs ověřil dokončené kopie před jakoukoliv deklarativní úpravou. Game388caed28049fd41b70d485446de2db65978c75de264949677e6ce486373dd68, helper1b455b8a87995433fdf79e59965d11453fca514fbeb055166ac21283c03c6a18 a všechny copied sources zůstaly beze změny.

Změněny přesně dvě vlastní vendor cesty:

- case/node_modules/@babylonjs/core/Materials/standardMaterial.pure.js: 91e9810b0fea2366e407cd58e2cbb1bbde31c39525c03b1aba75efcc5e218f33 → 716dfac1f271ffbabbf4c35a76565d133917a4945c42f3b0c76565b7e552dc37.
- case/node_modules/@babylonjs/core/Materials/standardMaterial.pure.d.ts: 8cf3184e7b2566b99c3602e5dcc409eefd2cff795ad3546bebe2a02f0477a07d → def7952eba897349b14afde42110df8ac9fd03d42256893d1ea3ed649a04488c.

Finalizer ověřil přesně jeden přidaný řádek v každém a žádnou další změnu mezi všemi10860 vlastními core/loaders soubory. Oba zdrojové soubory v původní readonly závislosti zůstaly staré. Žádný install ani native package/patch/lock/main/hraný build nebyl upraven.

## Reproduktor, refaktoring a ověření

Převzatý fog factory/Game reproduktor má stejné41etap, původní limity, deferred cleanup a replay1/0/1/0. Všech52 původních assertion callů zůstalo zachováno. Jediná nová capability je skutečné WebGPU textureLOD=true; false běží jako legacy kontrola. Factory přijímá volitelný test engine, aby tutéž recipe používal i existující pinned processor harness. Nezavádí se další shader recipe ani readiness bypass.

Nová diskriminační větev vytváří před warmingem dva Mesh klony skutečné factory geometrie se stejným material objectem. Klony jsou ihned disabled. Po representative0→1 warming mají před první aktivací ověřené undefined camera Effect i materialDefines. Potom skutečně projdou hlavním camera draw; porovnává se celý define text a přesná Effect/context identita. Clone je pouze bounded CPU test, nikoli runtime řešení.

Příkazy jsou node .cache/webgpu-standard-lod-define-proof-20261018/run.mjs <id> <true|false> <reference|game|all>:

- reference-true a reference-false: každý2/2 PASS, settled původní actual GLSL/WGSL výstupy uložené před editací.
- red-true:7/12 PASS,5 FAIL; čtyři skutečné Game historie vytvořily2 nové Standard programy při car0, první fresh case navíc odhalil testový null/undefined předpoklad. Tento log zůstal zachovaný.
- red-true-fresh po opravě pouze tohoto fixture očekávání:7/12 PASS,5 FAIL. Fresh case nyní skutečně zaznamenal2 nové programy, warm value/key=true/true versus cold=true/false a odlišné Effect/context. Žádný vendor edit do tohoto běhu.
- green-true:14/14 PASS,0skip,exit0; green-false:14/14 PASS,0skip,exit0.
- Obě capability × C5/native-bootstrap historie × low první/poslední:41etap complete, pouze2vehicle etapy vykreslují cílové rodiny, po deferred cleanupu0disposed, replay0/0/0/0 a přesné identity reuse. Native-bootstrap je stejný frozen source s dříve ověřenou inicializační historií bez předchozí updatePreloadVisuals, nikoli nový samostatný primary checkpoint.
- Fresh receiver má v obou zelených kontrolách0 nových programů a stejný Effect/context/defines jako připravený receiver.
- Actual pinned GLSL i WGSL processing: opravený prvnícar0 se přesně rovná ustálenému původnímu stavu v kompletních processed sources, generated prefixes/body, processing context, attributes, uniforms, samplers, uniform-buffer names/locations/sizes. Standard reachable include grafy v těchto bězích mají62/65 souborů, žádný missing a žádné LODBASED reference. Runtime binding cesta Standard zůstává nepodmíněná tímto příznakem; PBR používá vlastní deklarovaný flag.
- Nezávislý read-only peer functional_record: [] bez konkrétního nálezu, ověřené oba konečné SHA a fresh-before-ready kontrakt. Žádné testy reviewer nespouštěl.

Všechny pokusy, preimages, test source snapshots, reports, run JSON a původní reference jsou zachované. Summary/fresh-difference/final manifest vymezují přesný důkaz.

## Omezení a další krok

NullEngine a synthetic canvas/texture IO nedokazují GPU pixely nebo FPS. WGSL processor zde skutečně běží, GPU kompilátor a draw nikoli. Sdílený IBL null-texture reset, který tento flag u jiných materiálů může zachovat, se nemění; tato úzká oprava registruje klíč a zachovává dosavadní value semantics. Žádná další warm etapa, cache, PersistentMode ani timeout změna.

Root již dostal neměnné dva vendor SHA pro izolovaný GPU overlay. Produkční přijetí zůstává otevřené. Všechny vlastní procesy skončily; žádný GPU/server/port se nespouštěl. Claim se uvolní po vytvoření manifestu; žádný commit nebyl proveden.
