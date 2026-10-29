# Předání: fix-babylon-image-processing-ownership-20261014

**Implementace, cílené regrese, typy, frozen obnova a čistá reprodukce jsou dokončené. Připraveno k root review a plné společné přejímce; necommitnuto, neintegrováno do main, bez GPU/obrazového tvrzení.**

## Finální výsledek

Vlastník `fix-01a13624-babylon-20261014`, příjemce `/root`, WT `C:/Users/rezac/.codex/worktrees/image-processing-ownership/StrahovCrazyShow`, branch `codex/image-processing-ownership`, základ `f63039b4067d57c8bdbe560ead5719cfc05cbb0d`. Původně clean dependency scope, následné vlastní WIP z tohoto handoffu výslovně znovu převzato přes adopt-dirty; cizí změny nepřebrány.

Samostatný delta pro review/staging tvoří **jen6 souborů**: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/@babylonjs__core@9.30.0.patch`, `tests/babylon-image-processing-ownership.test.ts`, `docs/performance/research-20261014/image-processing-ownership.md`, tento handoff. `package.json` beze změny. Nezahrnovat cizí koordinační AGENTS/catalog WIP ani ignorovanou cache/node_modules. Root výslovně ponechal commit ve své odpovědnosti.

Patch mění pouze publikované `PostProcesses/imageProcessingPostProcess.js` a `PostProcesses/postProcess.pure.js`. Constructor drží skutečně vytvořený Thin, resolved reference je až za options spreadem; owned dispose proběhne přesně jednou před base lifecycle, každá kamera se stále odpojí. Borrowed/shared wrapper nepřijde o config, effect ani event subscribers. Base ownership flag se nemutuje. Refaktoring sjednotil jedinou vlastněnou referenci/reset a úzký base event guard, žádný nový framework, klientský protected cast, prototype patch či nesouvisející dependency upgrade. Thin implementation/d.ts zůstaly byte-identické původní9.30.0. Obecné constructor exception handling se nepřidávalo bez prokázané další příčiny; validní explicitundefined+temperature chyba je opravená pořadím spreadu.

### Skutečná ověření

14.10.2026; časy níže UTC. Před každým náročným krokem TCP4186/2581 a candidate JSONL gate ověřily0 spojení/žádné logy; přesná historie je vcache `qa-idle-checks.jsonl`. Staré live služby se v tomto tasku neotevíraly ani neukončovaly.

| Krok | Výsledek | Evidence v `.cache/image-processing-ownership/` |
| --- | --- | --- |
| Původní balíček, red skutečných10 scénářů | exit1,1PASS/9FAIL | `red.log`, původní source `red-test-original.ts` |
| Opravený lock,14:37:23: `pnpm install --frozen-lockfile` | exit0,2.4s, resolution skipped; installed schema5.0.36 | `install-frozen-restored.log` |
| Green ownership,14:37:42 | exit0,**10/10PASS**, zpřísněné sentinels/event delta | `green.log` |
| Narrow tsc,14:38:51 | exit0; předchozí fixture-only chybějící this anotace zachována | `types-final.log`, `types-initial.log` |
| Čtyři původní cinematic/art/pipeline sady,14:38:55 | exit0,**16/16PASS**, beze změn souborů | `existing-postprocess.log` |
| Původně prázdná nezávislá reprodukce,14:39:59 | `pnpm --dir .cache/image-processing-ownership/frozen-reproduction install --offline --frozen-lockfile`, exit0,2m13.1s,0downloaded | `install-clean-frozen.log`, `frozen-reproduction-inputs.json` |
| Final test z čisté kopie až po installer exit0,14:43:55 | exit0,**10/10PASS**, byte-exact finální test | `reproduction-green-final.log` |
| Plný byte/link after audit,14:43:58 | exit0,**17238entries/0změn**, všechny4 původní aliasy stejné | `main-dependencies-after-patch.json`, `isolation-after.log` |

Test příkazy: `node node_modules/tsx/dist/cli.mjs --test tests/babylon-image-processing-ownership.test.ts`; původní sady stejným CLI s `tests/cinematic-atmosphere.test.ts tests/cinematic-art.test.ts tests/cinematic-pipeline.test.ts tests/cinematic.test.ts`. Narrow typy: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/babylon-image-processing-ownership.test.ts`.

Předběžný repro test byl omylem spuštěn během dojezdu čistého installeru; jeho PASS je zachovaný pouze v `reproduction-green-during-install.log`. Po potvrzeném exit0 byl test výslovně zopakován a teprve tento finální výsledek tvoří reprodukční důkaz. Žádná historie nebyla zaměněna za novější úspěch.

`final-installation-identity.json` potvrzuje: vlastní i čistá kopie mají skutečné node_modules adresáře, core9.30.0/schema5.0.36, shodné lock/test/patched JS bytes; po odečtení jediné registry položky a5patch suffixů je lock byte-exact HEAD. Main node_modules i původní wave4/B6 baseline/candidate/standalone aliasy jsou beze změny, before/after digest `50a1b986d40d5f21da2258ccaa50c820377d599d23d3ec1434a039043283e387`.

