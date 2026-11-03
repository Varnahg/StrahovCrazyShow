# Předání: discord-kb-20261103-parser

- Vlastník: `discord-kb-20261103-parser-agent`; příjemce: `discord-kb-20261103-root`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`; výchozí commit `d124d4a3`.
- Výsledek: implementovaný a ověřený offline parser všech Discord HTML exportů; kompletní soukromá extrakce připravená ke kuraci. Nejde o publikovanou ani ověřenou knowledge base.
- Změněné verzované soubory: `scripts/discord-kb/parse.py`, `tests/discord-kb-parser/test_parser.py`, toto předání. Žádný staging ani commit; integruje root.
- Cizí WIP: render/startup změny v checkoutu zůstaly nedotčené. Parser nevlastní ostatní skripty v `scripts/discord-kb/`.

## Použití a předané výstupy

Python 3.11+ bez dependencies. Ověřený lokální interpreter je Python 3.13.14 z instalace uv. Příkaz:

```text
python -B -X utf8 scripts/discord-kb/parse.py --input C:/Users/rezac/Documents/GitHub/konverzace --output <nový-prázdný-výstup>
```

**Kanonická předaná extrakce je `.cache/discord-kb-20261103/raw/corpus/`.** Použít právě tuto podcestu. Starší nepublikované průchody v `raw/` a `raw/final/` zůstaly zachované; automatická kontrola odmítla jejich odstranění při regeneraci. Nejsou vstupem pro kuraci.

- `manifest.json`: inventář všech vstupů, SHA-256, exportní metadata, deklarované/skutečné počty, integrita, rozsah dat, duplicity a omezení.
- `messages.ndjson`: jeden záznam na každý zdrojový výskyt zprávy. `recordId` je jednoznačný výskyt, `messageId` je řetězec; `sourceId` odkazuje na export v manifestu. Dále `sourceFile`, `sourceSha256`, `sourceAnchor`, `channelId`, `ordinal`, `group`, `createdAtUtc`, zobrazovaný čas a zóna, interní `author`, vlastní `text`, `systemText`, `links`, `codeBlocks`, `replyToMessageId`, `replyStatus`, oddělený `replyPreview`, `edited`, `forwarded`, `embeds`, `attachments`, `flags`.
- `contexts.ndjson`: exportní pořadí `orderedRecordIds` a `replyComponents`. Komponenty jsou pouze strukturální spojení, nikoli schválené Q/A; zachovat i okolní chronologii.
- `contexts/<sourceId>.md`: souvislé podklady s pseudonymním speakerem, časem, reply vazbami, textem, embedy, forwardy a odkazy. Obsah je výslovně označený jako nedůvěryhodná soukromá data.
- `audit-ledger.ndjson`: každá zpráva má `status: pending`, prázdné `candidateIds` a `reason: null`. Parser nic sémanticky nevylučuje.

## Výzkum, rozhodnutí a refaktoring

V projektu nebyl dostupný vhodný HTML parser dependency. Zvolen stdlib `HTMLParser` místo regulárních výrazů pro strukturu nebo nové instalace. Malý společný strom a pomocníci pro text, odkazy, lokální dostupnost a serializaci oddělují parser od auditních výstupů. Strom se zpracovává po exportech; skripty ani síť se nespouštějí. Reply preview se nestává znovu vlastním textem zprávy. Zděděný autor je omezený na message group. Zdrojová ID se nepřevádějí na nepřesná JS čísla.

Žádný původní HTML ani asset se nepřepisuje. Inventář se rehashuje před publikací výstupu, manifest vzniká poslední. Vstup/výstup nesmí být v sobě; neprázdný výstup se odmítá. Duplicity i konfliktní obsah zůstávají evidované. SVG interní ikonové odkazy se nezaměňují za chybějící přílohy.

## Ověření 3. 11. 2026

- `python -B -X utf8 -m unittest discover -s tests/discord-kb-parser -v`: **12/12 pass**, poslední běh 0,459 s; synthetic-only fixtures. Pokrývá entity/Unicode, multiline code, author inheritance, NBSP v počtech, reply/unknown/missing target, forward/embeds/attachments, system/empty export, duplicity, determinismus, integritu a ochranu outputu. Test záměrného nesouladu deklarovaného počtu ověřuje exit 2, nejde o neúspěch korpusu.
- Skutečná extrakce: exit 0; **180/180 exportních počtů souhlasí**, **18 465 zpráv = 18 465 unikátních IDs = 18 465 pending ledger položek**. Inventář obsahuje 245 vstupních souborů.
- Další počty: 849 systémových zpráv, 3 964 rozpoznaných reply odkazů, 0 chybějících numerických cílů, 65 unknown/unlinked reply bloků, 109 forwardů, 2 693 embedů, 1 885 příloh. Všechna zjištěná umístění příloh jsou `remote-unfetched`; existence jednoho lokálního PDF sama nedokládá vazbu na konkrétní přílohu.
- Nezávislá Node kontrola proti původním HTML potvrdila přesnou shodu všech message IDs, nezměněné SHA-256 všech vstupů, úplnost pending ledgeru, pořadí kontextů, pokrytí každého záznamu právě jednou v reply komponentách a přítomnost 180 transcriptů.
- Rozsah snowflake UTC: `2022-08-19T17:59:18.711Z` až `2026-11-02T21:15:49.275Z`; exportní zóna je `UTC+1`.
- `git check-ignore` potvrdil ignorování raw zpráv. Žádné reálné zprávy, identity ani přílohy nejsou v testech ani verzovaném výstupu.

SHA-256 checkpointu:

| Artefakt | SHA-256 |
| --- | --- |
| Parser | `3bcdfb7293f2e71056dea07012f96c6ef6376eb5de9c4453cc3c3ee598acff6f` |
| Testy | `b9bd2e7ef3d486301260390964ab142e8f2161f37c7be18510a157dfd816f6ea` |
| Kanonický inventář vstupů | `c8afca9ef53c5d8cac6031fc926abcebfc73f59922c8fc1f9bf965df2f549e40` |
| Manifest extrakce | `9736e3a090c066340bb4258c86124044d97e385458abed06717165cd2a69e92f` |
| Normalizované zprávy | `14d3b23def133a843928849b63c10ed4788b2854cda3e403c337f486af5e7284` |

## Hranice a další krok

Parser nedokládá úplnost serveru, nepřístupné/smazané zprávy ani obsah vzdálených příloh. Neověřuje tvrzení, nekurátuje, nevytváří embeddingy. Neznámé reply a rozpory musí zůstat viditelné při kuraci. Surová auditní data se nesmějí připojit k veřejnému RAG.

Vlastní jednorázové procesy skončily; žádný port, GPU ani persistentní helper. Celá herní sada/build/integrace nebyly spouštěny: změna je samostatný offline datový nástroj a těžké zdroje vlastní jiná práce. Rezervace je uvolněna po předání; stav tasku a integraci mění root.
