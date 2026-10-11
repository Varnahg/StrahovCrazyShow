# Materiály, odrazy a světlo reality packu

Tato sada dává zdrojované geometrii konkrétní materiály, kontakt se zemí a odrazy aktuální oblohy. Není tvrzením, že browserová hra dosáhla vizuální úrovně Hogwarts Legacy. Přesnost terénu, rozmístění, fasád a interiérů dokumentují ostatní části reality packu.

## Podklady a jejich význam

Původní CC0 mapy **Asphalt033**, **Concrete034**, **Plaster001** a **Grass001** pocházejí z [ambientCG](https://ambientcg.com/), [licence CC0](https://docs.ambientcg.com/license/). Manifest `public/textures/surfaces/manifest.json` obsahuje primární URL, SHA-256 archivů, jednotlivých kanálů a délky souborů. Stažené JPG nebyly překresleny. Jde o obecné materiálové předlohy, nikoli fotogrammetrické skeny asfaltu nebo stěn na Strahově. Fotografie ČVUT a identifikovaná panoramata určují architektonickou typologii samostatně; nejsou použité jako textury.

Všechny čtyři barevné předlohy byly přímo vizuálně zkontrolované. Asfalt má jemné šedo-hnědé kamenivo, beton podlouhlé stopy výroby a omítka drobný nerovnoměrný povrch. Grass001 zobrazuje různorodou krátkou trávu s listy a plevely; poskytovatel ji označuje jako procedurální materiál, nikoli fotografický sken. [Oficiální stránka Grass001](https://ambientcg.com/a/Grass001) výslovně uvádí rozměr přibližně 1,4 × 1,4 m. Rodina doplňuje kresbu půdy pod samostatně animovanými trsy, nemění jejich umístění ani vítr. Šedý betonový štít má jemný šedo-olivový násobitel albeda, aby nesplýval s bílou omítkou. Tento odstín je fotografická interpretace, ne kolorimetrické zaměření.

## Runtime

`SurfacePack` převádí jen materiály výslovně označené `surfaceKind`. UV jsou metrické: při `uvMetresPerRepeat=3` znamená jedna původní UV dlaždice 3 m. Asphalt033 se opakuje po 2,5 m, Concrete034 po 1,1 × 0,55 m, Grass001 po 1,4 × 1,4 m a Plaster001 po 1 m; rozměr omítky je výtvarná aproximace. Dlažba a kostky si zachovávají vlastní členění a tón, ale dostávají normálu a roughness skutečného betonového povrchu. Celé fasádní atlasy obsahující okna a všechny `nightWindows` materiály se nepřepisují.

Barevné mapy mají `gammaSpace=true`; normal/roughness jsou lineární. Samostatná grayscale roughness používá zelený kanál a nedělá ze svého modrého kanálu kov. Kovy ani ambient occlusion zde nejsou vymyšlené. Déšť mírně ztmavuje a vyhlazuje asfalt; není to simulace louží nebo odvodnění. Nízká kvalita ponechává barevnou kresbu a roughness, vypíná jen nejméně viditelný normal sampling omítky.

`CinematicAtmosphere` přidává jeden skutečný PCF stín slunce, 512/1024/2048 px podle kvality, pevný 72m výřez u hráče a texelové ustálení projekce. Pohyb kamery ani hráče se nezaokrouhluje. Přímé sluneční stíny jsou vypnuté pod horizontem a v noci; měsíční světlo dál řídí astronomický modul. Výběr casterů respektuje `depthCaster: false | 'opaque' | 'alpha-test'`, aktuální viditelnost a vzdálenost. Plochy země stíny přijímají. Vzdálení hráči nevytvářejí tisíce jednotlivých casterů. Vlastní avatar ano. Nízká kvalita vynechává listové alpha stíny; větve a budovy zůstávají. Na střední/vysoké kvalitě `ShadowDepthWrapper` používá stejný deformovaný vertex shader a stejný alpha discard listů jako viditelné koruny.

Odrazová cubemapa 32 × 32 px na stranu vychází ze skutečně používaných barev oblohy a horizontu. Ukládá lineární data, má CPU integrované sférické harmonické koeficienty a nepotřebuje GPU readback. Aktualizace probíhá při změně palety, nejvýše jednou za dvě sekundy; intenzita prostředí klesá se skutečným denním světlem. Nepoužívá HDR fotografii cizí krajiny. Průhledná B6 okna mají Fresnel odraz a zvýšení opacity na hranách, při čelním pohledu zachovávají průhled ven. Závěsy, žaluzie i teplé emisivní masky simulovaných osvětlených pokojů zůstávají původní.

ACES běží v jednotlivých Standard/PBR materiálech. Vlastní shadery oblohy a vegetace už vypisují display barvy, proto se přes celý obraz nedělá druhá gamma/tonemapping. Střední a vysoká kvalita mají mírný bloom a FXAA; nízká tyto postprocesy nemá. Nevzniká těžká volumetrika, plošné SSAO nebo voxelové osvětlení.

## Praktické ověření

Při spuštěném klientu a serveru otevři [porovnávací scénu](http://127.0.0.1:5173/docs/reality-pack/materials/preview.html). Obě strany používají stejnou geometrii B6, kameru a aktuální meteorologický zdroj. Diagnostická rovná plocha není součástí herního mapového modelu. Přepínače skutečný čas / den / noc jsou označené. Kresba povrchu je vidět nejlépe v pohledu „Povrchy zblízka“. Tento náhled není měřením výkonu celé hry.

Šest testů `tests/cinematic.test.ts` ověřuje metrické UV a rectangular concrete, skutečnou PBR konverzi včetně roughness/gamma a zachování dlažby, lineární cubemapu, stabilitu projekce při malém pohybu i v zenitu, explicitní výběr casterů a zachování průhlednosti/emisivní masky B6. NullEngine nepodporuje skutečnou raw cubemap na GPU, proto není používán jako důkaz jejího vykreslení. GPU průchod, screenshoty a přesné parametry jsou v `browser-qa.json`.

GPU ověření z 10. 10. 2026 proběhlo na Intel UHD Graphics 630 / ANGLE D3D11, WebGL 2.0, dvě srovnávací plátna po CSS i interně 631 × 468 px, střední kvalita. Potvrzeno načtení všech 12 původních kanálů a skutečné průchody stínovou mapou. Pět uložených screenshotů zachycuje denní fasádu, povrchy, trávu, stíny a noční okna. Kontrola našla skutečnou chybu: Babylon `DynamicTexture.clone()` nekopíruje canvas pixely, takže klony B6 skla ztratily žaluzie a teplou emisivní masku. Architekturální modul nyní sdílí originální textury a noční snímek prokazuje střídání rozsvícených a tmavých oken. Po čistém načtení finálního náhledu nejsou chybové ani varovné logy. Dvě starší chyby BRDF callbacku během HMR likvidace načítané náhledové scény jsou zachované v QA; nejsou zamlčené jako bezchybný stabilní běh. Náhled byl po auditu zavřen, aby nezatěžoval hlavní výkonový test.

Primární technické podklady: [Babylon – shadows, directional projection a ShadowDepthWrapper](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows), [Fresnel parameters](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/fresnelParameters), [PBR materials](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/physicallyBasedMaterial), přímo instalované Babylon 9.30 `.d.ts` a shaderové zdroje.

```powershell
pnpm exec tsx --test tests/cinematic.test.ts
pnpm exec tsx docs/reality-pack/materials/audit.ts
```

Limity: prostorové odrazy budov a postav, interiérové GI, kontaktní stíny vzdálených avatarů, změna materiálů podle sněhové pokrývky a skutečné kalibrované photogrammetry povrchy zde nejsou. Měření FPS v celé produkční hře s relacemi, HUD a novou geometrií musí provést hlavní integrační audit.
