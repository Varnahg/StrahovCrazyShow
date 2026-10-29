import io
import json
import os
import subprocess
import sys
from types import SimpleNamespace

import pytest

from strahov_rag_ingestion import docling_adapter, worker
from strahov_rag_ingestion.contracts import ExtractionError


HTML = '''<html><body><main><h1>Pravidla</h1>
<p>Sleva neplatí; dluh -1500 Kč.</p><ol><li>Neplatit podruhé.</li></ol>
<table><caption>Poplatky</caption><tr><th>Položka</th><th>Kč</th></tr>
<tr><td rowspan="2">Student</td><td>250</td></tr><tr><td>-30</td></tr></table>
<img src="https://example.test/image.png" alt="Schéma">
<a href="/rules.pdf">Řád</a></main></body></html>'''.encode()


def test_package_versions_reads_each_metadata_once_and_preserves_values(request_for, monkeypatch):
    class Distribution:
        def __init__(self, fields):
            self.fields, self.reads = fields, 0

        @property
        def metadata(self):
            self.reads += 1
            return dict(self.fields)

        @property
        def version(self):
            return self.metadata["Version"]

    distributions = [Distribution({"Name": "Example-Package", "Version": "1.2.3"}),
                     Distribution({"Name": "PYTEST", "Version": "8.4.2"}),
                     Distribution({"Version": "missing-name"})]
    monkeypatch.setattr(worker, "distributions", lambda: iter(distributions))
    result = worker.run(request_for(b"Complete source text"))
    assert result["status"] == "ok", result
    assert result["parserProfile"]["packages"] == {"example-package": "1.2.3"}
    assert [item.reads for item in distributions] == [1, 1, 1]


def test_html_does_not_require_converter_and_preserves_quality(request_for, monkeypatch):
    monkeypatch.setitem(sys.modules, "docling.document_converter", None)
    monkeypatch.setattr(worker, "distributions", lambda: [])
    result = worker.run(request_for(HTML, "full.html", mime="text/html; charset=utf-8"))
    assert result["status"] == "review-required", result
    assert result["quality"]["issues"] == ["unrepresented-image"]
    assert not result["document"]["complete"]
    assert result["quality"]["tableCount"] == 1
    text = "\n".join(block["text"] for block in result["blocks"])
    assert "Sleva neplatí; dluh -1500 Kč." in text
    assert "Neplatit podruhé." in text
    assert all(value in text for value in ("Student", "250", "-30", "Poplatky"))
    assert [link["href"] for link in result["links"]] == ["https://example.test/rules.pdf"]
    assert result["chunks"]
    assert all("page" not in span and "bbox" not in span for block in result["blocks"] for span in block["spans"])
    assert result["parserProfile"]["pipeline"] == "docling-simple-html"
    assert result["parserProfile"]["modelManifestHash"] is None


@pytest.mark.parametrize("failure", [None, "invalid-backend", "conversion", "size-limit", "constructor", "unload"])
def test_html_input_guard_and_resource_cleanup(request_for, monkeypatch, failure):
    from docling.backend.html_backend import HTMLDocumentBackend
    from docling.datamodel.document import ConversionResult, InputDocument

    streams, inputs, unloaded = [], [], []
    original_init = HTMLDocumentBackend.__init__
    original_convert = HTMLDocumentBackend.convert
    original_unload = HTMLDocumentBackend.unload

    def stream(data):
        value = io.BytesIO(data)
        streams.append(value)
        return value

    def initialize(self, in_doc, path_or_stream, options=None):
        inputs.append((in_doc, options))
        if failure == "constructor":
            raise RuntimeError("synthetic constructor failure")
        original_init(self, in_doc, path_or_stream, options)

    def convert(self):
        if failure == "conversion":
            raise RuntimeError("synthetic conversion failure")
        return original_convert(self)

    def unload(self):
        unloaded.append(self)
        if failure == "unload":
            raise RuntimeError("synthetic cleanup failure")
        original_unload(self)

    monkeypatch.setattr(docling_adapter, "io", SimpleNamespace(BytesIO=stream))
    monkeypatch.setattr(HTMLDocumentBackend, "__init__", initialize)
    monkeypatch.setattr(HTMLDocumentBackend, "convert", convert)
    monkeypatch.setattr(HTMLDocumentBackend, "unload", unload)
    if failure == "invalid-backend":
        monkeypatch.setattr(HTMLDocumentBackend, "is_valid", lambda self: False)
    request = request_for(HTML, "cleanup.html", mime="text/html; charset=utf-8")
    if failure == "size-limit":
        request.limits.maxInputBytes = len(HTML) - 1
    if failure is None:
        result = docling_adapter.convert(HTML, "html", request)
        assert isinstance(result, ConversionResult)
        assert result.status.value == "success" and not result.errors
        # The materialized model must remain usable after source cleanup.
        blocks, issues, tables = docling_adapter.normalize_doc(result.document, "html", request)
        assert tables == 1 and "unrepresented-image" in issues
        assert any("neplatí" in block["text"] for block in blocks)
        assert result.document.model_dump(mode="json")["tables"]
    else:
        with pytest.raises((ExtractionError, RuntimeError)):
            docling_adapter.convert(HTML, "html", request)
    assert len(streams) == 1 and streams[0].closed
    assert len(unloaded) == (0 if failure in {"size-limit", "constructor"} else 1)
    if inputs:
        in_doc, options = inputs[0]
        assert isinstance(in_doc, InputDocument)
        assert in_doc.limits.max_file_size == request.limits.maxInputBytes
        assert in_doc.limits.max_num_pages == request.limits.maxPages
        assert options.fetch_images is False
        assert options.enable_remote_fetch is False and options.enable_local_fetch is False
        assert options.render_page is False


def test_html_fresh_process_blocks_converter_pipeline_and_factories(request_for):
    request = request_for(HTML, "isolated.html", mime="text/html; charset=utf-8")
    script = '''import importlib.abc,json,socket,sys
class BlockHeavy(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == "docling.document_converter" or fullname.startswith(("docling.pipeline", "docling.models.factories", "docling.models.stages")):
            raise AssertionError("HTML attempted a general converter/pipeline/factory import: " + fullname)
sys.meta_path.insert(0, BlockHeavy())
def forbidden(*args, **kwargs): raise AssertionError("unexpected external IO")
socket.socket.connect = forbidden
socket.getaddrinfo = forbidden
from strahov_rag_ingestion.contracts import Request
from strahov_rag_ingestion import worker
worker.distributions = lambda: []
result = worker.run(Request.model_validate(json.loads(sys.argv[1])))
assert result["status"] == "review-required", result.get("errorCode")
assert result["quality"]["issues"] == ["unrepresented-image"]
assert result["quality"]["tableCount"] == 1
assert result["links"][0]["href"] == "https://example.test/rules.pdf"
# Pinned datamodels still use models.utils.generation_utils; this is not a
# claim that all optional model-library imports disappear from this venv.
assert not any(name == "docling.document_converter" or name.startswith(("docling.pipeline", "docling.models.factories", "docling.models.stages")) for name in sys.modules)
print(json.dumps({"status": result["status"], "tableCount": result["quality"]["tableCount"], "links": len(result["links"])}))
'''
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1"}
    result = subprocess.run([sys.executable, "-c", script, request.model_dump_json()],
                            capture_output=True, text=True, env=env, timeout=60)
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert json.loads(result.stdout) == {"status": "review-required", "tableCount": 1, "links": 1}
