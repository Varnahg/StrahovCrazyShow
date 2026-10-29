# KEY-5: trvalé náklady produkčního renderu

Průzkum 13. 10. 2026. **Prokázanou hlavní oblastí je výběr aktivních objektů a hlavní draw fáze. Konkrétní materiál nebo mesh za hlavní příčinu zatím označit nelze:** uložená prezentace benchmarku obsahuje jen souhrn inventáře a původní karta s plným výsledkem již byla zavřena. Následující návrh odděluje změřená fakta, mechanismy potvrzené zdrojem a navazující kandidáty opravy. Nejde o uzavření KEY-5 ani tvrzení o zlepšení FPS.

## Důkazy a hranice měření

- Zdrojový snapshot včetně assetů: `f2705e4a74273d443dc2bb79f9be5ffd83efe7f54f54ef150b790c8978831410`; přijatý code/config/tests checkpoint `d3ee76c2eb756a66f992fcd3e1f164c2f48a738932ef0f9603c11671e12a956a`. Jsou to odlišné rozsahy, proto nemají být stejné.
- `.cache/playtest-repairs-validation/baseline-medium-2040.json`, SHA256 `704a7433308ebbe1bd9c66a8eff2e2d642cce93b142fd3313104065fea903f79`.
- `.cache/playtest-repairs-validation/baseline-session.jsonl`, SHA256 `d098f70141cf91c074b67ced1f80d281c6bd1bcd538f52b5045832fea9027326`.
- Celá produkční hra, 1 skutečná multiplayerová relace/avatar a HUD, GTX 1060 / ANGLE D3D11 / WebGL2, medium, CSS i interní rozlišení 2040×986, explicitní noční preview na 14. 10. 2026 00:00 Praha. Kamera u startu: hráč x110,z12, yaw π, pitch0,28; kamera x110,y1,396,z20. Přesný ovladač není zaznamenán.
- Benchmark 20:56:37–20:56:47 Praha (`benchmark-start` seq1387, `benchmark-end` seq1432), 10,02 s, 335 intervalů, **33,5 FPS / p95 48,2 ms / p99 63,7 ms**. Průměrná měřená CPU fáze render je **25,026 ms**, z toho activeMeshes **8,552 ms**, mainDraw **16,150 ms**, renderTargets **0 ms**. Poslední vzorek ukazuje **385 draw calls a 1 121 798 „triangles“ z active indices /3** napříč průchody, nikoli samostatný soupis světové geometrie.
- CPU fáze jsou wall intervaly, zahrnují možné čekání ovladače; nejsou čistým počtem JS instrukcí nebo GPU časem. Scope jsou inkluzivní intervaly, obecně se mohou překrývat. `frameWork.cpuMs` a `frameWork.gpuMs` v benchmark JSON jsou podle `Game.frame()` **poslední hodnoty**, ne průměry.
- Nezávislý přepočet devíti kompletních viditelných frame oken uvnitř benchmarku, seq1394,1396–1401,1416,1423, monotonic od602814,2 do611673,1 ms: **306 intervalů**, mean28,951 ms, p9546,9 ms; CPU mean26,119 ms a render mean24,309 ms. **153 nových asynchronních GPU vzorků**: mean **14,903 ms**, p95 **22,56 ms**, max **33,71 ms**. Okna jsou užší podmnožina než celý benchmark a nemají jej číselně nahrazovat. Ve všech devíti vzorkovaných kontextech je medium,1 avatar,385 draw calls a1 121 798 indices/3; mezi vzorky se stav mohl změnit.
- Povrchy/surface maintenance mají v celém benchmarku mean0,0036 ms, vegetace0,0487 ms, cinematic0,0075 ms. Grass nemá aktivní dlaždice ani pending přípravu. Tyto průběžné činnosti v tomto konkrétním stání nevysvětlují render25 ms. To nevyvrací jejich jiné náklady při jízdě, streamování nebo změně kvality.

## Co skutečně znamená uložený inventář

