# Statické stromové QA pohledy

Task `trees-20261025-qa-views`, owner `trees-qa-views-01a16b37`, baseline `8516c7b1`. Původní čtyři terrainReview presety se nemění. Nové kamery jsou autorské inspekční volby; zdroje identifikují stromy a přibližné rozměry, nikoli zaměřená stanoviště kamery nebo botanický druh.

## Průzkum a rozhodnutí

Stávající `terrainReview` už izoluje statický loopback guest start a používá skutečný Actor, normální idle fyziku, první osobu a sklon pohledu. Porovnáno přidání dynamického pohybového harnessu, query souřadnic a rozšíření pevného seznamu. Zvolen pevný seznam s volitelným `targetHeight`: zachová bezpečnost/lifecycle původní cesty, umožní totožné A/B stanoviště a nemá nový runtime controller ani cache.

Výška cíle je v metrech nad `surfaceHeight(lookAtXZ)` a `pose.pitch` zůstává sklonem `(eyeY-targetY)/horizontalDistance`. Výchozích 0,05 m původních pohledů zůstává přesně zachovaných. Zdrojové root XZ odpovídají `TREES`, `ipr-crown-014` z katalogu IPR rekonstrukcí a `ipr-b6-north-conifer` z B6 korekce umístění. Source ID je statické pole presetu, nepřebírá se z URL.

| ID | Spawn XZ | Cíl XZ | Výška cíle | Vzdálenost | LOD low/medium/high |
| --- | --- | --- | --- | --- | --- |
| b6-tree-near | -14, -61 | -10.5, -76.5 | 6 m | 15,89 m | 0 / 0 / 0 |
| b5-tree-near | -85, -61 | -67.59, -60.96 | 7 m | 17,41 m | 0 / 0 / 0 |
| b5-tree-mid | -115, -61 | -67.59, -60.96 | 7 m | 47,41 m | 1 / 1 / 1 |
| b5-tree-far | -170,5, -202,5 | -67.59, -60.96 | 7 m | 175,00 m | 2 / 2 / 2 |

Původní návrh far `[-210,-61]` byl odmítnut po orientačním CPU screeningu pohledové osy: prochází 3,7 m od středu koruny `ipr-crown-009` s katalogovým poloměrem 6,6 m. Druhý návrh `[-180,30]` prošel neúplnou kontrolou budov/kmenů, ale skutečný GPU snímek jej odmítl: stojí pod stadionovou tribunou. Původní neúspěšný snímek zůstává v evidenci; nebyl nahrazen tvrzením o viditelné vzdálené koruně.

Nový přirozený far pohled `[-170.5,-202.5]` leží na asfaltové service cestě 1214796112 (šířka 4,2 m, 1,619 m od osy). Čtecí audit celého středového ray zahrnul BUILDINGS, CAD cutouts, STADIUM_PLAN.outer i jeho díly/přesahy, kurty, inventární ploty, lampy a 124 průsečíků terénních grid/TIN hran. Středový ray má nejmenší stadionový odstup 6,034 m, od budovy 11,737 m a minimální výšku nad terénem 1,65 m pro nominální oko. Runtime dál používá skutečnou výšku avatara. Regrese nyní kontroluje celý stadionový polygon a celý pohledový segment, ne pouze spawn.

Nejde o izolovaný celý strom: boční paprsky mohou přirozeně překrýt koruny `ipr-crown-016` a `ipr-b5-north-small`; střed míjí konzervativně rozšířenou korunu 016 o 0,810 m. Nový skutečný GPU snímek tohoto opraveného stanoviště ještě není potvrzený. Nevhodné B6 kandidáty [9,62.1] a [-53.8,56.6] audit vyřadil kvůli kurtům/plotům a dalším korunám.

## Omezený pilot a evidence

`resolveTreePilot(location, network)` vrací `TreePilotOptions | undefined`. Vyžaduje platný `resolveTerrainReview`, tedy loopback (`localhost`, `127.0.0.1`, `[::1]`), guest a právě jednu platnou static view hodnotu. Právě jedno `treePilot=own|mtree` vybere neměnnou dvojici `*-broadleaf` pro `ipr-crown-014` a `*-conifer` pro `ipr-b6-north-conifer`. Manifest je vždy `/models/vegetation/seasonal/runtime-contract.json`. Chybějící, duplicitní, neznámé, vzdálené a multiplayerové požadavky nic nezapnou; jiné query hodnoty nemění URL/ID/souřadnice.

Root propojuje tento resolver s Game a `loadVegetation`. Top-level benchmark `treePilot?: 'own' | 'mtree'` bere až z úspěšné skutečné aktivace runtime, ne ze samotného URL. Projekce jej přijme jen spolu s validní statickou guest identitou. `treeSeason?: {sampledAt:number,source:'regional-model'|'demo',phaseDay:number}` uchová jen epoch ms (celé v rozsahu Date) a normalizovaný interval `[0,365)`, včetně přestupných roků. Neuchovává celý state, revisions ani libovolná metadata.

Terrain identity nově propouští pouze bounded `targetHeight` 0–100 m a konečný seznam obou veřejných sourceTreeId. Whitelist `renderCost.vegetation` obsahuje stávající TreeRenderStats: legacy/rank počty, detail cache entries/bytes/reservations, pilot geometry/source/season bytes, texture source bytes a kumulativní fetch bytes/requests. Nejde o měření VRAM; význam a překryvy bajtů zůstávají podle runtime.md. Collector origin/port whitelist ani síťový server se nemění.

