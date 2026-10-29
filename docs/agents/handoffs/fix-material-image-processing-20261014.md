# Předání kandidáta: fix-material-image-processing-20261014

**Stav: IMAGE-01 není přijatý. Barevný kontrakt funguje, ale zbývá prokázaný ownership/lifecycle fail v installed Babylon9.30. Kandidát se nesmí vydávat za hotovou opravu ani commitovat jako přijatý fix.**

- Vlastník `fix-01a13624-image-20261014` (`/root/repair_reporting`), příjemce `/root`.
- Pouze worktree `C:/Users/rezac/.codex/worktrees/playtest-repairs-wave4/StrahovCrazyShow`, větev `codex/playtest-repairs-wave4`, Git HEAD při předání `f63039b4067d57c8bdbe560ead5719cfc05cbb0d`.
- Před změnami přečten nový AGENTS/task, coordination/architecture/current-work, bootstrap a rozhodnutí IMAGE-01 v main decision-register. Vlastní claim s `--adopt-dirty` převzal jen rootem výslovně předaný starší `client/cinematic.ts` reuse WIP. Ten byl byte-identický wave3 (SHA57b4…); zůstal zachovaný.
- Přesné soubory: `client/cinematic.ts`, nový `tests/cinematic-image-processing.test.ts`, `docs/performance/research-20261014/visual-lighting.md` (nejprve byte-exact zkopírováno vlastní předané main research, pak přidána sekce7), tento handoff. Žádné jiné soubory nebyly upraveny.
- Main `client/cinematic.ts` a immutable wave3 `client/cinematic.ts` mají nadále shodný SHA256 `57b4a6bbc39448481d740ff490761dfc68b00a6a565eafd550084ef02db85193`. Žádný HMR/server/browser/build/GPU, žádná změna node_modules. Příkazy běžely přímo přes lokální Node CLI, bez installu do sdíleného read-only dependency junctionu.

## Implementační výsledek a ověření

Nový standalone test je soběstačný pro barevný kontrakt a bounded cleanup; nevyžaduje `pipelineAttached`, `stats.pipelineBuilds` ani zachovanou identitu postprocessů přes low. Používá skutečný CinematicAtmosphere/Scene/Standard/PBR a jejich `imageProcessingConfiguration.prepareDefines`. Camera passes pozoruje override veřejných attachPostProcess/detachPostProcess, které vždy volají skutečný super. Babylon9.30 veřejný getter chainu nemá. Jen NullEngine cube allocation je in-memory fixture; žádný render.

14.10.2026 Europe/Prague:

1. **15:13:59–15:14:00 — red**, před runtime změnou: `node node_modules/tsx/dist/cli.mjs --test tests/cinematic-image-processing.test.ts`, exit1, **1/7PASS,6FAIL**. Low-first prochází; medium/high a návazné scénáře selžou na skutečném `scene.imageProcessingConfiguration.isEnabled=false`. Zachovaný reprodukční důkaz původní chyby.
2. Aplikován pouze delta níže: hdr true→false, odstraněn false/sync blok, přidán kontraktní komentář. Žádné art hodnoty, palety, textury, shadery, intenzity ani starší reuse logika se neměnily.
3. **15:14:42 — první kandidát**, stejný test: exit1, **5/7PASS,2FAIL**. Funkční low-first/medium-first/high-first, skutečné ACES/exposure/grade defines, low exposure změny, kvality, explicit material configurations a absence fullscreen IP passu. Oba disposal scénáře mají3 scene config observers proti baseline2. Effects, textures, materials a camera passes se uvolní; právě observer test ukázal skrytý únik.
4. **15:16:51 — omezená in-memory diagnostika**, exit0. Public Observable.add callsite u zbývajícího callbacku patří `ThinImageProcessingPostProcess._attachImageProcessingConfiguration` na98. Po controller.dispose a deferred callback ticku zůstává `_willBeUnregistered=false`; po scene.dispose zůstává tentýž jeden callback. To není lazy Scene komponenta ani čekající removal. Všechny vytvořené engine/scene/controller byly zrušeny vfinally.
5. **15:24 — narrow TS**, `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/cinematic-image-processing.test.ts`, exit0. První kontrola odhalila jen chybnou cestu type-only importu define interface; nahrazeno odvozením typu ze skutečné public metody `Parameters<ImageProcessingConfiguration['prepareDefines']>[0]`.
6. **15:29:13 — původní testy beze změn**, `node node_modules/tsx/dist/cli.mjs --test tests/cinematic-atmosphere.test.ts tests/cinematic-art.test.ts`, exit0, **8/8PASS**. Ověřily zachování staršího reuse/shadow/art chování, ale nenahrazují červené nové lifecycle testy.

Testové pomocné funkce sjednocují fixture/actual defines/pass assertions; nezrcadlí implementaci controlleru. Runtime zůstal jediný malý hunk bez nového stavu/cache. Prettier aplikován pouze na nový vlastní test.

## Prokázaná ownership překážka a další varianty

Installed `imageProcessingPostProcess.js:342` vytvoří vlastní ThinImageProcessingPostProcess a předá jej základnímu PostProcess jako `effectWrapper`. `postProcess.pure.js:388` nastaví `_useExistingThinPostProcess=true`; `dispose:787–790` pak přeskočí wrapper.dispose. Právě `thinImageProcessingPostProcess.js::dispose` odstraňuje image-processing observer. PostProcess zmizí z engine.postProcesses, ale Thin callback zůstává na živé konfiguraci a může dál volat `_updateParameters` při expozici. Assertion nebyl oslaben.

Root požádal ještě porovnat úzký cleanup přes `onBuildObservable → konkrétní pipeline.imageProcessing.onDisposeObservable → effectWrapper.dispose`. Výsledek kontroly public API:

