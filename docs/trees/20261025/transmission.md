# Přímý průsvit pilotních stromů

25. 10. 2026, KEY-62 / `trees-20261025-transmission`. Navazuje na skutečné snímky candidate-v3 a čistě čtecí průzkum materiálového řetězce. Nejde o canopy AO ani změnu globálního světla. Vizuální význam opravy a GPU cena čekají na srovnatelnou herní přejímku.

## Doložený mechanismus

Pilotní factory používá `translucencyColorTexture=null`, `useAlbedoToTintTranslucency=true` a intenzitu 0,12. Připnutý Babylon 9.30.0 (`pnpm-lock.yaml`, patch hash `965f9774f8fd436bcd699d6f54c0a1b64a318f554bb261a85aa9189828f55c49`) však aplikuje `SS_ALBEDOFORTRANSLUCENCYTINT` pouze na IBL `refractionIrradiance`. Přímé `transmittance` vychází z implicitně bílého `vTranslucencyColor`. `diffuseTransmissionBase` se pak přičte až po násobení `finalDiffuse` aktuálním `surfaceAlbedo`. Přímý protisvit tedy nedostával fotografickou ani podzimní barvu.

Primární lokální zdroje v `node_modules/@babylonjs/core`: `Shaders/ShadersInclude/pbrBlockSubSurface.js` (výpočet transmittance a samostatný IBL tint), `pbrDirectLightingFunctions.js` (přímý přenos), `lightFragment.js` (akumulace se shadow), `pbrBlockFinalUnlitComponents.js` (pořadí albedo/transmission). Totéž bylo ověřeno v `ShadersWGSL/ShadersInclude/`. `Materials/materialPluginManager.pure.js` dokládá regex substituci a `$0`; `materialPluginBase.pure.js` dokládá stálé feature defines. Původní tvrzení v seasonal handoffu, že samotný přepínač obarví veškerou transmisi, bylo tímto průzkumem zpřesněno.

UV, NormalGL inverze a oboustranné osvětlení pilotu odpovídají pinovanému glTF loaderu. Nebyla prokázána jejich chyba. Rozdíl oproti původnímu 72% crown-normal proxy je záměrný. Snímky prokazují plošší vzhled, nikoli velikost příspěvku této konkrétní materiálové chyby.

## Volba a kontrakt

| Varianta | Posouzení |
| --- | --- |
| Pouze dosavadní `useAlbedoToTintTranslucency` | Neřeší doloženou přímou složku. |
| Sdílet albedo jako `translucencyColorTexture` | Bez nových pixelů, ale s dalším texel fetch; bez další sezónní transformace vrací zelený průsvit podzimním listům. |
| Násobit pouze přímý příspěvek aktuálním `surfaceAlbedo` | Zvoleno: fotografická i sezónní barva se použije jednou, IBL a zdrojové mapy zůstávají oddělené. |
| Měnit atlas, celkové albedo nebo globální světlo | Neopravuje konkrétní řetězec a zasahuje i ostatní složky; mimo tento celek. |

```ts
new TreeSeasonMaterialPlugin(material); // dosavadní legacy chování
new TreeSeasonMaterialPlugin(material, { tintDirectTranslucency: true });
```

Opt-in patří pouze materiálu bez již barevné přímé transmisní mapy. Root jej připojuje v pilotní factory; importované legacy materiály zůstávají na default `false`, protože již používají source `translucencyColorTexture`. Volba je neměnná po vytvoření pluginu a nezávislá na sezoně, rodině, LOD či pořadí vzniku ostatních materiálů.

Stálý define `STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT` odlišuje skutečné Effect cache identity. Obě varianty mají totožný custom shader text: přesný regex pinovaného výrazu akumulace vloží `#ifdef` s `info.diffuseTransmission * surfaceAlbedo * shadow`, `#else` zachová původní `$0`. Sdílený snippet je jediným místem GLSL/WGSL opravy. Substituce nezasahuje `subSurfaceOut.refractionIrradiance`, `finalDiffuse`, alpha, rank, normály ani shadow factor.

## Cena, cache a lifecycle

Přibývá jedno násobení RGB pro přímý transmisní příspěvek světla. Nevzniká další sampler, texture, vertex atribut, UBO položka, observer ani runtime cache. Již spočtené sezónní albedo se znovu používá. Stejné materiálové varianty sdílejí Effect; různý opt-in jej sdílet nesmí. UBO vlastníků zůstávají oddělené. Samotná změna sezony frozen materiálu nekompiluje další program. Hloubkový průchod zachovává skutečnou zdrojovou alpha-test podmínku a indexové opadávání.

## Ověření a meze

Závěrečný cílený běh: `tests/tree-season-material.test.ts`, `tree-effect-identity.test.ts`, `wgsl-vegetation.test.ts`, `tree-season-geometry.test.ts`, `tree-asset-loader.test.ts`: **28/28 PASS**, exit 0, **8,183 s**. Log `.cache/trees-transmission-20261025/targeted-checkpoint.log`; předchozí kombinovaný běh 28/28 v 11,055 s je zachován jako `targeted-final.log`.

- Skutečný PBR Effect s jedním směrovým světlem obsahuje právě jednu správnou guardovanou substituci. Legacy zachová barevnou transmisní mapu; pilot její absenci a IBL přepínač. GLSL preprocessor větve zůstávají pro driver, což test výslovně respektuje.
- Skutečný native WGSL processor vybere právě jednu správnou pilotní nebo legacy akumulaci. Zachovává rank varying a alpha test. Jde o zpracování nativního zdroje, nikoli GPU kompilaci.
- Effect cache je skutečná, nemockovaná: oba pořadí pilot/legacy oddělují programy; opakované stejné varianty je sdílejí při různých UBO.
- Reálný odvozený `ShadowDepthWrapper` Effect je ready a zachovává alpha discard bez `VERTEXALPHA`. Stávající geometry test nadále odesílá odpovídající index prefixy v main i shadow průchodu.

První tři meziběhy zachovány. Opravy byly ve fixtures: `NullEngine.createRawTexture` nemá upload-ready completion a ručně zadaným WGSL defines chybělo `DEBUGMODE 0`; native processor navíc ponechává `ALPHATESTVALUE` jako konstantu, nikoli literál v podmínce. Nebyl kvůli tomu změněn materiálový mechanismus ani odstraněna kontrola alpha. První typecheck našel dvě vlastní testové chyby TS18049: optional chaining assertion nenarrowovala depth Effect; opraveno explicitním existence assertion. Závěrečný typecheck a identita konečného checkpointu jsou v handoffu.

Žádný server, GPU, Blender, build, celá testovací sada, staging nebo commit nebyly součástí tohoto subtasku. Zdrojové materiály, modely a candidate-v3 zůstaly nedotčené. Root vlastní další kombinovanou integraci a skutečné backlight A/B ve všech sezonách.
