# Předání: repair-render-instrumentation

- Vlastník: `repairs-01a13624-render` (`/root/repair_reporting`); příjemce: `repairs-01a13624-root`.
- Pracovní kopie/větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí commit `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: nový nízkonákladový observer-only profil připravený pro automatické herní logy (KEY-2). CPU fáze skládá z existujícího `BenchmarkRenderProfile`, sleduje veřejné shader/effect observables a vrací malý plain snapshot. Zapojení do Game/recorderu i produkční profil provádí koordinátor.
- Změněné soubory: `client/render-incident-profile.ts`, `tests/render-incident-profile.test.ts`, tento handoff. Žádný převzatý dirty WIP; obě nové cesty koordinátor předem odstranil ze svého scope. Žádné jiné soubory nebyly měněny.
- Integrační závislost: koordinátor přidal do jím vlastněného `BenchmarkRenderProfile(scene, now?, onRenderTargetInterval?)` třetí callback `(ObjectRenderer, durationMs) => void` pro dokončené párové intervaly. Nový modul jej používá pro názvy/detail, nevytváří druhou časovací dvojici na každý render target.

## API a význam dat

```ts
const profile = new RenderIncidentProfile(scene, optionalMonotonicClock);
profile.beginFrame(); // bezprostředně před scene.render()
// scene.render(), případné endFrame také ve finally při chybě
const snapshot = profile.endFrame();
profile.dispose(); // idempotentní, také automaticky při scene.dispose()
```

- Export `RenderIncidentSnapshot`: `cpuMs { activeMeshes, mainDraw, renderTargets, shaderCreation }`, `counters`, `details { slowRenderTargets, materials }`, `cumulative`.
- `shaderCreation`: součet CPU wall intervalů mezi `engine.onBeforeShaderCompilationObservable` a `onAfterShaderCompilationObservable`. V nainstalovaném Babylon WebGL `Engine.createShaderProgram` obklopují tyto callbacks volání `super.createShaderProgram`; při `KHR_parallel_shader_compile` skutečné GPU dokončení následuje později. **Není to celkový GPU čas kompilace.** Každý spárovaný interval je `shaderPrograms`; `shaderProgramStarts` a `shaderIntervalsDropped` odlišují otevřená/přerušená pozorování. Při asynchronním selhání nemusí párové volání znamenat úspěšný shader.
- Fázové intervaly jsou inkluzivní a mohou se překrývat (například shader CPU uvnitř draw/target). Nesmějí se sečíst na celkový frame/GPU čas. `RENDER_INCIDENT_SCOPE` exportuje přesný popis včetně limitů.
- `materialEffectEvents` je počet veřejných effect-created oznámení. Opakované oznámení stejného efektu se nepovažuje za kompilaci ani změnu. `materialEffectChanges` porovnává efekt/defines pro stejný materiál a stejný submesh slot pomocí WeakMap; různá současná submesh použití nevytvářejí falešné přepnutí. Událost může předcházet připravenosti či aplikaci efektu, což scope výslovně uvádí.
- Detaily materiálů obsahují technický název (max 96 znaků), veřejná material/effect ID, non-cryptographic fingerprint defines a počty. Neukládá se zdroj shaderu ani text defines. Cache fingerprintu je WeakMap podle efektu a mění se jen při změně veřejných defines; neprobíhá polling privátních stavů.
- `slowRenderTargets` je nejvýše 8 nejdelších dokončených jednotlivých target intervalů s veřejným názvem, renderPassId a CPU časem. `materials` obsahuje nejvýše 8 identit za frame. `renderTargetDetailsOmitted` / `materialDetailsOmitted` zachovávají počty vynechaných pozorování. Souhrnné počty a CPU součty nejsou tímto limitem kráceny.
- `cumulative` zaznamenává i shader/effect události mimo otevřený frame od vytvoření profilu, například během startu. Shader callbacks jsou společné pro engine; kumulativa nejsou důkazem, že veškerá práce patřila právě Game scéně. Veřejné shader callbacks nemají identitu materiálu/programu, proto je modul nepřiřazuje konkrétnímu materiálu jako prokázanou příčinu.

## Podklady, lifecycle a refaktoring

- Primární implementace ověřena 13. 10. 2026 v nainstalovaném `@babylonjs/core` **9.30.0**: `Engines/engine.pure.js` createShaderProgram, `Engines/thinEngine.functions.js` createShaderProgram/_createShaderProgram/_isRenderingStateCompiled, `Materials/material.pure.d.ts` veřejný effect observable, `Materials/standardMaterial.pure.js` effect notification před readiness/adoption, `scene.pure.js` add/remove material. Webově ověřen také veřejný [ObjectRenderer upstream](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Rendering/objectRenderer.ts); autoritativní pro konkrétní chování je instalovaná zamčená verze.
- Existující materiály se projdou jednou při konstrukci. Další připojení/odpojení je inkrementální přes veřejné scene observables. Materiály ani meshe se **neprocházejí každý frame**. Seznam objectRendererů a phase lifecycle vlastní společný BenchmarkRenderProfile.
- Důležitá mez: Babylon přidání materiálu oznamuje odloženě. Efekt vytvořený novým materiálem dříve, než dorazí added callback, nemůže tento profil zachytit bez wrapperu či dalšího skenování. Tento limit je explicitně ve scope a regresním testu; nesmí se vydávat za úplné pokrytí všech materiálových operací.
- Odstraněný materiál se nepřipojí zpět opožděným add callbackem. Dispose odpojí engine, scene, material i target observers; uklidí také nedokončené intervaly. Zásobník shader intervalů má strop 32; neúplné/přetékající intervaly se vykazují jako dropped a nepřelévají do dalšího snímku.
- Refaktoring: společné benchmark časování bez kopie target interval logiky, jediné `count` pro frame/cumulative, konstantní seznam klíčů pro reset bez Object.keys alokace každý frame, WeakMaps nepřidržují zaniklé submeshe/efekty. Snapshot má čerstvé malé plain kopie, předchozí výsledek nelze změnit dalším framem ani mutací konzumenta. Žádné GL volání, přepis engine funkcí, vynucení shader readiness, timer ani změna materiálového stavu.

## Ověření a snapshot

- 13. 10. 2026 20:36 Praha: `pnpm exec tsx --test tests/render-incident-profile.test.ts tests/benchmark-render-profile.test.ts` **9/9 PASS**, exit 0 (6 nových testů, 3 stávající). Použity skutečné NullEngine/Scene/ObjectRenderer/StandardMaterial/Effect/SubMesh a řízený čas; bez GPU tvrzení.
- Scénáře: inkluzivní fáze a vnořené targety, jen jeden target observer pár, CPU shader call vs kumulativa mimo frame, stejné/opakované/různé submesh efekty, inkrementální přidání a odstranění před odloženým add, bounded detail při 12 targetech/20 materiálech se zachovanými agregáty, přerušené/nespárované a nadlimitní shader callbacks, odstraněný target uvnitř intervalu, opakovaný dispose i scene dispose uprostřed snímku, snapshot isolation.
- První běh měl 8/9 PASS kvůli testovací Mesh bez inicializovaného veřejného `subMeshes` pole. Fixture doplněna; produkční pozorování ani limity se kvůli testu neuvolňovaly. Krátký předběžný `pnpm exec tsx --eval` narazil na PowerShell/cmd citaci řetězce; odpovídající plain Node `--import tsx` kontrola skutečného Effect na NullEngine prošla.
- 20:37 Praha: úzká typová kontrola `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/render-incident-profile.test.ts` **PASS**, exit 0. Nešlo o celou projektovou kontrolu/build.
- Prettier check a cílený `git diff --check` exit 0. Soubory jsou nové/untracked, takže celý obsah identifikují následující SHA256:
  - `client/render-incident-profile.ts`: `19804049816000fe30ee12a625407d21bacfac7e0bdd37cd0a0e9d2bd609df30`
  - `tests/render-incident-profile.test.ts`: `3490bb94445eb4ba1f5ec91a2bb4f2cb9762a7a2d1a5e467272b9b4722ebdb7d`
  - integrační závislost koordinátora `client/benchmark-render-profile.ts`: `8cab03d2bd16c4edd7cd49bfc3e16fe1f14f0703c0ac3ca1043f8ba3b291eefd` v čase přejímky.
- Procesy/zdroje: všechny vlastní krátké procesy skončily (včetně ověřeného tsc handle), fixtures dispose provedly. Žádný port, GPU, build, celá testovací sada nebo dlouhodobý proces.
- Omezení/další krok: root musí zapojit begin/end/dispose do Game, snapshot do automatických logů, scope do startup/context evidence a ověřit režii i příčiny na skutečné produkční scéně. Tyto cílené testy nepotvrzují zlepšení FPS ani konkrétní GPU příčinu záseku.
- Rezervace: předání dokončeno, následuje `release --task repair-render-instrumentation --owner repairs-01a13624-render`. Task a Linear stav aktualizuje integrátor; tento handoff neprohlašuje celé KEY-2 produkčně ověřené.
