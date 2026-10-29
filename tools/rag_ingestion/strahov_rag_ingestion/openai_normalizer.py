"""Offline binding of a bounded OpenAI PDF candidate to ordinary worker output."""

import hashlib
import io
import json
import logging
import re
import unicodedata
from collections import Counter
from contextlib import contextmanager
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .contracts import ExtractionError, Request, canonical, digest, empty_result

MAX_CANDIDATE_BYTES = 2 * 1024 * 1024
MAX_PDF_BYTES = 8 * 1024 * 1024
MAX_PAGES, MAX_BLOCKS, MAX_CELLS, MAX_TEXT_UNITS = 20, 2000, 10000, 500000
MAX_NATIVE_FRAGMENTS, MAX_NATIVE_CHARACTERS = 20000, 1000000
MAX_REFERENCED_FORMS, MAX_FORM_DEPTH = 2000, 32
COMPARISON_BUDGET = 200_000_000
HASH = re.compile(r"^[0-9a-f]{64}$")
MODEL = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$")
TEXT_KINDS = {"heading", "paragraph", "list-item", "footnote", "caption"}
GATE = {"id": "native-fragment-coverage-v1", "normalization": "NFKC-remove-whitespace",
        "minimumStrongFraction": 0.8, "strongFragmentCharacters": 12,
        "comparisonBudget": COMPARISON_BUDGET, "tablesRequireReview": True,
        "imagesRequireReview": True, "decodeWarningsRequireReview": True,
        "maxReferencedForms": MAX_REFERENCED_FORMS, "maxFormDepth": MAX_FORM_DEPTH}


class NormalizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schemaVersion: int = Field(ge=1, le=1)
    document: Request
    candidatePath: str
    candidateSha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    expectedProfileId: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("candidatePath")
    @classmethod
    def absolute_candidate(cls, value):
        if not _local_absolute(value):
            raise ValueError("absolute candidate path required")
        return value

    @model_validator(mode="after")
    def local_document_paths(self):
        if not all(_local_absolute(path) for path in [self.document.inputPath, self.document.workDir]):
            raise ValueError("local document paths required")
        return self

    @model_validator(mode="before")
    @classmethod
    def strict_versions(cls, value):
        if type(value) is not dict or type(value.get("schemaVersion")) is not int:
            raise ValueError("invalid schema version")
        doc = value.get("document")
        if isinstance(doc, Request):
            return value
        if type(doc) is not dict or type(doc.get("schemaVersion")) is not int:
            raise ValueError("invalid document version")
        return value


def _local_absolute(value):
    path = Path(value)
    return path.is_absolute() and not path.drive.startswith("\\")


def normalization_failure(document, code, fmt="unknown"):
    result = empty_result(document)
    result["parserProfile"].update(id="openai-pdf-normalizer-v1", pipeline="openai-pdf-preflight")
    result.update(format=fmt, errorCode=code)
    result["quality"]["issues"] = [code]
    return result


def _bounded(document, result):
    if len(canonical(result).encode("utf-8")) <= document.limits.maxOutputBytes:
        return result
    return normalization_failure(document, "output-size-limit", result["format"])

def _invalid():
    raise ExtractionError("invalid-openai-candidate")


