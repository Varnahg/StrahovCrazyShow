import { createHash } from "node:crypto";
import data from "./data/silicon-hill-knowledge.json";
import {
  CRAZY_TYPKA_LIMITS,
  isCrazyTypkaSource,
  type CrazyTypkaSource,
} from "../shared/crazy-typka";

export type KnowledgeChunk = {
  id: string;
  text: string;
  sourceLocator: string;
  source: CrazyTypkaSource;
  versionNote: string;
  contentSha256: string;
  topic: KnowledgeTopic;
};
export type KnowledgeTopic =
  "membership" | "network" | "office" | "projects" | "sport" | "documents";
// Specific services take precedence over generic membership mentioned with them.
const topicTerms: Record<KnowledgeTopic, ReadonlySet<string>> = {
  sport: new Set(["sport", "posilovna", "boulder"]),
  network: new Set(["sit", "router", "zarizeni", "spravce"]),
  office: new Set(["kancelar"]),
  projects: new Set([
    "projekt",
    "aktivita",
    "hudebna",
    "tanec",
    "3d",
    "tisk",
    "gamedev",
    "macgyver",
    "sherna",
    "vcely",
    "zahradky",
  ]),
  membership: new Set(["clenstvi", "registrace", "platba", "ucet", "uid"]),
  documents: new Set(["dokument", "stanovy", "pravidla", "trest", "sankce"]),
};
const stop = new Set(
  "a i v ve na se si s z ze do od pro to je jsou jsem jsme by byt jak jaka jake jaky kde kdo co ci ktery ktera ktere kolik kdy mi me muj moje ma mam muzu chci potrebuji prosim ne nebo ale ten ta toto o u po k ke da at the is a an to of for in on with how what where can i my please help sh silicon hill strahov strahove strahova".split(
    " ",
  ),
);
const groups: [RegExp, string][] = [
  [/^(clen|membership|member)/, "clenstvi"],
  [/^(registr|predregistr|prihlas|pridam|pridat|join)/, "registrace"],
  [/^(sit|wifi|internet|network|connection|pripoj)/, "sit"],
  [/^(router|hotspot|switch)/, "router"],
  [/^(zari|device)/, "zarizeni"],
  [/^(kancel|office)/, "kancelar"],
  [/^(kontakt|contact)/, "kontakt"],
  [/^(poplat|prispev|cen|price|fee|cost|stoji)/, "cena"],
  [/^(platb|plac|payment|pay)/, "platba"],
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
];
function words(text: string) {
  const words =
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [];
  return words
    .filter((word) => word.length > 1 && !stop.has(word))
    .map((word) => groups.find(([pattern]) => pattern.test(word))?.[1] ?? word);
}
export const KNOWLEDGE_REVIEW_AFTER = data.reviewAfter;
/** Review dates describe our evidence review, never a document's effective date. */
export function isKnowledgeCurrent(
  checkedAt: string,
  reviewAfter: string,
  now: number = Date.now(),
): boolean {
  const parseDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const instant = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(instant) &&
      new Date(instant).toISOString().slice(0, 10) === value
      ? instant
      : NaN;
  };
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
export const KNOWLEDGE_CHUNKS: readonly KnowledgeChunk[] = Object.freeze(
  data.chunks.map((chunk) => {
    const meta = data.sources.find((source) => source.id === chunk.sourceId);
    if (!meta) throw new Error("Unknown knowledge source");
    if (!Object.hasOwn(topicTerms, chunk.topic))
      throw new Error("Unknown knowledge topic");
    const source: CrazyTypkaSource = {
      id: meta.id,
      title: meta.title,
      url: meta.url,
      checkedAt: data.checkedAt,
      author: meta.author,
      license: meta.license,
      licenseUrl: meta.licenseUrl,
      adaptation: "curated-paraphrase",
    };
    if (
      !isCrazyTypkaSource(source) ||
      createHash("sha256").update(chunk.text).digest("hex") !==
        chunk.contentSha256
    )
      throw new Error("Invalid curated knowledge metadata or content hash");
    return Object.freeze({
      id: chunk.id,
      text: chunk.text,
      sourceLocator: chunk.sourceLocator,
      source: Object.freeze(source),
      versionNote: meta.versionNote,
      contentSha256: chunk.contentSha256,
      topic: chunk.topic as KnowledgeTopic,
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

export function retrieveKnowledge(
  query: string,
  limit: number = CRAZY_TYPKA_LIMITS.sources,
  now: number = Date.now(),
): KnowledgeChunk[] {
  return rankKnowledge(query, limit, now);
}
function rankKnowledge(
  query: string,
  limit: number,
  now: number,
  topic?: KnowledgeTopic,
): KnowledgeChunk[] {
  if (
    !Number.isFinite(limit) ||
    limit < 1 ||
    !isKnowledgeCurrent(data.checkedAt, data.reviewAfter, now)
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
    return /\b(silicon\s+hill|sh)\b/i.test(query) &&
      /\b(co|what|klub|club)\b/i.test(query)
      ? [KNOWLEDGE_CHUNKS.find((chunk) => chunk.id === "sh-statutes-purpose")!]
      : [];
  }
  const ranked = index
    .map((doc) => {
      if (topic && doc.chunk.topic !== topic) return { doc, score: 0 };
      // A shared filler word in prose is not sufficient evidence of relevance.
      const matching = tokens.filter((token) => doc.keywords.has(token)).length;
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
  return ranked
    .slice(
      0,
      Math.max(0, Math.min(CRAZY_TYPKA_LIMITS.sources, Math.floor(limit))),
    )
    .map(({ doc }) => doc.chunk);
}

function isFollowUp(message: string): boolean {
  if (message.length > 160) return false;
  const normalized = message
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  return (
    /^(?:a )?(?:kolik(?: to)? stoji|kolik|kde (?:to|ho|ji) najdu|kde to je|jak se tam dostanu|jaka je oteviraci doba|jaka jsou pravidla|a co cena)[?!.]*$/.test(
      normalized,
    ) ||
    /^(?:and )?(?:how much (?:does (?:it|that) cost|is (?:it|that))|where (?:is (?:it|that)|can i find (?:it|that))|how (?:do|can) i get there|what (?:are the (?:opening hours|rules)|about the price))[?!.]*$/.test(
      normalized,
    )
  );
}
function findTopic(tokens: readonly string[]) {
  return (Object.keys(topicTerms) as KnowledgeTopic[]).find((key) =>
    tokens.some((token) => topicTerms[key].has(token)),
  );
}

/** Only validated USER questions may identify a topic. Bot prose is never evidence. */
export function retrieveConversationKnowledge(
  message: string,
  previous: readonly { role: string; content: string }[],
  limit: number = CRAZY_TYPKA_LIMITS.sources,
  now: number = Date.now(),
): KnowledgeChunk[] {
  if (!isFollowUp(message)) {
    const tokens = words(message.slice(0, CRAZY_TYPKA_LIMITS.messageChars));
    if (tokens.includes("cena")) {
      const topic = findTopic(tokens);
      return topic ? rankKnowledge(message, limit, now, topic) : [];
    }
    return retrieveKnowledge(message, limit, now);
  }
  const users = previous.filter((entry) => entry.role === "user").slice(-3);
  for (let i = users.length - 1; i >= 0; i--) {
    const candidate = users[i].content.slice(
      0,
      CRAZY_TYPKA_LIMITS.messageChars,
    );
    if (isFollowUp(candidate)) continue;
    const tokens = words(candidate);
    const topic = findTopic(tokens);
    // A newer unknown topic is a boundary, not permission to recover an older one.
    if (!topic) return [];
    const anchor = tokens.filter((token) => topicTerms[topic].has(token));
    return rankKnowledge(`${anchor.join(" ")} ${message}`, limit, now, topic);
  }
  return [];
}
