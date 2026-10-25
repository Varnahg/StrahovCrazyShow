# Předání: terrain-20261025-review-evidence

- Vlastník `terrain-static-evidence-01a16b37`, příjemce root TERÉN-20261025 / KEY-61.
- Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/terrain-quality-20261025`, baseline `ff13fa2b3b47363378ce55d34ed12eb5beec1ede`.
- Samostatný claim bez adopt-dirty. Změněny jen `shared/local-benchmark.ts`, `tests/local-benchmarks.test.ts` a toto předání; ostatní static-review/ground/flowers WIP zůstává u svých vlastníků.

## Příčina, volba a změna

Předchozí skutečný read-only probe (`.cache/terrain-static-review-20261025/collector-gap.json`) potvrdil `terrainReviewInRaw:true`, `terrainReviewInProjected:false`; pole zahazoval společný whitelist používaný UI před POST i serverem před diskovým zápisem. Raw UI/full download novou identitu zachovával. Dosavadní `avatars` enum1/30 rovněž nebyl kontrakt runtime: `Game.startBenchmark` ukládá minimum `this.avatars.size` přes sledované snímky, včetně vlastní browserové postavy. Tři SDK relace plus browser proto znamenají4. Server nepředepisuje kohortu1/30 ani kapacitní strop100.

Zvoleno rozšíření jediného sdíleného projector helperu; server ani UI nepotřebují další paralelní serializer. Povolena čísla avatars **celá1..10000**. Horní mez je explicitní sanity limit formátu diagnostiky, nikoli změna kapacity hry nebo výkonový příslib. Testují se i nekulaté populace29/31 a100/101. Není to měření skutečného multiplayerového výkonu.

Volitelné `terrainReview` zachovává výhradně:

```json
{"version":1,"id":"b6-rear-path","scope":"static-guest-start","spawnXZ":[36,-64],"lookAtXZ":[29.24,-64]}
```

Přesný enum ID: `b6-rear-path`, `b6-front-lawn`, `osm-grass-control`, `b6-far-context`. Version1 a scope musí přesně souhlasit. Obě XZ pole mají právě2konečná čísla v±1e6m, shodném číselném rozsahu s původním sceneView. Explicitní indexy odmítají i sparse arrays; nové výstupní arrays nemají vazbu na vstup ani na předchozí projekci. `source`, nickname, filename/path a veškerý další volný text/nested metadata se nekopírují. Nejde o ověření identity reality podle souřadnic; skutečný pohled dál dokládají sourceSnapshotId, Game data, kamera a GPU přejímka.

Chybějící pole zůstává chybějící, explicitní null (běžná hra/MP) zůstává null. Nenulová `static-guest-start` identita vyžaduje avatars1, aby se MP záznam nevydával za guest QA. Dosavadní validační pořadí ostatních polí, privacy allowlisty, origin/rate/body/file pravidla se nemění. Nová pole jsou čisté malé výpočty při explicitním uložení; žádné per-frame cache, nové IO ani lifecycle vlastnictví.

## Ověření

Před každým shellem načten `.cache/terrain-20261025/activate.ps1`, přímý Node bez pnpm instalace. Node testy měly `TSX_DISABLE_CACHE=1`. Bez zápisů do závislostí a bez nového BMAD/podagenta.

```powershell
node node_modules/tsx/dist/cli.mjs --test --test-name-pattern "^(local CPU|virtual camera|projection )" tests/local-benchmarks.test.ts
```

**7/7 PASS**,538.792ms, exit0. Nové regrese ověřují skutečné identity všech čtyř client presetů a dvojitou idempotentní projekci UI→server, odpojení arrays, odstranění source/private textu, chybějící/null pole, unknown/prototype ID, chybnou verzi/scope, rozměry/sparse/nonfinite/out-of-bounds coords, guest/MP nesoulad a kladné celé populace včetně4. Původní pure regrese pořadí validací, volitelných bloků, GPU/camera metadat zůstávají zelené.

```powershell
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node --esModuleInterop --resolveJsonModule shared/local-benchmark.ts tests/local-benchmarks.test.ts
```

**PASS exit0**, současně scoped `git diff --check` PASS. Celý příkaz s typovou/whitespace kontrolou trval2.397s. Výstupy jsou přímo v tool historii; task nemá vlastní writePath pro cache, žádný další logový adresář se proto nevytvářel.

Existující socketové HTTP testy byly aktualizovány tak, aby atomic record kontroloval persistovanou QA identitu bez source textu, odmítal fractional/out-of-range populaci a přijímal4. **Nebyly zde spuštěny**: přidělení výslovně povolovalo CPU regrese bez serveru. Koordinátor je spustí v celé přejímce pomocí příkazu z tasku `node node_modules/tsx/dist/cli.mjs --test tests/local-benchmarks.test.ts`. Žádný server, browser, GPU, build ani fullsuite neběžel.

## Manifest a převzetí

| Soubor | SHA-256 |
|---|---|
| `shared/local-benchmark.ts` | `f70577ef173dc2a659f284170976c3b688c98059af3dbb474a50924457874318` |
| `tests/local-benchmarks.test.ts` | `a293166ec0655506aa30a88f808dff8eb20c58744413eb958a8daa7e139a1463` |

Všechny vlastní procesy skončily; po tomto předání release `terrain-static-evidence-01a16b37`. Root může převzít tento přesný WIP přes `--adopt-dirty` a přidat stejný evidence overlay k baseline i kandidátovi společně s již předaným static-review. Hraná2592 nebyla dotčena. Commit, serverová integrace, skutečné QA/performance výsledky a stav katalogu patří rootovi.
