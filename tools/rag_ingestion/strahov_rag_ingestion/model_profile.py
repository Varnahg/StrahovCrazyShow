"""Pinned optional CPU inference; model provisioning is never implicit."""

import hashlib
import json
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from .contracts import ExtractionError

MANIFEST_PATH = Path(__file__).with_name("models-manifest.json")


def validate_models(directory):
    if directory is None:
        raise ExtractionError("standard-model-profile-unavailable", "review-required")
    root = Path(directory)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ExtractionError("model-directory-unavailable", "review-required")
    manifest_bytes = MANIFEST_PATH.read_bytes()
    manifest = json.loads(manifest_bytes)
    for item in manifest["files"]:
        path = root / item["path"]
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
            raise ExtractionError("model-file-unavailable", "review-required")
        if path.stat().st_size != item["bytes"]:
            raise ExtractionError("model-integrity-failed")
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != item["sha256"]:
            raise ExtractionError("model-integrity-failed")
    return hashlib.sha256(manifest_bytes).hexdigest()


def standard_pdf_option(request):
    try:
        required = {"torch": "2.9.1+cpu", "torchvision": "0.24.1+cpu", "easyocr": "1.7.2", "docling-ibm-models": "4.0.4"}
        if any(version(package) != expected for package, expected in required.items()):
            raise ExtractionError("cpu-model-package-mismatch", "review-required")
    except PackageNotFoundError as error:
        raise ExtractionError("standard-model-profile-unavailable", "review-required") from error
    import torch
    if torch.version.cuda is not None:
        raise ExtractionError("cpu-only-profile-required")
    torch.set_num_threads(1)
    from docling.document_converter import PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions
    from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice
    from docling.datamodel.backend_options import ThreadedDoclingParseBackendOptions
    return PdfFormatOption(pipeline_options=PdfPipelineOptions(
        artifacts_path=Path(request.modelDirectory),
        accelerator_options=AcceleratorOptions(device=AcceleratorDevice.CPU, num_threads=1),
        do_ocr=True, do_table_structure=True,
        ocr_options=EasyOcrOptions(lang=["cs", "en"], download_enabled=False),
        document_timeout=request.limits.timeoutSeconds, generate_parsed_pages=True,
        enable_remote_services=False, allow_external_plugins=False),
        backend_options=ThreadedDoclingParseBackendOptions(parser_threads=1))
