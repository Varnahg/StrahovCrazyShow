# KEY-17 — vlastnictví ImageProcessingPostProcess, rozhodnutí před patchem

14.10.2026. Pracovní kopie `C:/Users/rezac/.codex/worktrees/image-processing-ownership/StrahovCrazyShow`, branch `codex/image-processing-ownership`, základ `f63039b4067d57c8bdbe560ead5719cfc05cbb0d`. Samostatná instalace, žádný junction do main. Scope a heavy-validation rezervace: `fix-babylon-image-processing-ownership-20261014`, owner `fix-01a13624-babylon-20261014`.

## Doložený mechanismus

Primární zdroj: nainstalované `@babylonjs/core@9.30.0`, původně přečtené v main pouze read-only, nyní také vlastní frozen-lockfile instalace. Předchozí IMAGE-01 regrese skutečného CinematicAtmosphere měla před změnou1/7PASS, po non-HDR změně5/7PASS; zbývající živý config observer patřil ThinImageProcessingPostProcess a zůstal i po controller/scene.dispose. Pixelové/GPU ověření nebylo provedeno.

- `PostProcesses/imageProcessingPostProcess.js:328–344`: numerické options nebo chybějící wrapper vytvoří ThinImageProcessingPostProcess. Konstrukce však posílá `{effectWrapper: vytvořený, ...localOptions}`. Validní objekt s `effectWrapper: undefined` přepíše vytvořenou referenci, base pak vytvoří generický EffectWrapper. To není jen release problém; image-processing getter/white-balance mohou pracovat s nesprávným wrapperem.
- `PostProcesses/postProcess.pure.js:378–408`: wrapper dodaný přes constructor option je pro base vypůjčený. `_useExistingThinPostProcess` je true a `onEffectCreatedObservable` přímo aliasuje wrapper observable. Base nemůže vědět, že odvozená třída wrapper právě vytvořila.
- `postProcess.pure.js:787–825`: base u vypůjčeného wrapperu správně přeskočí wrapper.dispose, ale později při camera-dispose bezpodmínečně clearne jeho aliasovaný onEffectCreatedObservable. Tím poškozuje cizí/shared subscribers.
- `imageProcessingPostProcess.js:367–371`: po base dispose bezpodmínečně nastaví applyByPostProcessfalse také u caller-owned/shared wrapperu. To může vypnout konfiguraci dalšího postprocessu.
- `thinImageProcessingPostProcess.js:65–105,512–519`: config replacement odpojuje observer staré konfigurace a připojí nový; dispose odpojí právě aktuální config observer a resetuje aktuální applyByPostProcess. Samotné vymazání effect-created subscribers únik nespraví: callback na config stále může volat updateEffect/createEffect.

## Vybraná nejmenší oprava — schválená rootem před editací package

1. **Vlastnictví ve skutečné vytvářející třídě:** materializovat localOptions jednou; z této hodnoty vybrat skutečný supplied wrapper. Jen pokud je null/undefined, vytvořit jediný Thin a zachovat vlastní referenci. `super` dostane `{...localOptions, effectWrapper: resolvedWrapper}` s referencí až za spreadem. Numerický i objektový vstup zůstane beze změny ostatních option precedencí. Explicitní `effectWrapper:undefined` nesmí wrapper zahodit.
2. **Owned release přesně jednou:** dispose odloží vlastní referenci do lokální proměnné a vynuluje ji před cleanup (také ochrana proti reentranci). Uvolní pouze tuto referenci. Base dispose(camera) se volá i při dalších dispose/camera detach; nedělat early return celé metody. Pořadí owned wrapper cleanup před base onDispose odpovídá běžnému base-owned EffectWrapper chování.
3. **Borrowed config:** odstranit redundantní bezpodmínečný config reset v odvozeném dispose. Owned Thin.dispose již reset dělá; u vypůjčeného wrapperu rušení jeho config/observer/effect patří volajícímu, nikoli vypůjčovateli.
4. **Borrowed event alias:** uvnitř base pouze podmínit závěrečný clear onEffectCreatedObservable tím, že base wrapper vlastní (`!_useExistingThinPostProcess`). Flag se nemění. Owned Thin jej clearne vlastním dispose; caller/shared callbacky zůstanou. Jde o stejný vlastnický kontrakt, ne nesouvisející kosmetiku.

Alternativy: mutovat base ownership flag odmítnuto, protože nerozlišuje skutečně vytvořenou referenci a mění base shader setup. Cleanup z klienta přes onBuild/onDispose nemá veřejný getter wrapperu (jen protected `_effectWrapper`); odmítnuto. Relay observable jen v odvozené třídě by přidal nový observer/stav a změnil veřejnou alias identitu; guard uvnitř vlastnící base je menší a zachová API. Plošné clear config observers/caller wrapper dispose poškozuje cizí materiály. Větší vlastní Bloom/FXAA pipeline či material-owned config řeší širší architekturu a není nutná pro tento konkrétní bug.

