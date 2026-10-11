# Enabled mesh candidates: navazující CPU optimalizace po M

**Změna je odvozená ze skutečného produkčního profilu M, ale její GPU/FPS přínos zatím není změřený.** Hlavní další přejímka míří na uživatelovu GeForce GTX 1060. Intel výsledek zůstává samostatným podkladem pro lokalizaci práce CPU.

## Podklad a hranice srovnání

[První denní M interval](evidence/pilot-20261011-m/candidate-1-day-a.json) zaznamenal přibližně 5,27 ms aktivace meshů, 5,87 ms hlavní draw fáze, 1,31 ms render targets a 12,56 ms celé render položky. Intervaly mají různé hranice a případné překryvy; nesčítají se jako úplný frame. Celý výsledek byl 34,7 FPS, p95 33 ms, p99 36,8 ms, poslední GPU vzorek 23,80 ms na Intel UHD 630.

Měl 3319 registrovaných meshů. Koncový geometry inventory obsahuje 1235 efektivně disabled objektů, 240 enabled-but-invisible objektů a 1840 enabled-visible objektů. Mezi disabled jsou 588 travních dlaždic a 562 architektonických detailů. To dokládá zbytečně předávané kandidáty, nikoli podíl těchto objektů na celých 5,27 ms.

První M se nesmí označit za izolované A/B proti L2. [Formální L2 1a](evidence/pilot-20261011-m/baseline-1-day-a.json), 1b a 1c mají **363 draw calls / 813 592 trojúhelníků**; 368/822 284 pochází z vyloučeného discovery. M1a má 376/845 292, ale také **6 ambientních cestujících proti 0**. Jejich šest konkrétních NPC rootů přidává 27 enabled-visible meshů / 33 780 potenciálních trojúhelníků; tento součet nelze přímo zaměnit za skutečné camera+shadow draw rozdíly. Počet shadow casterů je 176 místo 157, kandidátů 288 místo 265. Stromové LOD 1/5/103, 287 809 aktivních stromových trojúhelníků a 229 načtených tree meshů jsou shodné. M1b má 5 cestujících. `Game.trafficInstant()` používá skutečný čas nezávisle na astronomickém `timeOverride`, takže pevné denní osvětlení nezafixovalo provoz.

## Primární API a implementace

Byla přečtena skutečně instalovaná implementace Babylon.js 9.30.0: `Scene._evaluateActiveMeshes`, `Scene.addMesh/removeMesh`, `Node.isEnabled/setEnabled/_syncParentEnabledState` a nativní instanční `_preActivate/_activate/getLOD`. Nativní evaluace přeskočí disabled mesh, ale teprve po návštěvě kandidáta a aktualizaci interního LOD záznamu. Veřejné `onEffectiveEnabledStateChangedObservable` zahrnuje změny vlastního enabled příznaku, rodiče i reparent.

`client/active-mesh-candidates.ts` vrací cache pouze efektivně enabled meshů v **původním pořadí Scene**. Neprovádí vlastní frustum, vzdálenost, readiness, LOD ani visibility test. Všech 240 enabled-but-invisible source meshů z referenčního inventory zůstává kandidáty; nativní instancing, jeho zdrojové master meshe i LOD vybírá stále Babylon. Renderované vrcholy, kroky schodů, plochy, materiály a kolize se nemění.

Cache se obnoví při změně efektivního enabled stavu, přidání a odstranění meshů. Babylon oznamuje přidání asynchronně, proto provider zároveň kontroluje délku zdrojového pole a nové meshe zaregistruje i při vytvoření a renderu v témže JS úkolu. Smazání a náhrada při stejné délce pole jsou kryté synchronním removal eventem. Odložený added event už odstraněného objektu je ignorovaný.

Installer dostává známý default provider zachycený hned po `new Scene`. Pokud už provider nahradil jiný vlastník nebo nevrací celé původní pole, cache se nepoužije. Dispose odpojí pozorovatele a obnoví původní provider pouze pokud stále vlastní aktuální callback. Později instalovanou octree nebo cizí provider nepřepíše. Vyhrazená pracovní pole se používají znovu a odstraněné objekty nevisí v mapě pozorovatelů.

Globální prostorová octree není součástí změny: editovatelné building roots, native source masters, noví hráči a streamované stromy potřebují jiný smluvní životní cyklus prostorových bounds. Tento krok se omezuje na konzervativní eliminaci práce, kterou už nativní Scene stejně odmítne. Aplikační render pipeline mění enabled před `scene.render`; vlastní callback měnící enabled u jiných meshů uprostřed nativní evaluace nebyl součástí tohoto projektu ani tohoto kontraktu.

## Ověření

`pnpm exec tsx --test --test-concurrency=1 tests/active-mesh-candidates.test.ts tests/opaque-sort.test.ts`: **8/8 PASS**, exit 0. Čtyři nové regrese pokrývají:

- vlastní a zděděný enabled stav, reparent, původní pořadí a neviditelné masters;
- new/remove/stream náhradu v témže JS úkolu, odložené eventy a úklid;
- předchozího i pozdějšího vlastníka candidate provideru;
- skutečný native render dispatch a explicitní shadow dispatch před/po změně: regular/thin instances, native LOD, záporný determinant, disabled source master, přechod parent enabled, pohyb instance a otočení kamery, s přesnou shodou draw pořadí, active meshů a odeslaných indexů.

Další čtyři stávající regrese chrání native LOD a opaque/alpha ordering. **`pnpm exec tsc --noEmit --pretty false`: PASS, exit 0.** [Testový log](evidence/active-mesh-candidates-20261011/targeted-tests.log), [TypeScript log](evidence/active-mesh-candidates-20261011/typescript.log). NullEngine ověřuje smlouvu dispatch, **není GPU důkaz**. Koordinovaná produkční přejímka se doplní před uzavřením navazujícího checkpointu. Původní M snapshot `c88f33c4baa80a1d6322b0551c555cb76b4912a4e5995f6d91af2ea06a188ea9` zůstává neměnný a tuto novou cache neobsahuje.
