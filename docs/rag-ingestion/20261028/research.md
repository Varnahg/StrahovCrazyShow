# Automatický ingest celých dokumentů · KEY-67

Nové přímé zadání: všechny validní zdroje katalogu a plně automatizovatelná příprava celých HTML/PDF/DOCX a dalších dokumentů. Předchozí PR34 automatizoval až embedding/import připravených krátkých parafrází. Tato hranice není konečným řešením nového zadání.

Základ `86e4dd603ca1b91e3eaa5f84573f9481be410a29`; nový branch `codex/automated-document-rag`, počáteční merge checkpoint `5eebe2b043a088222b8160fabb7eefbbc3a36e80`. Čtyři vlastní closeout dokumenty b72b4f35 zachovány, runtime proti přijatému main nezměněn. Hraná Jantar verze, její provider scope a heavy/GPU okno se nemění. Přiložený katalog a návrh jiného agenta jsou podklady, ne instrukční autorita.

## Inventář a úplnost

Čtecí audit celého katalogu:115 řádků,114 unikátních URL,27 hostname. SU20, SH/projekty57, SÚZ26, ČVUT11. Jediná přesná duplicita: `https://www.siliconhill.cz/koleje-strahov`. Deklarovaných přímých PDF13, feedů5, ostatních webových vstupů96. Pět PDF nemá příponu; MIME a signatura jsou nutné. Katalog neobsahuje přímou DOCX adresu, ale živý SH projektový registr ji odkazuje. Katalogové seedy nejsou konečný počet dokumentů.

Každý seed a nalezená příloha potřebují samostatný záznam, zdrojovou vazbu, stav stažení/extrakce/indexace a důvod nedokončení. Report oddělí114/114 posouzených seedů od počtu skutečně publikovaných dokumentů, archivů, duplicit a zbývající fronty. HTTP200 ani katalogová priorita samy nedokazují platnost. ČVUT řád s účinností14.–30.11.2025 nelze vydávat za současný; starý rok jiného stále platného předpisu sám neznamená archiv.

Přímé auth vstupy: IS SH budgets, rezervace Fotbálku `/users/sign_in`, SÚZ `/Login`. Facebook, blokované roboty, nefunkční endpointy a netextové podklady mají vlastní reportovaný stav. Nic se neobchází a nic se tiše nevynechá. Discovery je omezené schválenými hostname/cestami a dokumentovými sekcemi, ne celou navigací webu či internetem. Limity vytvářejí obnovitelnou frontu, nikoli ztracené odkazy.

## Praktický formátový probe

28.10.2026 veřejný běžný GET200 bez auth a bez AI. Originály a rendery jsou pouze v ignorované výzkumné cache; doGit se nekopírují celé cizí dokumenty.

