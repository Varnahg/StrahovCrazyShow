import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalizeSourceUrl,
  createSeedUrlPolicy,
  decideDiscovery,
  isPublisherUrlAllowed,
  loadSourceCatalog,
} from "../server/rag-source-catalog";

const catalog = loadSourceCatalog();
const seed = (url: string) => {
  const found = catalog.seeds.find((s) => s.url === url);
  assert.ok(found);
  return found;
};
const sh = seed("https://wiki.sh.cvut.cz/klub/projekty");
function link(
  url: string,
  relation: "page" | "document" | "canonical" = "page",
  parentUrl = sh.url,
) {
  return decideDiscovery(catalog, {
    seedId: sh.id,
    parentUrl,
    url,
    relation,
    depth: 1,
    section: "Main article / project reports",
  });
}

test("complete report inventory retains actual source line numbers and all 27 hosts", () => {
  assert.equal(catalog.seeds.length, 114);
  const rows = catalog.seeds
    .flatMap((s) => s.catalogRows.map((line) => ({ line, url: s.url })))
    .sort((a, b) => a.line - b.line);
  assert.equal(rows.length, 115);
  assert.equal(new Set(rows.map((r) => r.line)).size, 115);
  assert.equal(
    new Set(catalog.seeds.map((s) => new URL(s.url).hostname)).size,
    27,
  );
  const digest = createHash("sha256")
    .update(rows.map((r) => `${r.line}\t${r.url}`).join("\n"))
    .digest("hex");
  // Independent digest of all URL rows in the user's original report, not a selected URL fixture.
  assert.equal(
    digest,
    "e6f2b0404605bd06c7e473d9703551c34494e7eb264ce8e7d4032e055dac0a5d",
  );
  assert.equal(catalog.sourceReport.urlRowsSha256, digest);
  assert.deepEqual(
    seed("https://www.siliconhill.cz/koleje-strahov").catalogRows,
    [47, 106],
  );
  assert.equal(
    catalog.seeds.filter((s) => s.expectedFormat === "pdf").length,
    13,
  );
  assert.equal(catalog.seeds.filter((s) => s.role === "feed").length, 5);
  assert.equal(seed("https://stoh.su.cvut.cz/").publisher, "su");
  assert.equal(seed("https://www.strahovopenair.cz/").publisher, "su");
  assert.deepEqual(
    Object.values(catalog.sourceReport.sections),
    [20, 58, 26, 11],
  );
});

