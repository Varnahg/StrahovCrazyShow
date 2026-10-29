"""Pinned Docling integration, with conservative PDF routing and provenance."""

import io
from collections import Counter

from pypdf import PdfReader

from .contracts import ExtractionError, canonical, digest


def pdf_preflight(data, request):
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ExtractionError("encrypted-pdf", "unsupported")
        if len(reader.pages) > request.limits.maxPages:
            raise ExtractionError("page-limit")
        texts = [page.extract_text() or "" for page in reader.pages]
        return len(texts), sum(map(len, texts)), [i + 1 for i, text in enumerate(texts) if not text.strip()]
    except ExtractionError:
        raise
    except Exception as error:
        raise ExtractionError("invalid-pdf") from error


def normalize_doc(document, fmt, request):
    from docling_core.types.doc import ContentLayer

    blocks, issues, headings, duplicates = [], [], [], Counter()
    if document.pictures:
        # Includes pictures nested in rich table cells, whose descendants are
        # incorporated into the table and skipped by the outer item traversal.
        issues.append("unrepresented-image")
    tables = 0
    covered = set()
    current_container = None
    for item, _ in document.iterate_items(included_content_layers=set(ContentLayer), traverse_pictures=True):
        raw = item.model_dump(mode="json")
        ref = raw.get("self_ref", "")
        if ref in covered:
            continue
        kind = raw.get("label", "unknown")
        text = raw.get("text", "")
        if kind == "list_item" and raw.get("marker"):
            text = raw["marker"] + " " + text
        parent = item.parent.resolve(document) if item.parent else None
        slide_no = None
        while parent is not None:
            name = getattr(parent, "name", "")
            if fmt == "odp" and name.startswith("slide-") and name[6:].isdigit():
                slide_no = int(name[6:]) + 1
            if fmt in {"xlsx", "ods"} and getattr(parent, "label", None) and parent.label.value == "sheet":
                if current_container != parent.self_ref:
                    current_container, headings = parent.self_ref, [name]
            parent = parent.parent.resolve(document) if parent.parent else None
        table_data = None
        if kind == "section_header":
            level = max(1, raw.get("level", 1))
            headings = headings[:level - 1] + [text]
        elif kind == "title" and text:
            headings = [text]
        if kind == "table":
            tables += 1
            table_data = serialize_table(item, document)
            text = table_data["text"]
            if table_data["unrepresentedRows"]:
                issues.append("unrepresented-table-row")
            # Rich cells are part of the table; don't duplicate their descendants.
            for child, _ in document.iterate_items(root=item, included_content_layers=set(ContentLayer)):
                if child.self_ref != item.self_ref:
                    covered.add(child.self_ref)
        if kind == "picture":
            issues.append("unrepresented-image")
        if not text and kind in {"text", "paragraph", "list_item", "section_header"}:
            continue
        if not text and kind != "picture":
            issues.append("unrepresented-document-item")
        ordinal = duplicates[(kind, tuple(headings), text)]
        duplicates[(kind, tuple(headings), text)] += 1
        block_id = "b-" + digest([request.sourceId, kind, headings, text, ordinal])
        spans = []
        for provenance in raw.get("prov", []):
            page = provenance.get("page_no")
            span = {"blockId": block_id, "locator": f"{fmt.upper()} page {page}; {ref}"}
            if fmt == "pdf":
                span["page"] = page
                bbox = provenance.get("bbox")
                if bbox:
                    span["bbox"] = {"left": bbox["l"], "top": bbox["t"], "right": bbox["r"], "bottom": bbox["b"],
                        "origin": "bottom-left" if bbox["coord_origin"] == "BOTTOMLEFT" else "top-left", "unit": "pt"}
            elif fmt in {"pptx", "odp"}:
                span["locator"] = f"{fmt.upper()} slide {page}; {ref}"
            elif fmt in {"xlsx", "ods"}:
                span["locator"] = f"{fmt.upper()} sheet {page}; {ref}"
            spans.append(span)
        if not spans:
            locator = f"{fmt.upper()} {kind} {ref}"
            if table_data:
                locator = f"{fmt.upper()} table {tables}, rows 1-{item.data.num_rows}; {ref}"
            if slide_no is not None:
                locator = f"ODP slide {slide_no}; {kind} {ref}"
            spans = [{"blockId": block_id, "locator": locator}]
        block = {"id": block_id, "kind": kind, "text": text, "headingPath": list(headings), "spans": spans}
        if table_data:
            block["_table"] = table_data
            block["tableChunking"] = table_data["lineage"]
        blocks.append(block)
        if len(blocks) > request.limits.maxBlocks:
            raise ExtractionError("block-limit")
    return blocks, sorted(set(issues)), tables