| Záznam | Hodnota | Správná interpretace |
| --- | ---: | --- |
| Registrované meshes | 3307 | Obsahuje také vypnuté LOD a pomocné uzly. |
| Enabled a visible geometry meshes | 1925 | Celá scéna, **ne pouze objekty v aktuálním frustumu**. |
| Hidden/disabled geometry meshes | 1378 | Směs vypnutí a visibility; nelze celou hodnotu vydávat za úsporu EnabledMeshCandidates. |
| Enabled regular instances | 711 | Tyto objekty mají nativní instance/LOD lifecycle, nesmějí být odstraněné jednoduchým filtrem master meshů. |
| Distinct enabled materials | 139 | Identita materiálů v celé enabled scéně, ne počet aktivních shaderů nebo bindů za snímek. |
| Material/light assignment groups | 141 | Identita material+receiveShadows+seznam světel. Neříká, kolik vzniká shaderových programů. |
| Třídy na enabled geometrii | PBR1488, Standard433, Multi3, Shader1 | Počítá meshes, nikoli samostatné materiály/draw calls. |
| Registrovaná / enabled světla | 43 / 2 | Nejde o 43 světel vyhodnocovaných v každém viditelném pixelu. |

Plný `modelReview` byl v presentation JSON nahrazen `modelReviewSummary` (3303 geometrických záznamů). Samotný plný současný formát navíc nemá per-mesh submesh počet, flags zmrazení/instancí ani členství v aktuálním aktivním seznamu. Tyto údaje je nutné doplnit jednorázovým čtecím inventářem před přiřazením konkrétního viníka. `uniqueGeometryTriangles` končí zlomkem0,666…; implementace bez kontroly topologie dělí všechny indexy třemi, takže takový agregát nesmí být popisován jako přesný počet trojúhelníků bez další kontroly.

## Mechanismus A: pozdní frustum test po průchodu enabled kandidátů

`EnabledMeshCandidates` odstraňuje pouze effectively disabled uzly, zachovává pořadí a deleguje zbytek Babylonu. Cache se obnovuje při změně enabled stavu, přidání/odebrání nebo délky seznamu. Ve stabilní scéně neprochází všechna pole znovu kvůli běžnému dotazu; chybějící prostorové zúžení ale ponechává nativnímu loopu i vzdálenou enabled geometrii.

Primární nainstalovaný `scene.pure.js` `_evaluateActiveMeshes` provádí pro kandidáta postupně: záznam `_currentLOD` podle kamery, isBlocked, počítání vrcholů, `mesh.isReady()` a enabled/scale, `computeWorldMatrix()`, intersection bookkeeping, výběr LOD, `_preActivate()`, teprve potom visibility/layer/frustum. Viditelný výsledek dále vyhodnotí submeshe a předá je RenderingManageru. **`Mesh.isReady()` s výchozím completeCheck=false nekontroluje všechny materiály/shadery.** Přisuzovat této fázi8,552 ms shaderové kompilace by bylo chybné.

Množství eligible offscreen statických objektů může vytvářet zbytečné native traversal/LOD bookkeeping před zamítnutím frustem. Je to doložený mechanismus, nikoli změřený podíl jednotlivých tříd v původní scéně. Ani `freezeWorldMatrix()` neodstraňuje veškerý tento loop; jen zrychluje příslušnou matrix větev. Globální freezeActiveMeshes není vhodné řešení pohybující se kamery, LOD a multiplayeru.

### Úzký navazující implementační kandidát

Po nové explicitní rezervaci upravit **`client/active-mesh-candidates.ts` + `tests/active-mesh-candidates.test.ts`**; root vlastní případné přepnutí experimentu v `client/game.ts`. Zachovat stávající enabled cache a pořadí; do samostatného znovupoužitelného výstupu před nativním loopem přidat konzervativní frustum zamítnutí **jen výslovně statické, neměnné, neinstancované geometrie bez LOD, kostry/morph/billboard/akce a bez vlastního LOD selectoru**. Nejde o filtr „co není vidět“ nad všemi meshi.

