# Doručení projektových instrukcí blind reviewerovi

20.10.2026. Skutečný executor938254e3 dokončil spec-completion:v2 a readiness:v3 úspěšně. [Přesný následující stop](pilot-review-authority-stop.json) zachovává všechny tři review výsledky. Žádný commit ani PR nevznikl.

## Doložený mechanismus

Review prompt jmenuje AGENTS.md a docs/agents/bmad-policy.md, ale následně říká, že uvedené instrukce jsou plně inline a nemají se znovu otevírat. Inline byly pouze snapshotové podklady. Blind reviewer kvůli tomuto výkladu policy neotevřel a výslovně oznámil neprovedený přezkum. Edge a verification policy skutečně otevřely a vrátily platné čisté výsledky. Parser správně neuznal odmítnutí jako clean.

Blind raw má260 UTF-8 bajtů, bez koncového newline, SHA2e83cc0289d527fd685ca75b3d484d2ae9490c5ebc363eeb68f68f9700e9bc34. Output file a poslední stdout agent_message jsou byte-identické. Jediná předchozí agent_message je obecné oznámení začátku čtení; obsahuje koncový newline a žádný nález. Tuto úplnou konkrétní historii posoudil koordinátor jako administrativní selhání doručení, nikoli jako provedené review. Počty policyReadCommands v původním JSON jsou výskyty ve started/completed událostech, nikoli počet samostatných spuštění; pro dokončení je rozhodující úspěšná completed událost.

## Varianty a rozhodnutí před změnou

- Přijmout odmítnutí jako prázdný nález: odmítnuto, review nebylo provedeno.
- Jen upřesnit prompt a ignorovat původní attempt: nedostačuje, normální resume správně přebírá jeho immutable vstup/výsledek a znovu ho nespouští.
- Obecně znovu spouštět neparsovatelné REVIEW_OUTPUT: odmítnuto. Mohlo by jít o neúplně vyjádřený nález, nikoli chybu doručení.
- Přidat obecný operátorský retry/migrační framework: pro jediný doložený případ zbytečně rozšiřuje veřejné CLI i stavový kontrakt.
- Opakovat všechny tři role: větší náklad a zbytečně opakuje dvě již platné kontroly.
- **Zvoleno:** doplnit úplné project authority bodies se SHA pro nové review a připustit právě jeden náhradní blind pouze pro přesný již posouzený legacy refusal s vadným původním vstupem a úplnými platnými receipts. Ostatní výsledky zůstanou blokované, pokud nejsou platným review podle stávajícího parseru.

Jde o úzký allowlist celého historického textu a jeho stdout historie, bez trimování, substringů či obecného prose regexu. Cena této konzervativnosti je záměrná: jinak formulované selhání nebude automaticky převzato. Není to tvrzení, že všechny neprovedené či neparsovatelné review lze automaticky opravit. Jakýkoli nález, extra text, jiné odmítnutí, neúspěšný/živý/neprokázaný původní proces nebo změněná identita blokují.

## Zachované hranice

Před novým workerem musí být převzaty všechny tři původní terminal receipts, immutable input/request a source/diff/spec/snapshot bindingy. Edge/verification zůstanou se stejnými attempt IDs, raw SHA a provenance. Starý blind zůstane unperformed v historii. Jediný nový stabilní authority-v1 blind má vlastní durable intent/receipt; jeho failure, neplatný výsledek či nález se neopakuje do zeleného výsledku.

Do nového blind promptu nepatří stará odpověď, jiné reviews ani plán/claims. Dostane diff pouze cestou, kompletní obecné AGENTS/policy a původní native lens instrukce. Zákaz reopening se týká pouze konkrétně dodaných bloků; běžné čtecí příkazy jsou dovolené. Edge claims zůstávají pozdním čtením. Transport2, output schema kontrakt, authorization binding, skutečný completed amendment, readiness:v3 a zdrojový kandidát se nemění.

## Stav

Průzkum skutečných vstupů/výstupů, volba a hranice byly uzavřené před implementací. Autor má disjunktní adapter rezervaci a provádí úzkou opravu, refaktoring a cílené native regrese. Žádné pilotní soubory, receipts ani stav se ručně nepřepisují. Následuje review opravy a normální resume stejného runu.
