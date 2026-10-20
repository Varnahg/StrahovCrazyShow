# Předání: global-refactor-fixtures-python-20261020

- Vlastník: `refactor-01a15658-fixtures-python`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`.
- Výchozí commit a HEAD při kontrole 07:22:53 UTC: `42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a`.
- Výsledek: úzký refaktoring implementován a cíleně ověřen; připraven k nezávislému review a integraci. Žádný staging/commit ani označení tasku/KEY-48 Done.
- Rezervace: získána před prvním zápisem po čtení aktuálního claims.json a čistoty taskových cest; heartbeat obnoven před předáním. Po oznámení koordinátorovi následuje release, jeho skutečný výsledek bude v navazující zprávě/CLI.
- Procesy a cleanup: pouze dokončené jednorázové Node/PowerShell/Python kontroly. Testovací exec session `87013` skončila exit 0. Žádný vlastní server, port, browser, GPU, Blender ani dlouhožijící proces.
- Cizí WIP: při zahájení byly dirty dokumenty předchozího předaného tasku, avatar/quaternion/autodev, simulation/benchmark a koordinační artefakty ostatních agentů. Nic z toho nebylo převzato, změněno ani stagingováno. Do předané dokumentace se v tomto tasku nezapisovalo.

## Přesné změněné soubory

1. `tests/helpers/game-source.ts` — nový úzký loader AST.
2. `tests/game-quality-preparation.test.ts`
3. `tests/game-light-preparation.test.ts`
4. `tests/game-light-lifecycle.test.ts`
5. `tests/game-webgpu-startup.test.ts`
6. `scripts/fetch-streets.py`
7. `scripts/fetch-expansion-reference.py`
8. `scripts/create-north-court-style.py`
9. `docs/agents/handoffs/global-refactor-fixtures-python-20261020.md`

Runtime, assety, datové katalogy, specifikace, task JSON ani jiné testy se neměnily. `game-render-engine.test.ts` nebyl zahrnut.

## Podklady, rozhodnutí a refaktoring

Přečteny pravidla/policy z předchozího přiděleného tasku, aktuální task JSON a `spec-maintenance.md`. Dále kompletní všechny čtyři testové sady včetně každého použití source/declaration/gameClass/member, celý expansion caller a court skript, imports/globals, ortho/write_json/unproject a CLI větev fetch-streets. `rg` potvrdil jediného externího Python volajícího ortho v expansion calleru; vlastní CLI volá ortho bez parametru. Původní zdroje pro diferenciály pocházely přímo z výchozího Git commitu, nikoli z ručně přepsaného orákula. Další BMAD workflow nebylo spuštěno.

Porovnané varianty:

- Ponechání čtyř AST kopií zachovává opakování. Obecný VM/transpile framework by spojoval rozdílné lokální environmenty a startup transformer. Zvolen je pouze `readGameSource` + výběr členů; všechny VM, transpile options, startup import transformer, fixtures a testovací orákula zůstávají lokální.
- Python globální přepsání `module.DOCS` skrývá výstup. Výchozí parametr `output_dir=DOCS` by zase vázal DOCS při definici/importu. Zvolen `output_dir=None` a vyhodnocení DOCS uvnitř volání. Přesun mkdir do ortho by měnil pořadí I/O a failure chování, proto mkdir zůstává na původním místě v calleru/CLI a ve write_json.
- U kurtu lze field vynechat a přiřadit později, ale tím by se změnilo pořadí JSON klíčů. Zvolena přímá původní inicializace hodnotou `multi` a odstranění pouze okamžitého přepsání.

Helper zachovává source filename `game.ts`, `ScriptTarget.Latest`, `setParentNodes=true` a default URL `../../client/game.ts` relativně k `tests/helpers/`. Každé zavolání čte/parsuje samostatně, bez cache nebo sdíleného AST. `selectMembers` filtruje členy ve skutečném pořadí třídy; neprochází pořadí požadovaných jmen. `member` zachovává lifecycle assert text `Game.<name> must exist`.

Zůstaly všechny samostatné override proměnné: `GAME_QUALITY_SOURCE`, `GAME_PREPARATION_SOURCE`, `GAME_LIGHT_SOURCE` a `GAME_STARTUP_SOURCE`. Předávají se do loaderu v místě původního načtení.

`ortho(output_dir=None)` mění pouze výběr cílové cesty. Adresy, parametry, původní JPEG bajty, serializace georeference a výpis zůstaly stejné. Caller vytváří stejný výstupní adresář před voláním, nyní bez globální mutace importovaného modulu. `sourceSportTag` u kurtu má rovnou finální `multi`; `sourceTagTimestamp`, `visualSport`, `sourceTagUrl` i jejich pořadí zůstaly zachované. Nezavádí se nová cache, runtime alokace ani změna herního lifecycle.

## Skutečné ověření 20. 10. 2026

Příkaz z tasku před změnou i po ní:

```text
node --import tsx --test tests/game-quality-preparation.test.ts tests/game-light-preparation.test.ts tests/game-light-lifecycle.test.ts tests/game-webgpu-startup.test.ts
```

| Kontrola | Výsledek |
| --- | --- |
| Původní čtyři sady, přibližně 07:16 UTC | exit 0, 44 PASS / 0 FAIL / 0 skip, 4812.3803 ms |
| Refaktorované čtyři sady, přibližně 07:19 UTC | exit 0, 44 PASS / 0 FAIL / 0 skip, 7570.8412 ms |
| Variantní zdroje všech čtyř override, přibližně 07:20 UTC | exit 0, 44 PASS / 0 FAIL / 0 skip, 5071.4633 ms |
| Helper AST kontrakt a lokální VM/orákula | PASS; game.ts/Latest/parent pointers/pořadí členů, žádná parse cache; 4/4 lokální suffixy bajtově shodné |
| TypeScript transpile diagnostika pěti změněných TS souborů | 5/5 bez diagnostik; nejde o plný typový build |
| Python ast.parse + compile v paměti | 6/6 modulů před/po změně PASS, Python 3.12.14 s `-B` |
| Python stubované diferenciály | 10/10 PASS, 0 skutečných síťových volání, 0 skutečných výstupních zápisů |
| `git diff --check --` přesný taskový scope | exit 0 |

Časy testů nejsou výkonové srovnání hry; dvě spouštění mají různé zatížení a variantní kontrola běžela v jednom procesu.

### Variantní fixture důkaz

Jednorázový Node skript načetl skutečný Game a vytvořil čtyři různé zdroje v paměti: unikátní komentář a další třídu před Game. Přesměroval pouze readFileSync pro čtyři jedinečná virtuální jména, synchronizoval Node builtin ESM exporty a nastavil každou odpovídající proměnnou prostředí. Importoval všechny čtyři skutečné testové moduly bez úpravy jejich orákul.

```json
{"fixtureOverrideReads":{"virtual-fixture-GAME_QUALITY_SOURCE.ts":1,"virtual-fixture-GAME_PREPARATION_SOURCE.ts":1,"virtual-fixture-GAME_LIGHT_SOURCE.ts":1,"virtual-fixture-GAME_STARTUP_SOURCE.ts":1},"localVmAndOracleSuffixesUnchanged":4,"helperAstContract":"passed"}
```

Navíc porovnal helper s původním AST při záměrně jiném pořadí požadovaných názvů, ověřil parent reference a identitu nového AST při opakovaném načtení. Původní a nový suffix každé sady od `const compiled =`, resp. `function findNodes` u lifecycle, byl přesně stejný. Nepřibyl persistentní testový soubor ani virtuální soubor na disku.

### Python diferenciál bez GIS/downloadu

Příkaz použil bundlovaný `C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe -B -` a skript na stdin. Systémový alias python.exe nebyl přístupný; žádný runtime se neinstaloval.

Celé tři staré/nové moduly byly parse/compile ověřeny, nikoli importovány/spuštěny jako download job. Ze skutečného AST fetch-streets se vykonaly jen ortho/write_json/unproject s pevným časem a stubs Transformer/request/MemoryPath. Caller se vykonal s kontrolovaným importlib/pathlib, nikoli se skutečným importem GIS modulu. Court data tail používal stejné stub vstupy pro původní i nové AST a skutečnou json.dumps/hashlib serializaci.

Diferenciální scénáře:

1. Výchozí ortho: standardní odpověď, stejný JPEG i georeference.
2. Explicitní šířka/výška z exportní odpovědi.
3. Chybějící href: stejný RuntimeError před zápisem.
4. Chyba načtení obrázku: stejná chyba a pořadí requestů.
5. Chyba write_bytes/neexistující cílový adresář: stejné I/O a chyba, bez nového předčasného mkdir.
6. Dvě opakovaná volání s různým runtime DOCS: default je dynamický.
7. Explicitní výstupní adresář: stejný výstup jako původní mutace, nový DOCS se nezmění.
8. Původní/nový expansion caller: stejné I/O, import identity, přesná cesta i pořadí mkdir; pouze nová verze zachová původní module.DOCS.
9. Court data tail: stejné výsledné JSON bajty, pořadí všech 30 klíčů a provenance tagy.
10. Celý court AST: po normalizaci jediné inicializace a odstranění okamžitého přepsání přesně stejný jako původní.

SHA-256 **stubovaného**, nikoli reálně regenerovaného court JSON: `c369b044f8c3ed38784f78ee1d6e411a014239c2cdd90f0284446526b3a96124`. Žádná skutečná fotografie, ortho, GIS geometrie, asset ani katalog nebyly zapsány. `-B` a compile v paměti nevytvářely __pycache.

Podrobné vstupní skripty i stdout jsou zachované ve výstupech nástrojů této relace; samostatné logy mimo taskový scope nebyly vytvářeny.

## Identita kandidáta včetně testů

Čtený produkční `client/game.ts` měl SHA-256 `32f02d0f457765719cae8ba23194e368ff709cfbf04d2580298f176e14f941b6`; není změnou tohoto tasku.

Manifest osmi změněných zdrojů/testů (bez sebereferenčního handoffu), kontrola 07:22:53 UTC:

| Soubor | Bajty | SHA-256 |
| --- | ---: | --- |
| tests/helpers/game-source.ts | 1021 | `3d13576fdb3d324df554e3f28f997d6250c47101b592874d091f6864e3d574df` |
| tests/game-quality-preparation.test.ts | 9100 | `a4197430836b015a5723e8754102022de556bc6ca943a56ea6839d3019913114` |
| tests/game-light-preparation.test.ts | 27283 | `f9589107dacf69c5318ca1ce3c3640d6668daec3d0e4a5c2e87457f874723720` |
| tests/game-light-lifecycle.test.ts | 10221 | `9cb9dd0f139581433943916f2bd530beabc0c7fcd9accc2f063173ffb78ffd5e` |
| tests/game-webgpu-startup.test.ts | 18035 | `b1ddc7d24246ef2ca5225d01dfbb7eea7972f23af75462ba3a0e4bc7afe785f7` |
| scripts/fetch-streets.py | 16372 | `e13b1d5a4cdd882e85de6d484168bde13cee458b2c27fea047bffe4849c294be` |
| scripts/fetch-expansion-reference.py | 546 | `f00369f392a2f296afbd204a23b39b6c346b4b451e634d7c60b2efa63b614b7d` |
| scripts/create-north-court-style.py | 4010 | `976156701802c2bd510638420ed5b0153c4467cb78f54a4e78da8d1233175203` |

SHA-256 seznamu `cesta mezera SHA LF` v uvedeném pořadí: `d63e0f761a7557e482728bd02d6a8b6f94223ae74356dc9dbb8a037e148508d4`. Manifest zahrnuje všechny taskové testy i nový helper. Není označován za snapshot celé hry.

## Omezení a další krok

Neproběhla plná sada, build/typová přejímka celého projektu, integrace, GPU ani reálný GIS download/export. Žádná taková činnost pro tento task nebyla spuštěna. Stubovaný I/O diferenciál prokazuje zachování provedených cest a bajtů při kontrolovaných vstupních datech, nikoli dostupnost externí služby či kalibraci reálného ortha.

Koordinátor převezme přesný diff/testy/manifest, provede nezávislé review a oddělený commit/integraci. Společná stabilní validace patří jeho rezervaci. Stav tasku, Linear a společné ověření aktualizuje integrátor; tento podagent je neměnil.
