# V3 dokumenty, embedding profil a citace · KEY-67

Tato základní komponenta přidává validovanou reprezentaci automaticky extrahovaných dokumentů. Nezapíná sama crawler, SQL migraci nebo archivní chat. Legacy v2 validátor, jeho stávající profily a výchozí chování zůstanou beze změny. Priority router z PR35 se nemění.

## Importní graf a kompatibilita

Nový čistý browser-safe `shared/rag-provenance.ts` obsahuje `PublisherId` pro silicon-hill/suz/su/cvut, SourceSpan, CitationLocator a extrakční metody. Nemá Node/DB/katalog/fetch závislosti. Nový serverový listový `server/rag-knowledge-types.ts` převezme dosavadní legacy KnowledgeDocument/Chunk/RawChunk/Topic/Authority **bez změny tvaru**; původní retrieval modul je reexportuje a zachová svůj validační kód. Embedding adapter již nebude brát typ z retrieval enginu. V3 validator nebude importovat store, embedding adapter ani retrieval engine.

V3 typy lze stavět vedle legacy typů ve stejném listovém modulu. Pro společná metadata použít stávající názvy `authority`, `checkedAt`, `reviewAfter`, `effectiveFrom/Until`, author/license/licenseUrl, sourceUpdatedAt, documentDate, authorityLevel a versionNote. Katalogový `publisher` se na `authority` mapuje na vstupu, není nutné přejmenovávat všechny dnešní čtenáře. V3 authority má čtyři hodnoty, legacy KnowledgeAuthority zůstává původní dvojice. Nová společná projekce pro store/runtime přijde v jejich následném scope; nevzniká druhý vyhledávač.

## V3 dataset

- `KnowledgeDocumentV3`: schemaVersion 3, stabilní logické id, sourceVersionId, společná metadata uvedená výše, status current/archived, archiveReason nullable, extraction metadata. Metadata extraction nesou inputSha256, normalizedSha256, parserProfileId, parserProfileSha256, format, method, complete:true a skutečný pageCount nebo null. Metody musí rozlišovat native/layout/ocr/mixed/openai, aby nový PDF převod nepředstíral čistě nativní text. Samotné lidské parserProfile.id dnes není fingerprint: validace vůči očekávanému profilu musí zahrnout kanonický hash úplného descriptoru včetně packages/pipeline/configurationHash/modelManifest/tokenizer. Tento processing fingerprint se nesmí zaměnit za samostatnou cache placeného OpenAI přepisu před normalizací/chunkováním.
- `KnowledgeBlockV3`: id, sourceId, sourceVersionId, kind, text, headingPath a spans; u tabulky také tableChunking:{contextLineCount,headerLineIndexes}. Stránka/bbox jsou nepovinné fyzické locatory, nikdy se nevymýšlejí pro DOCX/HTML.
- `KnowledgeChunkV3`: schemaVersion 3, id, sourceId, sourceVersionId, text, headingPath, tokenCount, blockIds, spans, contentSha256. Ručně vytvořená keywords ani jedna z patnácti původních topic kategorií nejsou podmínkou plného automatického importu.
- `KnowledgeDatasetV3`: version 3, documents, blocks, chunks. Může popisovat současné i historické verze; nejvýše jedna current verze stejného logického zdroje. Blokové/chunkové identity jsou jedinečné **uvnitř sourceVersionId**, ne nutně napříč historií. Stejný stabilní chunk ve dvou archivních verzích je přípustný.

sourceVersionId vypočítá Node z explicitní kanonické preimage bez samotného ID; zahrne logickou identitu, metadata, raw/normalizovaný obsah a relevantní provenance. Publikované verze jsou neměnné. Textový hash a pořadí mají jedno definované schéma; výpočet se nesmí lišit mezi builderem a validátorem. Nevyřešená platnost nebo nekvalitní extrakce zůstává draft v orchestrace, není publikovaným v3 dokumentem.

## Vstupní validace

Nový `server/rag-document-contract.ts` poskytne validaci úplného worker výsledku vůči očekávanému sourceId/raw SHA/parser profilu, validaci v3 datasetu a builder pravdivé veřejné citace. Přesné exporty předá autor před zapojením SQL/orchestrace. Výsledek validace je izolovaný, neměnný objekt; caller nemůže pozdější mutací obejít kontroly.

Kontrolovat hranice všech polí a souhrnné velikosti, úplnost, existenci blokových vazeb ve stejné source version, unikátní composite IDs, přesné content hash, well-formed Unicode bez NUL, datumy a intervaly, konečné bbox hodnoty a rozměry, skutečný počet/rozsah stránek a validní locatory. Žádné tiché ořezání na původních 800 znaků. Chunk tokenCount má být skutečný výstup připnutého worker tokenizeru a v jeho mezích; Node navíc nezávisle ověří tvrdý byte limit celého `[title, headingPath, text]`. Pouhé deklarované tokenCount se nesmí vydávat za nový nezávislý tokenizer proof.

