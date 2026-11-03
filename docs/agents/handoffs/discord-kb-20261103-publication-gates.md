# Předání: discord-kb-20261103-publication-gates

- Vlastník: `discord-kb-20261103-gates-agent`; příjemce: `discord-kb-20261103-root`.
- Checkout: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, HEAD `582a0619d2e2980610ba004ddf7d2cc6903091bf`.
- Převzetí: root výslovně předal rozpracované `scripts/discord-kb/compile.ts`, `scripts/discord-kb/audit.py` a `tests/discord-kb.test.ts`, odebral je ze svého scope a povolil `--adopt-dirty`. Claim přijal právě tyto tři soubory. Ostatní WIP zůstal nedotčen.
- Výsledek: compiler vyžaduje konkrétní úplný audit a přijaté review přesného canonical obsahu; změny po review, chybějící soubory i dangling reference selžou před tokenizací. Žádné placené volání, DB, build, staging ani commit.
- Změněné soubory: tři převzaté výše, nový `tests/discord-kb-audit.py` a toto předání. Provider opravoval root, nebyl upravován tímto agentem.

## Přesný kontrakt

Kanonický tvar položky se nemění. Ledger `itemIds` musí odkazovat na **canonical `.id`**, nikoli na `.itemId` nebo zaniklé seed ID.

```text
FinalLedger = {
  version: 1,
  sourceInventorySha256,
  reviewedFiles: [{
    fileName,
    dispositions: [{messageId, status, itemIds: [canonicalItem.id], reason}]
  }]
}

ReviewManifest = {
  version: 1,
  sourceInventorySha256,
  auditLedgerSha256,
  items: [{id: canonicalItem.id, contentSha256, reviewer, decision: "accept", reviewedAt}]
}
```

Ledger musí zahrnovat všechny exporty z raw manifestu **včetně prázdných** a každý normalizovaný message ID právě jednou ve správném souboru. Povolené koncové statusy jsou `used`, `duplicate`, `system`, `excluded`, `insufficient-context`; `pending`/`unreviewed` nejsou koncové. `insufficient-context` znamená přečtenou a výslovně nepublikovanou otázku. `used`/`duplicate` mají neprázdné existující canonical reference, ostatní statusy reference nemají. Každá publikovaná položka musí mít zdrojovou vazbu. Každé rozhodnutí má neprázdný důvod.

Compiler exportuje:

- `canonicalItemContentHash(item)` — SHA-256 canonical JSON všech polí položky kromě `reviewReceipt`.
- `auditLedgerHash(ledger)` — SHA-256 canonical JSON celého ledgeru.
- `reviewReceiptFor(review, sourceInventorySha256, auditLedgerSha256)` — SHA-256 canonical JSON `["discord-kb-review-v1", inventoryHash, ledgerHash, review]`.
- `validatePublicationProof(dataset, proof)` — samostatná read-only kontrola.
- `compileKnowledge(value, countTokens, proof)` — třetí argument je nyní povinný; proof obsahuje `{reviewManifest, auditLedger, rawManifest, rawMessages}`.

Root po explicitním peer review vytvoří review entries, spočítá ledger hash a receipt každé položky. `reviewedAt` v entry musí odpovídat položce. Manifest musí mít právě jednu přijatou entry pro každou canonical položku; přidaný nebo vynechaný item není dovolen. Hash sám **není důkaz sémantické pravdivosti ani kryptografický podpis člověka**: brání opomenutému přenosu starého schválení na změněný obsah a poskytuje kontrolovatelnou vazbu skutečně provedeného review.

## CLI

```text
pnpm exec tsx scripts/discord-kb/compile.ts \
  --input <canonical.json> --output-directory <nový-výstup> \
  --review-manifest <review-manifest.json> --audit-ledger <final-ledger.json> \
  --raw-directory .cache/discord-kb-20261103/raw/corpus-v2 \
  --python <python.exe> --tokenizer-cache <ověřená-cache>

python -B -X utf8 scripts/discord-kb/audit.py coverage \
  --raw .cache/discord-kb-20261103/raw/corpus-v2 \
  --canonical <canonical.json> <final-ledger.json>
```

