# KEY-16: B6, schody a vazby rendereru — výzkum 14. 10. 2026

Výzkum před opravou podle výslovného postupu v `AGENTS.md`. Vlastník `research-01a13624-b6-20261014`, koordinátor `/root`. Tento dokument není implementace ani GPU přejímka. Runtime a hraný snapshot nebyly změněny.

## Závěr a doporučené rozhodnutí

**Byl reprodukován konkrétní zdroj nadbytečné práce bez změny světelných efektů i bez připojení/odpojení jediného meshe:** chůze v B6 vynucuje přepočet společného rodiče modelů pouze kvůli převodu pozice interiérového světla. Tím zneplatní transformace potomků. Svítilna pak u každého nesynchronizovaného potomka volá `computeWorldMatrix(true)`. Babylon při tom vynuceně přepočítá také rodiče, takže další potomek znovu zneplatní již zpracované sourozence. Totéž se opakuje v seznamu objektů pro stíny. Nepotřebuje to změnu patra ani shaderu.

Na skutečných `B6RealityController` + `VehicleLighting` + Babylon 9.30.0: pohyb hráče o 0,4 m, nezměněný pivot a stejné členství scény způsobily jeden přepočet pivotu, potom 82 přepočtů stejného pivotu při výběru objektů pro svítilnu a dalších 52 v jejím seznamu stínů. Kontrolní čtení pivotu s ověřením synchronizace tuto indukovanou práci nevyvolalo. Prosté odstranění `force` je ale nesprávné: při skutečném pohybu pivotu ve stejném render ID vrací zastaralou matici.

**Doporučení pro první samostatný opravný celek:** odstranit neodůvodněnou invalidaci přímo v čtení B6 pivotu, zachovat aktualizaci skutečně změněného pivotu a přidat regresi skutečné vazby B6 → svítilna. Druhý experiment níže ověřil přesně tuto B6-only variantu: při statické chůzi 135/134 root/child přepočtů → 0/0; při skutečném přesunu pivotu zůstává 135/134. První fix tedy neřeší obecnou invalidaci skutečně pohybovaných rodičů. Poté měřit celý produkční průchod. Rozsáhlejší přestavba viditelnosti, stínového indexu nebo sloučení geometrie není před touto opravou odůvodněná. Konkrétní implementační scope musí přidělit koordinátor.

Experiment prokazuje mechanismus a počet operací, **neprokazuje, kolik ze skutečných 6–8 FPS vysvětluje**. V logu chybějí počty přepočtů matic a samostatné časování výběru stínů. Přechodné zpomalení rendereru, CPU i GPU může mít další příčiny. KEY-16 nelze uzavřít tímto dokumentem ani jediným CPU testem.

## Identita podkladů

- Produkční uživatelský log: `.cache/playtest-repairs-validation/snapshots/wave3/.cache/game-diagnostics/07c227f8-d2f8-4011-a6f8-5d27ad0627a4.jsonl`, SHA-256 `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`.
- 1 799 záznamů, seq 0–1798 bez mezery; jeden production start, jeden ready, žádný restart. Snapshot `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`. Celé hraní v reálné noci, bez preview času; GTX 1060, CSS/interní rozlišení 2040 × 986, DPR 1,25. Ve zkoumaném incidentu high, první osoba, zapnutá svítilna.
- `client/b6-reality.ts`, `art-lighting.ts`, `vehicle-lighting.ts`, `stable-light-state.ts` a `active-mesh-candidates.ts` byly při auditu bitově stejné jako v produkčním wave3 snapshotu. Aktuální `gltf-light-budget.ts` už obsahuje předanou optimalizaci; tato optimalizace v logu wave3 ještě není.
- SHA-256 B6 `b483b6304949d5dff2ca5b60ad07547fc9023e00aca38414ffc4731b57a8de09`; VehicleLighting `7903f0be0f4b98affc599d7c9cb323581fa482b640b969d9ffc90eb433461891`; ArtLighting `39aa6772e6d398b8ef54ed8eea31fe25aa3859148d5ea9b7ccc5c3d7a09b9707`.
- Primární autorita pro engine je skutečně instalovaný `node_modules/@babylonjs/core`, verze 9.30.0, nikoliv dokumentace jiné verze. Níže uvedené řádky se vztahují k auditované kopii.

## Systémová mapa a vlastnictví