def serialize_table(item, document):
    data = item.data
    rows = [[] for _ in range(data.num_rows)]
    header_rows = set()
    for cell in data.table_cells:
        raw = cell.model_dump(mode="json")
        value = cell.text
        if raw.get("ref"):
            resolved = raw["ref"]["cref"]
            from docling_core.types.doc import RefItem
            node = RefItem(cref=resolved).resolve(document)
            value = "\n".join(getattr(child, "text", "") for child, _ in document.iterate_items(root=node)).strip() or value
        # JSON string escaping preserves embedded tabs/newlines and makes a
        # merged cell's true rectangle explicit instead of duplicating values.
        coordinates = [cell.start_row_offset_idx + 1, cell.end_row_offset_idx,
                       cell.start_col_offset_idx + 1, cell.end_col_offset_idx]
        for row_index in range(cell.start_row_offset_idx, cell.end_row_offset_idx):
            # Carry a vertically merged cell into every covered logical row;
            # each independently retrieved chunk retains its category/context.
            rows[row_index].append(canonical({"cell": coordinates, "text": value}))
        if cell.column_header:
            header_rows.update(range(cell.start_row_offset_idx, cell.end_row_offset_idx))
    lines = ["\t".join(row) for row in rows]
    # Source text and repeated header/body must share the same rendered rows.
    # A declared row with no parsed cells is unknown, not evidence of blank data.
    rendered = [(index, line) for index, line in enumerate(lines) if line]
    unrepresented = [index for index, line in enumerate(lines) if not line]
    # If the format declares no headers, don't invent them from a data row.
    header = "\n".join(line for index, line in rendered if index in header_rows)
    body = [line for index, line in rendered if index not in header_rows]
    caption = item.caption_text(document)
    notes = []
    for note in item.footnotes:
        node = note.resolve(document)
        notes.append(getattr(node, "text", ""))
    context = "\n".join([value for value in [caption, *notes] if value])
    context_lines = len(context.split("\n")) if context else 0
    lineage = {"contextLineCount": context_lines,
               "headerLineIndexes": [context_lines + rendered_index
                                     for rendered_index, (source_index, _) in enumerate(rendered)
                                     if source_index in header_rows]}
    return {"header": header, "rows": body, "context": context,
            "text": "\n".join([value for value in [context, *(line for _, line in rendered)] if value]),
            "lineage": lineage, "unrepresentedRows": unrepresented}


def native_layout_issues(document):
    # Native cells must be near a single left margin and in top-to-bottom
    # order. This deliberately routes uncertain alignment (including tables)
    # to layout inference instead of promising a general PDF reading order.
    issues = []
    for page_no, page in document.pages.items():
        cells = []
        for item, _ in document.iterate_items(page_no=page_no):
            if getattr(item, "text", "").strip() and item.prov:
                box = item.prov[0].bbox.to_top_left_origin(page.size.height)
                cells.append((box.l, box.t, box.r))
        if not cells:
            issues.append("pdf-page-needs-ocr")
            continue
        left = min(cell[0] for cell in cells)
        shifted = sum(1 for x, _, right in cells if x - left > page.size.width * .28 and right - x < page.size.width * .65)
        aligned_rows = Counter(round(top / 3) for _, top, _ in cells)
        if shifted >= 2 or sum(count > 1 for count in aligned_rows.values()) >= 2 or any(cells[i][1] + 4 < cells[i-1][1] for i in range(1, len(cells))):
            issues.append("pdf-needs-layout")
    return sorted(set(issues))