| Finální soubor | SHA256 |
| --- | --- |
| `patches/@babylonjs__core@9.30.0.patch` | `f1bedab8535488db586326bc2b9d18aeebf1444ed2c7569fbb691193f1d43805` |
| `pnpm-lock.yaml` | `7afd00581ae09f21e4f04c6fdb76e64a2a8e6061e83340988f0e771ca8b3c90e` |
| `pnpm-workspace.yaml` | `5dfd82bf6883a1c666882a3cc05a02d40b10d01eb59275919bdf392c03996748` |
| `tests/babylon-image-processing-ownership.test.ts` | `7b5805fa068351965467304170576df59805770d58670659b610b37a4c9a6d6a` |

Patched runtime JS SHA: ImageProcessingPostProcess `c97937b740966d260475a421658cc038b8fb95756231f992468696a03484378a`; base PostProcess `e45a4d6682951457b861fcf2d58feecb6b587a90577c7e63bf286249fd037ab9`. Kompletní výsledný source checkpoint včetně dokumentace je v `final-source-checkpoint.json` (cache, ne commit).

### Převzetí a skutečné limity

Všechny vlastní procesy skončily; žádný server/port/browser/GPU nezůstává. Po finálním handoffu se uvolňuje heavy-validation i souborová rezervace, aby root mohl provést svou plnou validaci nad stabilním checkpointem. Provozní identity zůstávají jen v ignorované cache, nikoli ve verzovaných dokumentech.

Root musí převzít konkrétní6-souborový delta, provést plánovanou full test/build/integration přejímku a samostatný commit/integraci. Tento task nespustil celou sadu, build, integraci ani GPU/render; nepřijal noční vzhled, FPS nebo KEY-14. IMAGE-01 klientský kandidát se zde neměnil. Stock ThinBloom/FXAA ownership gap je samostatně popsaná zdrojová hranice; není v tomto patchi řešený ani vydávaný za nový prokázaný leak. Budoucí resolver nesmí znovu přijmout latest upgrade místo frozen-lockfile použití.

## Historická aktualizace pouze souborů během B6 QA

Koordinátor změnil task na resources[]; původní autor získal nový vlastní claim s `--adopt-dirty` z tohoto partial handoffu. Během této fáze nebyl spuštěn pnpm, patch-commit, žádný herní/type test, plný dependency audit ani jiný náročný příkaz. Proběhly pouze souborové úpravy, čtení a lehké textové/hash porovnání.

1. **Fixtures připravené:** foreign sentinels A/B u owned i borrowed config replacement; kontrola zachování jejich identity a skutečné funkčnosti, nikoli jen celkového počtu. Teardown ledger nově odebere explicitně zrušený PostProcess přes onDispose, caller-owned wrappers přes releaseWrapper před skutečným dispose. Záměrný double/multi-camera/reentrant IP scénář je zachovaný. Borrowed/shared/base-borrowed event kontroly zachytí count po subscribe-time replay a vyžadují nový přírůstek po exposure/updateEffect; původní `events>0` mohl být falešně zelený kvůli `Observable(undefined,true)`.
2. **Lockfile napraven:** všech9 referencí schema5.0.39 a nová integrity vráceny na přesnou HEAD5.0.36. Odstranění jediného patch registry záznamu a pěti přesných core/loaders patch suffixů z opraveného locku dává byte-exact HEAD obsah. Žádná jiná verze/integrita/konfigurace se nezměnila. `package.json` byte-identický HEAD; workspace obsahuje pouze původní obsah plus schválenou patchedDependencies položku. Výsledný lock SHA256 `7afd00581ae09f21e4f04c6fdb76e64a2a8e6061e83340988f0e771ca8b3c90e`, podrobný důkaz `lockfile-repair.json`.
3. **Runtime patch beze změny:** nadále SHA `f1bedab8535488db586326bc2b9d18aeebf1444ed2c7569fbb691193f1d43805`. Samotná installed dependency sada zatím zůstává po prvním resolveru; návrat installed schema5.0.36 se netvrdí, dokud neprojde budoucí frozen install.
4. Původní red test a nežádoucí resolverový lock uchovány v `.cache/image-processing-ownership/red-test-original.ts` a `pnpm-lock.after-resolver.yaml`. Red1/10 je výsledek této starší zachované verze testu, nikoli spuštění nyní zpřísněných fixtures. Nové hashes a pending kroky jsou v `source-checkpoint-during-user-qa.json`.

Vlastní krátké souborové příkazy skončily. Po dokončení checkpointu následuje release souborové rezervace; heavy-validation nebylo v této fázi drženo. Root obnoví těžké ověření až po ukončení uživatelského měření. Žádný commit/staging.

## Historie před pozastavením ověřování

