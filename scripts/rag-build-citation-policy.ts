import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeSourceUrl,
  loadSourceCatalog,
  type SourceCatalog,
} from "../server/rag-source-catalog";
import {
  validateCitationPolicy,
  type CitationPolicy,
  type CitationScope,
} from "../shared/rag-citation-policy";
import { canonicalRagJson } from "../shared/rag-provenance";

/** Deterministic projection of the versioned acquisition policy, never the host inventory alone. */
export function buildCitationPolicy(input: SourceCatalog): CitationPolicy {
  const catalog = loadSourceCatalog(input);
  const deniedHostnames = [
    ...new Set(
      catalog.seeds
        .filter((seed) => seed.access !== "public")
        .map((seed) => new URL(seed.url).hostname),
    ),
  ].sort();
  const deniedExactUrls = [
    ...new Set(
      catalog.seeds
        .filter((seed) => seed.role === "asset-directory")
        .map((seed) => canonicalizeSourceUrl(seed.url)),
    ),
  ].sort();
  const rules = catalog.seeds
    .filter(
      (seed) =>
        seed.access === "public" &&
        seed.role !== "asset-directory" &&
        !deniedHostnames.includes(new URL(seed.url).hostname),
    )
    .map((seed) => {
      const origin = new URL(seed.url).origin;
      const scopes: CitationScope[] = seed.discovery.pathPrefixes.map(
        (pathPrefix) => ({
          origin,
          pathPrefix,
          kind: "page",
          query: ["wiki.sh.cvut.cz", "wiki.su.cvut.cz"].includes(
            new URL(origin).hostname,
          )
            ? "wiki-revision"
            : "none",
        }),
      );
      if (seed.discovery.followDocuments) {
        for (const pathPrefix of seed.discovery.documentPathPrefixes)
          scopes.push({ origin, pathPrefix, kind: "document", query: "none" });
        for (const attachment of seed.discovery.attachmentScopes)
          if (!deniedHostnames.includes(attachment.hostname)) {
            for (const pathPrefix of attachment.pathPrefixes)
              scopes.push({
                origin: "https://" + attachment.hostname,
                pathPrefix,
                kind: "document",
                query: "none",
              });
          }
      }
      const unique = [
        ...new Map(
          scopes.map((scope) => [canonicalRagJson(scope), scope]),
        ).entries(),
      ]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, scope]) => scope);
      return {
        seedId: seed.id,
        publisher: seed.publisher,
        exactUrl: canonicalizeSourceUrl(seed.url),
        denyPathPrefixes: [...new Set(seed.discovery.denyPathPrefixes)].sort(),
        scopes: unique,
      };
    })
    .sort((a, b) => (a.seedId < b.seedId ? -1 : a.seedId > b.seedId ? 1 : 0));
  return validateCitationPolicy({
    schemaVersion: 1,
    catalogVersion: catalog.catalogVersion,
    catalogSha256: createHash("sha256")
      .update(canonicalRagJson(catalog), "utf8")
      .digest("hex"),
    deniedHostnames,
    deniedExactUrls,
    rules,
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 2)
    throw new Error("citation-policy-arguments-not-supported");
  const policy = buildCitationPolicy(loadSourceCatalog());
  await writeFile(
    new URL("../shared/data/rag-citation-policy.json", import.meta.url),
    JSON.stringify(policy, null, 2) + "\n",
    "utf8",
  );
  process.stdout.write(
    JSON.stringify({
      schemaVersion: policy.schemaVersion,
      rules: policy.rules.length,
      catalogSha256: policy.catalogSha256,
    }) + "\n",
  );
}
