# Barvy automobilových instancí – 11. 10. 2026

Změna sjednocuje barevné lakované části do původních tří native LOD zdrojů. Každé auto má vlastní lineární barevný faktor v oficiálním Babylon `instanceColor` bufferu. Nemění GLB, master, geometrii, textury, material factors kromě přesunutého albedo tintu, alfa, clearcoat, LOD vzdálenosti, samostatné pivots, světelné lens ani kolize. Nejde o změnu počtu, rozmístění nebo simulované obsazenosti aut.

**Výkon FPS není změřený.** Níže je doložen skutečný native CPU dispatch a data odesílaná do instanced vertex bufferů. Ověření na GPU a finální produkční měření koordinuje root; tato práce neotevřela browser ani Blender a nespustila celou pipeline.

Následný společný checkpoint N prošel 410 testy/buildem/integrací/SHA. Root navíc ověřil skutečné GPU vykreslení low/medium/high, aktivní zrcadlenou parkovací paint instanci, denní/noční jízdu a produkční scénu s HUD na Intelu. [Samostatné výsledky](../verification.md). Tyto vizuální kontroly nedokazují GeForce ani FPS zrychlení.

## Průzkum a primární kontrakt

Dosavadní `CarPack.family(colour)` vytvářel jednu PBR clone materiálovou variantu na barvu a její tři paint mesh source klony. Všechny barevné LOD používaly materiál odvozený z near; ostatní části už byly sdílené. Barva proto dělila paint draw skupiny, přestože jejich geometrie byla stejná.

Průzkum i testy vycházejí ze skutečně instalovaného **Babylon 9.30.0**:

- `Meshes/instancedMesh.pure.js`: veřejný `registerInstancedBuffer`, native LOD přes bounding sphere instance a odlišná větev při opačném znaménku determinantu.
- `Materials/materialHelper.functions.js`: atribut `instanceColor` a define `INSTANCESCOLOR`.
- `Shaders/ShadersInclude/vertexColorMixing.js` a `pbrBlockAlbedoOpacity.js`: instanceColor se promítá do lineárního `surfaceAlbedo`, alfa má faktor 1.
- `Materials/PBR/pbrBaseMaterial.pure.js`, `materialPluginManager.pure.js` a `Meshes/subMesh.pure.js`: veřejné plugin callbacky, `hardBindForSubMesh` a `getEffectiveMesh()`.
- [Oficiální Material Plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/) byly zkontrolované 11. 10. 2026. Stránka instancí při tomto webovém pokusu timeoutovala; konkrétní buffer/LOD chování proto dokládá instalovaný primární zdroj a native dispatch, nikoli neověřená vzpomínka na webovou dokumentaci.

## Dvě nutné opravy proti naivnímu instanceColor

**Native medium/far LOD:** instance patří near source, ale kreslí jiný LOD source. Ten nemá vlastní `instances[]`. Babylon 9.30 při přípravě atributů kontroluje `mesh.hasInstances`, takže by správně naplněný barevný buffer mohl zůstat shaderem nevyužitý. Paint-only plugin proto v oficiálním `prepareDefines` nastavuje `INSTANCESCOLOR` podle skutečného draw define `INSTANCES` a přítomného veřejného instanceColor streamu. Nedotýká se native výběru LOD, batch seznamů nebo interních mesh flagů.

**Záporný determinant:** Babylon kreslí takovou instanci regular cestou bez `INSTANCES`. Samotná vColor větev by barvu nepřenesla. `hardBindForSubMesh` přečte právě vykreslovanou instanci přes `subMesh.getEffectiveMesh()` a předá její RGB do tříprvkového uniformu. GLSL ho použije pouze pod `#ifndef INSTANCES`, před odvozením `baseColor`/reflectivity, takže tint zůstává také vstupem kovového F0. Hard bind se provede i mezi dvěma draws se stejným materiálem; nedochází k přebarvení celého společného materiálu posledním autem.

První zpřísněný test skutečně zachytil chybějící `INSTANCESCOLOR` na LOD source, přestože buffer řádky byly správné. Tato varianta nebyla považovaná za hotovou. Finální test vyžaduje současně správné řádky, skutečně použitý shaderový atribut a oba defines.

## Zachování PBR a vlastnictví

Runtime ponechává původní materiál každého LOD. Proti dřívějšímu sdílenému near clone je to bezpečné pouze při shodě ostatních parametrů; nová regrese ověřuje:

- přesnou shodu všech glTF material definitions, samplerů a texture definic mezi near/medium/far;
- shodu SHA všech deseti vložených PNG obrázků napříč LOD;
- shodu celých serializovaných skutečně načtených PBR stavů. Vynechává jen `uniqueId` a sjednocuje náhodný UUID locator binárního loaderu; samotné base64 pixely, gamma, mipmap/sampling nastavení, clearcoat, metallic, roughness, alpha a ostatní parametry porovnává beze změny.

