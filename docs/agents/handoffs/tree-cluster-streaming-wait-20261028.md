# Předání: tree-cluster-streaming-wait-20261028

- Vlastník: `tree-stream-wait-01a16b37`; příjemce: koordinátor `/root` a Jantar integrátor. Přímá delegace, bez dalšího BMAD workflow.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow`, větev `codex/jantar-home`, výchozí HEAD `62ba8c870082b1a3897d8f580d81dbd4005ca481`.
- Výsledek: test-only oprava obou pevných čekání, řízený důkaz původní mezery a cílený soubor 10/10 PASS. Nezávislý čtecí review koordinátora `/root` dokončen bez blokujícího nálezu. Necommitováno; společné přijetí zůstává integrátorovi.
- Změněný verzovaný test: `tests/tree-cluster-streaming.test.ts`. Další vlastní výstupy: tento handoff a `.cache/tree-cluster-streaming-wait-20261028/`.
- Produkční renderer, loader, SHA, geometrie, materiály ani sdílená API se neměnily. Cizí UI/RAG WIP nebyl převzat ani upravován.

## Podklady, příčina a volba

Čtecí průzkum z 28. 10. 2026 vychází z místního kódu a existujících logů:

- `.cache/jantar-home-20261028-validation/ci-bd8174d3-job-tail.log`: CI `bd8174d3`, run `40690482141`, job `122823686998`; původní případ selhal na `active: 2 !== 0`, 16,528773 ms. Celý běh měl 2491 PASS, 1 FAIL, 1 SKIP.
- `.cache/jantar-home-20261028-validation/tree-failure-isolated.log`: stejný původní případ izolovaně 1/1 PASS, 227,3707 ms. Není to náhrada neúspěšného CI.
- `tests/tree-cluster-streaming.test.ts` původně čekal na 12 `setImmediate`. `TreeRenderer.startDetailLoads()` odhazuje Promise původního `loadDetail()`; ta čeká na `TreeAssetLoader.asset()`, čtení `Response` streamu a SHA, potom synchronně dekóduje a publikuje meshes a aplikuje viditelnost. `assetSha256()` při dostupném Web Crypto awaituje skutečný `subtle.digest()`.
- Doložena je absence vazby pevných event-loop průchodů na dokončení operace. CI log neobsahuje pending/loadError/fázovou telemetrii; konkrétní zpožděná fáze ani vytížení SHA v původním CI nejsou prokázány. `active === 2` může být také stav po odmítnutí detailu.
- První winter/detail test procházel jen již existující meshes, a mohl proto vynechat kontroly pozdního detailového listí. Nový helper výslovně vyžaduje skutečnou neprázdnou detailovou operaci a vytvořené foliage meshes.
- Čtyři relevantní soubory (test, renderer, loader, SHA) měly při průzkumu prázdný Git diff mezi `bd8174d3`, přijatým main `86e4dd603ca1b91e3eaa5f84573f9481be410a29` a výchozím `62ba8c8`.

Zvoleno: spy `t.mock.method(r, "loadDetail")` bez náhradní implementace, await původních návratových Promise a konečný test timeout 5000 ms. Instalovaný `node_modules/@types/node/test.d.ts` dokumentuje zachování původní metody a návratovou hodnotu v `mock.calls[].result`. Scheduler i celý datový řetězec zůstávají skutečné a odmítnutí detailu přímo selže v testu.

Zamítnuté varianty: více průchodů nebo pevný sleep závod neřeší; loader/inflight hranice sama nepotvrzuje publikaci meshes; přímé volání `loadDetail()` by obešlo scheduler; nové produkční `whenIdle()` by zbytečně rozšířilo API a rozsah. Výkon, vzhled a produkční cache/lifecycle se opravou nemění.

## Implementace a cílený refaktoring

- Fixture vlastní spy původního `loadDetail()`; společný `waitForDetails()` nahrazuje obě pevná čekání a kontroluje neprázdné operace správných skupin/požadovaných LOD, jejich dokončení, aktivní LOD a neprázdné detailové listí.
- Původní kontroly materiálu, zimní viditelnosti/indexů, sdílení atlasu a úklidu zůstaly zachovány.
- Wood-only případ zadržuje právě near fetch přes explicitní Promise gate. Před uvolněním potvrzuje aktivní FAR, prázdný near LOD a jeden pending asset. Po uvolnění awaituje původní operaci a ověřuje původní finální podmínky.
- Gate se uvolní ve `finally` i testovém after hooku; pomocník nevytváří timer ani další rendererový stav. Oba dotčené testy mají deadline. Snapshot Promise batch je určen pro zdejší fixture nanejvýš dvou stromů; nejde o obecné produkční čekání na neomezený scheduler.

## Skutečné ověření

1. RED, původní čekání při řízeně zadržené near odpovědi:
   - Příkaz: `pnpm exec tsx --test --test-name-pattern 'v4 wood-only fallback' .cache/tree-cluster-streaming-wait-20261028/original-wait-held-near.red.test.ts`.
   - Log: `.cache/tree-cluster-streaming-wait-20261028/red.log`; UTC hranice vytvoření/posledního zápisu logu `2026-10-28T13:42:28Z` až `13:42:34Z` (nikoli samostatná telemetrie start/end procesu).
   - Exit 1; 0 PASS, 1 FAIL, 0 cancelled, 2904,3033 ms. Zachována původní chyba `2 !== 0`.
   - Diagnostika po původních 12 průchodech: `active=2`, `desired=0`, `pendingAssets=1`, `scheduledDetails=1`. Cleanup v `finally` uvolnil odpověď a awaitoval skutečnou Promise: `active=0`, `pendingAssets=0`, `detailMeshes=2`.
   - Jde o deterministický důkaz mezery v původním čekání se zavedeným transportním zpožděním. Není to tvrzení, že stejné zpoždění bylo konkrétní příčinou CI. Cache obsahuje i původní nezměněný test jako `.ts.txt`; RED kopie mění relativní importy kvůli umístění, přidává gate/deadline/diagnostiku/cleanup a ponechává původní čekání a finální asserty.
2. GREEN po opravě, bez package manageru:
   - Příkaz: `node node_modules/tsx/dist/cli.mjs --test tests/tree-cluster-streaming.test.ts`.
   - Log: `.cache/tree-cluster-streaming-wait-20261028/green.log`; UTC hranice logu `2026-10-28T13:44:51Z` až `13:44:54Z`.
   - Exit 0; 10/10 PASS, 0 FAIL/cancelled/skipped, 2662,8701 ms. Winter/detail případ 73,1758 ms; wood-only případ 7,0453 ms.
3. `git diff --check -- tests/tree-cluster-streaming.test.ts`: exit 0.

Žádný celý test suite, build, globální TypeScript, integrace, server, GPU, herní browser ani placené API neběžely. Samostatný scoped typový check nebyl proveden; koordinátor po review výslovně určil společný typecheck/build u Jantaru v izolovaných závislostech. NullEngine výsledek není GPU ani výkonový důkaz. Node `v24.19.0`, Babylon z logu `9.30.0`.

Nezávislý čtecí review `/root` potvrdil čekání na skutečný Response/SHA/decode/publication řetězec, neprázdné detaily, zachování původních assertů a význam řízeného gate. Bez blokujícího nálezu; další místní běhy nejsou vyžadovány.

## Incident sdílených závislostí

První výše uvedený `pnpm exec` neočekávaně automaticky synchronizoval sdílené `node_modules` přes místní fallback `pnpm.cmd`; log uvádí pnpm `11.19.0`, `Packages: +15`, `reused 15`, `downloaded 0`, přidání `pg` a `@types/pg` `8.23.1`. Explicitní install příkaz nebyl zadán. Příkaz a celý původní log byly bezprostředně předány koordinátorovi.

Koordinátor následně oznámil, že tento `node_modules` je cílem junction používaného neměnným candidate02/serverem 4276. Autor před příkazem nezaznamenal manifest/hashes těchto závislostí. **Neměnnost původního snapshotu není potvrzena.** Obnovu a vyhodnocení dopadu převzal koordinátor/Jantar; autor neprovedl žádný další package-manager příkaz ani opravný install/odstranění/úpravu `node_modules`.

Readonly Git po incidentu potvrdil čisté `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`; pracovní `git hash-object` souhlasil s HEAD Git bloby v tomto pořadí:

```text
7c75196b6a31b62d13e0a22a7366760139190ad7
d1c75c738e5bac6a5c6be419cdf4fd5b8b047236
11c82b07415c5139e9691dc7b51c66cd587d26e5
```

Tyto shody potvrzují pouze uvedené zdrojové manifesty, nikoli stav sdílených nainstalovaných závislostí nebo běžícího snapshotu.

## Diff, vlastnictví a předání

- Přesný taskový diff: `.cache/tree-cluster-streaming-wait-20261028/final-test.patch`.
- Záznam cílených zdrojových SHA-256 včetně testu: `.cache/tree-cluster-streaming-wait-20261028/focused-source-manifest.json`. Jde o explicitně označený dílčí manifest, ne úplný source/dependency snapshot.
- Původní test SHA-256: `5979898e64fe0ba121eaa96b78e4135a673c17bdee013192c8256f59848843c2`.
- Opravený test SHA-256: `548012a4acf038d3a382b10317e51c7ead9a30e03507b48f20fcfd8a5bfb38f4`.
- Při zahájení existoval cizí WIP v `_bmad-output/implementation-artifacts/jantar-home-20261028/SPEC.md`, `docs/home-design/20261028/decision.md`, `server/crazy-typka-provider.ts`, `tests/crazy-typka-compact.test.ts`, `tests/crazy-typka-provider.test.ts` a neversionované tasky/handoffy koordinátorů. Žádný z nich nebyl převzat ani stageován; task JSON vytvořil koordinátor.
- Vlastní procesy: pouze ukončené foreground CLI, všechny výstupy jsou výše. Žádný vlastní background proces, port ani GPU zdroj. Žádný commit/staging.
- Rezervace během práce: `tree-cluster-streaming-wait-20261028`, owner `tree-stream-wait-01a16b37`. Po čtecím review a předání ji autor uvolní; skutečný release potvrzuje registr a finální zpráva koordinátorovi.
- Integrátor převezme pouze tento test a jeho evidenci/handoff, zkontroluje diff a provede společné ověření/integraci. Stav tasku a společnou evidenci aktualizuje integrátor. Neprohlašovat celek za Done podle zdejšího cíleného PASS; zvlášť vyřešit incident sdíleného snapshotu.
