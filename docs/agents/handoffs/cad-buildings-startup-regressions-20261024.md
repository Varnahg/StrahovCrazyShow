# Předání: cad-buildings-startup-regressions-20261024

- Vlastník: `cad-buildings-01a16b37-startup-regressions` (`/root/cad_runtime_research`); příjemce: koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b1-playtest-20261024`, výchozí HEAD `dea1b67fa27d1ccebc7b7f422e585305aeafdb45`.
- Výsledek: aktualizované Game VM fixtures pro kritický CAD loader a přesný protokolový kontrakt V12. Cílený startup/network běh PASS. Nezávislé shaderové selhání celé sady se izolovaně nereprodukovalo; tento test a produkční shaderový patch zůstaly beze změny.
- Změněné soubory: `tests/game-webgpu-startup.test.ts`, `tests/network-diagnostics.test.ts`, toto předání. Vlastní evidence/logy: `.cache/cad-buildings-20261024/cad-buildings-startup-regressions-20261024/`. `tests/image-processing-inactive-defines.test.ts` byl pouze čten a spuštěn, není změněný.
- Cizí WIP: původní runtime/renderer/model/navigační změny koordinátora a jiné testové opravy zůstaly nedotčené. Žádný staging, commit, BMAD renderer ani další agent.

## Mechanismus a rozhodnutí

Fullsuite log `.cache/cad-buildings-20261024/b01-runtime-integration/full-tests-first.log` ukazuje u startup testů chybějící `hasCadBuilding` a následně neznámý dynamic import `./cad-buildings`. VM extrahoval skutečný `Game.start`, ale prostředí nebylo rozšířené o jeho novou závislost a pomocnou metodu `loadCadBuildingsForStartup`. Přidány právě tyto vazby; samotné produkční metody se stále vykonávají. Nevyužívá se no-op přepsání CAD gate ani zkrácení skutečné startup/final-gate logiky.

Výchozí fixture odpovídá současnému native B1+B6 režimu. Dvě původní kontroly pozdního legacy B6 assetu mají explicitní `nativeB6:false`; nadále ověřují původní tři volitelné controllery a jejich úklid. Native late-assets scénář správně počítá jen car/vegetation a dokládá, že při selhání této fáze CAD IO ještě nezačalo. Neznámý import nyní selže vysvětlující fixture assertion, místo vrácení undefined.

Nové dva testy na celém skutečném `Game.start` ověřují pořadí kritického CAD IO před lighting/submitted-frame gate a propagaci CAD chyby mimo catch volitelných assetů. Neopakují container, transform, identity a scene-disposal scénáře samostatných CAD loader fixtures koordinátora. Stub nahrazuje IO; jeho volání kontroluje skutečně předanou scénu, registry array i startup AbortSignal.

Cílený refaktoring `settle()` používá jeden event-loop turn z `node:timers/promises` místo hádání počtu 24 microtasks. Vyřízené promise řetězce se dokončí nezávisle na počtu produkčních guardů, explicitně držené fixture promises zůstávají držené. Nezavádí časovou toleranci pro readiness ani ji nepředstírá.

Network test nadále přísně vyžaduje konkrétní `PROTOCOL_VERSION=12`: změna kapsle a stavebních kolizí vyžaduje společný klient/server i při zachovaném epoch/tick packet shape. Kontroly authenticated own-room reply, rate limit, nepřítomnosti broadcast/player/token dat a HTTP úniku zůstaly stejné. Nebyl použit volnější interval verzí.

## Shaderový výsledek a omezení

Původní fullsuite selhala pouze u prvního `draw(warm)` ve dvou WGSL případech, v `untilReady` s 4 000ms wall deadline; testovací časy byly 7 844,6 a 6 007,8 ms. Porovnání inactive Effect/body/layout ještě neběželo. Instalovaný Babylon používá `_ShaderImportLoader` s lazy imports WGSL default/PBR zdrojů (`standardMaterial.pure.js:2061`, `pbrBaseMaterial.pure.js:2040`), zatímco fixture staticky registruje hlavně GLSL. CPU/IO/scheduling contention celé sady je tedy slučitelná hypotéza, nikoli zde prokázaná příčina nebo shaderová regrese.

Samostatný nezměněný soubor prošel 7/7: WGSL Standard 195,38 ms, WGSL PBR 211,69 ms, celý runner 2 336,85 ms. Bez další reprodukce se neprodlužuje timeout, neodstraňuje readiness assertion, nemění produkční patch ani shaderový test. Přijatelnost celé sady pod koordinovanou zátěží zůstává root ověřením; izolované PASS není vydáváno za opravu celého fullsuite.

## Ověření a předání

- `pnpm exec tsx --test tests/image-processing-inactive-defines.test.ts`: exit0, **7/7 PASS**, log `shader-isolated-baseline.log` ve vlastní cache; soubor nezměněný.
- `pnpm exec tsx --test tests/game-webgpu-startup.test.ts tests/network-diagnostics.test.ts`: exit0, **20/20 PASS** (15 startup + 5 network), runner 2 288,91 ms, log `startup-network-first.log`.
- `git diff --check -- tests/game-webgpu-startup.test.ts tests/network-diagnostics.test.ts tests/image-processing-inactive-defines.test.ts`: bez whitespace nálezu.
- Snapshot: `implementation-evidence.json` ve vlastní cache obsahuje SHA-256 obou změněných testů, nezměněného shaderového testu, předání a logů. Stav celé sdílené pracovní kopie není tímto malým checkpointem zmrazený.
- Procesy: oba cílené CPU příkazy skončily exit0. Žádný server/port, GPU, Blender, build ani plná testovací sada nebyly spuštěny. Nejsou živé vlastní pomocné procesy.
- Další krok: koordinátor převezme tyto dva testové soubory a evidence, dokončí ostatní nezávislé fullsuite regrese a ověří stabilní společný checkpoint. Shaderové dvě fullsuite chyby zůstávají výslovně nereprodukované, ne označené za opravené.
- Rezervace: release až po tomto předání; přesný čas v živém registru a závěrečné zprávě. Stav tasku a integraci mění koordinátor.
