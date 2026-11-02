---
title: 'Úspornější vzdálené stromy v kvalitě Low'
type: 'feature'
created: '2026-11-02'
status: 'in-review'
route: 'oneshot'
review_loop_iteration: 0
context:
  - 'AGENTS.md'
  - 'docs/agents/bmad-policy.md'
  - 'docs/work-in-progress.md'
  - 'docs/agents/tasks/low-tree-lod-20261102-implementation.json'
---

<frozen-after-approval reason="Uživatel zadal jeden optimalizační postup a výslovně pokračování přímo na main.">

## Intent

Zlepšit úsporný režim Low dřívějším použitím existujících vzdálených korun stromů. Současný `full-coverage` profil drží MID až do 75 normalizovaných metrů, přestože má výrazně více geometrie než existující FAR. První kandidát používá hranici 45; konečný práh přijme koordinátor až podle srovnatelného výkonu a obrazu. Měřený kandidát je vratná kalibrace jednoho režimu, nikoli nový asset nebo odstranění stromů.

Blízký detail Low zůstává 6 normalizovaných metrů. Medium/High, historické profily, skutečná projekce/FOV, ochrana úsečky kamera–hráč, původní polohy, kolize, sezóny, shaderové materiály a správný streaming se zachovají. Veškerá práce probíhá pouze v kanonickém C checkoutu na main; neměnné A/B buildy jsou výstupy v `.cache`, bez kopie projektu či další větve. Běžící 8080 se nemění.

</frozen-after-approval>

## Implementation Notes

- Průzkumný checkpoint `6f26342736b5e285429379847e4ea7e4801173c9`; administrativní překážku uživatel výslovně předal a její historický JSON byl zachován commitem `3ffaab5f`. Další tři původní untracked podklady nejsou součástí tohoto úkolu.
- `client/tree-renderer.ts`: `treeDetailForProjection` je jediný runtime zásah. Cíleně zpřehlednit normalizaci, near a far rozhodnutí. Nepřidávat per-frame alokace, stav, nové exportované API nebo přepis sdíleného historického `treeDetailLevel`. Pokud bude vhodná pojmenovaná konstanta, zůstane lokální.
- `TreeRenderer.update` přepočítává projekční měřítko z FOV, výšky renderu a viewportu; `detailDistance` chrání úsečku oko/hráč. `startDetailLoads` má dva sloty a rozpočtovanou cache; `applyVisibility` při pozdním dokončení respektuje aktuální desired LOD a sezónu. Tyto mechanismy využít, nepřepisovat.
- `tests/tree-streaming.test.ts`: používat stávající syntetické GLB/NullEngine fixtures, nikoli test kopie implementačního výrazu. Given low/full-coverage, when přejde přes hranici, then použije existující FAR a nevyžádá zbytečný MID. Given jiná kvalita/profil, when se rozhoduje LOD, then zůstává předchozí chování. Given zoom/render scale či blízká third-person kamera, when se mění projekce, then zůstane chráněný detail. Given pending MID a přepnutí high→low→high, when load doběhne, then je viditelný pouze současný LOD bez ztráty zdrojů; návrat může použít cache.
- Varianty: (a) ponechat 75 bez změny: bez vizuálního rizika, neřeší zbytečný MID v Low; (b) FAR45: malý rozsah, využívá již autorsky připravené koruny, měřit přechody; (c) menší/vypnuté low stíny: low již používá512px/nejnižší PCF/bez alpha casterů, větší změna obrazu; (d) inkrementální grass bounds: složitější invalidace a neznámý podíl na frame cost; (e) retained solar list: pouze menší alokační úspora, nikoli doložená shaderová invalidace. Vybráno (b), méně agresivní hranice60 zůstává rozumnou kalibrační alternativou, pokud45 zhorší obraz.
- Doložený mechanismus: současný katalog110 je `full-coverage`; dva přímo spočítané produkční stromy mají MID/FAR113446/17228 a136804/22242 trojúhelníků včetně FAR cluster karet. Není to měření FPS ani celého katalogu. Primární podklad: https://doc.babylonjs.com/features/featuresDeepDive/mesh/LOD/ (načteno2.11.2026). Existující lokální reference: `docs/trees/20261025/lod-policy.md`, `tests/tree-streaming.test.ts`, `shared/vegetation.ts`.
- Dopady: méně aktivní geometrie a potenciálně méně detail loads v Low; FPS přínos je hypotéza do A/B. Nižší detail může měnit siluetu/parallax a vzhled přechodu. Cache již načtený MID nemusí ihned uvolnit, proto se neslibuje pokles VRAM. Lifecycle ani kolize se nemění.
- Implementace až po uložení baseline A sestavené z nezměněného rendereru. Root drží heavy-validation/gpu/build/port2568/4179; implementátor má jen disjunktní zdroj+test a lehké CPU kontroly. Harness má vlastní soubory pod `docs/performance/evidence/low-tree-lod-20261102/harness/`.
- Ověření: cílené `tree-streaming`, `tree-cluster-streaming`, `tree-catalog-loading`; nezávislé čtecí review vlastního diffu; potom stabilní TypeScript, `pnpm test`, produkční build a `pnpm test:integration`. Případná selhání zachovat odděleně od opakování. Produkční A/B stejný backend, Low, viewport/backbuffer, kamera a QA datum/počasí, plná hra s HUD a různými skutečnými relacemi; zaznamenat source/tests/public hash, GPU, raw FPS/p95/p99 a tree LOD/triangles. Kontrolovat blízkou korunu, přechod45/60/75, low→high a skutečný pohyb. Bez nové GPU přejímky se celek neoznačí hotový.

- Implementace a cílený refaktor dokončeny. Nezávislé review přesného runtime/test diffu a harnessu vrátilo `[]`. První tsc našlo dvě readonly fixture přiřazení; root je opravil stávajícím Object.assign způsobem bez runtime změny.
- Závěrečné automatické kontroly: 36/36 cílených; celý pnpm test 2848 PASS /0 FAIL /5 SKIP, tsc, pnpm build, kandidátní build a pnpm test:integration PASS. Source/test kandidáta0786606868a5fa20259935ad315ea57c7a540136fcdcfea5ed1ddc74fd887bbe.
- GPU/obrazová přejímka zůstává blokovaná vypnutým Local browser use v nastavení Work; root požádal uživatele o zpřístupnění a dokončil ostatní práci. Spec proto zůstává in-review a kandidát je pravdivě uveden v docs/work-in-progress.md; žádný FPS přínos ani celkové Done se netvrdí.
