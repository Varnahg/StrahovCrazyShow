# Předání: discord-kb-20261103-consolidation

- Vlastník: `discord-kb-20261103-consolidation-agent`; příjemce: `discord-kb-20261103-root`.
- Checkout: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, výchozí HEAD `582a0619d2e2980610ba004ddf7d2cc6903091bf`.
- Scope: pouze `.cache/discord-kb-20261103/consolidation/` a toto předání. Žádný jiný WIP, vstupní partition, serverová KB, katalog či policy nebyly změněny. Bez stagingu/commitu.
- Výsledek po výslovném doplnění root před prvními embeddingy: kompletní integrovatelný **proposal** 144 canonical Q/A (61 verified-official, 83 community-experience). Původních177 kandidátů je nadále samostatně účtováno:143 publish,27 merge,4 hold,3 reject; navíc je1 explicitní pending-derived FAQ. Úplný ledger180 exportů /18 465 zpráv včetně prázdného exportu;16 anket nepublikováno. Předchozí143 checkpoint a jeho freshness equality proof zůstávají zachované jako historie. Vlastní scope byl pro každé výslovné pokračování znovu claimnut s doloženým adopt-dirty tohoto předání.
- Nejnovější pokračování: individuálně přečteno a překlasifikováno všech400 původních `duplicate` zpráv ze41 exportů. Obsah a source metadata144 jednotek jsou beze změny, nové jsou pouze private dispositions/provenance a všech144 review receipts. Veřejné soubory ani runtime/embeddingy nebyly změněny.

## Výstupy

Všechny níže uvedené soubory jsou v `.cache/discord-kb-20261103/consolidation/`:

