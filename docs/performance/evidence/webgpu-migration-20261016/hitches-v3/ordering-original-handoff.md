# Předání: webgpu-receiver-ordering-20261017

- Vlastník: `webgpu-receiver-ordering-20261017-dev` (`shader_inventory`); příjemce root/integrátor.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `3258d49afeb9b2ebeac4982efe66dc78466369b3`.
- Scope: pouze `client/stable-light-state.ts`, `tests/stable-light-state.test.ts`, toto předání a `.cache/webgpu-receiver-ordering-20261017/`. Claim získán před zápisem po status/worktree/živém registru; primární AGENTS, BMAD policy a celá spec `spec-key-31-long-frame-gaps.md` s kontextem načteny. Další BMAD workflow ani podagent nebyl spuštěn.
- Cizí WIP při převzetí: vehicle-lighting/light-receivers, pipeline handoff, task metadata a hitches-v2 evidence. Nic z toho nebylo editováno, kopírováno do testovací závislosti ani stageováno. Game wiring zůstává rootu; žádaný call patří po konečné přípravě receiverů/glTF budgetu a před stable update.

## Průzkum a volba

Pinned Babylon 9.30 `Meshes/abstractMesh.pure.js:975` v `_resyncLightSource` po opětovném připuštění světla volá `this._lightSources.push(light)`. Samotný místní distance membership přitom nemění shaderový podpis, enabled/light topology ani počet meshů, které StableLightState sleduje. Dosavadní `update()` proto bez explicitního pending vstupu oprávněně nic nenavštíví a nově přidaný SPOT může zůstat za HEMI namísto původního kanonického slotu.

Reprodukce pro Standard i PBR používá skutečné Babylon světlo, mesh, resync a PrepareDefinesForLights. Testový distance predicate pouze zastupuje rozhodnutí poskytovatele členství, bez závislosti na současně rozpracovaném TorchReceiverLight. Po přesunu receiveru ven a zpět na stejnou vzdálenost je světlo na konci skutečného seznamu a defines jsou jiné. Bez mark zůstávají visits/sorts/revisions beze změny; po mark/update se vrátí původní pořadí i defines a navštíví se právě jeden dotčený mesh.

Porovnané varianty:

- Globální membershipChanged by opravilo pořadí, ale vynutilo návštěvu celé scény při každém lokálním range přechodu.
- Kontrola seznamů všech meshů v každém update přidává průběžný scan/stav, přestože poskytovatel změněné přijímače již zná.
- Řadit přímo v receiver správci by duplikovalo stávající canonical/cap/frozen/custom policy a mohlo změnit výběr světel.
- Zvolená metoda `markMeshesDirty(Iterable<AbstractMesh>): void` pouze vloží dotčené přijímače do existujícího pending Setu. Řazení a jeho konzervativní fallback zůstávají v jediném původním místě.

## Implementace a refaktor

Runtime změna má 12 řádků včetně komentářů. Metoda odmítá disposed controller/scénu ještě před čtením iterable, ignoruje disposed meshe a meshe cizí scény. Opakovaný guard při iteraci brání znovupřidání reference, pokud generator mezitím zruší vlastníka. Existující Set deduplikuje vstup, odstranění meshů a dispose již uvolňují jeho položky a update jej vyprázdní. Metoda nedrží dodaný iterable/array, nevytváří novou kolekci, neřadí, neresynchronizuje světla a nepřidává scan scény.

Refaktoring zachovává jediné místo pro pending state, pořadí a material policy. Testy sdílejí malý helper pro vypořádání Babylon deferred new-mesh notifications; nemění tím měřený produkční algoritmus. Existing cap, frozen, null MultiMaterial slot, custom shader, shadow/falloff a lifecycle větve zůstávají beze změny.

## Ověření

Izolovaný staging `.cache/webgpu-receiver-ordering-20261017/` obsahuje byte-identické finální runtime/test soubory a readonly junction na dependencies-v5. Přímý Node CLI, žádný pnpm/bootstrap/install.

- Původních 6 testů PASS (`baseline-initial.log`); při prvním kopírovacím příkazu byla chybná relativní destination, takže tehdy ještě běžela jen baseline. Zachováno a není vydáváno za RED nových regresí.
- Skutečný RED po správném přenosu testů nad původním runtime: 12 případů, původních 6 PASS / nových 6 FAIL kvůli chybějícímu API; pre-API assertions již potvrzují skutečný append a změněné defines (`red.log`, exit1).
- GREEN a finální scoped formátování; přidána ještě regrese disposal během generatoru.
- Finální `node --import tsx --test tests/stable-light-state.test.ts`: **13/13 PASS**, exit0, 19:46:52.629–19:46:54.321 UTC, 1,690 s (`tests-final.log`).
- Finální `node typecheck.mjs`: roots pouze stable-light-state a jeho test, **2954 transitivních souborů, 0 diagnostik**, exit0, 19:46:54.324–19:47:00.294 UTC, 5,970 s (`types-final.log`).
- `git diff --check` pro vlastní runtime/test PASS. Scoped Prettier runtime beze změny, formátoval jen nový testový obsah.

Finální SHA256 runtime: `f385db0207a3662bdbf2a2e07939248d4b555a1dfa5735f6dabb67964daa8207`; test: `ba4dff23c80317fd67c499ff558a103ec8ae5e9e3b3f8bec99cc4c91990ddedb`. Vstupní runtime `4adfb37dae15ca6a0b9e1b65634266b6791ffc1d8c1aca01858a9557c7f7b8bc`; vstupní test `da9fdb75827d310ff408f05dc0c0bc3a84556ee2b88c9630269def3576ab181b`. Manifest a vlastní diff v cache zahrnují soubory, podklady, handoff, závislosti a výsledky.

Všechny vlastní pomocné CPU procesy skončily; žádný port, server, GPU, build, celá sada, instalace ani commit. Po doloženém předání následuje release. Root přebírá review, Game wiring, finální kombinovanou integraci a GPU přejímku. NullEngine výsledky dokazují pořadí/defines/lifecycle; neprokazují plynulost, GPU přínos nebo odstranění několika sekund čekání. Hrané snapshoty se nezměnily a migrační cíl tím není dokončený.
