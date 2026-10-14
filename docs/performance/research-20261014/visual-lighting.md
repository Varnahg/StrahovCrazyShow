# Výzkum světel, materiálů a barev — 14. 10. 2026

Rozsah: KEY-3, KEY-4, KEY-13, KEY-14, KEY-15; vazby na KEY-2/5/8/9/12/16. Autor `research-01a13624-visual-20261014`, koordinátor `/root`. Toto je rozhodovací podklad před implementací, nikoli hotová oprava nebo pixelová přejímka.

## 1. Výchozí stav a hranice důkazů

Uživatel po čistém produkčním testu řekl: „pořád platila ta roztřesená při pohybu ze 3. osoby, pak problesky červené místo textur a pak taky světlo, které se nechovalo úplně nejpřirozeněji z dálky, plus takové divné barvy textur v noci, příjde mi to jako gamma, že je úplně na vrcholu, plus při procházení zvenčí do bloku je zásek a stejný je i zásek mezi patrami bloků“. Dřívější popis červené byl „při náročnějších rychle načítaných scénách vidět problesky červené“. Třesení se vztahuje ke kameře/pohybu; **shimmer materiálů nebyl doslovně nahlášen**. Gamma je uživatelská hypotéza. Jevy nemají automaticky jednu příčinu.

- Rozhodující produkční relace `07c227f8-d2f8-4011-a6f8-5d27ad0627a4`: 14. 10. 00:10:32–00:19:56 Praha, resource origin `http://127.0.0.1:4176`, `development:false`, klient i API deklarují snapshot `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`. Archiv: `.cache/playtest-repairs-validation/user-test-20261014-production/07c227f8-d2f8-4011-a6f8-5d27ad0627a4.jsonl`, SHA256 `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`; originál ve `snapshots/wave3/.cache/game-diagnostics/`.
- 1799 navazujících records, 296 dávek, session-end, jeden Game start, bez sequence gaps. Jediný zachycený error je `favicon.ico` HTTP404. **To nevylučuje špatné pixely.** Není zde video, screenshot přesného červeného snímku, identita dotčené plochy ani kompletní záznam skutečných GPU bindingů.
- GTX1060/ANGLE D3D11; během relace se měnil auto medium→low, cíl 60→144, poté high. Smíšených 59.68 FPS/p95 30.3/p99 41.2 ms není kontrolované A/B ani důkaz stabilních 60 FPS.
- Wave3 prošel 874/874 testy, buildem a celou izolovanou integrací. To potvrzuje kontrolovaný checkpoint, ne splnění pixelových a výkonových požadavků. Rozhodující installed core/loaders jsou Babylon **9.30.0**.
- Read-only SHA porovnání při výzkumu: `cinematic`, `cinematic-art`, `art-lighting`, `flashlight`, `vehicle-lighting`, `stable-light-state`, `sky-reflection`, `character-materials`, `streets-renderer`, `texture-diagnostics` souhlasí s wave3 manifestem. Pozdější `gltf-light-budget.ts` fastpath 16/16 je lokální kandidát, **není v produkční relaci**. Byl odložen do `.cache/wave4-bootstrap/candidates` nové worktree.
- Budoucí implementace má začít v `C:/Users/rezac/.codex/worktrees/playtest-repairs-wave4/StrahovCrazyShow`, větev `codex/playtest-repairs-wave4`, kde root ověřil 509/509 source/config/tests proti wave3. Tento výzkum píše pouze dvě přidělené dokumentace v main. Nebyl otevřen browser ani spuštěn GPU render, server, build nebo sada testů.

### Důležité snímky

První flashlight ON je seq322, atMs80211.6. Hitch seq325 obsahuje interval741.1ms a **předchozí** CPU frame738.3ms: render711.8ms, mainDraw694ms, activeMeshes7.4ms, render target3.7ms, shaderCreation22.0ms, 30 dokončených shader-observable párů a 550 změn material/effect binding identity. Art-lighting25.6ms a lightOrdering3.9ms jsou další pozorované fáze. ShaderCreation není celá příprava shaderu ani asynchronní GPU dokončení; rozdíl672ms se nesmí pojmenovat „GPU compilation“. Material detail je capped a není úplný seznam vinných ploch.

U dalších přechodů jsou např. seq426: interval453.7/mainDraw432.3/shaderCreation14.5ms, 19 nových programových párů; seq1195:242.5/mainDraw197.2/shaderCreation4.9ms, pět párů. Jde o podklad pro cílené zachycení přípravy a bindingu. Jižní schody v jiné části logu mají velmi nízkou kadenci bez nových shader/effect událostí; příčinu nelze zobecnit na všechny hitches.

