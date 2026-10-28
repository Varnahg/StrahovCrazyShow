---
title: 'KEY-65: Ověřené SH a SÚZ podklady ve skutečném RAG'
type: feature
created: '2026-10-28'
status: in-progress
route: dispatch
baseline_commit: 'de6f87a2efbf8596bb03efae863e8d6763e22774'
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/home-ai/20261028/source-contract.json', 'docs/home-ai/20261028/research.md']
---

<frozen-after-approval>

## Intent

Crazy Typka zatím používá jen jedenáct úryvků. Ověřit a importovat užitečné veřejné podklady Silicon Hill a SÚZ z dodaného katalogu, aby je skutečně vybírala, předávala modelu a citovala. Aktuální dokumenty odlišit od archivu i od nedoložených tvrzení.

## Boundaries & Constraints

Zachovat soukromé AI relace, moderaci, limity, requestSeq, reset a lidský multiplayer. Klíč mimo Git/GitHub. Importovat jen ověřené krátké faktické parafráze se skutečnou URL, institucí, verzí, účinností, kontrolním termínem, licencí a locatorem. Při rozporu rozhoduje konkrétní účinný dokument v působnosti instituce; kolejné není klubový příspěvek.

Archiv není ve výchozím retrievalu ani modelovém kontextu. Žádný scheduler, veřejný runtime crawler, vector DB nebo ingest soukromého IS/ISKAM. Žádné spouštění GPU hry/editoru a žádná změna hrané verze. Dynamický jídelníček, neověřené sazby a sporné přístupové postupy nevydávat za statický aktuální fakt.

## I/O & Edge-Case Matrix

| Stav | Výsledek | Chyba |
| --- | --- | --- |
| Dotaz na Fotokomoru/3D tisk nebo ubytování | Relevantní aktuální SH/SÚZ úryvky a platné citace | Bez důkazu přiznat mezeru |
| Kolejné proti členství, navazující cena | Zachovat instituci i konkrétní službu | Nejasnost nehádat |
| Archiv, budoucí/prošlý dokument | Nezařadit do modelových podkladů | Ostatní platné zdroje dál fungují |
| Platnost skončí během generování či před replay | Odmítnout starý výsledek i při prázdných veřejných citacích | Žádná další placená generace |
| Vadný corpus/hash/URL/ID | Volitelná AI nedostupná | Hra a HTTP host zůstanou funkční |

</frozen-after-approval>

## Code Map

- `server/data/silicon-hill-knowledge.json`: původní SH fakta/IDs, převést na v2 per-source metadata.
- `server/data/rag/{silicon-hill,suz}.json`: nové ověřené aktuální podklady; samostatné *-archive.json mimo runtime.
- `server/crazy-typka-retrieval.ts`: validovaný lazy registr, datumové hranice, lexikální index a návazné USER téma.
- `server/crazy-typka-provider.ts`: evidence JSON + prompt, bez změny endpointu/modelového transportu.
- `server/crazy-typka.ts`: optional init a stejný freshness guard pro publikaci/replay; interní evidence dependencies.
- `shared/crazy-typka.ts`: kompatibilní citace, úzký allowlist ověřených hostů; žádné změny Game/UI entrypointů.

## Tasks & Acceptance

- [ ] SH current/archiv, vlastní docs a retrieval-cases: ověřené nové věcné podklady a výluky, hash každé parafráze.
- [ ] SÚZ current/archiv, vlastní docs a retrieval-cases: ubytování, pravidla, postupy, kontakty, tarifní jednotky s přesnými podklady.
- [ ] Retrieval/provider/service/shared: skutečně načítat aktuální datasety, izolovat instituce a konkrétní témata, kontrolovat platnost každého zdroje a zachovat API.
- [ ] Čtyři crazy-typka testy: pozitivní/negativní dotazy, archivní sentinel, data/hash/URL, účinnost a expiry, provider context, server citace/replay a klientská validace.
- [ ] Root: review všech předaných dat/kódu, stabilní kontroly, omezená živá QA a samostatná integrace.

Given dotaz na novou SH/SÚZ informaci, when projde celý service/provider řetězec, then model obdrží ověřený úryvek a klient přijme jeho správnou citaci. Given starý nebo archivní předpis, when má podobná klíčová slova, then se neobjeví v evidence ani odpovědních citacích. Given nový zdroj má kratší review interval, when vyprší, then nevyřadí ostatní platné dokumenty. Given přijatá operace použila podklady, when později vyprší, then ani odpověď bez veřejných sourceIds nelze neplatně replayovat.

## Implementation Notes

Autorizace z přímého zadání; projektová policy odstraňuje redundantní schvalování a staging cizího WIP. Footprint jsou přidělené data/runtime/testy/evidence. Žádná migrace, deployment ani nevratné vedlejší účinky. Časové intervaly a původ jsou explicitní v source-contract; nejasné zdrojové údaje se vynechají s odůvodněním.

## Spec Change Log

## Review Triage Log

## Design Notes

Zvolen lokální neměnný registr s explicitními aktuálními vstupy; uchová levný provoz a nemíchá archiv s živým indexem. V2 metadata nahrazují globální expiraci. Administrativní UTC den není česká půlnoc právní účinnosti; ta má uložený ISO offset. Datumové hranice a index se předpočítají jednou. Opakovaný request kontroluje interní dependencies všech evidence. Výkonový přínos se bez měření netvrdí.

## Verification

Cílené `node --import tsx --test` nad čtyřmi AI testy a vlastními data invarianty; potom celý TypeScript, build, izolovaná SDK integrace a plná testovací sada v povinném CI nad stabilním checkpointem. Živá syntetická QA nejvýše tři generování v samostatném procesu s cap3 a klíčem mimo Git: konkrétní SH služba, SÚZ postup a návazný dotaz. Bez GPU/3D přejímky; výsledek zaznamenat přesně, nic nezaměnit za úplnost katalogu114URL.
