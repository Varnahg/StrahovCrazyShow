# Isolated document extraction

This package implements the [KEY-67 extraction contract](../../docs/rag-ingestion/20261028/extractor-contract.md). It accepts an already downloaded local file, checks its SHA-256 and structure, extracts complete supported content, and returns blocks, structural chunks, provenance, quality results and discovery links. It performs no embeddings, SQL writes, crawls or paid API calls.

The checked base profile is Python 3.12, Docling Slim 2.144.0 / core 2.105.0 / parse 7.24.1, tiktoken 0.12.0 and Protego 0.7.0. `uv.lock` pins the complete dependency graph with artifact hashes. The optional `cpu-models` extra adds Torch 2.9.1+cpu / torchvision 0.24.1+cpu from the explicit official CPU index, docling-ibm-models 4.0.4 and EasyOCR 1.7.2. Neither profile installs CUDA or GPU ONNX packages.

## Installation and explicit tokenizer provisioning

Use a separately owned environment/cache. Do not run dependency synchronization against the game root or the global Python installation. Example PowerShell from the repository root; substitute your own reserved cache directory and read-only Python interpreter:

```powershell
$workerCache = "$PWD/.cache/rag-auto-extraction-20261028"
$env:UV_CACHE_DIR = "$workerCache/uv-cache"
$env:UV_PROJECT_ENVIRONMENT = "$workerCache/venv"
$env:UV_PYTHON_DOWNLOADS = "never"
uv sync --project tools/rag_ingestion --locked --python C:/path/to/python.exe
$workerPython = "$workerCache/venv/Scripts/python.exe"
$env:PYTHONDONTWRITEBYTECODE = "1"
& $workerPython -m strahov_rag_ingestion.provision_tokenizer --cache-directory "$workerCache/tokenizer"
$env:TIKTOKEN_CACHE_DIR = "$workerCache/tokenizer"
```

Provisioning commands are the only network operations in this package. Tokenizer provisioning fetches `cl100k_base.tiktoken` from the URL embedded in pinned tiktoken and verifies SHA-256 `223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7`. At runtime, a missing or mismatched dictionary fails before any network attempt. Keep this cache directory available to the worker. `TIKTOKEN_CACHE_DIR` is an absolute deployment path and is excluded from the serialized profile.

CPU model installation/provisioning is a separate, resource-coordinated operation:

```powershell
uv sync --project tools/rag_ingestion --locked --extra cpu-models --python C:/path/to/python.exe
& $workerPython -m strahov_rag_ingestion.provision_models --model-directory "$workerCache/models" --cache-directory "$workerCache/model-download-cache"
```

The committed `models-manifest.json` identifies seven files (482,986,627 bytes): pinned Heron layout, Accurate TableFormer and EasyOCR craft/latin_g2. Provisioning downloads only the recorded revisions/paths, and extraction verifies every file's size and SHA-256. Set request `modelDirectory` to this directory. No model file is committed or copied into the application bundle.

## Running

```powershell
& $workerPython -m strahov_rag_ingestion --request C:/owned/job/request.json --output C:/owned/job/result.json
& $workerPython -m strahov_rag_ingestion.robots --request C:/owned/job/robots-request.json --output C:/owned/job/robots-result.json
```

`workDir` must already exist and belong exclusively to the job. The extraction output must be directly inside it. Do not use `.worker-claim` or `.worker-result.json` as output names. A completed output is never overwritten. The helper returns only a short JSON status on stdout. Extraction exits 0 for `ok`, 2 for a valid non-OK extraction result, and 1 when the request/job cannot be accepted. Robots exits 1 on invalid input or a conflicting output; it does not return a permissive policy.

Extraction uses an importable Windows/POSIX spawn target, one owned process and a strict deadline. Its child disables network connects, subprocess creation, plugins and remote Docling services; temporary/model/cache directories are inside the job. No legacy office executable can start implicitly. Timeout kills only this child; it cannot create subprocess descendants. Parent orchestration should also impose an outer timeout and production OS memory/disk quotas. This Python audit boundary is defense in depth, not an OS sandbox against compromised native libraries.

## Verified scope and explicit limitations

Synthetic tests exercise native multi-page PDF, DOCX, XLSX, PPTX, HTML, Markdown, CSV, TSV, TXT, ODT, ODS and ODP. All sheets/slides/pages are checked, including ODP's actual chapter-group representation. DOCX, XLSX and ODS citations never claim physical PDF pages. Table cells retain their row/column spans; chunks repeat declared header and caption/footnote context and carry vertically merged cells into every covered row. A row that cannot fit the complete embedding budget is rejected for review.

With a prepared `modelDirectory`, `auto` processes PDF through the standard CPU layout/OCR pipeline (one model thread and one parser thread), and `standard` requests it explicitly. Without models, `auto` uses native extraction and reports uncertain reading order or image-only pages as `review-required` / `standard-model-profile-unavailable`. Explicit `native` keeps the conservative quality gates. Legacy DOC/XLS/PPT/RTF report `unsupported` / `legacy-converter-unavailable`; an isolated LibreOffice conversion profile remains outstanding. No hidden download, GPU selection or guessed fallback is used.

Actual CPU inference was run on the two public SÚZ PDFs. The bilingual contract yielded complete one-page structured content with every source numeric token retained after list markers were restored. The screenshot yielded 29 OCR text children under a picture, but missed its highlighted example date; it remains `review-required`. The pinned API and normalized raw output were tested; the final standard worker CLI isolation and a synthetic PDF table inference still need a separate CPU validation window. PDF tables therefore explicitly require review. Synthetic fixtures do verify table normalization/chunking from the real Office parsers.

Images/diagrams, tracked changes, external document relationships, unrepresented items and spreadsheet formulas produce explicit quality issues and prevent `ok`. Text nested inside pictures is retained, as are numbered-list markers. Source text coverage is checked for DOCX. Formula cells are not recalculated. Native PDF layout detection is conservative and is not a proof of universally correct reading order. Feeds return deduplicated discovery links, not duplicate article embeddings. HTML links are only suggestions; the caller must recheck each hostname, path, redirect and access policy.

The embedding input is exactly compact UTF-8 JSON `[title, headingPath, text]`. Its cl100k_base token count and UTF-8 bytes must both fit the request. Stable chunk IDs use source ID, headings, exact text and per-content duplicate ordinal; page coordinates and global block index are absent. A code fingerprint, parser versions, tokenizer identity and configuration distinguish transformations in cache.

No native-parser `SUCCESS` alone grants publication. `ok` additionally requires a complete unit set, nonempty text (except discovery feeds), valid budgets and no unresolved quality issue. Non-OK results preserve the original input and prior publications, which remain owned by orchestration.

## Verification

Run the targeted package tests directly with the owned interpreter and cache. No game dependency synchronization is needed:

```powershell
& $workerPython -m pytest tools/rag_ingestion/tests -q -p no:cacheprovider --basetemp "$workerCache/test-run"
```

The fixtures are generated synthetic documents. Full public source documents and extracted text are kept only in ignored task cache. Recorded probe evidence and precise limitations are in [the handoff](../../docs/agents/handoffs/rag-auto-20261028-extraction.md).

Primary sources checked 2026-10-28: [Docling format support](https://docling-project.github.io/docling/usage/supported_formats/), [Docling native/offline options](https://docling-project.github.io/docling/usage/advanced_options/), [pinned Docling Slim release](https://pypi.org/project/docling-slim/2.144.0/), [Protego RFC parser/API](https://github.com/scrapy/protego), and the installed pinned package source. Model documentation is not evidence that model inference was run.
