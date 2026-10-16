# Předání: webgpu-scheduler-generation-20261016

- Vlastník `webgpu-mig-01a14497-scheduler-generation` (`/root/stack_options`), příjemce `/root`.
- Worktree `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; při claim HEAD `f819b7604c5515f0fffd81cb166c6586401c9fe6`.
- Výsledek: samostatný minimální native scheduler fix, bez foreign active/cache/editor API. Změněny pouze `client/on-demand-render.ts`, `tests/on-demand-render.test.ts` a toto předání.
- Cizí WIP při claim: necommitované předání `webgpu-combined-game-20261016.md` jiného vlastníka; nedotčeno. Combined preview výstupy jsou vlastní oddělená rezervace, do tohoto commitu se nepřibírají.

## Příčina, varianty a ověření

Při průzkumu foreign persistent preview bylo zjištěno, že jeho `AvatarPreviewFrameWork` chrání zrušenou generaci. Native `OnDemandRender` před opravou měl pouze `cancelFrame(handle)` a při každém callbacku bezpodmínečně nuloval `handle`. Pokud host již callback odebral z fronty a zavolal jej po `visibilityChanged(false)` → `visibilityChanged(true)`, starý callback znovu renderoval a ztratil identitu nového pending RAF.

Nezávislý red test běžel na **přesné čisté native8de8299 kopii**, nikoli až na přidaném setActive API. Původní runtime SHA-256 `db46c76a32983332d85d73b34e5bfb5727ab377dc7925de8b35b3ae734127b94` se shodoval i s WT souborem před přenosem. Repro vyžaduje jen existující scheduler host + visibility, žádný WebGPU device. Red assertion dostala 1 render místo 0; log zachován.

Volba: skalární generační čítač, jehož hodnota se zachytí při naplánování; neplatný callback skončí před změnou handle i před renderem. Společné `cancelScheduledFrame` sjednocuje hide/dispose zneplatnění a rušení fronty. Samotné testování aktuální visibility nestačí po opětovném zobrazení. Vytvářet nový scheduler/engine při každém hide by zahazovalo stav a narušovalo async submission vlastnictví. Ponechání pouze cancelFrame neřeší již odebraný callback.

Vlastnictví in-flight submission, dirty coalescing, timing, idle stav a error callback se nemění. Generace je per owner, bez nových timerů, listenerů či per-frame objektů. Test navíc kontroluje zachování aktuálního handle, coalescing další request a ignorování callbacků po dispose.

2026-10-16 17:28 UTC, přímé Node CLI v izolované `.cache/webgpu-migration-checks/combined-preview/native-scheduler-check/`, přesná native8de8299 kopie plus pouze tyto dva změněné vstupy, read-only junction na `dependencies-v5/node_modules`:

- RED: `node candidate/node_modules/tsx/dist/cli.mjs --test --test-name-pattern='dequeued RAF' red-native-on-demand/tests/on-demand-render.test.ts`, exit 1, očekávaný skutečný failure 1 místo 0. Log `../logs/red-native-visibility.log`.
- GREEN: `node node_modules/tsx/dist/cli.mjs --test tests/on-demand-render.test.ts tests/avatar-preview-webgpu.test.ts`, **24/24 PASS**, exit 0. Log `../logs/native-scheduler-green.log`.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --esModuleInterop --types node tests/on-demand-render.test.ts`, **PASS**, exit 0. Log `../logs/native-scheduler-types.log`.

Původní red nebyl přepsán green logem. Neproběhl install, build, full suite, GPU ani spuštění serveru. Jde o CPU/ownership regresi, nikoli GPU/FPS důkaz. Všechny vlastní příkazy skončily. Hrané snapshoty a dependencies beze změn.

Samostatný přesný commit a release potvrzuje zpráva koordinátorovi. Combined-preview rezervace zůstává dál vlastněná pro nezávislou práci; toto uvolnění se jí netýká. Integraci, plnou pipeline a stav Linear přejímky vede root.