| Cesta | Skutečné chování a dopad |
| --- | --- |
| `client/game.ts:2152–2194` | Po simulaci předává nesmoothed `actor.position` architektuře a B6. `b6Reality.update` je v časové fázi **world**, nikoli artLighting. Kamera a vizuální interpolace se dopočtou později. |
| `client/b6-reality.ts:566–585` | Přepočet při pohybu alespoň 0,25 m nebo změně quality/explicitního floor. Game explicitní floor neposílá; odhaduje se `round((y-foundation-0.8)/3)`. Hodnota `lastFloor` ukládá explicitní vstup, nikoli odvozený floor. |
| `client/b6-reality.ts:604–623` | U schodiště zpřístupní sousední patra, props podle dosahu. Opaque envelope a venkovní vstup mají vlastní konzervativní pravidla, nesmějí zmizet podle patra. Skutečnou změnu viditelnosti provádí `setEnabled` a `scene.addMesh/removeMesh`. |
| `client/world-asset-identity.ts:29–40` | Připojení k editovatelnému společnému pivotu úmyslně odemkne world matrix potomka. Původní freeze při konstrukci B6 proto není záruka, že herní B6 meshe zůstávají frozen. Svévolný freeze by porušil přesun celého mapového objektu. |
| `client/b6-reality.ts:625–640` | Jediný interiérový fill se posouvá podle hráče a patra. Převod do pivotu nyní volá `Matrix.Invert(buildingRoot.computeWorldMatrix(true))` při každé aktualizaci. Stav světla se mění jen při skutečném přechodu inside/outside, ne při každém kroku či patru. |
| `client/game.ts:2381–2408` | Fáze **artLighting** zahrnuje `applyArtLighting`, modelové lampy auta, `vehicleLighting.update` a `flashlight.update`. Nelze 43 ms této fáze připsat samotnému modulu art-lighting. |
| `client/art-lighting.ts:392–423` | Nejbližší pouliční světla vybírá po 0,5 s nebo změně kapacity. Kapacita respektuje čtyři materiálové sloty a B6/svítilnu. Skutečné přepnutí světla může změnit materiálové varianty, ale v kritických schodišťových oknech se to nedělo. |
| `client/vehicle-lighting.ts:207–245` | Globální výběr objektů pro stín po 250 ms, změně počtu meshů nebo posunu světla o více než 2 m. Před prostorovým odmítnutím čte world bounds a volá `computeWorldMatrix(!isSynchronized())`. Prochází i některé později odmítnuté/disabled objekty. |
| `client/vehicle-lighting.ts:150–190` | Draw-time seznam znovu ověřuje aktuální enabled/viditelnost a frustum stínové kamery, opět s potenciálně vynucenou world matrix. Tato část je v render-target práci, ne v artLighting. |
| `client/stable-light-state.ts:142–176` | Změna světel mění revizi; změna členství meshů však také vyvolá průchod všemi scene.meshes, aniž by se revize světel změnila. Stabilní revize tedy neznamená nulovou práci. |
| `client/active-mesh-candidates.ts:188–206, 312–335` | Připojení/odpojení a změny effective-enabled zneplatní cache kandidátů. Následující rebuild projde zdrojový seznam. Časování spadá do evaluace aktivních meshů. Předvýběr statických frustum kandidátů byl ve wave3 vypnutý. |
| `client/mesh-draw-profile.ts:110–123, 156–211` | Odpojení meshe odebírá jeho tři observační callbacky, opětovné přidání je vytvoří. Nesamplované snímky nezískávají detailní per-mesh časování. |
| `client/gltf-light-budget.ts` | Ve wave3 kontroloval rozpočty každým renderem; žádné změny cap během tohoto incidentu. Již předaná novější verze omezuje stabilní průchody. Neslučovat její úsporu s novou B6 opravou při A/B. |
| `client/game.ts:2503–2518` | `render` je inkluzivní od `environmentEnded`: zahrnuje i lightOrdering a instrumentaci před `scene.render`. Main draw, render targets a active meshes nejsou další nezávislé celkové časy k sečtení s render. |

`Scene.addMesh` v Babylonu 9.30 (`scene.pure.js:2326–2343`) připojí mesh, resynchronizuje jeho světelné zdroje a odloží add observable. `removeMesh` (`:2351–2371`) vyhledá mesh, odstraní jej ze seznamu a synchronně upozorní observers. Nejde o beznákladové změny. Samy o sobě ale nejsou pro níže reprodukovanou invalidaci potřeba.

## Co skutečně říká produkční incident

Časy jsou Praha 14. 10. 2026 (UTC +2), snímky seq 1270–1316. Poloha odpovídá `south-service` schodišti ze `shared/b6-stairs.ts:7`, z −38,1 až −30,6, x 0,25 až 5,75.

