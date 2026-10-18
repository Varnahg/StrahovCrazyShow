# QA předání: dvě denní B6 přípravné etapy

Vlastník `webgpu-b6-prototype-01a14497`, task `webgpu-b6-preparation-prototype-20261018`, příjemce root. Načteny aktuální primary AGENTS/policy, task, předchozí návrhový audit a skutečný B6 variant proof. Claim získán před zápisem. Žádný další BMAD workflow/subagent; BMAD a Linear vlastní root.

## Zdroj a přesný rozsah

Readonly base `.cache/webgpu-hitch-validation-20261017/async-production-v3`, snapshot `ec2802daf9426f63814054627adf5a18f04cd54eb2da20e800eb1a89feb6c563`, source commit `2cd0e47990ea6fe0d046d03b3ac8966f207097b2`. Vlastní prefix `.cache/webgpu-migration-checks/b6-preparation-prototype-20261018/`; `assemble.mjs` ověřil a zkopíroval 226 client/shared/test/config souborů podle původního source manifestu. Jejich vstupní SHA jsou v `input-manifest.json`. Žádné velké assety, nové závislosti nebo cizí runtime kopie se nekopírovaly ani neupravily.

Změněné copied overlays jsou pouze:

- `candidate/client/game.ts`
- `candidate/client/light-preparation.ts`
- `candidate/client/cinematic.ts`
- `candidate/tests/game-light-preparation.test.ts`
- `candidate/tests/light-preparation.test.ts`
- `candidate/tests/cinematic.test.ts`

Šest jednotlivých diffů proti base je přímo ve vlastním prefixu (`client_game.ts.diff` atd.). Root má připravené vlastní QA sestavení; tyto soubory přebírá jako overlay včetně testů. `assemble.mjs` jen vytváří tuto izolovanou source kopii a odmítne přepsat existující candidate; není to build/server ani nový projektový framework.

## Odvození a zvolená varianta

Předchozí CPU proof doložil chybějící denní Directional varianty a skutečné regular-instance main draws dvou malých původních B6 GLB. Hlubší nav pohled pokryl jen 4/8 částí, source-derived landing pohled 8/8. Proto je použito `x=B6_LAYOUT.entry.x`, `z=B6_LAYOUT.entry.landingMaxZ` (aktuálně −4.85, −76.95), presentation body y=`foundationOffset+0.8`, camera eye y=`foundationOffset+aktuální self.eyeHeight` (pro původní rig 3.43). Target je poslední bod existující `approachRoute` (−4.85, −73) ve stejné výšce očí. Souřadnice nejsou převzaté z náhodného player capture a nezměnila se shared geometrie. Layout je modelově odvozený, nikoli geodetické zaměření.

Zvolena kamera-only prezentace na skutečné Game.camera. `updateWorldPresentation` aktivuje vlastníky B6/ostatních LODs; skutečná camera-origin cesta PlayerFlashlight dostane `cameraLight=true`. Syntetická pozice nikdy nejde do CameraFollow, LocalAvatarPresentation ani updateAvatarPresentation; actor, jeho pozice/vehicle/yaw, avatar root, animace/LOD/contact historie, fyzika a síť se nepřepisují. Veřejné camera position/target se před dvojicí uloží, na odchodu obnoví a teprve potom původní apply znovu použije aktuální uživatelské požadavky. Při retired/disposed rendereru se nic nevykresluje ani neobnovuje do mrtvých objektů; finally uvolní snapshot.

All-scene sweep nepokryje odpojené B6 instance a přesun actoru/avatara by vyžadoval širší obnovování historie, proto nejsou použity. Nepřibyly shader/pipeline cache, jiné light slots ani relaxace readiness.

## Implementace a refaktoring

LightPreparation dostává jedinou optional volbu `includeB6DayPair`. Výchozí osm přípravných etap + restore zůstává; při opt-in přibude právě `b6-day-off`, `b6-day-on` před restore. Stejný společný 30s visible deadline, pause/resume, pending/health kontroly a dvě kompletní ready draws zůstaly. V QA Game se pair zapne jen pro WebGPU s reálným B6 controllerem; WebGL a chybějící B6 zachovají původní seznam.