glTF counter v seq325 je již23 loadů/4628 oprav capu, žádný aktivní loader. V dřívějším wave3 logu371d… bylo4638 startup oprav a později šest milionů visits bez dalších writes. Nezaměňovat odlišné relace ani tyto kumulativní hodnoty nesčítat. Novější fastpath odstraňuje idle návštěvy, nikoli doložený cold flashlight mechanismus.

## 2. Systémový řetězec

### 2.1 Světla → mesh membership → shader varianty → render

1. `client/game.ts:2370–2407` počítá astronomii/počasí, zavolá `applyArtLighting`, aktualizuje auto a svítilnu; před `scene.render` volá `StableLightState.update` (`game.ts:2458`). B6 může zapnout další lokální světlo. Skutečný enabled stav a rezervace slotů se musí vyhodnotit po těchto změnách.
2. `client/art-lighting.ts:307–315,379–424`: slot pro ambient, skutečně enabled slunce/měsíc, auto a extra practical zdroje; street capacity max1 na low, max2 jinak a nejvýše zbytek z rozpočtu4. Každých0.5s vybírá lampy podle vzdálenosti od **hráče**, do `min(32, light.range+8)` m. Třídění a cut-off jsou ostré, bez přechodové hysterese. Nejde o nezávislý fyzikální model každého viditelného světla.
3. Babylon `Lights/light.js:382–384,659` po `setEnabled` synchronizuje mesh membership. `Materials/materialHelper.functions.js:639–710,856–914` používá pořadí `mesh.lightSources`, typ, falloff a shadow flags pro indexované defines. `SHADOW<n>` vyžaduje také neprázdný shadow renderList. `maxSimultaneousLights` je horní mez; registr43 světel neznamená43 fyzicky přispívajících světel.
4. `StableLightState` stabilizuje pořadí již přispívajících světel. Nemůže odstranit variantu vzniklou přidáním SPOT, změnou skutečné shadow konfigurace nebo potřebného počtu světel. Bezpečně obchází neznámé/frozen materiály a truncated seznamy, kde přerovnání může změnit osvětlení.
5. `client/vehicle-lighting.ts:43–71,106–143,199–238`: svítilna/auto používají Spotlight, standard falloff, range24/32m, intensity1.6 a priority10. První aktivace teprve zakládá shadow generator; mapy128/256/512 dle kvality, u svítilny i na low. OFF nevymaže generator. Castery vybírá podle polohy/času/topologie; draw-time filtr zachovává aktuální enabled stav a frustum.
6. `client/cinematic.ts:37,138,358–365,570–660`: sluneční/měsíční shadow má72m span, texel-snapped focus, broad-phase caster dosah85m, mapy512/1024/2048. Dálková hranice shadow pokrytí je samostatná od světelného dosahu a světelných poolů. Na low se nepoužívají alpha-test castery pro tento celestial pass.
7. Material cap setter vede přes `Misc/decorators.js:17–40` do `_markAllSubMeshesAsLightsDirty` a `material.pure.js:1376–1400,1448` prochází scene meshes/submeshes/draw wrappers. Načítací glTF smyčka `loaders/glTF/2.0/glTFLoader.pure.js:412–426` zvýší cap **všem** scene materiálům i při empty glTF, včetně disabled světel, potom čeká na onReady extension. Guard to opraví přes veřejné loader entrypoints/READY/beforeRender. Zachování této mezery a foreign-scene izolace je požadavek každé další varianty.

**Doloženo:** změna skutečné světelné/shadow sestavy může synchronně invalidovat mnoho material defines; nejde jen o uniform intensity. **Nedoloženo:** přesný poměr preprocessing, shader cache, driver čekání a jiného mainDraw CPU v konkrétních694ms. K tomu potřebujeme kratší cílený trace/profile, ne větší počítadlo kompilací.

### 2.2 Barvy a image processing — potvrzený nesoulad

`client/cinematic.ts:327–350` nastaví ACES, exposure přes `campusExposure`, grade a `applyByPostProcess=false`. `cinematic-art.ts:132–155` nastaví contrast1.09, mírné barevné křivky a exposure1.08 ve dne až1.18 v noci. Textové hodnoty tedy nejsou „gamma na maximum“.

Při první medium/high konfiguraci ale `cinematic.ts:477–509` vytvoří `DefaultRenderingPipeline(..., hdr=true, ..., automaticBuild=false)` a nastaví **`pipeline.imageProcessingEnabled=false`**. Installed `defaultRenderingPipeline.pure.js:224–228` tím zapisuje **`scene.imageProcessingConfiguration.isEnabled=false`**. Observer na404–420 sjednocuje pipeline flag s touto scene konfigurací. `imageProcessingConfiguration.pure.js:556–569` pak vypne TONEMAPPING, EXPOSURE, CONTRAST, COLORCURVES i IMAGEPROCESSING pro materiály, bez ohledu na to, že jejich číselné hodnoty zůstávají uložené. Nastavení `applyByPostProcess=false` samo enabled stav neobnoví. Low detach/medium reattach jej také neobnovují.

