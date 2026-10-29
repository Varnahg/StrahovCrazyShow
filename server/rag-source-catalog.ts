import { isIP } from "node:net";
import { createHash } from "node:crypto";
import catalogData from "./data/rag/source-catalog.json";
import publisherData from "../shared/data/rag-publishers.json";

export type PublisherId = "silicon-hill" | "suz" | "su" | "cvut";
export type SourcePublisher = {
  id: PublisherId;
  name: string;
  hostnames: string[];
};
export type SourceSeed = {
  id: string;
  url: string;
  title: string;
  publisher: PublisherId;
  catalogRows: number[];
  role: "discovery" | "document" | "feed" | "access-point" | "asset-directory";
  access: "public" | "authentication" | "needs-policy-review";
  stateHint: "current" | "archived" | "unknown";
  expectedFormat: string | null;
  discovery: {
    pathPrefixes: string[];
    documentPathPrefixes: string[];
    attachmentScopes: { hostname: string; pathPrefixes: string[] }[];
    denyPathPrefixes: string[];
    maxDepth: number;
    followDocuments: boolean;
  };
  evidenceNote: string;
};
export type SourceCatalog = {
  schemaVersion: 1;
  catalogVersion: string;
  publishers: SourcePublisher[];
  seeds: SourceSeed[];
  sourceReport: {
    fileName: string;
    sha256: string;
    urlRowsSha256: string;
    sections: Record<string, number>;
  };
};
const publisherIds: PublisherId[] = ["silicon-hill", "suz", "su", "cvut"];
const blockedSegment =
  /(?:^|[/:])(?:admin|login|logout|sign_in|sign_out|signin|signup|wp-admin|wp-login\.php|edit|search|action)(?:[/:.]|$)/i;
const blockedQuery =
  /^(?:do|action|act|edit|search|query|q|login|logout|password|token|session|sessionid|phpsessid)$/i;

/** Pure normalization. Document/version parameters (including rev) remain significant. */
export function canonicalizeSourceUrl(value: string, base?: string): string {
  if (
    typeof value !== "string" ||
    /[\u0000-\u0020\u007f\\]/.test(value) ||
    /^(?:https:)?\/\/[^/?#]*@/i.test(value)
  )
    throw new Error("Unsafe URL characters or credentials");
  const url = new URL(value, base);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    /@/.test(url.host) ||
    isIP(url.hostname.replace(/^\[|\]$/g, ""))
  )
    throw new Error(
      "Only credential-free HTTPS DNS hosts on port 443 are allowed",
    );
  if (
    url.hostname.endsWith(".") ||
    !/^[a-z0-9.-]+$/.test(url.hostname) ||
    !url.hostname.includes(".")
  )
    throw new Error("Invalid DNS host");
  // Avoid disagreements between URL, reverse-proxy and application path decoders.
  if (/%(?:2f|5c|00|25)/i.test(url.pathname))
    throw new Error("Ambiguous encoded path");
  decodeURIComponent(url.pathname); // Reject invalid UTF-8/escape sequences.
  url.hash = "";
  for (const name of [...url.searchParams.keys()])
    if (/^utm_/i.test(name) || /^(?:fbclid|gclid|dclid|msclkid)$/i.test(name))
      url.searchParams.delete(name);
  return url.href;
}

function safeEndpoint(url: URL): boolean {
  return (
    !blockedSegment.test(decodeURIComponent(url.pathname)) &&
    ![...url.searchParams.keys()].some((key) => blockedQuery.test(key))
  );
}
function inPrefix(path: string, prefix: string): boolean {
  const normalized = prefix.replace(/\/$/, "");
  return (
    path === normalized ||
    path.startsWith(`${normalized}/`) ||
    (normalized.includes(":") && path.startsWith(`${normalized}:`))
  );
}
function prefixes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        typeof p === "string" &&
        p.startsWith("/") &&
        p !== "/" &&
        !/[?#\\]|\/\.\.?\//.test(p) &&
        !/%(?:2f|5c|00|25)/i.test(p),
    )
  );
}

