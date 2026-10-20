# Předání: global-refactor-quaternion-20261020

- Vlastník: `refactor-01a15658-quaternion`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`; výchozí commit `1701bd07ad330df038d9b2b30489ab3560be1090`.
- Výsledek: implementace, cílený refaktoring a přidělené CPU ověření dokončené, připravené k přezkoumání a integraci. Žádný staging ani commit nebyl proveden.
- Změněné soubory: `shared/quaternion.ts`, `shared/terrain-entities.ts`, `shared/vehicle.ts`, `scripts/rebuild-campus-transit-navigation.ts`, `shared/data/transit-navigation.json`, `tests/transit-navigation-source.test.ts`, `tests/quaternion.test.ts` a toto předání.
- Cizí WIP: při zahájení existovaly změny specifikací, task JSON, předání koordinace a staged `client/world-renderer.ts`, `tests/graphics.test.ts` a jeho handoff. Nic z toho nebylo převzato nebo upraveno. Vlastní writePaths byly před claim čisté; read-only kontrola společného registru nepotvrdila kolizi. Claim uspěl 20. 10. 2026 v 06:57:56 UTC, heartbeat byl obnoven před zápisem tohoto předání.

## Podklady, mechanismus a volba

Průzkum 20. 10. 2026 vychází ze skutečného výchozího zdroje a jeho volajících: `terrain-entities` skládá yaw/pitch/roll, `vehicle` skládá natočení podvozku/řízení/odvalování kol a promítá směry a body. `transitObstacles` používá stejnou terénní rotaci pro kinematické kolize; `assets`, `transit-renderer` a `contact-shadows` ji převádějí do Babylon transformací. Dočteny relevantní testy, generátor a přesný seznam hashovaných navigačních vstupů. Autorizační kontext: AGENTS.md, architecture, README koordinace, current-work, BMAD policy, zadání tasku, `docs/refactoring/20261020/README.md` a `spec-maintenance.md`. Rekurzivní BMAD nebyl spuštěn.

Doložený mechanismus: obě rotate a obě multiply mají stejné výrazy i jejich pořadí. Import matematiky z `vehicle` by přivedl Rapier do terénních/navigačních dat; opačný import by vozidlu přidal terrain grid. Ponechání duplicit zachovává dvě místa údržby. Externí knihovna přidává závislost a nejistotu numerické shody; normalizace mění nenormalizované a nefinální hodnoty. Zvolen je čistý `shared/quaternion.ts` s jediným type-only importem `Vec3`, původními těly funkcí a pojmenovanými veřejnými wrappery `rotateGroundVector` a `rotateVehicleVector`. Původní `GroundRotation` a `VehicleRotation` deklarace zůstaly přesně zachované.

Refaktoring nepřidává normalizaci, validaci, stav, cache, reuse výsledků ani vlastní zdroje. Stejné aritmetické operace vracejí stále jeden nový objekt; wrapper navíc deleguje jedno volání. Žádné zrychlení/FPS se netvrdí. Pro chování, vzhled a lifecycle jsou relevantní přesná numerická shoda a stávající transform/disposal testy; skutečné GPU měření zde není potřebným ani provedeným důkazem.

Generátor a hash test nově obsahují `shared/quaternion.ts`. Generátor běžel s výchozím výstupem pouze do rezervovaného `shared/data/transit-navigation.json`. Má 25 vstupů; změnily se pouze hashe `shared/terrain-entities.ts`, nového `shared/quaternion.ts` a samotného generátoru. Po odstranění pouze textového pole `sourceHashes` jsou původní i nové bajty JSON stejné, včetně pořadí klíčů a koncového LF: SHA-256 `96ff0e8488bb284b68b1fa25ec88bdb890af165af8ee028bb68c73ee8b28f0fc`. Zůstává 9 destinací, 18 cest, žádné přeskočené cesty. Žádná data o jízdách/geometrii/provenienci se nezměnila.

## Ověření

Všechny příkazy běžely v uvedené pracovní kopii, bez síťové služby a bez persistentních pomocných procesů.

1. `node --import tsx --test tests/quaternion.test.ts`: exit 0, 12 PASS, 0 FAIL, 0 SKIP, 631.16 ms. Testy nepřepisují původní algoritmus: používají analytické identity, osové půlobraty, Hamiltonovo pořadí, složení jednotkových rotací, konkrétní nenormalizovaný výsledek, nefinální komponenty a zmrazené vstupy/nezávislé výstupní objekty u helperu i obou veřejných wrapperů.
2. Jednorázové přímé porovnání staré skutečné matematiky: `git show 1701bd07ad330df038d9b2b30489ab3560be1090:<path>` pro oba moduly; TypeScript AST vybral skutečné deklarace rotate, multiply a groundRotation, `transpileModule` odstranil typy a VM vykonala původní těla. Žádná ruční kopie algoritmu v testu. Deterministické LCG `seed=0x48a90f`, `a=1664525`, `c=1013904223`, rozsah ±10000: 10000 konečných případů a 36 hraničních případů s ±0, ±1, subnormály, velmi malými/velkými čísly, ±Infinity a NaN. Srovnány oba původní rotate, všechny tři nové rotate a oba původní multiply s novým; navíc 1000 groundRotation s analytickou výškovou funkcí `sin(x/70)+cos(z/90)`. **61216 přesných porovnání objektů pomocí Object.is po komponentách PASS**, včetně znaménkové nuly a NaN. Exit 0.
3. Samostatná AST kontrola: obě původní těla rotate i multiply jsou po sjednocení CRLF/LF textově shodná s těly helperu; deklarace obou původních veřejných typů beze změny; helper má **0 runtime importů**. Exit 0.
4. `node --import tsx scripts/rebuild-campus-transit-navigation.ts`: exit 0; přímé porovnání výstupu s původními JSON bajty z commitu mimo `sourceHashes` PASS; přesná trojice změněných hashů ověřena assert.
5. Přesný task příkaz, 20. 10. 2026 přibližně 07:01:24–07:01:30 UTC:

   ```text
   node --import tsx --test tests/quaternion.test.ts tests/vehicle.test.ts tests/recovery-physics.test.ts tests/transit.test.ts tests/transit-navigation-source.test.ts tests/native-car-models.test.ts tests/realistic-car-pack.test.ts tests/transform-updates.test.ts
   ```

   Exit 0, **60 PASS, 0 FAIL, 0 SKIP**, Node duration 5938.8955 ms. Ověřena stávající Rapier jízda, skládání/obnova stavů, kolize, fixed-step/replay, transit překážky a B6 trasy, skutečné GLB parkovacích aut a Babylon matice/hranice/disposal v NullEngine. Koncový stdout je zde zachován jako kompaktní evidence:

   ```text
   tests 60
   suites 0
   pass 60
   fail 0
   cancelled 0
   skipped 0
   todo 0
   duration_ms 5938.8955
   ```

6. `git diff --check -- shared/quaternion.ts shared/terrain-entities.ts shared/vehicle.ts scripts/rebuild-campus-transit-navigation.ts shared/data/transit-navigation.json tests/transit-navigation-source.test.ts tests/quaternion.test.ts`: exit 0.

## Identita předávaného payloadu

Manifest zahrnuje všechny zdrojové/datové/testové změny, včetně nových untracked souborů; nevychází pouze z tracked diffu. Toto předání není součástí vlastního sebereferenčního manifestu. SHA-256 kanonického `JSON.stringify` pole objektů `{path,sha256}` v následujícím pořadí: `b3de11aa4c32628743426beca5d06c764c9e940eaec670c7cb4de91042648db4`.

| Soubor | SHA-256 |
| --- | --- |
| scripts/rebuild-campus-transit-navigation.ts | 9d942b2ba1579ef976f3eec4631128c864fdd49e481517c92616de08061e2b32 |
| shared/data/transit-navigation.json | b9acdfac3d3671f15a65882d89ab854cb76fe81dc45eba66612c15cb637ac3f3 |
| shared/quaternion.ts | 97fcc5a50bf9e8e315aa240cf58ac81a2a971bea7f11e053279dd2d88a14d6ab |
| shared/terrain-entities.ts | ac759dda22dec4a936173e1b4d37931dd14067bc2226c94b55f3162d73d547b0 |
| shared/vehicle.ts | 8a5cb483d6261efeb6508b82be172e8b70a3aca9e143e468bd8668cc2f8073f2 |
| tests/quaternion.test.ts | 4b175abef8b906b8487cf884d3b763be25c3efd34d8310a4b1b377fd47395d44 |
| tests/transit-navigation-source.test.ts | b1511b1e5b3a80fcfaaa3914f7b04eb9a86f60d324d886b40be79f1b1236c021 |

## Procesy, rezervace a převzetí

Vlastní procesy byly pouze ukončené CLI (testy, read-only kontroly, rezervace a navigační generátor); žádné vlastní PID/porty/GPU/Blender/server nezůstávají. Žádné modely ani vstupní podklady nebyly regenerovány, staženy nebo editovány. Testy existující GLB pouze četly.

Předání je připravené pro `refactor-01a15658-audit`. Po jeho doručení se rezervace `global-refactor-quaternion-20261020` uvolní standardním CLI; konkrétní výsledek release potvrzuje závěrečná zpráva a společný registr. Zápisy po uvolnění nebudou pokračovat. Necommitnuté změny nadále patří výslovně tomuto předanému tasku.

Omezení: plná sada, build, integrace a skutečná produkční/GPU přejímka nejsou v tomto scope a nebyly spuštěny; patří koordinátorovi nad stabilním checkpointem. NullEngine ani přesná numerická shoda se nevydávají za GPU výkon. Integrátor provede nezávislé review, ověří manifest a konkrétní task diff, převezme změny, doplní společnou evidenci a provede samostatný commit/integraci a změnu task stavu.
