# Předání: b6-photo-routes-20261024

- Vlastník `b6-photo-01a16b37-routes`; příjemce root. Cwd `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline ed52896a. Root předal čisté verifikační soubory; žádný cizí WIP se nepřepisoval.
- Vlastní změny: `scripts/cad-buildings/rapier_model.mjs`, `verify_doors.mjs`, `verify_accessibility.mjs`, `verify_world_paths.ts`, nové `verify_room_paths.mjs` a `test_room_paths.mjs`, `test_rapier_model.mjs`, `test_accessibility.mjs`, `tests/cad-building-world.test.ts`, `tests/cad-world-paths.test.ts`, tento handoff a vlastní `.cache/b6-photo-routes-20261024/`.
- Výsledek: executable native candidate room verifier + skutečná ochrana fixed door leaves. **61/61 malých CPU regresí PASS**, TypeScript a syntax kontroly PASS. Plný candidate room replay podagent nespouštěl; root přebírá ihned pro všech264 místností.

## Konkrétní implementace

`fixedOpeningSpec` sjednocuje klasifikace. Původní facade-opening-unconfirmed-access stále očekává `facade-glass` a kategorii fixed-facade-glazing. Nové fixed-paired-door-leaf očekává **kolizní role fixed-door-leaf**, kategorii fixed-door-leaf a graph exclusion fixed-paired-door-leaf; nikdy se nevydává za fasádu.

Coverage používá skutečnou jamb rovinu hinge→closedEnd posunutou o measured normalOffset, stejně jako potvrzený builder. Jeho38mm panel bottom+.015/top−.02 se vejde do původní20mm plane tolerance a55mm frame margin. Exact union area a obousměrné role-filtered ray hits zůstávají. Chybějící panel, pěticentimetrový proužek, špatná role i posunutá rovina neprojdou. Přidané `protectedDoorLeaves` nesčítá tyto panely s prosklením.

Accessibility exclusion vyžaduje odpovídající dvě reportované ochrany a **nezávisle znovu přepočtenou ochranu na aktuálním modelu**; falešné passed:true/coverage:true nestačí. World trace kontroluje protectionVerified/role/category a plnou skutečnou native coverage. Neúplná ochrana se nesmí změnit na tiše vyřazený průchod. Ve skutečném cad-building-world testu se pevné panely ověřují zvlášť native coverage + obousměrný hit v odpovídající world rovině, jmenovatel otevřených dveří je od nich oddělen.

Nový `verify_room_paths.mjs` importuje produkční **Actor** a používá jeho skutečný KCC/step. Nativní candidate collision parts se transformují aktuální registrovanou placement a vloží do izolovaného worldu. Nejde o kopii walker/controlleru ani přepsání shared publikovaného modelu. Adapter poskytuje pouze world/add/remove/tick/dispose a mapování skutečných kolizních částí. Terrain/traffic/celý publikovaný svět tím nejsou ověřené.

Room tours se čtou výhradně z hashově svázaného `model.roomWalkPaths`. Validuje se usage/provenance, current profil, floor/door vazba, konečné souřadnice, plný návrat do startu, omezený20m room envelope, stejná úroveň do.25m a absence support override. Fixed start nebo chybějící native panel se odmítne. Actor začíná na přesném canonical inside approach z doorApproachGeometry; původní ±.45m candidate midpoint mohl ignorovat normalOffset, proto je do.15m rozdíl **fyzicky přehrán jako první leg**, nikoli teleportován.

Setup i všechny cíle používají nové skutečné ray/capsule support queries. Nábytek ve výšce.4m se nesmí vydávat za původní floor reference. Teleport/recovery/restore/vehicle jsou zakázané. Každý leg ukládá support, výslednou pozici, grounded, kontaktní part/role a krátkou trail. Chůze na interiérových bodech automaticky neskáče. Chybějící podlaha, skříň v trase nebo selhání návratu znamenají partial, i když byl vzdálený bod navštíven. Všechny Actors/world se uklidí i při výjimce.

Refaktoring: veřejně sdílené supportAt/assertLiveController/forbidRecovery/walkActorLeg/sourceManifest z původního actual world replayeru; pevná ochrana má jediný generický helper se zpětně kompatibilními glazing wrappers. Manifest obsahuje i nové verifiery/tests, takže staré source reports po změně helperu je třeba regenerovat.

## Spuštění koordinátorem

```powershell
pnpm exec tsx scripts/cad-buildings/verify_room_paths.mjs `
  --model .cache/b6-photo-refinement-20261024/model/b06.json `
  --output .cache/b6-photo-routes-20261024/b06-room-paths.json
