# Předání: webgpu-avatar-day-view-proof-20261018

- Vlastník `webgpu-avatar-day-view-01a14497`, příjemce root; WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `cb458a7`.
- Dokončený bounded CPU proof, žádná runtime implementace nebo commit. Zápisy pouze tento handoff a `.cache/webgpu-migration-checks/avatar-day-view-proof-20261018/`. Frozen V4, native/main, QA dependencies a hrané buildy beze změny; bez dalšího BMAD workflow.
- Vstup V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`, frozen opravené core/loaders z QA manifestu `1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac`. Přímé readonly imports a AST skutečných Game/controller metod, navázané na původní avatar-day proof; žádná velká kopie projektu/GLB.

## Výsledek a minimální kandidát

Sedm konfigurací: Alex, Robin, Eli, Sam, Mia, Niki a Alex s brýlemi+vousy. Skutečné authored geometry, skinning, regular instances, hair alpha cesty, garments a ON torch prop. OFF/ON porovnány whole Day1, combined narrow, FOV-only, far-only a zaznamenaná B6 reference. **119 skutečných captures,70 porovnání plných defines a Effect identity PASS.** OFF12–14drawn částí, ON14–16.

Pro všechny spawn view varianty skutečné `getPositionData(true,true)` a projekce do stejných camera matrices prokazují0clipped/nonfinite/behind vertices a0clipped konzervativních bounding corners. ON13 896–18 305vrcholů na konfiguraci,3–4skinned meshes. Žádný aktivní morph target v těchto presets; žádná přejímka všech animací. Authored skin/garment conservative bounds nejsou nahrazené bind-pose bounds.

**Far-only je nejmenší geometricky platná varianta:** pouze dočasné maxZ přibližně10.62–10.65m, ostatní camera pose/projection inputs včetně FOV0.85/minZ0.08 beze změny. Používá skutečnou Game default distance8/pitch0.28 cestu; collision IO je výslovně no-obstacle. Combined narrow přidává source-derived target a FOV0.418–0.436. FOV-only stále vykreslí zarovnaný vzdálený world witness; far-only i combined jej vyřadí. Není prokázaná úspora FPS/startup ani vítězství far-only proti combined v celé scéně.

**Shadow limit potvrzen:** v každém ON případě reprezentativní world TreeWind/Fresh wrapper mesh není v main draw, ale je skutečně vykreslen do torch shadow map; první narrow ON vytvoří nový base Effect ve shadow pass i depth Effect. Tento mechanismus nebyl vypnut ani zakryt whole prewarmem. Proof proto neslibuje pouze avatarové kompilace nebo odstranění světové práce.

B6 comparator má stejné main defines/identity a draw submeshes, ale234–237vrcholů bot/podrážek leží mimo jeho zaznamenaný záběr. Nepoužívá se jako důkaz plného pixel coverage. Celého avatara dokazují vlastní projekční kontroly spawn variant; žádný produkční B6 záběr se neupravuje.

## Výzkum a refaktoring

`analysis.md` obsahuje source chain a porovnání perspective frustum, masks, scissor, forceCompilation a orthographic. Vybrána pouze manipulace původní perspektivní kamerou; žádný nový objekt/pass, layer mask, teleport nebo cached variant map. `avatarEnvelope` sdílí výpočet skutečných bounds, `withNarrow` owns změny/restore, `projectionCoverage` používá pinned CPU skeleton/morph API. Main draws se zachycují až z native per-pass batch po renderu; shadow draws skutečným ShadowGenerator observable.

Source envelope vychází z původních bounds těla(±0.85,−0.15..2.2), garments(±0.9,−0.15..2.2) a skutečných vlasů/doplňků. Radius má původní near-plane reserve, angular fit2pixel reserve podle aktuálního viewportu; žádné ručně zvolené world body pointy. Původní camera position se nemění. Žádný stav LOD/animation/history se při narrow nepřepočítává podle syntetického pohledu.

## Ověření, cleanup a limity

- `TSX_DISABLE_CACHE=1 node --import tsx probe.ts --all`, finální `probe-verified.log`:exit0, všech7konfigurací PASS, UTC18.10.02:54:21.165–02:54:23.723; celý příkaz8.86s včetně importů. `node summarize.mjs` PASS, `summary.json/log`.
- Předchozí Alex a preset běhy `probe-alex-initial.log`, `probe-presets-01.log`, `probe-presets-final.log` jsou také PASS pro svůj tehdejší scope; finální běh navíc obsahuje FOV/far ablation a finite clip checks. `report-before-view-ablation.json` zachovává starší rozsah.
- RawTexture IO adapter z předchozího schváleného proofu zachovává původní bytes/dimensions/format/type/sampling a pouze signalizuje dokončení NullEngine uploadu. Každé volání zaznamenané, refs při cleanup0. URL textury native NullEngine dummy; žádný material/Effect readiness override.
- Po každé narrow variantě i výslovně vložené výjimce obnovena camera position/rotation/quaternion/up/FOV/near/far/mode/FOVmode, původní view/projection a pass. Deep-equal CameraFollow fields, actor, LocalAvatarPresentation state, rig transforms, animation phase/gait. Baseline požadovaný flashlight/time/ready nezměněné.
- Všechny observers, wrappery, světla, rig/pool, scény a enginy uvolněné; žádný proces/port nezůstává. Žádné GPU/fullworld/build/fullsuite/integration/install/pnpm ani typecheck tohoto cache-only probe.
- NullEngine GLSL/PCF fallback není WGSL/GPU descriptor, obrazová ani výkonová přejímka. Sky/IBL/collision jsou explicitní IO stubs,2world witnesses nejsou produkční svět. Celestial shadows jsou pro dané cloud0.96 vypnuté. Velké terrain meshes mohou narrow frustum stále protínat. Runtime postava se neportuje; B6 srovnání přesouvá jen vlastněný fixture rig.

## Předání

`manifest.json` zahrnuje source/dependency/probe/report/summary/log/handoff SHA a kontroluje přesný frozen V4 a QA helper/class identity. Root dostane SHA zvlášť. Navazující GPU A/B a případnou runtime volbu rozhodne root; měřit celý startup i Day/B6/F bez oslabení readiness/deadline. Po předání release stejného ownera, čas v registru; bez commitu a bez tvrzení Done migrace.
