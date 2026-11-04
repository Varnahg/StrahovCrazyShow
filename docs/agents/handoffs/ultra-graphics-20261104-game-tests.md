# Předání: ultra-graphics-20261104-game-tests

- Vlastník: `ultra-20261104-game-tests`; příjemce: root / `ultra-20261104-root`.
- Checkout: `D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104`, větev `codex/graphics-smoothness-20261104`, výchozí HEAD `bf0a6550e0aa46eddcfa33cb8c76fd207d6592bc`.
- Rozsah: pouze přidělené Game testy, konstruktorové fixture a toto předání. Žádný Game/source edit, stage, commit, server ani GPU běh. C checkout nebyl měněn. Novější explicitní zadání D větve potvrzeno koordinátorem.
- Checkpoint 4.11.2026 21:37 CET: cílená desetisouborová sada **138/138 PASS**, exit 0, 10.97 s. Game SHA zůstal před/po finálním běhu stejný. Root přebírá integraci, globální kontroly, Edge a měření.

Následný omezený followup: root přesunul double RAF do `paintStartupStage(signal)` a doplnil snapshot `transitionPhase`. Původní běh 138 tento následný refaktor neobsahoval. Po obnovení vlastní rezervace je VM adaptována na **skutečný** helper se scheduler/cancel IO adaptéry; kontroluje také nulový počet ponechaných RAF a skutečnou preparing/null fázi snapshotu. Pouze `node --import tsx --test tests/game-graphics-application.test.ts` zopakován: **6/6 PASS**, exit 0, 2941 ms. Nezměněná zbylá sada se znovu nespouštěla. Aktuální SHA: Game `96c6b636e2bec5df43f26047b91bd2354ad23192b58afdd28255affe829e73b2`, startup-progress `2fa3c39788219010d7e28f346487a84cd8ca8bb8fb2d3204b3da048eb670f9c1`, Game Apply test `1f1ef9f4f17573fc1acc09114dcdba1c9eabdfafa74ada2cd2ff0719b4d8a7a1`. Historický manifest níže zůstává identitou původního 138testového běhu.

Poslední readiness followup po review: root opravil čekání na zbytečné detailní tree requesty ve FAR-only a přidal `recoverableTimeout` pro závěrečný živý submit. Task znovu převzat pouze pro dva dotčené testy a toto předání. Přidány tři actual light-readiness regrese: normal čeká na pending detail, FAR-only je ignoruje bez změny pending telemetrie, loadError zůstává chybou. V Game Apply navíc pokryty oba final readiness režimy, čekání na base load a loadError; actual Custom→Auto připraví low/high/medium a před potvrzením obnoví 50% scale i Auto features. Nový volitelný fixture používá **skutečný `waitForRenderStartup` i `RenderHealth`**, pouze browser scheduler a GPU queue jsou IO adaptéry.

Navazující WebGL rollback followup: root přidal interní capture/restore `scene.imageProcessingConfiguration.isEnabled`, protože původní Low grade závisí na historii použitých kvalit a nelze jej odvodit pouze z preferencí. Doplněn scene fixture a jedna regrese Low→High→timeout→Low: ohraničený environment owner simuluje doloženou změnu grade při High, skutečný Game musí původní bool obnovit **před** Low environment/readiness. Pozdní dokončení původního submitu nesmí znovu spustit environment ani změnit grade či preference. Samotný Cinematic side effect zůstává pokrytý rootovými skutečnými lighting testy. Pouze Apply soubor znovu ověřen: **13/13 PASS**, exit 0, 3081 ms. Aktuální Game SHA `29f37870bf12d18d939f797b9adcd4041dc04994478ce362de0d20f2729d60d3`, Apply test `760343cd53c795632d834ea460ee8bdb43dc91f7ed4e8f840a5986fac9c8c193`. Žádný source edit ani širší opakování; rezervace po předání opět uvolněna.

