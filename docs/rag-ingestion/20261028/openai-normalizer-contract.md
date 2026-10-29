# Offline normalizace OpenAI PDF kandidáta · KEY-67

Vstupem je celý původní PDF soubor a již potvrzený strukturovaný kandidát z bounded Node adaptéru. Tento krok nevolá model, nemá klíč ani síť a nevybírá obsahové pasáže. Výstup používá stejný ExtractionResult/Chunker jako lokální formáty, včetně explicitní tabulkové lineage.

## Rozhraní

Nový `python -m strahov_rag_ingestion.normalize_openai --request ABS_JSON --output ABS_JSON`. Request schema1 obsahuje původní ExtractionRequest v poli `document`, dále candidatePath, candidateSha256 a expectedProfileId. Všechny cesty jsou absolutní, výstup jen ve výlučném workDir; stejné atomické no-overwrite a bounded process pravidlo jako současný worker. Vstupní soubor, PDF SHA/počet stran a kandidatní rawSha/profile/stránky se před převodem ověří. Celý kandidát se znovu strukturálně validuje, nikoli slepě důvěřuje příponě nebo Python bool jako integer.

Source ID/URL/title přicházejí z důvěryhodné Node orchestrace, nikoli z modelu. Modelová page1..N jsou skutečné stránky ověřeného plného PDF. Tento první scope nepřidává page batching ani offsety a nevymýšlí bbox. Obsah zachová původní jazyk a přesný text; žádné generované souhrny, překlady nebo opravy faktů.

## Normalizace a profily

Textové bloky mapovat na stávající text/list/header/footnote/caption druhy, bez přidávání neexistujících bulletů. První explicitní heading profil používá aktuální skutečný nadpis; úroveň se z modelového kandidáta, který ji nenese, nevymýšlí. ID mají stejný deterministický princip jako současný worker a nezávisí na fyzické stránce nebo čase.

Tabulky znovu ověří rozměry, buněčné obdélníky, úplné pokrytí a deklarované hlavičky. Znovu použít současný serializer, včetně sloučených buněk, caption/notes a tableChunking. Případné malé rozšíření serializeru o explicitní header row override je přípustné, aby row-level metadata OpenAI nezměnila význam při převodu na cell-level příznaky. Default Docling chování zůstane stejné; nepřepisovat HTML/PDF/DOCX pipeline. Nezavádět druhý tokenizer nebo kopii tabulkového chunkeru.

Výsledný parserProfile musí pravdivě identifikovat openai normalizaci a v configurationHash vázat její implementaci, celý API profile/observed model, tokenizer a relevantní request/chunk nastavení. Node v3 metoda je openai, nikdy native. Profil normalizace je oddělený od cache placeného kandidáta, takže změna velikosti chunků nevolá model znovu.

Konečný WorkerEnvelope je kontextový: cache se váže také na sourceId, sourceUrl, title, MIME/charset a filename hint. Pouze původní blob a samotný context-free OpenAI candidate lze sdílet napříč dokumentovými kontexty podle jejich SHA/profilu. Žádná nová síťová nebo trvalá cache není součástí tohoto offline komponentového scope.

## Kvalita a publikace

Unresolved položky, neúplné stránky, chybná struktura, překročený limit nebo ztracený číselný/textový obsah jsou explicitní review/failed stav. Porovnání s dostupnou nativní textovou vrstvou nesmí zaměnit běžné rozdělení slov či sloupce za důkaz vynechání; ani validní JSON není důkaz fidelity. Implementátor předá přesný měřitelný konzervativní gate před jeho použitím. U image-only PDF není nezávislá nativní reference: první scope ho označí review-required a zachová celé bloky/chunky, místo domnělého automatického souhlasu. Pozdější prověřený source/profile quality postup patří orchestrace, ne skryté true přepnutí v normalizeru.

Pilotní screenshot zůstává ilustrativním stavem formuláře. Jeho datum21.10.2026 se nesmí interpretovat jako dnešní termín nebo stav účtu; tento kontext ponese navazující dokumentová metadata/quality politika. Limitovaný úspěch dvou API případů není univerzální souhlas k publikaci dalších skenů nebo tabulek.

## Ověření

Syntetické fixtures: úplná víceřádková tabulka s nepočáteční hlavičkou, spans, caption/footnotes, česká negace/čísla, duplicated blocks a stabilníIDs, source/context/profile/hash mismatch, špatný počet stran, nereprezentovaný obsah, review vs publication, token/byte cap, timeout/no-overwrite a zákaz sítě. Původní HTML/PDF/DOCX/table regrese zůstanou zachované. Malé skutečné normalizační probe mohou číst oba již uložené kandidáty z `.cache/rag-auto-pdf-validation-20261028/`, ale nesmějí API opakovat ani měnit jejich ledger.

Žádné staging/commit, paid API, klíče, instalace, DB, fullsuite/build/GPU/port. Handoff obsahuje přesné CLI/typy, refaktoring, cílené testy a omezení kvality. Publikační status celého KEY-67 se tímto nedokončuje.
