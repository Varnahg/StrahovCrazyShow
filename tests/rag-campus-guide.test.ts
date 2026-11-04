import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
  isCrazyTypkaSource,
} from "../shared/crazy-typka";
import {
  curationPublisherForUrl,
  isCuratedKnowledgeCurrent,
} from "../shared/knowledge-curation";
import { isCitationUrlAllowed } from "../shared/rag-citation-policy";
import {
  isCuratedKnowledgeDocument,
  resolveRagKnowledgeChunkV3,
  validateRagDocumentDatasetV3,
} from "../server/rag-curation-contract";
import {
  bootstrapSeedRevision,
  validateBootstrapDocuments,
} from "../scripts/docker-rag-bootstrap";

const read = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const guide = validateRagDocumentDatasetV3(
  await read("../server/data/rag/campus-guide.json"),
);
const ids = new Set(guide.documents.map((document) => document.id));
function unit(id: string) {
  const document = guide.documents.find((entry) => entry.id === id);
  assert.ok(document && isCuratedKnowledgeDocument(document));
  const chunks = guide.chunks.filter(
    (chunk) => chunk.sourceVersionId === document.sourceVersionId,
  );
  assert.equal(chunks.length, 1);
  return { document, chunk: chunks[0] };
}

test("new SH supporting grants cover only the two reviewed pages, without a crawler grant", () => {
  for (const path of ["kontakt", "aktivity"]) {
    const url = `https://www.siliconhill.cz/pages/${path}`;
    assert.equal(
      curationPublisherForUrl(url, CRAZY_TYPKA_DOCUMENT_CITATION_POLICY),
      "silicon-hill",
    );
    assert.equal(
      isCitationUrlAllowed(
        CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
        "silicon-hill",
        url,
      ),
      false,
    );
    assert.equal(
      curationPublisherForUrl(
        `${url}/private`,
        CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
      ),
      undefined,
    );
  }
});

test("campus guide is public official V3 evidence with bounded independently cited units", () => {
  assert.equal(guide.documents.length, 7);
  assert.equal(ids.size, guide.documents.length);
  for (const id of ids) {
    const { document, chunk } = unit(id);
    assert.equal(document.verification, "verified-official");
    assert.equal(document.status, "current");
    assert.equal(document.factCheckedAt, "2026-11-04");
    assert.equal(document.observedFrom, null);
    assert.equal(document.observedUntil, null);
    assert.ok(document.supportingRefs.length > 0);
    assert.ok(chunk.tokenCount > 0 && chunk.tokenCount <= 650);
    const resolved = resolveRagKnowledgeChunkV3(document, chunk);
    assert.ok(isCrazyTypkaSource(resolved.source));
    assert.ok(
      isCuratedKnowledgeCurrent(
        document,
        Date.parse("2026-11-04T12:00:00Z"),
      ),
    );
  }
});

test("bootstrap revision includes the exact canonical campus units without replacing community units", async () => {
  const rawSeed = await read("../server/data/rag/bootstrap-documents.json");
  assert.ok(bootstrapSeedRevision(rawSeed) >= 3);
  const bundles = validateBootstrapDocuments(rawSeed);
  assert.equal(
    new Set(bundles.map((bundle) => bundle.document.id)).size,
    bundles.length,
  );
  assert.equal(
    bundles.filter((bundle) => ids.has(bundle.document.id)).length,
    ids.size,
  );
  for (const id of ids) {
    const { document, chunk } = unit(id);
    const bundled = bundles.find((bundle) => bundle.document.id === id);
    assert.ok(bundled);
    assert.deepEqual(bundled.document, document);
    assert.deepEqual(bundled.chunks, [chunk]);
    assert.deepEqual(
      bundled.blocks,
      guide.blocks.filter(
        (block) => block.sourceVersionId === document.sourceVersionId,
      ),
    );
  }
  // This addition supplements the pre-existing independently reviewed curation.
  assert.ok(
    bundles.some((bundle) => bundle.document.id === "general-sh-registration"),
  );
  assert.ok(
    bundles.some(
      (bundle) =>
        isCuratedKnowledgeDocument(bundle.document) &&
        bundle.document.verification === "community-experience",
    ),
  );
});

