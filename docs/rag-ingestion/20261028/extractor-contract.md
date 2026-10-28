# Rozhraní automatické extrakce · KEY-67

Toto rozhraní odděluje získání veřejného souboru, věrnou extrakci, chunkování a SQL publikaci. Nezávisí na rozhodnutí o používání archivu v chatu. Žádné ručně psané parafráze, abstrakty nebo výběr „důležitých pasáží“ nenahrazují vstupní dokument.

## Worker a izolace

Samostatný Python package v `tools/rag_ingestion/`, spustitelný přes `python -m strahov_rag_ingestion --request ABS_JSON --output ABS_JSON`. Node orchestrace dodá již bezpečně získaný lokální soubor. Worker nestahuje uživatelské URL, nespouští makra ani externí dokumentové vztahy. Docling remote services a automatické stahování HTML obrázků zůstávají vypnuté. OCR/layout běží výslovně na CPU; inference modelů se nenačítá do herního serveru. Node mu nepředá API klíče ani DB URL.

Závislosti a parser profil jsou připnuté, modelové artefakty předem připravené v explicitním modelovém adresáři. Žádná instalace do globálního Pythonu, sdílených node_modules nebo uživatelského LibreOffice profilu. Pro lokální probe vlastní venv/cache tasku. Legacy konverze má vlastní dočasný LibreOffice profil a omezený proces; po timeoutu se ukončí jen vytvořený procesový strom. Originál zůstává neměnný.

## Request schemaVersion1

```ts
type ExtractionRequest = {
  schemaVersion: 1;
  sourceId: string;
  sourceUrl: string;
  inputPath: string;       // Absolutní, běžný soubor od orchestrace.
  inputSha256: string;
  workDir: string;         // Výlučně vlastněná pracovní složka daného jobu.
  title: string;           // Veřejný název zdroje, bez kontrolních časů.
  mime: string | null;     // Hint; vždy potvrdit signaturou/strukturou.
  filename: string;       // Hint; nikdy z něj nevytvářet neověřenou cestu.
  mode: "auto" | "native" | "standard";
  modelDirectory?: string;
  html?: { contentSelectors?: string[] };
  limits: {
    maxInputBytes: number;
    maxExpandedBytes: number;
    maxPages: number;
    maxOutputBytes: number;
    maxBlocks: number;
    maxChunkTokens: number;
    maxEmbeddingInputBytes: number;
    timeoutSeconds: number;
  };
};
```

Výchozí kandidát pro měření je650tokenů na chunk, do8191UTF-8bajtů celého embedding vstupu. Nejde o prokázané optimum. Skutečný tokenizer `cl100k_base` pro embedding3, explicitní konfigurace; nepoužívat délku řetězce jako tokeny. Textová v2 hranice800znaků se do workeru nepřenáší.

## Výstup schemaVersion1

```ts
type SourceSpan = {
  blockId: string;
  locator: string;       // Např. PDF strana3; DOCX tabulka2, řádky3–5.
  page?: number;         // Jen pokud formát fyzickou stránku skutečně má.
  bbox?: { left: number; top: number; right: number; bottom: number;
           origin: "top-left" | "bottom-left"; unit: "pt" | "px" };
};
type ExtractionResult = {
  schemaVersion: 1;
  sourceId: string;
  inputSha256: string;
  status: "ok" | "review-required" | "unsupported" | "failed";
  errorCode?: string;    // Pevný bezpečný kód, ne raw stack/cesta/text dokumentu.
  format: string;
  parserProfile: { id: string; packages: Record<string,string>;
    pipeline: string; configurationHash: string; modelManifestHash: string | null;
    tokenizer: { id: string; package: string; version: string;
      vocabularySha256: string } };
  document: { title: string; pageCount: number | null; complete: boolean };
  blocks: Array<{ id: string; kind: string; text: string;
    headingPath: string[]; spans: SourceSpan[] }>;
  chunks: Array<{ id: string; text: string; headingPath: string[];
    tokenCount: number; blockIds: string[]; spans: SourceSpan[] }>;
  quality: { processedPages: number | null; expectedPages: number | null;
    inputTextCharacters: number | null; outputTextCharacters: number;
    tableCount: number; ocrPages: number[]; issues: string[] };
  links: Array<{ href: string; text: string; headingPath: string[];
    relation: "document" | "page" | "feed" | "canonical" | "other";
    mimeHint?: string }>;
};
```

Volitelné doplňky jsou přípustné po domluvě, public DTO/SQL kontrakt nevytvářet uvnitř workeru. Provozní raw Docling JSON lze uložit do `workDir` a přidat jeho relativní jméno/hash, nikdy neotevírat cestu z obsahu dokumentu. Pipeline poté přesune validovaný výstup do svého content-addressed storage.