To je **prokázaná chyba vlastnictví konfigurace vzhledem k deklarovanému záměru kódu**. Není zatím prokázané, že právě ona způsobuje celý uživatelem popsaný vzhled noci, a není důkazem dvojité gammy. Obnovení zamýšleného ACES/grade může výrazně změnit obraz a musí dostat vizuální přejímku.

#### Schválený in-memory experiment

Root předem schválil jediný no-render experiment. Dne14.10.2026 cca14:12:18 Praha byl spuštěn inline `node --input-type=module` se skutečným NullEngine, Scene, FreeCamera a DefaultRenderingPipeline(automaticBuild=false), bez meshů, assetů a renderu. `finally` zrušilo pipeline, scene i engine; exit0. Veřejné `prepareDefines({}, false/true)` dalo:

| Fáze | Scene isEnabled | applyByPostProcess | Material TONEMAPPING / EXPOSURE / IMAGEPROCESSING | Pipeline flag |
| --- | --- | --- | --- | --- |
| Před pipeline / po ctor | true | false | 2 / true / true | po ctor true |
| `pipeline.imageProcessingEnabled=false` | false | false | 0 / false / false | false |
| Detach low / reattach medium | false | false | 0 / false / false | false |
| `sceneConfig.isEnabled=true` | true | false | 2 / true / true | znovu true |

Exposure1.18 a toneMappingEnabledtrue zůstaly uloženy ve všech řádcích. Postprocess defines byly vypnuté při applyByPostProcessfalse. Experiment netvořil framebuffer ani neměřil GPU. Poslední řádek ukazuje, proč nestačí přidat samotné `isEnabled=true`: při skutečném automaticBuild znovu ovlivní pipeline a její passy.

Dosavadní `tests/cinematic-art.test.ts:58–73` a `cinematic-atmosphere.test.ts:156–194` kontrolují hodnoty a applyByPostProcess, nikoli isEnabled a skutečné material defines. Mohou tedy projít i se zcela neúčinným grade.

### 2.3 Význam jednotlivých barevných vstupů

- PBR avatar: `character-materials.ts:94–136` převádí paletové hex do linear; albedo atlas gamma=true, normal data gamma=false. B4 panel používá explicitně exact sRGB konverzi (`b4-panel-material.ts:7–18`). Neprovádět další globální konverzi těchto již opravených faktorů.
- glTF: `glTFLoader.pure.js:1777–1794,1951–1966,2082` zachovává baseColorFactor a odlišuje color/nonColorData textury. Factor a barevná textura nejsou stejná datová reprezentace. Roughness/normal/AO se nesmějí gamma-dekódovat jako albedo.
- `surface-pack.ts:115–126,144–175` má color gamma=true, normal/roughnessfalse. V podmíněné větvi `retainPavingJoints` kopíruje Standard diffuseColor přímo do PBR albedoColor; to je **kandidát pro cílenou kontrolu factor semantics**, ne oprávnění převést všechny materiály naslepo. Art tint mimo tuto větev je ručně zvolený PBR faktor, nikoli automaticky hex/sRGB data.
- Standard fragment (`Shaders/default.fragment.js:298–303`) převádí složenou barvu do linear při aktivním image processing; PBR skládá lineární světlo a `pbrBlockImageProcessing.js`/`imageProcessingFunctions.js:50–90` řeší exposure→tonemap→gamma→contrast/grade. Obě cesty nelze léčit stejným dodatečným `pow` na vstupu.
- Light bind `Lights/light.js:322–328` násobí diffuse/specular intenzitou; palety a intensity jsou zde umělecké jednotky. Převod všech světel do jiné barevné konvence vyžaduje kontrolu **Standard i PBR** receiverů a nové fotometrické nastavení, ne jeden importovaný vzorec.
- `sky-reflection.ts:90–117` převádí display top/horizon do linear. `cinematic.ts:336–347` ukládá odrazovou krychli jako32×32 RGBA8 s gamma=false; SH polynomial zůstává float. Tmavé lineární hodnoty se zde kvantizují mnohem hruběji než SH. To je kandidát na rozdíl diffuse/specular odstínu v noci; nelze z něj odvodit červený flash. Případné half-float sky cube potřebuje samostatné capability/lifecycle/visual měření.
- Samostatné custom `ShaderMaterial` jsou nyní atmosphere sky a slunce/měsíc (`atmosphere-sky.ts:235,453`, `sky-weather.ts:73–123,155,176`), které přímo zapisují display barvy. **Fotografická tráva nyní používá PBRMaterial** (`photo-grass-source-material.ts`); tree wind je PBR plugin. Komentář cinematic o custom leaf shaders není důkazem aktuální implementace. Fullscreen linear pipeline musí upravit skutečné custom sky/disc výstupy, nikoli přidat druhou gamma transformaci PBR trávě.