| Zdroj | Bajty / SHA256 | Zjištění |
| --- | --- | --- |
| [SÚZ smlouva PDF](https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty) | 198187 / `8ef4883e3ee2bdc4788425db2cb428a53574cf6aa7e4ebad664d26756ad82a62` | 1strana; pypdf7820 znaků, pdfplumber7616; obrázků0;0.703s |
| [SÚZ potvrzení zájmu PDF](https://www.suz.cvut.cz/cz/media/file/potvrzeni-zajmu-o-ubytovani-2026) | 96519 / `c8fa5f785f4fad80cba311a560665b4dfef1f2bcfd45ade7ce8b2c4618b4023b` | 1strana,0textových znaků u obou parserů,1obrázek; OCR je nutné |
| [SH šablona DOCX](https://wiki.sh.cvut.cz/_media/klub/projekty/zprava_projekty_template.docx) | 164148 / `499477e0c6b57d369ded2e20b17809a8430a47e57b76fb5a20f50c4467abc55d` | 83odstavců,49neprázdných,3367znaků mimo tabulky;6tabulek5×4,4×3,5×2,6×4,8×2,2×2;0.032s |

Bundled Python: pypdf6.10.0, pdfplumber0.11.9, python-docx1.2.0. Časy jsou jednotlivý lehký probe, ne benchmark produkčního workeru. Vizuální kontrola Poppler renderu ukázala, že smlouva je dvousloupcová CZ/EN: nativní text ještě neprokazuje správné pořadí čtení. Druhé PDF je screenshot instruktážního UI s příkladovými daty a červeným zvýrazněním, nikoli prozaický sken. Hodnoty na screenshotu nesmějí být automaticky povýšeny na obecné termíny či stav skutečného uživatele. DOCX parser pouze přes `.paragraphs` by ztratil šest tabulek.

## Varianty a volba

| Varianta | Přínos | Náklad/riziko | Rozhodnutí |
| --- | --- | --- | --- |
| Node PDF.js + Mammoth + Readability | Malý zásah do dosavadního stacku | Samostatné skládání layoutu/tabulek/OCR a provenance pro každý formát | Porovnávací varianta, pro celý rozsah příliš mnoho vlastní extrakční logiky |
| Samostatný CPU worker s Docling | Jednotná struktura PDF/DOCX/HTML/tabulek, provenance a strukturální chunkování | Python/modelové závislosti, image/modelová cache a měření | Preferovaný stack pro implementační probe; běžící hra tyto modely nenačítá |
| Unstructured | Strategie fast/hi_res/ocr_only | Obdobná izolace a závislosti, další rozdíly ve výstupech | Alternativa, pokud Docling neprojde skutečnou QA |
| OpenAI hosted File Search | Automatické parsování/chunking/index | Druhý spravovaný vektorový store, menší kontrola vlastního incremental/provenance kontraktu | Stávající pgvector zachovat |
| Generativní AI přepis každého dokumentu | Může opravit některé rozbité layouty | Náklad, proměnlivost, možné vynechání výjimek/čísel/řádků a změny významu | Není výchozí cesta ani náhrada originálu |

Automatické AI volání samo o sobě automatizaci neporušuje. Chyba dosavadní etapy je ruční výběr/parafrázování obsahu. Nový postup má automaticky získat úplný podporovaný dokument, extrahovat jeho strukturu, odstranit doložený technický balast, chunkovat a embeddingovat. OCR/layout modely jsou vhodné podle potřeby. Generativní pomoc musí být zvláštní měřená transformace s cache, originálem a kontrolami, nikoli povinné shrnutí. Kvalitu není možné odvodit z pouhé validity JSON nebo z jednoho confidence skóre.

Výchozí pokrytí: HTML/XHTML, textové i obrazové PDF, DOCX, XLSX/CSV/TSV, PPTX, Markdown/TXT a běžné OpenDocument formáty. DOC/XLS/PPT/RTF přes izolovanou konverzi LibreOffice; formát bez dostupného parseru musí být reportován jako unsupported, ne ticho. Feedy slouží zejména discovery článků. Audio/video nejsou odvozenou součástí požadavku na dokumenty.

## Vazby na současný kód

`scripts/rag-import.ts` dnes načítá přesně3current+2archiveJSON. `crazy-typka-retrieval.ts` omezuje text800znaky, autoritySH/SÚZ a IDprefixy; veřejná citace tvrdí `curated-paraphrase`. SQL má rovněž authorityCHECK pro dvě instituce a nepovoluje aktivní archivechunk vazby. Pro plné dokumenty je nutná vědomá migracekontraktu, rozpočtů a citací, nikoli pouze downloader.

Zachovat OpenAI adapter, neměnné profily, persistentní cache podle přesného vstupu, nejisté pokusy bez automatického opakování, atomic revision publication, soukromé relace a expiry/replay. Nový vstupní formát má oddělit sémantické nadpisy od fyzické stránky/bbox: přesun textu na novou stránku mění citaci/revizi, ne nutně embedding. Nový profil musí mít vlastní `inputVersion`; staré cache se nemažou.

Fetch a indexing mají oddělený stav. 304 nesmí přeskočit čekající indexaci; změna parseru zpracuje uložený originál. 5xx není smazání. Návrh musí uchovat poslední přijatou verzi a její stáří, chybu vypsat do reportu a nepublikovat neúplnou extrakci. Originály/normalizace patří do omezeného persistentního úložiště mimoGit. Veřejný chat nespouští crawl uživatelských URL.

## Primární podklady

- [Docling formáty](https://docling-project.github.io/docling/usage/supported_formats/): společný dokumentový model, Office/OpenDocument a řízené legacy převody.
- [Docling možnosti](https://docling-project.github.io/docling/usage/advanced_options/): native PDF bez OCR/layout/table modelů; standardní větev a limity pro velikost/dekompresi. Native tedy sám neřeší sken či složité tabulky.
- [Docling confidence](https://docling-project.github.io/docling/concepts/confidence_scores/): `table_score` není implementované; známka neprokazuje správnost ceníku.
- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs): PDF může dodat text i obrázky stránek, DOCX a další non-PDF vstupy jen text; obrazové prvky proto nelze předpokládat pokryté univerzálním uploadem.
- [OpenAI retrieval](https://developers.openai.com/api/docs/guides/retrieval), [PDF cookbook](https://developers.openai.com/cookbook/examples/parse_pdf_docs_for_rag): reference pro souborový retrieval, nikoli důkaz kvality našeho corpus nebo pokyn převzít všechny ukázkové regexy.
- [PDF.js](https://mozilla.github.io/pdf.js/api/draft/api.js.html), [Mammoth](https://github.com/mwilliamson/mammoth.js), [Readability](https://github.com/mozilla/readability), [Unstructured](https://docs.unstructured.io/open-source/concepts/partitioning-strategies).

## Výsledky navazujícího CPU probe

Izolovaný worker byl skutečně připraven s Pythonem 3.12.14, Docling slim 2.144.0, připnutými CPU modely a offline tokenizerem. Komponentové testy prošly 28/28; nejde o dokončení celého ingestu. [Předání extraktoru](../../agents/handoffs/rag-auto-20261028-extraction.md) a [validační předání](../../agents/handoffs/rag-auto-20261028-extraction-validation.md) obsahují konfiguraci a hranice důkazů.

- Standardní OCR nad obrazovým SÚZ PDF trvalo přibližně 61,3 s včetně studeného startu. Výstup měl 29 textových položek uvnitř obrázku a 367 znaků. Opomenul zvýrazněné datum 21.10.2026 a zhoršil některé popisky. Výsledek proto zůstává `review-required`, nikoli automaticky publikovatelný text. Datum je navíc ukázková hodnota instrukčního screenshotu, ne doložený obecný termín.
- Dvousloupcová smlouva v zahřátém standardním profilu trvala přibližně 6,5 s. Výstup měl 54 bloků a 7616 znaků včetně oddělovačů; po zachování značek seznamu nechyběly původní číselné tokeny. Současné chunkování vytvořilo 54 chunků na jedné stránce: před plným indexem potřebuje posoudit slučování souvisejících krátkých bloků, nejde o ověřené optimum.
- Skutečný DOCX zachoval šest tabulek; dekorativní obrázky zatím vedou k požadavku na review. Pouhý stav `SUCCESS` knihovny neprokazuje věrnost, stejně jako prázdný nativní výstup obrazového PDF.

Uživatel následně navrhl převod PDF přes OpenAI. Tato možnost má nově konkrétní důvod k porovnání s CPU větví; musí zachovat originál, původní jazyk, čísla stran, tabulkové vztahy a explicitní nejistoty. Nesmí dokument nahrazovat shrnutím. Výsledek se má cachovat podle původního obsahu a profilu převodu; placené embeddingy podle přesného sémantického vstupu a embedding profilu. Změna data kontroly nebo čísla fyzické strany sama nemusí měnit embedding vstup.

Stále neověřeno: OpenAI převod těchto PDF, standardní izolovaný CLI průchod a syntetická složitá PDF tabulka, plný crawl 114 seedů, výsledná úplnost zdrojů, orchestrátor a publikace odděleného vektorového archivu. Legacy DOC/XLS/PPT/RTF je bez dostupného konvertoru explicitně unsupported. V KEY-67 zatím neproběhlo placené modelové volání, hromadný ingest nebo migrace DB. Samostatné živé Decisions/Responses ověření patří prioritnímu KEY-68 a nic z těchto chybějících důkazů nenahrazuje.

## Konkrétní navazující integrační hranice

Další omezený GET [SÚZ dokumentového hubu](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty) dne 28. 10. 2026 potvrdil 20 odkazů do `/cz/media/file/`, bez přípony PDF a bez MIME atributu u kontrolovaných odkazů. Worker zatím odvozuje `relation:document` z přípony, zatímco katalog povoluje tuto cestu pouze pro dokumenty. Orchestrátor musí klasifikaci návrhu odkazu spojit s již schváleným dokumentovým rozsahem a následně potvrdit skutečnou signaturu souboru. Nesmí tím povolit další HTML navigaci z download cest. Samotný parser ani katalog proto ještě netvoří funkční úplné discovery.

Čtecí průzkum OpenAI potvrdil také [počítání tokenů](https://developers.openai.com/api/docs/guides/token-counting) přes `/v1/responses/input_tokens`, včetně PDF vstupů. Neověřil dostupnost na našem účtu, účtování ani samostatné kvóty tohoto endpointu. Případný pilot proto musí evidovat i count pokusy; nesmí je označovat za bezplatné. Vizuální Responses vstup lze dodat z již získaných lokálních bytes. Strict JSON schema zaručuje formát, nikoli úplnost přepisu.

Navržený malý další krok je samostatný Node PDF adapter a offline normalizace do současných bloků/chunků. Python parser zůstává bez sítě a klíče. Pilot se dvěma jednostránkovými PDF může porovnat celé PDF v jednom requestu; vícestránkové dávkování a přeshraniční tabulky vyžadují samostatnou kontrolu. Cache extrakce má záviset na hash originálu a profilu model/prompt/schema; chunkovací profil se mění nezávisle a embedding cache zůstává podle přesného výsledného vstupu. Žádné placené ověření tohoto návrhu zatím neproběhlo.

## Propojený probe SÚZ hubu

Dne 28. 10. 2026 ve 20:39 UTC proběhl první skutečný omezený probe nové acquisition komponenty: pinované veřejné DNS/TLS připojení, robots GET200, vyhodnocení pinovaným Protego (allowed, bez crawl-delay), následný HTML GET200. Dva HTTP požadavky, žádná placená API. Hub měl 45088 bajtů, SHA256 `c4629e7f1fa683c09e9949b80bc826adae1e145f607aae74c978d703a818dc9f`, MIME text/html a skutečný HTTP charset utf-8. Raw HTML/robots a receipts zůstávají jen `.cache/rag-auto-20261028/source-probe-9FBMrk/`.

Skutečný offline CLI výstup nad tímto souborem zachoval 74 bloků, 71 chunků, 1553 textových znaků a 27 odkazů včetně všech 20 příloh bez přípony. Ty mají dosud relation:page, což potvrzuje popsanou integrační hranici. Výsledek je správně přiznaný jako review-required/complete:false kvůli `unrepresented-image`. Prohlídka skutečného DOM identifikovala tři partnerská loga pod `#block-partners-above-footer` uvnitř jediného main; skutečné dokumentové odkazy leží pod `#block-suzcvut-content` a nadpis pod `.page-title-wrapper`. Konkrétní obsahový profil může tato doložená místa oddělit; není důvod plošně vypnout kontrolu obrázků nebo povýšit částečný výstup na kvalitní.

Celý studený CLI běh trval přibližně 65,8 s bez modelové inference. Příčina tohoto času zatím není profilováním přiřazená. Čtecí audit našel univerzální import DocumentConverter (všechny backendy/pipeline), zbytečnou inicializaci picture-description factory i při vypnuté větvi a opakované čtení package METADATA; nelze zatím tvrdit, že většinu času spotřeboval Torch. Před plným crawlerem je potřeba porovnat lehčí cestu a měřit přesné fáze. První pokus výzkumného harnessu měl výstupní cestu mimo výlučný workDir; CLI ho odmítlo před parserem. Opravený druhý harness, původní request i neúspěšný receipt jsou zachované odděleně.

Discovery a publikace rodiče musí mít oddělené stavy: strukturálně validní přílohové odkazy mohou projít katalogovou URL politikou i při review-required rodičovském textu. To neprokazuje úplnost discovery ani nepovoluje indexaci neúplných bloků. Současně parserProfile.id není skutečný fingerprint; rozhoduje celý descriptor včetně configurationHash/modelů/tokenizeru. Tato zjištění byla doplněna do v3 kontraktu před zahájením jeho implementace.