- Okna seq 1292/1310/1316: 6,46 / 6,41 / 8,07 FPS; p99 185,1 / 186,2 / 180,9 ms. Ve všech **0 shader-program pairs, 0 effect events, 0 effect changes**. Revize světel 47 a tři enabled lights. Shader prewarm proto není řešení tohoto konkrétního úseku.
- World práce má v těchto oknech dohromady 2,7 / 5,8 / 1,9 ms, kdežto artLighting 159 / 145,6 / 108,4 ms a render 628,3 / 656,1 / 674,1 ms. Převážná cena tedy není uvnitř samotné smyčky B6.update; ta může vyvolat navazující práci.
- Jednotlivé snímky artLighting dosahují přibližně 40 ms a jiné jen 0,1 ms. Odpovídá to kandidátovi periodické obnovy svítilny; samostatný counter/časovač této obnovy chybí, takže nejde o definitivní přiřazení.
- Enabled kandidáti při přiblížení ke schodům vzrostli přibližně 2 531 → 3 954; zdrojové meshe 3 702 → 5 126. Později se pohybují kolem 4 967/3 795. To je další skutečná zátěž, nikoli počet draw calls. Context těchto oken je vzorek zachycený na začátku okna, může být starší než jednotlivý snímek; není to přesná časová značka všech změn.
- Vzorek seq 1309: main draw 78,7 ms, 731 dokončených calls/63 ms, z toho preparation 16 ms, bind/draw 47 ms, žádné abandoned chains. Jde o jiný profil než stovky neuzavřených readiness pokusů po první svítilně.
- Pozice se vrací z y 5,17 na 4,12; zone se mění b6:1→b6:0. Není to samo důkaz renderového floor thrash: `zoneAt` používá floor a jinou hranici než B6 round. Rendererová hranice floor 0→1 je přibližně y 4,1, takže uvedené polohy leží převážně už na stejné rendererové straně. Predikci a fyzický návrat řeší související síťový výzkum.
- Po seq 1316 se při prakticky stejné pozici a téměř stejném směru kamery obnoví přibližně 38 FPS. Členství kandidátů se přitom nezměnilo. Závažnost celého přechodného propadu proto nemůžeme dokazovat pouhým počtem geometrie nebo změnou floor.
- GPU vzorky v nejpomalejších oknech mají průměr z několika nových dotazů kolem 70 ms, později opět přibližně 13–16 ms. Vracejí se asynchronně; nejsou důkazem konkrétního GPU příkazu. Zpomalení CPU napříč více fázemi i recorderu připouští další souběžnou zátěž či plánování stroje. Log nemá údaje o ostatních procesech, throttlingu nebo GC.

Oddělený problém: skutečný vstup do haly má seq 1135, 169 ms a 772 změn efektu; jižní konec chodby seq 1192/1195 má 444,9/242,5 ms, 17/5 shader pairs a 469/154 změn efektu. Tyto incidenty se nesmějí zaměnit za shaderless schodišťový propad.

## Doložený mechanismus matic

Primární instalovaný Babylon:

1. `node.js:478–492`: `isSynchronized()` ověřuje také rodiče; nesoulad `_parentUpdateId` a rodičovského `_childUpdateId` potomka zneplatní.
2. `Meshes/transformNode.pure.js:926–944`: vynucené `computeWorldMatrix(true)` přeskočí běžnou cache a inkrementuje `_childUpdateId`.
3. Tentýž soubor `:998–1003`: je-li `force`, nejdřív vynutí `parent.computeWorldMatrix(force)`.
4. Náš `attachWorldAssetNode` odmrazí potomky právě kvůli editovatelnému pivotu. B6 fill lookup vždy vynutí pivot, i když jeho transformace nebyla změněna.
5. První potomek ve výběru svítilny je nesynchronizovaný, a tak vynutí i rodiče. Druhý to provede znovu; první je opět nesynchronizovaný. Na konci je synchronní poslední zpracovaný potomek, nikoli celá rodina.

Proto je nevhodná obecná interpretace `!mesh.isSynchronized()` jako požadavku „přepočti nuceně i všechny rodiče“. Není však bezpečné všude mechanicky nahradit argument `false`: guard Babylonu také používá current render ID a může v témže render ID vrátit starou matici, i když se transformace mezi dvěma čteními změnila.

## Autorizovaný strukturální experiment

Koordinátor schválil omezený in-memory experiment 14. 10. 2026. Spuštěn v hlavním checkoutu `node --import tsx --input-type=module`, stdin z PowerShell here-string; exit 0. Žádný `scene.render`, žádné načítání GLB props, žádný server, GPU, build, FPS či časový benchmark. Skutečný controller vytvořil 85 strukturálních meshů, 82 připojených v dané poloze. Použily se skutečné metody stínového výběru VehicleLighting. Každá varianta byla v nové scéně a vše bylo disposed v finally.

Intervence byla pouze lokální instance metody pivotu v procesu experimentu, ne změna runtime souboru. Je to izolační experiment, nikoliv návrh monkeypatche do produkce.

