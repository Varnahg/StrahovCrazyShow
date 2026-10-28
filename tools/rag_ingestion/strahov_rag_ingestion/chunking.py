"""Stable structural chunks; counts use the actual embedding input."""

from collections import Counter

import tiktoken

from .contracts import ExtractionError, Request, canonical, digest


def embedding_input(title: str, headings: list[str], text: str) -> str:
    return canonical([title, headings, text])


class Chunker:
    def __init__(self, request: Request):
        self.request = request
        self.encoder = tiktoken.get_encoding("cl100k_base")
        self.duplicates = Counter()

    def measure(self, headings, text):
        value = embedding_input(self.request.title, headings, text)
        return len(self.encoder.encode(value, disallowed_special=())), len(value.encode("utf-8"))

    def fits(self, headings, text):
        tokens, size = self.measure(headings, text)
        return tokens <= self.request.limits.maxChunkTokens and size <= self.request.limits.maxEmbeddingInputBytes

    def split_text(self, headings, text):
        # Split by Unicode characters, never decoded token fragments (which can
        # create replacement characters). Each exact character survives.
        while text:
            if self.fits(headings, text):
                yield text
                return
            low, high = 0, len(text)
            while low < high:
                mid = (low + high + 1) // 2
                if self.fits(headings, text[:mid]):
                    low = mid
                else:
                    high = mid - 1
            if not low:
                raise ExtractionError("embedding-context-exceeds-budget", "review-required")
            boundary = max(text.rfind("\n", 0, low), text.rfind(" ", 0, low))
            end = boundary + 1 if boundary > low // 2 else low
            yield text[:end]
            text = text[end:]

    def split_table(self, block):
        # A table block is canonical TSV. Tabs/newlines inside cells are escaped
        # during normalization; no cell or logical row is cut in half.
        table = block.get("_table")
        if table:
            header = "\n".join(x for x in [table["context"], table["header"]] if x)
            rows = table["rows"]
        else:
            lines = block["text"].splitlines()
            header, rows = lines[0], lines[1:]
        current = header
        if not self.fits(block["headingPath"], header):
            raise ExtractionError("table-header-exceeds-budget", "review-required")
        for row in rows:
            candidate = "\n".join(x for x in [current, row] if x)
            if self.fits(block["headingPath"], candidate):
                current = candidate
            else:
                if current != header:
                    yield current
                current = "\n".join(x for x in [header, row] if x)
                if not self.fits(block["headingPath"], current):
                    raise ExtractionError("table-row-exceeds-budget", "review-required")
        yield current

    def chunks(self, blocks):
        output = []
        for block in blocks:
            if not block["text"]:
                continue
            pieces = self.split_table(block) if block["kind"] == "table" else self.split_text(block["headingPath"], block["text"])
            for text in pieces:
                key = digest([self.request.sourceId, block["headingPath"], text])
                ordinal = self.duplicates[key]
                self.duplicates[key] += 1
                output.append({"id": "c-" + digest([key, ordinal]), "text": text,
                    "headingPath": block["headingPath"], "tokenCount": self.measure(block["headingPath"], text)[0],
                    "blockIds": [block["id"]], "spans": block["spans"]})
        return output
