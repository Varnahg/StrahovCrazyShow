"""Offline pomocné kontroly kurace. Surový korpus nikdy neposílá do sítě."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

TOKENIZER_URL = "https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken"
TOKENIZER_SHA256 = "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7"

def tokens(cache: str) -> None:
    directory = Path(cache).resolve(strict=True)
    dictionary = directory / hashlib.sha1(TOKENIZER_URL.encode()).hexdigest()
    if not dictionary.is_file() or hashlib.sha256(dictionary.read_bytes()).hexdigest() != TOKENIZER_SHA256:
        raise ValueError("tokenizer-integrity-failed")
    os.environ["TIKTOKEN_CACHE_DIR"] = str(directory)
    import importlib.metadata
    if importlib.metadata.version("tiktoken") != "0.12.0":
        raise ValueError("tokenizer-version-mismatch")
    import tiktoken
    encoding = tiktoken.get_encoding("cl100k_base")
    payload = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
    if len(payload) > 8 * 1024 * 1024:
        raise ValueError("input-too-large")
    inputs = json.loads(payload)
    if not isinstance(inputs, list) or len(inputs) > 1024 or not all(isinstance(s, str) for s in inputs):
        raise ValueError("invalid-inputs")
    print(json.dumps([len(encoding.encode(text, disallowed_special=())) for text in inputs]))

def _require(condition: bool, code: str) -> None:
    if not condition:
        raise ValueError(code)


def _canonical_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _raw_inventory(raw: str) -> tuple[str, dict[str, str], set[str]]:
    directory = Path(raw)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    messages = [json.loads(line) for line in (directory / "messages.ndjson").read_text(encoding="utf-8").splitlines() if line]
    _require(isinstance(manifest, dict) and type(manifest.get("schemaVersion")) is int and manifest["schemaVersion"] == 1
             and isinstance(manifest.get("files"), list) and isinstance(manifest.get("exports"), list)
             and isinstance(manifest.get("counts"), dict), "invalid-raw-manifest")
    inventory = manifest.get("sourceManifestSha256")
    _require(isinstance(inventory, str) and re.fullmatch(r"[0-9a-f]{64}", inventory) is not None
             and _canonical_hash(manifest["files"]) == inventory, "source-inventory-mismatch")
    files = {}
    for entry in manifest["files"]:
        _require(isinstance(entry, dict) and set(entry) == {"file", "bytes", "sha256"}
                 and isinstance(entry["file"], str) and bool(entry["file"].strip())
                 and type(entry["bytes"]) is int and entry["bytes"] >= 0
                 and isinstance(entry["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]) is not None
                 and entry["file"] not in files, "invalid-source-inventory")
        files[entry["file"]] = entry
    exports = {}
    for entry in manifest["exports"]:
        _require(isinstance(entry, dict) and isinstance(entry.get("file"), str)
                 and entry["file"] not in exports and entry["file"] in files
                 and entry.get("sha256") == files[entry["file"]]["sha256"]
                 and isinstance(entry.get("sourceId"), str) and bool(entry["sourceId"].strip())
                 and entry.get("countsMatch") is True and type(entry.get("actualMessageCount")) is int
                 and entry["actualMessageCount"] >= 0 and type(entry.get("declaredMessageCount")) is int
                 and entry["declaredMessageCount"] == entry["actualMessageCount"],
                 "invalid-export-inventory")
        exports[entry["file"]] = entry
    expected = {}
    ordinals = {name: set() for name in exports}
    for row in messages:
        _require(isinstance(row, dict) and isinstance(row.get("messageId"), str)
                 and re.fullmatch(r"\d{1,20}", row["messageId"]) is not None
                 and row["messageId"] not in expected and isinstance(row.get("sourceFile"), str) and row["sourceFile"] in exports
                 and type(row.get("ordinal")) is int, "invalid-raw-message")
        source = exports[row["sourceFile"]]
        _require(row.get("sourceId") == source["sourceId"] and row.get("sourceSha256") == source["sha256"]
                 and 0 <= row["ordinal"] < source["actualMessageCount"]
                 and row["ordinal"] not in ordinals[row["sourceFile"]], "raw-message-source-mismatch")
        expected[row["messageId"]] = row["sourceFile"]
        ordinals[row["sourceFile"]].add(row["ordinal"])
    counts = manifest["counts"]
    _require(all(type(counts.get(key)) is int for key in ("files", "htmlExports", "messages", "uniqueMessageIds"))
             and bool(exports) and counts.get("files") == len(files) and counts.get("htmlExports") == len(exports)
             and counts.get("messages") == len(expected) and counts.get("uniqueMessageIds") == len(expected)
             and all(len(ordinals[name]) == source["actualMessageCount"] for name, source in exports.items()),
             "raw-count-mismatch")
    return inventory, expected, set(exports)


def coverage(raw: str, partition_paths: list[str], canonical_path: str) -> dict:
    """Reconcile curated dispositions without publishing raw message content."""
    inventory, expected, known_files = _raw_inventory(raw)
    canonical = json.loads(Path(canonical_path).read_text(encoding="utf-8"))
    _require(isinstance(canonical, dict) and type(canonical.get("schemaVersion")) is int and canonical["schemaVersion"] == 1
             and canonical.get("sourceInventorySha256") == inventory and isinstance(canonical.get("items"), list),
             "invalid-canonical-inventory")
    canonical_ids = set()
    for item in canonical["items"]:
        _require(isinstance(item, dict) and isinstance(item.get("id"), str) and bool(item["id"].strip())
                 and item["id"] not in canonical_ids, "invalid-canonical-id")
        canonical_ids.add(item["id"])
    _require(bool(canonical_ids), "empty-canonical-items")
    dispositions: dict[str, dict] = {}
    counts: dict[str, int] = {}
    reviewed_files, referenced_ids = set(), set()
    allowed = {"used", "duplicate", "system", "excluded", "insufficient-context"}
    for path in partition_paths:
        partition = json.loads(Path(path).read_text(encoding="utf-8"))
        _require(isinstance(partition, dict) and type(partition.get("version")) is int and partition["version"] == 1
                 and isinstance(partition.get("reviewedFiles"), list)
                 and partition.get("sourceInventorySha256", inventory) == inventory, "invalid-partition")
        for source in partition["reviewedFiles"]:
            _require(isinstance(source, dict) and set(source) == {"fileName", "dispositions"}
                     and isinstance(source["fileName"], str) and source["fileName"] in known_files and source["fileName"] not in reviewed_files
                     and isinstance(source["dispositions"], list), "unknown-or-duplicate-source-file")
            reviewed_files.add(source["fileName"])
            for row in source["dispositions"]:
                _require(isinstance(row, dict) and set(row) == {"messageId", "status", "itemIds", "reason"}, "invalid-disposition")
                mid, status = row["messageId"], row["status"]
                _require(isinstance(mid, str) and mid in expected and expected[mid] == source["fileName"]
                         and mid not in dispositions and isinstance(status, str) and status in allowed
                         and isinstance(row["reason"], str) and bool(row["reason"].strip()) and len(row["reason"]) <= 4000,
                         "invalid-or-duplicate-disposition")
                targets = row["itemIds"]
                _require(isinstance(targets, list) and all(isinstance(item, str) and item in canonical_ids for item in targets)
                         and len(set(targets)) == len(targets)
                         and (bool(targets) if status in {"used", "duplicate"} else not targets), "invalid-canonical-reference")
                referenced_ids.update(targets)
                dispositions[mid] = row
                counts[status] = counts.get(status, 0) + 1
    result = {"expected": len(expected), "classified": len(dispositions), "pending": len(expected.keys() - dispositions.keys()),
              "expectedFiles": len(known_files), "reviewedFiles": len(reviewed_files), "counts": counts}
    _require(result["pending"] == 0 and reviewed_files == known_files and referenced_ids == canonical_ids, "incomplete-coverage")
    return result

def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    count = commands.add_parser("tokens")
    count.add_argument("--cache", required=True)
    audit = commands.add_parser("coverage")
    audit.add_argument("--raw", required=True)
    audit.add_argument("--canonical", required=True)
    audit.add_argument("partitions", nargs="+")
    args = parser.parse_args()
    if args.command == "tokens":
        tokens(args.cache)
    else:
        print(json.dumps(coverage(args.raw, args.partitions, args.canonical), ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print(json.dumps({"error": type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)
