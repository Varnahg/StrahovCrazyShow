import hashlib
from pathlib import Path

import pytest

from strahov_rag_ingestion.contracts import Request


@pytest.fixture
def request_for(tmp_path):
    def make(data, name="sample.txt", **overrides):
        path = tmp_path / name
        path.write_bytes(data)
        work = tmp_path / (name + "-job")
        work.mkdir(exist_ok=True)
        value = dict(schemaVersion=1, sourceId="test-source", sourceUrl="https://example.test/docs/source",
            inputPath=str(path), inputSha256=hashlib.sha256(data).hexdigest(), workDir=str(work),
            title="Český zdroj", mime=None, filename=name, mode="auto",
            limits=dict(maxInputBytes=20_000_000,maxExpandedBytes=40_000_000,maxPages=50,maxOutputBytes=10_000_000,
                maxBlocks=10_000,maxChunkTokens=650,maxEmbeddingInputBytes=8191,timeoutSeconds=60))
        for key, value_override in overrides.items():
            if key == "limits":
                value["limits"].update(value_override)
            else:
                value[key] = value_override
        return Request.model_validate(value)
    return make