### 2.4 Vzdálené lampy a falešné světelné plochy

`streets-renderer.ts:600–630,846–901` tvoří kromě PointLight také11×11m terrain-draped pool: neosvětlovaný StandardMaterial, emissive teplá barva, alpha textura, disableDepthWrite a zOffset−3. Čočky lamp i všechny pooly mají společný noční emisní/alpha stav (`art-lighting.ts:344–350`), nezávislý na výběru nejbližšího1/2 PointLight. Pool tedy není skutečně osvětlená přijímací plocha a nepřebírá dynamickou okluzi jako světlo.

Při vzdáleném pohledu je možné vidět svítící čočku a umělý pool, zatímco okolní stěna nemá příslušný PointLight. Při přesunu hráče se mění výběr bodových zdrojů skokově po0.5s, při otočení kamery se tentýž hráčový výběr nemusí změnit. Přesun kamery, LOD geometrie, kvalita, mlha, bloom, praktické sloty a skutečné shadow pokrytí jsou různé osy. Tento **mechanismus je doložený**, jeho podíl na konkrétní stížnosti musí ukázat synchronizovaný obraz s lamp IDs.

Lampy i svítilna mají záměrně `FALLOFF_STANDARD`; převod na inverse-square bez změny intensity units původně osvětlené PBR silnice naopak výrazně ztmaví. Veřejná dokumentace také rozlišuje emitující materiál, světlo a lightmap — stejné barvy nezaručují stejné osvětlení.

### 2.5 Červené záblesky a readiness

V07c není texture asset-error ani zachycený shader/runtime error; `SceneTextureDiagnostics` je připojen před načítáním (`game.ts:572`, `texture-diagnostics.ts`) a filtruje vlastní scénu. Je to užitečný negativní důkaz, nikoli úplný audit bindingů/pixelů.

- `StandardMaterial`/PBR `allowShaderHotSwapping` standardně dovolují dočasně starý effect při nové kompilaci (`material.pure.js:511`, `pbrBaseMaterial.pure.js:919–944`, `standardMaterial.pure.js:1265–1305`). Readiness a effect-created callback nejsou totéž jako finálně přijatá varianta.
- `BaseTexture.isReadyOrNotBlocking` vrací true také při loadingError (`baseTexture.pure.js:562–563`); to odlišit od skutečného texture ready. Nezpozorovaný/pozdní error nebo chybný sampler lze vyšetřit teprve pro konkrétní plochu.
- Engine emptyTexture je nulová RGBA (`abstractEngine.pure.js:293–297`), ne důkaz univerzálního „červeného chybového shaderu“. Vedle ní existuje konfigurovatelná fallback textura (`EngineStore`, `Tools`, error path naabstractEngine687–690). Není doložené, že byla v07c použita.
- Shader compilation error path (`effect.pure.js:593+`) loguje chybu, zkusí fallback defines nebo dřívější pipeline; nelze bez důkazu označit každý červený pixel za chybu kompilace.
- Game čeká na controllery assets, ale pozdější tree detail streaming a B6 instance visibility pokračují. `vegetation.ts:565–632` publikuje úplný pár větev/listy a používá udržené bootstrap materiály; container se ruší až v dispose. V přečteném lifecycle nebylo prokázáno předčasné rušení tohoto shared materiálu. Kontrola všech budoucích variant/materiálů při startupu dosud není zaručená.
- `forceCompilationAsync` není přesun práce mimo hlavní vlákno. `material.pure.js:1235–1310` synchronně zahájí readiness, vypne hot swapping během kontroly, používá reprezentativní mesh/options a opakuje poll16ms. Prewarm špatného meshe, instancing flagu nebo světelné sestavy může spotřebovat čas a nepokrýt skutečný budoucí draw.

## 3. Porovnání rozumných variant

### Barvy / KEY-14 a kvalita / KEY-4

