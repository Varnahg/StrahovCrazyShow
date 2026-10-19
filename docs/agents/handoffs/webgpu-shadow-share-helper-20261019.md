# KEY-31: isolated exact derived shadow token sharing

- Task `webgpu-shadow-share-helper-20261019`, owner `webgpu-01a15102-shadow-share-helper`, root coordinator. Přímý BMAD leaf; bez rendereru, subagentů a commitů. Původní app/deps/patch/hraný build nebyly změněny.
- Frozen `.cache/webgpu-shadow-share-helper-20261019/manifest.json`, SHA256 `2fca0004c5dc5ec9186a419f695c646af7f00e21db2e7359e4143e893382e657`.
- Jediný runtime payload `candidate/Materials/shadowDepthWrapper.js`, SHA256 `f8a8c6091af9caa96ba897f28d7d490f3607d7856dee86b3a05321e1477aba29`. Přesná pinned F3 preimage `bd2bfe313728751f375d613492e7210adb09733556dcb8e6f2d8e720b55f122c`;13hunků, source inverse byte-exact a textový `runtime.diff`. Manifest mapuje runtime, pět replay souborů,32 vlastních artefaktů a15 pinned dependency vstupů.

## Mechanismus a rozsah

- Příčina multiplicity doložena kódem: původní GUID per submesh/generator; WebGPU createEffect používá token+defines key. Root actual Medium capture má17requests,15shadow requests ve4stejných defines skupinách; samotná stejná defines neprokazují shodný source/ABI.
- Kandidát sdílí pouze WebGPU token přes wrapper-local WeakMap stejného original Effectu a přesný signature plného odvozeného vertex/fragment source, shader language, ordered attributes/uniforms/UBOs/samplers a typed ordered flat primitive index parameters. Unsupported descriptors vracejí původní jedinečný token. Žádný hash-only match, engine/global/Effect cache ani sdílený DrawWrapper.
- Jen jediný poslední shareable signature/GUID na živý origEffect; žádný index historie variant. Metadata neobsahují GPU resource reference; WeakMap key je origEffect. Signature může držet kopii shader textu, dokud žije jeho základ; nejde o heap cap. Wrapper dispose map resetuje.
- Každá submesh/generator entry vlastní jediný actual createEffect acquire; pass aliases žádný další. Lifecycle helper odděleně uklidí všechny jedinečné DrawWrapper contexts a uvolní Effect jen jednou. Replacement acquire-before-release funguje i při návratu stejného engine-cached Effectu. Failed acquire zachová starou depthDefines/effect; base/mesh/wrapper retirement je vyvážený. Již force-disposed lease se znovu nedekrementuje. Pozdní callbacks nemohou obnovit disposed mapy.
- Existující `FreshWebGpuShadowDepthWrapper` v app zůstává beze změny. Disposed original Effect se na WebGPU odmítá; disposed derived Effect neprojde stávajícím early-hit returnem. Původní stable-depthDefines fast path zůstává: libovolná mutace options/ABI uvnitř již cached entry bez nové derivation není nově podporované API.
- WebGL původní token, replacement a wrapper-disposal chování zůstává zachováno. Nové úklidové chování se aktivuje jen pro WebGPU.

## Ověření

- `node .cache/webgpu-shadow-share-helper-20261019/run-light.mjs`: **19/19 PASS**,0fail; další čtyři original/candidate descriptor procesy WebGPU+WebGL exit0, úplné derived source/options parity, vyloučeny pouze záměrně odlišné token identity. Finální logy/reports hashované manifestem.
- Skutečné pinned ShadowDepthWrapper/DrawWrapper/Effect/Scene/Mesh/SubMesh/ShaderMaterial třídy. WebGPU fixture volá skutečné `WebGPUEngine.createEffect/_releaseEffect`, `Effect.dispose` a skutečné WebGPU draw/material context metody na CPU NullEngine podkladu; WebGL používá původní NullEngine/ThinEngine metody. Není to mirror cache implementace. Opaque generator objekty se používají pouze jako identity klíče wrapper map, žádná shadow map není vykreslena.
- Dva meshe sdílejí Effect/ref2 se samostatnými DrawWrapper/material/draw contexts; pass alias nezvýší refs. První mesh retirement ponechá ref1/ready, poslední ref0/cache removal; context dispose1×. Dále variant/back transition, failed acquisition rollback, jiný origEffect/wrapper, více generators, změny vertex/fragment/language/ordered ABI/index values/type/order, injection/remapping, unsupported index accessors bez coercion, synchronous retirement a force disposal.
- První critical3/3 prošel před root overlay; kandidát od té doby byteově neměnný. První rozšířený fixture běh18pass/1fail a4descriptor fails kvůli chybějícímu explicitnímu GLSL `shadowMapFragmentSoftTransparentShadow` importu v Node. Opraven pouze fixture, všechny první logy zachovány. Původní first descriptorParity=true byl neplatný při chybějících obou outputs; runner nyní vyžaduje4outputs/2descriptors a full equality. Overall první běh byl exit1, nikdy platné přijetí. Následující plné lehké běhy jsou zelené; původní source/ABI asserts se neoslabují.

## Převzetí a omezení

- `REPLAY.md` popisuje pět přenositelných souborů a env `SHADOW_SHARE_CORE`, `SHADOW_SHARE_MODULE`. Original/candidate parity potřebuje **nepozměněný** F3 core jako A control. Již overlaid QA core lze ověřit19assertions samostatně; vydávat jej současně za A by bylo neplatné.
- Žádný GPU/driver/WGSL/image/FPS důkaz, fullsuite/fullTS/build/install/server od leafu. Root vlastní tyto gate i aktuální Medium runtime rozhodnutí. Případný menší počet newprograms nelze předem slíbit jen z počtu stejných defines skupin.
- Vlastní Node child procesy dokončeny synchronně, žádný live helper/server. Po tomto předání se uvolňuje claim; root mění task state a rozhoduje o integraci. Frozen helper se bez hlášení nemění.
