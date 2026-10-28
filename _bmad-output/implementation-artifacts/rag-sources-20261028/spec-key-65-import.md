---
title: 'KEY-65: OpenAI embeddingy a pgvector nad ověřenými SH a SÚZ podklady'
type: feature
created: '2026-10-28'
status: done
route: dispatch
baseline_commit: 'de6f87a2efbf8596bb03efae863e8d6763e22774'
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/home-ai/20261028/source-contract.json', 'docs/home-ai/20261028/research/vector-contract.md', 'docs/home-ai/20261028/research.md']
---

<frozen-after-approval>

## Intent

Crazy Typka v main používá jen jedenáct úryvků. Uživatel výslovně požaduje skutečné OpenAI embeddingy a vektorovou databázi. Ověřené veřejné SH/SÚZ podklady z katalogu proto importovat do PostgreSQL s pgvector, dotaz převádět stejným embedding profilem a předávat modelu sémanticky nalezené aktuální podklady s citacemi. Textový index není požadovaným řešením ani tichým fallbackem. Aktuální dokumenty odlišit od archivu i nedoložených tvrzení.

## Boundaries & Constraints

Zachovat soukromé AI relace, moderaci, limity, requestSeq, reset a lidský multiplayer. Klíč mimo Git/GitHub. Importovat jen ověřené krátké faktické parafráze se skutečnou URL, institucí, verzí, účinností, kontrolním termínem, licencí a locatorem. Při rozporu rozhoduje konkrétní účinný dokument v působnosti instituce; kolejné není klubový příspěvek.

Archiv není ve výchozím retrievalu ani modelovém kontextu; v DB lze uchovat jeho metadata. Embedding profil je neměnný a oddělený od generativního modelu. Nezměněný import neplatí nové embeddingy; změněné vstupy se dopočítají a publikační revize se přepne atomicky. Žádný neobjednaný scheduler, veřejný runtime crawler nebo ingest soukromého IS/ISKAM. Žádné spouštění GPU hry/editoru a žádná změna hrané verze. Dynamický jídelníček, neověřené sazby a sporné přístupové postupy nevydávat za statický aktuální fakt.

## I/O & Edge-Case Matrix

| Stav | Výsledek | Chyba |
| --- | --- | --- |
| Dotaz na Fotokomoru/3D tisk nebo ubytování | Relevantní aktuální SH/SÚZ úryvky a platné citace | Bez důkazu přiznat mezeru |
| Kolejné proti členství, navazující cena | Zachovat instituci i konkrétní službu | Nejasnost nehádat |
| Archiv, budoucí/prošlý dokument | Nezařadit do modelových podkladů | Ostatní platné zdroje dál fungují |
| Platnost skončí během generování či před replay | Odmítnout starý výsledek i při prázdných veřejných citacích | Žádná další placená generace |
| Vadný corpus/hash/URL/ID | Volitelná AI nedostupná | Hra a HTTP host zůstanou funkční |
| Nezměněný / metadata-only import | Persistentní cache, 0 embedding volání | Stará publikace se nemaže |
| Jeden změněný úryvek / změna profilu | Nový vstup / nový profil a revize | Neúplná či nejasná dávka se nepublikuje a automaticky neopakuje |
| Dotaz / blokovaný dotaz | Moderace přesného query textu → OpenAI embedding → SQL cosine | Blokovaný text se neembeduje; při DB chybě žádný BM25 fallback |
| DB revize změněná během odpovědi nebo replay | Znovu ověřit snapshot a všechny source dependencies | Žádná další automatická placená operace |

</frozen-after-approval>

## Code Map

- `server/data/silicon-hill-knowledge.json`: původní SH fakta/IDs, převést na v2 per-source metadata.
- `server/data/rag/{silicon-hill,suz}.json`: nové ověřené aktuální podklady; samostatné *-archive.json mimo runtime.
- `server/crazy-typka-retrieval.ts`: společná v2 validace a datumové hranice; starý lexikální registr slouží pouze datovým/testovacím pomocníkům, ne produkčnímu chatu.
- `server/crazy-typka-provider.ts`: evidence JSON + prompt, bez změny endpointu/modelového transportu.
- `server/crazy-typka.ts`: optional init a stejný freshness guard pro publikaci/replay; interní evidence dependencies.
- `shared/crazy-typka.ts`: kompatibilní citace, úzký allowlist ověřených hostů; žádné změny Game/UI entrypointů.
- `server/rag-embeddings.ts`: OpenAI adapter, přesný profil/vstupní hash, bounded HTTP a usage.
- `server/rag-vector-store.ts`, `rag-schema.sql`, `rag-ingest.ts`, `scripts/rag-import.ts`: persistentní vektory/cache/verze, atomický import a CLI.
- `server/rag-evidence-backend.ts`: asynchronní queryembedding/DB vyhledávání/ověření revize; runtime používá DB data.
- `compose.rag.yaml`, `compose.ai.yaml`, `Dockerfile`, package/lock a CI: reprodukovatelný DB provoz, ingestion tools a reálná DB integrace bez skutečného OpenAI klíče v CI.