| Operace | Původní root: root/child přepočty | Root vždy bez force | Root vynutit pouze při `!isSynchronized()` |
| --- | ---: | ---: | ---: |
| Stejná poloha | 0 / 0 | 0 / 0 | 0 / 0 |
| B6.update po pohybu hráče o 0,4 m | 1 / 0 | 0 / 0 | 0 / 0 |
| Následující skutečný broadphase svítilny | 82 / 82 | 0 / 0 | 0 / 0 |
| Skutečný draw-time shadow seznam | 52 / 52 | 0 / 0 | 0 / 0 |
| Skutečný přesun pivotu na x=2 v témže render ID | 83 / 82, x=2 | 0 / 82, **chybně x=0** | 1 / 82, x=2 |

Ve všech sledovaných krocích bylo 0 synchronních removals a po ustálení konstrukce nevznikly nové add operace. Po původním broadphase a draw-time průchodu je synchronní jen 1 z 85 potomků; po kontrolním statickém čtení všech 85. Po skutečném přesunu je v bezpečné kontrolní variantě synchronních 82 připojených potomků; 3 nepřipojené se nepoužily. Původní a kontrolní varianty zachovaly 82 připojených meshů. Konstrukční deferred callbacks se před měřením nechaly doběhnout.

Reprodukce použitého experimentu (nevytváří soubory):

```js
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { B6RealityController } from './client/b6-reality.ts';
import { VehicleLighting } from './client/vehicle-lighting.ts';

for (const mode of ['original', 'root-default-read', 'root-synchronized-read']) {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera('probe', new Vector3(1, 5, -36), scene);
  scene.activeCamera = camera;
  const root = new TransformNode('real editable B6 pivot', scene);
  root.metadata = { key: 'b6', sourceId: 'b6' };
  const ctl = new B6RealityController(scene);
  ctl.attachToBuilding(root);
  const beam = new VehicleLighting(scene, 'player');
  const p = { x: 0.9066928625106812, y: 4.119999885559082, z: -36.42463684082031 };
  try {
    ctl.update({ player: p, quality: 'high' });
    beam.updateFromPose(camera.position, new Vector3(0, 0, 1), true, 'high');
    await new Promise(setImmediate);
    const children = root.getChildMeshes();
    const sync = () => {
      scene.incrementRenderId(); root.computeWorldMatrix();
      for (const mesh of children) mesh.computeWorldMatrix();
    };
    sync();
    let rootUpdates = 0, childUpdates = 0, adds = 0, removes = 0;
    root.onAfterWorldMatrixUpdateObservable.add(() => rootUpdates++);
    for (const mesh of children)
      mesh.onAfterWorldMatrixUpdateObservable.add(() => childUpdates++);
    scene.onNewMeshAddedObservable.add(() => adds++);
    scene.onMeshRemovedObservable.add(() => removes++);
    const native = root.computeWorldMatrix.bind(root);
    if (mode === 'root-default-read')
      root.computeWorldMatrix = (_force, camera) => native(false, camera);
    if (mode === 'root-synchronized-read')
      root.computeWorldMatrix = (_force, camera) => native(!root.isSynchronized(), camera);
    const rows = [];
    const probe = (label, operation) => {
      rootUpdates = childUpdates = adds = removes = 0;
      operation();
      rows.push({ label, rootUpdates, childUpdates, adds, removes,
        attached: scene.meshes.length,
        synchronizedChildren: children.filter(mesh => mesh.isSynchronized()).length,
        children: children.length, rootX: root.getWorldMatrix().m[12] });
    };
    probe('unchanged-pose', () => {
      ctl.update({ player: p, quality: 'high' });
      beam.updateFromPose(camera.position, new Vector3(0, 0, 1), true, 'high');
    });
    sync();
    probe('move-0.4m-controller', () =>
      ctl.update({ player: { ...p, z: p.z + .4 }, quality: 'high' }));
    probe('next-broadphase', () => {
      camera.position.z += 3;
      beam.updateFromPose(camera.position, new Vector3(0, 0, 1), true, 'high');
    });
    probe('shadow-custom-list', () => {
      const map = beam.light.getShadowGenerator().getShadowMap(), list = map.renderList;
      map.getCustomRenderList(0, list, list.length);
    });
    sync();
    probe('same-render-real-root-move', () => {
      root.position.x = 2;
      ctl.update({ player: { ...p, z: p.z + .8 }, quality: 'high' });
      camera.position.z += 3;
      beam.updateFromPose(camera.position, new Vector3(0, 0, 1), true, 'high');
    });
    console.log(JSON.stringify({ mode, rows }));
  } finally {
    beam.dispose(); ctl.dispose(); scene.dispose(); engine.dispose();
  }
}
```

