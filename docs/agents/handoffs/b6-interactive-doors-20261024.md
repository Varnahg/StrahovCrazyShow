# Předání: b6-interactive-doors-20261024

- Vlastník: `b6-doors-r2` (`/root/cad_b1_probe_review`); příjemce: `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- Výsledek: integrovatelný shared core a malé skutečné Rapier/Actor testy. Výchozí zavřené B6 křídlo, okamžité stavy, autoritativní request guard, explicitní current+next ochrana hráčů, complete snapshot, bounded timeline a fail-closed resync při chybějící revision. Integrace hry/sítě/native assetu není tímto označena hotová.

## Vlastní soubory

- `shared/cad-doors.ts`
- `shared/cad-door-physics.ts`
- `shared/cad-door-timeline.ts`
- `tests/cad-doors.test.ts`
- `tests/cad-door-physics.test.ts`
- `tests/cad-door-timeline.test.ts`
- `docs/reality-pack/cad-buildings/b06/interactive-doors.md`
- toto předání
- Ignorovaná vlastní evidence `.cache/b6-door-runtime-20261024/` (logy a `handoff-manifest.json`).

Všechny implementační/testovací soubory jsou nové. Nebyla převzata ani změněna cizí rozpracovaná práce. Root souběžně vlastní builder/Simulation/UI/server/netcode; shell a finishes mají své vlastníky. Žádný staging/commit, asset přegenerování ani změna frozen 2591/source-v4.

## Podklady a rozhodnutí

Primární podklad je uživatelský ruční test a jeho instrukce zavřených E dveří, existující produkční `Actor` a lokální připnuté Rapier API. Reprodukce pohybu jediného collideru dokládá neaktuální query broad-phase v nové poloze bez `world.step`, i když `propagateModifiedBodyPositionsToColliders` vrátí správnou translaci. Proto zvoleny dvě persistentní, vždy enabled statické pózy s okamžitým přepnutím groups/sensor/shared ignore set. Surová ray query bez filtru vidí neaktivní sensor: tento hazard má výslovnou regresi.

Shared geometrie má jednotnou native definici, world pose a model-space affine transform pro batched renderer. Kolize vynechává pouze explicitní `collisionPartIds`; prázdné pole je správně pro native `collision:false` pohyblivé díly. Fixed paired leaf zůstává statický. Root přijal funkční ±90° podle source swing sign; původní CAD angle zůstává provenance, nikoli zaměněný údaj.

## Refaktoring a lifecycle

- Jediný shared transform pro fyzické tělo/handle i absolutní modelové render vertices.
- Dedupe používá explicitní požadovaný stav + per-door revision; globální revision zajišťuje pořadí změn.
- Timeline drží jeden baseline a omezené delty; evikuje celé tick groups a přes mezeru neodhaduje stav.
- Přepnutí nealokuje nový collider ani nepřidává tick. LOS netvoří per-request pomocný Set target handles.
- Close/open guard testuje celé angular sweep i segment current→next každého explicitního capsule probe. Nevyhledává hráče filtrem, který je vylučuje.
- Dispose uvolňuje pouze vlastní collidery/handles před `world.free()`. Dedupe/rate se zapomíná na disconnect; globální stav dveří zůstává. Instance hosta a multiplayeru jsou oddělené.

## Ověření 2026-10-25

`pnpm exec tsx --test tests/cad-doors.test.ts tests/cad-door-physics.test.ts tests/cad-door-timeline.test.ts`: **18/18 PASS**, exit 0, 2.32 s TAP duration. Log `.cache/b6-door-runtime-20261024/core-final.log`.

`pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node,vite/client --esModuleInterop --resolveJsonModule shared/cad-doors.ts shared/cad-door-physics.ts shared/cad-door-timeline.ts tests/cad-doors.test.ts tests/cad-door-physics.test.ts tests/cad-door-timeline.test.ts`: **PASS**, exit 0, `.cache/b6-door-runtime-20261024/typecheck-final.log`.

Praktické malé důkazy: skutečný Actor zastaví před closed leaf, okamžitý open/restore změní jeho KCC movement před dalším `world.step`; souvisle projde otevřenými dveřmi a vrátí se k zavřeným bez teleportu. Dva Actor objekty prokazují odmítnutí kvůli cizí plánované next poloze. Snapshot/timeline přepnou skutečnou query kolizi do minulosti a zpět bez extra ticku. Ostatní dynamic body zůstává při přepínání bitově na místě, počet colliderů se nemění. Sensor-only i group-only filtrování doloženo nezávisle.

Původní malé logy `rapier-query-probe.log`, `rapier-groups-probe.log`, `physics-first.log`, `core-first.log`, `core-refactored.log` zachovány. Vlastní příkazy skončily; žádný živý helper/server/port/GPU/Blender. Fullsuite/build/native/final world nebyly spouštěny z tohoto tasku.

## Převzetí a další krok

- API, filtry a konkrétní pořadí restore jsou podrobně v `interactive-doors.md`.
- Obě collider pózy vytvořit před první běžnou inicializační `world.step`; konstruktor sám broad-phase nespouští.
- Root musí doplnit vehicle exit query filtr, native bounds/identity audit, instant render update, všechny live current+next capsule probes, správný server tick a reliable events/snapshot. Reconcile vyžaduje `snapshotAt(tick, requiredDoorRevision)` a obnovu nejnovějších stavů po replay.
- Vnitřní API callbacky předpokládají důvěryhodný integrační kontext, nikoli klientem dodaný actor/eye/XYZ. Request parser takové dodatečné atributy odmítá.
- `CadDoorStateStore` se při fyzické výjimce neposune; ID pokusu je již spotřebováno. Duplicate reply je inertní a vrací současný stav, nesmí být interpretováno jako nová úspěšná změna.
- Identita celého vlastního předání včetně testů a tohoto dokumentu je `handoff-manifest.json`; jeho SHA bude posláno koordinátorovi.
- Rezervace bude po vytvoření manifestu uvolněna příkazem release a potvrzena v koordinační zprávě. Release neznamená hotovou integraci. Stav tasku aktualizuje koordinátor.

## Navazující P2 obstacle guard — b6-doors-obstacles-r2, 2026-10-25

Převzato explicitně od roota s `--adopt-dirty`. Rootovy `revisionAt`, immutable state cache a přidaná regrese zachovány. Nově změněny pouze `shared/cad-door-physics.ts`, `tests/cad-door-physics.test.ts`, jedna stará assertion v `tests/cad-door-timeline.test.ts`, API dokumentace a toto předání/own cache. Starý pokus o mutaci snapshotu nyní správně očekává TypeError a dál kontroluje nezměněný stav; nový immutable cache contract nebyl oslaben.

Čtecí review doložilo konkrétní P2: původní capsule-only guard dovolí otevřít native `b06:p01-door-2552` do auta stojícího vedle fasády. Closed leaf na x15.3773,z−39.4526 nekoliduje; open leaf končí x16.1689. Standardní chassis u x17,z−40.5 má minX15.98 a vzniká penetrace0.1889m. Referenční ground je−1.1606m, takže jde o skutečný přízemní boční vstup, ne auto v horním patře. Jednotlivá sonda pohyblivého chassis po otevření vykázala posun+0.03394m vX za první world step. Parkovací příjezd v celém světě tato malá sonda neověřovala. Nejbližší současná GTFS road shape je od B6 dveří120.16m; žádný aktuální traffic-overlap zde nebyl doložen, obecná future-pose regrese však zůstává.

Nové API `guardChange(id,open,capsules,obstacles?)` s `CadDoorObstacleProbe={id,collider,next:{position,rotation},skin?}` bylo rootovi předáno před implementací. Next musí být world collider pose, nikoli body origin. Current pose/shape/pivot se bere z předaného actual collideru; seznam je explicitně known car+traffic, žádný world scan. Parked Fixed car zůstává zahrnut. Kontakt používá skutečný Cuboid shape, lineární body-origin motion a quaternion slerp včetně křivky body-local collider offsetu. Analytický padding pokrývá intervaly mezi vzorky obou sweepů; far bounds rejection a jeden stationary sample omezují event cost. Žádný world step, native collider/body allocation ani přepnutí stavu v guardu. NaN, float32 overflow, nulové/špatné quaterniony, neplatné dimenze, zaniklé collidery a nepodporované aktivní shapes vedou k fail-closed `invalid-obstacle`.

Porovnání variant: kontrola jen cílové pózy by minula prostředek pohybu/rotace; pouze nafouknutá koule by zbytečně blokovala vedlejší dveře/patra; obecný world scan by nerozlišil player car v parked Fixed stavu a zahrnul celý statický svět. Vybrané event-only actual-shape kontakty zachovávají přesný známý objem s explicitní konzervativní nejistotou mezi vzorky. Radius/halfHeight hráčské kapsle zůstaly beze změny.

Ověření: `pnpm exec tsx --test tests/cad-doors.test.ts tests/cad-door-physics.test.ts tests/cad-door-timeline.test.ts` **24/24 PASS**, log `.cache/b6-door-runtime-20261024/obstacles-final.log`. Test používá publikovaný native2552 a skutečný `VehicleEntity`, prokazuje block Fixed i Dynamic chassis a ponechává starý capsule-only výsledek true jako reprodukci původní chyby. Nové případy zahrnují translation/vertical crossing s volnými endpointy, middle-only rotaci, q/−q equivalenci, offset-body arc mimo endpoint chord, invalid data, vzdálené/vyšší objekty a inactive collider semantics. Původní Actor/current-next/rewind/lifecycle testy dále prošly. Test výslovně zakáže volání world.step/createCollider/createRigidBody během guardu a kontroluje zachování car.capture a počtů zdrojů.

Targeted tsc PASS v `obstacles-typecheck-final.log`. První test parse chyba v nové fixture a starý mutable-snapshot assertion jsou zachovány v předchozích logách, byly opraveny. Fullworld/build/server/GPU/Blender nebyly spuštěny. Root nyní vlastní napojení `Simulation.doorObstacles()` a jeho předání ve serveru/guest Game, včetně skutečné predikce traffic pose; tyto soubory nebyly tímto agentem měněny.

Nový checkpoint je `obstacles-handoff-manifest.json` (včetně převzatých core testů a read-only dependency identit); původní handoff manifest se nepřepisuje. Vlastní procesy skončily. Po posledním ověření/manifestu následuje release a zpráva koordinátorovi; ten integruje výsledek a provede plný QA checkpoint.