Python diagnostika umí také více partition souborů, ale všechny jejich canonical reference musí již mířit na existující položky předaného canonical datasetu. Úplnost se ověřuje přes všechny exporty manifestu, ne přes pouhý seznam souborů se zprávami. CLI nic neopravuje ani nepřepisuje; compiler zachovává `wx` pro výstupní soubory.

Veřejný manifest obsahuje pouze hashe ledgeru/review manifestu a receipts. Raw zprávy, názvy zdrojových souborů, reviewer identity ani dispositions se do bundles, Markdownu nebo veřejného manifestu nevkládají.

## Výzkum a refaktoring

Opravy vycházejí ze dvou reprodukcí: platný nulový export padal na `unknown-source-file`; změněná odpověď s původním libovolným 64hex receipt prošla compilerem. Nová implementace centralizuje hashování a read-only proof validaci a sdílí stejnou publikovatelnou sémantiku mezi TS gate a Python coverage. Nejde o nový RAG backend ani jinou tokenizaci. Původní normalizované a embedding vstupy zůstávají stejné; review metadata je mimo text určený pro embedding.

Byly také opraveny původní readonly chyby testu: `applicability` a `reviewedAt` se mění náhradou objektu, nikoli zápisem do readonly vlastnosti.

## Ověření 3. 11. 2026

- `pnpm exec tsx --test tests/discord-kb.test.ts`: **8/8 pass**. Matice pokrývá změnu odpovědi/scope/daty po review, inventář, neúplné pokrytí včetně vynechaného empty exportu, chybný soubor, duplicitní rozhodnutí, neexistující canonical ID, nevyužitý canonical item, chybějící/pending review, změnu reviewer identity a změnu ledgeru i při přepočteném ledger hashi. Ve všech odmítnutých scénářích zůstává `countTokens` nevolaný. Pozitivní případ obsahuje explicitně uzavřený `insufficient-context` bez publikace jeho obsahu.
- `python -B -X utf8 tests/discord-kb-audit.py -v`: **9/9 pass**, pouze syntetická data. Dočasné soubory vznikají v rezervované `.cache/discord-kb-20261103/publication-gates/` a po kontrolovaném ověření cílové cesty se uklidí.
- Cílené syntaktické a sémantické TypeScript diagnostics nad `compile.ts` a jeho testem s projektovou konfigurací: **0 diagnostik**; bez emit, bez inkrementálního souboru, bez celé herní sady.
- Reálný raw loader ověřil **18 465 IDs / 180 exportů včetně nulového revize-2025**. TS canonical hash skutečného inventáře odpovídá Python parseru: `c8afca9ef53c5d8cac6031fc926abcebfc73f59922c8fc1f9bf965df2f549e40`.
- `git diff --check` prošel. Kompletní skutečný canonical/review/final-ledger sestavuje root, jeho finální průchod tímto gatem patří navazující integraci; syntetické schválení není vydáváno za review reálných dat.

| Soubor | SHA-256 |
| --- | --- |
| `scripts/discord-kb/compile.ts` | `34e4e6fe6f55f002df6012a6bbed0b01f526eaf9eedd3f013e785522640e51f4` |
| `scripts/discord-kb/audit.py` | `a17c42b867157cb4396051da54b418b84f72a06586590eec17e10695af0b5a7d` |
| `tests/discord-kb.test.ts` | `c087310fbc6d7b48cca5287b19f211bd7c82cfe66c0a1a5eb29955144fa8afee` |
| `tests/discord-kb-audit.py` | `e50883c8f30cd3bb8813168b7de770ef93e6a5d5d97b6f34d467faaeef57c535` |

Jednorázové procesy skončily; nezůstává port, pomocná služba ani GPU práce. Rezervace se po předání uvolňuje. Integrátor převezme soubory, provede kontrolu reálných proof artefaktů, nastaví task status a commitne ověřený celek.