Omezení: chybějí props a ostatní svět, proto nelze násobit počty z experimentu na celou hru nebo vydávat výsledek za profil. Bez skutečného pohybu rodiče by experiment falešně doporučil vždy `false`; kontrola tento regres přímo odhalila.

## Rozlišení místa zásahu, LOD a reparent — druhý experiment

Koordinátor správně požadoval slabší zásah než první root-wide kontrolu. Ta totiž potlačuje i `force` propagovaný z potomků; samotná změna B6 callsite to neumí. Navazující autorizovaný experiment skutečný zásah omezil pouze na dobu `controller.update`; před voláním VehicleLighting se metoda rootu vrátila do původního stavu. Současně porovnal samostatnou širší opravu pouze v čtení transformací svítilny a verzi s inverse cache. Opět stdin, exit0, žádný render, props, runtime soubor ani časový benchmark.

Počty níže jsou **součet** B6 update, skutečného broadphase a skutečného draw-time seznamu. Výchozí objekty a světlo jsou v každé variantě nové. `sync()` před samostatným scénářem má vlastní render ID a není započítán; vlastní pohyb/reparent potom proběhne ve stejném render ID bez renderu.

| Varianta | Chůze 0,4 m, žádná topology změna (root/child) | Skutečný root x=2 (root/child) | Skutečný LOD ven a zpět: 82 remove +82 add (root/child) | Reparent skutečného B6 meshe pod nový root x=7 |
| --- | ---: | ---: | ---: | --- |
| Původní | 135/134 | 135/134 | 136/134 | 1 nový parent/1 child, správné x=7 |
| Guard **jen v B6.update** | 0/0 | 135/134 | 0/0 | 1/1, správné x=7 |
| B6-only guard + inverse cache | 0/0 | 135/134 | 0/0 | 1/1, správné x=7 |
| Bez změny B6, pouze bezpečné čtení předků v lightingu | 1/82 | 1/82 | 2/82 | 1/1, správné x=7 |

Všechny čtyři varianty zachovaly world x skutečného vybraného meshe při rootmove (x=2), při LOD out-and-back i při reparent (x=7); 82 připojených meshů na konci. Tato kontrola čte cached world matrix, aby její vlastní čtení nevynucovalo opravu a neskrylo chybu. Původní a B6-only varianta po skutečném rootmove končí s jedním synchronním potomkem; širší helper s82. B6-only při statickém LOD cyklu zachová všech85 synchronních potomků, ačkoli se82 meshů skutečně odebere a vrátí. **LOD změna sama tedy není nutnou příčinou matrix laviny.**

Širší helper v experimentu nejprve synchronizuje `TransformNode` rodiče. Jen u skutečně nesynchronizovaného uzlu zavolá veřejné `markAsDirty()` a pak `computeWorldMatrix(false)`; to obejde same-render-ID cache bez opětovného forced přepočtu synchronního rodiče. `TransformNode.markAsDirty` přitom prochází potomky (`transformNode.pure.js:634–645`), takže tato varianta není beznákladová a může mít jiné interakce s animacemi/bones/instances. Experiment dokládá zdejší strukturální případ, ne úplnou použitelnost obecného helperu na všechny herní objekty.

Inverse cache se musí klíčovat identitou world matrix/rootu a `Matrix.updateFlag` **až po bezpečné synchronizaci rootu**. Samotné porovnání starého updateFlag před synchronizací by propáslo editaci transformace. Ve scénáři LOD out-and-back omezila dvě inverse operace na jednu; předchozí forced přepočty z jiných konzumentů mohou validní cache zneplatnit i při stejných hodnotách. B6-only guard i inverse cache při skutečném přesunu rootu nechávají stejnou lavinu135/134. Cache je tedy malá nezávislá úspora výpočtu/alokace, nikoliv oprava dominantního mechanismu. Má další vlastní stav a invalidaci při attach/reparent; pro první fix doporučuji pouze vlastní scratch matrix + `invertToRef`, ne časově drženou inverse cache bez změřeného přínosu.

Reprodukce druhého experimentu (stejné importy jako výše):