```

Volitelné `--glb` určí companion GLB; výchozí je stejný basename. Jeho SHA se musí shodovat s nativním JSON. `--room n01:11` je explicitní debugging podmnožina; report stále uvádí všech264 expectedRooms a nevybrané místnosti, takže malý test nemůže vydat úplný PASS. Před/po se kontroluje model, GLB a manifest aktuálních Actor/shared vstupů.

**`tourStatus` hodnotí všechny standardní room tours. `status` zůstává partial a exit code2, dokud existují extra neověřené cíle.** Současných36 shower centres je v unverifiedExtraTargets/not-verified se zdrojovým důvodem; průchod před sprchu není důkaz jejího vnitřku. .50m CAD vstupy se nezvětšují a.54m kapsle se nezmenšuje. Každá místnost má nového Actora u dveří: nejde o důkaz souvislé dosažitelnosti všech místností od venkovního vstupu. Ten má samostatný world/accessibility replayer.

## Důkazy a omezení

- `pnpm exec tsx --test scripts/cad-buildings/test_rapier_model.mjs scripts/cad-buildings/test_accessibility.mjs scripts/cad-buildings/test_room_paths.mjs tests/cad-world-paths.test.ts`: **61/61 PASS**, exit0,2.853s; `.cache/b6-photo-routes-20261024/fixtures-final.log`.
- Z toho8 nových room fixtures používá skutečný Actor: úplný návrat, nábytek blokuje/přístup kolem něj, blokovaný návrat, missing support, recovery zákaz, nesprávná podpůrná výška, canonical normalOffset prefix, subset/extra partial a vadná identita/úroveň/vstup.
- Cílený tsc pro verify_world_paths.ts/cad-world-paths.test.ts/cad-building-world.test.ts s ES2022/Bundler/strict/node,vite/client: PASS, exit0 (podagent hlásil úspěšný běh bez uchovaného logu; koordinátor následně doložil TypeScript finálním source-v4 produkčním buildem). node --check pro čtyři změněné mjs verifiery/helper také PASS.
- Pure validation skutečného candidate JSON **6598994ee87133ddfafe6aa682fcbcd89ef49d71113b22ed3b1dcebacccaf57d** prošla:264 native rooms +36extra targets a skutečná coverage všech pevných panelů. Při této kontrole nebyl vytvořen physics world a nejedná se o movement PASS. Companion GLB z exportu rootu máca013060e82944077bb72b060492321b8bc29952c1a10927747598d1bcea0c4b.
- Snapshot vlastních změn/testů a read-only candidate identity: `source-manifest.json`; tracked diff `changes.patch` ve vlastní cache. Rapier fixture temp výstupy jsou přesměrované do této taskové cache, ne do dřívějšího cizího B1 integračního scope.
- Žádný Blender, GPU, server, fullsuite ani full candidate replay neběžel. Všechny vlastní procesy skončily; nic nestagováno/commitováno. Po GREEN předání claim uvolněn, celý tento vlastní WIP je předán rootovi k `--adopt-dirty`. Integrátor určuje stav tasku a skutečnou přejímku modelu.

## R2: zavřený výchozí stav a interaktivní důkazy, 2026-10-24 23:10 UTC

Vlastník `b6-route-r2`, příjemce root. Worktree a větev zůstávají `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, `codex/b6-photo-refinement-20261024`; výchozí HEAD `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`. Převzaty čisté původní verify skripty podle zadání; žádný cizí WIP nebyl upraven. Tato část nahrazuje předchozí předpoklad trvale otevřených pohyblivých křídel. Staré source-v4 důkazy nejsou důkazem nových interakcí.

Změněno přesně devět implementačních/testovacích souborů:

- `scripts/cad-buildings/rapier_model.mjs`
- `scripts/cad-buildings/verify_doors.mjs`
- `scripts/cad-buildings/verify_accessibility.mjs`
- `scripts/cad-buildings/verify_world_paths.ts`
- `scripts/cad-buildings/verify_room_paths.mjs`
- `scripts/cad-buildings/test_rapier_model.mjs`
- `scripts/cad-buildings/test_accessibility.mjs`
- `scripts/cad-buildings/test_room_paths.mjs`
- `tests/cad-world-paths.test.ts`

Navíc tento handoff a vlastní cache. `verify_routes.mjs` upravil koordinátor ve svém samostatném tasku; `tests/cad-building-world.test.ts` zůstal beze změny.

### Příčina, varianty a zvolená oprava

Původní izolovaná scéna vkládala jen statické trojúhelníky. Nové nativní listy jsou render geometry bez statické kolize a jejich fyziku vlastní `CadDoorPhysics`; bez této adaptace by nový model vykazoval falešně volné portály. Samotné přidání obou fyzických poloh také nestačilo: neaktivní sensor/query pose musí být odfiltrovaná z overlapů, sweepů i KCC stejným sdíleným ignore setem jako v produkční `Simulation`.

Duplikování boxů/pantů bylo odmítnuto, stejně jako tiché otevření všech dveří ve world replay. Přejímka nyní přímo načítá `CadDoorPhysics`, definice a `CadDoorStateStore`. Native .mjs CLI používá dočasně registrovaný TS loader, kanonické ESM URL a stejnou Rapier WASM instanci; loader se po načtení odregistruje. Oddělené `tsImport` namespaces nebo kombinace CJS/ESM Rapier vytvářely druhou neinitializovanou WASM instanci, což zachytily nové fixtures. Alternativní dependency-root musí odkazovat na stejnou instalaci; běžný příkaz z této worktree žádný override nepotřebuje.

`makeScene` začíná closed-default, vytváří sdílenou fyziku podle exportovaných `interactiveDoors` a přesné `collisionPartIds` neinstaluje podruhé. Pevné panely se nepřevádějí na pohyblivé; chybně klasifikovaný fixed source, chybějící/duplicitní definice nebo pokus odstranit fixed-door-leaf z kolizí selže. Bez interaktivního pole zůstává legacy/B1 chování. Volitelná placement se týká modelových dveřních definic; static parts už musí být ve stejném prostoru. Actual Actor adapter transformuje static vertices jednou a sdílí ignore set i door physics.