/** Rejects malformed or scope-widening input; returns an isolated, deeply frozen catalog. */
export function loadSourceCatalog(input: unknown = catalogData): SourceCatalog {
  const c = structuredClone(input) as SourceCatalog;
  if (
    !c ||
    c.schemaVersion !== 1 ||
    typeof c.catalogVersion !== "string" ||
    !Array.isArray(c.publishers) ||
    !Array.isArray(c.seeds)
  )
    throw new Error("Invalid source catalog");
  if (JSON.stringify(c.publishers) !== JSON.stringify(publisherData.publishers))
    throw new Error("Publisher registry differs from trusted shared registry");
  if (
    c.publishers.length !== 4 ||
    !publisherIds.every((id) => c.publishers.some((p) => p.id === id))
  )
    throw new Error("Invalid publishers");
  const ids = new Set<string>(),
    urls = new Set<string>(),
    rows = new Set<number>();
  for (const s of c.seeds) {
    if (
      !s ||
      typeof s.id !== "string" ||
      !s.id ||
      ids.has(s.id) ||
      typeof s.title !== "string" ||
      !s.title ||
      !publisherIds.includes(s.publisher)
    )
      throw new Error("Invalid or duplicate seed identity");
    const canonical = canonicalizeSourceUrl(s.url);
    const publisher = c.publishers.find((p) => p.id === s.publisher)!;
    if (
      !publisher.hostnames.includes(new URL(canonical).hostname) ||
      urls.has(canonical)
    )
      throw new Error("Duplicate or unapproved seed URL");
    if (
      !Array.isArray(s.catalogRows) ||
      !s.catalogRows.length ||
      s.catalogRows.some(
        (r) => !Number.isSafeInteger(r) || r < 1 || rows.has(r),
      ) ||
      new Set(s.catalogRows).size !== s.catalogRows.length
    )
      throw new Error("Invalid catalog row provenance");
    if (
      ![
        "discovery",
        "document",
        "feed",
        "access-point",
        "asset-directory",
      ].includes(s.role) ||
      !["public", "authentication", "needs-policy-review"].includes(s.access) ||
      !["current", "archived", "unknown"].includes(s.stateHint) ||
      !(s.expectedFormat === null || typeof s.expectedFormat === "string") ||
      typeof s.evidenceNote !== "string" ||
      !s.evidenceNote
    )
      throw new Error("Invalid source metadata");
    const d = s.discovery;
    if (
      !d ||
      !prefixes(d.pathPrefixes) ||
      !prefixes(d.documentPathPrefixes) ||
      !prefixes(d.denyPathPrefixes) ||
      !Number.isInteger(d.maxDepth) ||
      d.maxDepth < 0 ||
      d.maxDepth > 10 ||
      typeof d.followDocuments !== "boolean" ||
      !Array.isArray(d.attachmentScopes)
    )
      throw new Error("Invalid discovery scope");
    for (const a of d.attachmentScopes)
      if (
        !a ||
        !publisher.hostnames.includes(a.hostname) ||
        !prefixes(a.pathPrefixes)
      )
        throw new Error("Invalid attachment scope");
    ids.add(s.id);
    urls.add(canonical);
    s.catalogRows.forEach((r) => rows.add(r));
  }
  if (
    !c.sourceReport ||
    !/^[a-f0-9]{64}$/.test(c.sourceReport.sha256) ||
    !/^[a-f0-9]{64}$/.test(c.sourceReport.urlRowsSha256) ||
    typeof c.sourceReport.fileName !== "string" ||
    !c.sourceReport.sections ||
    Object.values(c.sourceReport.sections).some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    )
  )
    throw new Error("Invalid report provenance");
  const urlRows = c.seeds
    .flatMap((s) => s.catalogRows.map((line) => ({ line, url: s.url })))
    .sort((a, b) => a.line - b.line);
  const urlRowsHash = createHash("sha256")
    .update(urlRows.map((r) => `${r.line}\t${r.url}`).join("\n"))
    .digest("hex");
  if (
    urlRowsHash !== c.sourceReport.urlRowsSha256 ||
    Object.values(c.sourceReport.sections).reduce((a, b) => a + b, 0) !==
      rows.size
  )
    throw new Error("Catalog provenance inventory mismatch");
  const freeze = (v: unknown): void => {
    if (v && typeof v === "object") {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
  };
  freeze(c);
  return c;
}

