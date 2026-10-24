# V18: skutečné startup etapy a vybraný render — výzkum před implementací

Implementuje pouze startup část schváleného source15-blocking-costs zadání. Doložené zdroje: Game.prepareLightingVariants → prepareLightVariants, původní startStage/saveStage/measure a V17 RoutineCallProfile. lighting-prewarm.ts neexistuje. V17 donor36/37646a00 i jeho61seal, produktové zdroje, native39 a staré actual raw zůstanou byteexact.

Původní options.render zahrnuje startup beginFrame a skutečný prelude/Scene.render; endFrame a původní scopes/fences přicházejí mimo tento synchronní span. Async settlement není GPU čas. Source15 guest recovery má High day-1-on11.4725s, jeden render8.5947s bez restartu a bez souběžného CLI. Vnitřní příčina není změřená.

Varianty: wrapper apply/setStage zná aplikaci i opakované restarty, ale ne přesnou hranici etapy před dalším host taskem. Samotné Scene observers/SceneInstrumentation nemají pass/stage ani celý prelude. Zvolený exact QA transform Game zaregistruje tentýž původní options objekt; transform light-preparation přidá pasivní záznam původních časů startStage/saveStage/measure a výsledku finish. Nový modul používá nižší RoutineCallProfile, protože starý captureRoutineCost vyžaduje ready a přesně8frames. Původní8routine/core moduly zůstanou beze změny.

Uzavřený default-off enum null/first-medium-vehicle-0/first-low-day-1-on/first-high-day-1-on je canonical build vstup. Max16passes/304stages/8původníchrenderů/256KiB. Vybraná etapa může mít méně než8renderů a skončit platně. Časové průniky s původními scope/fence nejsou ownership. Žádný nový render/readiness/GPU/await/timer/scheduler ani změna30/90budgetu, cache či vzhledu. Boundary čas použije existující options.now odečty; samotné8routine měření používá původní diagnostické performance.now. Instrumentace přidává observer/JIT overhead a může ovlivnit instrumentovaný timeout.

Lifecycle: vlastní Game/Scene/engine/generace/abort a WeakMap options association, original return/Promise/falsy throw zachované. Reentry/foreign drift/dispose/capy jsou partial evidence, nikoli product chyba. Prototype hooks/phase observers existují jen ve vybrané etapě, core měří pouze uvnitř původního options.render. Mezi jeho rendery wrappers pouze passthrough bez clocks; tato dodatečná režie je přiznaná. Cleanup obnovuje pouze vlastní descriptor a nulujeme strong resource refs. Default-off netransformuje Game/light source a nevytváří owner/hooks.

Ověření tohoto tasku bude pouze cílené lehké CPU a syntax/byte guards. Celý corpus/build/GPU až root po předání zdrojů od CAD. Žádný CPU test neprokazuje GPU výkon, obraz ani příčinu8.5947s.

## Konečný cílený checkpoint

Pack38 92577509263608ee1ec93e944119cf23a0da0a4abe52ee06b6c2dbba53a28038. Nový modul0180659e… a testdf1ec984…; původních26 donor vstupů byteexact,10 změněných kopií a2nové vstupy. Target je uložen v již canonical transforms.startupRoutines; top-level browser/sidecar hodnota se z něj odvozuje a verifyBuildContract/Seal odmítá odlišnou/deleted aktivní větev. Loader znovu sestaví a ověří oba transformované zdroje i jejich uložené bytes. Default-off source transform je skutečně byteexact. Žádné další canonical field nejsou odstraněné ani uvolněné.

Spuštěné relevantní kontroly a jejich přesné časy/TAP SHA uvádí verification.json; nejedná se o celý corpus. Nový pack obsahuje37JS syntax kontrol; oba transformed TS zdroje a UI mají samostatný parse guard. Celá helper sada nebyla spuštěna ani označena zeleně. Původní routine/core/entry moduly a všechny jejich behavior assertions jsou zachované.

Výzkum a cílený refaktor zahrnují atomickou descriptor transakci, omezení celkových RTT registrací64 i při remove/re-add, zastavení opakovaného neúspěšného diagnostic install, own/foreign cleanup, řazení a nemožnost false-complete u duplicate/reversed framů nebo přepsaných stage receptů. Vlastní helper references se při stop nulují; testy dokládají rollback/late callbacks/native frame IDs, nikoli univerzální GC nebo VRAM výsledek.

Copied-test metadata: aktuální count36→38 ve3testech a úzké reverse normalization string, nový default-null parser field ve3asserts, nový virtual import binding staré DOM fixture a2temporary paths do vlastního scope. Tyto úpravy nemění historické donory ani behavior assertions. Celý diff v helper.patch; nové kopie jsou archivované v sources/ a jsou určeny ke čtení/obnovení do depth5helperu, nikoli ke spuštění z public sources/ cesty.

Zachované development logy:9/10 a12/13 (nová receipt fixture postrádala atMs/timeOrigin a poté outcome),13/14 (původní plain-only DOM fixture měla v diagnostic režimu throw stub shaderInventory; nahrazeno skutečnou bounded pure projekcí). Žádná product/runtime oprava kvůli těmto fixture chybám. Původní13/14/16 úspěšné meziběhy jsou historické a nepočítají se navíc k41final PASS. První readonly verify runner použil38file identity na36file donor a selhalENOENT; log zachován, opraven pouze guard runner. Mezikroky nejsou tvrzené jako current-source execution checkpoint.

Finální selected guard:113 souborů před/po bezdriftu, včetně starého V17/61sealu,39native, produkčních vstupů a3actual source15 raw. Nejde o úplný loaded-module inventory. Žádné root validation/product/native/oldhelper write, build/server/GPU/install/pnpm/fullprojectTS/fullsuite/commit. Root převezme review a následný immutable build/actual startup po CAD resource předání.
