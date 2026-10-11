# K4: nulový clearcoat a pořadí opaque průchodu

Kandidát mění pouze přípravu materiálů a pořadí hlavních opaque draw groups. Žádný GLB, Blender master, textura, UV, geometrie, poloha, render LOD, kolize, světlo ani shadow mapa se kvůli němu nezjednodušuje. GPU A/B musí následovat nad novým zmrazeným zdrojovým hashem; výsledky K3 se za K4 nevydávají.

## Přesná nulová clearcoat větev

`client/car-material-budget.ts` deaktivuje `clearCoat.isEnabled` pouze tehdy, když je weight **přesně 0** a chybí všechny čtyři coat texture role: základní weight, roughness, bump a tint. Již vypnutý coat, libovolný nenulový nebo neplatný weight a texturovaný coat zachová. `client/car-pack.ts` volá helper jednou po skutečném loadu každého materiálu, nikoli každý frame.

U současných skutečných car GLB jde o **15 nulových větví**, pět rodin na každém ze tří LOD. Kladné hodnoty laku 0,55, lens 0,3/0,5 a skla 0,15 se zachovaly podle skutečného source JSON, včetně všech materiálových faktorů a obrazů.

Primární GLSL implementace Babylon 9.30.0 byla zkontrolována:

- `pbrBlockClearcoat.js`: F0 výsledek je `mix(originalF0, remappedF0, clearCoatIntensity)`. Při nule se vrací original F0. Coat reflectance i IBL Fresnel se násobí intensity; vyzařovaná coat radiance je tedy nulová a base conservation factor je 1.
- `pbrDirectLightingFunctions.js`: přímý coat Fresnel se násobí intensity. Při nule je coat RGB příspěvek 0 a vrácená propustnost `1 - fresnel` rovna 1.
- `lightFragment.js` a `pbrBlockFinalLitComponents.js`: původní diffuse/specular se přes tyto jednotkové conservation/propustnostní faktory nezmění; nulový přímý a IBL coat nepřidá barvu.
- Loader pro tyto glTF coat materiály navíc nastavuje `remapF0OnInterfaceChange = false`. Žádná car coat textura nebo tint/scattering extension se nepřidává.

To dokládá odstranění matematicky nulové větve, nikoli snižování kladného coat vzhledu. Skutečný PBR effect preparation v NullEngine testu potvrdil, že černý materiál už nemá `#define CLEARCOAT`, zatímco lak jej má a jeho původní faktor zůstává přesně zachovaný. NullEngine není GPU pixelový důkaz; cold GPU kontrola vzhledu a měření jsou stále potřeba.

## Opaque sky first a front-to-back

`client/opaque-sort.ts` poskytuje comparator použitý pouze místo původního opaque comparator bloku v `art-lighting.initialize`. Sky zůstává první. Ostatní opaque skupiny se řadí podle vzdálenosti skutečného world centre od kamery, s deterministickým material/geometry/submesh tie-break. Alpha-test a transparentní fronty dostávají stejné nastavení jako před změnou a jejich pořadí se nemění.

V Babylon 9.30 není veřejný master-LOD getter a `getLOD` není čistý getter: může pre-aktivovat zdroj a resetovat instanced batch. Comparator proto **nikdy znovu nevolá getLOD** a nečte soukromá rendererová pole.

Místo toho při prvním porovnání daného Scene render ID a kamery přečte veřejný `scene.getActiveMeshes()`, tedy instance již aktivované skutečnou hlavní kamerou. Z jejich veřejných `sourceMesh`, `getLODLevels`, bounding sphere a camera parametrů vypočte stejný native distance/screen-coverage výběr jako pinned Babylon. Ke každé kreslené source LOD geometrii přidělí vzdálenost nejbližší skutečně aktivní instance v dané skupině. Skrytý source na světovém počátku ani layerMask0 shadow proxy se za pozici viditelného auta nevydávají. Normální submeshe a thin-instance dlaždice používají své veřejné bounds.

Mapy vzdáleností jsou lazy cache pro render ID + kameru. Veřejný `onAfterActiveMeshesEvaluationObservable` označuje čerstvý seznam pro daný frame. Při arbitrary `customLODSelector`, zmrazeném seznamu bez nové aktivní evaluace nebo determinantově zrcadleném instance fallbacku se použije bezpečné material/geometry pořadí. Žádný privátní aktuální LOD cache nebo `_distanceToCamera` není čten či přepisován. Dálkové/source geometrie, jejich world matice a native instance registrace se nemění.

## Cílené ověření

**39/39 PASS, exit 0**, `--test-concurrency=2`, přibližně 7,6 s. Zahrnuje šest nových ověření a existující car, proxy, legacy car, headlight a weather regrese. `pnpm exec tsc --noEmit`: **PASS, exit 0**.

Nová ověření:

- přesná nula versus nenulové/NaN hodnoty a všechny texture role;
- skutečné GLB source coat faktory a skutečné PBR shader defines;
- skutečný `Scene.render` dispatch sky → near → middle → far a správné přepočtení po otočení kamery;
- nezměněný alpha-test/transparent draw order;
- skutečné native instance LOD draw groups sky → near LOD → occluder → medium LOD → occluder → far LOD, včetně více instancí a vyloučené layerMask0 proxy;
- žádné dodatečné volání getLOD během sort a žádná změna world pose kterékoli testovací mesh/instance;
- readonly LOD výběr porovnaný se skutečným Babylon getLOD na přesných hranicích, pro distance, screen-coverage a orthographic režim;
- custom LOD selector není volán navíc a zachovává bezpečný fallback.

Příkaz:

```powershell
node --import tsx --test --test-concurrency=2 tests/car-material-budget.test.ts tests/opaque-sort.test.ts tests/car-shadow-proxy.test.ts tests/realistic-car-pack.test.ts tests/native-car-models.test.ts tests/vehicle-lighting.test.ts tests/weather.test.ts
```

Jde o důkaz algoritmů, dispatch a neměnnosti zdrojů, ne GPU early-Z/fragment overdraw čítač. Změna může snížit zbytečné PBR vyhodnocení zakrytých pixelů, současně ale mění frekvenci material state přepnutí; čistý zisk musí potvrdit celé produkční GPU A/B při stejné kameře, okamžiku, kvalitě, rozlišení a populaci. Prostorové chunking podkladu není součástí K4.