Publikace musí pokrýt každý neprázdný blok a přesně ověřit vztah textů. První profil má podle dnešního Chunker jeden blockId na chunk; parciální nebo víceblokové slučování není publikačně podporované, dokud nedostane explicitní transform/provenance profil. U netabulkového bloku concatenace jeho chunků v producer pořadí rekonstruuje přesný text. Toto pořadí SQL uloží jako ordinal. U tabulky je tableChunking povinné: 0-based headerLineIndexes jsou jedinečné, seřazené, mimo počáteční contextLineCount a v mezích skutečných řádků. Každý chunk opakuje přesný kontext+hlavičky, zbývající body řádky společně rekonstruují původní body včetně multiplicit. Nepoužívat substring, odhad počtu prefixových řádků ani kvadratické hledání. Table lineage patří do normalizačního hash preimage; nemění samotný embedding vstup.

status:ok a complete:true jsou nutné, nikoli univerzální důkaz věrnosti. Refusal, review-required, neúplný parser a nezpracované části se tímto validátorem nesmí převést na publikaci. Strukturovaný OpenAI PDF candidate je před normalizací/quality vrstvou jiný typ.

Oddělit strukturální čtení worker envelope/discovery od kontroly způsobilosti k publikaci. Skutečný SÚZ hub zachoval všech 20 přílohových odkazů, ale jeho textový výsledek skončil review-required kvůli třem partner logům v main. Bounded odkazy z ověřeného HTML/feed výsledku mohou sloužit jako návrhy pro katalogovou discovery politiku i bez publikačního souhlasu celého rodiče. Tento stav nesmí znamenat úplnost discovery ani povolit indexaci neúplných bloků. Bez odpovídajícího raw SHA/profile nebo platné struktury se nepřevezmou ani odkazy. Přesné oddělené exporty autor předá před orchestrace.

## Jediný zdroj URL pravidel

Současný `shared/data/rag-publishers.json` je inventář včetně auth/social hostů, nikoli citační allowlist. V3 používá čistý `shared/rag-citation-policy.ts` a generovaný `shared/data/rag-citation-policy.json`, vytvořený z verzovaného katalogu pouze z public seedů a jejich již schválených page/document/attachment rozsahů. Neudržovat ručně druhý nezávislý seznam oprávnění. Nový explicitní generator `scripts/rag-build-citation-policy.ts` a parity test svážou artefakt s katalogem/hash a vyloučí authentication/needs-policy-review/asset-directory vstupy.

Povolit přesné schválené URL a cesty pro daného publishera; kontrolovat credential-free HTTPS, hostname, port, path decoding, zakázané endpointy a query. Hostname s /Login, /budgets, edit akcí nebo tokenem nestačí. Historické `rev` je možné pouze v konkrétním schváleném wiki pravidle. Žádné suffix wildcardy. Generator nesmí rozšířit katalogovou politiku; relevantní shoda je behaviorálně otestovaná na povolených i zakázaných příkladech.

## Veřejné citace

V `shared/crazy-typka.ts` pojmenovat dosavadní source jako LegacyCrazyTypkaSource a ponechat jeho validační větev přesně beze změny. Nová větev má adaptation:document-extraction, publisher, sourceId, sourceVersionId, status current/archived, effectiveFrom/Until, extractionMethod, documentFormat, pageCount a locators; společné title/url/checkedAt/author/license zůstávají. Formát a počet stran se přebírají z validovaného dokumentu, neodhaduje je URL. PDF má kladný pageCount a page locatory v jeho mezích; ostatní dnešní formáty mají pageCount null a pouze textové locatory. Veřejné id v3 je verzově specifické (např. sourceVersionId), aby dvě archivní verze nesplynuly dnešní deduplikací podle id.

V3 větev kontroluje public URL politiku a shodu publisher–URL, datumy, metodu, locatory a rozsahy délek. UI zobrazení archive označení přijde až v runtime scope; tento foundation sám žádné v3 odpovědi nevydává. Nesmí se tvrdit curated-paraphrase pro automatickou extrakci.

## Neměnné embedding profily

`EmbeddingInputVersion` rozšířit o title-heading-text-v2. `createEmbeddingProfile({model?,dimensions?,inputVersion?})` ponechá omitted inputVersion=v1 a původní default text-embedding-3-large/3072. Původní hashovací tuple a všechny legacy IDs zůstanou byte-for-byte stejné.

Dosavadní documentEmbeddingInput(legacyChunk) zachová přesný výstup. Nový explicitní vstup pro v2 serializuje přesně `[title, headingPath, text]` a odmítá nesoulad reprezentace/profilu. Page/bbox, datum kontroly a parser ID se do embedding textu nedostanou. Nová profile validace rozpozná obě neměnné verze; staré cache položky se nepřepisují ani nepřeznačují. Store jejich nové využití zapojí v následném scope.

## Ověření a předání

Regrese: staré IDs/serializace identické; v2 stále odmítne archiv, jiné autority a text nad 800 znaků; v3 přijme delší platný text; metadata/spans-only změna nemění embedding vstup; heading/text změna mění hash; cizí source version/block reference odmítnuta; neúplný worker výstup odmítnut; auth/social inventory není citace; dvě archivní verze mají různá citační IDs a mohou sdílet stabilní chunk ID; policy generator nevytvoří rozšířená oprávnění.

Předání obsahuje cílený refaktoring, významné cílené Node testy, strict TypeScript a přesné exporty pro navazující implementace. Žádná SQL migrace, API volání, key file, instalace, fullsuite/build nebo změna runtime/routeru v tomto scope.