| Varianta | Přínos a náklad | Vzhled/cache/lifecycle riziko | Rozhodnutí a rozhodující důkaz |
| --- | --- | --- | --- |
| Pouze změnit exposure/contrast/gamma čísla | Minimální diff | Při isEnabledfalse neřeší aktuální kontrakt; po obnovení pipeline by skryté hodnoty znovu změnily obraz | Zamítnout jako první opravu; nejprve skutečné defines |
| Pouze obnovit Scene isEnabledtrue | Obnoví materiálový processing | Observer reaktivuje pipeline imageProcessing; HDR cesta může přidat fullscreen pass nad display custom shadery | Zamítnout izolovaný jednořádkový patch; experiment výše |
| **DefaultPipeline hdr=false, nevolat jeho imageProcessingEnabled=false; materiálový processing zapnutý** | Nejmenší kandidát respektující současný display custom sky; bez fullscreen tone passu, menší LDR buffers | Installed `_buildPipeline:513–525` při non-HDR vytváří IP objekt, ale nepřidá jeho render effect a vrátí applyByPostProcessfalse. Bloom je pak display/LDR efekt; nutno prověřit clipping, quality detach/reattach, config notifications a disposal neaktivního IP objektu | **Preferovaný první omezený fix kandidát**, po lifecycle/defines regresi a skutečných pixelech; žádný FPS slib |
| Vlastní malý BloomEffect+FXAA řetězec bez DefaultPipeline coupling | Jednoznačné vlastnictví image processing, lze zachovat materiálovou cestu | Více kódu pro attach/resize/texture sharing/cleanup; kvalita/bloom vzhled vyžaduje nové porovnání | Druhá volba, pokud veřejná non-HDR varianta nezajistí invariants |
| Sdílená samostatná imageProcessingConfiguration pro Standard/PBR materiály | Oddělí material grade od scene/pipeline flagu | Musí pokrýt všechny importy/replacements a respektovat owner konfigurace, synchronizovat expozici; přibude lifecycle observerů a riziko dvojí konfigurace | Rezerva pro specifické materiálové rozdíly, ne první globální řešení |
| **Skutečný HDR linear řetězec + jeden fullscreen tonemap/gamma** | Konzistentní linear blending/bloom, prostor pro HDR světla | Custom sky/sun/moon musí emitovat linear/compatibility. Low musí mít ekvivalentní processing; nový fullscreen bandwidth/cena, změna oblohy/bloom/transparentních materiálů, další varianty/cache | Dlouhodobě rozumná architektura, větší samostatný scope; zvolit jen když pixelový a GPU A/B přínos převáží |
| Plošně změnit gammaSpace/hex konverze/ACES na jiný tonemapper | Může upravit subjektivní saturaci | Zničí správné PBR albedo/data mapy; může maskovat disabled processing. Neutral vsACES je vizuální volba, ne důkaz opravy | Oddělená kalibrace až po funkčním kontraktu; žádná plošná konverze |
| Half-float sky reflection cube | Omezí noční kvantizaci vůči SH | Capability fallback, memory/bandwidth a aktualizace cubemap; neřeší disabled grade | Měřit samostatně na kovové a matné ploše; zatím hypotéza |

Preferovaná non-HDR větev je odvozena z installed primárního kódu, **nebyla zde renderována ani nově implementována**. Alternativu full HDR nelze odmítnout jen podle počtu řádků; rozhodnou barevné a GPU testy níže.

### Cold světelné změny / KEY-3

| Varianta | Výkon a cache | Vzhled/chování/lifecycle | Rozhodnutí |
| --- | --- | --- | --- |
| Zachovat současnou korekci glTF capů a stable ordering | Brání42slot inflaci a historickému přerovnávání; nerozbíjí owner caps | Neodstraní nové SPOT/SHADOW varianty | Nutný baseline, nikoli hotové KEY-3 |
| Lokální guard fastpath16/16 | Odstraní miliony idle material visits | Zachovává active-loader sweep a frozen retry; potřebuje novou přejímku | Samostatný malý commit/A-B, **ne lék na741ms** |
| Stále enabled lokální světla s nulovou intenzitou | Stabilnější defines; platí se světelná práce i za OFF | Spot/point/hemisphere sloty a shadow samplery stále existují; může vyřadit lampu, přidat shadow pass i za OFF a překročit čtyřslot rozpočet | Jen po návrhu explicitního slot budgetu a měření; současný prostý always-enabled patch zamítnout |
| Fixní světelné proxy sloty s uniform výměnou polohy/barvy | Velký potenciál stabilních shader podpisů | Různé typy a shadow konfigurace nelze libovolně zaměnit; potřebuje minimální fyzikálně ekvivalentní sestavu, per-mesh receiver pravidla a více scénářů B6/auto/torch | Rozumný prototyp až po profilu dominant; širší scope než warmup |
| Cílené postupné prewarm přes skutečné material/mesh/instance/shadow varianty | Přesune cold přípravu do kontrolovaných tasků a využije cache | Zvětší start/cache; kombinace quality/LOD/alpha/instances/lights rostou. Async API stále zahajuje synchronní práci; potřeba cancel/generačního tokenu a správné readiness | Kandidát **pouze pokud trace prokáže hlavní cenu přípravy a malou sadu opakovaných podpisů** |
| GlTF compileMaterials či full-scene isReady/forceCompilation všude | Snadno zapnutelné | Připravuje i nepotřebné/skryté varianty, nesprávný budoucí slot/shadow stav; může prodloužit startup a opakovat cold práci | Nepoužít jako univerzální řešení |
| Per-mesh omezení ovlivněných receiverů / spatial light partition | Menší množina dirty/effect změn | Správnost velkých merged meshes, instancí, LOD a přesahů range; změna include/exclude opět dirty; musí zachovat osvětlení celých budov/terénu | Vyšetřit vedle proxy slotů; vhodné, pokud většina globálně zasažených meshů nemůže světlo přijmout |
| Patch engine/private defines, freeze materiály, zablokovat dirty globálně | Může skrýt symptomy v jedné variantě | Stará světla/textury/stíny, owner konflikty; blockMaterialDirtyMechanism=false sám dirties vše | Zamítnout bez opravy engine s izolovanými regresními důkazy |
| WebGPU/clustered engine migrace/off-thread context | Potenciálně jiný škálovací profil | Nový engine/feature compatibility, shader assets a browser/GPU matice; jiné cache. Není drop-in oprava9.30WebGL | Dlouhodobá alternativa, ne první zásah |

