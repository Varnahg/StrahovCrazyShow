# Předání: rag-auto-20261028-extraction

- Vlastník: `rag-auto-extractor-01a17e9d`; příjemce: koordinátor `/root`, KEY-67. Koordinátor smí převzít zde doložené vlastní WIP. Žádný commit jsem nevytvořil.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/automated-document-rag`; base `5eebe2b043a088222b8160fabb7eefbbc3a36e80`.
- Výsledek: funkční samostatný Python worker a robots helper, pinovaný CPU profil, skutečná extrakce lehkých formátů, modelový probe dvou veřejných PDF. **Nejde o dokončenou celou ingest pipeline ani úplnou přejímku standardní PDF větve.** Poslední standardní CLI izolace a syntetická PDF tabulková inference čekají na další rezervované CPU okno; legacy konverze zůstává explicitně unsupported.
- Cizí WIP: žádný převzatý runtime/provider/SQL/CI/katalogový soubor. Před zahájením byly načteny AGENTS, architecture, README koordinace, current-work a BMAD policy, task a kontrakt; ověřeny status/worktrees/živé rezervace. Všechny zápisy jsou v přidělených třech prefixech.

## Soubory

`tools/rag_ingestion/README.md`, `pyproject.toml`, `uv.lock`; `tools/rag_ingestion/tests/conftest.py`, `tests/test_extraction.py`; `tools/rag_ingestion/strahov_rag_ingestion/__init__.py`, `__main__.py`, `chunking.py`, `contracts.py`, `docling_adapter.py`, `io_utils.py`, `model_profile.py`, `models-manifest.json`, `process_runtime.py`, `provision_models.py`, `provision_tokenizer.py`, `robots.py`, `safety.py`, `web_content.py`, `worker.py`; toto předání. Úplný seznam a SHA256 každého souboru včetně testů je v ignorovaném `.cache/rag-auto-extraction-20261028/source-manifest.json`.

Všechny venv, UV/model/tokenizer/temp/cache výstupy, syntetické binární fixtures, originální probe JSON/Markdown a logy jsou výhradně pod `.cache/rag-auto-extraction-20261028/`. Celé cizí dokumenty ani modelové váhy nejsou v Gitu. Bundled interpreter je pouze zdroj Pythonu, bez instalace do globálního prostředí nebo změny herních node_modules.

## Rozhodnutí a implementace

Podklady a porovnání variant: [research](../../rag-ingestion/20261028/research.md), [kontrakt](../../rag-ingestion/20261028/extractor-contract.md), [Docling možnosti](https://docling-project.github.io/docling/usage/advanced_options/), [formáty](https://docling-project.github.io/docling/usage/supported_formats/), skutečné PyPI metadata a nainstalovaný pinovaný zdroj. Čteno 28.10.2026. Docling nativní PDF nemá layout/OCR/tabulkové modely; jeho `SUCCESS` nezaručuje obsah. To reprodukovalo skutečné obrazové PDF s nulovým nativním textem.

Zvolen samostatný Docling Slim worker s vlastním `uv.lock`, nikoli ruční/AI parafráze nebo přenos modelů do herního serveru. Text/CSV/TSV mají striktní deterministické parsery; HTML má obsahovou selekci a discovery před Doclingem, feedy mají bezpečné XML discovery. Základní formáty skutečně ověřené: HTML, nativní PDF, DOCX, XLSX, PPTX, Markdown, TXT, CSV, TSV, ODT, ODS, ODP. Legacy DOC/XLS/PPT/RTF explicitně vracejí `unsupported` / `legacy-converter-unavailable`.

Vstupní hash, skutečný ZIP/OOXML/ODF typ, dekompresní a stránkové limity, XML entity, charset, sledované změny, externí vztahy, vzorce a prázdný/neúplný obsah mají vlastní bezpečné stavy. DOCX coverage porovnává původní textové uzly. PDF/Office kontrolují skutečnou množinu stran/listů/slidů; ODP reprezentuje slidy chapter skupinami, nikoli `doc.pages`. Fyzické strany DOCX se nevymýšlejí.

Tabulky zachovávají konkrétní obdélník buňky a sloučené vazby; každý oddělený řádek nese i aktivní svisle sloučený kontext. Chunkování opakuje hlavičky, caption/poznámky, nerozřezává příliš dlouhý řádek a měří skutečný cl100k_base i UTF-8 bajty přesného JSON `[title, headingPath, text]`. IDs závisí na zdroji, nadpisech, textu a pořadí přesných duplicit; žádný globální index/strana/timestamp. Parser profil zahrnuje verze, tokenizer, fingerprint implementace a při standardní větvi manifest modelů.

Refaktoring oddělil striktní kontrakt/serializaci, bezpečný vstup, strukturu parseru, chunkování, modelový profil a procesní lifecycle. Windows spawn má importovatelný target v `process_runtime.py`. Výstup je atomické výlučné vytvoření pomocí hardlinku, nikoli přepsání předchozího jobu. Předexistující claim/intermediate/output zůstávají zachované. Child zakazuje síť/subprocessy, skryje cizí textové logy, směruje cache pod job a má deadline; ukončuje se pouze vlastní child, který nemůže vytvořit potomky. Produkční OS paměťové/diskové kvóty zůstávají úkolem orchestrace/deploymentu.

Koordinátor samostatně autorizoval lehký Protego helper a rozšíření `parserProfile.tokenizer`. Protego0.7.0 vyhodnocuje RFC9309 wildcard, `$`, longest-match a crawl-delay bez importu Doclingu nebo sítě. Přístupová/HTTP/TTL pravidla zůstávají Node orchestrace. Tokenizer provisioning má pinovaný oficiální URL/hash; runtime při absenci selže před síťovým pokusem.

## Verze a modely

Python3.12.14, uv0.12.3; Docling Slim2.144.0 / core2.105.0 / parse7.24.1; tiktoken0.12.0; Protego0.7.0. Volitelný CPU extra: Torch2.9.1+cpu + torchvision0.24.1+cpu z explicitního `download.pytorch.org/whl/cpu`, EasyOCR1.7.2, docling-ibm-models4.0.4. Zamčeno101 balíčků. Žádný CUDA/GPU ONNX balíček, `torch.version.cuda is None` ověřeno před skutečnou inferencí. Model a parser po1vláknu.

Samostatný koordinátorem držený heavy task `rag-auto-20261028-extraction-validation`, owner `rag-auto-validation-01a17e9d`, povolil instalaci/prefetch a pouze dva skutečné PDF probe. Prefetch7souborů,482986627bajtů. Heron revision `8f39ad3c0b4c58e9c2d2c84a38465abf757272d8`; TableFormer repo revision `fc0f2d45e2218ea24bce5045f58a389aed16dc23`; EasyOCR craft/latin_g2 z oficiálních release URLs, upstream MD5 i vlastní SHA256. Metadata všech7souborů jsou v committed `models-manifest.json`, SHA256 `d5b983cd697a2520ff2246796eb24c58688db89e0d2a608c8de1774eade5f6f4`. Runtime jejich bajty ověřuje před načtením; provisioning je výslovný samostatný příkaz.

`auto` s připraveným `modelDirectory` používá standardní CPU pipeline; bez něj nativní PDF a explicitní quality gate. `standard` bez artefaktů neprovádí download. Standardní PDF tabulky mají zatím `pdf-table-structure-requires-review`, protože v tomto krátkém heavy okně nebyla provedena jejich inference/QA.

## Skutečné důkazy

1. Izolovaná instalace/API: `.cache/rag-auto-extraction-20261028/api-probe-summary.json` a `api-probe.log`. SÚZ smlouva nativně0.453s/1strana/7476znaků; screenshot0.015s/1strana/1obrázek/0textu; SH DOCX1.203s/6tabulek/3575znaků mimo tabulky/2obrázky. To jsou malé probe, ne výkonové optimum.
2. Skutečný modulový CLI tří originálů: `worker-probe3-summary.json`, `worker-probe3.log`, `probe3-job-*/result.json`. Native smlouva141bloků→review pro layout, screenshot0text→review pro OCR, DOCX6tabulek a všechny kontrolované původní texty→review pro2nevyjádřené obrázky v furniture. Studený CLI9.72–9.78s před CPU extras. 141chunků je diagnostický nativní výstup, nikoli doklad dobrého default chunkování smlouvy.
3. Standardní CPU probe: `prefetch-cpu.log`, `standard-probe.log`, `standard-probe-summary.json`, `standard-fidelity-evidence.json`, `*.standard.json`, `*.normalized-standard.json`. Screenshot61.266s včetně cold model init; smlouva6.547s se zahřátými modely. Obě1/1strana, technickySUCCESS. Screenshot má29OCRtextových dětí pod PictureItem,367znaků; výchozí `iterate_items` je zatají, proto adaptér používá `traverse_pictures=True`. **OCR vynechalo zvýrazněné příkladové datum21.10.2026** a rozbilo některé UI labely. Zůstává `review-required`; screenshot není důkaz aktuálního termínu nebo stavu účtu.
4. Smlouva po normalizaci všech vrstev a zachování skutečných ListItem.marker obsahuje54bloků/54chunků/7616znaků včetně separátorů. Proti textové vrstvě pypdf nechybí žádné číselné tokeny. Standardní model zpracoval sloupce do strukturovaných bloků. Nejde o univerzální důkaz všech PDF layoutů.
5. Cílené testy: přímý interpreter `.cache/rag-auto-extraction-20261028/venv/Scripts/python.exe -m pytest tools/rag_ingestion/tests -q -p no:cacheprovider --basetemp=ABS_OWNED_CACHE`. `pytest-run7.log`:27passed/30.41s. Po standard API zapojení, zachování picture textů/list markerů: `pytest-run8.log` **28passed/66.73s**, jeden následně odstraněný fixture deprecation warning. Po poslední cílené opravě: `pytest-run9.log` **2passed,26deselected/73.89s** pro picture/list/missing-model a skutečný modulový CLI + lazyrobots. Testy jsou syntetické a nespouštějí modelovou inferenci.
6. Původní selhání zachována: `worker-probe-summary.json` reprodukuje neimportovatelný Windows spawn target v `__main__`, opravený přes samostatný modul a skutečný subprocess test. `pytest-run2/3/5.log` uchovávají postupně odhalené ODF fixture/API odlišnosti. Nejsou nahrazené tvrzením, že všechny dřívější běhy prošly.

Nezávislý čtecí reviewer našel a následně ověřil opravy: více HTML článků, svislé table spans, feed output limit, nepřevzetí/smazání cizího intermediate; dále ODS formula cache a minimální failure envelope. Všechny mají regresní testy. Závěrečná úzká čtecí kontrola modelového profilu, manifestu, offline/cache izolace a quality gates nenašla další konkrétní P1/P2; nevydává se za chybějící standardní CLI/modelovou přejímku.

## Snapshot, procesy, předání

Zdrojový manifest (20souborů včetně testů/locku/modelových metadat) má SHA256 `67981908158fcac342860cd2cdd33ffed516ce8a37158a803564588ed0c5c1d6`. Viz `source-manifest.json`; obsahové hashe dovolují koordinátorovi ověřit konkrétní převzatý checkpoint bez cizího dirty stromu. Závěrečná kontrola16:38UTC: `uv lock --check --offline --project tools/rag_ingestion` prošla se101balíčky, AST parse všech16Python souborů prošel a opakovaný zdrojový manifest je totožný.

Vlastní instalační/probe/test procesy běžely jen jako přímé ukončené CLI v této pracovní kopii, bez portů. CPU standard probe měl ověřené PythonPID31876/42880; oba skončily a před zprávou koordinátorovi nebyl nalezen žádný Python proces s cache prefixem. Koordinátor dostal výslovné potvrzení, že může heavy rezervaci uvolnit. Poslední cílené testy rovněž skončily; kontrola16:33:47UTC nenašla vlastní Python pomocníky. Žádný cizí proces nebyl ukončen.

Zbývá: rezervované CPU ověření skutečné standardní CLI izolace/offline běhu, syntetická PDF tabulka a český sken s fidelity oracle, případná oprava OCR profilu podle chybějícího zvýrazněného data; samostatná izolovaná legacy konverze; root Node orchestrace/reporting/SQL integrace a odpovídající širší přejímka. Nebyl spuštěn full suite hry, build, image, integrační test, GPU ani placené API. Tento task nedává oprávnění označit114seedů nebo celou KEY-67 hotovou.

Předání a poslední čtecí kontrola jsou uzavřené16:38UTC, vlastní pomocníci ukončeni; následuje výslovný CLI release extraction rezervace pro převzetí koordinátorem. `release` není stavDone. Přijetí tasku, commit/integraci a společné `docs/verification.md` vlastní koordinátor.

## Root checkpoint a následné HTML odlehčení

Root ověřil všech 20 source hashů proti tomuto manifestu a uložil komponentu jako `0ff4209cfbf854066530c8ee4802f3f2ede81770`. Modelový manifest včetně původních CRLF/SHA byl zachován podle byte-preserving `.gitattributes`. Následný accepted-main sync `0f80ac85` neměnil žádný z těchto zdrojů.

Skutečný SÚZ HTML hub z bounded acquisition probe má 45088 B a SHA `c4629e7f1fa683c09e9949b80bc826adae1e145f607aae74c978d703a818dc9f`; uložený je `.cache/rag-auto-20261028/source-probe-9FBMrk/source.html`. Native HTML CLI trvalo 65,8 s, výstup 74 bloků/71 chunků, 1553 znaků, 27 odkazů včetně 20 příloh. Review-required kvůli partner logům je zachované; celkový čas zatím nemá úplnou atribuci. Nejde o důkaz, že se načítaly váhy nebo běžela inference.

Čtecí primární audit našel opakované čtení package METADATA přibližně čtyřikrát na distribuci a obecný DocumentConverter import/backend/factory řetězec i pro HTML. Přímý pinovaný HTMLDocumentBackend přes skutečný InputDocument volá stejnou convert metodu jako SimplePipeline; zachovat validitu, limity, fetch_images=False, celé normalize/quality/chunk guardy a cleanup. Preferovaný úzký kandidát: jediná četba metadat a přímá HTML cesta, bez změny PDF/DOCX, modelových profilů nebo fresh-process lifecycle. Persistentní pool/nové prostředí nejsou tímto automaticky schválené.

Root nyní předává vlastní změnu tohoto handoffu a celý doložený source checkpoint novému příjemci `/root/implement_html_extraction`. Po release převezme task `rag-auto-20261028-extraction` vlastním claimem s adopt-dirty. Úzký kódový scope v rámci původních writePaths: docling_adapter.py, worker.py, odpovídající testy a tento handoff; žádná instalace, modelový download, síť, OpenAI nebo změna modelového manifestu. Před přijetím významné cílené regrese a samostatně koordinovaný bounded A/B/A probe nad stejnými bytes/venv, srovnávající skutečný výstup. Výkonový závěr až podle měření, ne podle importního grafu. Vlastní root helpery již skončily.

## HTML kandidát — 28. 10. 2026, 21:42 UTC

Příjemce `/root/implement_html_extraction` převzal původní task claimem `rag-html-refactor-01a17e9d --adopt-dirty`, pouze předaný handoff byl dirty. Upravuje `docling_adapter.py`, `worker.py`, nový `tests/test_html_backend.py` a tento záznam; žádné staging/commity. Současný nadřazený HEAD se mezitím posunul na `a5ac67d199be1a94ba8d05df16610f857e31e6a9`; jiné změny agent nepřebírá.

Pinované primární API bylo znovu přečteno z existujícího venv: `docling/backend/html_backend.py` (constructor/convert/unload), `datamodel/document.py` (InputDocument/ConversionResult), `pipeline/simple_pipeline.py` a `pipeline/base_pipeline.py`, `datamodel/settings.py`. Přímý skutečný InputDocument zachovává výpočet hashe, filesize limit, backend validity a stejné backend options. HTML backend vytvoří úplný DoclingDocument; ten je použitelný i po zavření vstupního streamu, což kontrolují skutečné tabulkové a normalizační regrese.

Zvažována ponechaná obecná cesta, samotné odlehčení metadat, přímý SimplePipeline a přímý HTML backend. Kandidát kombinuje jedinou četbu Name/Version z distribution.metadata a úzkou HTML odbočku před DocumentConverter importem. Samotný SimplePipeline by zachoval společnou factory inicializaci; pool/nové prostředí by měnily mnohem více lifecycle a provisioning. Přínos zrychlení zatím není změřený a tento výběr může být podle A/B zúžen na metadata-only variantu.

`convert()` stále vrací skutečný ConversionResult. HTML sestaví skutečný InputDocument s explicitními limity a `fetch_images=False`, backend.convert vytvoří dokument a finally vždy zavolá unload; vnější BytesIO context uzavře stream také při konstrukční/validační/konverzní nebo cleanup chybě. PDF/DOCX konverzní větev, JSON schema, pipeline label, normalizace, chunkování a quality guards se nemění. Přirozeně se mění implementation fingerprint upraveného kódu. Modelový manifest SHA `d5b983cd697a2520ff2246796eb24c58688db89e0d2a608c8de1774eade5f6f4` zůstává shodný, včetně původních bajtů.

Nový fresh-process důkaz zpřesnil dřívější importní hypotézu: i přímý HTML backend potřebuje `base_models → pipeline_options → asr_model_specs/asr_presets → pipeline_options_vlm_model`. Poslední modul na top-level zkouší `from transformers import StoppingCriteria` a importuje sdílený `docling.models.utils.generation_utils`. Nelze tvrdit, že zmizely všechny modelové knihovny nebo přisoudit jim původních 65,8 s. Test proto blokuje skutečně odstraňované DocumentConverter/runtime pipeline/factories/stages, nikoli potřebné datamodelové utility. Třetí knihovny nejsou stubované ani změněné.

Ověření přímým interpreterem vlastního venv, s tokenizer cache a bez pycache/pytest cache:

- RED původních dvou regresí: 2 FAIL, 6 deselected; metadata reads `[4,2,1]` místo `[1,1,1]` a HTML při blokovaném DocumentConverter skončilo failed. `.cache/rag-auto-extraction-20261028/html-refactor-red.log`.
- První kandidát: 7 PASS, 1 FAIL. Příliš široký import guard odhalil výše uvedený sdílený datamodelový import; původní výsledek zachován v `html-refactor-green.log`.
- Po zpřesnění guardu: 8/8 PASS, `html-refactor-green2.log`.
- Závěrečné cílené regrese včetně cleanup failure, původního HTML, nativního PDF a DOCX: **13 PASS, 24 deselected**, 31,80 s, exit0; `html-refactor-targeted.log`. Příkaz: `python -m pytest tools/rag_ingestion/tests/test_html_backend.py tools/rag_ingestion/tests/test_extraction.py -q -p no:cacheprovider -k 'package_versions or html or full_native_pdf_and_page_limit or docx_order_tables_negations_and_no_fake_pages'` s vlastní basetemp.

`html-refactor-manifest.json` obsahuje hashe obou kódových souborů i nového testu a potvrzení původního modelového manifestu. Whitespace kontrola těchto kódových změn prošla. Všechny dosavadní cílené testové procesy skončily. Nedošlo k instalaci, modelové inferenci, síti/API, DB, buildu, GPU ani zásahu do hrané hry.

Výkonový A/B/A ještě neproběhl. Přidělený task `rag-auto-20261028-html-profile` byl načten, ale jeho claim se nezískával během cizího heavy okna; čeká se na výslovné GO/release od root. Source claim zůstává držený kvůli stabilnímu kandidátu a navazujícímu měření, nepředává se jako dokončená výkonová přejímka.

## Dokončení HTML ověření

Po výslovném root GO proběhl samostatně rezervovaný A/B/A probe; [validační předání](rag-auto-20261028-html-profile.md) zachycuje přesné processing pokusy, hashe, časy, paritu a omezení fázové atribuce. A1 22,818 s, B16,828 s, A2 21,854 s. Celý obsah/envelope mimo parserProfile je shodný i s původním uloženým výsledkem; v profile se liší jen očekávaný implementation configurationHash. Zachovány bloky, text, spans, IDs, chunky, quality i všechny odkazy. Oproti průměru A bylo B v tomto jediném instrumentovaném HTML vzorku o24,66 % rychlejší; není to obecný benchmark ani přepis starého65,8s měření.

Nezávislé úzké čtecí review `/root/implement_html_extraction/review_html_lifecycle` nenašlo opravitelné regrese v InputDocument/ConversionResult, limitech, cleanup ani metadata paritě. Reviewer testy ani profiling nespouštěl. Původní testy13PASS a source manifest zůstávají platné; během A/B se zdrojový kandidát neupravoval. Všechny vlastní pomocné procesy skončily, žádné změny jiných formátů či modelového manifestu. Po dokončení obou předání budou source i heavy claims uvolněné; root přebírá přesně uvedené dva kódové soubory, nový test a aktualizovaný handoff pro další kontrolu/integraci. Nic nebylo stagováno ani commitováno tímto agentem.