### Přesný kontrakt důkazů a CLI

1. **Dveře:** `node scripts/cad-buildings/verify_doors.mjs --model MODEL.json --profile current --output DOORS.json`. Bez open-all flagu. Každý interaktivní směr má oddělenou closed-blocking zkoušku, podmíněný průchod jediným otevřeným listem přes skutečně navštívený střed portálu a occupied-close guard se skutečnou kapslí v tomto bodu. Na konci každého samostatného případu se model vrací do closed state. `interactionAttempt` navíc zaznamená žádost z původní skutečné přístupové pozice. Obsazení opening sweepu může způsobit správné zamítnutí, i když conditional průchod projde. `interactiveCases`, `interactionVerified`, `interactionStatus` a `coverageQualification` tento rozdíl výslovně uvádějí. Žádný jednotlivý případ nemá teleport mezi svými pohybovými úseky; closed/open jsou samostatné porovnávací případy.
2. **Schody a source accessibility:** k původním příkazům přidat `--door-state all-interactive-open`. `openModel` nastaví pouze výslovně uvedený native snapshot. Accessibility vyžaduje shodný stav stair reportu a kompletní closed/open/guard důkaz u úspěšných interaktivních dveří. `probeAccessibility` s interaktivním modelem bez explicitního předpokladu selže.
3. **Room coverage:** `pnpm exec tsx scripts/cad-buildings/verify_room_paths.mjs --model MODEL.json --glb MODEL.glb --door-state all-interactive-open --output ROOMS.json`. Otevření je pouze podmínka geometrické přejímky. `status: conditional-pass` znamená úplné standardní geometrické pokrytí bez dalších pending targets, nikoli interaction PASS; exit 0 pro tento jasně pojmenovaný výsledek. Nevybrané místnosti, extra sprchy či selhání návratu nadále znamenají partial. `tourStatus` má původní význam.
4. **World replay:** původní `pnpm exec tsx scripts/cad-buildings/verify_world_paths.ts --building b06 --trace ACCESS.json --output WORLD.json` začíná closed-default, odmítá chybějící sdílenou fyziku i již otevřený start. Source open-all snapshot se používá jen jako označená kandidátní trasa. Aktuální Actor může požádat o otevření výslovného native approach cíle už ze své současné bezpečné pozice; u obyčejné grid hrany se vybírá jen closed list blokující zamýšlený pohyb. Vždy platí produkční dosah, server eye offset, LOS, aktuální/current-next capsule guard a shared state store. Požadavky jsou omezené skutečným počtem proběhlých kroků, žádné fiktivní přesunutí postavy. Pokud podmínky nesplní, trasa zůstane blocked/partial. Výsledek obsahuje `initialDoorState`, `sourceDoorStateAssumption`, `doorInteractions` a omezený `interactionScope`.

`doorStateAssumption` obsahuje `mode`, `doorDefinitionSha256`, úplné `states`, `purpose` a `actorInteractionsVerified:false`. Source coverage používá `all-interactive-open`; jednotlivý door case má `single-interactive-open`. Reporty obsahují také `doorRuntimeSha256` ze skutečných shared door/physics/server adapter zdrojů. Míchání starého runtime, jiných stavů, neúplných seznamů či jiného modelu se odmítá. World manifest navíc zahrnuje serverový door adapter. Actor nastavení, rozměry kapsle, autostep, tolerance podpory a zákaz recovery nebyly změněny.

### Ověření a checkpoint

- `node --test scripts/cad-buildings/test_rapier_model.mjs scripts/cad-buildings/test_accessibility.mjs`: **35/35 PASS**, exit 0, 1.437 s; log `.cache/b6-photo-routes-20261024/native-fixtures-r2.log`.
- `pnpm exec tsx --test scripts/cad-buildings/test_room_paths.mjs tests/cad-world-paths.test.ts`: **35/35 PASS**, exit 0, 4.485 s; log `actor-fixtures-r2.log` ve stejné cache. Celkem **70 cílených CPU fixtures**, nikoli fullsuite.
- Cílený TypeScript syntaktický a sémantický check pouze `verify_world_paths.ts` a `cad-world-paths.test.ts` s projektovým tsconfig: **0 diagnostik**, exit 0; `typecheck-r2.log`.
- `git diff --check` pro devět vlastních souborů: exit 0.
- Během root publikace se jedno opakování Actor fixtures zastavilo před testy na konzistenčním guardu model/site. Log je zachován jako `actor-fixtures-during-native-publish.log`; po výslovném potvrzení konzistentní dvojice nový běh výše prošel. Guard ani assety nebyly kvůli testu měněny.
- Přesné SHA všech devíti souborů i čtených runtime závislostí: `.cache/b6-photo-routes-20261024/checkpoint.json`. Hash seznamu vlastních souborů **`bac04cb7133676fc30e4309a374b18606bb460dbb707bb06280353a0a226238e`**. Diff je `changes-r2.patch`.

