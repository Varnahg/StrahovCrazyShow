# KEY-31: přesný B6 exit shader proof

18. 10. 2026. **4/4 CPU testy PASS a čtecí review bez blokujícího nálezu. Runtime se nemění.** Skutečný merged box `b6 floor 0 b6 stair:entry-dark-metal` z frozen V4 má po odchodu stejné plné defines jako fresh outside a při dalších návštěvách znovu používá původní Effecty. Další inactive-light history bug se pro tento witness nepotvrdil.

[Analýza](analysis.md) obsahuje přesné zdroje, alternativy a limity; [původní handoff](leaf-handoff.md) převzatý výsledek. [Leaf manifest](leaf-manifest.json) SHA `97fd7099d849864d67429a9cc082276458b594dadbed34ace91815c469bdd17f`; [archivní manifest](archive-manifest.json) ověřuje16 převzatých souborů, včetně rozbalených gzip.

## Co důkaz skutečně ověřuje

Actual B6 factory vytváří85 structural meshes bez loadProps. Witness má264vrcholů,396indexů, jeden původní submesh, PBR cap4, žádné textury/instance a původní `receiveShadows=false`. Dogleg madla by měla jiný kontrakt. Původní Game environment/camera-pass readiness, sky/time/lighting a Cinematic metody používají skutečné B6, light-budget, stable-order a torch controllers. Zvolená data vycházejí z [normal-b6-1](../hitches-v16/README.md).

Fresh outside S,D,H se porovná s inside S,P,D,H → outward → outside → inside → outside. Inside/outward mají tentýž Effect, opakované inside/outside znovu používají své Effecty. Outside po historii zachová27 dalších false object keys, ale emitovaný celý string je byte-identický s referencí. Čísla Effectů z různých izolovaných enginů nejsou dokladem same-engine cache hitu mezi těmito enginy.

Samostatná hidden větev prokáže, že skutečná `mesh.isReady(true)` v camera pass připraví Effect bez draw a následný scene.render jej použije. **Nedokládá WebGPU pipeline descriptor, cache, submission ani odstranění GPU prodlevy.** Success i injected failure uvolní vlastní observers, budget/light state, Effects, scény a enginy; global SceneLoader observer count se vrací na původní hodnotu.

## Vedlejší nález: pořadí stejného obsahu

Fresh-inside proti outside-first→inside mají stejné všechny public define key/value, ale liší se pořadí čtyř řádků: `LIGHT3`, `HEMILIGHT3` vzniknou před nebo za `LIGHTCOUNT`/`MAXLIGHTCOUNT`. Pinned `MaterialDefines.rebuild()` zachovává insertion order, zatímco Effect cache key používá celý string. Jde o konkrétní mechanismus možných duplicit; **same-engine produkční duplicita ani příspěvek k14programům při odchodu tím zatím doložené nejsou**.

Navazuje samostatný bounded `webgpu-define-order-proof-20261018`. Porovná actual same-engine shader reuse a konzervativní kanonizaci až hotového flat literal define bloku, bez změny `_keys`, getter pořadí nebo nové cache. Celý blok musí projít kontrolou unikátních identifikátorů a jednoduchých hodnot; neprůhledné direktivy/výrazy mají zůstat byte-identické. Custom shader callback může pořadí pozorovat, proto syntaktická kontrola není univerzální důkaz kompatibility. Ověří se skutečný WGSL processor a používané plugin/layout cesty, teprve potom se rozhodne o GPU experimentu.

Před tímto rozhodnutím byly porovnány plošné řazení při rebuild (mění stav a pozdější opaque hodnoty), light-family řazení (nutný pevný vztah k agregátům), předdeklarace všech slotů (mění needRebuild) a normalizace hotového textu (alokace/sort a custom-hook riziko). Poslední varianta má nejmenší zásah pro izolovaný counterfactual; runtime oprava ještě není přijata. Kontext jazykových pravidel: [WGSL scope](https://www.w3.org/TR/WGSL/#declaration-and-scope), [GLSL preprocessing](https://registry.khronos.org/OpenGL/specs/gl/GLSLangSpec.4.60.html); samotné specifikace nenahrazují kontrolu Babylon callbacks.

## Omezení

NullEngine/GLSL frontend, sky-disc/IBL raster IO stuby, žádný full world/props/traffic/remote avatary. Torch používá skutečnou camera-origin cestu s prázdnými platnými rig handles; transientní třetí-osobní hand pose není reprodukovaná. Witness je bez textur a bez přijímání stínu. Žádné WGSL driver, pixel parity, FPS ani startup tvrzení z tohoto proofu. Předchozí neúspěšné runs jsou zachované a vysvětlené jako chyby testových premis, nikoli RED/GREEN runtime fix. KEY-31 a migrace zůstávají otevřené.