### Vzdálené osvětlení / KEY-15

| Varianta | Přínos | Náklady/rizika | Podmínka volby |
| --- | --- | --- | --- |
| Hysterese/distance fade stávajícího bounded výběru | Omezí přepínání na hranici/oscilační změny | Fade potřebuje současně starý i nový zdroj nebo definovanou výměnu slotu; bez místa může ubírat jiné světlo. Sám neopraví vzdálený receiver | Vybrat pro potvrzené pop-in hranice, s explicitním rozpočtem |
| Sladit emissive lens/pool s fyzikální i vzdálenou reprezentací | Odstraní nesoulad „svítí flek, ale stěna ne“ | Nesmí úplně zhasnout vzdálenou viditelnou lampu; alpha pool je decal, ne light/shadow | Preferovaný malý kandidát pro potvrzený lens/pool/receiver rozpor |
| Výběr podle kamery místo hráče | Jinak prioritizuje viditelné objekty | Při otočení kamery se svět může rozsvěcet/zhasínat; v third-person jiná fyzická lokalita | Není obecná oprava, porovnat jen jako diagnostickou variantu |
| Per-mesh/blokové bounded receiver světlo | Lampy působí tam, kde skutečně mají | Prostorový index, velké sloučené geometry, aktualizace receiverů/LOD; více variant/CPU | Pro plošný vzdálený problém, pokud jednoduchá reprezentace nestačí |
| Statický lightmap/decal impostor pro daleké lampy + dynamic near | Stabilní daleký obraz a nízká cena | Péče o zdrojové UV/terén/okluzi, den/noc, sníh/dešťový vzhled, neplést se skutečným světlem | Smysluplná LOD architektura; samostatné assets/provenance rezervace |
| Všechny43 lampy enabled / výrazně větší range-cap-shadow | Snadný plošný zásah | Shader/fragment a shadow náklady, limit zařízení, nepodložená jasnost a světlo skrz stěny | Zamítnout jako první řešení |
| Inverse-square a fotometrické jednotky | Konzistentnější vzdálenostní model | Vyžaduje nové intensity kalibrace Standard/PBR i emisí; bez nich dnešní silnice ztmavnou | Samostatný art/lighting update až po referenčním rozhodnutí |

### Červené pixely / KEY-13 a případný materiálový shimmer

| Varianta | Kdy pomůže | Riziko / aktuální volba |
| --- | --- | --- |
| Synchronizovaný lokální obraz + bounded identity/readiness/binding kontext | Určí skutečný mesh/material/texture a okamžik přepnutí | **První doporučený krok.** Existující statistiky barvu pixelu neobsahují. Žádný plošný readPixels každý frame |
| Publikovat nový LOD/material až po jeho skutečné readiness, ponechat starý | Pokud flash vzniká při nehotovém asset/effect přechodu | Paměť dvou variant, callback cancellation, při shader change nová readiness. Hranice musí být konkrétní, ne globální skrytí celé hry |
| Vypnout allowShaderHotSwapping pro prokázanou rodinu | Rozliší starý effect vs nové bindy | Může udělat díry/zmizení ploch a další čekání. Nejprve izolovaný QA experiment, nikdy globálně naslepo |
| Opravit reference/lifecycle/sampler color-format chybu | Pokud capture prokáže disposed/shared texture nebo chybný bind | Úzký vlastník cache/materialu; zachovat ostatní správné albedo/data mapy |
| Neutral fallback místo červeného assetu | Jen pokud je identifikovaný skutečný fallback | Maskuje load problém, nemá být náhradou opravy příčiny; nyní není použití fallback doložené |
| Zvýšit AA/mipmap/aniso/roughness, upravit shadow bias | Pokud obraz prokáže aliasing/specular shimmer/z-fighting | Nepomáhá plošnému červenému flash; rozmazání či změna vzhledu. Nejprve odlišit od KEY-12 camera jitter |
| Driver/browser workaround či engine upgrade | Až po reprodukci s korektními bindings a ověření na druhém backendu | Nyní bez důkazu; nesmí být první vysvětlení |