def _exact(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        _invalid()


def _integer(value, maximum=2**53 - 1, minimum=0):
    if type(value) is not int or not minimum <= value <= maximum:
        _invalid()
    return value


def _text(value, maximum, empty=True):
    if type(value) is not str or (not empty and not value.strip()):
        _invalid()
    try:
        units = len(value.encode("utf-16-le", errors="strict")) // 2
        value.encode("utf-8", errors="strict")
    except UnicodeError:
        _invalid()
    if units > maximum or any(ord(c) < 32 and c not in "\t\n\r" for c in value):
        _invalid()
    return units


def _hash(value):
    if type(value) is not str or not HASH.fullmatch(value):
        _invalid()


def _api_digest(value):
    # Node adapter canonicalizes object keys. Worker digest deliberately retains
    # its existing serialization; the two identities must not be confused.
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def _identifier(value, prefix):
    if value is not None and (type(value) is not str or not value.startswith(prefix) or
                              not re.fullmatch(r"[a-zA-Z0-9_-]{1,200}", value)):
        _invalid()


def validate_candidate(value, request, expected_pages):
    """Revalidate the complete stored adapter result, including source binding."""
    _exact(value, ["kind", "rawSha256", "extractionKey", "profile", "countRequestHash",
                   "observedModel", "responseId", "pages", "accounting"])
    if value["kind"] != "candidate" or value["rawSha256"] != request.document.inputSha256:
        _invalid()
    _hash(value["countRequestHash"])
    profile = value["profile"]
    _exact(profile, ["id", "version", "provider", "model", "reasoningEffort", "detail", "promptSha256", "schemaSha256"])
    if (type(profile["version"]) is not int or profile["version"] != 1 or profile["provider"] != "openai" or
            type(profile["model"]) is not str or not MODEL.fullmatch(profile["model"]) or
            (profile["reasoningEffort"] is not None and (type(profile["reasoningEffort"]) is not str or
                profile["reasoningEffort"] not in {"none", "minimal", "low", "medium", "high", "xhigh"})) or
            type(profile["detail"]) is not str or profile["detail"] not in {"auto", "low", "high"}):
        _invalid()
    for key in ["id", "promptSha256", "schemaSha256"]:
        _hash(profile[key])
    if (profile["id"] != request.expectedProfileId or
            profile["id"] != _api_digest({key: item for key, item in profile.items() if key != "id"}) or
            value["extractionKey"] != _api_digest(["openai-pdf-v1", value["rawSha256"], profile["id"]])):
        _invalid()
    if type(value["observedModel"]) is not str or not MODEL.fullmatch(value["observedModel"]):
        _invalid()
    _identifier(value["responseId"], "resp_")
    accounting = value["accounting"]
    _exact(accounting, ["phase", "requestHash", "attempted", "requestId", "usage"])
    if accounting["phase"] != "extract" or accounting["attempted"] is not True:
        _invalid()
    _hash(accounting["requestHash"])
    _identifier(accounting["requestId"], "req_")
    usage = accounting["usage"]
    if usage is not None:
        required = {"inputTokens", "outputTokens", "totalTokens"}
        optional = {"cachedInputTokens", "cacheWriteTokens", "reasoningTokens"}
        if type(usage) is not dict or not required <= set(usage) or set(usage) - required - optional:
            _invalid()
        for number in usage.values():
            _integer(number)
        if (usage["totalTokens"] != usage["inputTokens"] + usage["outputTokens"] or
                usage.get("cachedInputTokens", 0) + usage.get("cacheWriteTokens", 0) > usage["inputTokens"] or
                usage.get("reasoningTokens", 0) > usage["outputTokens"]):
            _invalid()
    pages = value["pages"]
    if type(pages) is not list or len(pages) != expected_pages:
        _invalid()
    block_count = cell_count = text_units = expanded = 0
    def text(item, maximum, empty=True):
        nonlocal text_units
        text_units += _text(item, maximum, empty)
        if text_units > MAX_TEXT_UNITS:
            _invalid()
    def headers(items, maximum):
        if type(items) is not list or len(items) > maximum:
            _invalid()
        for index in items:
            _integer(index, maximum - 1)
        if len(set(items)) != len(items):
            _invalid()
    for index, page in enumerate(pages):
        _exact(page, ["page", "blocks", "unresolved"])
        if (_integer(page["page"], expected_pages, 1) != index + 1 or type(page["blocks"]) is not list or
                type(page["unresolved"]) is not list or len(page["unresolved"]) > 100):
            _invalid()
        for block in page["blocks"]:
            block_count += 1
            if block_count > min(MAX_BLOCKS, request.document.limits.maxBlocks) or type(block) is not dict:
                _invalid()
            if type(block.get("kind")) is str and block["kind"] in TEXT_KINDS:
                _exact(block, ["kind", "text"])
                text(block["text"], 100000, False)
                expanded += len(block["text"].encode("utf-8"))
                continue
            _exact(block, ["kind", "rows", "columns", "cells", "headerRows", "headerColumns", "caption", "notes"])
            if block["kind"] != "table":
                _invalid()
            rows, columns = _integer(block["rows"], 1000, 1), _integer(block["columns"], 100, 1)
            if rows * columns > MAX_CELLS or type(block["cells"]) is not list or type(block["notes"]) is not list or len(block["notes"]) > 100:
                _invalid()
            headers(block["headerRows"], rows)
            headers(block["headerColumns"], columns)
            text(block["caption"], 10000)
            for note in block["notes"]:
                text(note, 10000, False)
            expanded += len((block["caption"] + "\n".join(block["notes"])).encode("utf-8"))
            occupied = bytearray(rows * columns)
            for cell in block["cells"]:
                cell_count += 1
                _exact(cell, ["row", "column", "rowSpan", "columnSpan", "text"])
                r, c = _integer(cell["row"], rows - 1), _integer(cell["column"], columns - 1)
                rs, cs = _integer(cell["rowSpan"], rows, 1), _integer(cell["columnSpan"], columns, 1)
                if cell_count > MAX_CELLS or r + rs > rows or c + cs > columns:
                    _invalid()
                text(cell["text"], 20000)
                expanded += (len(canonical({"cell": [r + 1, r + rs, c + 1, c + cs], "text": cell["text"]}).encode("utf-8")) + 1) * rs
                if expanded > request.document.limits.maxOutputBytes:
                    raise ExtractionError("output-size-limit")
                for row in range(r, r + rs):
                    for col in range(c, c + cs):
                        at = row * columns + col
                        if occupied[at]:
                            _invalid()
                        occupied[at] = 1
            if 0 in occupied:
                _invalid()
        for issue in page["unresolved"]:
            _exact(issue, ["kind", "description"])
            if type(issue["kind"]) is not str or issue["kind"] not in {"unreadable", "omitted", "uncertain-structure"}:
                _invalid()
            text(issue["description"], 2000, False)
    if expanded > request.document.limits.maxOutputBytes:
        raise ExtractionError("output-size-limit")
    return value


def _strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                _invalid()
            result[key] = value
        return result
    def invalid_constant(_value):
        _invalid()
    try:
        return json.loads(data.decode("utf-8-sig"), object_pairs_hook=pairs, parse_constant=invalid_constant)
    except (UnicodeError, ValueError, RecursionError) as error:
        raise ExtractionError("invalid-openai-candidate") from error


def _candidate_bytes(request):
    path = Path(request.candidatePath)
    if path.is_symlink() or not path.is_file() or path.resolve() != path.absolute():
        raise ExtractionError("candidate-not-regular-file")
    if path.stat().st_size > MAX_CANDIDATE_BYTES:
        raise ExtractionError("candidate-size-limit")
    with path.open("rb") as handle:
        data = handle.read(MAX_CANDIDATE_BYTES + 1)
    if len(data) > MAX_CANDIDATE_BYTES:
        raise ExtractionError("candidate-size-limit")
    if hashlib.sha256(data).hexdigest() != request.candidateSha256:
        raise ExtractionError("candidate-hash-mismatch")
    return data


def _pdf_bytes(document):
    path = Path(document.inputPath)
    maximum = min(MAX_PDF_BYTES, document.limits.maxInputBytes)
    if path.is_symlink() or not path.is_file() or path.resolve() != path.absolute():
        raise ExtractionError("input-not-regular-file")
    if path.stat().st_size > maximum:
        raise ExtractionError("input-size-limit")
    with path.open("rb") as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ExtractionError("input-size-limit")
    if hashlib.sha256(data).hexdigest() != document.inputSha256:
        raise ExtractionError("input-hash-mismatch")
    if not re.match(rb"%PDF-[0-9]\.[0-9]", data):
        raise ExtractionError("normalizer-requires-pdf", "unsupported")
    return data


def _check_decoded_stream_budget(reader, maximum):
    """Account for referenced text Forms before pypdf's permissive XForm catch."""
    from pypdf.generic import ContentStream
    expanded, heights = 0, {}
    def resolved(value):
        return value.get_object() if hasattr(value, "get_object") else value
    def charge(stream):
        nonlocal expanded
        expanded += len(stream.get_data())
        if expanded > maximum:
            raise ExtractionError("expanded-size-limit")
    def walk(content, resources, ancestors):
        resources = resolved(resources)
        maximum_height = 0
        for operands, operator in content.operations:
            if operator != b"Do":
                continue
            if len(operands) != 1 or not hasattr(resources, "get"):
                raise ExtractionError("native-form-reference-invalid", "review-required")
            objects = resolved(resources.get("/XObject"))
            if not hasattr(objects, "get") or operands[0] not in objects:
                raise ExtractionError("native-form-reference-invalid", "review-required")
            reference = objects.raw_get(operands[0]) if hasattr(objects, "raw_get") else objects[operands[0]]
            form = resolved(reference)
            if not hasattr(form, "get"):
                raise ExtractionError("native-form-reference-invalid", "review-required")
            if form.get("/Subtype") == "/Image":
                continue  # Image decoding is not performed for a native reference.
            if form.get("/Subtype") != "/Form":
                raise ExtractionError("native-form-reference-invalid", "review-required")
            identity = ("indirect", reference.idnum, reference.generation) if hasattr(reference, "idnum") else ("direct", id(form))
            if identity in ancestors or len(ancestors) >= MAX_FORM_DEPTH:
                raise ExtractionError("native-form-cycle-or-depth", "review-required")
            if identity not in heights:
                if len(heights) + len(ancestors) >= MAX_REFERENCED_FORMS:
                    raise ExtractionError("native-reference-limit", "review-required")
                charge(form)
                # Pinned pypdf cannot establish complete inherited Form resources
                # here. Do not silently treat a skipped Form as an empty document.
                if "/Resources" not in form:
                    raise ExtractionError("native-form-resources-unverified", "review-required")
                heights[identity] = 1 + walk(ContentStream(form, reader), form["/Resources"], ancestors | {identity})
            height = heights[identity]
            # A previously visited subtree may later be referenced through a
            # deeper path. Charge it once, but check its full height each time.
            if len(ancestors) + height > MAX_FORM_DEPTH:
                raise ExtractionError("native-form-cycle-or-depth", "review-required")
            maximum_height = max(maximum_height, height)
        return maximum_height
    for page in reader.pages:
        content = page.get_contents()
        if content is not None:
            charge(content)
            walk(content, page.get("/Resources"), set())


@contextmanager
def _decode_warnings():
    # This runs in the owned fresh worker. Restore caller logging configuration
    # for direct tests; collect only a boolean, never source-bearing log text.
    class Watch(logging.Handler):
        seen = False
        def emit(self, record):
            benign_header_space = (record.name == "pypdf._reader" and isinstance(record.msg, str) and
                                   record.msg.startswith("Superfluous whitespace found in object header"))
            if record.levelno >= logging.WARNING and not benign_header_space:
                self.seen = True
    watch = Watch()
    family = logging.getLogger("pypdf")
    loggers = [family, *[logger for name, logger in logging.root.manager.loggerDict.items()
                        if name.startswith("pypdf.") and isinstance(logger, logging.Logger)]]
    previous = [(logger, logger.level, logger.disabled, logger.propagate) for logger in loggers]
    disabled = logging.root.manager.disable
    try:
        logging.disable(logging.NOTSET)
        for logger in loggers:
            logger.disabled = False
            logger.setLevel(logging.WARNING)
            logger.propagate = True
        family.addHandler(watch)
        yield watch
    finally:
        family.removeHandler(watch)
        for logger, level, old_disabled, old_propagate in previous:
            logger.setLevel(level)
            logger.disabled = old_disabled
            logger.propagate = old_propagate
        logging.disable(disabled)


def _pdf_reference(data, request):
    with _decode_warnings() as warnings:
        result = _pdf_reference_content(data, request)
    for page in result:
        page["decodeWarnings"] = warnings.seen
    return result


def _pdf_reference_content(data, request):
    from pypdf import PdfReader, filters
    from pypdf.errors import LimitReachedError
    limits = request.document.limits
    names = ["ZLIB_MAX_OUTPUT_LENGTH", "LZW_MAX_OUTPUT_LENGTH", "RUN_LENGTH_MAX_OUTPUT_LENGTH"]
    previous = {name: getattr(filters, name) for name in names}
    try:
        for name in names:
            setattr(filters, name, min(previous[name], limits.maxExpandedBytes))
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted:
            raise ExtractionError("encrypted-pdf", "unsupported")
        if not 1 <= len(reader.pages) <= min(MAX_PAGES, limits.maxPages):
            raise ExtractionError("page-limit")
        _check_decoded_stream_budget(reader, limits.maxExpandedBytes)
        result, characters, fragment_count = [], 0, 0
        for page in reader.pages:
            fragments = []
            exceeded = False
            def visitor(text, *_args):
                nonlocal fragment_count, characters, exceeded
                if text.strip():
                    fragment_count += 1
                    characters += len(text)
                    if fragment_count > MAX_NATIVE_FRAGMENTS or characters > MAX_NATIVE_CHARACTERS:
                        exceeded = True
                        raise ExtractionError("native-reference-limit", "review-required")
                    fragments.append(text)
            native = page.extract_text(visitor_text=visitor) or ""
            # pypdf catches visitor exceptions inside Form XObjects. The sticky
            # flag survives that catch and forbids accepting a partial reference.
            if exceeded:
                raise ExtractionError("native-reference-limit", "review-required")
            if len(native) > MAX_NATIVE_CHARACTERS:
                raise ExtractionError("native-reference-limit", "review-required")
            result.append({"text": native, "fragments": fragments, "hasImages": len(page.images) > 0})
        return result
    except ExtractionError:
        raise
    except LimitReachedError as error:
        raise ExtractionError("expanded-size-limit") from error
    except Exception as error:
        raise ExtractionError("invalid-pdf") from error
    finally:
        for name, value in previous.items():
            setattr(filters, name, value)


def _units(page):
    units = []
    for block in page["blocks"]:
        if block["kind"] != "table":
            units.append(block["text"])
        else:
            units.append(block["caption"])
            units.extend(cell["text"] for cell in sorted(block["cells"], key=lambda c: (c["row"], c["column"])))
            units.extend(block["notes"])
    return units


def _compact(value):
    return "".join(char for char in unicodedata.normalize("NFKC", value) if not char.isspace())


def native_fidelity_issues(references, pages):
    """Conservative coverage heuristic; not a universal layout/semantic proof."""
    issues, scanned = set(), 0
    for reference, page in zip(references, pages, strict=True):
        if reference.get("decodeWarnings"):
            issues.add("native-reference-decode-warning")
        if page["unresolved"]:
            issues.add("openai-unresolved")
        if any(block["kind"] == "table" for block in page["blocks"]):
            issues.add("openai-table-semantics-unverified")
        if reference["hasImages"]:
            issues.add("native-page-images-unverified")
        if not reference["text"].strip():
            issues.add("native-text-reference-unavailable")
            continue
        units = _units(page)
        source = _compact(reference["text"])
        candidate = _compact("".join(units))
        if Counter(re.findall(r"\d+", reference["text"])) != Counter(re.findall(r"\d+", "\n".join(units))):
            issues.add("native-numbers-not-preserved")
        if Counter(source) != Counter(candidate):
            issues.add("native-characters-not-preserved")
        if source == candidate:
            continue
        fragments = [_compact(text) for text in reference["fragments"] if _compact(text)]
        if not fragments or sum(len(x) for x in fragments if len(x) >= 12) < 0.8 * sum(map(len, fragments)):
            issues.add("native-reference-too-fragmented")
        counted = Counter(fragments)
        distinct_units = {_compact(unit) for unit in units if _compact(unit)}
        scanned += len(candidate) * len(counted) + len(source) * len(distinct_units)
        if scanned > COMPARISON_BUDGET:
            issues.add("native-reference-comparison-budget")
            continue
        if any(candidate.count(fragment) < count for fragment, count in counted.items()):
            issues.add("native-fragments-not-covered")
        if any(unit not in source for unit in distinct_units):
            issues.add("candidate-text-not-in-native")
    return sorted(issues)


def _table_data(block):
    from docling_core.types.doc import DoclingDocument, DocItemLabel, TableCell, TableData
    from .docling_adapter import serialize_table
    document = DoclingDocument(name="OpenAI table normalization")
    cells = [TableCell(start_row_offset_idx=c["row"], end_row_offset_idx=c["row"] + c["rowSpan"],
                       start_col_offset_idx=c["column"], end_col_offset_idx=c["column"] + c["columnSpan"],
                       row_span=c["rowSpan"], col_span=c["columnSpan"], text=c["text"],
                       row_header=c["column"] in block["headerColumns"])
             for c in sorted(block["cells"], key=lambda c: (c["row"], c["column"]))]
    caption = document.add_text(label=DocItemLabel.CAPTION, text=block["caption"]) if block["caption"] else None
    item = document.add_table(data=TableData(num_rows=block["rows"], num_cols=block["columns"], table_cells=cells), caption=caption)
    for note in block["notes"]:
        item.footnotes.append(document.add_text(label=DocItemLabel.FOOTNOTE, text=note).get_ref())
    return serialize_table(item, document, header_rows_override=block["headerRows"])


def _blocks(request, candidate):
    blocks, headings, duplicates = [], [], Counter()
    kinds = {"heading": "section_header", "paragraph": "text", "list-item": "list_item", "footnote": "footnote", "caption": "caption"}
    for page in candidate["pages"]:
        for item in page["blocks"]:
            table = _table_data(item) if item["kind"] == "table" else None
            kind, text = ("table", table["text"]) if table else (kinds[item["kind"]], item["text"])
            if item["kind"] == "heading":
                headings = [text]  # Candidate has no hierarchy level; do not invent one.
            ordinal = duplicates[(kind, tuple(headings), text)]
            duplicates[(kind, tuple(headings), text)] += 1
            block_id = "b-" + digest([request.sourceId, kind, headings, text, ordinal])
            block = {"id": block_id, "kind": kind, "text": text, "headingPath": list(headings),
                     "spans": [{"blockId": block_id, "locator": f"PDF page {page['page']}; {block_id}", "page": page["page"]}]}
            if table:
                block.update(_table=table, tableChunking=table["lineage"])
            blocks.append(block)
    return blocks


def normalize(request: NormalizationRequest):
    from .chunking import Chunker
    from .worker import implementation_hash, package_versions, tokenizer_ready
    doc = request.document
    result = empty_result(doc)
    result["parserProfile"].update(id="openai-pdf-normalizer-v1", pipeline="openai-pdf-preflight")
    try:
        for value in [doc.sourceId, doc.sourceUrl, doc.title, doc.filename, doc.mime or ""]:
            _text(value, 8192)
        data = _pdf_bytes(doc)
        result["format"] = "pdf"
        value = _strict_json(_candidate_bytes(request))
        if type(value) is not dict or type(value.get("pages")) is not list or not 1 <= len(value["pages"]) <= min(MAX_PAGES, doc.limits.maxPages):
            _invalid()
        candidate = validate_candidate(value, request, len(value["pages"]))
        references = _pdf_reference(data, request)
        if len(candidate["pages"]) != len(references):
            raise ExtractionError("candidate-page-mismatch")
        result["parserProfile"].update(packages=package_versions(), pipeline="openai-pdf:" + candidate["profile"]["model"],
            configurationHash=digest({"normalizer": 1, "implementationSha256": implementation_hash(),
                "apiProfile": candidate["profile"], "observedModel": candidate["observedModel"], "gate": GATE,
                "sourceContext": {"sourceId": doc.sourceId, "sourceUrl": doc.sourceUrl, "title": doc.title,
                                  "mime": doc.mime, "filename": doc.filename},
                "limits": doc.limits.model_dump(), "inputVersion": "title-heading-text-v2"}))
        tokenizer_ready()
        issues = native_fidelity_issues(references, candidate["pages"])
        blocks = _blocks(doc, candidate)
        if not any(block["text"].strip() for block in blocks):
            issues.append("empty-text")
        result["document"]["pageCount"] = len(references)
        result["quality"].update(processedPages=len(references), expectedPages=len(references),
            inputTextCharacters=sum(len(page["text"]) for page in references),
            outputTextCharacters=sum(len(block["text"]) for block in blocks),
            tableCount=sum(block["kind"] == "table" for block in blocks),
            ocrPages=[index + 1 for index, page in enumerate(references) if not page["text"].strip()])
        result["blocks"] = blocks
        result["chunks"] = Chunker(doc).chunks(blocks)
        for block in blocks:
            block.pop("_table", None)
        result["quality"]["issues"] = sorted(set(issues))
        result["status"] = "review-required" if issues else "ok"
        result["document"]["complete"] = not issues
        if issues:
            result["errorCode"] = "quality-review-required"
        return _bounded(doc, result)
    except ExtractionError as error:
        result.update(status=error.status, errorCode=error.code)
    except Exception:
        result.update(status="failed", errorCode="normalization-failed")
    result["document"]["complete"] = False
    result["blocks"], result["chunks"] = [], []
    result["quality"]["outputTextCharacters"] = 0
    result["quality"]["issues"] = [result["errorCode"]]
    return _bounded(doc, result)
