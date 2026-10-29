# Předání: tree-catalog-wait-20261029

- Vlastník: `decisions-verification-treewait-20261029`; příjemce: RAG koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/automated-document-rag`; výchozí HEAD `0c8f163d2c348e5067300d2005cb115ed98f95ea`.
- Výsledek: připravená úzká oprava čekání v jednom testu, bez změny produkčního runtime. Bez stagingu a commitu; přijetí a export do PR37 provede koordinátor.
- Změněné soubory: `tests/tree-catalog-loading.test.ts`, toto předání; ignorované výstupy `.cache/tree-catalog-wait-20261029/delayed-digest.test.ts` a `tsconfig.json`.
- Cizí WIP: při převzetí byl cílový test čistý. Existující změny RAG dokumentace a tasků nebyly převzaty ani měněny.

## Důkaz a rozhodnutí

CI [40859139264](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40859139264), head `fabf7978e59adf18eba431e46a10f65985cb9fd1`, base `3644d7735492a5eb953413b33ec5ed15d9df06fe`, skutečný checkout `de8a97daa31c4e4ae7908bae8139a195f06e59c6`, selhalo na `group.lods[0].length`: actual 0, expected 2. Celkem 2810 testů, 2807 pass, 1 fail, 2 skipped; build a SDK integrace byly přeskočeny. Původní neúspěch zůstává platnou evidencí.

Doložený řetězec je `startDetailLoads` → původní `loadDetail` → `loader.asset` → fetch/body → `assetSha256` → asynchronní SubtleCrypto digest → decode → publikování meshů → `applyVisibility`. Test po uvolnění fetch čekal pouze na 14 `setImmediate`; ty nejsou dokončovací podmínkou digestu. Dotčený test, renderer a loader jsou stejné v main i uvedeném PR headu.

Kontrolovaná probe v rezervované cache zadržela skutečný digest pomocí explicitního Promise gate. Po původním `settle()` již test pokračoval, ale hlásil `meshes=0`, `pendingAssets=1`, `loadingDetails=1`. Po uvolnění digestu a vyčkání na původní `loadDetail` promise hlásil `meshes=2`, `active=2`, `pendingAssets=0`; všechny původní zimní, transformační a viditelnostní aserce prošly. Je tím doložena slabina synchronizace a odpovídající mechanismus selhání. Konkrétní vytížení či pořadí plánování digestu v neúspěšném CI nebylo měřeno; není tvrzeno jako prokázaná příčina.

Varianty: více ticků nebo pevný sleep nemají dokončovací záruku; polling `loadingTrees` s timeoutem by vyžadoval další čekací logiku. Vybráno čekání na skutečný původní promise, podle již přijatého vzoru v `tests/tree-cluster-streaming.test.ts:94`. Spy nemění implementaci. Ověřuje právě jednu operaci pro očekávaný group a LOD 0; její odmítnutí nyní přímo selže v testu. Test má timeout 10 s, bez runtime delay.

Refaktoring odstranil nepoužitý `settle` helper. Původní očekávání dvou meshů, aktivního vzdáleného LOD, parent/world matrix, vypnuté viditelnosti, nulové zimní foliage geometrie a nulového legacy fallbacku zůstala zachována. Produkční cache, alokace a lifecycle se nemění; testový mock uklidí Node test context.

## Ověření 29. 10. 2026

Všechny příkazy běžely v uvedené pracovní kopii; výsledky byly na stdout, bez serveru, GPU, DB a placených API.

- Před změnou izolovaný původní scénář: 1/1 PASS. Tento výsledek sám nevysvětloval selhání v CI.
- Deterministická probe: `node node_modules/tsx/dist/cli.mjs --test --test-reporter=spec --test-name-pattern='late catalog detail obeys current winter' .cache/tree-catalog-wait-20261029/delayed-digest.test.ts` → exit 0, 1/1 PASS; diagnostické hodnoty viz výše. `TSX_DISABLE_CACHE=1`.
- Celý dotčený soubor: `node node_modules/tsx/dist/cli.mjs --test --test-reporter=spec tests/tree-catalog-loading.test.ts` → exit 0, 8/8 PASS, 0 skipped, 6482 ms. `TSX_DISABLE_CACHE=1`.
- Scoped strict TypeScript: `node node_modules/typescript/bin/tsc --project .cache/tree-catalog-wait-20261029/tsconfig.json` → exit 0, bez diagnostiky. Konfigurace dědí projektové strict/noEmit volby a zahrnuje změněný test s jeho importy.
- `git diff --check -- tests/tree-catalog-loading.test.ts` → exit 0.
- První nepersistentní CJS pokus o instrumentaci skončil před spuštěním testu na nepodporovaném ESM top-level await; následná probe použila projektový tsx/ESM řetězec a úspěšně provedla celý scénář.

Identita změněného testu SHA-256: `40236e88df4895f5321983f9a526936542d03fa7d002ea70ad624fe774709959`. Diff je pouze tento test; žádná změna runtime.

Všechny vlastní pomocné procesy skončily, žádné porty ani procesy nezůstávají. Plná sada, build a SDK nebyly lokálně spouštěny; nový PR head vyžaduje vlastní CI. NullEngine dokládá pouze chování testu, nikoli GPU výkon či vzhled hry.

Rezervace bude uvolněna po předání; skutečný výsledek `release` uvádí závěrečná zpráva. Integrátor převezme konkrétní diff, aktualizuje stav tasku a případnou společnou evidenci; uvolnění samo neznamená integraci.

Integrátor převzal oba soubory po doloženém release pod vlastní rezervací `tree-wait-integrator-01a17e9d`. Úzké čtení diffu potvrzuje původní loadDetail implementaci a zachované výsledkové aserce; přijat je pouze testový fix. Následuje samostatný commit/export do PR37 a nové CI, nikoli opakované široké review RAG.