## Tasks & Acceptance

- [x] SH current/archiv, vlastní docs a retrieval-cases: ověřené nové věcné podklady a výluky, hash každé parafráze.
- [x] SÚZ current/archiv, vlastní docs a retrieval-cases: ubytování, pravidla, postupy, kontakty, tarifní jednotky s přesnými podklady.
- [x] OpenAI embedding adapter a testy: model/dim/profil/vstupní hash, bounds/abort/usage/fixed errors bez retry.
- [x] PostgreSQL/pgvector store, SQL, ingest a CLI: skutečné vektory, immutable revize, archive/current/časové filtry, cache a trvalé nejasné pokusy.
- [x] Backend/provider/service/shared: asynchronní DB cesta, moderace před embeddingem, pouze bezpečný USER kontext, oddělený embedding rozpočet a bez fallbacku; zachovat API.
- [x] Čtyři crazy-typka testy: pozitivní/negativní dotazy, archivní sentinel, data/hash/URL, účinnost a expiry, provider context, server citace/replay a klientská validace.
- [x] Root: review všech předaných dat/kódu, stabilní kontroly, omezená živá QA a samostatná integrace.
- [x] Root setup: pouze nový pg driver/types s původními piny ostatních závislostí, compose/CLI/provozní návod, skutečný pgvector v CI a soukromé místní ověření.

Given dotaz na novou SH/SÚZ informaci, when projde celý service/provider řetězec, then model obdrží ověřený úryvek a klient přijme jeho správnou citaci. Given starý nebo archivní předpis, when má podobná klíčová slova, then se neobjeví v evidence ani odpovědních citacích. Given nový zdroj má kratší review interval, when vyprší, then nevyřadí ostatní platné dokumenty. Given přijatá operace použila podklady, when později vyprší, then ani odpověď bez veřejných sourceIds nelze neplatně replayovat.

## Implementation Notes

Autorizace z přímého zadání; projektová policy odstraňuje redundantní schvalování a staging cizího WIP. Footprint jsou přidělené data/runtime/testy/evidence. Provozní migrace patří pouze do vlastní izolované DB. Časové intervaly a původ jsou explicitní v source-contract; nejasné zdrojové údaje se vynechají s odůvodněním.

Uživatel následně opravil chybnou původní interpretaci: OpenAI embeddingy a vektorová databáze jsou součást cíle nyní. Nová DB migrace se provede jen v samostatné vlastní databázi; nemění cizí či veřejné nasazení. Konkrétní rozšířené rezervace přidělil admin. Dosavadní data/85 textových regresí jsou mezistav, nikoli vektorová přejímka.

## Spec Change Log

- Výslovná lidská změna/oprava záměru: textový MVP nahrazen OpenAI embeddings + PostgreSQL/pgvector, inkrementálním importem a skutečným SQL retrievalem. KEEP: ověřené v2 sources, archiv, hash/provenance/platnost, soukromé relace a bezpečnostní lifecycle. Odstraněn chybný předpoklad, že vektory lze odložit.
- Skutečná A/B evaluace 28.10 doložila pro large/3072 lepší české odpovědi než pro původní small/1536; při prahu0.60 prošlo38/39 pozitivních případů a6/6 nesouvisejících zůstalo bez evidence. Volba/model/známé EN omezení jsou v research/vector-evaluation.md. Paid budget:45 dokumentů a45 syntetických dotazů na každý ze dvou profilů, nejvýše3 generace celkem. Žádný automatický retry.

## Review Triage Log

Všechny tři nezávislé vrstvy spuštěny nad stejným diffem do9ed94e861651eb32547a6d0b677b3f54c03fd8dd; triáž až po jejich úplném předání. Soubory autorových claims četla pouze edge vrstva podle svých instrukcí.

| ID / vrstva | Verdikt | Důkaz a dopad | Cesta |
| --- | --- | --- | --- |
| B1 blind | medium | Inference topics pro Fotokomora+kancelář nebo3Dtisk+sport vyloučí existující druhý podklad před SQL rankingem. Čtecí reprodukce a kontrola SQL potvrzují chybu. | patch: odstranit NLP topic omezení, ponechat pouze bezpečné explicitní instituce; kombinované regrese |
| E1 edge | medium | Publish i replay předávají čas odebraný před posledním async validate. Po návratu kontrolují session, nikoli znovu časovou platnost source metadata; reprodukce dosáhla200 po expiraci. | patch: společná synchronní kontrola všech evidence poawait s čerstvým now, RED/GREEN obou cest |
| E2 edge | medium | Fotokomora+menza odvozuje pouzeSH/photography a vylučuje SÚZ. Jde o stejnou kořenovou chybu jakoB1, zachováno jako vlastní posouzený nález. | patch: společná opravaB1, bez regex výjimky na jedinou větu |
| V1 verification | medium | Skutečný DB test neobsahoval směs institucí/témat; odstranění SQL filter parametrů by nebylo behaviorálně zachyceno. | patch: skutečné SQL výsledky s bližšími zakázanými kandidáty aLIMIT |
| V2 verification | medium | Produkční CLI loader nebyl testován, testový legacy loader je jiný; vynecháníSÚZ mohlo projít regresí. | patch: skutečný loadApprovedRagDatasets+prepareRagCorpus, SH/SÚZ/archiv a selhání chybějícího vstupu |
| V3 verification | medium | Service fixture používala stále stejnou revisionId; odstranění clear history by nebylo zachyceno. | patch: zachování historie při stejné revizi a odstranění při nové |

