---
title: 'KEY-72: Kurátorovaná Discord knowledge base Crazy Typky'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: 'd124d4a360aee9b870eb0416875da17bbdc92508'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/AGENTS.md', '{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Uživatel výslovně schválil a zadal implementaci celého plánu 3. 11. 2026">

## Intent

**Problém:** Dodaných 180 HTML exportů obsahuje 18 465 unikátních zpráv, ale jejich syrové vložení do RAG by přeneslo osobní údaje, opakování, vyvrácené rady i historické údaje jako dnešní fakta.

**Přístup:** Celý korpus projde rekonstrukcí kontextu, anonymizací, výběrem relevance, ověřením jednotlivých tvrzení a sémantickou deduplikací. Kanonický český dataset FAQ/návodů vytvoří tematický Markdown a import. Uživatel zvolil také výslovně označené komunitní zkušenosti. Embeddingy vzniknou až po druhé obsahové kontrole.

## Boundaries & Constraints

**Vždy:** Pouze main ve společném checkoutu, rezervované disjunktní cesty a serializované těžké ověření. Zachovat každý původní export. Každá zpráva má dohledatelné zařazení. Oddělit blok/provozovatele/OS/čas, datum zkušenosti, ověření faktu a kurátorskou kontrolu. Komunitní kurace má 90denní review; oficiální podpora nesmí být prošlá. Celé nové znalostní položky zkontroluje druhý průchod. Aktualizovat Linear a commitovat ověřené celky.

**Nikdy:** Neembedovat raw chat, identity ani neúplné/pending odpovědi; nepřevzít první odpověď bez pozdějších oprav. Neobcházet publisher allowlist, nepředstírat dokumentovou extrakci nebo oficiální autorství kurace. Neodvozovat aktuální ceny, výjimky a dostupnost ze starých anekdot. Nezasahovat do render WIP, hraného buildu ani cizích procesů.

## I/O & Edge-Case Matrix

| Situace | Vstup | Výsledek | Selhání |
|---|---|---|---|
| Běžná otázka | Kontext a doložená odpověď | Jedna samostatná Q/A s podmínkami a podporou | Nedoložené tvrzení zůstane pending |
| Opakování CZ/SK/EN | Stejný význam a scope | Jedna canonical položka, varianty a více auditních vazeb | Odlišné bloky/období neslučovat |
| Opravená rada | Pozdější vyvrácení či neúspěch | Ověřený závěr, původní rada vyřazena | Rozpor bez rozhodnutí neindexovat |
| Komunitní zkušenost | Relevantní datovaný popis | Výslovné označení a omezení | Kurátorská kontrola není fact-check |
| Chybějící příloha/reply | Neúplný důkaz | Zaznamenaná mezera | Obsah se nedomýšlí |
| Import | Ověřený manifest a budget | Atomický snapshot a cache reuse | Původní head zůstane funkční |

</frozen-after-approval>

## Code Map

- `scripts/discord-kb/parse.py`: nový offline HTMLParser; privátní messages/contexts/ledger v `.cache/discord-kb-20261103/raw/`.
- `server/rag-document-contract.ts`: zachovat dosavadní extrakční identitu a validaci; nový `rag-curation-contract.ts` přidá explicitní větev kurace a builder.
- `server/rag-vector-store.ts`, `rag-ingest.ts`, `rag-embeddings.ts`: reuse V3 snapshotů/CAS/cache a modelu text-embedding-3-large/3072; migrace003 je aditivní.
- `shared/knowledge-curation.ts`, `shared/crazy-typka.ts`: veřejný anonymizovaný kontrakt bez raw Discord identit a URL.
- `server/crazy-typka-provider.ts`, `rag-evidence-backend.ts`, `client/crazy-typka.tsx`: homogenní evidence, expirace, deterministické označení komunitních částí a detail citací.

## Tasks & Acceptance

**Execution:**
- [x] Parser: syntetické testy a přesná inventura celého korpusu.
- [x] Kurace: poradna, bloky/B6, General a ostatní kanály v oddělených privátních partitions; každý message ID a accepted claim dohledatelný.
- [x] Foundation: typy, validátory, migrace, import a cílené regrese.
- [x] Root: druhá kontrola/dedup, canonical dataset, generovaný Markdown/manifest, provider/UI a 60dotazová evaluace.
- [x] Integrace: actual DB/cache/import, full tests/build/izolovaná integrace, praktické AI odpovědi a samostatné commity. Dvě infrastrukturní přípravné chyby úplné sady a přesné úspěšné reruny jsou výslovně zachované v reportu.

**Acceptance Criteria:**
- Given všechny exporty, when parser/kurace skončí, then každý zdrojový message ID má právě jedno konečné zařazení a původní bajty jsou nezměněné.
- Given přijatá Q/A, when ji AI použije, then zachová scope, platnost a druh důkazu; žádné osobní identifikátory neodejdou veřejně.
- Given 60 nezávislých eval dotazů, when hledáme top4, then nejméně 90 % zodpověditelných dotazů nalezne správnou podporu a žádný kritický privacy/scope/label scénář neselže.
- Given stejný import, when jej opakujeme, then nevznikají další placené embeddingy; metadata-only změna neinvaliduje textovou cache.

## Implementation Notes

- Výchozí code HEAD: `5694027696ea94b95d147914956b7a8e8359f320`; koordinace commit `d124d4a360aee9b870eb0416875da17bbdc92508`.
- Průzkum a volba community policy proběhly v předchozím schváleném plánu; nejde o další schvalovací gate. Provozní ownership definuje registr, soubory task JSON.
- Žádné nové parser dependencies. Raw audit zůstává lokální, do Gitu patří pouze sanitizovaný obsah, kód, syntetické fixtures a evidence bez identit.

## Spec Change Log

## Review Triage Log

| Nález | Dopad a přijetí | Oprava a důkaz |
|---|---|---|
| Potvrzení kurace nebylo původně dostatečně vázané na konkrétní obsah a celý ledger | Střední: změněný obsah mohl přežít staré schválení | Receipt nyní váže content hash, inventory i ledger; gate kontroluje přesně všech 180 souborů a 18 465 ID. Tamper/coverage regrese PASS. |
| Generovaný gap mohl obejít zdrojové označení | Střední: nepodložená část by se mohla zobrazit bez ID | Gap přijímá jen prázdný text/IDs; lokalizované odmítnutí vytvoří server. Supported vyžaduje platná IDs a homogenní druh podpory. Provider regrese a live guardy PASS. |
| Docker bootstrap používal pouze extraction validator | Střední: nový seed by neprošel skutečným startem | Union dispatcher se zachovanými cache kontrolami; syntetické testy i skutečný fresh/upgrade/repeat PostgreSQL bootstrap PASS, 0 API volání. |
| Auditní kategorie duplicate zahrnovala nový kontext a překonané domněnky | Nízký pro odpovědi, podstatný pro přesnost auditu | Po vzorku 40 zpráv přečteno všech 400; 127 pravých duplicit, 81 used, 130 excluded, 62 insufficient. Obsah i runtime bundles144 zcela stejné. |
| Verifikace release artefaktu původně důvěřovala upravitelnému manifestu | Střední pro identitu testované verze | Očekávaný SHA a commit, úplný inventář, zákaz dalších zdrojů/secrets; nezávislý recheck opravy čistý. LFS hydratace je explicitní a ověřená OID. |

Závěrečné obsahové review 144 jednotek a runtime/tooling review jsou čisté. Evidence skutečné generace zachovává původní `positive-07` invalid-response i úspěšnou omezenou reprodukci a klientský průchod; nejde o přepsání prvního výsledku. Guard18 pouze abstinuje, vysvětlení rozdílu herní profil/členství je neúplné. Úplná sada měla 2896 PASS / 5 SKIP / 2 přípravné FAIL; oba přesné izolované reruny PASS beze změn aplikace/testů/timeoutů. Build, izolovaná integrace, skutečný DB a UI průchod prošly. Před nasazením byla navíc opravena reprodukovaná chyba bootstrapu po expiraci, s 22/22 unit testy ve Windows i finálním Linux tools image, skutečným PostgreSQL proof a nezávislým ACCEPT. Produkční switch c82 game + d05 tools byl potvrzen 3.11.2026; schema3, správné heady, všechny původní i nové sourceVersions/cache a skutečná odpověď byly ověřeny, importní embeddingy0.

## Design Notes

Samotná regex extrakce nebo párování sousedních zpráv neudrží kontext. Přímý import chatů ani maskování kurace jako oficiální extrakce nejsou přijatelné. Zvolena offline kurace s homogenními evidence units; stávající vektorové úložiště se rozšíří bez druhé databáze. Přehled témat bude odvozený čitelný výstup, nikoli duplicitní retrieval obsah.

## Verification

- Cílené Python unittest a TypeScript testy podle task scopes, syntetické fixtures bez osobních údajů.
- Stabilní checkpoint: `pnpm test`, `pnpm build`, `pnpm test:integration`, reálné DB migrace a placená eval jen s konkrétním rozpočtem a vlastním validačním oknem.
- Nezávislé review vlastního diffu a všech accepted položek; praktická kontrola Crazy Typky CZ/EN, expirace a komunitního označení. Skutečné výsledky a omezení do samostatné evidence před integrací.
