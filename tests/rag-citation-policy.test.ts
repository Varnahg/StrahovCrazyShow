import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import policyData from "../shared/data/rag-citation-policy.json";
import { buildCitationPolicy } from "../scripts/rag-build-citation-policy";
import {
  canonicalizeSourceUrl,
  createSeedUrlPolicy,
  loadSourceCatalog,
} from "../server/rag-source-catalog";
import {
  canonicalizeCitationUrl,
  isCitationUrlAllowed,
  validateCitationPolicy,
} from "../shared/rag-citation-policy";
import type { PublisherId } from "../shared/rag-provenance";

const catalog = loadSourceCatalog(),
  policy = validateCitationPolicy(policyData);
const permittedByAcquisition = (publisher: PublisherId, url: string) =>
  catalog.seeds.some((seed) =>
    createSeedUrlPolicy(catalog, seed.id)(url, publisher),
  );

test("generated citation artifact is deterministic, frozen and covers approved exact seeds", () => {
  assert.deepEqual(buildCitationPolicy(catalog), policy);
  assert.equal(
    readFileSync(
      new URL("../shared/data/rag-citation-policy.json", import.meta.url),
      "utf8",
    ),
    JSON.stringify(buildCitationPolicy(catalog), null, 2) + "\n",
  );
  assert.deepEqual(buildCitationPolicy(structuredClone(catalog)), policy);
  assert.ok(
    Object.isFrozen(policy) &&
      Object.isFrozen(policy.rules) &&
      Object.isFrozen(policy.rules[0].scopes),
  );
  for (const seed of catalog.seeds) {
    const allowed = isCitationUrlAllowed(policy, seed.publisher, seed.url);
    if (seed.access === "public" && seed.role !== "asset-directory")
      assert.ok(allowed, seed.id);
    else assert.equal(allowed, false, seed.id);
    if (allowed)
      assert.ok(permittedByAcquisition(seed.publisher, seed.url), seed.id);
  }
});
test("all representative citation grants remain a subset of actual acquisition grants", () => {
  for (const rule of policy.rules)
    for (const scope of rule.scopes) {
      const base = scope.origin + scope.pathPrefix.replace(/\/$/, "");
      for (const url of [
        base,
        base + "/public-document.pdf",
        base + ":child",
        base + "-evil/a",
        base + "/admin/a",
        base + "?rev=123",
        base + "?do=show",
        base + "?unknown=1",
      ]) {
        if (isCitationUrlAllowed(policy, rule.publisher, url))
          assert.ok(permittedByAcquisition(rule.publisher, url), url);
      }
    }
});
test("public attachments do not authorize authentication, social inventory, asset directories or wrong publishers", () => {
  for (const url of [
    "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty",
    "https://www.suz.cvut.cz/cz/media/file/new-document-without-extension",
  ]) {
    assert.ok(isCitationUrlAllowed(policy, "suz", url));
    assert.equal(isCitationUrlAllowed(policy, "silicon-hill", url), false);
  }
  assert.ok(
    isCitationUrlAllowed(
      policy,
      "silicon-hill",
      "https://wiki.sh.cvut.cz/_media/klub/projekty/zprava_projekty_template.docx",
    ),
  );
  for (const url of [
    "https://is.sh.cvut.cz/budgets",
    "https://fotbalek.sh.cvut.cz/users/sign_in",
    "https://www.facebook.com/RechargingBar/",
    "https://web.suz.cvut.cz/Login",
  ]) {
    for (const publisher of ["silicon-hill", "suz", "su", "cvut"] as const)
      assert.equal(isCitationUrlAllowed(policy, publisher, url), false);
  }
  const changed = structuredClone(catalog);
  changed.seeds
    .find(
      (seed) =>
        seed.publisher === "su" &&
        seed.access === "public" &&
        seed.role !== "asset-directory",
    )!
    .discovery.pathPrefixes.push("/cs/logobanka");
  const widenedSource = buildCitationPolicy(changed);
  assert.equal(
    isCitationUrlAllowed(
      widenedSource,
      "su",
      "https://su.cvut.cz/cs/logobanka/studentska-unie",
    ),
    false,
  );
});
test("wiki revisions are only read queries on explicitly granted wiki page prefixes", () => {
  const base = "https://wiki.sh.cvut.cz/klub/projekty";
  assert.ok(isCitationUrlAllowed(policy, "silicon-hill", base + "?rev=123"));
  for (const suffix of [
    "?rev=0",
    "?rev=-1",
    "?rev=1.5",
    "?rev=123&rev=123",
    "?rev=123&do=show",
    "?rev=123&extra=1",
    "?do=show",
  ]) {
    assert.equal(
      isCitationUrlAllowed(policy, "silicon-hill", base + suffix),
      false,
      suffix,
    );
  }
  assert.equal(
    isCitationUrlAllowed(
      policy,
      "suz",
      "https://www.suz.cvut.cz/cz/media/file/example?rev=123",
    ),
    false,
  );
  assert.equal(
    isCitationUrlAllowed(
      policy,
      "silicon-hill",
      "https://wiki.sh.cvut.cz/_media/klub/projekty/example.docx?rev=123",
    ),
    false,
  );
});
test("exact query-bearing seeds keep their query values and order", () => {
  const seeds = catalog.seeds.filter((seed) => seed.url.includes("?"));
  assert.ok(seeds.length > 0);
  for (const seed of seeds) {
    assert.ok(isCitationUrlAllowed(policy, seed.publisher, seed.url));
    const mutated = new URL(seed.url),
      [key, value] = [...mutated.searchParams].at(-1)!;
    mutated.searchParams.set(key, value + "2");
    assert.equal(
      isCitationUrlAllowed(policy, seed.publisher, mutated.href),
      false,
    );
    const reversed = new URL(seed.url),
      entries = [...reversed.searchParams];
    if (entries.length > 1) {
      reversed.search = new URLSearchParams(entries.reverse()).toString();
      assert.equal(
        isCitationUrlAllowed(policy, seed.publisher, reversed.href),
        false,
      );
    }
  }
});
test("URL normalization preserves acquisition behavior without widening encoded paths", () => {
  const ordinary =
    "https://www.suz.cvut.cz/cz/media/file/sample?utm_source=test#page=2";
  assert.equal(
    canonicalizeCitationUrl(ordinary),
    canonicalizeSourceUrl(ordinary),
  );
  assert.ok(isCitationUrlAllowed(policy, "suz", ordinary));
  for (const url of [
    "http://www.suz.cvut.cz/cz/media/file/a",
    "https://user@www.suz.cvut.cz/cz/media/file/a",
    "https://www.suz.cvut.cz:444/cz/media/file/a",
    "https://www.suz.cvut.cz./cz/media/file/a",
    "https://www.suz.cvut.cz.evil.invalid/cz/media/file/a",
    "https://127.0.0.1/cz/media/file/a",
    "https://www.suz.cvut.cz/cz/media/file-evil/a",
    "https://www.suz.cvut.cz/cz/media/%66ile/a",
    "https://www.suz.cvut.cz/cz/media/file/a%2fb",
    "https://www.suz.cvut.cz/cz/media/file/%25a",
    "https://www.suz.cvut.cz/cz/media/file/%FF",
    "https://www.suz.cvut.cz/cz/media/file/../admin/a",
    "https://www.suz.cvut.cz/cz/media/file/a?token=private",
    "https://www.suz.cvut.cz/cz/media/file/a\\b",
  ])
    assert.equal(isCitationUrlAllowed(policy, "suz", url), false, url);
});
test("followDocuments, per-seed deny boundaries and catalogue identity affect generated policy", () => {
  const changed = structuredClone(catalog);
  for (const seed of changed.seeds)
    if (seed.publisher === "suz") seed.discovery.followDocuments = false;
  const next = buildCitationPolicy(changed);
  assert.notEqual(next.catalogSha256, policy.catalogSha256);
  assert.equal(
    isCitationUrlAllowed(
      next,
      "suz",
      "https://www.suz.cvut.cz/cz/media/file/new-unknown-file",
    ),
    false,
  );
  const scoped = structuredClone(catalog);
  for (const seed of scoped.seeds)
    if (seed.publisher === "suz") {
      seed.discovery.followDocuments = false;
      seed.discovery.pathPrefixes = [];
    }
  const seed = scoped.seeds.find((item) => item.id === "seed-078")!;
  seed.discovery.pathPrefixes = ["/cz/example"];
  seed.discovery.denyPathPrefixes.push("/cz/example/restricted");
  const restricted = buildCitationPolicy(scoped);
  assert.ok(
    isCitationUrlAllowed(
      restricted,
      "suz",
      "https://www.suz.cvut.cz/cz/example/public",
    ),
  );
  assert.equal(
    isCitationUrlAllowed(
      restricted,
      "suz",
      "https://www.suz.cvut.cz/cz/example/restricted/a",
    ),
    false,
  );
});
test("malformed policy descriptors cannot broaden revision grants", () => {
  for (const mutate of [
    (p: any) => (p.schemaVersion = 2),
    (p: any) => (p.catalogSha256 = "bad"),
    (p: any) =>
      p.rules[0].scopes.push({
        origin: "https://www.suz.cvut.cz",
        pathPrefix: "/",
        kind: "page",
        query: "none",
      }),
    (p: any) =>
      p.rules[0].scopes.push({
        origin: "https://www.suz.cvut.cz",
        pathPrefix: "/cz",
        kind: "page",
        query: "wiki-revision",
      }),
    (p: any) => p.rules.push(p.rules[0]),
  ]) {
    const copy = structuredClone(policy);
    mutate(copy);
    assert.throws(() => validateCitationPolicy(copy));
  }
});