`status:ok` vyžaduje kompletní zpracování všech podporovaných stran/listů a splnění limitů. Překročení limitu není částečný úspěch. Chybějící OCR/model, nepodporovaný formát, poškozený soubor, ztráta stránky nebo nekvalitní extrakce má explicitní stav. Raw originál a předchozí publikace se při tom nemažou. Výstupní JSON se zapisuje atomicky a nesmí přepsat jiný job; stdout pouze krátký stav, ne celý cizí dokument.

## Věrnost, tabulky a citace

- Zpracovat běžné HTML, textová i obrazová PDF, DOCX, XLSX/CSV/TSV, PPTX, Markdown/TXT a OpenDocument; DOC/XLS/PPT/RTF přes izolovanou LibreOffice konverzi. Rozpoznat OOXML ZIP podle vnitřní struktury, nikoli samotnéPKsignatury; omezení dekomprese/path traversal.
- Native PDF je rychlá větev jen pro vhodný jednoduchý text. Sken, dvousloupcové rozložení, významné tabulky nebo nesprávné pořadí vyžadují odpovídající standard/layout/OCR větev. `auto` musí umět tento přechod, ne vrátit prázdný PDF jako úspěšný.
- Čistit navigaci a jednoznačně opakované dekorativní záhlaví/patičky. Zachovat obsah, negace, seznamy, poznámky pod čarou, čísla, jednotky a tabulkové vztahy. PDF screenshot s ukázkovými hodnotami není důkazem aktuálního termínu nebo stavu účtu.
- DOCX musí zachovat pořadí odstavců i tabulek; čísla jeho fyzických stran se nevymýšlejí. Neakceptované sledované změny/nejednoznačný viditelný obsah je důvod k explicitnímu upozornění.
- Při rozdělení tabulky zopakovat potřebné hlavičky a jednotky, držet řádky a vazbu na caption/poznámku. Změna cell vztahů nemůže být schovaná pod vysoký obecný confidence score; Docling `table_score` zatím není implementované.
- Obrázky/diagramy, které nelze věrně převést na text, přiznat v quality issues a uchovat provenance; nevyrábět domnělé hodnoty. Generativní přepis všech dokumentů není výchozí a není vyžadovaný pro tento worker.

Každý chunk musí odkazovat na existující bloky. IDs chunků jsou deterministické z dokumentovéhoID, sémantického headingPath, textu a pořadí přesných duplicit; změna data stažení ani vložení nesouvisejícího odstavce nesmí změnit všechny IDs. Fyzické page/bbox/block pořadí nepatří do embedding textu. Nový serverový formát bude `title-heading-text-v2`: přesné JSON pole `[title, headingPath, text]`. Worker tento stejný kanonický vstup jen počítá tokenizerem a hlídá byte limit; embedding provádí Node adapter.

## HTML/feed discovery

Vrátit odkazy z relevantní obsahové oblasti; obecná navigace se nestává seznamem článků k crawl. Href/canonical jsou návrhy dat, parent vždy znovu ověřuje hostname/cestu/redirect. Worker odkazy ani vzdálené obrázky nenačítá. RSS/Atom má bezpečný parser bez externích entit a vrací item odkazy s obsahem/metadata podle podporované struktury; nesmí silently duplikovat tentýž článek.

## Lehký robots helper a provisioning

`python -m strahov_rag_ingestion.robots --request ABS_JSON --output ABS_JSON` používá pinovaný Protego, bez importu Docling/modelů a bez sítě. Request `{schemaVersion:1,bodyPath,bodySha256,userAgent,urls:[...]}`, do512KiB textu a1000URL. Výsledek `{schemaVersion:1,decisions:[{url,allowed,crawlDelaySeconds}],parserProfile}`. `crawlDelaySeconds` je konečné nezáporné číslo nebo null. Získání robots.txt, jeho TTL, HTTP chyby a následování redirectů vlastní Node acquisition; tento helper pouze vyhodnocuje pravidla pro již ověřené URL. Žádný permissive fallback při chybě parseru.

Tokenizer používá předpřipravený `TIKTOKEN_CACHE_DIR`. Samostatný provisioning může získat známý oficiální slovník a ověřit hash požadovaný pinovanou knihovnou; runtime worker při chybějícím artefaktu odmítne práci před síťovým pokusem. ParserProfile obsahuje verzi a identitu tokenizéru, nikoli místní absolutní cestu. Modelové prefetche zůstávají zvláštním omezeným krokem.

## Ověření

Syntetické fixtures musí obsahovat čísla, české negace, dva PDF sloupce, sken, DOCX tabulku, rozdělenou delší tabulku a škodlivý ZIP/XML vstup. Testovat úplnost a vazby, ne přesný nedůležitý whitespace modelu. Skutečný omezený probe použije již stažené3 veřejné dokumenty z research.md. Native/DOCX lehké testy bez GPU; větší modelové OCR a image build až po rezervaci příslušného validačního okna. Nulové placené API volání v této implementační komponentě.
