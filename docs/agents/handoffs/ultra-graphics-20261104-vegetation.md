# Vegetace a mraky pro Ultra — pracovní předání

1. Problém: současné loadVegetation vždy načítá fotografickou trávu a update/helper cesty nemají vypnutý stav. Samotné vynechání update ponechá staré meshe viditelné.
2. Mechanismus: vlastníci drží batch meshe, generační shader helpery a asynchronní load; tree desired LOD řídí fetch, cloudCoverage současně řídí GPU i fyzikální světelný sampler.
3. Změna: explicitní enabled policy ve vlastnících, líná/coalesced tvorba grass/flowers/litter, FAR-only před výběrem i před late decode; oddělený renderCoverage0 pro cloudy.
4. Metrika: cílené regrese viditelnosti, nulového coldOff IO, žádných MID/near requestů, zero preparation/update přiOff a správných late/dipose/On přechodů.
5. Správnost: data, geometrické polohy/kolize a meteorologie/astronomie beze změny; bounded cache a sdílené materiály zachovat; cold off nemá nepřipravené dependency, na které by Game musel čekat.
6. Přijetí: funkční NullEngine/mockIO regrese a lokální refaktor PASS, root následně ověří skutečnýGPU a celýgameplay. Nejde oFPS claim.

Volba enabled+bounded reuse má menší lifecycle riziko než dispose/reload při každém kliknutí. In-flight výsledky mohou dokončit ověřování, ale nesmějí znovu zapnout disabled stav; coldOff vůbec požadavek nezahájí. Kompletní odstranění stromů odmítnuto kvůli neviditelným kolizím; použijí se existujícíFAR části. CloudLightSampler musí dál vidět skutečnou meteorologickou coverage.

## Stabilní výsledek

- Implementováno kompatibilní loadVegetation options.visualFeatures a async setVisualFeatures. ColdOff nezačne fotografické IO ani zbytečnou legacygrass konstrukci; ON sdílí jeden pending load, explicitní rollbackOff zůstává zdravý, pozdní výsledek nespustí další flowerload a nezapne meshe. Resources jsou vlastněné jednou a opětovně použitelné.
- PhotographicGrass/Flowers/Litter mají skutečné setEnabled; Off ruší přípravu, skryje helpery i batch meshe, vyprázdní aktivní kořeny a přestane aktualizovat výběr. Placement/resource cache se zachovají v původních mezích. ON začne aktuálním výběrem; stará stopclosure nesmí vypnout novou přípravu.
- TreeRenderer constructor detailMode + setDetailMode('normal'|'far-only'). FAR-only funguje při bootstrapu i všechqualityprůchodech, blokuje detailfetch a late decode/mesh instalaci. Retiruje pouze detail-only chybu; bootstrap/FARchyba zůstává. Výslovný návratnormal dovolí nový pokus dříve chybnýchdetailů.
- Skutečný export SkyWeatherController(scene,{cloudsEnabled?}) a setter; AtmosphereSky drží samostatný nulový renderCoverage vector pro všechny vázané sky/sun/moon shadery. CloudLightSampler a meteorologie/astronomie dál používají původní coverage, žádné nové assety/shadery.
- Root při živém On musí po vegetation.update aktuální pozice kontrolovat stats.pendingTreeLoads a loadError pro aktivníkonfiguraci. Setter awaituje grass/flowers, nečeká před prvnímupdate na detail, jehož výběr dosud nevznikl; domluveno s rootem.

## Kontroly

- tree-streaming + ground-flowers + tree-litter + atmosphere-sky:61/61 PASS, exit0 (6899,551ms), včetně nových FAR/late/error/OffOn regresí.
- photo-grass-preparation:7/7 PASS v samostatném běhu; sky-weather konečný rozšířený soubor3/3 PASS.
- Nový vegetation-visual-settings soubor5/5 PASS: coldOff/noIO/lazycoalescing/lateOff/lateDispose/helpers/rollback. První pokus měl chybný testovací triangle count6 místo skutečného22; opraveno na CANDIDATE_LOD_TRIANGLES.far, bez změny runtime kvůli tomuto nálezu.
- photo-grass, vegetation-view-stability a vegetation: původní47case běh měl46PASS a1FAIL. Selhání odhalilo ztracený lokální scene při extrakci legacy initializeru; opraveno this.scene. Přesný opakovaný legacyruntime test1/1 PASS a celý nový policy soubor5/5 PASS po konečné změně. Již zelené nezměněné testy se zbytečně neopakovaly.
- Scoped TypeScript všech7 runtime modulů a nových/upravených regression souborů:PASS, exit0. git diff --check pro upravené tracked soubory PASS.
- Žádný fullsuite/build/GPU/server ani commit; praktická a celková přejímka patří rootovi. NullEngine není FPS důkaz. Vlastní testovací procesy skončily.

