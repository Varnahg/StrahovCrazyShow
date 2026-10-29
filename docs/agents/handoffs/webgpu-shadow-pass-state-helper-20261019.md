# Předání: webgpu-shadow-pass-state-helper-20261019

- Vlastník `webgpu-01a15102-shadow-pass-state-helper`; příjemce `/root`.
- Cwd `C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow`, detached HEAD `fa6d04cd` při zadání. Pinned vstup `.cache/webgpu-medium-vehicle-qa-20261019/snapshot` source65d028, readonly SDWf8 balíčky používané user4202. Žádný donor overlay.
- Výsledek: tři oddělené skutečné CPU reprodukce, explicitní RED cached-pass regrese a rozhodovací podklady. **Žádná runtime oprava, shader změna, patch/cache/lease ani integrace.** Další testy zastaveny kvůli uživatelovu ručnímu hraní; pokračování vyžaduje výslovný pokyn root.
- Zápisy jen `.cache/webgpu-shadow-pass-state-helper-20261019/` a tento handoff. Čtyři copied client zdroje zůstávají byte-exact, převzaté sharing fixture/loader také. Jediný node_modules junction je readonly. Root/main WIP, deps a hrané snapshoty nedotčené; žádné staging/commity.

## Checkpoint a soubory

Manifest `.cache/webgpu-shadow-pass-state-helper-20261019/manifest.json`, SHA-256 **`eceb2f51c9a2258c1b24d98af72c92ed385aefecd2eb7ef76fce5ae137ca29c6`**, zahrnuje všech31 artefaktů, exact input hashes, borrowed link, příkazy/časy/exit codes a zhuštěnou stopu. `DECISION.md` je úplné porovnání variant a přesná omezení.

Reprodukce: `lifetime.test.mjs`, `identity.test.mjs`, `pcf-state.test.ts`; IO příprava `prepare.mjs`, běh `run.mjs`, hashování `freeze.mjs`. Copied client: webgpu-shadow-readiness/tree-wind/tree-appearance/render-shaders; fixtures/sharing je připnutý skutečný WebGPU createEffect/refcount fixture. Manifest ověřuje, že původní zdroje i SDWf8 jsou beze změny.

## Co je nyní skutečně doloženo

1. Stejný originalEffect, depth A→B→A s jediným vlastníkem: skutečné engine dispose sníží A na0 a odstraní jeho cache key. Návrat k A vytvoří jiný Effect pod **stejným tokenem a klíčem**. Žádná odlišná original identity k tomu není potřeba.
2. Dva současně živé originals s přesně stejnými derived source řetězci, ordered ABI/index/language a finaldefines: F8 přesto zvolí různé tokeny/keys a oddělené Effects. Tento případ nepotřebuje zánik posledního vlastníka. Oddělené DrawContexts a refcounts jsou zachovány.
3. Skutečný PBR+configureTreeMaterial+TreeWind+Fresh+PCF a veřejné map.isReadyForRendering/map.render, poté skutečná PBR.isReadyForSubMesh v camera passu, POINT0/1/0/1. Žádný ruční onEffectCreated, fake base Effect nebo stub material readiness v tomto třetím testu. Reálné WebGPUEngine.createEffect/cache/release běží nad NullEngine GLSL terminálem.

Třetí případ ukázal odlišný mechanismus než původní hypotéza. Public RTT readiness už skutečně volá onBeforeRender PCF a nastaví colorWrite=false. Proto **hypotéza readiness mimo PCF state byla vyvrácena**, veřejný onBeforeRender alias vede i přes ObjectRenderer._checkReadiness. Local false/finallyrestore bracket sám tedy pro tento případ není řešení.

Skutečný problém reprodukce: SDW drží jeden submesh→last-notified base Effect napříč passy. Shadow pass vytvoří base0 s DEPTHPREPASS a depth1. Main camera vytvoří base2 bezDEPTHPREPASS a SDW uvolní depth1. Další PCF readiness má správný false colorWrite, ale PBR vrátí již cached shadow base0 bez dalšího creation eventu. SDW stále vybere camera base2 a vytvoří depth3 bezDEPTHPREPASS. Analogicky POINT1 má shadow base4/depth5 a camera base6/depth7. Explicitní regrese kontrolující selectedBase==currentShadowPassBase je RED: **2≠0,6≠4,2≠0,6≠4**.

