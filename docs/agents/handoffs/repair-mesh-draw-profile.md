# Předání: repair-mesh-draw-profile

- Vlastník: `repairs-01a13624-draw` (`/root/repair_reporting`); příjemce: koordinátor `repairs-01a13624-root`.
- Pracovní kopie/větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí commit `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: zapojitelný bounded CPU profil konkrétních render mesh/material/source skupin, bezpečné párování skutečných Babylon událostí a rozšířený on-demand inventář včetně reálných světelných capů. Modul je výchozím stavem neaktivní; automatický periodický/action scheduler a zápis do recorderu integruje root. Nejde o naměřené zlepšení FPS ani dokončení KEY-5.
- Změněné soubory: `client/mesh-draw-profile.ts`, `tests/mesh-draw-profile.test.ts`, `client/render-cost.ts`, `tests/render-cost.test.ts`, tento handoff.
- Vlastnictví: první kroky byly pouze read-only. Root potvrdil zmrazení wave2 `c3c8164a48f1ac9e02fbf57c4d46c6b67fdfd5ed9c71e817d76d125efdb1a3de` a teprve potom následoval clean claim a zápisy. Žádný dirty WIP nebyl převzat. Game/recorder, baseline, izolovaná přejímka ani její assety se neměnily.

## Profil: API a plán zapojení

```ts
const drawProfile = new MeshDrawProfile(scene, optionalMonotonicClock);
drawProfile.beginFrame(null); // idle, žádné per-mesh čtení času
drawProfile.beginFrame("periodic"); // nebo např. action:flashlight / quality-change
try {
  scene.render();
} finally {
  const sample = drawProfile.endFrame(); // snapshot nebo null
  // Root zapíše samostatný malý mesh-draw-sample event, pokud sample existuje.
}
drawProfile.dispose();
```

- Root má plánovat periodický a action-trigger vzorek **automaticky**. Žádný ruční ovladač uživatele není potřeba. Zvolená frekvence/režie patří do produkční přejímky; samostatný modul si nezakládá timer ani nespouští render. `MESH_DRAW_PROFILE_SCOPE` se má logovat jednou při startu.
- `MeshDrawSnapshot`: `reason`, `mainDrawCpuMs`, `completed { calls,cpuMs,preparationMs,bindDrawMs }`, `counts`, `topMeshes`, `topMaterials`, `topSources`, `omitted` pro každý z těchto tří rozkladů.
- Zachytí pouze Scene main draw phase a její renderPassId. `beforeRender → beforeBind` je material readiness/effect/state příprava; `beforeBind → afterRender` je buffer/material binding, render submission, unbind a after-mesh stages. Výsledek je **CPU wall čas, nikoli GPU**, může zahrnovat čekání ovladače. Occlusion/instance-list/geometry kontroly před beforeRender nejsou pokryté.
- Dílčí rozklady mesh/material/source jsou alternativní pohledy na stejné dokončené intervaly, nesmějí se sčítat mezi sebou. Rozdíl mainDrawCpuMs vs completed zahrnuje renderer práci mimo zachycené intervaly, vynechané pokusy a vlastní observer/profiling režii; není to samostatný GPU údaj.
- Efektivní materiál identifikuje veřejné `Material.onBindObservable`, tedy i skutečný child materiál MultiMaterial. Pokud není pozorován, zůstává `unobserved effective material` a `unknownMaterials`; profil si nevymyslí efektivní shader/material podle kontejneru.
- Native instanced dávka patří skutečnému render source Mesh (včetně příslušného LOD). Počet callback řetězců **není** počet GL draw calls, unikátních submeshů nebo instancí. Samostatný shadow/target renderPass se nepřičítá; pozorovaný přechod do jiného průchodu zahodí rozdělaný main interval.

## Párování, meze a lifecycle

- Babylon9.30 `Mesh.render` skutečně obsahuje early returns mezi beforeRender a beforeBind/afterRender. Žádné časování proto neuzavírá až „nějaký další after“. Rozdělaný pokus při dalším beforeRender se zahodí a jeho mesh je pro danou draw fázi označen jako nejednoznačný. Same-mesh/nested případ se záměrně podvzorkuje, místo aby vytvořil falešný dlouhý interval. Hranice další main fáze/snímku obnoví čisté párování.
- Počty `abandoned`, `ambiguousSkipped`, `unmatchedBind`, `unmatchedAfter`, `incompletePhases`, `unknownMaterials` a `budgetSkipped` vyjadřují nepokrytou práci. Neúplný nebo vyhozený pokus nemá vymyšlený CPU čas. Zejména studený shader, který vede k early return, nemusí být přičten mesh profilu; jeho shader/effect informace poskytuje samostatný RenderIncidentProfile.
- Top8 pro každý rozklad, nejvýše2048 časovaných pokusů a2048 identit na rozklad za vzorek. Limit skupin je stejný jako limit pokusů, aby trvalé pořadí draw neopomíjelo všechny drahé transparentní meshe za prvních256 identit. `omitted` zachovává přesný změřený počet/CPU mimo top8; nad limit pokusů se čas neměří a jde do budgetSkipped.
- Idle snímek nevytváří časovací záznamy ani nečte per-mesh hodiny. Vlastněné observable callbacks mají pouze kontrolu aktivního vzorku; jejich nenulovou dispatch režii musí ověřit GPU přejímka. Na začátku vzorkovaného snímku se projdou nynější scene members, aby se zachytily same-task additions před odloženou Babylon notifikací. Zbytek životního cyklu je inkrementální. Úplně nový mesh/materiál vzniklý až během renderu před odloženou notifikací může zůstat nepozorovaný; scope tuto mez uvádí.
- Dispose je idempotentní, odpojuje scene/mesh/material observers a čistí rozdělané intervaly/mapy. Odebrání prostředku v průběhu pokusu jej nemůže později vykázat jako hotový. Neprovádí se wrapper engine/metod ani polling privátního draw stavu, vyhodnocení readiness nebo vynucené matice.

## Rozšířený inventář a světelné capy

`captureRenderCostInventory(scene, { detailLimit?: number })` zachovává původní pole; defaultní detailLimit512, povolený rozsah0–2048. Souhrnné počty se detailovým limitem nekrátí.

- `active`: membership skutečného posledního `scene.getActiveMeshes()` seznamu, frozen world matrices, potenciální submeshe, regular/thin instance stavy, skinning/morph/nativeLOD a bounded konkrétní mesh identity. Rozlišuje se enabled geometrie v celé scéně od aktuálního cached active seznamu. `detailsOmitted` ukazuje omezení detailů.
- `maxSimultaneousLights`: **aktuální** histogram/min/max, počty materiálů s capem a bez něj, přes registry a nalezená přiřazení; zahrnuje také vypnuté geometrie. Neodvozuje se z defaultního cap4 nebo synthetic fixture.
- `materialLightGroups`: deklarovaný materiálový source/child, jeho cap, počty enabled/active přiřazených meshů a min/max/histogram **skutečně enabled** položek v `mesh.lightSources`. Tato čísla nejsou počet fragmentově počítaných světel, shaderů ani material-bind/draw calls. `materialLightGroupsOmitted` omezuje detail, zatímco cap histogram je úplný.
- Projektový nový startup důkaz byl ověřen přímo v `@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js`: loader při dokončení nastavuje u scene materiálů `maxSimultaneousLights = Math.max(current, scene.lights.length)`. Inventář umožní jeho dopad změřit ve skutečné produkci; runtime loader/material fix vlastní jiný agent.
- Inventář nevolá readiness, computeWorldMatrix ani `SubMesh.getMaterial()`. Poslední metoda v9.30 může měnit draw cache, proto MultiMaterial child přiřazení čte přes subMaterials/materialIndex přímo. Jde o **declared inventory**, nikoli o potvrzení skutečně použitého nativeLOD/renderPass efektivního materiálu; ten zaznamenává profil.
- `triangleEstimateScope` vysvětluje zachované legacy hodnoty indices/3 jako odhad, zejména u smíšených topologií. Nové active detaily obsahují raw indices/potentialSubmeshes, nikoli další nepodložený exact triangle-count claim.
- `renderMeshIdentity` je sdílený malý helper pro bounded technický název a sourcePack/vegetation děděné po nejvýše8 rodičích. Nečte transformace ani celý metadata/profile objekt.
- Full inventář je **on-demand benchmark/download údaj**. Nekopírovat jeho stovky detailů do běžného frame-window/diagnostic eventu s32KiB limitem; do průběžného kontextu vybrat cap histogram/počty a krátké top8 profileru.

## Ověření a snapshot

- 13. 10. 2026 22:05:43 Praha: `pnpm exec tsx --test tests/render-cost.test.ts tests/mesh-draw-profile.test.ts tests/render-maintenance.test.ts` **14/14 PASS**, exit0 (6 profil,3 nový inventář,5 dosavadní render-maintenance). První samostatný profiler běh6/6 také prošel.
- Profilové regrese: přesné řízené CPU intervaly a skutečná material onBind identita, idle0 clock reads, early return/same-mesh/nested párování, foreign pass, přerušená fáze/odstranění, top8 a2048 rozpočet se zachovanými omitted součty, skutečný Babylon Mesh.render nad MultiMaterial i readiness-false return, same-task additions, unknown material a opakovaný dispose.
- Inventář: skutečný vykreslený NullEngine active seznam vs enabled/offscreen/disabled geometrie, instanced source/thin/frozen/submesh detaily; následně readiness/world/getMaterial metody nahrazeny throwing spies a inventář přesto prošel. Cap43 při jediném enabled světle, cap změna na4 s nezměněným starým snapshotem, MultiMaterial child přiřazení, bounded výstup a source dědění ověřeny. **NullEngine testy nejsou GPU/latency/FPS důkaz.**
- Narrow tsc: `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --resolveJsonModule --types node tests/render-cost.test.ts tests/mesh-draw-profile.test.ts` **PASS**, exit0, proces skončil před zahájením root GPU okna. Všechny nové runtime/test soubory prošly Prettier. Cílený diff check exit0; package.json/lockfile status prázdný.
- SHA256 finálního obsahu:
  - `client/mesh-draw-profile.ts`: `e6b498800f387842d08b8166ac1a874f54089bda15e4202cfb24f2c1318aa035`
  - `client/render-cost.ts`: `8c98a6c86a4da09b07b79c0f059f17e099f2747b11e1154d93892ce2016cc021`
  - `tests/mesh-draw-profile.test.ts`: `a461719f8b96e8bd05ab1d73c600394fd0eb7fd4cd6f2b3c2de18088e78e5d1d`
  - `tests/render-cost.test.ts`: `67ddd26241f73949d15e29998fd879e860d5414a144aa2fdaabe5b19c6361fe8`
  - nezměněná ověřovací regrese `tests/render-maintenance.test.ts`: `77eb235a45547dff930889cbe76b949ab4baf84a0655f00e8b11d6d1fa4fc4d6`
- Refaktoring: společná technical identity, jedna bounded agregace pro každou dimenzi a jednotný lifecycle observerů; žádná per-frame full-scene inventura v idle cestě, žádné nerozlišené převzetí MultiMaterial identity, opakovaná mesh identity v témže sample se bere z agregace.
- Procesy/zdroje: všechny vlastní CPU testy a tsc dokončené před root GPU oknem. Od jeho zahájení jen čtení/diff/SHA a tento předávací záznam. Žádný vlastní port, GPU, render benchmark, build, fullsuite nebo dlouhožijící proces.
- Rezervace: handoff dokončen13.10.2026 22:09 Praha; následuje `release --task repair-mesh-draw-profile --owner repairs-01a13624-draw`. Root převezme soubory po wave2 referenční kontrole a zapojí automatické vzorkování do další vlny. Praktickou režii a konkrétní produkční source viníky musí potvrdit nová měření; tento handoff je neprohlašuje za známé.