- `canonical-proposal.json`: veřejně bezpečný přesný kontrakt compileru; bez raw IDs, jmen autorů, soukromých kontaktů či názvů exportů.
- `final-ledger.json`: úplný soukromý ledger; itemIds vždy míří na existující canonical `.id`.
- `review-manifest-proposal.json`: skutečné peer identity z root reviews, hashe přesného výsledného obsahu a receipts přes exportované helpery. Jde o mechanické zapracování doložených peer rozhodnutí, **ne tvrzení o novém nezávislém review hotové konsolidace**. Final root acceptance je stále false.
- `private-lineage.json`: původní claims a zprávy, role soukromého kontextu oproti factual evidence, contributors, skuteční peer reviewers, opravy a canonical content hash. Nebezpečný iwd experiment včetně dvou doplněných raw ID je pouze auditní evidence, ne veřejný návod.
- `candidate-decisions.json`: právě jedno rozhodnutí ke každému ze177 původních kandidátů, včetně důvodu, peer verdiktu a korekcí; nové FAQ je výslovně oddělené v `supplementalPendingDerived` a nemění původní počet.
- `ledger-adjustments.json`: všechny změněné dispositions a přemapování. Případy omezené peer review na konkrétní blok/období již nepoužívají vyřazené zprávy jako podporu; B8 vtip je výslovně excluded.
- `pending-private.json`: 4 held kandidáti a všechny nepřijaté otázky původních partitions; nic z toho není v public datasetu.
- `existing-kb-comparison.json`: explicitní porovnání všech45 legacy chunků a všech56 chunků původní v3 smlouvy; vazby a přidaná hodnota pro každou ze144 Q/A včetně překryvu nové jistoty s `suz-deposit-distinction`. Jde o označení překryvu, nikoli doplnění citace bez důkazu. Pět téměř shodných legacy parafrází je označeno jako kandidát k pozdějšímu sjednocení retrieval reprezentace; žádný původní dokument se nemaže.
- `issuer-activation-decision.json`: skutečné navazující rozhodnutí root o zrušení pěti technických holdů, hash přesného registru curation-only zdrojů, příslušné identity vydavatelů a obsahová omezení.
- `freshness-policy.json`: explicitní metadata politika, intervaly všech 29 dosavadních URL zdrojů ze tří legacy datasetů a původního bootstrap dokumentu, rozhodnutí pro každý supportingRef a termín každé položky.
- `canonical-before-freshness.json`: zachovaný přesný143item checkpoint před změnou pouze review metadat; pouze porovnávací evidence, není výstup k publikaci.
- `embedding-input-comparison.json` a `embedding-input-comparison-freshness-history.json`: zachovaná historická přímá equality i SHA-256 všech143 vstupů před/po změně pouze freshness. Netvrdí shodu nového144item checkpointu.
- `canonical-before-pending-addition.json` a `review-manifest-before-pending-addition.json`: přesný předchozí143item checkpoint po freshness korekci, SHA `f6a95ff94b31ecaf620bb8315694aa82ff8eae38b4a47dacdc6ac809e04a9385`.
- `embedding-input-comparison-post-content.json`: nový obsahový delta proof:142 původních vstupů i content hashes beze změny, změněny pouze blokové hry, přidána pouze rezervační jistota, nic odstraněno.
- `pending-derived-addition.json`: explicitní root autorizace, šest skutečných source otázek, dva původní pending záznamy forum/general, audit-only nejisté odpovědi a dvě položky čekající nezávislý gold review.
- `canonical-ids.json`: aktuální úplný seznam všech144 canonical `.id`, count a dataset hash pro evaluator/gold mapping.
- `taxonomy.json`: sjednocená česká témata; pouze strukturální normalizace.
- `readable-proposal.txt`: přehled otázek, odpovědí, působnosti, omezení, observation dates a primary refs pro root review.
- `consolidate.ts`: historická reprodukce obsahové transformace z pěti peer-reviewed vstupů. Po kompletním message-level auditu je záměrně uzamčen guardem, aby nepřepsal přijatý obsah starými partition rozhodnutími. Pro poslední změnu použít pouze `reconcile-duplicate-ledger.ts`.
- `verify-proposal.ts`: samostatná cílená kontrola opravených sporných případů, coverage, privacy, všech verdictů a úplného KB porovnání.
- `duplicate-review-spec.json`: explicitní rozhodnutí ke všem400 indexům, vázaná na SHA původního ledgeru; žádná výchozí či kanálová heuristika. `review-duplicates.mjs` je čtecí pomůcka včetně forwardů a reply kontextu.
- `duplicate-review-decisions.json`: rozvinutých400 jednotlivých záznamů s původními a novými statusy/canonical odkazy, důvody, skutečným reviewerem a odkazem na přesnou kopii tam, kde byla tvrzena.
- `noise-audit-40.json`: reprodukovatelný původní stratifikovaný vzorek40 zpráv ze27 exportů, seed/metoda, private IDs, anonymizované zjištění a následný finální status po úplném průchodu duplicit. Vzorek není statistický odhad chybovosti všech zpráv.
- `apply-duplicate-review.mjs` a `reconcile-duplicate-ledger.ts`: deterministická aplikace explicitního review nad zachovaným144item checkpointem; nepřepočítává obsah ani čerstvost podle mezitím změněné veřejné KB.
- `ledger-only-identity.json`: všech144 content hashes, skutečných sourceVersion/input identities a celých bundles beze změny, shoda se skutečným veřejným bootstrapem, veřejné file hashes před/po.
- `*-before-duplicate-audit.json`: původní canonical, ledger, review manifest, verification, artifact manifest, lineage a adjustments před novou klasifikací. Zůstávají jako auditní historie.
- `ledger-only-verification.log` a `identity-first-placeholder-attempt.txt`: skutečné výsledky posledních kontrol včetně vysvětlení prvního placeholder-versus-real mismatch.
- `verification.json`, `artifact-manifest.json`, `generation.log`, `validation.log`, `coverage.log`: výsledky a identity artefaktů. Manifest zahrnuje i transformační/ověřovací kód; logy jsou zvlášť.

## Rozhodnutí a důkazy

Vstupy jsou pěti partitions forum/general/blocks/other/news a `.cache/discord-kb-20261103/root/reviews.json`. Root výslovně přijal i následné zpřesnění B9 tisku: poslední podporující provozní odpověď 26. 10. 2026; model tiskárny a poděkování za papír neposouvají datum. Nepodložená věta zpochybňující kopírování je vypuštěna, bez přidání funkční garance.

Sloučení ponechávají relevantní blokové rozdíly a nemění komunitní zkušenost na oficiální pravidlo. Při převzetí oficiálního jádra zůstávají komunitní zprávy pouze soukromým důvodem otázky. Současné H4 klíče / H9–H10 karty sjednocují starší blanket card požadavek. Novější B9 tisk nesplývá se zaniklým RoboCopy. 3D tisk nemá absolutní tvrzení, že nejsou služby. B4 programy vycházejí přímo ze SÚZ. Datum přezkoumání není vydáváno za datum zkušenosti nebo faktického ověření.