Doplnění stejné regrese: root obnovuje grade také po environment quality transition. Test je nyní parametrizovaný pro Low→High→Low i High→Ultra→High s původním grade=true. Owner IO mění grade jen při skutečné změně kvality (nikoli při každém update); obě varianty ověřují zachování grade i v **reálném Game draw callbacku obnoveného submitu**, přestože návrat do High grade uvnitř environment přepíše. Po opětovném claimu spuštěn pouze filtr `--test-name-pattern='actual WebGL .* failure restores previous scene grade'`: **2/2 PASS**, exit 0, 2081 ms. Ostatních 12 Apply testů znovu neběželo. Poslední Game SHA `9958cef2655179a37d2056d864f47b87dfd00527d6b3ffde2804b7a8bee42108`, Apply test `9f80fafb9ac190ed3e9c5eb96af5c2eb02664cf14130511b2968797cf1963c3c`. Claim po předání znovu uvolněn.

CI followup checkpointu `4ad9725d`: podle uloženého `.cache/ultra-graphics-20261104/ci-4ad9725d-verify.log` selhaly tři authored regrese (pipeline diagnostická brána, readiness slice, target light membership). Přesný soubor lokálně reprodukoval **10/13 PASS + stejné 3 FAIL**, exit 1, 6038 ms. Nová tree-policy brána volá skutečný `getEffectiveVisualSettings()` i bez instance vegetace; druhý lokální `innerLifecycle` fixture na rozdíl od první fixture dosud neměl constructor graphics state ani resolver runtime imports. Doplněn existující `graphicsLifecycleFixture` s Low quality/scaling a `graphicsFixtureEnvironment` do druhé VM instance, **bez změny kterékoli původní aserce, limitu, helperu či produkčního souboru**. Po opravě pouze `node --import tsx --test tests/game-authored-light-preparation.test.ts`: **13/13 PASS**, exit 0, 5272 ms. Aktuální authored test SHA `ddc464f2cdfb51fee0d3b52af60ef9a7c7d43d815104edab6d70805d5d0ee40c`; Game SHA zůstal `9958cef2655179a37d2056d864f47b87dfd00527d6b3ffde2804b7a8bee42108`. Dalších pět CI avatar selhání vlastní jiný task; tento výsledek není tvrzením o zeleném celém CI. Claim znovu uvolněn po předání.

Výslovné nové lidské zadání „webgl2 timeouty increasni taky“: root změnil pouze Game WebGL startup wrapper na explicitních 60 000 ms. Test `game-quality-preparation` nyní ověřuje všechny režimy Auto/Low/Medium/High/Ultra/Custom: jediný přípravný pass vybrané kvality, 60s limit, žádné dočasné overrides ani změny scale/features, žádné uvolnění ready. Pro všechny režimy se původní timeout/failed/disposed výsledek předá beze změny; původní rejection se nezmění ani nepřeloží na úspěch. Obecný light-helper default a finální submit zůstávají 30s a nebyly měněny. Po vlastním reclaimu upraven jen tento test a předání; `node --import tsx --test tests/game-quality-preparation.test.ts`: **11/11 PASS**, exit 0, 2160 ms. Game SHA `8b995f5c575128230cda9c05dff5a7e6f6a6ec148170d1489c299d419d61c28a`, quality test SHA `1a23c45bd686ce3969ca9613e9713419c02bce8f3b16bd85120b91da5c65f48f`. Žádný build, GPU ani plošné testování; root nyní vlastní heavy-validation. Claim po předání uvolněn.

První cílený běh těchto dvou souborů: 35/36 PASS. Jediná skutečná produkční chyba byla neúspěšný restore po obyčejném 30s submit timeoutu: nový submit opakoval `health.markReady()` nad již-ready rendererem. Root nezávisle doložil tentýž problém a opravil finální gate na přijetí již-valid health až po původních readiness/submission podmínkách. Přidána i explicitní dvojice úspěšných živých Apply nad jedním ready rendererem. Znovu běžel pouze změněný `tests/game-graphics-application.test.ts`: **12/12 PASS**, exit 0, 3156 ms; `tests/game-light-preparation.test.ts` předtím **25/25 PASS**, žádná navazující změna jeho kódu/gate. Obyčejný 30s timeout zachová zdraví rendereru a obnoví Medium; device chyba zůstává fatal/restartRequired; žádné preference při selhání nepotvrzeny. Root vlastní produkční opravu a širší helper ověření.

Aktuální identita posledního followupu (původní manifest níže zůstává historický):

