# Negativní výsledek dvouetapového authored kandidáta

Task webgpu-authored-light-candidate-20261018, owner webgpu-authored-light-candidate-01a14497-child. Pouze copied cache/handoff, frozen grass-preparation-v2 4a968ff7. Žádný native/primary/dependency/hraný build není změněný.

Kandidát obsahuje nový AuthoredLightPreparation a úzké Game zapojení pouze do low vehicle0/1. Helper vybere skutečné enabled/visible metadata-matched Mesh, deduplikuje actual material identity a vertex/layout/shadow vstupy, nepodporované instance/skinned/morph geometrie nevydává za pokryté. Zapíše jen vlastní alwaysSelect flag, obnovuje jej před další etapou a ve finally. Nevzniká geometrie, kamera, světlo, cache ani další etapa.

Povinný actual cold-boundary kontrakt NEPROŠEL. Finální run02: factory1/1 PASS, oba gameplay kontrakty FAIL (2 nové programy místo0 při car0). Low-last medium→high→low i low-first low→high→medium dokončily41etap; skutečné tři rodiny kreslí pouze ve dvou low vehicle etapách. Cap4, flag restore, camera/actor/requestedquality restore a deferred cleanup prošly před failure. Car1 má0nových programů a přesný Effect/context reuse. Car0 má2 nové Standard glass programy; outdoor PBR zůstává přesně původní. Žádný připravený Effect nebyl disposed.

Jediný whole-defines rozdíl cílových Standard car0: přibyl USESPHERICALFROMREFLECTIONMAP. Při vehicle0 má hodnotu true, ale není v _keys; vehicle1 přidá další LIGHT slot a rebuild zahrne existující IBL klíč. Při návratu na0 je tak požadován nový klíč programu. Obě pořadí kvalit prokazují stejný mechanismus. Nepřidán reset _keys, cache, shader patch, další0etapa ani41stage aktivace.

Run01 je zachován: low-last již stejná2nová; low-first vykázal3 kvůli chybějícímu skutečnému C5 updatePreloadVisuals ve fixture. Run02 používá i tuto devátou skutečnou Game metodu; dodatečný image-processing rozdíl zmizel. Tři image-processing programy z run01 nejsou tvrzením o produkční chybě. Původní snapshots a logy zůstaly, včetně prvního neúspěšného guarded editačního příkazu před zápisem Game.

Tento kandidát NENÍ připravený k integraci/GPU. Další unit lifecycle a legacy dependency-wiring sada nebyla rozšiřována po rozhodujícím selhání; tři existující test soubory jsou pouze nezměněné kopie. Nepřidávám kladné coverage tvrzení k neprovedeným testům. Root rozhodne o novém přesném rozsahu podle negativního důkazu.

IO/NullEngine omezení z původního proofu trvají: skutečné recipes, DynamicTexture/Cinematic metadata a GLSL frontend; syntetické pixely, free-space camera collision adapter a nesouvisející presentation seams nejsou WGSL/GPU/pixelový důkaz. Test skončí na prvním porušení, takže následný warm replay v těchto cases nebyl dokončen. Žádný fullTS/build/fullsuite/GPU/server/install/commit. Vlastní procesy ukončené, předání a release.
