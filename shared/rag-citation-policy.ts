import {
  hasOnlyKeys,
  isRagHash,
  isRagRecord,
  isRagText,
  RAG_PUBLISHERS,
  type PublisherId,
} from "./rag-provenance";

export type CitationScope = Readonly<{
  origin: string;
  pathPrefix: string;
  kind: "page" | "document";
  query: "none" | "wiki-revision";
}>;
export type CitationRule = Readonly<{
  seedId: string;
  publisher: PublisherId;
  exactUrl: string;
  denyPathPrefixes: readonly string[];
  scopes: readonly CitationScope[];
}>;
export type CitationPolicy = Readonly<{
  schemaVersion: 1;
  catalogVersion: string;
  catalogSha256: string;
  deniedHostnames: readonly string[];
  deniedExactUrls: readonly string[];
  rules: readonly CitationRule[];
}>;
const blockedSegment =
  /(?:^|[/:])(?:admin|login|logout|sign_in|sign_out|signin|signup|wp-admin|wp-login\.php|edit|search|action)(?:[/:.]|$)/i;
const blockedQuery =
  /^(?:do|action|act|edit|search|query|q|login|logout|password|token|session|sessionid|phpsessid)$/i;
const wikiHosts = new Set(["wiki.sh.cvut.cz", "wiki.su.cvut.cz"]);
function invalid(): never {
  throw new Error("invalid-citation-policy");
}