Návrat0/1 používá stejné původní base IDs0/2/4/6, přesto nově vytvoří depth8/9/10/11. Pairs **1→8,3→9,5→10,7→11** mají shodný odpovídající token a celý engine key; předchozí owner byl zrušen. Samotná canonicalizace tokenu napříč originals tento konkrétní zánik nevyřeší.

Všech osm derived Effects v hlavním scénáři nakonec ref0/disposed. Raw finalEffects po scene/engine cleanup ponechává některé podkladové base JS Effects se SDK refs2/2/2/1 a isDisposed=false. **Není tvrzeno vyvážení všech underlying base acquisitions** ani nový produkční refcount bug; nic se manuálně force-dispose/refcount hackem nezakrývalo. Nezávislé sharing fixtures mají svůj původní explicitní cleanup. Všechny subprocessy skončily.

## Ověření a zachované neúspěchy

- `independent-01`:2/2PASS, exit0; actual lifetime a exact cross-original source/ABI identity.
- `pcf-01`:1FAIL ještě před vznikem Effectu. NullEngine.createRawTexture neoznačuje InternalTexture ready. Failed source, log a raw result zachovány. Není to runtime nález.
- `pcf-02`:1/1PASS, exit0 po použití skutečného NullEngine URL Texture IO, které vrací ready texture. Dokládá správné PCF public readiness colorWrite a první0/1 trace. Source/result frozen zvlášť jako pcf-state-counterproof-02*.
- `pcf-red-03`:1FAIL, exit1 **zamýšleně na cached-shadow-base regresi** po dokončeném0/1/0/1 scénáři. Raw pcf-state-result.json, log a job JSON zachovány; žádný fix/GREEN.
- Poslední běh **2026-10-19T15:33:36.548–15:33:38.325Z**. Pak root předal pokyn zastavit kvůli user testu. Parent dostal explicitní CPU STOPPED signál; po tomto okamžiku jen JSON čtení/hash IO, dokumentace a handoff.

## Omezení a doporučený další scope

Capability seam nastaví pouze supportShadowSamplers=true, jinak by NullEngine potichu přešel na Poisson. supportDepthStencilTexture zůstáváfalse; nejde o GPU depth texture/pixel/WGSL proof. Textury jsou skutečné NullEngine URL-IO objekty bez image decode. G2 nativní BUMP/reflection a slot ordering nejsou přesně tento malý fixture. Výsledky neatribují automaticky všech pět g2 požadavků ani všechny g1 duplicity; g1 měl čtyři opakované module calls z osmi, ne osm. Žádný FPS nebo CPU-share přínos nebyl změřen.

Po user testu navrhuji nejprve explicitně autorizovaný scoped prototype správného **pass ownership/base selection** pro Fresh built-in WebGPU cestu, včetně cached returns bez creation notification. Zachovat custom/standalone/WebGL/light-layout guard, aktuální submesh defines a oddělené draw/material bindings; neřešit to falešnými globálními creation událostmi nebo app čtením private wrapper map. Případná pinned SDW změna/API musí být předem vymezena rootem.

Metadata canonicalizace pomůže jen nezávislému identity případu a musí mít úplnou ABI/language/index bezpečnost a limity. Bounded prewarm Effect lease může chránit doložené last-owner klíče, ale potřebuje skutečný engine acquire/release, limity, device/fault/dispose lifecycle a nejprve správný pass. Pouhá JS reference nestačí; globální PersistentMode nebo raw refcount increment nejsou navržené. Caster prewarm může být jiná coverage mezera (hair0.42/INSTANCES je zatím inference), ale neřeší zdejší uvolňování. Úpravy finaldefines nejsou odůvodněné a hrozí rozdíly bindings/UBO/samplers.

## Procesy a rezervace

Žádný GPU/browser/build/install/server/celá sada/renderer ani další agent nebyl spuštěn. Vlastní procesy/porty nezůstávají. Claim držen do tohoto předání; bezprostředně poté release, jeho výsledek parent dostane v závěrečné zprávě. Release neznamená přijetí opravy; task je reprodukční checkpoint s RED, další runtime rozhodnutí a změna task/Linear stavu patří `/root`.
