"""Synthetic fixtures only: never commit real Discord messages or identities."""

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("discord_parser", HERE.parents[1] / "scripts/discord-kb/parse.py")
PARSER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PARSER)
BASE_ID = 1430000000000000000


def message(number=0, text="Question &amp; answer", extra="", author=True, system=False):
    identity = str(BASE_ID + number)
    header = ('<span class=chatlog__author data-user-id=123456789012345678 title=synthetic>Test author</span>'
              '<span class=chatlog__timestamp title="Monday 2026">01.01.2026 10:00</span>') if author else (
              '<div class=chatlog__short-timestamp title="Monday 2026">10:01</div>')
    content = (f'<div class=chatlog__system-notification-content>{text}</div>' if system else
               f'<div class="chatlog__content chatlog__markdown"><span>{text}</span></div>')
    return f'<div class=chatlog__message-container data-message-id={identity}><div>{header}{extra}{content}</div></div>'


def document(body="", count=0):
    return ('<!doctype html><html><head><script>throw new Error("must never run")</script></head><body>'
            '<div class=preamble><div class=preamble__entry>Synthetic server</div>'
            '<div class=preamble__entry>General / forum / Topic</div></div>'
            f'<div class=chatlog__message-group>{body}</div>'
            f'<div class=postamble__entry>Exported {count} message(s)</div>'
            '<div class=postamble__entry>Timezone: UTC+1</div></body></html>')


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".parser-test-", dir=HERE)
        self.addCleanup(self.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.output = self.root / "output"

    def cleanup(self):
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(HERE))
        self.temp.cleanup()

    def write(self, body="", count=0, name="Synthetic [123456789012345678].html"):
        path = self.source / name
        path.write_text(document(body, count), encoding="utf-8")
        return path

    def records(self, filename="messages.ndjson"):
        return [json.loads(line) for line in (self.output / filename).read_text(encoding="utf-8").splitlines()]

    def test_entities_code_author_inheritance_and_timestamp(self):
        path = self.write(message(text='Žluťoučký &#x1F600; &lt;tag&gt;<br><code class="chatlog__markdown-pre chatlog__markdown-pre--multiline">a\n  b</code>') +
                          message(1, 'Continuation', author=False), 2)
        source, rows = PARSER.parse_export(path, self.source)
        self.assertEqual(rows[0]["text"], 'Žluťoučký 😀 <tag>\n\na\n  b')
        self.assertEqual(rows[1]["author"], rows[0]["author"])
        self.assertTrue(rows[1]["authorInherited"])
        self.assertEqual(rows[0]["messageId"], str(BASE_ID))
        self.assertTrue(rows[0]["createdAtUtc"].endswith("Z"))
        self.assertEqual(rows[0]["displayTimezone"], "UTC+1")
        self.assertEqual(rows[0]["codeBlocks"][0]["text"], "a\n  b")
        self.assertTrue(source["countsMatch"])

    def test_reply_preview_not_own_text_and_components(self):
        reply = (f'<div class=chatlog__reply><span class=chatlog__reply-link '
                 f'onclick="scrollToMessage(event,\'{BASE_ID}\')">Question copied again</span></div>')
        self.write(message(text="Question") + message(1, "Answer", extra=reply), 2)
        manifest = PARSER.extract(self.source, self.output)
        rows = self.records()
        self.assertEqual(rows[1]["text"], "Answer")
        self.assertEqual(rows[1]["replyToMessageId"], str(BASE_ID))
        self.assertEqual(len(self.records("contexts.ndjson")[0]["replyComponents"]), 1)
        self.assertEqual(manifest["counts"]["linkedReplies"], 1)

    def test_unknown_and_missing_replies(self):
        unknown = '<div class=chatlog__reply><span class=chatlog__reply-unknown>Unknown</span></div>'
        absent = '<div class=chatlog__reply><span class=chatlog__reply-link onclick="scrollToMessage(event,\'999\')">Gone</span></div>'
        self.write(message(extra=unknown) + message(1, extra=absent), 2)
        manifest = PARSER.extract(self.source, self.output)
        self.assertEqual(manifest["counts"]["unknownReplies"], 1)
        self.assertEqual(manifest["counts"]["missingReplyTargets"], 1)
        self.assertIn("reply-target-not-in-corpus", self.records()[1]["flags"])
        self.assertIn("reply-target-not-in-corpus", next((self.output / "contexts").glob("*.md")).read_text(encoding="utf-8"))

    def test_forwarded_embeds_links_assets_and_edited(self):
        (self.source / "file.pdf").write_bytes(b"synthetic, not a real PDF")
        extras = ('<div class=chatlog__forwarded><div class=chatlog__forwarded-content>Forwarded context</div>'
                  '<div class=chatlog__forwarded-attachments><img src=https://example.invalid/forward.png></div></div>'
                  '<div class=chatlog__embed><div class=chatlog__embed-title>Official title</div>'
                  '<a href=https://example.invalid/source>Source</a></div>'
                  '<div class="chatlog__attachment chatlog__attachment--hidden"><svg><use href=#icon></use></svg><a href=file.pdf>File</a></div>'
                  '<div class=chatlog__attachment><img src=https://example.invalid/remote.png></div>'
                  '<div class=chatlog__attachment><a href=../private.txt>Outside</a></div>')
        self.write(message(text='Own <a href=https://example.invalid/help>help</a><span class=chatlog__edited-timestamp title="edit date">(edited)</span>', extra=extras), 1)
        PARSER.extract(self.source, self.output)
        row = self.records()[0]
        self.assertEqual(row["text"], "Own help")
        self.assertEqual(row["forwarded"][0]["text"], "Forwarded context")
        self.assertIn("Official title", row["embeds"][0]["text"])
        self.assertEqual(row["embeds"][0]["media"], [])
        self.assertEqual(row["links"][0]["href"], "https://example.invalid/help")
        self.assertEqual(row["edited"][0]["title"], "edit date")
        self.assertTrue(row["attachments"][0]["hidden"])
        self.assertEqual(len(row["attachments"][0]["locations"]), 1)
        states = [a["locations"][0]["availability"] for a in row["attachments"]]
        self.assertEqual(states, ["local-present", "remote-unfetched", "outside-source-root"])
        transcript = next((self.output / "contexts").glob("*.md")).read_text(encoding="utf-8")
        self.assertIn("https://example.invalid/source", transcript)
        self.assertIn("https://example.invalid/forward.png", transcript)
        self.assertIn("speaker:", transcript)
        self.assertNotIn("Test author", transcript)

    def test_system_empty_and_pending_ledger_coverage(self):
        self.write(message(text="Joined", system=True), 1)
        self.write("", 0, "Empty [999].html")
        manifest = PARSER.extract(self.source, self.output)
        ledger = self.records("audit-ledger.ndjson")
        self.assertEqual(manifest["counts"]["systemMessages"], 1)
        self.assertEqual(manifest["counts"]["htmlExports"], 2)
        self.assertEqual([r["recordId"] for r in ledger], [r["recordId"] for r in self.records()])
        self.assertEqual(ledger[0]["status"], "pending")
        self.assertIsNone(ledger[0]["reason"])

    def test_nbsp_declared_count(self):
        path = self.write("".join(message(i) for i in range(1001)), "1\u00a0001")
        source, rows = PARSER.parse_export(path, self.source)
        self.assertEqual(source["declaredMessageCount"], 1001)
        self.assertTrue(source["countsMatch"])
        self.assertEqual(len(rows), 1001)

    def test_overlapping_exports_and_conflicting_duplicate_ids_preserved(self):
        self.write(message(text="Old"), 1)
        self.write(message(text="New"), 1, "Second [123456789012345678].html")
        manifest = PARSER.extract(self.source, self.output)
        self.assertEqual(manifest["counts"]["messages"], 2)
        self.assertEqual(manifest["counts"]["uniqueMessageIds"], 1)
        self.assertTrue(manifest["duplicateMessageIds"][0]["conflictingContent"])
        self.assertEqual(len({r["recordId"] for r in self.records()}), 2)
        self.assertEqual(len(self.records("audit-ledger.ndjson")), 2)

    def test_output_is_deterministic_and_source_unchanged(self):
        path = self.write(message(), 1)
        original = path.read_bytes()
        PARSER.extract(self.source, self.output)
        other = self.root / "other"
        PARSER.extract(self.source, other)
        first = {p.relative_to(self.output): p.read_bytes() for p in self.output.rglob("*") if p.is_file()}
        second = {p.relative_to(other): p.read_bytes() for p in other.rglob("*") if p.is_file()}
        self.assertEqual(first, second)
        self.assertEqual(path.read_bytes(), original)
        manifest = json.loads(first[Path("manifest.json")])
        self.assertEqual(manifest["files"][0]["sha256"], hashlib.sha256(original).hexdigest())

    def test_refuses_overwrite_and_overlapping_directories(self):
        self.write(message(), 1)
        PARSER.extract(self.source, self.output)
        for destination in [self.output, self.source, self.source / "nested", self.root]:
            with self.assertRaises(ValueError):
                PARSER.extract(self.source, destination)

    def test_mismatch_is_not_success(self):
        self.write(message(), 2)
        self.assertEqual(PARSER.main(["--input", str(self.source), "--output", str(self.output)]), 2)
        self.assertFalse(json.loads((self.output / "manifest.json").read_text())["countsReconciled"])

    def test_group_author_is_not_leaked_to_new_group(self):
        path = self.write(message() + '</div><div class=chatlog__message-group>' + message(1, author=False), 2)
        _, rows = PARSER.parse_export(path, self.source)
        self.assertIsNone(rows[1]["author"])
        self.assertIn("missing-author", rows[1]["flags"])

    def test_missing_id_is_rejected_without_output(self):
        path = self.write(message(), 1)
        path.write_text(path.read_text().replace(f"data-message-id={BASE_ID}", "data-message-id=invalid"))
        with self.assertRaises(ValueError):
            PARSER.extract(self.source, self.output)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
