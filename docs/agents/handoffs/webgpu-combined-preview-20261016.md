# Předání: webgpu-combined-preview-20261016

- Vlastník `webgpu-mig-01a14497-combined-preview` (`/root/stack_options`); příjemce `/root`, společnou Game/UI kontrolu provádí `/root/simulation_network`.
- Worktree `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; claim při HEAD `9ceeeb9753b859c034c6185b9626c8a82542b0e0`. Native vstup je přesný commit `8de8299a7db91c6e072898a7cecbcaf0de3ffa3c`, nikoli pohyblivý WT.
- Výsledek: izolovaný kombinovaný kandidát, **ne integrovaný/commitovaný foreign runtime**. Do tohoto commitu patří pouze toto předání. Primary ani migrační avatar runtime se nezměnil.
- Scope výstupů: `.cache/webgpu-migration-checks/combined-preview/`. Candidate soubory, baseline vstupy, diffy, manifesty a všechny red/green logy zůstávají v této vlastněné cache. Žádný install/build/fullsuite/GPU/server.

## Vstupy a provenience

Před zápisy přečteny oba konkrétní diffy, primary `repair-avatar-preview.md`, task/registry a native async preview/scheduler/testy. Primary cizí WIP z `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow` zachycen v `inputs/primary/`; SHA ověřeny před kopírováním, po něm a po dokončení:

| Vstup | SHA-256 |
| --- | --- |
| `client/avatar-renderer.ts` | `75aeda37853ba39c650529cfecb152ffb8f8fb6e03973dc6dd3eaa1606f229d9` |
| `client/avatar-editor.tsx` | `20db83a1d9d98b6bb2a7c647f79fba383371546d415d5f38c7fd18cf13f4c83a` |
| `client/avatar-preview-cache.ts` | `092b63ae975b57ae19993b10ec24587d2e394cfecd1f78d1ab35a5f2f4fcb29d` |
| `tests/avatar-preview.test.ts` | `efefba176c2fedbb58b2aeabc30fe34be3a7578effd6db983cfead8cb8229ff5` |
| `tests/avatar-preview-cache.test.ts` | `23dcc784ee7187ec980da6eb16334c407575cb987c01ec3baae6ea07ad8afe77` |

`inputs/manifest.json` uchovává identitu před změnou; `inputs/native.tar` je git archive native vstupů. Finální `candidate-manifest.json` obsahuje také nativní SHA každého existujícího dotčeného souboru a hashes všech logů. Přístup k `.cache/webgpu-migration/dependencies-v5/node_modules` pouze read-only junction; žádný bootstrap nebo zápis do dependencies.

Primární mechanismus ověřen v pinovaném Babylon 9.30: `Geometry.releaseForMesh(mesh, true)` ruší posledního uživatele a buffery; `InstancedMesh.isReady(true)` deleguje na `sourceMesh.isReady(true, true)`. Proto nestačí pouze překopírovat async factory: zachování geometrie vyžaduje vytvořit další rig před zrušením starého a viditelné instanční shadery hledat na source mesh. Tento mechanismus je ověřen i CPU testem skutečné surface factory, nikoli jen podobným testovacím modelem.

## Volba a zachované vlastnosti

Zvoleno přenést foreign `AvatarPreviewModel` a `avatarPreviewMeshesReady` do native `avatar-renderer.ts` a použít je uvnitř native async `avatar-preview.ts`. Nepoužít starý synchronní vlastní WebGL Engine vedle nové factory; tím by vznikly dvě konkurenční cesty, odlišná health pravidla a lifecycle. Neponechat native dispose-before-create; původní foreign test doložil skutečné zničení sdílené geometrie touto sekvencí.

- Model zachovává create-next-before-dispose-old, hodnotové no-op a pruning; původní model/helper kód je převzat beze změny. Reálné surface testy ověřují sdílené skinned buffery, jeden rig/skeleton a zachování zvoleného face/body framing i rotace.
- Readiness sleduje jen enabled/visible meshe aktuálního rigu; vynechává nepoužité pool sources/medium LOD. Native compilation-info sběr pro zobrazené instance používá jejich source mesh efekt; nepovoluje prázdnou sadu shader modules jako ready.
- Native async engine, AbortSignal, RenderHealth, texture diagnostics, validation error scope, shader compilation info, queue submitted gate, viditelný 30s budget a error cleanup zůstávají. Neaktivní hotový owner dále hlídá chyby, ale neplánuje RAF ani přípravný timer.
- `AvatarEditor active?: boolean = true` a controller `setActive(boolean)` jsou domluvené se `simulation_network`. Hotový editor při close usne; reopen použije stejný controller/engine a poslední profil. První nedokončená creation se při close zruší; late result uklidí pouze svůj owner. Unmount abortuje a disposuje, generation brání pozdním stavovým callbackům. Pointer capture se uvolňuje na close i unmount.
- Foreign `avatar-preview` create/update/active/frame/ready-frame/resume-frame/dispose diagnostika je zachována podle nového async scope. Engine příprava má `engineStartupWallMs`, nikoli zavádějící `engineCpuMs`. Surface create uvádí oddělenou synchronní CPU práci; hotový frame event vzniká po native validation/submission gate.

Scheduler má jediného aktivního vlastníka: native `OnDemandRender` serializuje async checkpointy a dirty requests. Foreign `AvatarPreviewFrameWork` modul i jeho test zůstávají byte-identické v candidate, ale není druhým aktivním schedulerem. Jeho generační ochrana byla přenesena do native scheduleru po prokázané samostatné regresi. Jeho konkrétní 100ms readiness retry cadence se v native async cestě nepoužívá; další preparation frame se plánuje po dokončení předchozího checkpointu. Případný rozdíl cold-start nákladů vyžaduje produkční profil, CPU PASS jej neměří.

## Samostatná čistá oprava objevená při spojování

Již dequeued RAF po hide→show mohl v původním native scheduleru renderovat a přepsat handle nové fronty. Repro potvrzeno i bez foreign setActive na přesné `8de8299` kopii. Po přidělení samostatného tasku vznikl commit **`7939f1f`** pouze s native schedulerem, red/green testem a vlastním předáním; jeho rezervace je uvolněná. Candidate obsahuje přesně tutéž opravu, nejde o další foreign změnu.

## Frozen výstupy

Adresář `candidate/` obsahuje pracovní native snapshot pro izolované ověření. **K přenosu jsou určeny pouze následující soubory z manifestu, nikoli celá candidate kopie**; Game/UI patří jinému vlastníkovi:

- `client/avatar-renderer.ts`: `c8fc566c54810b109118628ee8bdecef4da5a07cdceb1da09eeabf279401bece`
- `client/avatar-preview.ts`: `caceaa5d9961eb048363b8d6c15c50b0552b2f3174489d315021a726dfc0d8a2`
- `client/avatar-editor.tsx`: `255b08f871ce76bc7bcb1f9613d7792b45f9d8b4c3507daa4e822e6222fd57b5`
- `client/avatar-preview-cache.ts`: byte-identický primary hash uvedený výše.
- `client/on-demand-render.ts`: `a5904b6966e44a1e4566f6f176794525f14f3d82a858fd8c9c9dfcd15f4060a8`, již samostatný commit `7939f1f`.
- `tests/avatar-preview.test.ts`, `tests/avatar-preview-cache.test.ts`: byte-identické primary testy.
- `tests/avatar-preview-webgpu.test.ts`: `d3483e9e0201c792758b72f455f7150f28e5c0891b1d074f3ea3b24a047262c4`.
- `tests/avatar-preview-surface.test.ts`: `a3695f18d9c120ad8407ee816ad20241a1eff680ee943f543171e9324fe17a98`.
- `tests/on-demand-render.test.ts`: `9fd4cb2e60f8a67ee4fa60e61618884c232fa76e9e7541040a6ede6aaf387b03`, již samostatný commit `7939f1f`.

`candidate-manifest.json` SHA-256 **`e1f18d44a999d9871a3eebbc4d1e1973b71ca0858154d7bfaccc9d8ebfcc6b28`**. `diffs/` obsahuje diff proti native a tam, kde existoval vstup, proti primary WIP. Freeze i konkrétní SHA předány koordinátorovi a `simulation_network`; po freeze se do candidate nezapisuje.

## Ověření a omezení

2026-10-16 17:32 UTC, cwd `candidate/`:

- `node node_modules/tsx/dist/cli.mjs --test tests/avatar-preview-webgpu.test.ts tests/avatar-preview-surface.test.ts tests/avatar-preview.test.ts tests/avatar-preview-cache.test.ts tests/on-demand-render.test.ts`: **39/39 PASS**, exit 0, `logs/combined-final.log`.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --jsx react-jsx --esModuleInterop --resolveJsonModule --types node,vite/client client/avatar-editor.tsx client/avatar-preview.ts tests/avatar-preview-webgpu.test.ts tests/avatar-preview-surface.test.ts tests/avatar-preview.test.ts tests/avatar-preview-cache.test.ts tests/on-demand-render.test.ts`: **PASS**, exit 0, `logs/types-final.log`.
- Původní native bez setActive: skutečné očekávané **2 RED** (`logs/red-active.log`). Opožděný callback: **1 RED** přes combined controller (`red-stale-frame.log`) a samostatně **1 RED** čistého native visibility scheduleru (`red-native-visibility.log`). Všechny zachované, žádné nahrazení green logem.
- Izolovaná čistá native scheduler oprava: **24/24 PASS** + strict scoped TS, `logs/native-scheduler-green.log`, `native-scheduler-types.log`. Průběžné green32/29 a surface2 zůstávají v cache; finální výsledek je výše uvedených 39.

CPU testy pokrývají skutečnou factory/React effect bodies, cache identity, hidden/inactive pause, pokračující error monitoring, in-flight completion, latest config, reopen reuse, late init/controller disposal, pointer release, stale generations a deadline. Neověřují obraz/FPS/GPU; žádná tvrzená grafická přejímka, žádné porušení ochrany native-v3/4188. Společnou Game/UI typovou kontrolu provádí jiný vlastník nad kopiemi těchto hashů.

Vlastní pomocné CPU procesy skončily. Po commitu pouze tohoto předání se uvolní combined-preview rezervace; přesný commit/release potvrdí zpráva rootovi. Foreign kombinace se necommitovala jako čistá migrace. Další krok: root posoudí oba kandidáty, jejich přesné diffy a společnou pipeline, teprve potom rozhodne o autorizované integraci.
