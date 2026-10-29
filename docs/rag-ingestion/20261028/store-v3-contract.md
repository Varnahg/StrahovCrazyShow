# V3 publikace a společné pgvector view · KEY-67

Rozhodnutí vychází z čtecího auditu skutečného schema/store/ingest/CLI, [v3 kontraktu](document-v3-contract.md) a zachování provozního legacy indexu. První částečný automatický import nesmí zahodit dosud nepřevedené znalosti. Tento scope nepřidává crawler, runtime wiring ani placené API.

## Přechod a kompatibilita

Porovnány: okamžitá náhrada legacy headu; předběžný převod všech starých parafrází do nového profilu; vedlejší current v3 head se společným view. Volíme poslední možnost, protože zachová existující cache i nepřevedené zdroje a umožní postupnou náhradu. Zůstává jediný pgvector store, společné profily/cache/attempt infrastruktura a původní přesný cosine způsob vyhledávání. ANN změny nejsou součástí tohoto checkpointu.

Původní `captureActive/search/assertCurrent` nad `public` zachová legacy typy a chování. Nové `captureSearch/searchSnapshot/assertSnapshot` vytvoří společné view. Jediný query vector lze sdílet jen při stejné provider/model/dimensions; rozdílný dokumentový inputVersion je přípustný. Nekompatibilita se odmítne před placenou query nebo importními embeddingy, ne tichým přeskočením korpusu nebo druhým placeným dotazem.

## SQL a migrace

Staré řádky a v1 membership/cache zůstávají. `rag_revisions` získá data_schema_version(default2), collection(defaultcurrent), expected_blocks(default0). Nové immutable document_versions/blocks/chunks a revision_documents/revision_document_chunks používají source_version_id v composite klíčích; current dovolí nejvýše jednu verzi logického zdroje, archive více. Nové heads jsou `public-documents` a `public-archive`; původní public se zachová. V3 metadata nejsou důvodem oslabit původní dvouinstitucionální constraint legacy source table.

V3 guardy kontrolují celé dokumenty, očekávané počty/vazby, current/archive příslušnost a neměnnost ready revize. Legacy větve původních guardů se nezmění. Nová migration evidence obsahuje verzi/checksum/čas. Migrátor pod advisory lockem spustí původní bootstrap jen do prázdného schématu, převezme známé v1 a aplikuje nové migrace atomicky po jednotlivých verzích. Při novější/neznámé verzi, chybějící migraci nebo checksum nesouladu skončí chybou. Bezpodmínečný replay starého bootstrapu nesmí vrátit nové triggery.

ACL se zachovají, nové objekty neotevírat PUBLIC. Názvy runtime/ingester rolí poskytne explicitní důvěryhodná administrační konfigurace/CLI; nevymýšlet je z domněnek. Případné dynamické SQL identifikátory přísně validovat a citovat. Skutečné grants a migrace se ověří později v izolované testovací DB, ne automaticky v existující paid cache.

## Snapshot a vyhledávání

`KnowledgeScope` je current nebo archive s volitelným explicitním kanonickým ISO `asOf`. `RagHeadRef` nese name/revisionId/profile. `RagSearchSnapshot` obsahuje hash přesného scope a relevantního head setu včetně nepřítomných heads, tyto refs a společný embeddingSpace(provider/model/dimensions). `RagSourceDependency` je dvojice head + sourceVersionId. `RagSearchHit` vrací EvidenceKnowledgeChunk, dependency a distance.

`captureSearch(scope,signal?)` čte head set atomicky. `searchSnapshot(snapshot,queryVector,{authority?,limit,now},signal?)` pro current spojí způsobilé legacy a v3 řádky pomocí SQL UNION ALL, filtruje před společným cosine ORDER/LIMIT. Nové view nemá ručně vyplňovaný topic filtr; staré API jej zachová. `assertSnapshot(snapshot,dependencies,now,signal?)` zkontroluje stejný relevantní head set a stále použitelné konkrétní verze. Vznik nového relevantního headu rovněž invaliduje starý snapshot/replay.

První archive scope používá pouze public-archive. Nejde o automatický fallback do historie ani implicitní rozšíření o současný korpus. Bez asOf lze vrátit jasně archivní záznamy s přiznanou účinností; s asOf se tvrzení o tehdejší právní účinnosti opře o doložený interval. Pro archivní asOf vyžadujeme obě známé hranice; unknown interval není důkaz účinnosti. Administrativní čerstvost se vždy posuzuje proti now, nikoli asOf. Případné zahrnutí dodnes platných dokumentů do historického view bude samostatné explicitní rozšíření.

## Změnová publikace a nahrazování

Výchozí import je změnová sada s očekávaným base snapshotem, úplnými upsert bundles, explicitními retireSourceVersionIds a legacy replacements. Pod stejným importním lockem zachová nedotčené členy předchozí publikace. HTTP chyba není retirement. Před přepnutím headu musí být každý nový dokument úplný a všechny potřebné vektory potvrzené. Nezměněné přesné embedding vstupy použijí existující persistentní cache; nejasné pokusy se automaticky neopakují.

Legacy náhrada je explicitní manifestová vazba, nikoli rozhodnutí podle vítězného chunku konkrétního dotazu. Nová vazba musí odkazovat na úplnou v3 verzi dané publikace a přesnou existující legacy verzi. Po přijetí se suppression přenáší dál i při expiraci nebo explicitním retirementu nové verze: stará parafráze se nesmí sama znovu objevit. Obnovení legacy vyžaduje explicitní rollback vstup, například restoreLegacySourceVersionIds. Nová legacy publikace se stejným logickým source ID nesmí nevědomě obejít toto pravidlo jen změnou administrativní metadata verze; přesný guard/explicitní policy autor doloží před dokončením.

Reuse současného cached/uncertain/startAttempt/completeAttempt/failAttempt mechanismu. Legacy prepareRagCorpus musí explicitně vyžadovat title-locator-text-v1; po rozšíření obecného validatoru nesmí pod v2 profilem stále serializovat původní locator text. Nový dokumentový import vyžaduje title-heading-text-v2. Žádné přeznačení staré cache.

## Evidence projekce a ověření

Foundation dodává ResolvedKnowledgeChunkV3/EvidenceKnowledgeChunk a resolveKnowledgeChunkV3. Modelové sourceIds v3 jsou verzově jedinečné `v3-` +SHA256([sourceVersionId,localChunkId]); lokální chunk ID zůstává zvlášť. Projekce není náhradou validace zdrojových dokumentů/chunků a nepotřebuje široké casts. Runtime následně upraví total evidence budget, archivní final clock guard a composite replay dependencies ve svém vlastním scope.

Povinné regrese: migrace bez ztráty legacy/cache/ACL a bez replay downgrade; rollback chybné migrace; v1-only legacy import; první v3 import zachová nepřevedený legacy; explicitní náhrada/expiry/retirement/rollback bez nechtěného návratu starých dat; dvě archivní verze se stejným local chunk ID; current bez archive úniku; asOf versus now; 304/metadata-only/stránka bez nových embeddingů na importní hranici; jediný změněný vstup; incomplete dokument a uncertain pokus; profile-space konflikt před API; head set invalidace.

První implementace má pouze fake SQL/algoritmické testy a strict TS. Skutečné PostgreSQL migrační a concurrency testy se připraví, ale spustí až root v odděleném integračním okně se scratch DB a přesným plánem ochrany dosavadního volume.