## Hranice a ověření před přijetím

- Numeric options, object options, explicit `effectWrapper:undefined` včetně white-balance options; supplied/shared skutečný Thin wrapper.
- Owned: po dispose config observer baseline po skutečném deferred removal ticku, nulové další createEffect při exposure změně, přesně jeden call-through actual effect.dispose v izolovaném engine. Samotné nepřijetí effect-created eventu nestačí.
- Borrowed/shared: žádný wrapper/effect dispose, config flag zachovaný, owner subscriber i druhý postprocess přežijí a reagují na další konfiguraci. Cleanup explicitně provede caller.
- Config replacement: observer se přestěhuje na novou konfiguraci; owned release uklidí aktuální. Stará konfigurace se bez refcount/ownership důkazu nepřepíná (může sloužit jinému vlastníkovi).
- Double/multi-camera dispose: vlastní wrapper pouze jednou, base cleanup/detach pro každou kameru. Callback onDispose má vidět již dokončený owned cleanup; nesmí se spoléhat na nahodilou GC.
- Plain base PostProcess owned a borrowed control pro guard event aliasu.
- Konstruktor: validní explicit-undefined option případ je konkrétní red kandidát, jehož příčinu opravuje pořadí spreadu. Obecný exception cleanup uvnitř Thin/base konstruktorů se nebude hypoteticky rozšiřovat; pokud se objeví další relevantní validní reprodukce, nejprve se doloží. Celý argument `options=undefined` není deklarovaný public constructor kontrakt; nesmí se zaměňovat s validním vlastním polem `effectWrapper:undefined`.

## Balíčkování a izolace

