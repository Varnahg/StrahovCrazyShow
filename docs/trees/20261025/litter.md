# Omezený opad pod korunami

Rozhodnutí před implementací 25.10.2026. Opad je vizuální model podle stejné rodiny/seed/fenologie jako strom, nikoli naměřené množství místních listů. Root dodává actual sourceID, root XZ a odhadnutý crownRadius přes `setTrees`; bez season state se nic nevytváří. Referenčně holý strom nedostává opad automaticky; evergreeny používají pouze malé větvičky z fir atlasu, nikdy LeafSet024 listy.

Zvoleny jsou malé statické merged patche s několika čtyřtrojúhelníkovými component fans (4 rohy+střed). Každý vrchol leží na skutečném `groundHeight` +6–8mm, nad přírodními mapovými povrchy do2,5mm. Normály pocházejí ze stejného terénu. Celý půdorys se kontroluje proti společným building/path/street/reality-surface výlukám, včetně středů hran; listy nepřeklenou chodník díky pouhému povolenému středu. Toto není změna kolizí.

Varianty: částice by zbytečně simulovaly/aktualizovaly statický opad; thin instances vyžadují další prewarm/binding cestu a správu jejich celkových bounds; kopírování source materialu přenáší wind/plugin state. Proto vlastní obyčejné PBR materiály sdílejí jen již načtené Texture objekty a používají již ověřený season shader pro odstín mrtvého materiálu, bez větru. Původní pixely, gamma/wrap/filter a ostatní vlastnictví map se nemění. Dispose vlastních materiálů je bez forceDisposeTextures. Source/texture/scene dispose ukončí závislý controller; žádný nový texture request ani async material install nevzniká.

UV pochází z komponentového metadata `shared/data/tree-leaf-components.json`. Blender v=1−y/H se převádí zpět na top-left v pro přímé mapy invertY=false. LeafSet024 zachovává fyzické40cm měřítko celého atlasu, tedy listy kolem12,5cm. Fir používá jen dva malé samostatné twig výřezy s autorskou délkou4–10cm, protože poskytovatel jejich fyzickou délku nedokládá. Je to model drobného jehličnatého detritu, ne botanická inventarizace. Rozlišení a originály se nepřevzorkují.

Patch radius je nejvýše3,5m a vždy uvnitř0,85×crownRadius. Kandidátní hustota6/m² má hard cap192 komponent/patch a nejvýše768 pokusů. Rozpočty low/medium/high:3/5/8 aktivních patchů,128/384/768 komponent,512/1536/3072 trojúhelníků. Cache má nejvýše16 meshů; per-source prázdný výsledek je negativně cachovaný ve vstupním katalogu s limitem512 identit. Cold vzniká nejvýše1 patch na výběrový tick0,25s; stabilní teplé snímky nic negenerují ani neuploadují. Sezóna mění pouze skutečný prefix indexů podle `litterPotential × ground.litterRetention`; společný cap je striktní i při změně kvality.

Výběr je blízký úsečce kamera–hráč; běžné engine frustum culling zůstává živé každý frame. Mikrodrift menší než0,25m nezpůsobuje nové rozhodování. Při změně date/quality/source se prefix/rozpočet přepočte, ale existující body se nepřemísťují. Žádný FPS slib bez skutečné hry.

Prewarm má retained skutečnou component geometry pro každý dostupný materiál, se shodnými NORMAL/UV/COLOR a hasVertexAlpha=false jako patche. `beginPreparation` je generovaný lease; starší cleanup nevypne novější přípravu. Helpery se explicitně kreslí jen za rootovým startup cover. `preparationRevision` je stabilní objekt po celou dobu vlastnictví; po dispose je undefined. Žádný nový thin-instance shader.

## API a vlastnictví

```ts
new TreeLitter(scene, { leafMaterial: PBRMaterial, twigMaterial?: PBRMaterial });
setTrees(sources: readonly TreeLitterSource[]): void;
update({ time, quality, player, season? }): void;
beginPreparation(): () => void;
readonly preparationRevision: object | undefined;
readonly stats: TreeLitterStats;
dispose(): void;
```

