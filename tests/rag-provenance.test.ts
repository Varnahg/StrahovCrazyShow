import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalRagJson,
  isRagDay,
  isRagEffectiveRange,
  isRagInstant,
  isRagText,
  isSourceSpan,
} from "../shared/rag-provenance";
import { isCrazyTypkaSource } from "../shared/crazy-typka";

test("RAG text keeps exact Unicode while rejecting NUL and lone surrogates", () => {
  for (const text of ["Příliš žluťoučký 🐎", "a\u0301", "  obsah\n"])
    assert.equal(isRagText(text, 100), true);
  for (const text of ["", "   ", "bad\0text", "bad\ud800", "\udfff", 1, null])
    assert.equal(isRagText(text, 100), false);
  assert.equal(isRagText("", 100, true), true);
  assert.equal(isRagText("abcd", 3), false);
});
test("calendar guards reject rollover dates, implicit timezones and reversed intervals", () => {
  assert.ok(isRagDay("2024-02-29"));
  for (const day of ["2025-02-29", "2026-04-31", "2026-1-01", "2026-01-01Z"])
    assert.equal(isRagDay(day), false);
  for (const instant of [
    "2026-10-28T00:00:00+01:00",
    "2026-10-28T13:25:00.125Z",
  ])
    assert.ok(isRagInstant(instant));
  for (const instant of [
    "2026-10-28T00:00:00",
    "2026-02-30T00:00:00Z",
    "2026-10-28T24:00:00Z",
    "2026-10-28T00:00:00+25:00",
  ])
    assert.equal(isRagInstant(instant), false);
  assert.ok(isRagEffectiveRange(null, null));
  assert.ok(
    isRagEffectiveRange(
      "2026-01-01T00:00:00+01:00",
      "2026-02-01T00:00:00+01:00",
    ),
  );
  assert.equal(
    isRagEffectiveRange("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    false,
  );
});
test("physical locators respect PDF page bounds and each coordinate origin", () => {
  const span = {
    blockId: "b-1",
    locator: "PDF strana 1",
    page: 1,
    bbox: {
      left: 10,
      right: 20,
      top: 50,
      bottom: 40,
      origin: "bottom-left",
      unit: "pt",
    },
  };
  assert.ok(isSourceSpan(span, { format: "pdf", pageCount: 2 }));
  assert.ok(
    isSourceSpan(
      {
        ...span,
        bbox: { ...span.bbox, top: 40, bottom: 50, origin: "top-left" },
      },
      { format: "pdf", pageCount: 2 },
    ),
  );
  for (const wrong of [
    { ...span, page: 0 },
    { ...span, page: 3 },
    { ...span, page: 1.2 },
    { ...span, bbox: { ...span.bbox, right: 5 } },
    { ...span, bbox: { ...span.bbox, top: 30 } },
    { ...span, bbox: { ...span.bbox, right: Infinity } },
    { ...span, bbox: { ...span.bbox, unit: "m" } },
  ])
    assert.equal(isSourceSpan(wrong, { format: "pdf", pageCount: 2 }), false);
  assert.equal(isSourceSpan(span, { format: "docx", pageCount: null }), false);
  assert.equal(isSourceSpan(span, { format: "pdf", pageCount: null }), false);
  assert.ok(
    isSourceSpan(
      { blockId: "b-1", locator: "DOCX tabulka 2, řádky 1–3" },
      { format: "docx", pageCount: null },
    ),
  );
});
test("canonical manifest JSON sorts object keys without changing array order or Unicode", () => {
  assert.equal(
    canonicalRagJson({ b: ["á", "a\u0301"], a: 1 }),
    '{"a":1,"b":["á","á"]}',
  );
  assert.notEqual(canonicalRagJson([1, 2]), canonicalRagJson([2, 1]));
  for (const value of [undefined, NaN, Infinity, new Date(), { x: undefined }])
    assert.throws(() => canonicalRagJson(value));
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  assert.throws(() => canonicalRagJson(cycle));
});
test("legacy citation acceptance remains independent of new path policy and added fields", () => {
  const legacy = {
    id: "suz-example",
    title: "Dokument",
    url: "https://www.suz.cvut.cz/legacy-path-not-in-new-policy",
    checkedAt: "2026-10-28",
    author: null,
    license: null,
    licenseUrl: null,
    adaptation: "curated-paraphrase",
  };
  assert.equal(isCrazyTypkaSource(legacy), true);
  assert.equal(
    isCrazyTypkaSource({ ...legacy, anIgnoredLegacyField: true }),
    true,
  );
  assert.equal(
    isCrazyTypkaSource({ ...legacy, title: "x".repeat(201) }),
    false,
  );
  assert.equal(
    isCrazyTypkaSource({ ...legacy, url: "https://su.cvut.cz/" }),
    false,
  );
  assert.equal(
    isCrazyTypkaSource({
      ...legacy,
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    }),
    false,
  );
});