Zdrojová modrá se uchová přímo z původního lineárního glTF faktoru. Uživatelský HEX používá stejný `Color3.FromHexString(...).toLinearSpace()` jako dříve. Každý paint mesh instance vlastní svůj `Color4`, proto přepsání jedné instance nemění jiné auto. Ve shaderu zůstává material tint `[1,1,1]` a instance alfa `1`. Barevné hodnoty jsou v GPU bufferu Float32, stejně jako původní GPU uniformy; test porovnává přesné `Math.fround` hodnoty bez epsilon.

Zdroje a vertex buffery nadále vlastní původní mesh/container. Nová cesta nevytváří paletové materiálové/texture klony ani vlastní globální cache. Materiálový plugin a jeho uniform buffer zanikají s PBR materiálem. Shared pack/refcount, dark lens family a původní dispose cesta zůstávají. Pro backend bez `instancedArrays` a pro WebGPU se ponechá původní materiálová cesta. `CarPackOptions.paintInstancing=false` umožní explicitní srovnávací/kompatibilní load; stejně jako ostatní pack options platí pro první acquire dané Scene.

## Skutečný native dispatch

Test načítá skutečné všechny tři GLB. `Scene.render()`, aktivace meshů, PBR bind, native LOD a Babylonovo sestavení instance bufferů běží normálně. NullEngine deklaruje podporu instancing; zachytávány jsou pouze GPU upload/bind/draw metody, protože žádná GPU neexistuje. Čte se i čtvrtý override argument `bindBuffers`, kterým Geometry předává uživatelské instanced streamy.

Fixture má dvě různé barvy v každé ze tří vzdáleností. Výsledek skutečně volaného `drawElementsType`:

| Native LOD | Původní paint draws | Nové paint draws | Indexy na instanci | Instance v novém draw |
|---|---:|---:|---:|---:|
| near | 2 | 1 | 64 065 | 2 |
| medium | 2 | 1 | 38 436 | 2 |
| far | 2 | 1 | 5 445 | 2 |
| celkem | **6** | **3** | součet odeslaných indexů **215 892 v obou variantách** | 6 |

Zachycené Float32 RGBA řádky se na každém LOD shodují:

```text
#aa3322 → [0.40982574224472046, 0.02899118699133396, 0.011881334707140923, 1]
#dddddd → [0.729918897151947,   0.729918897151947,   0.729918897151947,   1]
```

Další fixture obsahuje dvě odlišně barevné zrcadlené instance společně s běžnými hardware batches. Jejich regular draws mají správnou per-entity barvu a nemají `INSTANCES`; následné hardware draws stále obsahují vlastní barevné řádky. Ověřené jsou i přechody záporný→kladný→záporný determinant, low→medium→high, posun kamery a následný native LOD výběr. Workload a barevné řádky jsou v každém kroku porovnané s původní cestou.

Materiálový test navíc kontroluje source modrou, nezávislou změnu root/wheel transformace, neměnnost zdrojových pozic a korektní pokračování druhého lease po uvolnění prvního. Po posledním release nezůstanou car meshe/materiály ani car texture wrappers; scene-owned BRDF LUT má vlastní životní cyklus.

## Výsledky a omezení

```powershell
pnpm exec tsx --test tests/car-paint-instances.test.ts tests/realistic-car-pack.test.ts tests/car-shadow-proxy.test.ts tests/car-material-budget.test.ts tests/native-car-models.test.ts
```

**22/22 PASS**. Čtyři nové testy ověřují actual dispatch/streamy, determinant/LOD přechody, skutečné PBR stavy a source channel shodu. Existující testy navíc pokrývají software fallback, čtyři pivots, grounding 24 aut, světelné lens, shadow proxy, zero-weight clearcoat a shared resource cleanup. Cílený TypeScript `--noEmit` **PASS**, diff-check **PASS**.

Dílčí SHA zdrojů při předání (ne úplný source snapshot hry):

- `client/car-pack.ts`: `23eb197960bbc259745674de424898a15989cce1f6b69112affa8e3c1398ea7b`
- `client/car-paint-instances.ts`: `892cd6f404e66b40042558df47a7b80d288ae8d155fd1d6b40f59ac2edf4a1af`
- `tests/car-paint-instances.test.ts`: `04c9e757c20a068420cfc3b7bd2701aea5f65c928494aadd8543a25f133b3c35`

GLB/mastery/manifests, source geometrie i shared kolize tato práce neupravila. Číslo **6→3** platí pouze pro uvedenou dispatch fixture; není to pokles celkových draw calls hry o polovinu ani změřené zrychlení. Počet odeslaných původních trojúhelníků se nemění. Změna přidává čtyři Float32 hodnoty na paint instanci a shaderové násobení barvou; současně odstraňuje dělení paint batches podle barvy. Výslednou GPU cenu nelze určit z počtu draws. GPU kompilaci, vzhled, negative-scale smoke, hlavní scénu a případné FPS musí potvrdit root ve společném checkpointu. Inventář čtoucí jen `material.albedoColor` nově u batched laku uvidí bílý faktor; skutečná barva je na instanci.
