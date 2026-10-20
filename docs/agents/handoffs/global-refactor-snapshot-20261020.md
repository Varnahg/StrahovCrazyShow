# Předání: global-refactor-snapshot-20261020

- Vlastník: `refactor-01a15658-snapshot`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`.
- Výchozí commit při claimu: `42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a`. Při závěrečném auditu v 07:57:08 UTC již sdílený HEAD `de230983d7e9f04faedf56122ca11f6942ea5e4d`.
- Výsledek: budoucí freezer zahrnuje doložené statické testové/build prerequisites; nový skutečný CLI test a původní benchmark test prošly. Žádný staging/commit/task/spec/Linear zápis ani nové Done.
- Vlastnictví: před zápisem přečten živý claims.json, task, status a worktree list. Všechny taskové cesty byly čisté/volné; claim bez --adopt-dirty. Uvolnění freezeru původním diary vlastníkem dokládá koordinační `0a598a6a5db4bb4e81469543c72b96b5d88720ed`; primary WIP nebyl přebírán.
- Cizí WIP: ostatní dokumentační, runtime, avatarové, testové, grass, autodev, quaternion, simulation a fixture/Python změny zůstaly nedotčené. Staré immutable baseline/candidate kopie ani jejich sidecary nebyly upravovány.
- Procesy/cleanup: všechny jednorázové CLI subprocessy byly dočkány. Vlastní dočasné fixture roots mají ověřený TMP parent/prefix a awaitované cleanup hooky. Žádný vlastní server, port, browser, GPU, Blender ani dlouhožijící proces.
- Rezervace: claim získán před prvním zápisem, heartbeat obnoven před předáním. Po oznámení příjemci následuje release; skutečný výsledek je v následné zprávě/CLI.

## Přesné změněné soubory

1. `scripts/performance-snapshot.mjs` — osm přidaných řádků pouze v entries: pět nových cest a krátké zdůvodnění.
2. `tests/performance-snapshot.test.ts` — nový CLI test s malými dočasnými fixtures.
3. `docs/agents/handoffs/global-refactor-snapshot-20261020.md` — toto předání.

`tests/benchmark-snapshot.test.ts` je výslovně **bajtově nezměněný**. Jiné produkční/testové soubory, assety, závislosti, metadata katalogů ani konfigurace se neměnily.

## Primární průzkum a volba řešení

Přečten celý freezer včetně before/after/frozen hashů, no-overwrite, IPR reuse, filtrování lokálních artefaktů, dependency junction a publikace manifestu. Přečten celý benchmark-snapshot test a skutečné čtené vstupy nových autodev fixtures:

- `tests/autodev-adapters.test.ts:112` kopíruje scripts/agent-tasks.mjs, již zahrnutý prefixem scripts.
- Řádky 126/130 kopírují `AGENTS.md` a `docs/agents/bmad-policy.md`.
- Řádky 293/297 načítají přesná `.agents/skills/bmad-build/step-02-plan.md` a `spec-template.md`. Zbytek devíti BMAD fixture instrukcí test vytváří lokálně; není důvod kopírovat celý skill/renderer strom.
- `scripts/autodev/codex.mjs` pracuje s těmito dvěma plánovacími dokumenty jako hashově ověřenými vstupy.
- `pnpm-workspace.yaml` deklaruje pinned Babylon patch v `patches/@babylonjs__core@9.30.0.patch`; samotný package/lock/workspace bez patch bajtů nestačí k reprodukci frozen instalace.

Nové entries jsou pouze `patches`, `AGENTS.md`, `docs/agents/bmad-policy.md` a dva přesné soubory v bmad-build. Živé verification/current-work/handoff dokumenty ani zbytek .agents stromu se nekopírují.

Porovnané varianty:

| Varianta | Důsledek / volba |
| --- | --- |
| Další sidecary až po freeze | Manifest nepopíše úplné testové/build vstupy; riziko různých bajtů. Nevybráno. Již existující immutable kopie přesto zůstaly nedotčené. |
| Celé docs/.agents | Přibere proměnlivou evidenci, WIP a nesouvisející workflow. Nevybráno. |
| Přesný statický seznam + patches adresář | Vstupy projdou stejným byte hashing/copy kontraktem jako runtime. Vybráno. |
| Nová CLI volba/export/helper v produkčním freezeru | Přidá API bez potřeby. Nevybráno; zbytek skriptu zůstal doslova shodný. |
| Časovaná mutace nebo filesystem watcher v testu | Flaky pořadí vůči malé kopii. Nevybráno. |
| Preload wrapper skutečného fsPromises.cp jen v testovém subprocessu | Mutace po dokončené kopii AGENTS a před dokončením Promise.all je deterministická. Vybráno a ověřeno na Node 24.19.0. |

Úprava používá existující entries/hash/copy cestu; nezavádí paralelní mechanismus, cache, nové zdroje ani instalaci závislostí. V novém testu se sdílí jen malá fixture/run/capture obsluha. Další refaktoring produkčního skriptu by zde nepřinesl doložený přínos.

## CLI test: reálný skript, malé vstupy

Test kopíruje **skutečný skript** beze změny do fixture/scripts; import.meta.dirname tak určuje fixture root běžným produkčním způsobem. Všechny ostatní vstupy jsou malé placeholdery, včetně pěti bajtů IPR reference, textového Blender master placeholderu a dummy node_modules. Nekopírují se skutečné modely, patche ani projektové instrukce a nespouští se download/build/install.

Pět nových případů používá 16 dokončených CLI subprocessů:

1. Přesné kopie/hash manifest všech 23 fixture vstupů; čtyři statické instrukční soubory, pinned patch a další nested patch ověřují i rekurzi patches. CRLF a UTF-8 placeholdery se zachovají bajtově. Živé docs, jiný skill, .blend1 a __pycache__ zůstávají mimo manifest i kopii. Skutečná dependency junction míří na dummy node_modules a sdílí marker.
2. Změna **každé** ze šesti nových fixture souborových prerequisites změní budoucí source identity, ale starý manifest/bytes zůstanou neměnné. Obnovení všech vstupů obnoví původní source ID.
3. Opakování jména vrátí EEXIST a nezmění existující manifest ani AGENTS bajty.
4. Testový preload ovlivní pouze child fsPromises.cp. Po skutečné kopii AGENTS změní zdroj, potvrdí vlastní marker a freezer odmítne publikaci s `Sources changed while freezing`. Failed directory zůstane, manifest ani dependency junction nevzniknou; nový název následně úspěšně zachytí změněné bytes.
5. IPR reuse zachová všechny hashes/source ID a propojí pouze reference na dřívější snapshot; sourceManifest hash a počet reference souborů se ověří. Změněné historické bajty jsou odmítnuté před publikací nového manifestu, původní reference zůstanou přesné.

Před volbou preloadu samostatný read-only runtime probe potvrdil, že fsPromises.cp + syncBuiltinESMExports skutečně mění named binding použitý freezerem. Produkční skript nemá testovací hook, novou env volbu ani instrumentaci.

## Skutečné ověření 20. 10. 2026

1. Nový úzký CLI test proti původnímu freezeru v sandboxu: exit 1 na **EPERM při skutečné dependency junction**. Tento pokus nerozhodoval o chybě prerequisites. Test nebyl oslaben ani přeskočen.
2. Stejný příkaz s oprávněním pro vlastní temp fixtures mimo sandbox, stále původní freezer: exit 1, **0 PASS / 1 FAIL**, 587.5928 ms. Přesný RED: v manifestu chyběly čtyři instrukční soubory a oba fixture patche.

```text
node --import tsx --test --test-name-pattern="snapshot CLI copies and hashes" tests/performance-snapshot.test.ts
```

3. Po doplnění entries a formátování pouze nového testu proběhl skutečný taskový příkaz, přibližně 07:55 UTC, se stejnou potřebou skutečných junction oprávnění:

```text
node --import tsx --test tests/benchmark-snapshot.test.ts tests/performance-snapshot.test.ts
tests 6; pass 6; fail 0; cancelled 0; skipped 0; todo 0
duration_ms 4394.8212; exit code 0
```

Původní benchmarkový případ používá NullEngine a zůstává bez změny; žádný výsledek zde není GPU/FPS důkaz.

4. Read-only bajtový audit v 07:57:08 UTC odstranil v paměti přesně nový entries blok a dostal původní freezer beze změny jediného dalšího bajtu. Původní SHA-256: `3c8ebe999d51a83b70aaf664aaae2753fc3d2e13850563c98579e4a2a30d4efa`.
5. Benchmark test je bajtově totožný s výchozím Git commitem.
6. `git diff --check -- scripts/performance-snapshot.mjs tests/benchmark-snapshot.test.ts tests/performance-snapshot.test.ts`: exit 0. Vlastní staged scope je prázdný.

Původní neúspěšné výsledky a přesné stdout jsou zachované v tool transcriptu; nevytvářely se dodatečné logy mimo scope. Veškeré fixture subprocessy i jejich cleanup hooky skončily. Nebyly dotčené staré baseline/candidate snapshoty ani pracovní dist.

## Manifest zdrojů a testů

Kontrola `2026-10-20T07:57:08.999Z`; handoff vynechán kvůli sebereferenci.

| Soubor | Bajty | SHA-256 |
| --- | ---: | --- |
| scripts/performance-snapshot.mjs | 6802 | `4a31557792b721cd62a0b56fe9a9290f8988ebd3a4740c671be103af0af3a483` |
| tests/performance-snapshot.test.ts | 11822 | `f1266f1dc56928f367d9311ac9284abba6edb72cf54b3c155c2ab34a80c3c427` |
| tests/benchmark-snapshot.test.ts (nezměněný) | 5871 | `734d659cf85835376059a2cae7d909967724a006d22c564082466f4155f9a2db` |

SHA-256 seznamu `cesta mezera SHA LF` ve výše uvedeném pořadí (cesta bez popisku nezměněný): `1a0215c8464696b44d908ab2a816db9f71be4ba4f27c4e366ac0fa82d3f8b8d7`.

## Omezení a další krok

Neběžela plná sada, build, integrace, GPU ani skutečné zmrazení celé hry. Nové CLI regrese potřebují prostředí povolující skutečné directory junctions/symlinky; Windows managed sandbox je zde odmítal, oprávněný lokální runtime prošel bez změny testu.

Výsledek předává implementaci, testy i důkazy. Koordinátor převezme přesný diff, provede review/samostatný commit a následnou stabilní validaci. Celý KEY-48, herní GPU přejímka ani taskový Done se tímto podagentem neuzavírají.
