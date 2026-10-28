"""One document per process; extraction never publishes to SQL or the network."""

import csv
import hashlib
import io
import os
import re
import zipfile
from importlib.metadata import distributions
from pathlib import Path

from .chunking import Chunker
from .contracts import ExtractionError, Request, canonical, digest, empty_result
from .safety import decode_text, inspect_input, safe_xml


def tokenizer_ready():
    # This is the cl100k_base URL/hash in pinned tiktoken 0.12.0. Validate before
    # get_encoding, so even an unguarded caller never causes an implicit fetch.
    url = "https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken"
    expected = "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7"
    cache = os.environ.get("TIKTOKEN_CACHE_DIR", "")
    path = Path(cache) / hashlib.sha1(url.encode()).hexdigest()
    if not cache or not Path(cache).is_absolute() or not path.is_file() or path.stat().st_size > 5_000_000:
        raise ExtractionError("tokenizer-unavailable", "review-required")
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ExtractionError("tokenizer-integrity-failed")


def plain_block(request, kind, text, locator, ordinal=0):
    block_id = "b-" + digest([request.sourceId, kind, text, ordinal])
    return {"id": block_id, "kind": kind, "text": text, "headingPath": [],
            "spans": [{"blockId": block_id, "locator": locator}]}


def source_units(data, fmt):
    if fmt not in {"docx", "xlsx", "pptx", "odt", "ods", "odp"}:
        return None, []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if fmt == "docx":
            texts = []
            for name in archive.namelist():
                if re.match(r"word/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$", name):
                    texts.extend((e.text or "") for e in safe_xml(archive.read(name)).iter() if e.tag.rsplit("}", 1)[-1] == "t")
            return None, texts
        if fmt == "xlsx":
            root = safe_xml(archive.read("xl/workbook.xml"))
            units = sum(e.tag.rsplit("}", 1)[-1] == "sheet" for e in root.iter())
        elif fmt == "pptx":
            root = safe_xml(archive.read("ppt/presentation.xml"))
            units = sum(e.tag.rsplit("}", 1)[-1] == "sldId" for e in root.iter())
        else:
            root = safe_xml(archive.read("content.xml"))
            if fmt == "odt":
                return None, []
            tag = "table" if fmt == "ods" else "page"
            units = sum(e.tag.rsplit("}", 1)[-1] == tag for e in root.iter())
        return units, []


def bounded_result(request, result):
    if len(canonical(result).encode("utf-8")) <= request.limits.maxOutputBytes:
        return result
    failure = empty_result(request)
    failure.update(format=result["format"], errorCode="output-size-limit")
    failure["quality"]["issues"] = ["output-size-limit"]
    return failure


def implementation_hash():
    root = Path(__file__).parent
    return digest([[path.name, hashlib.sha256(path.read_bytes()).hexdigest()]
                   for path in sorted(root.glob("*.py"))])


def package_versions():
    packages = {}
    excluded = {"pytest", "reportlab", "iniconfig", "colorama"}
    for distribution in distributions():
        # metadata is a parsed file, not a cached property. Version comes from
        # this same map instead of distribution.version reading the file again.
        metadata = distribution.metadata
        name = metadata.get("Name")
        if name and name.lower() not in excluded:
            packages[name.lower()] = metadata.get("Version")
    return dict(sorted(packages.items()))