```text
client/game.ts 76b3b17c67630f9c891f48d9e0c5f6f8fb68f6cd6c84628acd24c8675f17bf3a
client/render-startup.ts a0d97ccb0d92d4e309fc661d10898ccdbb20987d3dbf7707acb082567610fb82
tests/game-graphics-application.test.ts c5f7157089ff0dd82669782f2eb87d12d692449b91959b90f6f4f8c3e0c1cbcf
tests/game-light-preparation.test.ts 91b5894da6b4a078f3a5814deee5759dd9179610b0c9ef54b56274ee79f0d2d4
```

## Podklady, rozhodnutí a přijetí

Problém: source-extraction testy předchozího Game neznaly nový resolver, grafický lifecycle a rozdělené frame helpery; současně chyběl důkaz živého Apply přes běžný frame a síť. Doložený mechanismus: skutečné `frame`, `prepareLightingVariants`, `start` a `applyRenderQuality` nyní volají nové metody a potřebují konstruktorový stav. Jediná změna je adaptace těchto fixture a cílená regrese nové grafické transakce. Hlavní metrika je behaviorální průchod testů, nikoli FPS. Správnost: skutečné produkční metody, zachované readiness/lifecycle/timing aserce, manuální startup jen vybraný stav a Auto stále tři kvality. Přijetí: přidělená CPU sada projde bez úprav zdrojové implementace.

Primární podklady: lokální `AGENTS.md`, architecture/coordination/bmad-policy, aktuální Ultra SPEC/CONTRACT, skutečný Game, GraphicsTransition, adaptive controller, shared resolver a existující testy. Rekurzivní BMAD ani další agent nebyl spuštěn.

Varianty: kopie Game algoritmu by mohla falešně potvrdit jiné chování; zůstává AST výběr skutečných metod. Mockování celého Apply by minulo potvrzovací a rollback vazby; nový test vykonává skutečné `applyRenderPreferences`, `prepareGraphicsConfiguration`, `frame`, `advanceSimulation`, `GraphicsTransition` a `NetworkTimeline`, přičemž pouze čas, GPU submit, fyzika a vlastníci scény mají ohraničené IO adaptéry. Společné konstruktorové hodnoty a shared helpery jsou sjednoceny v existující fixture, produkční logika se nekopíruje.

## Změny a důkazy

- `tests/game-graphics-application.test.ts`: šest testů. Během skutečného Apply zůstává ready, příjem autorit, timeline prediction, neutrální odesílání a flush. W/A/Space/Shift jsou znovu vloženy po blur a zůstávají neutrální na nohou i v autě. Normální frame nevykoná další render ani vizuální přípravu; diagnostika rozlišuje fáze. Zároveň se odmítne další Apply.
- Nová regrese drží submit nezávisle po úspěšné readiness: efektivní Ultra/50%/features jsou viditelné jako aplikované, požadované preference ještě nejsou potvrzené, revize se posune až po submit. Původní UI modal vlastnictví a scale po resize zůstávají zachovány.
- Skutečný 60s deadline přes fake browser clock vrátí Medium a nepotvrdí Ultra. Pozdní target submit nemůže dodatečně potvrdit preference; nekonečný čas ani timeouty se nezvyšují. Nekompeltní light readiness nepřeskočí na submit cílové grafiky. Staré dokončení i zamítnutí vegetation Promise nemůže změnit aktuální pending/error stav.
- `tests/game-quality-preparation.test.ts`: původní Auto tři kvality a bezpečnostní aserce zachovány; manual Low/Medium/High jen jeden 60s pass. Přidán Ultra i Custom s 50% scale a přesnými features.
- `tests/game-webgpu-startup.test.ts`, `tests/game-light-preparation.test.ts`, `tests/game-preparation-baseline.test.ts`, `tests/game-authored-light-preparation.test.ts`: doplněny skutečné nové helper metody a jejich runtime importy; startup ověřuje features předané načítání vegetace. Žádné původní readiness nebo retirement aserce neodstraněny.
- `tests/game-low-vehicle-preparation.test.ts`: reálný VegetationController prototype fixture má nový constructor state; zachovány skutečné FAR přípravy ve 41 stages, tři Auto kvality, cleanup a chyby.
- `tests/game-light-lifecycle.test.ts`: všechny tři render callsites (startup, live Apply, gameplay) explicitně ověřují kanonizaci světel před draw.
- `tests/game-diagnostics.test.ts`: skutečné extracted frame helpery, effective snapshot a nový constructor state; původní přesné timing/collector aserce zachovány. `tests/game-diagnostics-projection.test.ts` se neměnil, ale byl ověřen.
- `tests/helpers/weather-door-render-fixture.ts`: pouze sdílené constructor hodnoty, názvy skutečných Game metod a jejich původní shared resolver importy. Žádná produkční implementace v testu navíc.

