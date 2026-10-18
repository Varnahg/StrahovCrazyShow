# Předání: webgpu-avatar-day-view-proof-20261018

- Vlastník `webgpu-avatar-day-view-01a14497`, příjemce root; WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `cb458a7`.
- Dokončený bounded CPU proof V2 po opravě P2 review, žádná runtime implementace nebo commit. Zápisy pouze tento handoff a `.cache/webgpu-migration-checks/avatar-day-view-proof-20261018/`. Frozen V4, native/main, QA dependencies a hrané buildy beze změny; bez dalšího BMAD workflow.
- Vstup V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`, frozen opravené core/loaders z QA manifestu `1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac`. Přímé readonly imports a AST skutečných Game/controller metod, navázané na původní avatar-day proof; žádná velká kopie projektu/GLB.

## Výsledek a minimální kandidát

Sedm konfigurací: Alex, Robin, Eli, Sam, Mia, Niki a Alex s brýlemi+vousy. Skutečné authored geometry, skinning, regular instances, hair alpha cesty, garments a ON torch prop. OFF/ON porovnány whole Day1, combined narrow, FOV-only, far-only a zaznamenaná B6 reference. **119 skutečných captures,70 porovnání plných defines a Effect identity PASS.** OFF12–14drawn částí, ON14–16.

Pro všechny spawn view varianty skutečné `getPositionData(true,true)` a projekce do stejných camera matrices prokazují0clipped/nonfinite/behind vertices a0clipped konzervativních bounding corners. ON13 896–18 305vrcholů na konfiguraci,3–4skinned meshes. Žádný aktivní morph target v těchto presets; žádná přejímka všech animací. Authored skin/garment conservative bounds nejsou nahrazené bind-pose bounds.

**Far-only V2 je nejmenší geometricky platná varianta:** pouze dočasné maxZ 10.06794–10.07243 m místo 1100 m. Hranice je maximum hloubky všech konzervativních bounding corners v původním nezměněném view + původní minZ 0.08 m. Větev nevolá fitAvatar/setTarget ani jiné pose/FOV mutátory. Ostatní camera inputs včetně FOV 0.85, minZ a celého target stavu zůstávají přesně stejné. Používá skutečnou Game default distance 8/pitch 0.28 cestu; collision IO je výslovně no-obstacle. Combined narrow přidává source-derived target a FOV 0.418–0.436. FOV-only stále vykreslí zarovnaný vzdálený world witness; far-only i combined jej vyřadí. Není prokázaná úspora FPS/startup ani vítězství far-only proti combined v celé scéně.

**Shadow limit potvrzen:** v každém ON případě reprezentativní world TreeWind/Fresh wrapper mesh není v main draw, ale je skutečně vykreslen do torch shadow map; první narrow ON vytvoří nový base Effect ve shadow pass i depth Effect. Tento mechanismus nebyl vypnut ani zakryt whole prewarmem. Proof proto neslibuje pouze avatarové kompilace nebo odstranění světové práce.

B6 comparator má stejné main defines/identity a draw submeshes, ale v každé konfiguraci leží mimo záběr 234 vrcholů bot/podrážek. Eli má navíc 3 vrcholy trouser-waist, celkem 237. Nepoužívá se jako důkaz plného pixel coverage. Celého avatara dokazují vlastní projekční kontroly spawn variant; žádný produkční B6 záběr se neupravuje.

## Oprava P2 review

V1 chybně považovala ekvivalentní view matrix za úplný restore: `TargetCamera.setTarget` mění také `_initialFocalDistance` a `_referencePoint`, z nichž se dále odvozuje `getTarget`. Původní far-only navíc nejprve volala fitAvatar. Archiv `review-v1/` zachovává přesný původní probe/report/logy/manifest a handoff; jeho manifest SHA `ef1e469b5198d9af54766785cd4533ef6223bdfe3b999f86dfa13e5c97162053` není aktuální důkaz V2.

Přidaná kontrola skutečně nejprve selhala na focal distance 8.717856710818625 proti 8.586873523819381. V2 odděluje čistou far-only větev a pro FOV/combined obnovuje i celý target stav, roll cache a původního vlastníka quaternionu. Kontroluje `getTarget`, focal distance/reference point, pose, view/projection i actor/history přes strict/deep equality; žádná restore tolerance nebyla přidána. Celkem **77 přesných restore kontrol včetně 21 výjimek**. Každá výjimka se vrátí se stejnou původní Error identitou.

## Výzkum a refaktoring

`analysis.md` obsahuje source chain a porovnání perspective frustum, masks, scissor, forceCompilation a orthographic. Vybrána pouze manipulace původní perspektivní kamerou; žádný nový objekt/pass, layer mask, teleport nebo cached variant map. `avatarEnvelope` sdílí výpočet skutečných bounds, `withNarrow` owns změny/restore, `projectionCoverage` používá pinned CPU skeleton/morph API. Main draws se zachycují až z native per-pass batch po renderu; shadow draws skutečným ShadowGenerator observable.

Source envelope vychází z původních bounds těla(±0.85,−0.15..2.2), garments(±0.9,−0.15..2.2) a skutečných vlasů/doplňků. Radius má původní near-plane reserve, angular fit2pixel reserve podle aktuálního viewportu; žádné ručně zvolené world body pointy. Původní camera position se nemění. Žádný stav LOD/animation/history se při narrow nepřepočítává podle syntetického pohledu.

## Ověření, cleanup a limity

- `TSX_DISABLE_CACHE=1 node --import tsx probe.ts --all`, finální V2 `review-v2-green.log`: exit 0, všech 7 konfigurací PASS, UTC 18.10.03:10:37.700–03:10:40.241; celý příkaz 8.754 s včetně importů. `node summarize.mjs` ověřuje také všech 77 přesných restore záznamů a 21 exception paths; `summary.json/log`.
- RED `review-v2-target-red.log` + `review-v2-target-red-case.json`: exit 1 na skutečné chybě focal distance, UTC 03:09:02.112–03:09:02.648. V1 Alex/preset/final logy zůstávají historické PASS pouze svého tehdejšího omezeného scope, nikoli úplného restore kontraktu. `review-v1/preservation.json` a V2 freeze ověřují jejich archivní SHA.
- RawTexture IO adapter z předchozího schváleného proofu zachovává původní bytes/dimensions/format/type/sampling a pouze signalizuje dokončení NullEngine uploadu. Každé volání zaznamenané, refs při cleanup0. URL textury native NullEngine dummy; žádný material/Effect readiness override.
- Po každé narrow variantě i výslovně vložené výjimce ve všech třech režimech obnovena camera position/rotation/quaternion/up/FOV/near/far/mode/FOVmode, target/focal/reference/roll state, původní view/projection a pass. Deep-equal CameraFollow fields, actor, LocalAvatarPresentation state, rig transforms, animation phase/gait. Baseline požadovaný flashlight/time/ready nezměněné. Pinned `targetCamera.pure.js` řádky 262–285 a 454–483 vysvětlují nutný úplný restore; jeho SHA je ve V2 manifestu.
- Všechny observers, wrappery, světla, rig/pool, scény a enginy uvolněné; žádný proces/port nezůstává. Žádné GPU/fullworld/build/fullsuite/integration/install/pnpm ani typecheck tohoto cache-only probe.
- NullEngine GLSL/PCF fallback není WGSL/GPU descriptor, obrazová ani výkonová přejímka. Sky/IBL/collision jsou explicitní IO stubs,2world witnesses nejsou produkční svět. Celestial shadows jsou pro dané cloud0.96 vypnuté. Velké terrain meshes mohou narrow frustum stále protínat. Runtime postava se neportuje; B6 srovnání přesouvá jen vlastněný fixture rig.

## Předání

`manifest-v2.json` a byte-identický aktuální `manifest.json` zahrnují source/dependency/probe/report/summary/log/handoff SHA, prověřený archiv V1 a přesný frozen V4/QA helper/class identity. Root dostane SHA zvlášť. Plný Day1 view připravuje i světové Sun + POINT + HEMI varianty použitelné za úsvitu/soumraku, GoldenHour, některých lunárních podmínek a při pohledu ven z B6. Avatar proof neprokazuje jejich zachování. `analysis.md` obsahuje primární enable/cap/shadow podmínky a minimální A/B: první GoldenHour OFF → F ON a samostatný studený B6 approach/entry/F/outward/exit. Zahřátá posloupnost dalších předvoleb není cold lunar důkaz. Runtime kandidát nevznikl; případný GPU trial rozhoduje root a nesmí oslabit readiness/deadline. Po předání release stejného ownera, čas v registru; bez commitu a bez tvrzení Done migrace.