```js
// Navíc k importům první reprodukce: Matrix ze stejného math.vector.js.
for (const mode of ['original', 'b6-only-guard', 'b6-guard-inverse-cache', 'lighting-safe-read']) {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera('probe', new Vector3(1, 5, -36), scene);
  scene.activeCamera = camera;
  const root = new TransformNode('B6 pivot', scene);
  root.metadata = { key: 'b6', sourceId: 'b6' };
  const foreign = new TransformNode('reparent target', scene);
  foreign.computeWorldMatrix(true);
  const ctl = new B6RealityController(scene);
  ctl.attachToBuilding(root);
  const beam = new VehicleLighting(scene, 'player');
  const p = { x: .9066928625106812, y: 4.119999885559082, z: -36.42463684082031 };
  let rootUpdates = 0, foreignUpdates = 0, childUpdates = 0;
  let adds = 0, removes = 0, inverses = 0;
  const nativeRoot = root.computeWorldMatrix.bind(root), nativeInvert = Matrix.Invert;
  let cachedInverse = null, cachedMatrix = null, cachedFlag = -1;
  const updateB6 = player => {
    if (mode.startsWith('b6-'))
      root.computeWorldMatrix = (_force, camera) => nativeRoot(!root.isSynchronized(), camera);
    Matrix.Invert = matrix => {
      if (mode === 'b6-guard-inverse-cache' && cachedMatrix === matrix && cachedFlag === matrix.updateFlag)
        return cachedInverse;
      inverses++;
      const result = nativeInvert(matrix);
      if (mode === 'b6-guard-inverse-cache') {
        cachedMatrix = matrix; cachedFlag = matrix.updateFlag; cachedInverse = result;
      }
      return result;
    };
    try { ctl.update({ player, quality: 'high' }); }
    finally { root.computeWorldMatrix = nativeRoot; Matrix.Invert = nativeInvert; }
  };
  const lighting = () => {
    const originals = new Map();
    const native = node => {
      if (!originals.has(node)) originals.set(node, node.computeWorldMatrix.bind(node));
      return originals.get(node);
    };
    const safe = (node, camera) => {
      if (node.parent instanceof TransformNode) safe(node.parent, camera);
      if (!node.isSynchronized()) node.markAsDirty();
      return native(node)(false, camera);
    };
    if (mode === 'lighting-safe-read') for (const mesh of scene.meshes) {
      const original = native(mesh);
      mesh.computeWorldMatrix = (force = false, camera = null) =>
        force ? safe(mesh, camera) : original(false, camera);
    }
    try {
      beam.updateFromPose(camera.position, new Vector3(0, 0, 1), true, 'high');
      const map = beam.light.getShadowGenerator().getShadowMap(), list = map.renderList;
      map.getCustomRenderList(0, list, list.length);
    } finally {
      for (const [node, fn] of originals) node.computeWorldMatrix = fn;
    }
  };
  try {
    updateB6(p); lighting(); await new Promise(setImmediate);
    const children = root.getChildMeshes();
    const sync = () => {
      scene.incrementRenderId(); root.computeWorldMatrix(); foreign.computeWorldMatrix();
      for (const mesh of children) mesh.computeWorldMatrix();
    };
    sync();
    const sample = scene.meshes.find(mesh => mesh.parent === root);
    const initialX = sample.getWorldMatrix().m[12], localX = sample.position.x;
    root.onAfterWorldMatrixUpdateObservable.add(() => rootUpdates++);
    foreign.onAfterWorldMatrixUpdateObservable.add(() => foreignUpdates++);
    for (const mesh of children)
      mesh.onAfterWorldMatrixUpdateObservable.add(() => childUpdates++);
    const add = scene.addMesh.bind(scene), remove = scene.removeMesh.bind(scene);
    scene.addMesh = (...args) => { adds++; return add(...args); };
    scene.removeMesh = (...args) => { removes++; return remove(...args); };
    const rows = [];
    const probe = (label, operation, expectedX) => {
      rootUpdates = foreignUpdates = childUpdates = adds = removes = inverses = 0;
      operation();
      const actualX = sample.worldMatrixFromCache.m[12];
      rows.push({ label, rootUpdates, foreignUpdates, childUpdates, inverses, adds, removes,
        attached: scene.meshes.length, rootX: root.worldMatrixFromCache.m[12],
        sampleX: actualX, expectedX, worldXCorrect: Math.abs(actualX - expectedX) < 1e-5,
        synchronized: children.filter(mesh => mesh.isSynchronized()).length });
    };
    probe('walk-without-topology', () => {
      updateB6({ ...p, z: p.z + .4 }); camera.position.z += 3; lighting();
    }, initialX);
    sync();
    probe('same-render-root-x2', () => {
      root.position.x = 2; updateB6({ ...p, z: p.z + .8 });
      camera.position.z += 3; lighting();
    }, initialX + 2);
    sync();
    probe('actual-LOD-out-and-back', () => {
      updateB6({ x: 300, y: p.y, z: p.z }); updateB6({ ...p, z: p.z + 1.2 });
      camera.position.z += 3; lighting();
    }, initialX + 2);
    sync();
    probe('same-render-reparent-to-x7', () => {
      foreign.position.x = 7; sample.parent = foreign;
      camera.position.z += 3; lighting();
    }, localX + 7);
    console.log(JSON.stringify({ mode, rows }));
  } finally {
    Matrix.Invert = nativeInvert; root.computeWorldMatrix = nativeRoot;
    beam.dispose(); ctl.dispose(); scene.dispose(); engine.dispose();
  }
}
```