Ověřeno CLI pnpm11.25.0 `help patch`/`help patch-commit` a oficiální [patch](https://pnpm.io/11.x/cli/patch), [patch-commit](https://pnpm.io/11.x/cli/patch-commit). Editace pouze extrahované kopie přes `pnpm patch @babylonjs/core@9.30.0 --edit-dir .cache/image-processing-ownership/...`; výsledný verzovaný soubor `patches/@babylonjs__core@9.30.0.patch`, top-level patchedDependencies a lockfile. Neměnit dependencies v package.json patche, globální store, staré junctiony ani jiné verze závislostí.

Původní samostatná `pnpm install --frozen-lockfile` dokončena exit0 (13.8s), log `.cache/image-processing-ownership/install-original.log`. Následují uchované red výsledky, patch, green, úzké typy, relevantní starší testy a druhá čistá frozen instalace v tomto scope. Žádný server/browser/GPU/build/fullsuite. Implementační výsledky a hashes se doplní až podle skutečnosti.

## Souborový checkpoint během uživatelského QA — 14.10.2026

První red skutečné9.30 instalace skončil1/10PASS a9FAIL; patch-commit následně dokončil exit0 a vytvořil schválený dvousouborový patch `f1bedab8535488db586326bc2b9d18aeebf1444ed2c7569fbb691193f1d43805`. Ne-frozen resolver však zároveň aktualizoval schema5.0.36→5.0.39; proto dosavadní checkpoint nebyl přijat. Průběžné logy ani původní výsledky se nezahodily.

Koordinátor po uvolnění heavy-validation přidělil jen souborovou fázi s resources[] a výslovným zákazem install/test/tsc/auditu během živého B6 QA. V této fázi:

- Původní red test uložen byte-exact jako `.cache/image-processing-ownership/red-test-original.ts`; zachován i `pnpm-lock.after-resolver.yaml`.
- Config replacement testy mají cizí sentinels na původní i nové konfiguraci a očekávají jejich zachování po odstranění Thin callbacku. Plošné clear konfigurace tím neprojde.
- Fixture sleduje skutečně dosud vlastněné prostředky: PostProcess se při explicitním onDispose odebere z teardown ledgeru, caller-owned wrapper se explicitně uvolňuje přes releaseWrapper a odebere před svým dispose. Záměrné opakované/reentrant/multi-camera IP volání zůstalo.
- Installed `effectRenderer.pure.js:201` vytváří `new Observable(undefined, true)`. Subscribe přehrává poslední effect, proto borrowed/shared/base-borrowed testy nyní porovnávají počet po tomto replay těsně před explicitní změnou a vyžadují **další nárůst**. Samotné `events > 0` nebylo dostatečným důkazem.
- Bylo vráceno všech9 schema5.0.39 referencí i registry integrity na přesné HEAD5.0.36. Lehká textová kontrola prokázala: odstranění jediného patchedDependencies záznamu a pěti přesných core/loaders patch-hash suffixů dává byte-exact původní HEAD lock (`7f3bc7e3f25f82dec007e7eeea89dddda0a95988499292ccae2a08c22040e332`). Žádný jiný dependency resolver delta nezůstal. Výsledný lock SHA256 `7afd00581ae09f21e4f04c6fdb76e64a2a8e6061e83340988f0e771ca8b3c90e`; package.json nezměněn, workspace má jen patch registry.

**Installed node_modules se v souborové fázi neměnily:** zatím mohou obsahovat nechtěnou5.0.39 z prvního patch-commit. Teprve budoucí frozen reinstall musí potvrdit obnovení skutečné instalace. Upravené testy nebyly spuštěny, green/typy/reprodukovatelná instalace a následný úplný isolation audit zůstávají čekající. Runtime patch se nezměnil. Přesná evidence textového porovnání je `lockfile-repair.json`, nový source checkpoint vcache; nejde o výsledek herního/type testu.

## Dokončení cíleného ověření — 14.10.2026 16:37–16:46 Praha

Po explicitním obnovení heavy-validation a novém claimu se před každým náročným krokem ověřovalo TCP Established na4186/2581 a candidate game-diagnostics. Všechna ověření měla0 spojení a žádné JSONL; evidence `qa-idle-checks.jsonl`. Existující preview se neotevíralo, nezastavovalo ani neměnilo.

- `pnpm install --frozen-lockfile`: exit0/2.4s, resolution skipped, restored installed schema5.0.36, Babylon9.30.0 s přesným patchem. Lock SHA zůstal7afd00581ae09f21e4f04c6fdb76e64a2a8e6061e83340988f0e771ca8b3c90e; žádný jiný dependency delta.
- Zpřísněný `babylon-image-processing-ownership.test.ts`: **10/10PASS**, exit0. Actual owned cleanup, borrowed/shared config a subscribers, sentinels, explicitundefined, replacement, multi-camera/reentrant/double dispose a plain base controls. Test ověřuje také skutečné engine.createEffect a actual effect.dispose, nejen event delivery.
- Narrow TypeScript: exit0. První běh odhalil pouze chybějící typ `this` v disposal spy; opraveno na `this:T`, uchován `types-initial.log`. Žádná změna package patche.
- Čtyři existující sady `cinematic-atmosphere`, `cinematic-art`, `cinematic-pipeline`, `cinematic`: **16/16PASS**, exit0, bez úpravy jejich souborů.
- Druhá instalace v původně prázdném `.cache/image-processing-ownership/frozen-reproduction`: kopie přesných package/workspace/lock/patch/test vstupů, `pnpm --dir ... install --offline --frozen-lockfile`, **exit0/2m13.1s**, resolution skipped,141 reused/0 downloaded. Obě instalace jsou vlastní skutečné node_modules adresáře, nikoli junctiony na main.
- **Finální test po potvrzeném ukončení této instalace:10/10PASS**, exit0, `reproduction-green-final.log`. Předběžný kontrolní test doběhl již během dojezdu installeru; je zachován jako `reproduction-green-during-install.log` a nebyl použit místo finálního důkazu. Final test source je byte-identický zkopírovanému vstupu.
- Úplný následný main dependency audit: **17238 entries, changed[], aliasesUnchangedtrue**, digest před/po `50a1b986d40d5f21da2258ccaa50c820377d599d23d3ec1434a039043283e387`. Nezměnil se obsah main node_modules ani žádný ze čtyř wave4/B6 dependency aliasů. `main-dependencies-after-patch.json` a `isolation-after.log`.
- `final-installation-identity.json` potvrzuje přesné shody obou lockfilů, skutečnou installed schema5.0.36/core9.30.0, stejné patched JS bytes a nezměněný Thin implementation/d.ts. Package patch obsahuje jen2 JS soubory; ostatní dependency verze a package.json jsou původní.

Finální test SHA256 `7b5805fa068351965467304170576df59805770d58670659b610b37a4c9a6d6a`; patch stále `f1bedab8535488db586326bc2b9d18aeebf1444ed2c7569fbb691193f1d43805`. Implementační a cílený instalační kontrakt je připraven k root review a společné přejímce. **Nebylo provedeno fullsuite/build/integration ani GPU/obrazové měření; KEY-14 či celá hra se tím neprohlašují za hotové.** Starý IMAGE-01 client kandidát se v tomto package tasku neměnil. Staging/commit a integraci vlastní root.
