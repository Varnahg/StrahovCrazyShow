# B6: foto podložené vybavení interiérů

## Revize kvality R2 — 25. 10. 2026

Původní zjednodušené bloky skříněk uživatel nepřijal. Stejná celá pokojová fotografie byla znovu prohlédnuta: hnědý dřevěný korpus, část otevřených polic a světlá zavřená dvířka s malým kulatým úchytem. Horní skříňka má nyní bočnice, záda, dno, strop, polici a samostatná světlá dvířka; spodní skříňka má otevřenou horní polovinu. Přilehlé police mají záda a bočnici, nepokračují plným materiálem skrz zavřenou skříňku.

Panely18mm, spáry3–4mm, malé osmiúhelníkové úchytky a chamfer1,5mm jsou autorské rozměrové odhady podle fotografie. `beveled_box` vytváří uzavřený analytický panel26faces/44tri, bez Blender modifierů nebo objektu pro každý panel. UV frame je panel-local v Blender metrech; stejný origin/axes přebírají hlavní i bevel plochy. Integrátor ukládá `Geometry.face(...,uv_frame=...)` souběžně s faceMaterials a při UV tvorbě předá finishemu. Existující floor/role/material batches zůstávají.

Plánovací půdorys a kolizní příznak spodní skříňky zůstávají. Skutečné panelové kolize jsou podmnožinou bývalého plného boxu; nevzniká neviditelný proxy collider. Úchytky jsou noncollision a vystupují7mm před původní obálku; police/horní skříňka zachovávají noncollision. Koordinátor tuto interpretaci přijal, skutečný Actor musí ověřit po nativní tvorbě. Orientace umístění šablony zůstává kvůli zachování všech původních průchodů; není tvrzením přesného inventáře každého pokoje.

Ověření: **21/21 interiors CPU PASS** (0,695s), včetně AST skutečné Geometry, uzavření všech hran bevelu, kladného objemu, disjunktních korpusových panelů, světlých dveří/otevřené dutiny a stabilní UV báze. Čisté porovnání proti HEAD e7ef3ff6 na skutečné receptuře SHA `e533bb5d7df909746f4f0dc171de8cc332b85ba10e25f4b76958e9f53db8dee8`:264roomWalkPaths a3244plánovacích kolizních obálek shodných, žádné nové skips; počet items13639→14095 kvůli456noncollision back/end panelům. Evidence `.cache/b6-photo-interiors-20261024/quality-r2/plan-comparison.json`;17,225s čistého CPU, žádný Blender/GPU/physics world. Nativeexport/render a celkový výkon zatím patří rootu; old snapshot2591/source-v4 beze změny.

Implementace `scripts/cad-buildings/b6_furnishings.py` zařizuje pouze explicitně klasifikované místnosti skutečné B6 receptury. Výkres určuje prostor, podlaží, dveře, okna a polohu hygienických předmětů. Fotografie dodané uživatelem 24. 10. 2026 určují vzhled; datum jejich pořízení není známé. Rozměry nábytku a výšky zařizovacích předmětů jsou autorské odhady, nikoli zaměření.

## Podklady a rozhodnutí

Prohlédnuto všech šest nezměněných uživatelských příloh v lokální cache koordinátora. Pokojová fotografie (`a689950942d17ec2ebff17d77cbf45abe2df850aa73381d83ed0fb1963ca90e9`) ukazuje dvě postele podél stěn, krémovou a tyrkysovou přikrývku, dvě pracovní místa s tmavými židlemi u okna, pravostranné dřevěné police/skříň, radiátor a béžové boční závěsy. Koupelna (`8bd41d9646499d743bbcaee6f4e32e2c5acaac40c7dbb3d4e34c1a3bc891d126`) dokládá tři oddělené sprchy s lila závěsy, protilehlé řady bílých umyvadel, chromové baterie, zrcadla a horní větrací potrubí. Fotografie B2 slouží pouze jako stavební typologie a neurčuje B6 vybavení. Raw fotografie ani CAD se do Gitu nekopírují.

Klasifikaci poskytuje source helper v `prepare_b06.py`: `usage`, `usageBasis`/`sourceBasis`, `usageSourceEntities` a u hygieny `sanitaryFixtures` se skutečným `centerCad`, `boundsCad`, `size`, `facingCad` a source handles. Počty nejsou přepsané ze schematické inventury ani násobené z jedné fotografie. Konkrétní N01 má jiné počty umyvadel a pisoárů než vyšší patra.

Zvažované varianty: vyplnit všechny room polygony jako ložnice by chybně zařídilo chodby, technické místnosti a střechu; volné rozmístění podle fotografie by nerespektovalo CAD příčky. Zvolený postup kombinuje explicitní CAD užití s proporčními pokojovými sestavami a jednotlivými skutečnými sanitárními symboly. Neznámé užití se nezařizuje. Chybějící provenance, neplatné geometrie nebo nedoložená hygiena se nepřevádějí na tichý úspěch.

## Geometrie a průchody