/** Host identity alone never grants discovery paths. Private and review-only seeds stay blocked. */
export function isPublisherUrlAllowed(
  catalog: SourceCatalog,
  value: string,
  publisher: PublisherId,
): boolean {
  try {
    const url = new URL(canonicalizeSourceUrl(value));
    const p = catalog.publishers.find((item) => item.id === publisher);
    return (
      !!p?.hostnames.includes(url.hostname) &&
      safeEndpoint(url) &&
      !catalog.seeds.some(
        (s) =>
          s.access !== "public" && new URL(s.url).hostname === url.hostname,
      )
    );
  } catch {
    return false;
  }
}

export type DiscoveryRequest = {
  seedId: string;
  parentUrl: string;
  url: string;
  relation: "page" | "document" | "feed-entry" | "canonical";
  depth: number;
  section: string;
};
export type DiscoveryDecision =
  | {
      allowed: true;
      url: string;
      publisher: PublisherId;
      seedId: string;
      parentUrl: string;
      relation: DiscoveryRequest["relation"];
      section: string;
    }
  | { allowed: false; reason: string };

function withinSeed(
  catalog: SourceCatalog,
  seed: SourceSeed,
  url: URL,
  documents: boolean,
): boolean {
  if (!isPublisherUrlAllowed(catalog, url.href, seed.publisher)) return false;
  if (
    seed.discovery.denyPathPrefixes.some((p) =>
      inPrefix(decodeURIComponent(url.pathname), p),
    )
  )
    return false;
  if (canonicalizeSourceUrl(seed.url) === url.href) return true;
  const origin = new URL(seed.url).origin;
  // An exact catalog seed is separately approved, but its policy is not inherited here.
  if (
    catalog.seeds.some(
      (s) =>
        s.publisher === seed.publisher &&
        s.access === "public" &&
        canonicalizeSourceUrl(s.url) === url.href,
    )
  )
    return true;
  if (
    origin === url.origin &&
    seed.discovery.pathPrefixes.some((p) => inPrefix(url.pathname, p))
  )
    return true;
  return (
    documents &&
    seed.discovery.followDocuments &&
    ((origin === url.origin &&
      seed.discovery.documentPathPrefixes.some((p) =>
        inPrefix(url.pathname, p),
      )) ||
      seed.discovery.attachmentScopes.some(
        (scope) =>
          scope.hostname === url.hostname &&
          scope.pathPrefixes.some((p) => inPrefix(url.pathname, p)),
      ))
  );
}

/** Caller supplies actual extracted parent/section/type; navigation is never a document relation. */
export function decideDiscovery(
  catalog: SourceCatalog,
  request: DiscoveryRequest,
): DiscoveryDecision {
  const deny = (reason: string): DiscoveryDecision => ({
    allowed: false,
    reason,
  });
  const seed = catalog.seeds.find((s) => s.id === request.seedId);
  if (!seed || seed.access !== "public" || seed.role === "asset-directory")
    return deny("seed-access");
  if (
    !Number.isSafeInteger(request.depth) ||
    request.depth < 1 ||
    request.depth > seed.discovery.maxDepth
  )
    return deny("depth-limit");
  if (
    !request.section.trim() ||
    !["page", "document", "feed-entry", "canonical"].includes(request.relation)
  )
    return deny("missing-link-provenance");
  try {
    const parent = new URL(canonicalizeSourceUrl(request.parentUrl));
    const url = new URL(canonicalizeSourceUrl(request.url, parent.href));
    // Download-only paths cannot become HTML traversal parents, even after a misleading MIME.
    if (!withinSeed(catalog, seed, parent, false))
      return deny("parent-outside-page-scope");
    if (!withinSeed(catalog, seed, url, request.relation === "document"))
      return deny("outside-discovery-scope");
    return {
      allowed: true,
      url: url.href,
      publisher: seed.publisher,
      seedId: seed.id,
      parentUrl: parent.href,
      relation: request.relation,
      section: request.section,
    };
  } catch {
    return deny("unsafe-url");
  }
}

/** Redirect policy retains the seed's bounded path/attachment scope. */
export function createSeedUrlPolicy(
  catalog: SourceCatalog,
  seedId: string,
): (url: string, publisher: PublisherId) => boolean {
  const seed = catalog.seeds.find((s) => s.id === seedId);
  return (value, publisher) => {
    if (
      !seed ||
      seed.access !== "public" ||
      seed.publisher !== publisher ||
      seed.role === "asset-directory"
    )
      return false;
    try {
      return withinSeed(
        catalog,
        seed,
        new URL(canonicalizeSourceUrl(value)),
        true,
      );
    } catch {
      return false;
    }
  };
}