## Ověření a limity

Testy kontrolují skutečné shared world bounds, každý building footprint/edge a každý trunk collision radius s rezervou; skutečné source IDs/root cíle; LOD prahy; pravotočivou Babylon projekci koruny doprostřed viewportu při dvou výškách očí; a skutečný Actor přes 120 idle kroků nad lokálním výřezem produkčního `terrainCollisionData(createTerrainTiles(...))` se všemi shared kmeny, bez pohybu nebo recovery.

První vývojová fyzikální fixture omylem předala renderingové clockwise winding z `drapeTriangles` přímo Rapieru; na svahu B5 pak Actor nestanovil grounded. Opravená fixture používá přímo produkční `terrainCollisionData`, které převádí winding pro Rapier. Produkční fyzika se neměnila. Celé původní Game metody startup/first-person camera/interpolation/static input guards zůstávají v CPU testech a nové pohledy procházejí stejnou cestou.

Přejímka obrazu, průhledu korunami, alfa stínů a GPU výkonu přísluší rootovi. V tomto tasku neběží browser, port, Blender, build ani celá sada testů. Pure benchmark projekce se testuje bez HTTP collector fixtures, protože portová část se nemění a task port nerezervuje.

Finální cílená kontrola: `tests/terrain-review.test.ts` 11/11 PASS a pure výběr `projection|local CPU|virtual camera` z `tests/local-benchmarks.test.ts` 9/9 PASS, oba exit 0. `node node_modules/typescript/bin/tsc --noEmit --pretty false` exit 0 bez diagnostik; `git diff --check` exit 0. Logy jsou v `.cache/trees-qa-views-20261025/terrain-review-final.log`, `benchmark-projection-final.log` a `tsc-final.log`. Zdrojový checkpoint zahrne také oba testy; integrátor doplní společnou browser/GPU evidenci.

## Katalogové pohledy a skutečná přípravná kamera · 26.10.

Pro hotový katalog přibyly tři stanice odvozené z existujících podkladů. Původní čtyři terénní pohledy se nezměnily.

| Preset | Spawn X/Z | Cíl X/Z, výška nad terénem | Podklad |
|---|---|---|---|
| `b5-tree-hero` | −73,6 / −61 | −67,59 / −60,96; 5,5 m | Trávník OSM1059554109 vedle pěšiny55830418, zdroj ipr-crown-014 |
| `small-tree-close` | −65,87 / 258,62 | −58,97 / 258,45; 2,6 m | Pěšina OSM432351715 a strom4314257232 |
| `b6-tree-far-upper` | −70,914 / 121,584 | −10,5 / −76,5; 9,5 m | Uzel OSM7725186095 mezi pěšinou25920429 a chodníkem827456376 |

Poslední stanice je kontext horní koruny, nikoli prokázaně izolovaná silueta. Středový paprsek nezasáhl skutečné renderované části kurtů, budovy/CAD/stadion ani terén. Dřívější zásah neviditelného kolizního obdélníku plotu nesmí být vydáván za neprůhlednou vizuální stěnu. Boční obálky dalších korun mohou částečně překrývat okraje; GPU kontrola nových stanic zatím neproběhla.

Při interní výšce650px/FOV0,85 jsou oba nové blízké pohledy podle skutečné `full-coverage` policy LOD1/0/0 pro low/medium/high; původní B5 near na17,4m je nyní MID. Nový FAR zůstává LOD2 i při výšce1080px. Malý zdroj není součástí dvojice own/mtree, proto na jeho stanici `treePilot` nic nevybere; přísluší úplnému katalogu.

První společná kontrola měla28PASS/1FAIL: přesně osový B5 hero se odchýlil o0,549px. Připnutý Babylon `TargetCamera.setTarget` při stejné Z hodnotě cíle a kamery mění camera.position.z o Epsilon. Autorské stanoviště bylo posunuto o4cm na původní Z linii−61; žádná kamera ani Actor se dodatečně neposouvá. Následná kontrola skutečné projekce, plných LOD prahů, world/trunk odstupů a120idle kroků Actorů:4/4PASS. První běh zahrnul i zbytečné HTTP collector fixtures; skončily a další oprava už použila jen úzký výběr.

V12 následně ukázal nesoulad přípravné kamery: Actor i final frame používaly QA stanici, ale skryté asset draw začínaly z konstruktorové kamery u původního spawnu. `TreeRenderer` vybírá LOD podle segmentu kamera–Actor, takže takový start mohl načíst jiné detaily. Reprodukce přes skutečné `Game.start()` s podrženými assety prokázala první draw na konstruktorové pozici. Zvoleno nastavení kamery běžnou `updateCameraFollow` cestou hned po vytvoření QA Actora a znovu po zjištění skutečné výšky jeho očí. Fyzika ani poloha Actora se nemění; mimo statické QA helper zůstává inertní. Test před opravou selhal, po opravě šest souvisejících start/projekce/idle případů PASS. Dopad na skutečný startup čas, cache a FPS ještě nebyl měřen; nevydává se za vyřešení NCM záseku.

Aktuální srovnávací own dvojice používá `/models/vegetation/seasonal-r6-far/runtime-contract.json`, mtree `/models/vegetation/seasonal-streamed/runtime-contract.json`. Historický v1 údaj výše popisuje první pilot. Úplný katalog bude mít samostatný integrity descriptor a běžné herní zapojení až po dokončení všech zdrojů.