## Varianty opravy a kompromisy

| Varianta | Přínos, cena a rizika | Rozhodnutí |
| --- | --- | --- |
| A. Podmíněně synchronizovat pouze B6 pivot při čtení inverse | Zastaví doložený zbytečný spouštěč u statické budovy; druhý experiment izoluje přesně callsite a potvrzuje0/0 místo135/134. Při skutečném pohybu budovy ponechává135/134, ovšem správný world transform. Malý scope, žádná změna členství světel, geometrie, occlusion ani shaderů. Současně lze použít jeden vlastní scratch Matrix/Vector3 pro inverse převod místo nových alokací. | **První doporučený celek.** Neoznačovat jako kompletní řešení všech nákladů torch nebo KEY-16. |
| B. Všude odstranit `force`, nebo pouze používat `getWorldMatrix()` | Na statické scéně odstraní přepočty, ale same-render-ID přesun pivotu prokazatelně vrací staré x=0 místo2. Podobná chyba by mohla ovlivnit pohybující se avatar, auto a stín. | **Zamítnuto bez bezpečné synchronizace.** |
| C. Obecný synchronizátor předků pro VehicleLighting | Druhý experiment potvrzuje1/82 místo135/134 i po skutečném root pohybu a správný reparent. Samostatně však statickou B6 invalidaci nechává (1/82 místo možnosti0/0). Musí správně řešit parent chain, nová/reparentovaná mesh, billboardy, skeletony/instances a same-frame mutations; `markAsDirty` může procházet potomky. Žádné soukromé state patche. Vyžaduje širší testy než A. | Rozumná druhá varianta pro další doložené producenty. Neprovádět současně s A bez oddělené přejímky. |
| C2. Cache inverse B6 rootu | Musí se invalidovat po skutečné synchronizaci rootu podle identity i matrix updateFlag, při attach k jiné budově a po parent transformaci. Ušetří inverzi na nezměněném pivotu; neřeší force propagaci a ve druhém experimentu při rootmove nechává135/134. Má malý, dosud časově nezměřený přínos a další stav. | Pro první fix preferovat scratch `invertToRef` bez dlouhodobé cache. Cache přidat jen se změřeným přínosem a vlastními lifecycle testy. |
| D. Zmrazit B6 meshe nebo pivot | Redukuje přepočty, ale porušuje úmyslně editovatelný společný pivot a přesun geometrie oproti kolizím. Možný pouze explicitní transakční freeze/unfreeze s vlastníkem editací; široký lifecycle. | Nezvoleno pro tento fix. |
| E. Přestat při floor/LOD změnách používat scene.add/remove, pouze enable/disable | Odstraní část callbacků a resync při re-entry. Naopak ponechá všechny dormant props ve scéně a v globálních shadow/light průchodech; disabled objekty nejsou univerzálně vynechané. Může výrazně zvýšit trvalou cenu. Stávající test vyžaduje detach daleko od B6. | Potřebuje samostatný A/B s plnými props; mechanismus A se reprodukuje i při nulovém add/remove. |
| F. Hysterese patra/atStairs/prop radius nebo stabilní regionové skupiny | Omezí skutečný visibility thrash a práci cache, ale může skrýt nutný sousední strop/stěnu, zachovat příliš mnoho pater nebo zpozdit změnu. Opaque envelope/vstupy se nesmějí podřídit patrovu cullu. Zone a render floor nejsou totožné. | Podmínit počítadly skutečných změn skupin; současný log thrash nedokazuje. |
| G. Indexovat a inkrementálně udržovat kandidáty stínů | Ušetří celoscénové průchody při 250ms obnově a délkových změnách. Potřebuje zachovat membership, movement, re-enable, disposal, deformované bounds a caster vstup mimo předchozí cache. Jen vynechat disabled v broadphase může zpozdit stín po enable. | Rozumný větší samostatný fix po měření zbytku; není nutný k A. |
| H. Méně často obnovovat stíny / rozdělit po snímcích | Redukuje jednorázovou CPU špičku, ale opožděný seznam propouští světlo novými překážkami a může blikat při pohybu. Velký cold seznam nelze maskovat teprve po ready. | Nezvoleno bez konzervativního fallbacku a obrazové přejímky. |
| I. Sloučit/instancovat více B6 geometrie nebo přidat room/portal visibility | Potenciálně sníží active meshes/draw calls, které jsou samostatně významné. Snižuje granularitu cullu, mění shadow bounds a může zobrazovat/skrývat nesprávné stěny. Buffer/provenience/collision parity nutná. | Dlouhodobý samostatný celek, nikoli první reakce na doloženou invalidaci. |
| J. Zapnout statický early-frustum provider | Již existující volitelná cesta vyžaduje skutečnou attestation; attachToBuilding odemyká world matrix, takže B6 není automaticky bezpečný static kandidát. Předchozí GPU A/B rozhodnutí se nesmí obejít. | Není přímé řešení A; musí mít vlastní měření celé hry. |
| K. Shader prewarm, více světelných slotů, odstranit stíny či snížit detail | Prewarm neřeší nulový shader/effect churn. Vyšší cap zvyšuje varianty/náklady; ubrané stíny či detail mění uživatelské chování/vzhled bez opravy příčiny. | Pro KEY-16 tento incident nezvoleno. |
| L. Optimalizovat recorder/glTF guard nebo připsat vše OS contention | Recorder a guard mohou přidávat náklady; guard už má samostatný předaný fix. Proměnlivé CPU/GPU náklady připouštějí systémovou zátěž, ale nejsou důkazem její příčiny. | Držet jako oddělené A/B faktory. Není důvod ignorovat doloženou zbytečnou invalidaci. |