`TreeLitterSource` je `{id,x,z,crownRadius,family,seed}`. `setTrees` je transakční, přebírá vlastní kopii popisu, stejné hodnoty nezpůsobí invalidaci; změna/root removal uvolní příslušný starý patch. Root dodává stejnou family/seed jako TreeRenderer. Cizí textury/materialy nesmí být disponovány před závislým litter controllerem; jejich dispose je také sledované jako nouzové ukončení. Přímé atlasové mapy vyžadují invertY=false, UV0 a jednotkovou UV transformaci. Vlastní PBR není clone source pluginů: nesmí se tak přenést wind, jeho cache nebo sdílený mutable uniform owner.

Stats `activePatches`, `activeItems`, `triangles` jsou skutečné enabled prefixy, nikoli GPU viditelné počty. `cachedPatches`, `cacheBytes` uvádějí cache a její geometrický payload, nikoli měřenou VRAM. `generatedPatches` je kumulativní cold práce, `pendingPatches` čekající výběr; `ready`, `preparing`, `supportsTwigs` odlišují připravené zdroje. Helpery nejsou běžný opad; nejvýše2 navíc mohou být aktivní jen během startup lease. Celkem nejvýše16 cached meshů +2 retained preparation meshe.

Kandidát s kladným, ale menším než jednokomponentovým sezónním příspěvkem se negeneruje. Již zjištěná kapacita/prázdnost zdroje zůstává jako malé bounded metadata i po eviction, takže nevzniká trvalé generování/eviction prázdných prefixů. Warm generátor se znovu nevolá ani při opakovaném setTrees se stejnými daty. Prefixy používají sdílený ověřený TreeSeasonGeometry helper a jeho plné SubMesh bounds.

## Prostorová shader příprava

Pouhé alwaysSelect v originu by nezaručilo správné prostorové přiřazení světel. Proto se během aktivní lease helpery umísťují **1,2m před skutečnou kameru a0,1m níže** (vzdálenost respektuje near clip). Anchor se aktualizuje při begin i při update **před cadence a texture-ready návraty**. Mění se pouze transform/bounds retained meshů; VBO/index buffer zůstává stejný. Rootův startup cover skrývá krátkou skutečnou PBR kresbu. Po aktuálním release se helpery vypnou a dál neposouvají. Nezasahuje se do Actoru, kamery nebo ovládání.

## Ověření

```text
node node_modules/tsx/dist/cli.mjs --test tests/tree-litter.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Finální cílený běh **9/9 PASS**, exit0, **3,672s**, `.cache/trees-litter-20261025/targeted-final.log`. TypeScript **PASS**, exit0, `typecheck-final.log`. Testy používají skutečné source koruny/mapové výluky/groundHeight a Babylon NullEngine PBR/Geometry. Ověřují determinismus, každý terrain vertex, top-left UV proti původním pixel bounds, skutečné prefix caps, stabilní index buffery, cache eviction/rebuild, vyloučenou korunu, zanedbatelný kladný modelový opad, malé jehličnaté výřezy a nulový opad referenčně holého stromu.

Prewarm test kontroluje všechny NORMAL/UV1/VERTEXCOLOR flags, vypnuté VERTEXALPHA/ALPHABLEND/INSTANCES a shodné helper/live defines. Druhá prostorová regrese používá skutečný `VehicleLighting("player")` a `GltfLightBudget`: dvě různé pozice/otočení kamery včetně kroku0,001s uvnitř cadence, in-frustum bounds, skutečné lightSources a SPOTLIGHT defines. Disposal test prokazuje zachování zapůjčených map, idempotenci, source shutdown, partial constructor failure a absenci nové instalace po pozdní readiness. `createTexture` spy po pořízení borrowed zdrojů zůstává0.

První tsc odhalil pouze chybné použití Vector3.DistanceSquared s plain Vec3; nahrazeno stejným bezalokačním skalárním výpočtem. První přidaný spatial-prewarm test vyžadoval neimportovaný Ray side effect; nyní používá explicitní očekávaný směr z nastaveného targetu a skutečnou frustum projekci. Původní logy zůstaly v cache.

Nebyl spuštěný GPU/browser, Blender, build, fullsuite, server ani instalace. NullEngine neprokazuje obraz ani výkon. Root ověří čitelnost drobných komponent, vrstvu proti terénu a trávě, alfa hrany, barevnou interpretaci mrtvého materiálu a actual FPS/p95/p99 na pevných scénách. Zde není tvrdý bodový botanický průzkum ani předstíraný fyzikální model rozkladu/odnosu.
