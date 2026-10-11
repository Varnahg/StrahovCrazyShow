# Náklady vykreslení J a kandidát K pro stíny aut

Vyšetření vychází z celé produkční hry J, zdrojový snapshot `cd44b8d901261fc8a67c7080aa014595f3655f08153982418ba406ad574d2a33`. Tři měření jednoho hráče na Intel UHD 630 při CSS 1920 × 1080, backbufferu 1476 × 830 a kvalitě low dosáhla **25,8 / 25,7 / 26,0 FPS**, p95 **41,8 / 43,3 / 40,4 ms**, p99 **52,4 / 53,4 / 45,0 ms**. Poslední GPU vzorky byly přibližně 34–35 ms. Jde o skutečná GPU měření; následující rozklad algoritmů žádné nové FPS neměří.

Původní JSON jsou v `docs/performance/evidence/faithful-world-repairs-20261011-j/browser-1-low-day-intel-{1,2,3}.json`. Jejich SHA a GLB metadata jsou v `.cache/render-cost-study/source-inspection.json`; reprodukční skript `.cache/render-cost-study/inspect-benchmark.mjs` pouze čte soubory.

## Co počítadla skutečně znamenají

`scene.getActiveIndices()/3` započítává i stínové průchody. Babylon 9.30.0 volá pro hlavní pohled i shadow map stejnou `Mesh._processRendering`, která inkrementuje `_activeIndices`. Výsledek J **1 730 944** proto není součet unikátní geometrie nebo pouze hlavního pohledu.

`modelReview` u `InstancedMesh` naopak čte počet indexů původního source mesh. U auta je to near source, i když Babylon v daném průchodu vybral medium nebo far. Inventář 25 aktivních aut tedy správně uvádí **650 částí a 3 468 750 near source trojúhelníků**; tento součet neprokazuje, že by je GPU všechny vykreslovalo.

Skryté template/LOD objekty nejsou automaticky draw call. V J je 42 registrovaných světel, ale v denním snímku pouze dvě zapnutá. Tyto inventární údaje se nesmějí vydávat za 42 dynamických světel v každém shaderu nebo za naměřený fragment overdraw.

Primární implementace byly zkontrolovány přímo v instalovaném Babylon 9.30.0:

- `node_modules/@babylonjs/core/Meshes/instancedMesh.pure.js`: `getLOD` předává vlastní world bounding sphere instance, nikoli polohu skrytého masteru.
- `node_modules/@babylonjs/core/Meshes/mesh.pure.js`: výběr LOD a inkrementace indexů pro jednotlivé instanced draw.
- `node_modules/@babylonjs/core/Rendering/objectRenderer.js`: explicitní render list stínu používá LOD podle `cameraForLOD`, standardně hlavní kamery.
- `node_modules/@babylonjs/core/Lights/Shadows/shadowGenerator.js`: stínové vykreslení následně volá stejnou `_processRendering`.

## Rozklad aut ze skutečných zdrojů J

`.cache/render-cost-study/car-selectors.ts` načítá skutečné tři zmrazené GLB a skutečný J car pack. Vyhodnocuje nativní instance LOD, hlavní frustum a skutečný sluneční shadow frustum nad přesnými world AABB z benchmarku. Žádná fotografie, zjednodušený náhradní model nebo předpoklad „všechna auta near“ není použit.

J nezaznamenával skutečnou polohu kamery. Rekonstrukce proto používá stabilní výchozí orbit 8 m, zaznamenaný yaw/pitch a skutečný J `Simulation.cameraDistance`. Ta potvrdila nezkrácené rameno 8,586874 m a kameru **[110; 1,396100; 20,000034]**. Jde o rekonstruovanou, nikoli přímo změřenou kameru. Nový benchmark K už má zaznamenávat kameru a její view/projection matice.

| Průchod aut J | Vybrané části instancí | Sdílené instanced skupiny |  Trojúhelníky |
| ------------- | ---------------------: | ------------------------: | ------------: |
| Hlavní pohled |                    219 |                        68 |       428 147 |
| Sluneční stín |                    439 |                        75 |       812 791 |
| Součet        |                      — |                         — | **1 240 938** |

Výsledek je přibližně 72 % celého indexového počítadla J. Near patří pouze autu u hráče; ostatní zobrazená auta skutečně používají medium/far. Hlavní pohled má 26 315 alpha-blended trojúhelníků aut, nikoli průhlednou celou karoserii. Stín neobsahuje jejich alpha-blended skla a lens.

Viditelné car LOD tedy fungují. Vyšší cena vzniká zejména tím, že 512px sluneční mapa používá stejné detailní near/medium části jako hlavní kamera. Při rozpětí mapy 72 m odpovídá texel přibližně 14 cm; velmi jemné detaily sedadel, středových krytek nebo paprsků disků mají i ve stínu plnou cenu jejich geometrie.