Každý běžný pokoj N01–N06 má dvě postele 0,75×2,00 m, matrace, odlišné přikrývky, nízkopolygonové polštáře, dvě pracovní desky s nohami, dvě židle, malé monitory, dřevěnou skříň/police, radiátor s žebry a otevřené boční závěsy. Ve skutečných pokojích vychází mezera mezi postelemi **0,699–0,701 m**. Chráněný střední pruh má nejméně 0,60 m proti průměru kapsle se skinem 0,54 m. Rozšíření krajních pokojů u okna nesmí posunout postel přes užší dlouhou stěnu; šířku odvozuje společný průřez skutečného polygonu.

Pro každé otevřené dveřní centrum se chrání 0,60m široký průchod do vzdálenosti 0,74 m na obě strany: 0,45m approach + 0,27m capsule radius/skin + 0,02m rezerva. Fixed párové křídlo není další průchozí cíl. Kontrola celého půdorysu předmětu zahrnuje rohy, překřížení konkávních hran i díry; samotný bounding box nestačí.

Hygienické mísy jsou uzavřené nízkopolygonové profily s dutou vnitřní částí, nikoli jednobarevné hranoly. Kolize používají hrubá tělesa nábytku, mísy, sedáky, pracovní desky, vaničky a bočnice; šrouby, trubky, závěsy, zrcadla či jemné nohy nové drobné kolize nevytvářejí. Geometrie se dávkuje podle `(floor, role, material, collision)`; role začínají `interior-furniture/` nebo `interior-sanitary/`.

Sanitární footprint má oproti přesnému CAD symbolu 2mm obvodový odstup, protože room loops jsou zaokrouhlené na 1 mm. Zdrojový střed se neposouvá. Jediná další adaptace je první sprcha N06/544b: skutečný zdrojový sloupek (room9FA, strong7BB/7BC) překrývá roh symbolu. Vana má pouze vyříznutý roh podle exact room polygonu a bočnice končí u existujícího sloupku. `sourceAdaptations` uchovává původní střed, bbox, handles a označení modelářské interpretace. Šířková tolerance se kvůli tomu nezvyšuje.

Materiály se domlouvají s finishes helperem: `b6_wood`, `b6_fabric_cream`, `b6_fabric_teal`, `b6_fabric_blue`, `b6_metal`, `b6_chrome`, `b6_ceramic`, `b6_mirror`, `b6_curtain`, `b6_shower_curtain`, `b6_radiator`. Výšky desek, židlí, polic, sanity a vzory textilu jsou přiznané foto interpretace. Stavební obklady a podlahy řeší společný finishes helper, nikoli druhá geometrie místnosti.

## API a důkazy

`plan_b06_furnishings(recipe, walk_paths=True)` vrací `{items, rooms, skipped, unfurnishedUsageCounts}` bez Blenderu a bez změny vstupu. `add_b06_furnishings(geometry, recipe)` použije existující `Geometry.prism/face/at`, zvýší vlastní counts a vrátí audit `{roomCount,itemCount,byUsage,rooms,skipped,materialKeys,unfurnishedUsageCounts,basis}`. Koordinátor jej zavolá před vytvořením objektů ze společných geometry groups a uloží audit.

Každý room audit obsahuje `walkPath` v CAD XY se `height` jako referenční výškou, skutečný počáteční `sourceDoorId` a návrat do stejného bodu. Pokojové cíle vedou od aktivních dveří přes volný vstup a střed mezi postelemi k bodu před stoly. Hygiena má cesty před umyvadla, WC a sprchy. Hrany jsou konzervativně kontrolované proti room hranám a hrubým furniture půdorysům kruhem r=0,27 m. Malé WC mohou potřebovat oblouk kolem umyvadla; kandidátní vrcholy se berou pouze z jeho skutečných rohů. Tenká překážka se nepřeskočí.

**`walkPathStatus: candidate-only` a `requiresActualController: true` jsou záměrné.** Jde o rovinné kandidáty pro následný skutečný Actor, nikoli fyzikální PASS. `walkExtraTargets` odděluje středy sprchových vaniček: zdrojové T příčky mají u vstupů přibližně 0,50m hrdla a konzervativní 0,54m kapsle jimi nemusí projít. Přístup před sprchu neprohlašuje její vnitřek za ověřený. Výšku a podporu musí svět znovu změřit; žádný source height override není oprávněný.

Statický běh nad platnou recepturou a potvrzeným source kontraktem: **264 zařízených místností (228 pokojů, 12 koupelen, 24 WC), 13 639 unikátních položek, 168 materiálových/rolových skupin, 3 244 hrubých kolizních položek, žádné skipped ani optional omissions**. Zachováno 72 WC, 12 výlevek, 116 umyvadel, 36 sprch a 55 pisoárů podle konkrétních CAD symbolů. Dalších 95 polygonů `other` a 33 `corridor` nedostalo odhadnutý pokojový nábytek. Všech 264 místností má kandidátní souvislou trasu, celkem 1940 bodů; 36 vnitřků sprch je odděleně neověřených.

**17/17 cílených CPU testů PASS**: containment/notches/holes, mirrored room, minimální průchod, source usage, počty sanitárních symbolů, uzavřený dutý profil se správnou orientací, přesná produkční Geometry třída bez importu bpy, fixed leaf a nepřekročení tenké překážky. Lokální logy a manifest jsou v `.cache/b6-photo-interiors-20261024/`. Blender, native export, vizuální porovnání a skutečný herní průchod provede koordinátor; tento podúkol je nenahrazuje.