Alias AVC je převeden na již schválené `https://avc.sh/`; MacGyver na `https://macgyver.sh.cvut.cz/`, SUZ bare host na www. Supporting refs nyní používají skutečný helper `curationPublisherForUrl`, který preferuje přesný nový curation-only registr. Recharging Bar má issuer `recharging-bar`, nikoli starou associated-site rodinu SH. DATART má `datart`, PID `pid`, 1.LF UK/VFN `uk-vfn`, Klub007 `klub-007`, veřejný Download ČVUT `cvut`. EDU používá právě ověřený přesný veřejný rozcestník `/cs/` s issuerem `silicon-hill`; historické termíny nepřenáší. Žádný jiný URL nebo celý host nebyl povolen tímto agentem; extraction/crawler policy se nezměnila.

Hold zůstává pouze neurčené prádelně z forum, dvěma nedatovaným odchodům s povlečením B4/B11 a nedatovaným smíšeným zkušenostem general-maintenance-status. Pět věcně přijatých zdrojů je po root re-verifikaci a explicitním přesném source grantu znovu zařazeno. Medicínská položka poskytuje pouze kontakt/výukové podmínky bez diagnózy, ceny či příslibu extrakce. Klub007 obsahuje jen programový rozcestník, bez nových event claims; vedlejší historický koncertní název byl odstraněn podle peer review. Reject zůstává: obecný Windows SFC/DISM bez místní relevance, nedatovaný rudl údajně B2, nepodložený tip Sport Bar7.

Kontrola privacy nalezla pouze devět týmových/generických projektových e-mailů; žádné osobní adresy. Raw zprávy nebyly poslány externí službě. Veřejný výstup byl kontrolován na raw Discord IDs/URL a auditní pole. Neproběhla tokenizace, embeddingy, API import ani DB práce.

## Ověření 3. 11. 2026

- `node --import tsx .cache/discord-kb-20261103/consolidation/consolidate.ts`: exit 0; `validateCanonicalKnowledge` a `validatePublicationProof` pass. Oba používají aktuální skutečnou policy a skutečné helpery `canonicalItemContentHash`, `auditLedgerHash`, `reviewReceiptFor`. Všechny vstupní partition hashe po vytvoření stále odpovídají peer-reviewed podobě.
- `node --import tsx .cache/discord-kb-20261103/consolidation/verify-proposal.ts`: exit0;144 jednotek,177 původních rozhodnutí +1 explicitní doplnění,180 exportů,18 465 zpráv,16 excluded polls,45/56 KB comparison. Ověřuje nové dvě jednotky, přesný rozsah obsahových změn, skutečné issuery, aktuální EDU URL, zachování hold/reject a freshness. Dále nesprávné prodlužování observation dates, B8 skutečný reply, role správce, druh karty a nevymyšlený úspěch odemknutí.
- `C:/Users/rezac/AppData/Roaming/uv/python/cpython-3.13-windows-x86_64-none/python.exe -B -X utf8 scripts/discord-kb/audit.py coverage --raw .cache/discord-kb-20261103/raw/corpus-v2 --canonical .cache/discord-kb-20261103/consolidation/canonical-proposal.json .cache/discord-kb-20261103/consolidation/final-ledger.json`: exit 0; expected/classified 18 465, pending 0, expected/reviewed files 180. `python` v PATH byl pouze Windows Store stub; použit existující interpreter nalezený `uv python find`, nic se neinstalovalo.
- Dispositions po přijetí šesti source otázek nového FAQ: excluded12 331; insufficient-context3 564; duplicate400; system849; used1 321.
- **Aktuální dispositions po úplném auditu400:** excluded12 461; insufficient-context3 626; duplicate127; system849; used1 402. Součet18 465, všech180 exportů. Původních400 →81 used,127 skutečných duplicit,130 excluded,62 insufficient-context. Zprávy mimo původní400 jsou deep-equal původnímu ledgeru.
- Nejdelší `knowledgeUnitText` má 807 znaků. Není to měření tokenů; skutečný tokenizer a limit 650 ověří root při compiler kroku.
- Build, celá herní sada, DB a síťový import nebyly spuštěny; pro tento soukromý obsahový scope nejsou jejich výsledky tvrzeny.

## Čerstvost po navazující root korekci

Root obsah143 položek přijal jako základ a výslovně vyžádal opravu pouze kontrolních metadat. Scope byl znovu převzat jako vlastní rozpracovaná práce. Pro každý official supportingRef se ze všech tří legacy datasetů a původního bootstrap dokumentu vyhledá stejný canonical URL; z více historických intervalů se použije minimum. Existující7denní cadence WiFi, SH FAQ, registrací, 3Dtisku, SHerny a provozních SUZ zdrojů se neprodlužuje.