Historické H mělo na stejném adaptéru a rozlišení 528 752 indexově počítaných trojúhelníků a 39,4 FPS. Rozdíl indexů vůči J je přibližně 1,20 milionu, obdobný rekonstruovanému příspěvku nových aut. To je silný důvod cílit nejdříve na tento průchod. Nejde o tvrzení, že všechny změny H → J jsou izolované nebo že samotné počty předpovídají FPS.

## Implementovaný kandidát K

Nový `client/car-shadow-proxy.ts`, integrovaný v `client/car-pack.ts`, kopíruje opaque geometrii aktuálního far LOD do **pěti sdílených geometrií**: tělo a čtyři kola. Každé auto má samostatné proxy instance na stejném kořeni a stejných čtyřech pivotech jako jeho viditelný model. Řízení, rotace kol, náklon i pružení používají totožné transformace.

Pouze při kvalitě **low** se zapnou proxy a viditelným částem se vypne účast ve stínech. Při medium/high zůstává původní cesta stínů. Viditelné near, medium a far geometrie, PBR materiály, běžné LOD prahy i původní master zůstávají zachované. Proxy nepřidává textury, další světla nebo další render target.

Proxy má `layerMask = 0`, proto jej běžná kamera nikdy nevykreslí. Babylonův explicitní seznam stínů má `forceLayerMaskCheck = false`, takže stejná instance může být vybrána pouze do shadow pass. Template má `isVisible = false` a `depthCaster = false`; ani vlastní source proxy se nezobrazí nebo nevykreslí vedle instance.

Na původním J by pouhá záměna zdroje 439 vybraných opaque částí za far snížila car shadow z 812 791 na **166 075 trojúhelníků**, tedy o 646 716 (79,6 %). Sloučené tělo má jiné konzervativní AABB, proto se skutečný K výběr může mírně lišit. Tato čísla nejsou GPU A/B ani slib FPS.

K používá opravené far GLB: **9 202 trojúhelníků**, SHA-256 `98254bb33689919998a83fd28aae77a6aa31da5826afda368f9f4c4e7f2ead58`. Opaque proxy celého auta má **8 300 trojúhelníků**. Oprava a uzavřenost kol jsou doložené v automobilových auditech; tělo zůstává přesným derivátem J a přiznané material-edge/source coverage limity tím nejsou prohlášeny za vyřešené.

## Ověření a hranice

Cílený běh 11. 10. 2026: **22/22 PASS, exit 0**:

- 4 nové testy `tests/car-shadow-proxy.test.ts`: neměnnost všech původních render geometrií, pět sdílených geometrií a refcount cleanup; quality gating bez duplicitních casterů; přesné transformace těla a všech kol; skutečný Babylon main/shadow dispatch kontrakt.
- 6 regresí `tests/realistic-car-pack.test.ts`: skutečné GLB, fyzické rozměry, barvy, grounding, běžný LOD a omezené světelné emise.
- 5 regresí legacy `tests/native-car-models.test.ts`.
- 7 regresí `tests/vehicle-lighting.test.ts`.

Dispatch test skutečně spustil `Scene.render` a `ShadowGenerator`: hlavní aktivní seznam proxy neobsahoval a shadow renderer vykreslil právě pět proxy skupin. Jde o NullEngine důkaz algoritmu a dispatch, nikoli shaderu, vzhledu nebo GPU výkonu. Samostatný prototyp je v `.cache/render-cost-study/layer-mask-contract.json`.

První cold GPU smoke K následně odhalil opakované varování Babylonu o `receiveShadows` na instancích. `Cinematic.selectCasters` nastavoval skrytému source proxy implicitní hodnotu true, zatímco jeho instance požadovala false; instance tuto vlastnost dědí ze source. Source nyní má současně `receiveShadows = false` a `metadata.receiveShadows = false`. Nová pátá proxy regrese skutečně opakovaně spouští `CinematicAtmosphere.update/selectCasters`, ověřuje source i instance a zachytává **nula varování**. Následný cílený běh **11/11 PASS** zahrnuje všech pět proxy testů a šest realistických car regresí. Root musí cold GPU smoke zopakovat s novým zdrojovým hashem; původní K smoke není platným důkazem opraveného kandidáta.

Zbývá kořenové ověření celé produkční hry: skutečný obraz stínů na zemi a autech, absence viditelných proxy, řízení/pružení, přepnutí low/medium/high, a GPU A/B při stejném okamžiku, kameře, rozlišení a počtu relací. Full test/build/integration a výsledky patří do `docs/verification.md`.

Další kandidát bez zásahu do masterů je prostorové dělení přesných trojúhelníků podkladu. Nynější terrain má jediný celoplošný mesh 76 934 trojúhelníků, čtyři street meshes 166 059 a šest landcover meshes 43 963. Celkové AABB často protíná kameru i pro převážně vzdálené části. Nebyl zatím proveden experiment s velikostí dlaždic ani měření zisku; dělení tedy není součástí tohoto kandidáta.
