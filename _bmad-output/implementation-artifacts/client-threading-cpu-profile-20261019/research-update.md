# Rozhodovací podklady po KEY-41

Předchozígoalturn je progress, nikoli čekání: výzkum+profil integrovaný9f1127f4, actualCPU material fixcb2bed42,45hashovanýchartefaktů a skutečnýEdge. Žádnýworker zatímnení; cíl není dokončen.

## Převzaté existující stacky

Read-only agent existing_cpu_stack_audit znovu přepočetl archivMedium a F3. Nejde o nový kontrolovanýbenchmark současného buildu.

| Zdroj | Simulation mean | Environment mean | Render mean | Nested activeMeshes / mainDraw |
| --- | ---: | ---: | ---: | ---: |
| medium-cpu-profile/run/benchmark.json.gz, sourcef80f93c8 | 0,432ms | 3,601ms | 17,099ms | 4,779 / 9,997ms |
| f3-routine-profile/run-01/benchmark.json.gz, source46dab140 | 0,396ms | 2,402ms | 13,713ms | 4,304 / 9,081ms |

Engine intervaly se nesčítají s enclosingrender. Medium raw stack replay: _evaluateActiveMeshes33leaf/138inclusive; vegetation.update30inclusive, photographic-grass.update28, advancePreparation9, selectRoots5, advanceTilePreparation3, prepareTile2, advanceSimulation15, transit.update6, sampleTransit2, events.dateKey8leaf. Vzorky jsou výskyt, nikoli čas/podíl. Grass práce se objevuje i mimo přechodovébrackety během jízdy.

Pinované source-map contents grass čtyřmodulů, simulation, transit, events, vehicle-lighting, active-mesh-candidates a opaque-sort jsou byte-identické s currentcombined1fbc05af. MaterialDefines fyzickýSHA odpovídá přijatémuF3 (3cc739be…). Znamenáto relevance mechanismu, neFPSparitu mezi scénáři.

## Varianty worker experimentu

1. Persistent grass data worker: čistá placement/classifier/terrain/matrix práce + rootselection z numericcamera/frustum/quality snapshotu. GPU/mesh/fade/commit zůstává ownerthreadu. Worker musí mít boundedcache/queue, bezdetachedcachedbuffers, generation/cancel a správné přijetí předchozíselection. Chybí oddělenáwalltime placement/selection/apply/upload a transfer/stale/coverage náklady. Nominální2ms+2ms deadline není4ms ušetřených.
2. Static candidate worker: enclosingactiveMeshcost je doložený, ale Babylon uvnitřmutujeLOD/skeleton/aktivaci. Offload pouze immutablebounds/index query s konzervativním supersetem a synchronous inclusion dynamických/custommeshů; chybí isolovanáremovablecost a stale-camera bezpečnost. Vyšší správnostníriziko.
3. Whole-renderer worker: oddělíUIale zachová serialdraw a případnéworkerhitches. Mostnáhrady DOM/input/labels/network/canvaslifecycle je široký. Bez input-to-photon důkazu nedokládářešeníhlavníhoCPUlimitu.

Physicsmean~0,4ms a transit sampler malávzorková přítomnost nepodporujízačítna těchtovariantách. events.dateKey mádražšíIntl konstrukci, ale neníto důvod proworkerprojekt; dalšíeasysinglefixneníaktuálnípracovnícíl.

## Zvolený další krok

Jeden current-source production CPU capture pomocí jižověřeného SelfProfilerV2, beznovéhoobserver/meshprofilingframeworku. Rawtransitbracket vznikne z environment.startedAtMs +součtuprvníchšesti fází. Sampling může krátkéfunkce minout; outcome musí říctjakédalšíisolovanéměřenínebo workerprototyp je opodstatněný. Další přenosvšechCPUaktivitdojednohoworkeru není dokončení.

PrimárníWICGspecifikace https://wicg.github.io/js-self-profiling/ znovunačtena19.10.2026: best-effortinterval, realm-scopedframes, timeOrigin,1-basedfunctiondefinitionpositions, boundedbuffer; stop/serialization vlastnílifecycle. ExistujícíEdge155legacyDocument-Policy:js-profilingprůkaz je vlight-switch-cpu-profile; zde ověřit skutečnýconstructor+stop znovu.