## Ověření a omezení

Finální příkaz:

```powershell
node --import tsx --test tests/game-quality-preparation.test.ts tests/game-webgpu-startup.test.ts tests/game-light-preparation.test.ts tests/game-light-lifecycle.test.ts tests/game-preparation-baseline.test.ts tests/game-authored-light-preparation.test.ts tests/game-low-vehicle-preparation.test.ts tests/game-diagnostics.test.ts tests/game-diagnostics-projection.test.ts tests/game-graphics-application.test.ts
```

Výsledek: 138 testů, 138 pass, 0 fail/cancel/skip; exit 0; 10974 ms. Výstup zachován v tool transcriptu, samostatný log soubor nevznikl. Scoped `git diff --check` PASS.

První běhy byly červené z chybějících fixture helperů, původního očekávání tří manuálních kvalit a nového stavu vegetace. První nový Apply fixture potřeboval exports a aktuální health phase/errorCount; tyto testovací nedostatky opraveny. Nebyla zjištěna nová Game chyba vyžadující source edit. Rootův souběžný canRestore refaktor byl při finálním běhu zahrnut.

Globální TypeScript, plná sada, produkční build, integrace a Edge/GPU zde neběžely: vlastníkem heavy-validation byl souběžný C chat; task výslovně dovoluje jen cílené CPU testy. NullEngine testy nejsou důkaz FPS, skutečných GPU průchodů nebo hratelnosti. Přetrvává rootovo finální UI/GPU/pohybové ověření a celoprojektová přejímka.

Všechny vlastní procesy skončily. Dočasně selhal heartbeat kvůli existujícímu koordinačnímu mutexu, nic nebylo odstraněno; další heartbeat prošel. Po předání je claim uvolněn CLI; task status a integraci mění root. Cizí změny rendererů, UI, shared, ostatních testů a dokumentace zůstaly nedotčené.

## SHA-256 checkpoint

```text
client/game.ts ab6677f1d34c2cbb71e46c336fb10d82e8d74e4673e796b76f9ce16d2a2eca8b
client/graphics-transition.ts fa49d2426fd1418268c6d99dcca0c7702cbb4222dfba26c0bffebae948216d5c
client/adaptive-quality.ts ee7b794c0f28961759bae48788796195e97aa2ddca5b47be23c30d774f94552f
shared/render-quality.ts 9a509fd687ccc76e6cb6c4ef5af074bd5ef2fa3be395553baac77fcc7b946428
tests/game-quality-preparation.test.ts 8725e38b631f29ca43785d6a22c10360c5e116e5ca231826d387595c7dc5537c
tests/game-webgpu-startup.test.ts 757298c761118d2153ab72d927af9903b1ed208ccd2ff8e1b79268790187d574
tests/game-light-preparation.test.ts 02e934f28b40f7f114ea1c0b3f1e5a8193b1fd54782f69b44756b8845b253318
tests/game-light-lifecycle.test.ts 204d9d2858cc1d8ba1ac308a7645683d12c0faeb85215c384f101058a9c6e37a
tests/game-preparation-baseline.test.ts 6a83bea1754dd2b97705cbb5486813dee244e83b283358e854ccd712e8a0363b
tests/game-authored-light-preparation.test.ts 47980c14f89558b063c5e8f5bbeaaf9b98e398730378813474e3b06fe5f00264
tests/game-low-vehicle-preparation.test.ts 6ff86014c6d4a86e87ab3434d81979085a43d0f9fbdf15e0bf780f97de949ef9
tests/game-diagnostics.test.ts f8d344afb1ba396951ca8bc3b89cd73e930ac171dabe3283811b11103c7f68d7
tests/game-diagnostics-projection.test.ts 6c901fd065ca164227e1d54292f34ed046d52d8e9545a5e04f6b374008f5ffba
tests/game-graphics-application.test.ts c369f3fbf42498b1ef256723cbf08581a144eeec234fb4a5c2d5813e5199e904
tests/helpers/weather-door-render-fixture.ts 985095bda18ef59be744baed957671b48ab3b545f489e1c21e22ba00a667f746
```