Nové provozní stránky, kontakty/přístupy, hodiny a rezervace mají7 dnů; stabilní předpisy/dokumenty a ostatní oficiální podklady nejvýše30 dnů. Hudebny FAQ, sportovní registrace, Rko a Klub007 mají7 dnů. VUP a ceníkové PDF mají30 dnů; obecné rozcestníky PID/Download/EDU30 dnů. Některé staré kontrolní termíny vyjadřovaly kalendářní měsíc délky31 dnů; nové explicitní maximum30 dnů je konzervativně zkracuje, nikde neprodlužuje. Provozní leták prádelny je kontrolován po7 dnech, i když jde o PDF; nejde o stabilní normativní předpis.

SupportingRef deadline se počítá od jeho skutečného nového `factCheckedAt`, nikoli od libovolného dalšího review nebo dne dotazu. `item.reviewAfter` je nejdřívější supportingRef deadline. Komunitní jednotky zůstávají na90 dnech od `reviewedAt`; tím se z nich nestává fakticky ověřená zkušenost. Výsledkem je41 official items s deadline2026-11-10,19 official s2026-12-03 a83 community s2027-02-01.

Po opravě znovu prošel celý skutečný TS gate, cílené cadence assertions i Python coverage180/18465. Přesný compiler vstup `JSON.stringify([question,[topic],knowledgeUnitText])` byl u všech143 IDs porovnán string equality a hash před/po. Žádný embedding vstup, otázka, odpověď, alias, působnost, observation date ani source issuer se touto opravou nezměnil. Receipts a manifesty byly přepočteny; ledger hash zůstal stejný. Neproběhla tokenizace ani embedding/import.

## Dvě obsahová doplnění z nezávislého gold mapování

Root následně výslovně zadal obnovení informace, která se ztratila sloučením: `block-games-introduction` nyní také říká, že účast na všech hrách není povinná a některé lze vynechat. Podpora je v části „O co jde“ oficiální wiki Blokových her; root i kurátor ji znovu přečetli. Ostatní podmínky a termíny této jednotky se nemění.

Nové `suz-rezervacni-jistota` odpovídá na skutečné dříve pending otázky, nikoli na vymyšlené eval téma. Přečteny otázky z1.7.2024,20.7.2024,8.9.2025,28.6.2026 a30.6.2026 včetně okolních odpovědí. Historické rady o automatickém přehazování peněz zůstávají pouze auditním kontextem. Jedinou veřejnou primární podporou je aktuální Ceník náhrad od1.9.2026, strana1: rezervační jistota5 000Kč, ubytovací jistota30násobek denní sazby. Ceník byl3.11.2026 znovu otevřen a řádky ověřeny rootem i kurátorem. Žádný slib automatického převodu, posouzení osobního účtu ani podvojné platby se nepřebírá. Přesné původní otázky a dva pending záznamy jsou v privátním supplementary reportu. Osobní účtování zůstává neověřené i po doplnění obecného tarifního FAQ.

Nová jednotka má30denní kontrolu do2026-12-03; nynější počty jsou41 official s2026-11-10,20 official s2026-12-03 a83 community s2027-02-01. Všech142 ostatních existujících jednotek zachovalo přesný embedding input i content hash; všechny receipts byly přepočteny kvůli změně ledgeru. `candidate-decisions.json` obsahuje původních177 rozhodnutí a nové doplnění odděleně. Předání144 checkpointu nezávislému gold reviewerovi `chat_corpus_audit` proběhlo; jeho review a konečné root přijetí nejsou tímto handoffem předstírány.

## Úplná oprava message-level klasifikace duplicit

Root po původním40message vzorku výslovně zadal přečtení všech400 duplicate dispositions. Každá byla skutečně přečtena, včetně dlouhých opakovaných pozvánek, forwardů a potřebných navazujících zpráv. Konečné rozdělení rozlišuje skutečné opakování již přijaté otázky/tvrzení, nový podpůrný kontext, překonanou či nevhodnou domněnku a neověřený detail. Pure datumové připomínky, osobní domluvy, poděkování a neověřené konstrukční rady již nejsou označeny jako duplicity věcných odpovědí. Původní data a odpovědi se nemění.

Byly opraveny i konkrétní private reference: kontaktní postup B6 místo povolení vrtání; žádosti o nářadí místo pouhé polohy Bastlírny; síťová podpora místo prvotní registrace; půjčování hudebního vybavení místo vstupu do zkušebny. Neznámý blok u zabouchnutého klíče není důkazem případu B10. Vyřazená stará domněnka o tiskovém automatu B3 nefiguruje jako duplicita novější tiskárny B9. `retainedSourceMessageIds` obsahují jen aktuální used/duplicate vazby, zatímco celé původní kontexty zůstávají výslovně historické/private.

