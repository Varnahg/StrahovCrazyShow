"""Strict request boundary and common deterministic serialization."""

import hashlib
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def digest(value) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


class ExtractionError(Exception):
    def __init__(self, code: str, status: str = "failed"):
        super().__init__(code)
        self.code, self.status = code, status


class Limits(BaseModel):
    model_config = ConfigDict(extra="forbid")
    maxInputBytes: StrictInt = Field(gt=0, le=100_000_000)
    maxExpandedBytes: StrictInt = Field(gt=0, le=500_000_000)
    maxPages: StrictInt = Field(gt=0, le=2000)
    maxOutputBytes: StrictInt = Field(ge=2048, le=100_000_000)
    maxBlocks: StrictInt = Field(gt=0, le=100_000)
    maxChunkTokens: StrictInt = Field(gt=0, le=8191)
    maxEmbeddingInputBytes: StrictInt = Field(gt=0, le=100_000)
    timeoutSeconds: StrictInt = Field(gt=0, le=1800)


class HtmlOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contentSelectors: list[str] = Field(default_factory=list, max_length=20)


class Request(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal[1]
    sourceId: str = Field(min_length=1, max_length=300)
    sourceUrl: str = Field(min_length=1, max_length=8192)
    inputPath: str
    inputSha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    workDir: str
    title: str = Field(min_length=1, max_length=4000)
    mime: str | None
    filename: str = Field(max_length=1000)
    mode: Literal["auto", "native", "standard"]
    modelDirectory: str | None = None
    html: HtmlOptions | None = None
    limits: Limits

    @field_validator("inputPath", "workDir", "modelDirectory")
    @classmethod
    def absolute_path(cls, value):
        if value is not None and not Path(value).is_absolute():
            raise ValueError("absolute path required")
        return value

    @model_validator(mode="after")
    def output_can_hold_failure(self):
        envelope = empty_result(self)
        envelope["errorCode"] = "x" * 64
        envelope["quality"]["issues"] = ["x" * 64]
        if len(canonical(envelope).encode("utf-8")) > self.limits.maxOutputBytes:
            raise ValueError("output limit cannot hold failure envelope")
        return self


def empty_result(request: Request) -> dict:
    return {
        "schemaVersion": 1, "sourceId": request.sourceId,
        "inputSha256": request.inputSha256, "status": "failed", "format": "unknown",
        "parserProfile": {"id": "docling-2.144.0-strahov-v1", "packages": {},
            "pipeline": "preflight", "configurationHash": digest({"version": 1}),
            "modelManifestHash": None, "tokenizer": {"id": "cl100k_base", "package": "tiktoken",
                "version": "0.12.0", "vocabularySha256": "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7"}},
        "document": {"title": request.title, "pageCount": None, "complete": False},
        "blocks": [], "chunks": [],
        "quality": {"processedPages": None, "expectedPages": None,
            "inputTextCharacters": None, "outputTextCharacters": 0,
            "tableCount": 0, "ocrPages": [], "issues": []},
        "links": [],
    }
