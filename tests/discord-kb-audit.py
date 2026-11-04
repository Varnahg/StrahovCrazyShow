"""Synthetic offline final-ledger checks. No real chat data or external services."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("discord_audit", ROOT / "scripts/discord-kb/audit.py")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.allowed = ROOT / ".cache/discord-kb-20261103/publication-gates"
        self.allowed.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="synthetic-", dir=self.allowed)
        self.addCleanup(self.cleanup)
        self.path = Path(self.temp.name)
        self.raw = self.path / "raw"
        self.raw.mkdir()
        self.files = [{"file": "empty.html", "bytes": 0, "sha256": "0" * 64},
                      {"file": "messages.html", "bytes": 123, "sha256": "1" * 64}]
        self.inventory = AUDIT._canonical_hash(self.files)
        self.manifest = {"schemaVersion": 1, "sourceManifestSha256": self.inventory, "files": self.files,
                         "exports": [{**f, "sourceId": "data" if i else "empty", "countsMatch": True,
                                      "actualMessageCount": 1 if i else 0, "declaredMessageCount": 1 if i else 0}
                                     for i, f in enumerate(self.files)],
                         "counts": {"files": 2, "htmlExports": 2, "messages": 1, "uniqueMessageIds": 1}}
        self.messages = [{"messageId": "1001", "sourceFile": "messages.html", "sourceSha256": "1" * 64,
                          "sourceId": "data", "ordinal": 0, "text": "Synthetic text"}]
        self.canonical = {"schemaVersion": 1, "sourceInventorySha256": self.inventory, "items": [{"id": "item-one"}]}
        self.ledger = {"version": 1, "sourceInventorySha256": self.inventory, "reviewedFiles": [
            {"fileName": "empty.html", "dispositions": []},
            {"fileName": "messages.html", "dispositions": [{"messageId": "1001", "status": "used",
                                                             "itemIds": ["item-one"], "reason": "Reviewed synthetic source"}]},
        ]}

    def cleanup(self):
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(self.allowed.resolve()))
        self.temp.cleanup()

    def run_check(self):
        (self.raw / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        (self.raw / "messages.ndjson").write_text("\n".join(json.dumps(m) for m in self.messages) + "\n", encoding="utf-8")
        (self.path / "canonical.json").write_text(json.dumps(self.canonical), encoding="utf-8")
        (self.path / "ledger.json").write_text(json.dumps(self.ledger), encoding="utf-8")
        return AUDIT.coverage(str(self.raw), [str(self.path / "ledger.json")], str(self.path / "canonical.json"))

    def test_valid_empty_export_is_required_and_accepted(self):
        result = self.run_check()
        self.assertEqual(result["pending"], 0)
        self.assertEqual(result["reviewedFiles"], 2)
        self.assertEqual(result["classified"], 1)
        self.ledger["reviewedFiles"].pop(0)
        with self.assertRaisesRegex(ValueError, "incomplete-coverage"):
            self.run_check()

    def test_message_cannot_be_attributed_to_another_known_file(self):
        self.ledger["reviewedFiles"][0]["dispositions"] = self.ledger["reviewedFiles"][1]["dispositions"]
        self.ledger["reviewedFiles"][1]["dispositions"] = []
        with self.assertRaisesRegex(ValueError, "invalid-or-duplicate-disposition"):
            self.run_check()

    def test_duplicate_disposition_and_duplicate_export_fail(self):
        self.ledger["reviewedFiles"][1]["dispositions"] *= 2
        with self.assertRaisesRegex(ValueError, "invalid-or-duplicate-disposition"):
            self.run_check()
        self.ledger["reviewedFiles"][1]["dispositions"].pop()
        self.ledger["reviewedFiles"].append(copy.deepcopy(self.ledger["reviewedFiles"][0]))
        with self.assertRaisesRegex(ValueError, "unknown-or-duplicate-source-file"):
            self.run_check()

    def test_nonexistent_canonical_reference_fails(self):
        self.ledger["reviewedFiles"][1]["dispositions"][0]["itemIds"] = ["not-a-canonical-item"]
        with self.assertRaisesRegex(ValueError, "invalid-canonical-reference"):
            self.run_check()

    def test_unreviewed_and_missing_reasons_fail(self):
        row = self.ledger["reviewedFiles"][1]["dispositions"][0]
        for status in ("pending", "unreviewed"):
            row["status"] = status
            with self.assertRaisesRegex(ValueError, "invalid-or-duplicate-disposition"):
                self.run_check()
        row["status"] = "used"
        row["reason"] = "   "
        with self.assertRaisesRegex(ValueError, "invalid-or-duplicate-disposition"):
            self.run_check()

    def test_unreferenced_canonical_item_fails(self):
        self.canonical["items"].append({"id": "unrelated"})
        with self.assertRaisesRegex(ValueError, "incomplete-coverage"):
            self.run_check()

    def test_missing_message_disposition_fails(self):
        self.ledger["reviewedFiles"][1]["dispositions"] = []
        with self.assertRaisesRegex(ValueError, "incomplete-coverage"):
            self.run_check()

    def test_inventory_tampering_and_raw_count_mismatch_fail(self):
        self.files[1]["sha256"] = "2" * 64
        with self.assertRaisesRegex(ValueError, "source-inventory-mismatch"):
            self.run_check()
        self.files[1]["sha256"] = "1" * 64
        self.manifest["exports"][1]["actualMessageCount"] = 2
        self.manifest["exports"][1]["declaredMessageCount"] = 2
        with self.assertRaisesRegex(ValueError, "raw-count-mismatch"):
            self.run_check()

    def test_closed_insufficient_context_is_distinct_from_pending(self):
        self.messages.append({**self.messages[0], "messageId": "1002", "ordinal": 1})
        self.manifest["exports"][1]["actualMessageCount"] = 2
        self.manifest["exports"][1]["declaredMessageCount"] = 2
        self.manifest["counts"].update(messages=2, uniqueMessageIds=2)
        self.ledger["reviewedFiles"][1]["dispositions"].append({"messageId": "1002", "status": "insufficient-context",
            "itemIds": [], "reason": "Question read; answer unresolved, not published."})
        result = self.run_check()
        self.assertEqual(result["classified"], 2)
        self.assertEqual(result["counts"]["insufficient-context"], 1)


if __name__ == "__main__":
    unittest.main()
