# Sezónní geometrie a materiál stromů

Rozhodnutí před implementací, 25.10.2026. Scope tasku trees-20261025-season-rendering; fenologie a loader mají jiné vlastníky. Výchozí authoring kontrakt byl skutečně exportovaný jako GLB: COLOR_0 je normalized UNSIGNED_SHORT VEC4, RGB1, alpha rank1..65534/65535 konstantní v celé leaf/twig komponentě i mezi LOD. Rank musí být rozprostřený v tomto rozsahu, nikoli malé pořadové číslo1..N. Komponenty s vyšším rankem padají dříve.

## Primární mechanismy a volba

Pinovaný Babylon9.30 `SubMesh.IsGlobal` závisí i na indexCount; nulový/částečný rozsah již není globální. `refreshBoundingInfo` nad nulovým rozsahem může vytvořit prázdné bounds. Proto helper používá uložené plné lokální bounds a vlastní submesh BoundingInfo; následná aktualizace neodvozuje obálku od právě prázdného index prefixu. Loader nahraje seřazené indices jednou do prototypové Geometry; Mesh klony sdílejí buffery a mají vlastní SubMesh indexCount. Enable/hide zůstává loaderu kvůli součinu season×LOD, zejména po late load.

Alternativy: material.alpha by odstranilo foliage ze stínových casterů a zatěžovalo blend/sort; shader discard zachová vertex práci; každoframová kompakce/upload vytváří zbytečnou práci a ownership riziko. Zvoleno je jednorázové stabilní řazení celých trojúhelníků podle ranku a binary prefix. Vstupy se nemění; validují se RGB, kvantizace, rozsah a shodný rank tří rohů. Sdílený vrchol tak také vynucuje konzistenci navazujících trojúhelníků. Kontrola celé komponenty napříč odpojenými částmi zůstává exportnímu kontraktu.

PBR `vertexColorMixing` ponechává `vColor.a=1`, když VERTEXALPHA není zapnuté. Raw `color` atribut je přesto vec4. Pro komponentové vybarvení lze přenést raw alpha vlastním varying při VERTEXCOLOR, bez účasti v opacity. Materiál musí zachovat alpha1, ALPHATEST a VERTEXALPHA=false; CPU actual Effect i native WGSL preprocessing tyto větve prověří. Viditelná i shadow geometrie používají totožné indices; materiál není použitý jako náhradní opad.

Nový TreeSeasonMaterialPlugin a TreeWindPlugin mají vlastní getClassName i stabilní explicitní feature define. V pinovaném manageru se při přidání pluginu hlavní class marker ukládá pro poslední přidanou třídu; explicitní defines zajišťují rozlišení také kombinace wind+season versus season-only. Defines se nemění s minutou, rodinou ani vybarvením; nové hodnoty jdou hard-bind UBO pro konkrétní rendering mesh. Žádné nové textury ani překomplikování na každý snímek.

Tónování pracuje s již lineárním fotografickým albedem, zachovává jeho luminanční detail a samostatné normal/roughness/alpha mapy. Jarní změna je slabá; podzimní zlatohnědá paleta je označená jako autorská, není naměřenou optikou místního druhu. Evergreen má podzimní tónování vypnuté. Výsledný vzhled vyžaduje pevné GPU A/B; CPU shader source není důkaz obrazového výsledku.

Nové lokální normály označené `mesh.metadata.treeNormalSource='authored-local'` se nesmí přepsat starou72% crown proxy. Legacy asset bez tohoto označení si ponechává dosavadní normály, konfiguraci PBR i chování.

## Přesná integrační API

`createTreeSeasonGeometryPlan(indices:ArrayLike<number>, colors:ArrayLike<number>)` přijímá normalizovaný RGBA Float32 výstup/dekódování GLB, nikoli raw Uint16 hodnoty. Vrací `{vertexCount,indices:Uint16Array|Uint32Array,ranks:Uint16Array,indexEnds:Uint32Array}`; objekt je readonly, buffery vlastní prototypový loader. Seřadí trojúhelníky stabilně podle ranku, neobrací winding; shodné ranky se vždy vyberou společně. Kvantizace toleruje pouze Float32 chybu normalizovaného uint16. Zdrojové arrays se nemění.