- Vlastník `fix-01a13624-babylon-20261014`, příjemce `/root`; WT `C:/Users/rezac/.codex/worktrees/image-processing-ownership/StrahovCrazyShow`, branch `codex/image-processing-ownership`, základ `f63039b4067d57c8bdbe560ead5719cfc05cbb0d`.
- Nová vlastní instalace `pnpm install --frozen-lockfile` exit0/13.8s, log `.cache/image-processing-ownership/install-original.log`. `node_modules` je skutečný adresář této WT; staré main/wave4/B6 junctiony se neměnily. Před package editací vznikl byte/link audit17238entries main node_modules a čtyř aliasů, digest `50a1b986d40d5f21da2258ccaa50c820377d599d23d3ec1434a039043283e387`, `.cache/image-processing-ownership/main-dependencies-before-patch.json`. Následná plná kontrola ještě čeká.
- Výzkum a rootem zvolený dvojí ownership kontrakt jsou v `docs/performance/research-20261014/image-processing-ownership.md`, zapsány před editací balíčku. Úprava se týká pouze dvou package JS souborů: ImageProcessingPostProcess drží skutečně vytvořený Thin, resolved wrapper je až za option spreadem, vlastní wrapper dispose přesně jednou před base cleanup; borrowed config se neresetuje. Base PostProcess pouze neclearuje aliasovanou event source vypůjčeného wrapperu. Base private flag se nemutuje, žádný klientský protected cast ani prototype patch.
- Red skutečného balíčku:14.10.2026 16:07:46–47 Praha, `node node_modules/tsx/dist/cli.mjs --test tests/babylon-image-processing-ownership.test.ts`, **exit1,1/10PASS,9FAIL**, `.cache/image-processing-ownership/red.log`. Owned numeric/object nechají config observer; validní explicitundefined+temperature má TypeError; borrowed/shared resetují config a clearují subscribers. Plain base owned kontrola prošla. Žádné render/GPU.
- `pnpm patch @babylonjs/core@9.30.0 --edit-dir .cache/image-processing-ownership/core-edit` dokončeno. Editované soubory měly nlink1 a byte shodu s původní vlastní instalací; přesné původní hashes v `original-core-hashes.json`. Neupravoval se shared store ani installed main soubor.
- `pnpm patch-commit .cache/image-processing-ownership/core-edit --patches-dir patches` **sám skončil exit0**, bez přerušení. Ukončení vlastního pnpm i obou wrapper procesů bylo ověřeno. Provozní command/process identity a časové údaje jsou pouze v ignorovaném `.cache/image-processing-ownership/process-evidence.json` a původním cache checkpointu; zachovaný celý `patch-commit.log`.
- Výsledný povolený soubor `patches/@babylonjs__core@9.30.0.patch`,3498B,SHA256 `f1bedab8535488db586326bc2b9d18aeebf1444ed2c7569fbb691193f1d43805`; top-level patchedDependencies vpnpm-workspace.yaml. **Ne-frozen resolver patch-commit však současně změnil @colyseus/schema5.0.36→5.0.39**, protože manifest používá latest. Jde o nechtěný vedlejší resolverový výsledek; nesmí být přijat ani commitnut. Package.json zůstal beze změny.
- Aktuální souborové hashes, skutečná installed core cesta a nedokončené kroky jsou v `.cache/image-processing-ownership/checkpoint-before-user-qa.json`. Snapshot není finální identita schválené opravy.

## Historický seznam nedokončených kroků při prvním předání

1. Sentinel A/B, cleanup ledger a event-count delta byly v této mezifázi pouze souborově hotové. Nyní jsou ověřené výše uvedeným green a čistou reprodukcí.
2. Přesný lockfile delta byl v mezifázi pouze souborově hotový. Nyní je vlastní i čistá instalace ověřená jako schema5.0.36; žádný broad Git reset se nepoužil.
3. Green cílené testy, narrow TS, relevantní dosavadní postprocess testy; skutečné observer baseline + engine.createEffect + actual effect.dispose, nikoli falešně uklidňující absence effect-created eventu.
4. Čistá samostatná frozen-lockfile reprodukce uvnitř přidělené cache; validovat pin/hash a nulové další dependency delty. Pak `audit-isolation.mjs verify` porovná celý main dependency obsah i původní wave4/B6 aliasy.
5. Aktualizovat research/handoff o skutečné výsledky; root si ponechává review/staging/commit a navazující plnou přejímku. V tomto tasku žádný fullsuite/build/server/browser/GPU.

Root nezávisle ověřil, že používané stock Bloom/FXAA adaptéry nepřidávají vlastní onEffectCreated subscriber; jejich vlastní onApply cleanup zůstává. Zdrojový gap jejich interních Thin wrapperů je samostatná hranice a tento IP patch jej nepředstírá jako opravený.

Na výslovnou žádost rootu kvůli novému uživatelskému testu byly po doběhnutí pnpm zastaveny další install/test akce. Žádné vlastní procesy nezůstávají. Po tomto handoffu se uvolňuje souborová i heavy-validation rezervace; root může přenastavit resources a později znovu explicitně přidělit pokračování. Release neznamená Done. Žádný commit/staging nebyl proveden a autorství ani scope se tímto nepřevádí na jiného zapisujícího agenta.