Opravy předány původním runtime/store implementátorům s novým disjunktním claimem. Nejde o novou funkci nebo rozšíření veřejného API. Offline SQL opakování45 již zaplacených query vektorů úplně bez inference filtrů zachovalo recall39/39 předprahem a38/39 při0.60, bez novýchAPI volání.

První re-review: E1/E2 aV1/V2/V3 uzavřené, nové DB12/12PASS. B1 původní reprodukce vyřešená, ale následující samostatný nález se posuzuje před sloučením:

| ID / vrstva | Verdikt | Důkaz a dopad | Cesta |
| --- | --- | --- | --- |
| B2 blind, opravaB1 | medium | Odstraněním topic inference zmizel i dosavadní ochranný mixed guard: Fotokomora+kancelářSÚZ nyní vynucuje SÚZ a vyřazuje existujícíSHpodklad. Reprodukce potvrzena podle nové explicitAuthority větve. | patch: odstranit všechna NLP odvozovaná omezení z runtime; skutečnéSQL A/B bezfiltrů zachovalo kvalitu, explicitníSQL API zůstává |

KEEP: čerstvá synchronní kontrola source metadata poawait, oddělené embedding profily/cache, časové/public filtry uvnitřSQL, generativní rozlišení SH versusSÚZ a kompatibilní citace. Nezavádět výjimku na konkrétní testovou větu ani placený překlad/reranking.

Konečné cílené re-review B2: uzavřeno, chat předává pouze limit/now. Reviewer znovu spustil3/3 testy včetně11 smíšených dotazů, předání vektoru a relevance boundary; bez doložené regrese. Runtime autor po opravách105/105PASS a scoped strict TypeScriptPASS. Všechny podložené nálezyB1/B2/E1/E2/V1/V2/V3 jsou vyřešené; žádná odložená chyba tohoto rozsahu. Společné CI/build/SDK a integrace stále čekají.

## Design Notes

Po měření zvolen OpenAI large/3072 a práh0.60, PostgreSQL/pgvector exact cosine pro malý corpus. ANN index až podle měření. Immutable revize a oddělená embedding cache zachovají poslední platný obsah při výpadku importu. Datum kontroly není embedding vstup ani právní účinnost. Runtime načítá publikovanou DB revizi, nemění ji lokální JSON fallbackem. Přesná rozhraní, limity a zdroje jsou ve vector-contract. Nejasné výsledky placených operací se neoznačí za zdarma; přesnou exactly-once záruku přes externí API netvrdíme.

## Verification

Konečné přijetí28.10: [PR34](https://github.com/Varnahg/StrahovCrazyShow/pull/34) sloučeno do main jako `86e4dd603ca1b91e3eaa5f84573f9481be410a29`. [CI40692141941](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40692141941) na přesném headu `a4c24af4756e45c72563919715edd7102465fb18`:2579PASS/0FAIL/1SKIP, skutečný pgvector test spuštěn, TypeScript/produkční build a celý izolovaný SDK běhSUCCESS. Source-secret checkSUCCESS a [project-acceptance](https://github.com/Varnahg/StrahovCrazyShow/pull/34#issuecomment-6469934495)SUCCESS. Merge tree `c1d382347b05829251d255dfb36bd2249771224b` je shodný s reviewed tree. Žádný odložený podložený review nález; známé limity relevance a absence veřejného deploymentu jsou v verification.md.

Cílené AI/embedding/store/ingest/backend testy, skutečný PG/pgvector integrační test a perzistentní restart/cache/atomické publikace; potom celý TypeScript, build, izolovaná SDK integrace a plná CI. Živě importovat nejvýše45 dokumentových vstupů do prvního profilu, poté prokázat nulové embedding volání při nezměněném importu. Bounded skutečný query eval pro změření recall a prahu, samostatně nejvýše tři generativní odpovědi; všechny hodnoty a nejasné pokusy vykázat. Klíč/DB URL mimo Git; bez GPU/3D přejímky. Žádný mock nebo textový test není důkazem skutečných vektorů.