Žádné full candidate/full world trasy, Blender, GPU ani hraný snapshot 2591 nebyly spuštěny nebo změněny. Fixtures prokazují mechanismus a skutečný Actor na malých scénách, nikoli ruční použitelnost všech 475 dveří nebo síťový/human playtest. Root provede čerstvé full přejímky až po dokončení native modelu, site a roof atlasu na finálních hashi. Všechny vlastní procesy skončily; po tomto předání je claim uvolněn a vlastní WIP doloženě předán koordinátorovi k adopci.

## R3: skutečné interakce při room tours — b6-routes-interactions-r3, 2026-10-25

Převzato explicitně od roota s `--adopt-dirty`, včetně R2 worker výsledků a rootova předávání čtvrtého obstacle guard argumentu. Baseline/cwd/větev shodné s R2. Nově změněny pouze `rapier_model.mjs`, `verify_world_paths.ts`, `verify_room_paths.mjs`, `test_room_paths.mjs`, toto předání a own cache. Ostatní převzaté verifiery/testy zachovány. Žádná production Game/Simulation/server ani native model/geometry změna.

### Primární příčina a volba

Přečteny skutečné `revision2/native-routes.json` (75/76 open-all, main-entry down start zasahuje otevřený12C2) a `native-rooms.json` (263/264, WC n01:31a leg6 k2718 blokuje otevřený272F). Trvale otevřené listy nejsou univerzálně průchozí stav. Přepsání PASS, zmenšení kapsle, odsunutí křídla nebo vynechání bodu bylo odmítnuto.

Samotná žádost o zavření z point5 také nestačí: native272F sweep obsazuje skutečnou polohu Actora. Zvolena skutečná omezená cesta zpět po již prošlém trailu do pozice, odkud je zavření v dosahu, LOS a povoleno shared guardem; closed pose současně nesmí protínat další leg. Poté se pokračuje ke stejnému původnímu povinnému cíli. Kandidát na close se plánuje s přidanou rezervou.02m a návratová tolerance je.01m; skutečná radius.25/halfHeight.55/skin.02 kapsle ani závěrečný store guard se nemění.

Primární data navíc ukázala, že i initial a point0 skutečného31a už zasahují opening sweep272F. Koordinátor výslovně schválil malý přípravný fyzický leg odvozený z closed plane původního entry462C. Kandidáti zůstávají na původní straně roviny, standoff.36/.34/.32m, displacement nejvýše.14m (konkrétní zdrojový posun~.09–.13m). U skutečného31a odpovídá například.32m bodu(13.300376,1.516377,−24.801868); pure guard z native definice je zde volný. To je plánovací důkaz, **nikoli provedený fullmodel movement PASS**.

### Implementace a přesný kontrakt

Nový `--interaction-mode actor-interaction` začíná closed-default. Nesmí být smíchán s `--door-state all-interactive-open`. Původní conditional mode i jeho report/exit semantics zůstávají. Každý room tour je nezávislý: při nulovém počtu živých Actorů se před novým Actor.add explicitně nastaví complete closed baseline a nový store; nemění se stav uprostřed živého tour. Static world a persistentní dvě pózy se znovu nealokují264krát. Model/physics definice a source lookup se ověří/sestaví jednou, closed baseline array se opakovaně používá.

`createDoorInteractionProbe.beforeMove` používá actual shape sweep k nejbližšímu aktivnímu křídlu. Otevírá explicitní native sourceDoorId včas, nebo closed leaf blokující leg. Zavře open obstruction pouze tehdy, když přesný neaktivní CLOSED collider neblokuje celý leg a actual shared request uspěje. Hypotetická kontrola closed pose je pouze query: žádné skryté physics.apply. Při obsazení current swingem se může vrátit po vlastním measured trailu, s dosah/LOS/guard kontrolou kandidáta a novým **skutečným** store.request až po fyzickém návratu.

Limity: min interval16frames/.267s, nejvýše2pokusy na door/state/leg, nejvýše1úspěšná změna každých dveří v jednom legu, nejvýše2retreaty/leg a256trail points. Každá změna legu zachová i blízký skutečně dosažený waypoint, aby krátký přípravný krok nezmizel v trail decimaci. `walkActorLeg` přijímá wait/visited-point directive, vždy vykoná normální Actor input a physics tick, nesplní původní cíl během nedokončeného manévru a počítá skutečné idle/detour frames. Held jump počítá pouze skutečně odeslané jump frames; pokojové tours stále nemají oprávnění skákat.

Volitelná entry preparation se používá jen při blocked opening prvních jiných native dveří. Kandidát musí projít aktuálním support/reference, capsule overlapem, horizontal sweepem, shared planning guardem a LOS. Z horizontální query se vyjmou jen identifikované support-floor collidery, nikoli ze skutečného pohybu. Následuje actual Actor leg s přísnější.01m arrival a actual request z dosaženého bodu; pak se znovu běžně dojde k povinnému point0. Neprovedený nebo blokovaný plán nesmí vytvořit movement PASS. V reportu je `entryPreparation` včetně source plane/entities, všech kandidátů, podpory, skutečných pohybových výsledků a návratu.