`selectLightingPreview("day")` poskytne pevný denní instant dvojice; Game.timeOverride se nepřepisuje. Reapply/restore čtou current quality/profile/weather/time/flashlight/camera requests. Opt-in revision navíc obsahuje B6 controller identity a loadedAssets; nespoléhá jen na mesh count. Ztráta controlleru při B6 apply selže místo falešné coverage.

Nový optional `forceSpatialSelection` pro Cinematic obnoví skutečný caster výběr při přesunu B6/restore i při dt0 a nezměněném slunci. Nepřidává falešný dt, neresetuje běžný cadence timer ani nevynucuje glass refresh. Parametr je připojen až za původní phaseEnds argument Game.updateRenderEnvironment, takže C5 environment profiling sloty zůstávají stejné. Obnovení kamery a spatial výběru je společné pro explicitní restore i timeout/failure cleanup.

## Ověření

`TSX_DISABLE_CACHE=1 node --import tsx --test --test-reporter=tap tests/game-light-preparation.test.ts tests/light-preparation.test.ts tests/cinematic.test.ts` ve vlastní candidate kopii s readonly dependencies-v5 junction:

- `targeted-v3.log`: **44/44 PASS**, exit0, runner 2910 ms. Zachováno 37 původních testů a 7 nových.
- Skutečné AST Game metody prepareLighting, camera-pass readiness, CameraFollow, WorldPresentation a environment forwarding; reálné Babylon RH Camera a camera-origin PlayerFlashlight; skutečný LocalAvatarPresentation state; actor deep-freeze a physics/network tripwires. B6 controller v tomto testu je řízený IO stub; skutečné GLB/instance coverage doložil oddělený předchozí proof, zde se nespouštěl znovu.
- Nové kontroly: právě dvě etapy, původní deadline/draw kontrakt; landing/eye/direction; camera pose obnovená před aplikací latest požadavků; neporušený actor/avatarní stav; loadedAssets/controller restart; B6 timeout; disposed/failed cleanup; forwarding spatial flagu bez posunu phase profiling; skutečný Cinematic caster list při přesunu a návratu s dt0.
- První fixture iterace selhaly: fake WebGPU engine neměl validní compiled-Effect registry; RH bylo změněno až po Camera konstruktoru (Babylon ukládá reference direction při vytvoření); vzdálený statický test mesh neměl v témže render ID přepočítanou world matrix. Fixture nyní dodává skutečné požadované kontrakty. Žádná produkční readiness podmínka se kvůli tomu neoslabila. Logy v1/v2 jsou zachované.

Full TS, full suite, build, server a GPU patří rootovi a leaf je nespouštěl. Během oznámeného root GPU okna se jen četlo/pisaly vlastní zdroje; CPU testy začaly až po výslovném uvolnění. Nativní WT runtime, hrané snapshoty, původní async-production-v3 i dependencies zůstaly beze změny. Žádný commit/staging.

## Omezení pro GPU rozhodnutí

Jde o neakceptovaný QA kandidát. Plné B6 stěny, okolní geometrie, skutečný avatar a aktuální viewport mohou změnit coverage proti malému CPU proofu. Připravený ON wrapped leaf depth Effect se po OFF restore může zrušit; tento prototyp to nemění a neslibuje odstranění celých 6.2 s. Přidaná práce se musí přiznat v startup čase, bez prodloužení deadline.

Landing −76.95 je uvnitř lobby (`minZ=−77.1`), tedy připravuje denní B6 fill POINT. Nejnovější root kontrola na z−77.25586 je outside a může mít jiný day layout; starší b6:0 repro je samostatný scénář. Výsledek je nutné interpretovat podle skutečného layoutu, ne jen vzdálenosti od dveří. Editorově přesunutý/rotovaný B6 není tímto source-layout proofem potvrzen; scope se zde nerozšiřuje.

Root obdržel runtime freeze pro souběžné read-only review. Přesné source/overlay SHA a výsledky jsou v malém `overlay-record.json` ve vlastním prefixu. Předání zahrnuje výše uvedených šest copied files, diffy a tento handoff; po ukončení vlastních procesů a předání se claim uvolní. Release není produkční přijetí ani uzavření KEY-31.