- `DefaultRenderingPipeline.onBuildObservable` a PostProcess.onDisposeObservable jsou veřejné; field pipeline.imageProcessing je typed, ale značený `@ignore`.
- **Hotový PostProcess nemá veřejný getter `effectWrapper`.** `postProcess.pure.d.ts:326` uvádí pouze `protected readonly _effectWrapper`; veřejné `effectWrapper?: EffectWrapper` na74 je constructor option, nikoli instance accessor. Getter ani alias nejsou v installed implementation. Proto uvedenou variantu nelze realizovat v public-only app scope, dokud nemáme wrapper vlastní už před konstrukcí. Nebyl použit cast/protected access, prototype patch ani runtime odchyt cizích observerů.
- Samostatný Bloom/FXAA řetězec může využít public PostProcessRenderPipeline.addEffect, render effect getPostProcesses a camera attach/detach. Stock BloomEffect ale schovává ThinBloomEffect, disposeEffects ruší jen PostProcess objekty, jeho exposure je `_exposure @internal`, ThinBloomMerge je také `@internal`. Úplně explicitní ownership přes vlastní component wrappers/public EffectWrapper vyžaduje větší scope včetně bind/autoClear/resize/texture-sharing/MSAA a vizuální parity. Není to další jednřádková změna v tomto tasku.
- Material-owned ImageProcessingConfiguration při disabled DefaultPipeline odstraní potřebu IP objektu, ale vyžaduje pokrýt všechny Standard/PBR/import/replacement materiály před readiness, zachovat explicitní owner config, synchronizovat exposure/bloom a obnovit reference při dispose. Mění původní předpoklad enabled Scene configuration, takže potřebuje nové rozhodnutí a smysluplnou úpravu testovaného kontraktu, ne oslabení dnešního testu.
- Pinovaná úzká upstream ownership oprava ImageProcessingPostProcess by nechala veřejný IMAGE-01 kontrakt a opravila rušení uvnitř skutečné vlastnící třídy. Vyžaduje nový scope package/lock/patch a izolované dependencies; shared node_modules se zde nesmějí změnit. Žádná z těchto alternativ nebyla naslepo implementována.

Po obdržení tohoto nálezu root zvolil přípravu **samostatného pinovaného package fixu** před širší klientskou pipeline. Podle jeho primárního NPM/GitHub ověření je nejnovější vydání9.30.0 (gitHead `b248b370267f13bfaf5b2a0f8fd525bad7c99b52`) a není doložena opravená novější release; master má stejný ownership vzor. Budoucí package task musí držet referenci pouze na Thin wrapper skutečně vytvořený vlastním konstruktorem, přesně jednou jej uvolnit a zachovat caller-supplied/borrowed/shared wrapper. Regrese musí rozlišit number/object/explicitundefined options, opakované a multi-camera dispose a config replacement. Žádný klientský cast ani odhad vlastnictví podle base private flagu. Tento package task a samostatné node_modules teprve připraví root; současný read-only junction ani staré snapshot dependencies se neměnily.

## Přesný nový delta patch oproti frozen wave3

Následující hunk neobsahuje starší reuse WIP. Root podle vlastního Git auditu ověřil, že odpovídající konstruktor/false-sync blok je i v HEAD; případné použití však čeká na vyřešení ownership a nové rozhodnutí. Není doporučením tento neúplný kandidát commitnout.

```diff
--- a/client/cinematic.ts
+++ b/client/cinematic.ts
@@ -478,19 +478,14 @@ export class CinematicAtmosphere {
     } else if (!this.pipeline) {
       this.pipeline = new DefaultRenderingPipeline(
         "cinematic campus",
-        true,
+        false,
         this.scene,
         [this.camera],
         false,
       );
-      this.pipeline.imageProcessingEnabled = false;
-      // A recreated Babylon 9.30 pipeline initially assumes image processing
-      // is enabled, even if the previous one already disabled scene config.
-      // In that case the setter has no notification; synchronize its public
-      // configuration observable before preparing the chain (no extra build).
-      const imageProcessing = this.scene.imageProcessingConfiguration;
-      if (this.pipeline.imageProcessingEnabled !== imageProcessing.isEnabled)
-        imageProcessing.onUpdateParameters.notifyObservers(imageProcessing);
+      // Non-HDR keeps image processing in Standard/PBR materials and does not
+      // attach a fullscreen color pass over the display-space sky. Do not set
+      // imageProcessingEnabled=false: that also disables the scene's material grade.
       this.pipeline.fxaaEnabled = true;
       this.pipeline.bloomEnabled = true;
       this.pipeline.bloomScale = 0.5;
```

## Identita, procesy a převzetí

| Soubor | SHA256 |
| --- | --- |
| WT `client/cinematic.ts` — nepřijatý kandidát | `64f4c6f942b8c51e9d612934859deac1d8dfc06140e4298cf0ae5c14c4679ca3` |
| WT `tests/cinematic-image-processing.test.ts` | `ba5493d42ab4f3102e2743a501983c621803c24becce4224ef5abb08bce93637` |
| WT research včetně sekce7 | `de50a113ef5103c4eaf935d778467141d739172fd97ef58fb027aa50575b2c82` |

Žádný commit/staging, plná sada, build, integrace, browser/GPU ani server nebyly provedeny. Všechny vlastní krátké procesy skončily. Root drží další package scope a integraci; původní task není Done. Při dalším převzetí je přesný stav kandidáta a původ cizího reuse WIP popsán výše. Root výslovně požádal dokončit toto nepřijaté předání a uvolnit scope; po zápisu následuje release. Skutečný registry stav je autoritativní.