test("overview evidence covers distinct activities and local food/shopping instead of a sports-only answer", () => {
  const { chunk } = unit("campus-activities-overview");
  for (const topic of [
    /Sport:/,
    /Hry:/,
    /Hudba a tanec:/,
    /Tvoření:/,
    /Vzdělávání:/,
    /Komunita:/,
    /Menza Strahov/,
    /obchod s potravinami a drogerií/,
  ])
    assert.match(chunk.text, topic);
  assert.doesNotMatch(chunk.text, /solárium|Modelland|Fotoateliér/);
});

test("short-stay evidence establishes a summer hostel, not unverified year-round availability", () => {
  const { document, chunk } = unit("campus-seasonal-hostel");
  assert.match(chunk.text, /blocích 3 a 8/);
  assert.match(chunk.text, /červenci a srpnu/);
  assert.match(chunk.text, /24 hodin denně sedm dní v týdnu/);
  assert.match(chunk.text, /listopad.*nepotvrzuje/);
  assert.ok(
    document.supportingRefs.some((ref) =>
      ref.url.endsWith("/hotely-hostely/hostel-strahov"),
    ),
  );
});

test("membership starts with a block registrar and block leadership explains both operators", () => {
  const registration = unit("campus-sh-registration").chunk.text;
  assert.match(registration, /Odpověď: Nejprve najdi registrátory svého bloku/);
  assert.match(registration, /adminX@sh\.cvut\.cz/);
  assert.match(registration, /samotná online předregistrace není dokončené členství/);
  const roles = unit("campus-block-roles").chunk.text;
  assert.match(roles, /Studentský zástupce bloku.*Silicon Hill/);
  assert.match(roles, /Hospodářka či hospodář.*SÚZ ČVUT/);
  assert.match(roles, /potřeba znát číslo bloku/);
});

test("one hours unit carries the exact regular schedule and the overriding November closure", () => {
  const { document, chunk } = unit("campus-menza-hours");
  for (const fact of [
    /snídaně pondělí až pátek 6:30–9:30/,
    /obědy pondělí až pátek 11:00–14:30/,
    /večeře pondělí až čtvrtek 14:30–20:30/,
    /pátek 14:30–19:30/,
    /16\. listopadu.*17\. listopadu 2026/,
    /uzavření přednost před běžným týdenním rozpisem/,
  ])
    assert.match(chunk.text, fact);
  assert.ok(
    document.supportingRefs.some(
      (ref) =>
        ref.url ===
        "https://agata.suz.cvut.cz/jidelnicky/index.php?clPodsystem=1",
    ),
  );
  assert.ok(
    isCuratedKnowledgeCurrent(
      document,
      Date.parse("2026-11-17T20:00:00Z"),
    ),
  );
  assert.equal(
    isCuratedKnowledgeCurrent(
      document,
      Date.parse("2026-11-18T00:00:00Z"),
    ),
    false,
  );
});

test("menu evidence carries exact safe daily/weekly URLs and shopping does not invent hours", () => {
  const { document, chunk } = unit("campus-menza-menu");
  const urls = document.supportingRefs.map((ref) => ref.url);
  assert.ok(
    urls.includes(
      "https://agata.suz.cvut.cz/jidelnicky/index.php?clPodsystem=1",
    ),
  );
  assert.ok(
    urls.includes(
      "https://agata.suz.cvut.cz/jidelnicky/indexTyden.php?clPodsystem=1",
    ),
  );
  assert.match(chunk.text, /neobsahují živou dnešní nabídku/);
  const shopping = unit("campus-food-shopping").chunk.text;
  assert.match(shopping, /přízemí administrativního bloku 1/);
  assert.match(shopping, /hodiny obchodu v ověřených primárních podkladech nemáme/);
  assert.doesNotMatch(shopping, /8:00–23:00|9:00–23:00/);
  for (const document of guide.documents) {
    assert.ok(isCuratedKnowledgeDocument(document));
    if (document.id !== "campus-menza-hours")
      assert.equal(
        isCuratedKnowledgeCurrent(
          document,
          Date.parse("2026-11-11T00:00:00Z"),
        ),
        false,
      );
  }
});