def _convert_html(data, request):
    # The pinned declarative backend materializes a DoclingDocument directly.
    # Avoid general converter/enrichment initialization for this format only.
    from docling.backend.html_backend import HTMLDocumentBackend
    from docling.datamodel.backend_options import HTMLBackendOptions
    from docling.datamodel.base_models import ConversionStatus, InputFormat
    from docling.datamodel.document import ConversionResult, InputDocument
    from docling.datamodel.settings import DocumentLimits

    with io.BytesIO(data) as stream:
        input_document = None
        try:
            input_document = InputDocument(stream, format=InputFormat.HTML,
                backend=HTMLDocumentBackend, filename="input.html",
                backend_options=HTMLBackendOptions(fetch_images=False),
                limits=DocumentLimits(max_num_pages=request.limits.maxPages,
                                      max_file_size=request.limits.maxInputBytes))
            if not input_document.valid:
                raise ExtractionError("parser-incomplete", "review-required")
            try:
                document = input_document._backend.convert()
            except Exception as error:
                # Same failed-conversion boundary as raises_on_error=False in
                # DocumentConverter, never a partially accepted document.
                raise ExtractionError("parser-incomplete", "review-required") from error
            return ConversionResult(input=input_document, document=document,
                                    status=ConversionStatus.SUCCESS)
        finally:
            backend = getattr(input_document, "_backend", None)
            if backend is not None:
                backend.unload()


def convert(data, fmt, request, standard=False):
    if fmt == "html":
        return _convert_html(data, request)
    from docling.document_converter import DocumentConverter, NativePdfFormatOption, MarkdownFormatOption, WordFormatOption, ExcelFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import NativePdfPipelineOptions
    from docling.datamodel.backend_options import MarkdownBackendOptions, MsWordBackendOptions, MsExcelBackendOptions
    from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice
    from docling_core.types.io import DocumentStream

    input_format = InputFormat(fmt)
    options = {}
    if fmt == "pdf":
        if standard:
            from .model_profile import standard_pdf_option
            options[input_format] = standard_pdf_option(request)
        else:
            options[input_format] = NativePdfFormatOption(pipeline_options=NativePdfPipelineOptions(
                parser_threads=1, generate_page_images=False, generate_picture_images=False,
                accelerator_options=AcceleratorOptions(device=AcceleratorDevice.CPU, num_threads=1),
                document_timeout=request.limits.timeoutSeconds, enable_remote_services=False, allow_external_plugins=False))
    elif fmt == "md":
        options[input_format] = MarkdownFormatOption(backend_options=MarkdownBackendOptions(fetch_images=False))
    elif fmt == "docx":
        options[input_format] = WordFormatOption(backend_options=MsWordBackendOptions(
            max_total_bytes=request.limits.maxExpandedBytes, max_file_bytes=request.limits.maxExpandedBytes))
    elif fmt == "xlsx":
        options[input_format] = ExcelFormatOption(backend_options=MsExcelBackendOptions(
            max_total_bytes=request.limits.maxExpandedBytes, max_file_bytes=request.limits.maxExpandedBytes))
    converter = DocumentConverter(allowed_formats=[input_format], format_options=options)
    result = converter.convert(DocumentStream(name="input." + fmt, stream=io.BytesIO(data)),
        raises_on_error=False, max_num_pages=request.limits.maxPages, max_file_size=request.limits.maxInputBytes)
    if result.status.value != "success" or result.errors:
        raise ExtractionError("parser-incomplete", "review-required")
    return result