## Převod vlastnictví

Root přebírá uvedené13 soubory a toto předání; ostatní rezervované tests nebyly editované. Žádný source/runtime zásah do C/main/8080. Další opravy pouze po přiděleném review. Následuje release claimu ultra-graphics-20261104-vegetation.

## SHA256 checkpoint

- client/vegetation.ts: 1168a467594a72d4166d30f7e44caf297475f8bedfa79165119536da8846690d
- client/photographic-grass.ts: 7b9ae1a42d722d6aec29804c0ac9cc21b370ec1c8b165bb8e429932d836e4465
- client/ground-flowers.ts: a858cfca6b4664c83f281e3525a279f198ba4dcf22a139a0cd4f29f5cd573692
- client/tree-litter.ts: 8401bc103a0d2406db8456eebb83cf1b35e08cdfd8ace7e178f43f9aba881ab8
- client/tree-renderer.ts: 303ff4b888e4d2077cbf1e2dda7cfeebcfa22b8a8e8c8c915c06c9b392ab0b6d
- client/sky-weather.ts: a7386bedbda9cd576e87c7b8892f1d022719254984c10a8c4a7e963dbb84fe17
- client/atmosphere-sky.ts: 7d200bb669ee1b95e2d1477264ed4f9ac5445084c1d6c141199957d0e31eeeac
- tests/tree-streaming.test.ts: 36408a728c2a07b22aa84e6a27ed53f101afe839d8e7c5aa09516b411509836e
- tests/ground-flowers.test.ts: 91473a5d34a30b320be1f3e88e25ef4067395af50737c75f636072e70782e41b
- tests/tree-litter.test.ts: 84dd35beb07a75b6e297fe6b9027613149ee7e0add66d496fce321f30ca78c5c
- tests/atmosphere-sky.test.ts: 0febf815173eeedb4621b2e78b817411eb3c4f824ec17d8ae8046f7d0b8517a1
- tests/sky-weather.test.ts: ddeb1f52d6b654d6b9a28f9d0da001657e72e8c40a6e469ed723bacc5123f385
- tests/vegetation-visual-settings.test.ts: 99c72dc2ba872e738e0aac36c2a6735a3746f97e627aaa831a65d04f2831ca0a

## Review oprava: vypnutí před dokončením JSON

Review doložil ranou hranici Ultra → On → Off nebo dispose před odpovědí geometry/material JSON: původní loader sice nastavil disabled stav, ale bezpodmínečně spustil textury. Po přidělení opravy byl obnoven vlastní claim s `--adopt-dirty`; cizí mutex ani procesy nebyly měněny.

- Jediná změna mechanismu: po JSON vrátit při Off dormant vlastníka bez nového Texture IO; následné On sdílí retryovatelnou inicializaci prostředků. Gate je i před načtením květin a po async návratu. Vegetation po instalaci vlastníka dokončí požadovanou přípravu, což pokrývá návrat On přesně na hranici dokončení JSON.
- Zachovány veřejné signatury a bounded vlastnictví. Při Off se nezahajuje nové IO, při dispose se dormant výsledek odstraní, po chybě lze znovu On. Rollback Off nezanechá chybu zdravých stromů. Odmítnuta varianta očekávaný Off hlásit jako abort/renderer chybu.
- Regrese nejprve RED: 0/3 PASS; oba Off/dispose případy prokázaly Texture IO 1 místo 0, třetí odhalil předčasný texture failure. Po opravě a doplnění skutečné JSON-boundary On regrese: `node --import tsx --test tests/vegetation-visual-settings.test.ts tests/photo-grass-preparation.test.ts` **16/16 PASS**, exit 0, 3804,2792 ms. Předchozí meziběh měl 14/15 PASS kvůli starému neúplnému mocku flowers; fixture byla doplněna, runtime se kvůli ní neměnil.
- Scoped TypeScript (`client/vegetation.ts`, `client/photographic-grass.ts`, `tests/vegetation-visual-settings.test.ts` a jejich importy): PASS, exit 0. Poslední testová změna pouze anotovala options mocku; runtime od úspěšných 16 testů beze změny. Scoped `git diff --check`: PASS.
- Bez full suite, buildu, GPU a commitu. Vlastní procesy ukončeny; oprava a vlastnictví předány rootovi, následuje release.