- Způsobilost musí být explicitní a konzervativní (například existující authored static metadata + ověřená frozen matrix); neznámé, dynamické, instance, invisible source mastery, thin instances, materiálové/geometry experimenty a nativní LOD ponechat beze změny. Před clip testem zaručit aktuální stejné bounds/world matrix, kterou by četl nativní loop; reparent/geometry aktualizace musí vyřadit položku nebo obnovit tento kontrakt.
- Při `skipFrustumClipping`, `alwaysSelectAsActiveMesh`, vlastním provideru/selectoru nebo nepřipraveném frustumu původní zdroj zachovat. Nepřepisovat cizí provider, stínové seznamy, `scene.meshes`, materiály, geometrii ani kolize.
- Viditelný výstup musí zůstat ve stejném pořadí. Neslučovat transparentní submeshe ani neinicializovat alternativní instance/LOD stav. Pokud se bude později ukazovat drahý i tento per-mesh frustum scan, prostorový index je až samostatný další profilovaný krok, nikoli nutná součást první úpravy.
- Přidat levné počty input/enabled/output/staticRejected/cacheRebuilds; ne timing každého jednotlivého meshe za běžné hry. Uvádět je v jednom vzorkovaném kontextu.

Lehký in-memory experiment na skutečných NullEngine/Scene/Mesh/FreeCamera objektech použil48 pevných boxů a4 native instance/LOD uzly (52 kandidátů), dvě opačné kamery. Čistě statický frustum prefilter snížil kandidáty **52→16** a volání veřejného `isReady` **53→17**, přitom přesně zachoval pořadí14 aktivních objektů a504 aktivních indexů v obou kamerách, včetně near/far instancí. **Není to produkční oprava ani časové/GPU měření.** Dokládá jen konkrétní mechanismus a smysluplný směr malé implementace; nepokrývá všechny dynamické přechody.

Potřebné nové regrese: změna kamery/layer mask, clipping bypass, alwaysSelect, source-order a průhlednost, reparent a změna matrix/geometry, změna enable/disable/stream replacement ve stejném tasku, výslovná native near/far LOD a disabled/invisible master, thin instances/negative determinant, hlavní i stínové draw shody. Stávající čtyři testy EnabledMeshCandidates během tohoto průzkumu prošly4/4 a jsou nezbytný výchozí invariant.

## Mechanismus B: hlavní draw fáze, konkrétní malý zásah až po úplném inventáři

Zdroj `Mesh.render` v hlavní draw cestě řeší instancing list, readiness účinného materiálu, side orientation, GL state/buffer binding, `bindForSubMesh`, instanced/native draw, unbind a render stages. PBR bez freeze kontroluje readiness znovu v novém renderId a podle rebind/frozen stavu aktualizuje lights/view/fog/plugin/UBO. **16,150 ms CPU wall mainDraw může zahrnovat také synchronizaci nebo čekání ovladače; není to důkaz, že celou hodnotu spotřebuje jeden materiálový helper.** GPU podmnožina s mean14,903 ms a p9522,56 ms ukazuje, že čistě CPU úspora sama nemusí zaručit60 FPS ve všech intervalech.

Ověřené omyly, které se nemají implementovat jako oprava:

1. `world-renderer.ts` používá `Mesh.MergeMeshes(..., false, true)` na skupinách téhož materiálu. **Babylon9.30 už řadí podle materiálu a slučuje sousední contiguous same-material index ranges.** Malý skutečný test6 boxů se stejným materiálem vrátil1 submesh (MultiMaterial s1 členem). Nepřepínat tento parametr s tvrzením, že se tím odstraní draw pro každou původní část; tento problém zde prokázán není.
2. `architecture-reality.ts` už vytváří batch pro každý material/building/LOD a mrazí world matrix. Celoplošný nový merge by změnil prostorové hranice, identitu budov/LOD a potenciálně transparentní pořadí. Bez per-mesh inventáře není podloženo, které malé dávky mají skutečný CPU náklad.
3. `static-submesh-chunks.ts` již přesně rozděluje terén/cesty/landcover do96m buněk a uchovává původní index master i atributy. Neodstranit chunkování kvůli počtu draw calls: nativní frustum vyřazuje vzdálené části a jejich sloučení může znovu odesílat podstatně více původních trojúhelníků. Zmenšení buněk naopak může zvýšit počet draw calls. Další velikost buněk vyžaduje srovnání odeslaných indexů i GPU, ne jediné číslo draw count.
4. `BindLights` iteruje do `min(mesh.lightSources.length,maxSimultaneousLights)`, `PrepareDefinesForLights` má dirty gate a skutečně použité sloty. Baseline má2 enabled světla. Snižování univerzálního cap4 na2 nedokládá zde příčinu a mohlo by zahodit svítilnu/auto v jiném stavu. Zdroj přímo uvádí UBO podle použitých světel, ne podle pouhého maxima.
5. Materiály nejsou obecně statické: mokrost, kvalita/bump, obloha, image processing, čas, lampy a vítr se mohou měnit. Globální material.freeze bez precizního invalidation lifecycle by zachovalo chybný vzhled. Případný malý material freeze experiment lze navrhnout až pro prokázanou skupinu se známými všemi dynamickými vstupy.

