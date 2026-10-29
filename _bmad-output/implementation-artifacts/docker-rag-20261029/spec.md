---
title: 'KEY-70: Jednoduchý Docker start hry a RAG'
type: feature
created: '2026-10-29'
status: in-review
route: dispatch
baseline_commit: 58da5fc7693bd1fda04f06050a7b1f6fc9afbcaa
---

<frozen-after-approval reason="Přímé zadání uživatele; pokračování v odlehčeném postupu">
## Intent

Na druhém notebooku stačí vložit skutečné uživatelské secrets a jediným Docker příkazem spustit hru, chat, vektorovou databázi a obsluhu embeddingů. Hotové veřejné embeddingy mají být přenositelné bez dalšího placení; změněné vstupy používají stávající OpenAI adapter a persistentní cache. Interní DB role, hesla, migrace a bezpečné pořadí startu obstará systém.

## Boundaries & Constraints

Použít stávající pgvector/RAG kontrakty, omezený reader pro hru a ingester pro import. Klíče pouze runtime secret, nikdy build/image/Git/log. Zachovat placenou cache, novější cizí head a uncertain ledger. Jeden společný herní svět. Kompletní crawler všech katalogových zdrojů je dosud samostatná otevřená práce; bootstrap dodává aktuálně ověřený corpus a připravený provoz.

## Tasks & Acceptance

- Po clone a vložení key file příkaz `docker compose -f compose.full.yaml up -d --build` vytvoří funkční celek bez ručních SQL či DB URL.
- Prázdná DB dostane migrované schéma, role a schválený seed. Chyba bootstrapu zadrží start hry a vrátí bezpečný popis.
- Restart stejného corpusu zachová data/credentials a nepoužije nové placené embeddingy. Novější ruční publikace se nevrací na starý zabalený head.
- Přesun na nový čistý Docker projekt/import seedu obnoví znalosti a vektory; žádná privátní data nejsou v seedu. Existující legacy i v3 zdroje musí zůstat zastoupené.
- Signal/exit procesů, role ACL, secret permissions, cold start, restart a neprázdný head ověřit skutečnou DB/Docker kontrolou; celkové CI před main integrací.
</frozen-after-approval>

## Code Map

Existující compose.yaml je funkční samostatná hra. Nový compose.full.yaml přidá secrets init, pgvector a bootstrap s health/completion dependencies. Dockerfile rag-tools target má server/shared a CLI, runtime dostane malý entrypoint. scripts/rag-import.ts a server/rag-ingest.ts již poskytují validované corpus plány, importPreparedCorpus a document import. openRagImportSession/openRagDocumentImportSession drží společný advisory lock. migrateRagSchema přiděluje explicitní reader/ingester granty, globální role vytváří bootstrap.

## Implementation Notes

Zvoleny služby jednoho Compose projektu, nikoli vlastní supervisor více démonů v jednom kontejneru. Tím zůstává běžná správa stop/start/logů/volumes a přesné pořadí DB healthy → bootstrap successful → game. Existing overlays zachovány; jeden samostatný full soubor je jednodušší než tři `-f` a ruční SQL. Interní credentials vzniknou atomicky jednou v oddělených owner/reader volumes, uživatel zadá jen OpenAI key file. Seed cache a v3 dokumenty mají samostatný whitelist/provenance audit, protože legacy a v3 důkazy jsou ve dvou DB. Automatické importy jsou pod existujícím importním lockem a s managed checkpointem, aby starší image nepřepsal novější head. Žádný automatický uncertain retry.

Root vlastní packaging, child vlastní bootstrap; seed i skutečná DB/Docker validace mají samostatné scopes/resources. Jedno společné review a stabilní CI, nikoli opakované široké workflow. Primární dokumentace: https://docs.docker.com/compose/how-tos/startup-order/ a https://docs.docker.com/compose/how-tos/use-secrets/ ; připnutý pgvector/PostgreSQL a existující importní kód ověřen čtením.

Implementace a refaktoring dokončené. Jediné review P2 návratu na starší managed seed opravené confirmed/pending revision; úzké re-review bez nálezů. Finální cílená sada19/19, strictTS a skutečné Docker fresh/restart/druhý čistý projekt/ACL/safe-failure PASS.101vstupů bylo obnoveno bezembedding attempts; klíč byl pouze testovací a API rozpočet0. Full-validation handoff uvádí přesné image/source hashy i původní omezení interní testovací sítě. Vlastní testovací projekty a volumes uklizené, původní placená DB zůstala stopped. Následuje commit, čistý export a CI/main přijetí.