Aktuální SHA256 nahrazující tři předchozí položky:

- client/photographic-grass.ts: 030d05a13f22a847e9275ef2735196796ea5a7f8060f9cbdd58286a85e157a70
- client/vegetation.ts: e7f14387b41d635977213c7a34a158af062b2429d83625dc68b75ff8414876ce
- tests/vegetation-visual-settings.test.ts: 69822473ae35535aa1ab310d71981653296cc96e611a9eb1ec617f04282bf910

## Druhá review hranice: čekající flower JSON — předáno

1. Problém: vlastní GroundFlowers.load po JSON kontroluje pouze disposal scény, takže Off/retirement vlastníka s živou scénou může zahájit čtyři nové textury a zdrojovou geometrii.
2. Doložený mechanismus: callback vlastníka musí projít celým PhotographicGrass → GroundFlowers řetězcem, protože během prvního load ještě Vegetation nedrží photographic vlastníka.
3. Jediná změna: volitelný caller-owned enabled guard před flower konstrukcí; vynechaný výsledek ponechá stávající coalesced load retryovatelný při dalším On. Root schválil nový malý JSON request při retry místo složitějšího dormant resource refaktoru.
4. Metrika: skutečný delayed flower JSON a počítání Texture IO/mesh tvorby; Off/dispose nula, concurrent retry On jedna čtyřtexturová sada.
5. Správnost: již zahájené textury mohou dokončit jedinou bounded sadu, late výsledek nesmí zapnout Off; standardní load(scene) signatura a konstruktor/ready cleanup se zachovají.
6. Přijetí: cílená RED→GREEN regrese, dotčené lifecycle testy a scoped TypeScript. Bez GPU/FPS tvrzení.

Implementováno pouze v `ground-flowers.ts`, `photographic-grass.ts` a `vegetation-visual-settings.test.ts`. `GroundFlowers.load(scene)` zachovává návratový kontrakt; volitelná guarded varianta vrátí undefined, pokud vlastník během JSON přešel Off/disposed. PhotographicGrass propouští externí policy i během prvního load, kdy Vegetation vlastníka ještě nedrží. Skipped výsledek neotráví promise a další On načítá jednu sadu květin. Late dokončení již zahájených prostředků znovu kontroluje policy a nechá je vypnuté; nevzniká další resource cache.

- RED skutečných delayed JSON testů: 0/2 PASS, oba případy doložily čtyři nové flower textury místo nuly.
- Konečný cílený běh `node --import tsx --test tests/vegetation-visual-settings.test.ts tests/ground-flowers.test.ts tests/photo-grass-preparation.test.ts`: **31/31 PASS**, exit 0, 10065,7511 ms. Testy zachovávají skutečné production loadery a počítají engine Texture IO; Off/dispose nulové flower textury/meshe, retry On čtyři flower a celkem pět původních grass textur, jeden coalesced JSON retry.
- Scoped TypeScript se všemi třemi dotčenými moduly a testy: exit 1 kvůli **dvěma chybám mimo tento task**, `client/stable-light-state.ts:117`: vlastnosti `filter` a `filteringQuality` na `IShadowGenerator`. Vlastník/root informován; žádná chyba hlášena v souborech vegetace. Tato kontrola se nevydává za PASS a cizí modul se neměnil.
- Scoped `git diff --check`: PASS. Bez full suite, buildu, GPU nebo commitu. Testovací i typový proces skončily; následuje release a integraci přebírá root.

Aktuální SHA256 nahrazující předchozí položky:

- client/ground-flowers.ts: 41f4cc2d2b39ef825eeda2e867c870ffe89c33b6f6de0269e0c52affa1eee12e
- client/photographic-grass.ts: f0623f74f0936a31403fff74ba31b35ca7701263f80d157bd61bc6ece49010fe
- tests/vegetation-visual-settings.test.ts: 651f53de5db23b8f183954ff66fa5c821015a5baa0c525c7281fb01d16f9bae9