Všechny původní room points a jejich pořadí/návrat zůstávají povinné. Doplňkový sourceDoorId každého bodu musí patřit k aktuální native místnosti/patru a být movable; foreign/fixed reference se odmítne před fyzikou. `doorInteractions` obsahují shared request/result/guard a leg intent; `interactionManeuvers` mají původní target, actual visitedAtTick waypointy a stav dokončení. World replayer tato metadata rovněž uchovává. Report obsahuje explicitní `proofMode`, `initialDoorState` a per-row interaction result. `actorInteractionsVerified` neobchází global expectedRooms/subset/extra target jmenovatel.

### Spuštění roota

```powershell
node --import tsx scripts/cad-buildings/verify_room_paths.mjs `
  --model shared/data/cad-buildings/b06.json `
  --glb public/models/cad-buildings/b06.glb `
  --interaction-mode actor-interaction `
  --room n01:31a `
  --output .cache/b6-photo-routes-20261024/room31a-interactions.json
```

Použij skutečnou aktuální cestu native modelu/companion GLB (případně `--glb`). Pro všech264rooms vypusť `--room`. Podmnožina je stále top-level partial/exit2 i když její jednotlivý řádek passed=true. Stejně zůstávají36extra shower centres explicitně neověřené a top status může být partial při tourStatus=pass. Každý nový Actor začíná u dveří místnosti; není to jedna souvislá prohlídka celé budovy zvenku. Hrané snapshots ani package runner nejsou automaticky spouštěny.

Main stairs all-open75/76 se tím tiše nepřeznačuje. Navazující root proof může použít konkrétní explicitně zaznamenaný door state nebo actual interaction session; musí být oddělen od universal all-open evidence. Šest zadních threshold problémů zůstává samostatná source otázka; změny jejich geometrie, jump permission nebo sourcePassed tento task nedělá.

### Ověření a předání

- `node --import tsx --test scripts/cad-buildings/test_rapier_model.mjs scripts/cad-buildings/test_accessibility.mjs scripts/cad-buildings/test_room_paths.mjs tests/cad-world-paths.test.ts`: **75/75 PASS**, exit0, TAP7.24s; `interactions-r3-final.log` v own cache.
-14roomfixtures zahrnuje narrow two-WC open-all failure vs actual interaction PASS, skutečný retreat/close, stěnu přidanou během retreatu (zůstává partial), nezávislé closed tours, source-derived initial stance s provedeným pohybem i opening, zablokovanou prep pose bez falešného movement PASS a všechny původní geometrie/return/support/teleport/profile regrese.
- Finální `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node,vite/client --esModuleInterop --resolveJsonModule --allowJs` nad world_paths/room_paths/rapier helper a jejich Actor tests: **PASS exit0**, `interactions-r3-typecheck-final.log`. `node --check` všech3 dotčených mjs a `git diff --check`: PASS.
- Dva dřívější `pnpm exec` příkazy samy spustily lockfile/Already-up-to-date preflight a vypsaly dočasné bin ENOENT warningy. Žádný install příkaz ani package/lockfile edit nebyl zadán; následné finální kontroly běžely přímo přes Node bez pnpm sync.
- Full31a/all264/native/world/modelbuild/GPU/server neběžely. Jediná actual-data sonda načetla metadata/reports a zavolala pure shared sweep guard na několik bodů; nešlo o fyzikální scene/fullmodel movement.
- Přesné převzaté+nové source/test SHA jsou `checkpoint-r3.json`; read-only runtime/native dependencies jsou uvedené zvlášť. Nové změny jsou v4výše vyjmenovaných skriptech/testu a tomto handoffu, ostatní R2/root změny zachované.

Všechny vlastní procesy skončily. Po manifestu release; root převezme `--adopt-dirty` a provede skutečný heavy31a/all264 run nad stabilním exportem. Žádný staging, commit, produkční API či zdrojové CAD soubory nebyly měněny.

## R4: pokračování po zakrytí kliky a bezpečné opětovné otevření — b6-routes-interactions-r4

Převzato zpět od `b6-r3-routes-acceptance` explicitním předáním a `--adopt-dirty`. Zachován celý R2/R3/root WIP v deseti převzatých cestách; nově upraven pouze `rapier_model.mjs`, `verify_room_paths.mjs`, `test_room_paths.mjs`, `tests/cad-building-world.test.ts`, toto předání a vlastní cache. Cwd/větev/HEAD beze změny. Bez nového BMAD, stagingu, commitu, produkčního runtime nebo úprav modelu.

### Výzkum a volba

Rootův `revision2/all-room-interactions.json` má 254/264: šest západních WC `n01:54a`, `n02:144a`, `n03:244a`, `n04:344a`, `n05:444a`, `n06:544a` spotřebovalo dvě žádosti ještě se zakrytou klikou; po příchodu blíž už vlastní kapsle správně blokovala opening sweep. Čtyři východní WC `n03:221a`, `n04:321a`, `n05:421a`, `n06:521a` nejprve skutečně otevřela první kabinku, legitimně ji zavřela kvůli cestě k umyvadlům, ale helper neuměl následný návrat do bezpečné opening stance. Všechny finální blokující kontakty byly zavřený interaktivní list a podlaha. Stejný native SHA `18c19331fdfcd254752660bb7b34c411647945ac539b29b2fccc095abb0a52da` měl u těchto deseti tras conditional PASS; tento starší výsledek není důkaz interakce.

Samotné zvýšení retry limitu nepomáhá obsazenému sweepu. Automatické otevření, změna kapsle, vynechání bodů a změna architektury byly odmítnuty. Zvoleno stejné bounded sledování již fyzicky dosažené stopy v obou směrech změny dveřního stavu. Zakrytá klika má první skutečné zamítnutí v reportu; další pokus čeká na skutečnou viditelnost, zatímco postava může normálně postupovat. Limity jsou osm požadavků na door/state/leg, dva v okolí stanoviště o poloměru .15m, minimum16frames, jedna úspěšná změna každého listu v legu a nejvýše dva retreaty. Dveře stále mění jen `CadDoorStateStore.request` s aktuálním dosah/LOS/capsule/obstacle guardem.

První R4 full run dosáhl260/264 (`all-rooms-r4.json`). Čtyři západní WC potom došla až k poslední kabince, jejíž otevírací sweep zasahuje už výchozí vstupní pozici. Původní entry preparation zvažovala jen první vzdálený cíl. Nově vybírá i pozdější skutečně anotovaný tour list, jehož sweep zasahuje počáteční kapsli; nejvýše jedna příprava používá stejné původní CAD entry plane, standoff .36/.34/.32m, displacement≤.14m, support/overlap/sweep a skutečnou chůzi. Případné předběžné otevření i opětovné zavření při odchodu ke vzdáleným kabinkám jsou skutečné interakce, nikoli conditional nastavení.

### Refaktoring a meze

`plannedChangeClear` a desired-pose leg query sdílejí open/close větev. Pokud bezpečná opening stance nemá přímou volnou cestu kolem špičky otevřeného křídla, může pokračovat zpět po téže již dosažené stopě. `changeAfterPoint` a `changedAtTick` oddělují skutečnou změnu od následného pohybu. Cílový návratový bod musí projít i sweepem skutečného světa, ne jen testem jednoho listu; z plánovacího horizontálního sweepu se vyjmou pouze rayem identifikované podpory jako u entry prep. Skutečný Actor nadále koliduje se všemi povrchy. Mapka výsledků plánovací query je jen lokální pro jedno hledání, trail je omezen256 body a uvolňuje se s probe. Žádná druhá geometrie, alternativní controller, teleport ani změna skutečné kapsle.

Všechny původní body/návrat a36extra shower centres zůstávají ve stejném jmenovateli. Jednotlivé room tours jsou nezávislé, nikoli jedna souvislá cesta všech264pokojů zvenku. Post-open plán, který vybral místo ve vedlejší kabince, v průběžném `wc144a-r4-tip.json` správně zůstal partial kvůli skutečné příčce; doplněný whole-scene sweep takového kandidáta odmítne. Jedno ověření `wc144a-r4-prep.log` bylo odmítnuto manifestem, protože jsem během běhu upravil zahrnutý fixture soubor; tento běh není přijatý důkaz.

### Ověření

- První tři nové reprodukce měly RED3/3; po opravě nové i původní room fixtures procházejí. Aktuální souhrnný běh `interactions-r4-all-fixtures-final.log`: **80/80 PASS**,19roomfixtures, bez fullsuite.
- Actual `wc54a-r4.json`: N01:54a PASS,1476 nejprve occluded tick104 a skutečně open tick120 po chůzi. Actual `wc221a-r4.json`: N03:221a PASS,2555 open→close→open po47bodovém skutečném retreatu, všechny povinné body a návrat.
- Strict TypeScript s allowJs nad dotčenými verifiery a relevantními testy: PASS v `interactions-r4-typecheck.log`; finální opakování po world-test změně **PASS exit0**, `interactions-r4-typecheck-final2.log`.

Závěrečný native běh nad zmrazenými vstupy: `all-rooms-r4-final.json`, **261/264**, `tourStatus:partial`, všech36extra shower centres stále `not-verified`. Zbývají `n02:144a` bod19, `n04:344a` bod19 a `n06:544a` bod20. U všech proběhla bounded entry preparation a skutečné open tick82→close tick98 poslední kabinky; pozdější návrat nemá v omezené recent stopě kandidáta, který zároveň dovolí změnu a volné pokračování. Konečný kontakt je příslušný zavřený interaktivní list a podlaha. To je **neúplný navigační důkaz**, nikoli doložená neprůchodná stavební geometrie. Původních264tour a pořadí všech bodů se nezměnily. Koordinátor výslovně upřednostnil pravdivé zbývající partial případy před širším vyhledávacím algoritmem jen pro zelený výsledek.

### Oprava zastaralého world-door testu a jeho skutečný důkaz

Na výslovné navazující zadání roota upraven `tests/cad-building-world.test.ts`: původní test se jmenoval „otevřené dveře“, ale v closed-default Simulation nikdy list neotevřel. Nyní každý nezávislý případ explicitně otevře pouze testovaný native list a po obou směrech jej vrátí do zavřeného stavu. Test kontroluje closed-default při konstrukci, pevné listy zůstávají statické a ochrana se ověřuje exact coverage i skutečným světovým rayhitem oběma směry. Tato úprava nedává žádný E-interaction PASS; report má `actorInteractionsVerified:false` a explicitní single-leaf-open předpoklad.

Nativních šest walking failures nebylo bez měření převzato jako světové selhání. První actual world run (`world-doors-r4-b06.json`) ukázal, že všech950směrů fyzicky projde, šest známých rear UP jen skutečným8frame held jump. Předběžný assertion očekávající šest světových selhání proto správně zčervenal a nebyl přijat. Finální test eviduje `walkingPassed` před skokem zvlášť a pro přesných šest ID/směrů vyžaduje walking failure + actual jump success + `sourceHeightResolved:false`:

- `n01-door-4D6C:0`, `n01-door-4D81:1`, `n01-door-4D8D:0`, `n01-door-4DA1:1`, `n01-door-4DAE:0`, `n01-door-4DC3:1`.

Zdrojově nevyřešený rozdíl0.481m zůstává explicitním omezením. Změna těchto očekávaných walking výsledků vyžaduje nové posouzení a odstranění staré výjimky; jiné fyzické selhání se neignoruje. Report B6 má celkový `status:partial`, přestože `physicalStatus:conditional-pass`.

Finální příkaz `node --import tsx --test --test-reporter tap --test-name-pattern 'podmíněné průchody' tests/cad-building-world.test.ts` se `CAD_DOOR_PROOF` v own cache: **2/2 PASS**, exit0, TAP39.853s (`world-doors-r4-final.log`). B1 **574/574 směrů +30/30 pevných ochran**, žádný skok. B6 **950/950 směrů +456/456 ochran228pevných křídel**, skutečně7jump/943walk. Sedmý skok je P01door2552:1; šest rear případů má samostatnou unresolved source evidenci. Přesné reporty jsou `world-doors-r4-final-b01.json` a `world-doors-r4-final-b06.json`.

### Předání a lifecycle

Všechny vlastní CPU procesy skončily. Fullsuite, build, Blender, GPU, server a hrané snapshoty nebyly spuštěny ani změněny. Závěrečný manifest všech převzatých vlastněných souborů včetně testů a tohoto předání: `.cache/b6-photo-routes-20261024/checkpoint-r4.json`; diff je `changes-r4.patch`. Syntax a scoped diff whitespace check byly ověřeny. Po zápisu manifestu následuje release `b6-routes-interactions-r4`; koordinační root může převzít doložený WIP přes `--adopt-dirty`. Celek modelových tras zůstává partial z výše uvedených důvodů, nikoli Done. Další průzkum tří zbývajících room návratů je oddělen od tohoto předaného bounded mechanismu.

## R5: skutečný obchvat konce otevřeného listu — b6-room-tip-r5

Task rezervován bez `--adopt-dirty`, vlastní soubory byly čisté. Výchozí HEAD `726c957de2eaf234465b3134bf31ea58305b8f85`, větev `codex/b6-photo-refinement-20261024`, stejný cad-building-models worktree. Nové změny pouze `scripts/cad-buildings/rapier_model.mjs`, `verify_room_paths.mjs`, `test_room_paths.mjs`, `test_rapier_model.mjs`, toto předání a vlastní cache. Cizí modelové/geometrické R5/R6 změny nebyly přebírány ani upravovány.

### Doložený mechanismus a varianty

Čtení `revision2/frame-r3/rooms-final-model.json` potvrdilo261/264. Zbývající `n02:144a`, `n04:344a` a `n06:544a` selhaly při vstupu do poslední kabinky (body19/19/20), nikoli až při posledním návratu. Závěrečné kolize jsou zavřený list `1122/102A/1063` a podlaha. Poslední list se legitimně otevřel při vstupní přípravě a zavřel kvůli cestě k ostatnímu vybavení; pozdější opening sweep obsazuje sama postava. Stejná XY definice na N03:244a skutečně prošla, když se předchozí pomocný bod dokončil o několik centimetrů dál od sweepu. Jde o neúplný omezený plán, ne důkaz neprůchodné stavební zdi.

Zpřísnění příjezdu k původnímu pomocnému středu `[0.6345452991,-86.2474931881]` není správná oprava: tento střed je blíž opening sweepu než dosažené bezpečné polohy v pozitivním kontrolním patře. Obecný A* nebo změna modelu/kapsle nejsou potřebné. Zvolen jediný volitelný rohový bod odvozený z nativního závěsu, konce listu v otevřeném stavu, poloviny tloušťky, skutečného radius.25/skin.02 a planning margin.02. Pro původní B6 definici odpovídá CAD `[4.192803,2.349005]`, world přibližně `[0.491143,-85.747244]`; tyto souřadnice nejsou v implementaci hardcoded.

### Chování a refaktoring

`createDoorInteractionProbe` má pátý volitelný argument `{leafTipDetours:true}`, zapnutý pouze room verifierem. Default world/grid volání zůstává bez tohoto plánování. Nejprve se stále hledá proveditelná již prošlá stopa. Teprve pokud neexistuje její pokračování, lze z bezpečného dříve dosaženého stanoviště plánovat jeden bod za koncem listu směrem k původnímu cíli. Obě nové hrany ověřuje full-scene sweep skutečné kapsle v požadovaném dveřním stavu; nic se při query nepřepíná. Podél obou hran jsou nejvýše40segmenty/hranou po max.15cm, každý s rayem i vertical sweepem stejné kapsle. Podpora musí být vodorovná a na stejném skutečném patře do.03m. To je konzervativní pokojový plán, nikoli další controller nebo obecná schodišťová navigace.

Postava nejdříve skutečně dojde po vlastní stopě zpět, shared store ověří dosah/LOS/aktuální+next kapsli/obstacles a provede E-equivalent request. Pak se skutečným běžným inputem dojde k rohu s přesností.01m, grounded a podporou do.03m; až potom může pokračovat na původní povinný bod. Corner nikdy nepředstírá předem navštívený trail: má samostatnou provenienci, vzorky podpory, `reachedAtTick` a skutečnou pozici. Teprve vykonaná cesta k němu vstupuje do trailu pro případný bezpečný návrat/zavření. Původní body, pořadí, návrat, capsule a sourceRoom metadata beze změn.

Desired-state filtr colliderů je sdílený horizontálními/svislými query. Cache kandidátů je lokální nebo omezená na leg; nejvýše8cornerplans/door/leg, minimální odstup opakování na stejném stanovišti16frames, nejvýše1corner/retreat a2retreaty/leg. Trail i nově zaznamenaná vykonaná stopa jsou omezené256body a čistí se s probe. Skutečná chůze stále testuje všechny povrchy, takže pozdější překážka způsobí partial.

### Průběžné ověření

- Nová skutečná dvou-WC fixture s obsazeným opening sweepem: bez opt-in **RED**, očekávané `partial !== pass`, uložené `room-tip-r5-controlled-red.log`; po opravě PASS se všemi původními body/návratem a skutečnou shared request změnou.
- Nové negativní fixtures: statická stěna v rohu, skutečný výřez podlahy pod rohem a překážka přidaná až po plánování/otevření. Všechny zůstávají partial, bez falešně dosaženého cíle, recovery nebo zmenšení kapsle.
- Room+Rapier **40/40 PASS** před publikací R6, `tsc --noEmit` exit0. Rozšířené opakování `room-tip-r5-fixtures.log` následně zasáhlo rootovo publikační okno:35CPU testů PASS, dva importy správně odmítnuty guardem `CAD site b06 neodpovídá exportovanému modelu`. Tento běh není přijatá zelená evidence a bude po stabilním exportu zopakován.
- Actual R6 filtered/full-room evidence a konečné předání budou doplněny po stabilní publikaci. Zatím žádný nový actual-model PASS, fullsuite, build, server, Blender ani GPU důkaz.

### Konečný actual R6 výsledek

Root po dokončení publikace výslovně garantoval stabilní native/runtime vstupy a povolil čtyři filtered CPU průchody, poté všech264. Reporty `room-tip-r5-r6-{144a,344a,544a,244a}.json`: **4/4 jednotlivé tours PASS**,26/26/27/27povinných bodů včetně návratu. Každá ze tří předchozích chyb skutečně použila právě jeden nový corner, kontrolní244a prošla beze změny původní cesty. Shodný aktuální collision SHA `218ae18f9ef1e737b11e5189a6ce4c59f7099a3d91e2f773441dc7642a179cd4`, GLB `6beab84e812adca126051d0a3fd221612b76e3b984a300a972239caadd62d027`.

Finální `.cache/b6-photo-routes-20261024/room-tip-r5-r6-all264.json` + `.log`:

- **tourStatus PASS,264/264**, `actorInteractionsVerified:true`,1940/1940povinných bodů a264/264skutečných návratů.
-59152běžných WALK frames;373změn dveří z391skutečných shared-store žádostí,18pravdivě evidovaných zamítnutí. Žádný jump/recovery/teleport během tour a žádná změna native modelu či kapsle.
- Přesně3odvozené dokončené corners:144a/1122 (opening tick453,corner tick461),344a/102A a544a/1063. Zbytková výšková chyba na skutečně dosaženém rohu0.10–1.31mm; celá navazující mandatory trasa včetně návratu prošla.
- Top-level **status partial** zůstává záměrně kvůli36extra shower centres, které toto měření neověřuje. Jde o264nezávislé pokojové prohlídky od dveří, nikoli jednu souvislou trasu od venkovního vstupu nebo GPU/multiplayer důkaz.
- Model/GLB i celý sourceManifest byly na začátku/konci ověřeny beze změny. Filtered CLI i all264 mají očekávaný exit2 kvůli poctivému partial jmenovateli, nikoli runtime exception.

Po stabilní publikaci zopakovány lehké room/Rapier/accessibility/world-path fixtures: **83/83 PASS**,5.024s, log `room-tip-r5-fixtures-final.log`. Syntax a scoped diff whitespace check PASS. Strict targeted TypeScript s `--allowJs` nad všemi čtyřmi dotčenými skripty/testy a world-path dependency po posledním refaktoringu **PASS exit0**, log `room-tip-r5-typecheck-final.log`. Předchozí odmítnutý publikační běh zůstává uchovaný, nenahrazuje se zeleným logem.

Všechny vlastní fyzikální i typové procesy skončily, žádný server/GPU/Blender/build/fullsuite nebyl spuštěn. Následuje manifest `checkpoint-room-tip-r5.json` a release `b6-room-tip-r5`; integrátor může převzít tento konkrétní WIP přes `--adopt-dirty`. Root již obdržel actual264výsledek a nezávislé čtecí helper review od weather_sky_fixes. Stav katalogu/integraci provede root.