test(
  "optional original report audit verifies every URL row and original bytes",
  { skip: !process.env.RAG_ORIGINAL_CATALOG },
  () => {
    const bytes = readFileSync(process.env.RAG_ORIGINAL_CATALOG!);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      catalog.sourceReport.sha256,
    );
    const rows = bytes
      .toString("utf8")
      .split(/\r?\n/)
      .flatMap((line, i) => {
        const match = line.match(/^\| `(https?:\/\/[^`]+)` \|/);
        return match ? [{ line: i + 1, url: match[1] }] : [];
      });
    const actual = catalog.seeds
      .flatMap((s) => s.catalogRows.map((line) => ({ line, url: s.url })))
      .sort((a, b) => a.line - b.line);
    assert.deepEqual(actual, rows);
  },
);

test("three authentication seeds and two social review seeds are represented but never fetchable", () => {
  const auth = catalog.seeds.filter((s) => s.access === "authentication");
  assert.deepEqual(
    auth.map((s) => s.url),
    [
      "https://is.sh.cvut.cz/budgets",
      "https://fotbalek.sh.cvut.cz/users/sign_in",
      "https://web.suz.cvut.cz/Login",
    ],
  );
  assert.equal(
    catalog.seeds.filter((s) => s.access === "needs-policy-review").length,
    2,
  );
  for (const s of catalog.seeds.filter((s) => s.access !== "public")) {
    assert.equal(createSeedUrlPolicy(catalog, s.id)(s.url, s.publisher), false);
    assert.equal(isPublisherUrlAllowed(catalog, s.url, s.publisher), false);
  }
  assert.equal(
    seed("https://wiki.sh.cvut.cz/klub/projekty/fotoatelier").stateHint,
    "archived",
  );
  assert.equal(seed("https://macgyver.sh.cvut.cz/").stateHint, "unknown");
});

test("normalization strips only tracking and fragment; preserves revisions and document query identity", () => {
  assert.equal(
    canonicalizeSourceUrl(
      "https://wiki.sh.cvut.cz/klub/projekty?rev=123&utm_source=spam#part",
    ),
    "https://wiki.sh.cvut.cz/klub/projekty?rev=123",
  );
  const menu =
    "https://agata.suz.cvut.cz/jidelnicky/jidelnicek_pdf.php?lang=cs&podsystem=1";
  assert.equal(canonicalizeSourceUrl(menu), menu);
  assert.notEqual(
    canonicalizeSourceUrl(sh.url + "?rev=123"),
    canonicalizeSourceUrl(sh.url),
  );
  for (const value of [
    "http://wiki.sh.cvut.cz/",
    "https://user:pass@wiki.sh.cvut.cz/",
    "https://wiki.sh.cvut.cz:8443/",
    "https://127.1/",
    "https://[::1]/",
    "https://wiki.sh.cvut.cz./",
    "https://wiki.sh.cvut.cz/klub%2fadmin",
    "https://wiki.sh.cvut.cz/klub%252fadmin",
  ])
    assert.throws(() => canonicalizeSourceUrl(value), value);
});

test("hub follows scoped pages and attachments without granting whole-host navigation", () => {
  assert.equal(link("/klub/projekty/vyrocni-zpravy-2026").allowed, true);
  assert.equal(
    link("/_media/klub/projekty/zprava_projekty_template.docx", "document")
      .allowed,
    true,
  );
  assert.equal(
    link("https://zapisy.sh.cvut.cz/prilohy/2026-report.pdf", "document")
      .allowed,
    true,
  );
  for (const value of [
    "https://evil.cvut.cz/prilohy/report.pdf",
    "https://zapisy.sh.cvut.cz/secret/report.pdf",
    "/unrelated/article",
    "/klub/projekty-evil/a",
    "/klub/projekty/a?do=edit",
    "/klub/projekty/a?action=download",
    "/klub/projekty/admin/a",
  ])
    assert.equal(link(value, "document").allowed, false, value);
  assert.equal(
    link("/_media/klub/projekty/report.docx", "page").allowed,
    false,
  );
  assert.equal(
    link(
      "/klub/projekty/vyrocni-zpravy-2026",
      "page",
      "https://wiki.sh.cvut.cz/_media/klub/projekty/challenge.html",
    ).allowed,
    false,
  );
  assert.equal(
    link("https://suz.cvut.cz/cz/media/file/a", "document").allowed,
    false,
  );
  assert.equal(
    decideDiscovery(catalog, {
      seedId: sh.id,
      parentUrl: sh.url,
      url: "/klub/projekty/a",
      relation: "page",
      depth: 4,
      section: "Article",
    }).allowed,
    false,
  );
  assert.equal(
    decideDiscovery(catalog, {
      seedId: sh.id,
      parentUrl: sh.url,
      url: "/klub/projekty/a",
      relation: "page",
      depth: 1,
      section: "",
    }).allowed,
    false,
  );
});

test("extensionless SÚZ attachments and CVUT files are reachable directly from approved hubs", () => {
  for (const [hub, url] of [
    [
      "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty",
      "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty",
    ],
    [
      "https://www.cvut.cz/vnitrni-predpisy",
      "https://www.cvut.cz/sites/default/files/content/123/cs/new.pdf",
    ],
  ]) {
    const source = seed(hub);
    assert.equal(
      decideDiscovery(catalog, {
        seedId: source.id,
        parentUrl: hub,
        url,
        relation: "document",
        depth: 1,
        section: "Documents",
      }).allowed,
      true,
    );
    assert.equal(
      decideDiscovery(catalog, {
        seedId: source.id,
        parentUrl: hub,
        url,
        relation: "page",
        depth: 1,
        section: "Navigation",
      }).allowed,
      false,
    );
  }
});

test("loader validates trusted publishers, duplicate provenance and scope escapes and freezes output", () => {
  assert.ok(Object.isFrozen(catalog.seeds[0].discovery.pathPrefixes));
  for (const change of [
    (c: any) => c.publishers[0].hostnames.push("attacker.example"),
    (c: any) => c.seeds[1].catalogRows.push(c.seeds[0].catalogRows[0]),
    (c: any) => c.seeds[1].discovery.pathPrefixes.push("/"),
    (c: any) =>
      c.seeds[1].discovery.attachmentScopes.push({
        hostname: "attacker.example",
        pathPrefixes: ["/docs/"],
      }),
    (c: any) => (c.seeds[1].discovery.maxDepth = Infinity),
    (c: any) =>
      (c.seeds[1].url = "https://user:password@su.cvut.cz/cs/dokumenty"),
  ]) {
    const copy = structuredClone(catalog);
    change(copy);
    assert.throws(() => loadSourceCatalog(copy));
  }
});