## Přesný navazující scope a ověření

Navrhovaný první task: `client/b6-reality.ts`, nový samostatný `tests/b6-render-lifecycle.test.ts`, vlastní handoff. Žádná změna shared geometrie/fyziky, Game, materiálových cap, manifestů nebo závislostí. Pokud by se vybrala varianta C, předem rozšířit scope o `client/vehicle-lighting.ts` a případný explicitně vlastněný helper/test; nerozšiřovat neformálně.

Levné regrese musí používat skutečné moduly:

1. Statický pivot a pohyb hráče uvnitř stejné visibility oblasti: po warm synchronizaci nemá čtení pozice fill světla přepočítávat pivot ani spouštět sourozeneckou lavinu v následném skutečném `VehicleLighting.updateFromPose` a custom render listu. Počítat události world-matrix update, ne křehký časový limit.
2. Stejný render ID, skutečný translate/rotate/scale pivotu: správná světová pozice struktur a světla, správné bounds/casters, žádná reliance na statickou transformaci. Změnu porovnat s nezávislým výsledkem transformace matice; kontrola nesmí pouze opakovat implementaci.
3. Oba stair cores, vstup i skutečný výstup, všechny quality, pohyb mezi floor/atStairs hranicemi: stejná množina visible mesh identit a stejné enabled light membership před/po. Zvlášť zachovat opaque envelope, podlahy/stropy a venkovní vstup.
4. Nově připojené props, připojení controlleru k pivotu až po konstrukci, opakovaný attach, dispose controller/beam/scene v různém povoleném pořadí: bez listenerů, retained disposed casters a pozdních callbacků vlastníka.
5. Stávající relevantní testy B6, world asset identity a vehicle lighting; plná sada/build/integrace až nad koordinovaným stabilním checkpointem.

Pro další rozhodnutí doplnit nízkonákladové čítače a oddělená časování (samostatný koordinovaný Game/profiling scope): B6 visibilityChanged/added/removed/derivedFloor/atStairs; změny pivotu a důvod; torch broadphase runs/reason/visited/selected/forcedTransforms; draw-time visited/selected; průchody stable ordering a enabled candidate rebuild. Agregovat v okně, žádný event na každý mesh/frame. V průběžném detailním profilu časovat samotné applyArtLighting a torch selection odděleně, protože nynější artLighting slučuje několik modulů.

Produkční přejímku koordinuje root: stejný neměnný build/hash, GTX 1060, stejné CSS/interní rozlišení2040×986, reálná multiplayer relace/HUD/avatar, high a noc, třetí i první osoba, svítilna cold/warm. Opakovat cestu venek→vstup→jižní schody 0→1→2→0 i severní schody. Zaznamenat frame histogram/p95/p99, samostatné draw/active/shadow/selection časy a konkrétní čítače; odděleně obraz/video textur, occlusion a barev. Před měřením ověřit jiné živé 3D scény i CPU/GPU zátěž; neporovnávat různé trasy či současně měněný guard jako jeden efekt. Nakonec skutečně přesunout editovatelný B6 root v kontrolované vizuální kontrole, pokud je tento kontrakt vystaveným chováním dané testovací verze.

Přijímací kritérium je odstraněná doložená redundantní invalidace při zachované geometrii/světle/lifecycle **a** srovnatelné reálné měření bez zhoršení. Pokud zůstane 6–8FPS incident, ponechat KEY-16 otevřený a rozhodnout o C/G/I teprve podle nových čítačů. Jednotlivý ověřený fix commitovat a integrovat samostatně; Linear doplnit zvlášť o výzkum, rozhodnutí, implementaci, ověření a commit.
