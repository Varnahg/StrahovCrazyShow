# V2: velikost po skutečné sanitizaci

Původní autor znovu převzal task webgpu-program-attribution-candidate-20261018 / owner webgpu-program-attribution-candidate-01a14497-child přes --adopt-dirty. V1 candidate, manifest731f3570, předání a run01–05 zůstávají beze změny. V2 má jen dvě změněné cesty: client/webgpu-compilation-profile.ts a tests/webgpu-program-attribution.test.ts. Zbytek šestisouborového overlaye je byte-identický s V1.

Review P2: raw byte budget nestačil, protože token=a se při redakci prodlouží. Guard nyní používá skutečný sanitizeDiagnosticsData na requestu a znovu na jeho výsledku (klient a collector); porovnává maximum skutečných serializovaných velikostí s32KiB−1024B rezervou pro envelope a rendererId. Přebytečný user stále vede k usersOmitted/metadataTruncated. Žádná nová vrstva, nový metadata rozsah ani logger změna.

Nová regrese opakuje stejné max32requesty×4capped uživatele pro původní Unicode/control i redaction-expansion. Genuine RED nad přesnýmV1 runtime: vybraný redaction test uloží1summary místo33records; dvě další suite-only položky run-v2-01 jsou prázdné soubory po name filtru, nikoli další coverage. GREENrun-v2-02:55/55 PASS,0skip,3,213s. Obě varianty projdou skutečným SessionDiagnostics a validateDiagnosticsBatch, dropped0; každý přijatý record zůstane pod32KiB a dalšícollector sanitize je pro tyto důkazy stabilní.

Root může převzít candidate-v2 a manifest-v2. FullTS/build/GPU neprovedeny dítětem. Žádný vlastní proces neběží, runtime/hra ani dependencies se neměnily, claim po předání uvolněn. Ostatní scope/omezení a nezávislé review V1 platí.