def run(request: Request) -> dict:
    result = empty_result(request)
    try:
        result["parserProfile"]["packages"] = package_versions()
        result["parserProfile"]["configurationHash"] = digest({"adapter": "1", "mode": request.mode,
            "implementationSha256": implementation_hash(),
            "tokenizer": "cl100k_base", "inputVersion": "title-heading-text-v2", "cpuThreads": 1,
            "html": request.html.model_dump() if request.html else None, "limits": request.limits.model_dump()})
        data, fmt, issues = inspect_input(request)
        result["format"] = fmt
        result["quality"]["issues"] = issues
        tokenizer_ready()
        if fmt == "feed":
            from .web_content import feed_links
            result["links"] = feed_links(data, request)
            result["parserProfile"]["pipeline"] = "defusedxml-feed-discovery"
            result["status"] = "ok"
            result["document"]["complete"] = True
            if len(result["links"]) > request.limits.maxBlocks or len(canonical(result).encode("utf-8")) > request.limits.maxOutputBytes:
                raise ExtractionError("output-size-limit")
            return bounded_result(request, result)
        if fmt in {"txt", "csv", "tsv"}:
            text = decode_text(data, request.mime)
            if fmt == "txt":
                blocks = [plain_block(request, "text", text, "TXT complete text")]
                tables = 0
            else:
                rows = list(csv.reader(io.StringIO(text, newline=""), delimiter="\t" if fmt == "tsv" else ",", strict=True))
                if not rows or any(len(row) != len(rows[0]) for row in rows):
                    raise ExtractionError("irregular-delimited-table", "review-required")
                # Delimited files do not declare a header. Keep all rows as data.
                lines = ["\t".join(canonical(cell) for cell in row) for row in rows]
                block = plain_block(request, "table", "\n".join(lines), f"{fmt.upper()} rows 1-{len(rows)}")
                block["_table"] = {"header": "", "rows": lines, "context": ""}
                block["tableChunking"] = {"contextLineCount": 0, "headerLineIndexes": []}
                blocks, tables = [block], 1
            result["quality"]["inputTextCharacters"] = len(text)
            result["parserProfile"]["pipeline"] = "strict-text" if fmt == "txt" else "strict-csv"
        else:
            from .docling_adapter import convert, native_layout_issues, normalize_doc, pdf_preflight
            if fmt == "html":
                from .web_content import html_content
                data, result["links"], html_issues = html_content(data, request)
                issues.extend(html_issues)
            expected, original_texts = source_units(data, fmt)
            if expected is not None and expected > request.limits.maxPages:
                raise ExtractionError("page-limit")
            if fmt == "pdf":
                expected, chars, image_pages = pdf_preflight(data, request)
                result["quality"]["inputTextCharacters"] = chars
                result["quality"]["expectedPages"] = expected
                result["document"]["pageCount"] = expected
            standard = fmt == "pdf" and (request.mode == "standard" or request.mode == "auto" and request.modelDirectory is not None)
            if standard:
                from .model_profile import validate_models
                result["parserProfile"]["modelManifestHash"] = validate_models(request.modelDirectory)
            result["parserProfile"]["pipeline"] = ("docling-standard-cpu-cs-en-v1" if standard else "docling-native-pdf") if fmt == "pdf" else "docling-simple-" + fmt
            conversion = convert(data, fmt, request, standard=standard)
            doc = conversion.document
            if expected is not None:
                # Pinned ODP backend represents processed slides by chapter
                # groups (slide-0...), not DoclingDocument.pages. Inspect its
                # actual page_range-derived output, never fabricate PDF pages.
                pages = ({int(g.name[6:]) + 1 for g in doc.groups if g.name.startswith("slide-") and g.name[6:].isdigit()}
                         if fmt == "odp" else set(doc.pages))
                result["quality"]["expectedPages"] = expected
                result["quality"]["processedPages"] = len(pages)
                if pages != set(range(1, expected + 1)):
                    raise ExtractionError("incomplete-page-set", "review-required")
            blocks, doc_issues, tables = normalize_doc(doc, fmt, request)
            issues.extend(doc_issues)
            if fmt == "pdf":
                if standard:
                    result["quality"]["ocrPages"] = [page.page_no for page in conversion.pages if any(cell.from_ocr for cell in page.cells)]
                    if tables:
                        issues.append("pdf-table-structure-requires-review")
                else:
                    issues.extend(native_layout_issues(doc))
                    if image_pages:
                        issues.append("pdf-page-needs-ocr")
                if not standard and request.mode == "auto" and any(issue in issues for issue in {"pdf-needs-layout", "pdf-page-needs-ocr"}):
                    # Native evidence stays inspectable while a required standard
                    # profile is unavailable; it is never published as complete.
                    issues.append("standard-model-profile-unavailable")
            if original_texts:
                result["quality"]["inputTextCharacters"] = sum(map(len, original_texts))
                normalized = re.sub(r"\s+", " ", "\n".join(b["text"] for b in blocks))
                if any(re.sub(r"\s+", " ", text).strip() not in normalized for text in original_texts if len(text.strip()) >= 3):
                    issues.append("source-text-not-covered")
        result["blocks"] = blocks
        result["quality"]["tableCount"] = tables
        result["quality"]["outputTextCharacters"] = sum(len(b["text"]) for b in blocks)
        if not any(b["text"].strip() for b in blocks):
            issues.append("empty-text")
        if len(blocks) > request.limits.maxBlocks:
            raise ExtractionError("block-limit")
        result["chunks"] = Chunker(request).chunks(blocks)
        for block in blocks:
            block.pop("_table", None)
        result["quality"]["issues"] = sorted(set(issues))
        result["status"] = "review-required" if issues else "ok"
        result["document"]["complete"] = not issues
        if issues:
            result["errorCode"] = "quality-review-required"
        if len(canonical(result).encode("utf-8")) > request.limits.maxOutputBytes:
            raise ExtractionError("output-size-limit")
        return bounded_result(request, result)
    except ExtractionError as error:
        result.update(status=error.status, errorCode=error.code)
    except Exception:
        result.update(status="failed", errorCode="extraction-failed")
    result["document"]["complete"] = False
    result["blocks"], result["chunks"] = [], []
    result["links"] = []
    result["quality"]["outputTextCharacters"] = 0
    result["quality"]["issues"] = sorted(set(result["quality"]["issues"] + [result["errorCode"]]))
    return bounded_result(request, result)
