"""Preflight containers before giving bytes to format backends."""

import codecs
import hashlib
import io
import re
import stat
import zipfile
from pathlib import Path, PurePosixPath

from defusedxml import ElementTree

from .contracts import ExtractionError, Request


def safe_xml(data: bytes):
    try:
        return ElementTree.fromstring(data, forbid_dtd=True, forbid_entities=True,
                                      forbid_external=True)
    except Exception as error:
        raise ExtractionError("unsafe-or-invalid-xml") from error


def decode_text(data: bytes, mime: str | None = None, html: bool = False) -> str:
    charset = None
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        charset = "utf-16"
    elif data.startswith(codecs.BOM_UTF8):
        charset = "utf-8-sig"
    if charset is None:
        match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", mime or "", re.I)
        if not match and html:
            match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", data[:8192].decode("ascii", "ignore"), re.I)
        charset = match.group(1) if match else "utf-8"
    try:
        text = data.decode(charset, errors="strict")
    except (LookupError, UnicodeError) as error:
        raise ExtractionError("unknown-or-invalid-charset", "review-required") from error
    if "\x00" in text or any(ord(c) < 32 and c not in "\t\r\n\f" for c in text):
        raise ExtractionError("binary-or-invalid-text", "unsupported")
    return text


def inspect_zip(data: bytes, request: Request) -> tuple[str, list[str]]:
    issues = []
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        with archive:
            infos = archive.infolist()
            if len(infos) > 10_000 or sum(x.file_size for x in infos) > request.limits.maxExpandedBytes:
                raise ExtractionError("expanded-size-limit")
            names = set()
            xml_parts = {}
            for item in infos:
                path = PurePosixPath(item.filename.replace("\\", "/"))
                normalized = str(path).casefold()
                if path.is_absolute() or ".." in path.parts or ":" in item.filename or normalized in names:
                    raise ExtractionError("unsafe-zip-path")
                if stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1:
                    raise ExtractionError("unsafe-zip-entry")
                names.add(normalized)
                if item.filename.lower().endswith((".xml", ".rels")):
                    # LibreOffice emits an empty accelerator configuration part;
                    # it is not document XML and has no entity/content to parse.
                    if item.file_size == 0 and item.filename.startswith("Configurations2/"):
                        continue
                    xml_parts[item.filename] = safe_xml(archive.read(item))
            if "[content_types].xml" in names:
                if "word/document.xml" in names:
                    fmt = "docx"
                elif "xl/workbook.xml" in names:
                    fmt = "xlsx"
                elif "ppt/presentation.xml" in names:
                    fmt = "pptx"
                else:
                    raise ExtractionError("unsupported-ooxml", "unsupported")
                for name, root in xml_parts.items():
                    if name.endswith(".rels"):
                        for relationship in root:
                            if relationship.attrib.get("TargetMode") == "External" and not relationship.attrib.get("Type", "").endswith("/hyperlink"):
                                issues.append("external-document-relationship")
                    if any(e.tag.rsplit("}", 1)[-1] in {"ins", "del", "moveFrom", "moveTo"} for e in root.iter()):
                        issues.append("unaccepted-tracked-changes")
                    if fmt == "xlsx" and name.startswith("xl/worksheets/") and any(e.tag.rsplit("}", 1)[-1] == "f" for e in root.iter()):
                        issues.append("spreadsheet-formula-values-require-review")
                if any("vbaproject" in name or "/embeddings/" in name for name in names):
                    issues.append("embedded-active-or-opaque-content")
                if fmt == "docx" and any(name in names for name in ("word/footnotes.xml", "word/endnotes.xml")):
                    issues.append("notes-require-fidelity-review")
                return fmt, sorted(set(issues))
            if "mimetype" in names and "content.xml" in names:
                mime = archive.read("mimetype").decode("ascii", "strict")
                formats = {"text": "odt", "spreadsheet": "ods", "presentation": "odp"}
                fmt = formats.get(mime.removeprefix("application/vnd.oasis.opendocument."))
                if fmt:
                    if fmt == "ods" and any(any(key.rsplit("}", 1)[-1] == "formula" for key in element.attrib)
                                            for element in xml_parts["content.xml"].iter()):
                        issues.append("spreadsheet-formula-values-require-review")
                    return fmt, issues
            raise ExtractionError("unsupported-zip-container", "unsupported")
    except ExtractionError:
        raise
    except Exception as error:
        raise ExtractionError("invalid-zip-container") from error


def inspect_input(request: Request) -> tuple[bytes, str, list[str]]:
    path = Path(request.inputPath)
    if path.is_symlink() or not path.is_file():
        raise ExtractionError("input-not-regular-file")
    if path.stat().st_size > request.limits.maxInputBytes:
        raise ExtractionError("input-size-limit")
    data = path.read_bytes()
    if len(data) > request.limits.maxInputBytes:
        raise ExtractionError("input-size-limit")
    if hashlib.sha256(data).hexdigest() != request.inputSha256:
        raise ExtractionError("input-hash-mismatch")
    if data.startswith(b"%PDF-"):
        return data, "pdf", []
    if data.startswith(b"PK"):
        fmt, issues = inspect_zip(data, request)
        return data, fmt, issues
    if data.startswith(b"\xd0\xcf\x11\xe0") or data.lstrip().startswith(b"{\\rtf"):
        raise ExtractionError("legacy-converter-unavailable", "unsupported")
    text = decode_text(data, request.mime, html=True)
    start = text.lstrip().lower()
    if re.search(r"<(?:!doctype\s+html|html|head|body|main|article)(?:\s|>)", start[:8192]):
        return data, "html", []
    if start.startswith("<?xml") or re.match(r"<(rss|feed)(?:\s|>)", start):
        root = safe_xml(data)
        if root.tag.rsplit("}", 1)[-1] in {"rss", "feed"}:
            return data, "feed", []
        raise ExtractionError("unsupported-xml", "unsupported")
    extension = Path(request.filename).suffix.lower()
    formats = {".csv": "csv", ".tsv": "tsv", ".md": "md", ".markdown": "md", ".txt": "txt"}
    fmt = formats.get(extension)
    if not fmt and (request.mime or "").split(";")[0] == "text/plain":
        fmt = "txt"
    if not fmt:
        raise ExtractionError("unsupported-format", "unsupported")
    return data, fmt, []
