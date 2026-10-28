import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CRAZY_TYPKA_LIMITS,
  CRAZY_TYPKA_SOURCE_HOSTS,
  isCrazyTypkaSource,
  type CrazyTypkaSource,
} from "../shared/crazy-typka";

const topics = [
  "membership",
  "network",
  "office",
  "projects",
  "sport",
  "documents",
  "housing",
  "housing-payments",
  "housing-arrival",
  "housing-termination",
  "housing-maintenance",
  "dining",
  "photography",
  "printing",
  "game-room",
] as const;
export type KnowledgeTopic = (typeof topics)[number];
export type KnowledgeAuthority = "silicon-hill" | "suz";
export type KnowledgeDocument = {
  id: string;
  title: string;
  url: string;
  discoveryUrl: string;
  authority: KnowledgeAuthority;
  status: "current";
  checkedAt: string;
  reviewAfter: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUpdatedAt: string | null;
  documentDate: string | null;
  authorityLevel: string;
  versionNote: string;
};
export type KnowledgeChunk = {
  id: string;
  text: string;
  sourceLocator: string;
  source: CrazyTypkaSource;
  document: Readonly<KnowledgeDocument>;
  versionNote: string;
  contentSha256: string;
  topic: KnowledgeTopic;
};
export type RawKnowledgeChunk = {
  id: string;
  sourceId: string;
  text: string;
  sourceLocator: string;
  topic: KnowledgeTopic;
  keywords: string[];
  contentSha256: string;
};
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}
function nullableText(value: unknown, max: number): value is string | null {
  return value === null || text(value, max);
}
function invalid(): never {
  throw new Error("Invalid AI knowledge data");
}
function parseDay(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return NaN;
  const instant = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(instant) &&
    new Date(instant).toISOString().slice(0, 10) === value
    ? instant
    : NaN;
}
/** Review dates are administrative UTC days, never a document's effective date. */
export function isKnowledgeCurrent(
  checkedAt: string,
  reviewAfter: string,
  now = Date.now(),
): boolean {
  const checked = parseDay(checkedAt),
    expires = parseDay(reviewAfter);
  return (
    Number.isFinite(now) &&
    Number.isFinite(checked) &&
    Number.isFinite(expires) &&
    expires > checked &&
    now >= checked &&
    now < expires
  );
}
function parseEffective(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const match = /^(\d{4}-\d{2}-\d{2})T00:00:00([+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(parseDay(match[1]))) return NaN;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return NaN;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value;
  return [part("year"), part("month"), part("day")].join("-") === match[1] &&
    part("hour") === "00" &&
    part("minute") === "00" &&
    part("second") === "00"
    ? instant
    : NaN;
}
const institutionHosts: Record<KnowledgeAuthority, readonly string[]> =
  CRAZY_TYPKA_SOURCE_HOSTS;
function sourceUrl(
  value: unknown,
  authority: KnowledgeAuthority,
): value is string {
  if (!text(value, 1000)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      institutionHosts[authority].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
function citationFor(source: KnowledgeDocument): CrazyTypkaSource {
  return Object.freeze({
    id: source.id,
    title: source.title,
    url: source.url,
    checkedAt: source.checkedAt,
    author: source.author,
    license: source.license,
    licenseUrl: source.licenseUrl,
    adaptation: "curated-paraphrase",
  });
}
export function validateKnowledgeDatasets(datasets: readonly unknown[]) {
  const sources: KnowledgeDocument[] = [],
    chunks: RawKnowledgeChunk[] = [];
  const sourceIds = new Set<string>(),
    chunkIds = new Set<string>();
  for (const data of datasets) {
    if (
      !object(data) ||
      data.version !== 2 ||
      !Array.isArray(data.sources) ||
      !Array.isArray(data.chunks) ||
      data.sources.length > 256 ||
      data.chunks.length > 2048
    )
      invalid();
    const local = new Set<string>();
    for (const raw of data.sources) {
      if (
        !object(raw) ||
        !text(raw.id, 100) ||
        !/^[a-z0-9][a-z0-9-]*$/.test(raw.id) ||
        sourceIds.has(raw.id) ||
        !text(raw.title, 200) ||
        (raw.authority !== "silicon-hill" && raw.authority !== "suz") ||
        raw.status !== "current" ||
        !text(raw.versionNote, 1000) ||
        !nullableText(raw.author, 150) ||
        !nullableText(raw.license, 100) ||
        !nullableText(raw.licenseUrl, 300) ||
        !nullableText(raw.sourceUpdatedAt, 150) ||
        !(
          raw.documentDate === null ||
          Number.isFinite(parseDay(raw.documentDate))
        ) ||
        typeof raw.authorityLevel !== "string" ||
        ![
          "statutes",
          "internal-rule",
          "official-document",
          "official-service",
          "overview",
          "directory",
          "wiki",
        ].includes(raw.authorityLevel)
      )
        invalid();
      if (
        !sourceUrl(raw.url, raw.authority) ||
        !sourceUrl(raw.discoveryUrl, raw.authority)
      )
        invalid();
      if (
        raw.authority === "suz"
          ? !raw.id.startsWith("suz-")
          : !raw.id.startsWith("sh-") &&
            ![
              "membership",
              "documents",
              "statutes",
              "network",
              "projects",
              "sport",
            ].includes(raw.id)
      )
        invalid();
      const checked = parseDay(raw.checkedAt),
        review = parseDay(raw.reviewAfter);
      const from =
        raw.effectiveFrom === null
          ? -Infinity
          : parseEffective(raw.effectiveFrom);
      const until =
        raw.effectiveUntil === null
          ? Infinity
          : parseEffective(raw.effectiveUntil);
      if (
        !Number.isFinite(checked) ||
        !Number.isFinite(review) ||
        review <= checked ||
        Number.isNaN(from) ||
        Number.isNaN(until) ||
        until <= from
      )
        invalid();
      const source = Object.freeze({ ...raw }) as KnowledgeDocument;
      if (
        !isCrazyTypkaSource(citationFor(source)) ||
        (raw.license === "CC BY-SA 4.0") !==
          (raw.licenseUrl ===
            "https://creativecommons.org/licenses/by-sa/4.0/") ||
        (raw.license !== null && raw.license !== "CC BY-SA 4.0")
      )
        invalid();
      sources.push(source);
      sourceIds.add(raw.id);
      local.add(raw.id);
    }
    for (const raw of data.chunks) {
      if (
        !object(raw) ||
        !text(raw.id, 100) ||
        !/^(sh|suz)-[a-z0-9-]+$/.test(raw.id) ||
        chunkIds.has(raw.id) ||
        typeof raw.sourceId !== "string" ||
        !local.has(raw.sourceId) ||
        !text(raw.text, 800) ||
        !text(raw.sourceLocator, 300) ||
        !topics.includes(raw.topic as KnowledgeTopic) ||
        !Array.isArray(raw.keywords) ||
        !raw.keywords.length ||
        raw.keywords.length > 40 ||
        !raw.keywords.every((value) => text(value, 100)) ||
        typeof raw.contentSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(raw.contentSha256) ||
        createHash("sha256").update(raw.text).digest("hex") !==
          raw.contentSha256
      )
        invalid();
      const source = sources.find((item) => item.id === raw.sourceId)!;
      if (!raw.id.startsWith(source.authority === "suz" ? "suz-" : "sh-"))
        invalid();
      chunks.push({ ...raw, keywords: [...raw.keywords] } as RawKnowledgeChunk);
      chunkIds.add(raw.id);
    }
  }
  return { sources, chunks };
}

const stop = new Set(
  "a i v ve na se si s z ze do od pro to je jsou jsem jsme by byt jak jaka jake jaky kde kdo co ci ktery ktera ktere kolik kdy mi me muj moje ma mam muzu chci potrebuji prosim ne nebo ale ten ta toto o u po k ke da at the is a an to of for in on with how what where can i my please help sh silicon hill strahov strahove strahova".split(
    " ",
  ),
);
const groups: [RegExp, string][] = [
  [/^(clen|membership|member)/, "clenstvi"],
  [/^(registr|predregistr|prihlas|pridam|pridat|join)/, "registrace"],
  [
    /^(sit(?:e|i|ova|ove|ovy)?$|wifi|internet|network|connection|pripoj)/,
    "sit",
  ],
  [/^(router|hotspot|switch)/, "router"],
  [/^(zarizen|device)/, "zarizeni"],
  [/^(kancel|office)/, "kancelar"],
  [/^(kontakt|contact)/, "kontakt"],
  [/^(poplat|prispev|cen|price|fee|cost|stoji)/, "cena"],
  [/^(platb|plateb|plac|zaplat|zaplac|payment|pay)/, "platba"],
  [/^(prevod|preved|transfer)/, "prevod"],
  [/^(rezerv|reserv|booking)/, "rezervace"],
  [/^(projekt|project)/, "projekt"],
  [/^(zapoj|dobrovol|volunteer|participat)/, "zapojit"],
  [/^(aktiv|activity|activities|podniknout|zabav|hobb|leisure)/, "aktivita"],
  [/^(posilov|fitko|fitness|gym|cvic|exercise)/, "posilovna"],
  [/^(hudeb|music)/, "hudebna"],
  [/^(tane|tanec|danc)/, "tanec"],
  [/^(dokument|document)/, "dokument"],
  [/^(pravid|predpis|rule)/, "pravidla"],
  [/^(stanov|statute)/, "stanovy"],
  [/^(nefung|broken|problem)/, "problem"],
  [/^(uct|ucet|account)/, "ucet"],
  [/^(fotokom|fotograf|photograph)/, "fotokomora"],
  [/^(fotoatelier)/, "fotoatelier"],
  [/^(tiskarn|printing|print$)/, "tisk"],
  [/^(shern|herna|gaming)/, "sherna"],
  [/^(ubytov|housing|accommodat|dormitor)/, "ubytovani"],
  [/^(kolejn|rent$)/, "kolejne"],
  [/^(smlouv|contract)/, "smlouva"],
  [/^(kauc|deposit|jistot)/, "kauce"],
  [/^(nastehov|nastup|nastoup|arrival|checkin)/, "nastup"],
  [/^(narok|jist(?:y|ou|e)$|entitle|guarantee)/, "narok"],
  [/^(vypoved|ukonc|vystehov|termination|checkout)/, "vypoved"],
  [
    /^(zavad|oprav|udrzb|havar|stenic|hmyz|maintenance|repair|insect)/,
    "udrzba",
  ],
  [/^(menz|jideln|strav|bufet|canteen|dining|buffet)/, "menza"],
  [/^(hrist|pitch)/, "hriste"],
  [/^(pronaj|rental|renting)/, "pronajem"],
  [/^(sportov)/, "sport"],
  [/^(pokoj|room)/, "pokoj"],
  [/^(hospodar)/, "hospodarka"],
  [/^(doklad|obcank|obcansk|prukaz|passport|identity)/, "doklad"],
];
function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(
      /\bfoto\s+atelier\w*\b|\bfotografick\w*\s+atelier\w*\b/g,
      "fotoatelier",
    )
    .replace(/\bprevzeti\s+pokoje\b/g, "nastup pokoj");
}
function words(text: string) {
  const words = normalizeText(text).match(/[a-z0-9]+/g) ?? [];
  return words
    .filter((word) => word.length > 1 && !stop.has(word))
    .map((word) => groups.find(([pattern]) => pattern.test(word))?.[1] ?? word);
}

type Scope = {
  authority?: KnowledgeAuthority;
  topics?: readonly KnowledgeTopic[];
  required?: string;
  coverTopics?: boolean;
};
function scopeFor(message: string): Scope | null | undefined {
  const normalized = normalizeText(message),
    tokens = new Set(words(message));
  const sh = /\bsh\b|silicon\s*hill/.test(normalized),
    suz = /\bsuz\b|iskam/.test(normalized);
  const authority =
    sh && !suz ? "silicon-hill" : suz && !sh ? "suz" : undefined;
  const has = (...values: string[]) =>
    values.some((value) => tokens.has(value));
  if (has("clenstvi") && has("kolejne", "ubytovani"))
    return { topics: ["membership", "housing-payments"], coverTopics: true };
  if (has("fotoatelier", "modelland"))
    return {
      authority: "silicon-hill",
      topics: ["projects"],
      required: has("fotoatelier") ? "fotoatelier" : "modelland",
    };
  if (has("fotokomora"))
    return { authority: "silicon-hill", topics: ["photography"] };
  if (has("3d", "tisk"))
    return { authority: "silicon-hill", topics: ["printing"] };
  if (has("sherna", "vr"))
    return { authority: "silicon-hill", topics: ["game-room"] };
  if (has("posilovna", "boulder"))
    return { authority: authority ?? "silicon-hill", topics: ["sport"] };
  if (has("hriste") || (has("pronajem") && has("sport")))
    return { authority: authority ?? "suz", topics: ["sport"] };
  if (has("sport"))
    return { authority: authority ?? "silicon-hill", topics: ["sport"] };
  if (has("sit", "router", "zarizeni", "mac", "eduroam"))
    return { authority: "silicon-hill", topics: ["network", "membership"] };
  if (has("menza")) return { authority: "suz", topics: ["dining"] };
  if (has("kolejne", "kauce") || (suz && has("platba", "cena")))
    return { authority: "suz", topics: ["housing-payments"] };
  if (has("vypoved"))
    return { authority: "suz", topics: ["housing-termination"] };
  if (has("udrzba"))
    return { authority: "suz", topics: ["housing-maintenance"] };
  if (has("nastup")) return { authority: "suz", topics: ["housing-arrival"] };
  if (suz && has("registrace"))
    return { authority: "suz", topics: ["housing", "housing-arrival"] };
  if ((suz || has("ubytovani")) && has("dokument"))
    return { authority: "suz", topics: ["documents"] };
  if (
    has("ubytovani", "smlouva", "iskam", "pokoj", "hospodarka") ||
    (!sh && /\bkolej(?:i|e)?\b/.test(normalized))
  )
    return {
      authority: "suz",
      topics: has("cena", "platba")
        ? ["housing-payments"]
        : ["housing", "housing-arrival", "housing-termination"],
    };
  if (has("kancelar"))
    return authority
      ? {
          authority,
          topics:
            authority === "silicon-hill"
              ? ["office"]
              : ["office", "housing", "housing-arrival"],
        }
      : null;
  if (
    has(
      "hudebna",
      "tanec",
      "projekt",
      "aktivita",
      "gamedev",
      "macgyver",
      "vcely",
      "zahradky",
    )
  ) {
    const concrete = [
      "hudebna",
      "tanec",
      "gamedev",
      "macgyver",
      "vcely",
      "zahradky",
    ].find((word) => tokens.has(word));
    return {
      authority: "silicon-hill",
      topics: ["projects"],
      ...(concrete ? { required: concrete } : {}),
    };
  }
  if (
    has("clenstvi", "uid") ||
    (sh && has("registrace", "platba", "ucet", "cena"))
  )
    return { authority: "silicon-hill", topics: ["membership"] };
  if (has("dokument", "stanovy", "pravidla", "trest", "sankce"))
    return {
      authority,
      topics:
        authority === "suz"
          ? ["housing", "documents"]
          : ["documents", "membership"],
    };
  if (has("cena", "platba", "registrace", "ucet")) return null;
  return authority ? { authority } : undefined;
}

function isFollowUp(message: string): boolean {
  if (message.length > 160) return false;
  const normalized = normalizeText(message).trim();
  return (
    /^(?:a )?(?:kolik(?: to)? stoji|kolik|kde (?:to|ho|ji) najdu|kde to je|jak se tam dostanu|jaka je oteviraci doba|jaka jsou pravidla|a co cena)[?!.]*$/.test(
      normalized,
    ) ||
    /^(?:and )?(?:how much (?:does (?:it|that) cost|is (?:it|that))|where (?:is (?:it|that)|can i find (?:it|that))|how (?:do|can) i get there|what (?:are the (?:opening hours|rules)|about the price))[?!.]*$/.test(
      normalized,
    )
  );
}

/** Validation/index creation are lazy and testable; no data read during module import. */
export function createKnowledgeRegistry(datasets: readonly unknown[]) {
  const data = validateKnowledgeDatasets(datasets);
  const sources = new Map(
    data.sources.map(
      (source) =>
        [
          source.id,
          {
            metadata: source,
            citation: citationFor(source),
            from: Math.max(
              parseDay(source.checkedAt),
              source.effectiveFrom === null
                ? -Infinity
                : parseEffective(source.effectiveFrom),
            ),
            until: Math.min(
              parseDay(source.reviewAfter),
              source.effectiveUntil === null
                ? Infinity
                : parseEffective(source.effectiveUntil),
            ),
          },
        ] as const,
    ),
  );
  const isSourceUsable = (id: string, now = Date.now()) => {
    const source = sources.get(id);
    return (
      !!source &&
      Number.isFinite(now) &&
      now >= source.from &&
      now < source.until
    );
  };
  const KNOWLEDGE_CHUNKS: readonly KnowledgeChunk[] = Object.freeze(
    data.chunks.map((chunk) => {
      const source = sources.get(chunk.sourceId)!;
      return Object.freeze({
        id: chunk.id,
        text: chunk.text,
        sourceLocator: chunk.sourceLocator,
        source: source.citation,
        document: source.metadata,
        versionNote: source.metadata.versionNote,
        contentSha256: chunk.contentSha256,
        topic: chunk.topic,
      });
    }),
  );

  // Build once: no per-user response cache and no network or runtime ingestion.
  const index = data.chunks.map((chunk, i) => {
    const tokens = words(
      `${chunk.text} ${chunk.keywords.join(" ")} ${chunk.keywords.join(" ")}`,
    );
    const frequency = new Map<string, number>();
    for (const token of tokens)
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    return {
      chunk: KNOWLEDGE_CHUNKS[i],
      frequency,
      length: tokens.length,
      keywords: new Set(words(chunk.keywords.join(" "))),
    };
  });
  const averageLength =
    index.reduce((sum, doc) => sum + doc.length, 0) / index.length;
  const documentFrequency = new Map<string, number>();
  for (const doc of index)
    for (const token of doc.frequency.keys())
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);

  function retrieveKnowledge(
    query: string,
    limit: number = CRAZY_TYPKA_LIMITS.sources,
    now: number = Date.now(),
  ): KnowledgeChunk[] {
    return rankKnowledge(query, limit, now, scopeFor(query));
  }
  function rankKnowledge(
    query: string,
    limit: number,
    now: number,
    scope?: Scope | null,
  ): KnowledgeChunk[] {
    if (
      !Number.isFinite(limit) ||
      limit < 1 ||
      !Number.isFinite(now) ||
      scope === null
    )
      return [];
    const tokens = [
      ...new Set(words(query.slice(0, CRAZY_TYPKA_LIMITS.messageChars))),
    ];
    // This campus-specific starter has no topic word after normal stopword removal.
    // Keep the phrase bounded so a generic "what can I do" does not invent evidence.
    if (
      /^\s*what (?:can i|is there to) do (?:at|in) (?:strahov|silicon hill)\s*[?!.]?\s*$/i.test(
        query,
      )
    )
      tokens.push("aktivita");
    if (!tokens.length) {
      const purpose = KNOWLEDGE_CHUNKS.find(
        (chunk) => chunk.id === "sh-statutes-purpose",
      );
      return purpose &&
        isSourceUsable(purpose.source.id, now) &&
        /\b(silicon\s+hill|sh)\b/i.test(query) &&
        /\b(co|what|klub|club)\b/i.test(query)
        ? [purpose]
        : [];
    }
    const ranked = index
      .map((doc) => {
        if (
          !isSourceUsable(doc.chunk.source.id, now) ||
          (scope?.authority &&
            doc.chunk.document.authority !== scope.authority) ||
          (scope?.topics && !scope.topics.includes(doc.chunk.topic)) ||
          (scope?.required && !doc.keywords.has(scope.required))
        )
          return { doc, score: 0 };
        // A shared filler word in prose is not sufficient evidence of relevance.
        const matching = tokens.filter((token) =>
          doc.keywords.has(token),
        ).length;
        if (!matching || (tokens.length >= 5 && matching / tokens.length < 0.2))
          return { doc, score: 0 };
        const score = tokens.reduce((sum, token) => {
          const tf = doc.frequency.get(token) ?? 0;
          if (!tf) return sum;
          const df = documentFrequency.get(token) ?? 0;
          const idf = Math.log(1 + (index.length - df + 0.5) / (df + 0.5));
          return (
            sum +
            (idf * tf * 2.2) /
              (tf + 1.2 * (0.25 + (0.75 * doc.length) / averageLength))
          );
        }, 0);
        return { doc, score };
      })
      .filter(({ score }) => score >= 0.75)
      .sort(
        (a, b) =>
          b.score - a.score || a.doc.chunk.id.localeCompare(b.doc.chunk.id),
      );
    // An explicit comparison retains evidence for each named institution/service.
    const covered = scope?.coverTopics
      ? (scope.topics ?? []).flatMap((topic) => {
          const match = ranked.find(({ doc }) => doc.chunk.topic === topic);
          return match ? [match] : [];
        })
      : [];
    return [...covered, ...ranked.filter((item) => !covered.includes(item))]
      .slice(
        0,
        Math.max(0, Math.min(CRAZY_TYPKA_LIMITS.sources, Math.floor(limit))),
      )
      .map(({ doc }) => doc.chunk);
  }

  function retrieveConversation(
    message: string,
    previous: readonly { role: string; content: string }[],
    limit: number = CRAZY_TYPKA_LIMITS.sources,
    now = Date.now(),
  ) {
    if (!isFollowUp(message)) return retrieveKnowledge(message, limit, now);
    const users = previous.filter((entry) => entry.role === "user").slice(-3);
    for (let i = users.length - 1; i >= 0; i--) {
      const candidate = users[i].content.slice(
        0,
        CRAZY_TYPKA_LIMITS.messageChars,
      );
      if (isFollowUp(candidate)) continue;
      const scope = scopeFor(candidate);
      if (!scope) return [];
      return rankKnowledge(candidate + " " + message, limit, now, scope);
    }
    return [];
  }
  return Object.freeze({
    chunks: KNOWLEDGE_CHUNKS,
    isSourceUsable,
    retrieve: retrieveKnowledge,
    retrieveConversation,
  });
}
export type KnowledgeRegistry = ReturnType<typeof createKnowledgeRegistry>;
let registry: KnowledgeRegistry | undefined;
/** Only these current files are runtime inputs. JSON/schema errors stay inside optional AI init. */
export function loadKnowledgeRegistry(
  read: (url: URL) => string = (url) => readFileSync(url, "utf8"),
): KnowledgeRegistry {
  return createKnowledgeRegistry([
    JSON.parse(
      read(new URL("./data/silicon-hill-knowledge.json", import.meta.url)),
    ),
    JSON.parse(read(new URL("./data/rag/silicon-hill.json", import.meta.url))),
    JSON.parse(read(new URL("./data/rag/suz.json", import.meta.url))),
  ]);
}
export function getKnowledgeRegistry(): KnowledgeRegistry {
  if (!registry) registry = loadKnowledgeRegistry();
  return registry;
}
export function retrieveKnowledge(
  query: string,
  limit: number = CRAZY_TYPKA_LIMITS.sources,
  now = Date.now(),
) {
  return getKnowledgeRegistry().retrieve(query, limit, now);
}
export function retrieveConversationKnowledge(
  query: string,
  previous: readonly { role: string; content: string }[],
  limit: number = CRAZY_TYPKA_LIMITS.sources,
  now = Date.now(),
) {
  return getKnowledgeRegistry().retrieveConversation(
    query,
    previous,
    limit,
    now,
  );
}