**První draw krok je měření, nikoli destruktivní změna geometrie.** V novém checkpointu jednorázově rozšířit `client/render-cost.ts` / `client/model-review.ts` a jejich cílené testy (`tests/render-maintenance.test.ts`, případně nový `tests/model-review.test.ts`) o aktuální active membership, source/master identity, submesh/index counts a material classes, frozen/instance/thin/LOD/billboard/transparent flags, tracked bounding provenance a diagnostické light slots. Neukládat osobní profily a nevolat při inventáři `computeWorldMatrix(true)` nebo readiness, které by stav měnily. Instrumentaci mezitím doplňuje nový RenderIncidentProfile; nový shader CPU/effect event výsledek musí být označen novým sourceID.

Teprve potom připravit jeden úzký runtime zásah: například seskupení **prokázané** malé opaque skupiny ve stejném spatial/LOD rootu nebo omezení konkrétní redundantní bind práce. Přesné soubory pak určuje zjištěný vlastník skupiny, nikoli odhad z názvu „svět“. Za tohoto důkazního stavu nelze korektně přidělit změnu libovolné části architecture/vegetation/car packu jako potvrzenou draw opravu.

## Produkční přejímka navazujícího zásahu

1. Uložit plný benchmark JSON a nový one-shot inventář, ne jen presentation. Oddělit původní checkpoint od nového profilu a současně zaznamenat skutečný source/binary hash, driver, CSS/internal2040×986,4×MSAA, medium,1 skutečný peer a plnýHUD, přesnou kameru a noční preview.
2. Pro candidate provider porovnat původní vs novou cestu v témže stabilním checkpointu, rozlišení, lokaci, se zahřátou stejnou cache; nejméně3×10s na variantu v proloženém pořadí. Zaznamenat FPS/p95/p99, activeMeshes/mainDraw/render CPU, čerstvé GPU sample counts/mean/p95/p99, candidate counts, draws, active indices a material-effect/shader counters. Mění-li se shader počet, není to izolovaný test traversal úpravy.
3. Zachovat active/draw pořadí a obraz při otáčení kamery, přejezdu LOD hranic, chůzi doB6, jízdě, pohledu na transparentní sklo a při světle/stínech. Test má porovnat celé chování, nikoli pouze znaménka nebo render-count součet.
4. Přijmout změnu jako výkonovou opravu pouze při srovnatelném zlepšení měřeného render CPU/FPS/p95 bez regresí; zachovaný svět a méně kandidátů samy o sobě nestačí. Pokud úzký prefilter neušetří čas, další krok vybere CPU profil a úplný inventář, ne broad rewrite.

## Provenience průzkumu

Autoritativní primární podklady jsou zamčený instalovaný Babylon9.30.0 (`scene.pure.js`, `Meshes/mesh.pure.js`, `Meshes/transformNode.pure.js`, `Materials/pushMaterial.js`, `Materials/PBR/pbrBaseMaterial.pure.js`, `Materials/materialHelper.functions.js`, `Culling/Octrees/octreeSceneComponent.pure.js`) a uvedené projektové zdroje. Oficiální [dokumentace instancí](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances) podporuje nutnost zachovat jejich nativní render/LOD/transparent lifecycle; konkrétní pořadí a merge konsolidace byly ověřené v místní verzi, ne odhadnuté podle staršího Babylonu.

Osm klíčových zdrojů `active-mesh-candidates`, `world-renderer`, `architecture-reality`, `static-submesh-chunks`, `render-cost`, `model-review`, `surface-pack`, `outdoor-artifacts` bylo SHA256 porovnáno mezi pracovním stromem a původním produkčním snapshotem: všech8 je shodných. Žádný runtime, původní log ani build se v tomto průzkumu nezměnil. Žádné GPU nebo velké CPU profilování nebylo spuštěno.
