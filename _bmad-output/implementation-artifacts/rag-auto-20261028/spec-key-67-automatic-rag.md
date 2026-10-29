---
title: 'KEY-67: automatický ingest celých dokumentů a oddělený archiv'
type: feature
created: '2026-10-28'
status: in-progress
route: dispatch
baseline_commit: '801b2d07c884c51e42b0fc1a890e7a0f9dbc0196'
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/rag-ingestion/20261028/research.md', 'docs/rag-ingestion/20261028/pipeline-plan.md']
---

## Intent

Uživatel chce automatizovat získání a zpracování všech validních zdrojů katalogu, včetně celých HTML, PDF, DOCX a dalších dokumentů, s OpenAI embeddingy a vektorovou databází. Ručně vybrané parafráze nejsou konečný vstup. Potvrdil samostatný vektorový archiv pro historické dotazy a navrhl OpenAI převod PDF s opakováním pouze při změně dokumentu. Jeho prioritní Decisions routing již samostatně dokončil KEY-68/PR35.

## Boundaries & Constraints

Původní soubory a klíč zůstanou mimo Git. Dokumenty jsou data, nikdy instrukční autorita. Zachovat bezpečné URL/DNS/robots hranice, stávající moderaci, soukromé relace, replay, expiry, persistentní embedding cache a poslední platnou publikaci. Běžný dotaz používá aktuální zdroje; archiv se nezapíná kvůli prázdnému výsledku nebo pouhému roku. Neoznačovat dostupný endpoint, validní JSON nebo knihovní SUCCESS za důkaz věrnosti/platnosti dokumentu.

## I/O & Edge-Case Matrix

| Vstup/stav | Požadované chování |
| --- | --- |
| Schválený dostupný HTML/PDF/DOCX zdroj | Bezpečný fetch, kompletní strukturovaná extrakce, deterministické chunky a provenance |
| PDF bez přípony nebo HTTP charset | Ověřit signaturu/strukturu a předat skutečnou charakterovou sadu |
| Nezměněný raw hash a profil | Žádný nový modelový převod; případná čekající indexace přesto pokračuje |
| Stejný přesný embedding vstup | Persistentní cache, žádné nové embedding volání |
| Změna fyzické stránky/bbox | Nová provenance, embedding jen pokud se změnil sémantický vstup |
| Neúplná extrakce, 5xx, limit, nejistý placený pokus | Přiznaný obnovitelný stav, zachovat poslední platnou publikaci, bez tichého retry |
| Historický dotaz | Oddělený scope/verze/citace, účinnost vůči validovanému asOf |
| Auth, robots zákaz, unsupported, policy review | Samostatný důvod v inventáři, žádné obcházení nebo tiché vynechání |

## Code Map

Konkrétní rozdělení je v [pipeline-plan.md](../../../docs/rag-ingestion/20261028/pipeline-plan.md). Existující acquisition a offline Python extractor mají samostatná vlastnictví; nový OpenAI PDF adapter má samostatný [kontrakt](../../../docs/rag-ingestion/20261028/openai-pdf-contract.md). Budoucí v3 kontrakt/profil/citace, SQL/store, obnovitelná orchestrace a runtime/archivní UI dostanou disjunktní tasky po upřesnění rozhraní. Společné package/Compose/CI/entrypointy vlastní pouze přidělený integrátor.

## Tasks & Acceptance

- [x] Průzkum katalogu a skutečných formátů, srovnání parserů a AI převodu, měřené vzorky a varianty archivu/cache.
- [x] Komponenta katalogu a bezpečného fetch transportu s cílenými testy; není to ještě plný crawler.
- [x] Izolovaný offline extraktor s formátovými testy a skutečným CPU probe; známé quality/legacy hranice přiznané.
- [ ] Bounded OpenAI PDF adapter, offline normalizer a měřený skutečný převod problematických PDF.
- [ ] V3 dokumentový/citační kontrakt a neměnný nový embedding input profil.
- [ ] Additivní verzovaná SQL migrace a atomické current/archive publikace se zachováním staré cache/head.
- [ ] Obnovitelná orchestrace všech katalogových seedů, discovery, stavů, artefaktů a inkrementálních kroků.
- [ ] Aktuální/historický runtime scope, označené verze v citacích a správné replay/freshness chování.
- [ ] Skutečný import použitelných SH/SÚZ zdrojů, poté zbytku validního katalogu; úplný report pokrytí a otevřených položek.
- [ ] Cílený refaktoring, nezávislé review, vhodné praktické ověření, CI/build/integrace a samostatné přijaté commity.

## Implementation Notes

Uživatelská autorizace a projektová policy dovolují běžnou implementaci bez dalších potvrzení. Před každým zápisem platí task/claim; nové API, migrace a sdílené soubory se koordinují předem. Vnější návrhy a katalog nesmějí přepsat uživatelovy požadavky. Placené piloty mají vlastní přesně omezený ledger a scope. V této etapě zatím neproběhl žádný nový placený PDF převod nebo hromadný embedding import.

## Verification

Každý dokončený celek má vlastní důkazy a handoff. Cílené komponentové testy nesmějí předstírat end-to-end pipeline. Přijetí zahrne skutečný opakovaný import bez API volání při nezměněném obsahu, změnu jednoho chunku, obnovení po chybě, archive/current oddělení, více historických verzí, úplnost citací a původní bezpečnostní/lifecycle regrese. Počet validovaných seedů se vykazuje odděleně od extrahovaných a publikovaných dokumentů.
