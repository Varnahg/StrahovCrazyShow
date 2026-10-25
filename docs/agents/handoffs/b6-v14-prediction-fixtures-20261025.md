# Předání: b6-v14-prediction-fixtures-20261025

- Vlastník: `b6-v14-prediction-r2`; příjemce: root koordinátor.
- Worktree: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, výchozí HEAD `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- Rozsah: pět přidělených test/helper souborů, vlastní cache a toto předání. Claim získán nad čistými cílovými soubory; cizí rozpracované změny nebyly převzaty ani měněny. Žádný runtime, asset, server, GPU, build, fullsuite, stage nebo commit.

## Mechanismus a rozhodnutí

V úplném snapshotu `source-r2-v3b` selhalo 31 případů z této skupiny. Partial Game fixtures používaly `Object.create(Game.prototype)` a nedostaly nové constructor-owned V14 dveřní maps/store/timeline. Jejich authority neměla door epoch/revision, takže skutečný `Game.reconcile` správně skončil před přehráním historie. Interpolace správně požadovala door resync. Dva recovery assertions navíc považovaly `walkingColliders` pouze za seznam hráčů, přestože nyní obsahuje také 475 neaktivních dveřních poloh.

Vypnutí guardu, vynulování CAD definitions, volání náhradního reconcile ani povolení dalšího replaye místo původního očekávání bylo odmítnuto. Zvolená oprava dodává platná vstupní data a skutečné sdílené třídy. Původní assertions replaye, grounded/vehicle stavu, interpolace, frontiers, ovládání, recovery a ochrany nepovinných getterů zůstaly zachované.

## Změny a cílený refaktoring

- `tests/helpers/prediction-replay-fixture.ts`: společný `installFixtureDoorHistory` inicializuje skutečné `CadDoorTimeline` a `CadDoorStateStore` nad aktuálními definitions, všechny příslušné Game maps a render-state sink. Sink kontroluje úplnost seznamu a shodu se stavem již aplikovaným do skutečného `CadDoorPhysics`. Původní Game metody se nenahrazují. Fixture packet helper doplní epoch/revision z timeline a kopíruje property descriptors; nevyhodnocuje nepovinné telemetry getters. Předem vytvořená prediction history obdrží odpovídající historické revize.
- `tests/client-recovery.test.ts`: stejný helper a explicitní `withAuthority(...)` kolem vstupů do původního Game.reconcile. Všechny původní významové assertions zůstaly; změna lokální identity nebo síťové epochy není nahrazena resetem očekávaných výsledků.
- `tests/game-interpolation.test.ts`: analytický pohyb zůstává konstantní a beze změny. Pouze dveřní kanál vlastní malý skutečný Rapier world se sdílenými `CadDoorPhysics`; žádná celá Simulation ani scéna/render loop se zde nevytváří. Helper odmítne instalaci oddělené fyziky do fixture, která už deklaruje prostorový world bez svého skutečného doorPhysics. Každý test má explicitní cleanup.
- `tests/prediction-replay.test.ts`: původní očekávání včetně `[45,15]` celkových replay kroků, přesných časů, úplných vehicle captures a grounding jsou zachované. Přidána negativní regrese: chybějící nebo cizí door epoch stále skončí odmítnutím bez pohybu či prune; následná platná authority skutečně přehraje 15 kroků.
- `tests/recovery-physics.test.ts`: místo magického total=1/2 se porovnává přesný původní ignore set plus skutečné aktuální actor handles. Pro každé dveře se navíc kontroluje, že neaktivní pose zůstává ignorovaná a aktivní collidable. Původní leak/respawn/vehicle assertions zůstaly.

Helper vlastní pouze fixture stores/timeline a případný samostatný malý door world. Jeho idempotentní úklid je připojen k původnímu Simulation cleanupu; skutečný Simulation world nadále uklízí původní implementace. Sdílené definice se nemění, nekopíruje se vlastní hinge ani autoritativní stavový automat.

## Ověření

Konečný sériový příkaz nad stabilním checkpointem:

```powershell
node --import tsx --test --test-concurrency=1 tests/game-interpolation.test.ts tests/prediction-replay.test.ts tests/client-recovery.test.ts tests/recovery-physics.test.ts
```

**40/40 PASS**, exit 0, bez skip/cancel, 99,775 s. Z toho 39 původních případů a jedna nová negativní V14 regrese. Log: `.cache/b6-v14-prediction-fixtures-20261025/target-final.log`. Jednotlivé předchozí cílené běhy jsou zachované v téže cache: interpolace 11, prediction 9, client recovery 16 a recovery physics 4 případů.

Cílený TypeScript program pro všech pět přidělených souborů, projektové nastavení, syntaktické a sémantické diagnostiky těchto souborů: **0 diagnostik**, exit 0; `typecheck.log`. Nejde o celoprojektový typecheck cizích změn. `git diff --check` pro vlastní soubory: exit 0.

Manifest `.cache/b6-v14-prediction-fixtures-20261025/checkpoint.json` obsahuje přesné SHA-256 všech pěti souborů a pojmenovaných runtime/modelových závislostí; kontrola po finálním běhu zjistila **0 změněných vstupů**. Hash seznamu vlastních souborů: **`872383d9376e416f8e7a77451a69b23ebf6f31bbcdd68d64e80ad4c2edcf348d`**. Diff je `changes.patch`.

## Hranice a předání

Žádná produkční chyba se při této opravě neprojevila; runtime nebyl upraven. Tyto výsledky neprokazují GPU vykreslení, multiplayerový SDK průchod, zadní terasový threshold ani celý světový route audit. Integrátor je ověří ve svých přidělených scopes.

Všechny vlastní procesy skončily. Po zápisu předání je claim uvolněn a tento doložený WIP je předán rootovi k adopci; release sám o sobě není integrace ani změna tasku na Done.