## 4. Měření, které rozhodne

### A. Barevný kontrakt a quality lifecycle — první úzký follow-up

1. Na isolated WT přidat regresi **skutečného controlleru**: low-first, medium-first, high→low→medium, opakovaný detach/reattach, exposure update za low, dispose za low. Assert isEnabled, applyByPostProcess a public prepareDefines pro Standard/PBR; nestačí scalar config. Zachovat počet pipeline builds, identity bloom/FXAA, žádné další observers/textury po dispose. Zahrnout implicitní scene config i explicitně vlastněný material config.
2. Pro kandidáta non-HDR potvrdit skutečnou skladbu připojených camera postprocessů přes veřejné API a renderer evidence: žádný fullscreen ImageProcessing pass, material TONEMAPPING=ACES/EXPOSURE aktivní. Samotný NullEngine nestačí pro barvu.
3. V jedné produkční GPU scéně pevný UTC/počasí/camera/CSS+internal rozlišení a referenční paleta: neutrální matný PBR, Standard, albedo+normal/roughness data, původní dlažební factor, emisní čočka, sky/sun/moon, sklo, vegetace. Srovnat současný wave3, material-side kandidát, a případný skutečný HDR fullscreen prototyp. Zvlášť světla ON/OFF a low/medium/high. Testovat skutečnou noc i den; změnu stylu nezaměnit za opravu kontraktu.
4. Ploché referenční color patch přes quality přechod má mít stejný processing; navržený pracovní práh ≤2 sRGB jednotky/kanál mimo AA hrany, bloom oblast a HDR clipping. Finální tolerance a art preference se přijímá před pixelovým testem. Měřit clipped pixel fraction, střední luminanci a saturaci vybraných ploch, ne jen „vypadá lépe“.
5. GPU/CPU A/B: alespoň3 opakování, stejná trasa/světla/avatary/HUD, explicitně oddělený cold a warm cache stav. FPS/p95/p99/max, total render versus mainDraw/renderTargets, driver/GPU/rozlišení a SHA. Žádný výkonový závěr znovu zvyšovat jen proto, že nový test běžel na low.

### B. Flashlight/auto/quality varianty

Vybrat jeden reprezentativní problémový mesh každé rodiny (Standard/PBR, instanced, alpha/wind, MultiMaterial child) a zachytit **skutečně použitou** variantu a readiness při prvním ON/OFF. Srovnat počty a CPU material preparation/bind vs createShaderProgram call, actual shadow pass a shader-cache reuse. Krátký profiler trace/Spector capture dělat v samostatném QA okně; jeho režii neplést s FPS baseline. Poté rozhodnout mezi úzkou přípravou variant a stabilními sloty/receiver partition. Cílově žádný opakovatelný sekundový blok; pracovní acceptance žádný cold/warm toggle≥250ms v domluveném scénáři a žádná významná steady p95/p99 regrese. Přesný finální frame budget musí odpovídat cíli hry a GPU, ne jen této mezní hranici.

Při prewarm měřit i navýšení startupu a program/cache počtů, paměť, storno během načítání a restart contextu. Nedělat nekonečnou frontu všech kombinací. Nepřipravovat shadow variantu s prázdným renderList a pak tvrdit, že je pokrytý skutečný světelný stav.

### C. Vzdálené lampy

Pevný noční UTC a sucho; označit skutečné mapované lamp IDs. Série: stojící hráč+otáčení kamery, pohyb hráče přes32m/nearest hranici, two-way přechod mezi dvěma lampami, third-person odstup, torch/auto/B6 ON/OFF, low/medium/high. Zaznamenat active lamp IDs, world/camera/player distance, range/intensity, actual receiver lightSources, emissive/pool alpha, shadow source/caster range. Srovnat hlavně stejnou plochu a lampu v sousedních snímcích. Veřejná invarianta: bez změny relevantního světelného stavu nesmí samotné překročení herní heuristiky vytvořit nápadný nespojitý skok. Pokud je potřebná aproximace dalekých světel, její LOD a kalibrace musí být záměrné a zdokumentované.

### D. Červený flash

V izolované QA session lokální synchronizovaný obraz/krátký ring a event timestamp; žádná veřejná publikace profilů či raw osobních dat. Předem zvolit a změřit režii capture. Preferovat externí video/krátký GPU frame capture před permanentním readPixels na hlavním vlákně. Konečné automatické řešení, pokud bude potřeba, musí být bounded a standardně nezasahovat do časování referenčního benchmarku.