/** Same URL normalization boundary as acquisition, without Node dependencies. */
export function canonicalizeCitationUrl(value: string): string {
  if (
    !isRagText(value, 8192) ||
    /[\u0000-\u0020\u007f\\]/.test(value) ||
    /^(?:https:)?\/\/[^/?#]*@/i.test(value)
  )
    invalid();
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hostname.endsWith(".") ||
    !/^[a-z0-9.-]+$/.test(url.hostname) ||
    !url.hostname.includes(".") ||
    /^(?:\d+\.)+\d+$/.test(url.hostname) ||
    /%(?:2f|5c|00|25)/i.test(url.pathname)
  )
    invalid();
  decodeURIComponent(url.pathname);
  url.hash = "";
  for (const name of [...url.searchParams.keys()])
    if (/^utm_/i.test(name) || /^(?:fbclid|gclid|dclid|msclkid)$/i.test(name))
      url.searchParams.delete(name);
  return url.href;
}
function validPrefix(value: unknown): value is string {
  if (
    !isRagText(value, 1000) ||
    !value.startsWith("/") ||
    value === "/" ||
    /[?#\\]|\/\.\.?\//.test(value) ||
    /%(?:2f|5c|00|25)/i.test(value)
  )
    return false;
  try {
    decodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}
function withinPrefix(path: string, prefix: string): boolean {
  const normalized = prefix.replace(/\/$/, "");
  return (
    path === normalized ||
    path.startsWith(normalized + "/") ||
    (normalized.includes(":") && path.startsWith(normalized + ":"))
  );
}
function safeEndpoint(url: URL): boolean {
  return (
    !blockedSegment.test(decodeURIComponent(url.pathname)) &&
    ![...url.searchParams.keys()].some((key) => blockedQuery.test(key))
  );
}
function uniqueStrings(
  value: unknown,
  maximum: number,
  valid: (v: unknown) => v is string,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    value.every(valid) &&
    new Set(value).size === value.length
  );
}
export function validateCitationPolicy(value: unknown): CitationPolicy {
  if (
    !isRagRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "catalogVersion",
      "catalogSha256",
      "deniedHostnames",
      "deniedExactUrls",
      "rules",
    ]) ||
    value.schemaVersion !== 1 ||
    !isRagText(value.catalogVersion, 200) ||
    !isRagHash(value.catalogSha256) ||
    !uniqueStrings(
      value.deniedHostnames,
      256,
      (host): host is string =>
        isRagText(host, 253) &&
        /^[a-z0-9.-]+$/.test(host) &&
        host.includes(".") &&
        !host.endsWith("."),
    ) ||
    !uniqueStrings(value.deniedExactUrls, 1000, (url): url is string => {
      try {
        return typeof url === "string" && canonicalizeCitationUrl(url) === url;
      } catch {
        return false;
      }
    }) ||
    !Array.isArray(value.rules) ||
    value.rules.length > 1000
  )
    invalid();
  const ids = new Set<string>();
  const rules = value.rules.map((raw) => {
    if (
      !isRagRecord(raw) ||
      !hasOnlyKeys(raw, [
        "seedId",
        "publisher",
        "exactUrl",
        "denyPathPrefixes",
        "scopes",
      ]) ||
      !isRagText(raw.seedId, 100) ||
      ids.has(raw.seedId) ||
      !RAG_PUBLISHERS.includes(raw.publisher as PublisherId) ||
      typeof raw.exactUrl !== "string" ||
      !uniqueStrings(raw.denyPathPrefixes, 128, validPrefix) ||
      !Array.isArray(raw.scopes) ||
      raw.scopes.length > 128
    )
      invalid();
    try {
      if (canonicalizeCitationUrl(raw.exactUrl) !== raw.exactUrl) invalid();
    } catch {
      invalid();
    }
    ids.add(raw.seedId);
    const scopes = raw.scopes.map((scope) => {
      if (
        !isRagRecord(scope) ||
        !hasOnlyKeys(scope, ["origin", "pathPrefix", "kind", "query"]) ||
        typeof scope.origin !== "string" ||
        !validPrefix(scope.pathPrefix) ||
        !["page", "document"].includes(scope.kind as string) ||
        !["none", "wiki-revision"].includes(scope.query as string)
      )
        invalid();
      try {
        if (
          canonicalizeCitationUrl(scope.origin + "/") !== scope.origin + "/" ||
          new URL(scope.origin).origin !== scope.origin
        )
          invalid();
        if (
          scope.query === "wiki-revision" &&
          (scope.kind !== "page" ||
            !wikiHosts.has(new URL(scope.origin).hostname))
        )
          invalid();
      } catch {
        invalid();
      }
      return Object.freeze({
        origin: scope.origin,
        pathPrefix: scope.pathPrefix,
        kind: scope.kind as CitationScope["kind"],
        query: scope.query as CitationScope["query"],
      });
    });
    if (
      new Set(scopes.map((scope) => JSON.stringify(scope))).size !==
      scopes.length
    )
      invalid();
    return Object.freeze({
      seedId: raw.seedId,
      publisher: raw.publisher as PublisherId,
      exactUrl: raw.exactUrl,
      denyPathPrefixes: Object.freeze([...raw.denyPathPrefixes]),
      scopes: Object.freeze(scopes),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    catalogVersion: value.catalogVersion,
    catalogSha256: value.catalogSha256,
    deniedHostnames: Object.freeze([...value.deniedHostnames]),
    deniedExactUrls: Object.freeze([...value.deniedExactUrls]),
    rules: Object.freeze(rules),
  });
}
/** A citation grant is not a robots check or permission to traverse arbitrary links. */
export function isCitationUrlAllowed(
  policy: CitationPolicy,
  publisher: PublisherId,
  value: string,
): boolean {
  try {
    const canonical = canonicalizeCitationUrl(value),
      url = new URL(canonical);
    if (
      !safeEndpoint(url) ||
      policy.deniedHostnames.includes(url.hostname) ||
      policy.deniedExactUrls.includes(canonical)
    )
      return false;
    const decodedPath = decodeURIComponent(url.pathname);
    return policy.rules.some(
      (rule) =>
        rule.publisher === publisher &&
        !rule.denyPathPrefixes.some((prefix) =>
          withinPrefix(decodedPath, prefix),
        ) &&
        (rule.exactUrl === canonical ||
          rule.scopes.some(
            (scope) =>
              scope.origin === url.origin &&
              withinPrefix(url.pathname, scope.pathPrefix) &&
              (url.search === "" ||
                (scope.query === "wiki-revision" &&
                  [...url.searchParams].length === 1 &&
                  url.searchParams.has("rev") &&
                  /^[1-9]\d{0,14}$/.test(url.searchParams.get("rev")!))),
          )),
    );
  } catch {
    return false;
  }
}