`reconcile-duplicate-ledger.ts` provedl před zápisem skutečný contract/proof gate, kontrolu všech400 rozhodnutí a přesnou shodu všech ostatních ledger řádků. `compileKnowledge` před/po vytvořil deep-equal bundles. První pokus s placeholder tokenCount1 prošel symetrickou before/after shodou, ale správně neodpovídal reálnému sourceVersion veřejného bundle: normalizovaný hash obsahuje tokenCount. Následná silnější kontrola proto použila již skutečně změřené veřejné token counts, **výhradně po přesné shodě serializovaného embedding vstupu**; žádná nová tokenizace ani API. Všech144 skutečných sourceVersion IDs, input SHA a celé bundles se shodují i s veřejným bootstrapem. Rootův nový skutečný compile zůstává jeho integračním krokem.

Veřejné cesty změněné tímto agentem: žádné. SHA-256 veřejných runtime vstupů před/po:

- `server/data/rag/bootstrap-documents.json`: `2902871c07ebb8a9f3cab7e23d99ab4b93918c688f20ac1d955b1b7726de10cf`.
- `server/data/rag/bootstrap-cache.json`: `c25d1a915d0b6ad728d663872e01ac3136ce58138780e6506fe6365bd8877f9a`.

Poslední cílené ověření proposal a nezávislý Python coverage znovu prošly. Žádná migrace, DB zápis, embedding, runtime import, build nebo dlouhožijící proces neběžel. Doplněný read-only identity výsledek dostal i nezávislý packaging reviewer `chat_corpus_audit`.

### Přiznaný koordinační incident

Při prvním obnovení tasku pro tuto opravu claim selhal, protože definice měla status done. Dávkovaný shell bohužel pokračoval dalším příkazem; v **2026-11-03 10:35:19 UTC** vytvořil pouze pět vlastních auditních kopií canonical/ledger/verification/review-manifest/artifact-manifest s příponou `-before-duplicate-audit.json`. Žádný existující ani cizí soubor se nezměnil. Incident byl ihned oznámen rootovi a další zápisy zastaveny. Root přepnul task na ready a až po následném úspěšném claimu pokračovalo review a implementace. Kopie byly zachovány. Následné koordinační nativní příkazy mají explicitní kontrolu `$LASTEXITCODE` a při neúspěchu vyvolají chybu před dalším zápisem.

## Identity a převzetí

| Artefakt | SHA-256 |
| --- | --- |
| raw source inventory | `c8afca9ef53c5d8cac6031fc926abcebfc73f59922c8fc1f9bf965df2f549e40` |
| canonical-proposal.json (změněny pouze receipts) | `e448c54d93300805371c24b781110a0cfd3d2c5302e9778b9fa8c3e910fd9d2c` |
| canonical JSON ledger hash přes helper | `1f965055771a25103af1c03588ef6d1617f797444b33fe9900ddbd01524c21e4` |
| artifact-manifest.json | `25a4bceded443a8cc7bd55be9323b7024974c94a71848f2aef25990b1bb6afef` |
| duplicate-review-decisions.json | `d89603c1f9f3199f29efee0201a971d2e42664fd168347ffc0d1595afdcbc6cb` |
| noise-audit-40.json | `5b850cccb7f5182dfad895aacace249de76344e08a02ffa943df9df6f3b33c2a` |
| ledger-only-identity.json | `2d3a341481583778374e94d6eaf53a4811df4b0a3b3a95c69881494ea9f18f4f` |

Root provede skutečné závěrečné přijetí znění a případné úpravy. Po úpravě musí znovu přepočítat content hashes, review manifest a receipts přes helpery; původní receipt se nesmí přenášet na změněnou odpověď. Pak tokenizer/compile, missing-input report před paid importem a navazující evaluace. Soukromé lineage/ledger/reviewer údaje nepatří do veřejných serverových dat.

Refaktoring konsolidace: jednotná deklarace amend/merge/hold/reject, deterministické přemapování canonical IDs, centrální URL canonicalizace bez wildcard grantů a jednotná normalizace témat. Procesy jsou jednorázové a skončily; žádný port, GPU ani pomocná služba nezůstává. Rezervace bude uvolněna po tomto předání; integrátor převezme scope a nastaví stav tasku.