`treeSeasonIndexCount(plan,leafAmount)` provede binary search s prahem `floor(leafAmount*65535)`. Přijímá pouze konečnou hodnotu0..1; count0 je hide signál, count pro1 je plný index buffer. `applyTreeSeasonGeometry(mesh,plan,leafAmount)` vyžaduje jednu submesh a již jednou nahrané plan.indices, nastaví indexStart0/indexCount, hasVertexAlpha=false a plné vlastní SubMesh bounds. Neprovádí GPU upload, MeshBuilder ani setEnabled. Loader je vlastníkem season×LOD enabled stavu. Před prvním apply musí nastavit plné Mesh bounds včetně wind paddingu (TreeWind posun při16m/s nejvýše0,099m v lokálnímXZ); helper tuto obálku uchová. Pouhý padding submesh nestačí pro dřívější mesh frustum test.

Pro material factory: jednou `new TreeWindPlugin(material,windState)` a `new TreeSeasonMaterialPlugin(material)` před první kompilací; neměnit pořadí registrace mezi vlastníky. Na jednotlivé klony `setTreeSeasonMaterialState(mesh,family,phenology)`. Uniformy se čtou z konkrétního rendering mesh, nikoli ze sdíleného materiálu. Babylon Mesh.clone sdílí metadata objekt, proto první setter vytvoří samostatný mělký envelope a state; další změny pouze přepíší jeho odkazy. Obě cache jsou WeakMap s klíčem mesh, ne seznam neomezených sourceID. Žádný vlastní dispose/render observer není potřeba.

Při místním podzimním vybarvení se používá raw color.a ve vlastním `vTreeSeasonRank`; běžné PBR vColor.a není použité jako opacity ani rank. Bez color atributu je stabilní fallback0,5 pro legacy materiály. Normální/shadow průchod se shodují přes index subset, bez dodatečného maskového shaderu. Pro nové barevné transmise loader používá již tónované albedo (`useAlbedoToTintTranslucency=true`) bez další raw-green translucencyColorTexture; legacy konfigurace zůstává vlastní původní cesta.

## Cílená evidence

```text
node node_modules/tsx/dist/cli.mjs --test tests/tree-season-geometry.test.ts tests/tree-season-material.test.ts tests/tree-effect-identity.test.ts tests/tree-appearance.test.ts tests/wgsl-vegetation.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Poslední cílený běh: **19/19 PASS**, exit0, **5,290s**, `.cache/trees-season-rendering-20261025/targeted-tests.log`. Dva klony sdílejí skutečný index buffer, ale v main i skutečném ShadowGenerator passu odešlou nezávisle6/18 indices. Winter→compute→explicit refresh→move→partial foliage zachovává plné bounds a identitu bufferu i při100 dalších apply. Toto je CPU draw-call důkaz, nikoli GPU obraz nebo výkon.

Actual PBR Effect fixture používá normalized UNSIGNED_SHORT vertex buffer, skutečné vlastní defines VERTEXCOLOR/ALPHATEST bez VERTEXALPHA/ALPHABLEND, zdrojové mapy a shader injection. GLSL ponechává neaktivní `#if` větve pro driver; test proto nekonstatuje nepřítomnost textu opacity kódu, ale prokazuje jeho guard a vypnuté skutečné flags. Native WGSL prochází skutečným Babylon preprocesorem pro regular/thin/tangent kombinace a neaktivní alpha větev je odstraněná. Native GPU kompilaci musí potvrdit root.

Cache fixture mění jen veřejnou legacy plugin identitu/feature flags, nikoli engine cache: prokazuje špatné sdílení skutečného Effect v obou pořadích a jeho odstranění pro wind/season/combined; stejní combined owners nadále sdílejí Effect s různými UBO. Aktualizace fáze na zmrazeném materiálu nevytváří nový program. Další test kryje sdílené metadata clone vzniklého až po nastavení zdroje a jejich následnou izolaci. Legacy eviction fixture nyní používá skutečný konstruktor TreeRenderer, source-regex počet volání nahradilo skutečné zpracování dvou zdrojových LOD se zachováním rootu/indices/mesh i material count.

První testovací příkaz se kvůli chybějícímu cache adresáři vůbec nespustil. První skutečný běh měl18/19 (příliš silné testové očekávání odstraněného neaktivního GLSL textu); jeho log `targeted-first.log` zůstává. Přesun rendereru odhalil zastaralý source-regex a porovnání interní Vector3 dirty vlajky místo souřadnic; obojí nahrazeno skutečnými runtime invarianty. Celkový meziběh tsc zaznamenal pouze přechodnou cizí integraci flowerBloom; výsledek finálního tsc a manifest jsou v handoff.

Žádné nové assety, engine patch, GPU, build, fullsuite, server, instalace, staging ani commit. Barva/paleta, alfa hrany a výkon čekají na statickou přejímku celé hry. V1 geometry bez komponentového ranku nemá touto změnou vymyšlené ranky; postupný geometrický opad je vlastnost nového kontraktu.