Pro zachycený objekt uložit omezené technické identity mesh/material/effect/texture, readiness/loadingError/format/gamma, přepnutí LOD/materialu, frame/asset activity a quality. První rozhodovací bod je **vlastnost pixelu vs whole-frame tint vs konkrétní plocha**, další shader hot-swap vs texture binding vs geometriedepth vs změna světla. Bez tohoto důkazu KEY-13 nezavírat a nedělat globální gamma/AA/driver patch.

## 5. Navazující přesné scopes a pořadí commitů

Koordinátor musí vytvořit rezervace; tento dokument nedává oprávnění zapisovat runtime.

1. **Material-side processing kontrakt (KEY-14/4)**: `client/cinematic.ts`, `tests/cinematic-atmosphere.test.ts`, `tests/cinematic-art.test.ts`, vlastní handoff. Případný malý helper až po dohodě. Volba non-HDR vs jiná architektura podle výše uvedených veřejných invariants. Žádná současná změna art palet, světelných intenzit nebo source textur. Samostatný commit s regresí a popisem změny účinného vzhledu.
2. **Pixel/variant evidence (KEY-13/3/15)**: případný nový `client/visual-material-diagnostics.ts` a jeho testy; root zvlášť rezervuje `client/game.ts`/recorder entrypoints. Vzorkovaný technický výstup, capped state/lifecycle; nepřidávat per-frame full-scene readiness polling. Runtime experiment/capture až v domluveném GPU okně.
3. **Lamp continuity (KEY-15)**: po obrazu `client/art-lighting.ts`, případně `client/streets-renderer.ts` pro vazbu pool↔lamp, `tests/art-lighting-budget.test.ts`, `tests/night-lighting.test.ts` a nový cílený test selection lifecycle. Zachovat skutečné pozice/provenienci; neměnit shared kolize ani generovat assety v tomto scope.
4. **Cold variant práce (KEY-3/4/8)**: podle trace buď úzký nový material-preparation scheduler + jeho test, nebo konkrétní light slot/receiver modul; integrace `game.ts` samostatně u root. `vehicle-lighting.ts`, `stable-light-state.ts`, `art-lighting.ts` rezervovat jen podle vybrané varianty. Prewarm, nové sloty a image processing nemíchat v jednom commitu, jinak nebude možné určit příčinu A/B výsledku.
5. **Konkrétní asset/gamma-factor/shimmer fix** až po důkazu konkrétní rodiny. `surface-pack.ts` conditionalfactor, sky cube precision či normal/AA zásah každý samostatně. Geometrie, textury a Blender změny vyžadují vlastní vstupy/výstupy a provenance.

Po každém celku: cílený refaktoring a testy, typy podle dotčeného scope, konkrétní commit v isolated worktree, průběžná aktualizace Linearu po výzkumu/volbě/implementaci/ověření/integraci; root převezme do main po konkrétním diffu a důkazech. Full test/build/integration a GPU nad stabilním snapshotem včetně testů; nezapisovat do uživatelem hraného buildu. **Výzkum doporučuje nejprve opravit potvrzený image-processing kontrakt; nepředstírá tím vyřešení červeného flash, vzdáleného světla ani cold hitch.**

## 6. Primární podklady a meze

Installed soubory/řádky výše jsou rozhodující pro Babylon9.30; aktuální webové Babylon Lite API není kontrakt této hry. Oficiální doplňky přečtené14.10.2026:

- [Babylon Image Processing](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/image_processing/): fullscreen pass očekává linear vstup, custom shader musí sladit IMAGEPROCESSINGPOSTPROCESS/compatibility, více processing kroků může barvy zpracovat opakovaně. Dokument tento projekt sám nediagnostikuje.
- [Babylon Introduction to Lights](https://doc.babylonjs.com/features/featuresDeepDive/lights/lights_introduction/): finite material light budget, cena dalších světel, range, enabled/intensity, include/exclude a lightmaps. Přesné pořadí a dirty chování ověřeno v installed source, ne odvozeno jen z obecného popisu.
- [Babylon Shadows](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows/): shadow map/filter/bias a coverage jsou samostatné od barvy světla. Konkrétní rozsah a časy tohoto projektu pocházejí z kódu/logu.

V tomto výzkumu proběhlo pouze čtení, SHA parity vybraných souborů, streamovaná analýza archivního logu a **jeden předem povolený in-memory NullEngine veřejný kontrakt bez renderu**. Žádný nový screenshot, GPU/performance benchmark, build, test suite, server, změna node_modules nebo runtime patch. Chybějící pixelový důkaz zůstává explicitní.
