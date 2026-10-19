# Projektové hranice a kandidáti — 19. 10. 2026

Read-only client_threading_audit, frozen S = C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow/.cache/webgpu-medium-vehicle-user-build-20261019/snapshot, source65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60. Bez testů nebo změn. Nejde o externí výkonnostní důkaz.

- game.ts:2869–2875 měří v render bucketu gltfLightBudget.prepareFrame + stableLights.update + scene.render. Reportovaných ~90% tedy není čistý draw time. Ideálně odstranit zbývajících10% znamená nejvýše1,11× tento CPU callback, ne garantované FPS.
- Game/DOM: game.ts:555,670,735; pointer lock/capture/focus/bounds:1710–1778. Picking:1770–1827 kombinuje DOM souřadnice, aktuální kameru, avatary a physics LOS.
- UI drží Colyseus a input/authority buffers; authorities se aplikují před input tickem a inputy flush po kroku (ui.tsx:333–360,557–581; game.ts:2639–2680). Reconcile obnovuje Rapier a synchronně replayuje inputy (1234–1338).
- Kamera/feet/labels potřebují tutéž fyziku: game.ts:1951–2007,1918–1935; shared/simulation.ts:356–418; labels.ts:95–111,181–197,235–256.
- Render observers nejsou čistý job: cinematic.ts:447–475 čte aktuální mesh matrices/bounds v shadow listu; active-mesh-candidates.ts:67–94 již cachuje kandidáty s lifecycle invalidací.

Nejmenší čistý kandidát je cold photographic grass placement: photo-grass-placement.ts:24–132, photographic-grass.ts:442–515. Tile má169 kandidátů, max160 matic, source classifier a terrain math; žádný DOM/Rapier/Scene. Ale už existuje1536tile bounded cache, 2ms selection + 2ms tile slices, max2 dokončené cold tiles/frame a cancellation. Warm stationary test má přípravu ukončenou (tests/photo-grass.test.ts:407). Bez doložených cache misses a CPU ceny není důvod worker zapnout.

Další pořadí: grass selection (photographic-grass.ts:556–665, složitější hysterese/generace), passenger-only transit (shared/transit.ts:446–505; celé delayed vehicle poses by se rozcházely s physics přesným33ms samplerem shared/simulation.ts:478–488), sky reflection (6×32×32, již dvousekundový gate), route search (již3ms slices a live Rapier clearance, nevhodný první kandidát).

Pokud cold placement profil ukáže přínos, pilot scope: photo-grass-placement.ts, nový photo-grass-placement-worker.ts a photo-grass-placement-client.ts, photographic-grass.ts, nové worker tests a existující photo-grass tests. Jeden bounded worker, přenos matic s explicitním ownership, queue priority, generation, failover a disposal. Nikdy nepřenášet buffer současně ponechaný ve worker cache (detach). Zachovat main-thread GPU upload/frame budget, byte-identické matice a okamžik viditelného doplnění. Nečekat na worker uvnitř frame.

Nejlevnější další krok pro současný render-dominant případ: existující jemnější render profil, nikoli plošný rewrite. CPU profiler fáze se překrývají (benchmark-render-profile.ts:11–23), nelze je sečíst jako výlučné GPU časy.
