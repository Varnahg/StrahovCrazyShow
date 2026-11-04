import {
  DecisionRouterError,
  SCOPE_THRESHOLD,
  type AnswerMode,
  type DecisionClassification,
  type RequestScope,
  type SegmentClassification,
  type SegmentClassificationInput,
} from "./crazy-typka-decisions";

export { SCOPE_THRESHOLD } from "./crazy-typka-decisions";
// Answer presentation does not grant permission or choose a model tier.
export const ANSWER_MODE_THRESHOLD = 0.5;
export const MAX_SCOPE_SEGMENTS = 6;
export type ScopeSegment = Readonly<{ id: string; text: string }>;
export type ScopeRejection = "off_topic" | "objectifying_people" | "clarify";
const segmenters = {
  cs: new Intl.Segmenter("cs", { granularity: "sentence" }),
  en: new Intl.Segmenter("en", { granularity: "sentence" }),
};

/** Mixed only permits bounded classification; uncertain allowed never admits. */
export function assessScope(decision: DecisionClassification): RequestScope {
  const { kind, confidence } = decision.scope;
  const admission = decision.admissionProbability;
  if (
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    !Number.isFinite(admission) ||
    admission < 0 ||
    admission > 1
  )
    return "clarify";
  if (kind === "mixed") return "mixed";
  if (kind === "allowed")
    return admission >= SCOPE_THRESHOLD ? "allowed" : "clarify";
  return confidence >= SCOPE_THRESHOLD ? kind : "clarify";
}

export function resolvedAnswerMode(
  decision: DecisionClassification,
): AnswerMode {
  return decision.answerMode.kind === "overview" &&
    Number.isFinite(decision.answerMode.confidence) &&
    decision.answerMode.confidence > ANSWER_MODE_THRESHOLD &&
    decision.answerMode.confidence <= 1
    ? "overview"
    : "specific";
}

/** Exact excerpts only. No conjunction guessing or model-written subquery. */
export function splitMixedMessage(
  message: string,
  locale: "cs" | "en",
):
  | { kind: "segments"; segments: readonly ScopeSegment[] }
  | { kind: "clarify"; reason: "unsplittable" | "too-many-segments" } {
  const segments: ScopeSegment[] = [];
  for (const line of message.split(/[\r\n;]+/u)) {
    const content = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/u, "").trim();
    for (const sentence of segmenters[locale].segment(content)) {
      const text = sentence.segment.trim();
      if (!text) continue;
      segments.push(Object.freeze({ id: `s${segments.length}`, text }));
      if (segments.length > MAX_SCOPE_SEGMENTS)
        return { kind: "clarify", reason: "too-many-segments" };
    }
  }
  return segments.length >= 2
    ? { kind: "segments", segments: Object.freeze(segments) }
    : { kind: "clarify", reason: "unsplittable" };
}

function validSegments(segments: readonly ScopeSegment[]): boolean {
  return (
    Array.isArray(segments) &&
    segments.length >= 2 &&
    segments.length <= MAX_SCOPE_SEGMENTS &&
    segments.every(
      (segment, index) =>
        segment !== null &&
        typeof segment === "object" &&
        segment.id === `s${index}` &&
        typeof segment.text === "string" &&
        !!segment.text.trim(),
    )
  );
}

/** The caller must moderate this exact returned text before classifySegments. */
export function prepareSegmentClassification(
  original: string,
  segments: readonly ScopeSegment[],
  context?: Readonly<{
    previousSuccessfulUser?: string;
    verifiedReply?: Readonly<{ admittedUserTask: string; text: string }>;
  }>,
): SegmentClassificationInput {
  if (
    typeof original !== "string" ||
    !original.trim() ||
    !validSegments(segments)
  )
    throw new DecisionRouterError("invalid-input");
  if (
    context &&
    ((context.previousSuccessfulUser !== undefined &&
      typeof context.previousSuccessfulUser !== "string") ||
      (context.verifiedReply !== undefined &&
        (!context.verifiedReply ||
          typeof context.verifiedReply.admittedUserTask !== "string" ||
          typeof context.verifiedReply.text !== "string")))
  )
    throw new DecisionRouterError("invalid-input");
  const explicitContext = context
    ? {
        ...(context.previousSuccessfulUser !== undefined
          ? { previousSuccessfulUser: context.previousSuccessfulUser }
          : {}),
        ...(context.verifiedReply !== undefined
          ? {
              verifiedReply: {
                admittedUserTask: context.verifiedReply.admittedUserTask,
                text: context.verifiedReply.text,
              },
            }
          : {}),
      }
    : undefined;
  const text = JSON.stringify({
    original,
    candidates: segments,
    ...(explicitContext ? { context: explicitContext } : {}),
  });
  if (Buffer.byteLength(text, "utf8") > 8191)
    throw new DecisionRouterError("request-too-large");
  return Object.freeze({
    text,
    segmentIds: Object.freeze(segments.map(({ id }) => id)),
  });
}

export type ApprovedScopeProjection =
  | {
      kind: "allowed";
      message: string;
      decision: DecisionClassification;
      hasRejected: boolean;
      rejectedKinds: readonly ScopeRejection[];
    }
  | { kind: "clarify"; rejectedKinds: readonly ScopeRejection[] };

/** Use only admitted excerpts for generation and for future USER context. */
export function projectApprovedSegments(
  segments: readonly ScopeSegment[],
  result: SegmentClassification,
): ApprovedScopeProjection {
  if (
    !validSegments(segments) ||
    !Array.isArray(result.segments) ||
    result.segments.length !== segments.length
  )
    throw new DecisionRouterError("invalid-response");
  const remaining = new Map(segments.map((segment) => [segment.id, segment]));
  const classifications = new Map<string, DecisionClassification>();
  for (const item of result.segments) {
    if (!item || !remaining.delete(item.id) || !item.decision)
      throw new DecisionRouterError("invalid-response");
    classifications.set(item.id, item.decision);
  }
  const approved: {
    segment: ScopeSegment;
    decision: DecisionClassification;
  }[] = [];
  const rejectedKinds: ScopeRejection[] = [];
  for (const segment of segments) {
    const decision = classifications.get(segment.id)!;
    const scope = assessScope(decision);
    if (scope === "allowed") approved.push({ segment, decision });
    else
      rejectedKinds.push(
        scope === "off_topic" || scope === "objectifying_people"
          ? scope
          : "clarify",
      );
  }
  if (!approved.length) return { kind: "clarify", rejectedKinds };
  const overviews = approved.filter(
    ({ decision }) => resolvedAnswerMode(decision) === "overview",
  );
  return {
    kind: "allowed",
    message: approved.map(({ segment }) => segment.text).join("\n\n"),
    decision: {
      admissionProbability: Math.min(
        ...approved.map(({ decision }) => decision.admissionProbability),
      ),
      scope: {
        kind: "allowed",
        confidence: Math.min(
          ...approved.map(({ decision }) => decision.scope.confidence),
        ),
      },
      answerMode: overviews.length
        ? {
            kind: "overview",
            confidence: Math.max(
              ...overviews.map(
                ({ decision }) => decision.answerMode.confidence,
              ),
            ),
          }
        : { kind: "specific", confidence: 0 },
      complexProbability: Math.max(
        ...approved.map(({ decision }) => decision.complexProbability),
      ),
      localSourcesProbability: Math.max(
        ...approved.map(({ decision }) => decision.localSourcesProbability),
      ),
    },
    hasRejected: rejectedKinds.length > 0,
    rejectedKinds,
  };
}

export function scopeReply(kind: ScopeRejection, locale: "cs" | "en"): string {
  if (kind === "objectifying_people")
    return locale === "cs"
      ? "S hledáním lidí jako „kořisti“ ti nepomůžu. Jestli chceš poznat někoho ze Strahova, zkus společné akce, studentské kluby nebo seznamovací aplikaci — a hlavně respektuj, když druhá strana nemá zájem."
      : "I won't help look for people as sexual prey. If you want to meet someone from Strahov, try shared events, student clubs or a dating app, and respect it when someone isn't interested.";
  if (kind === "off_topic")
    return locale === "cs"
      ? "Pomáhám s informacemi a praktickým životem na Strahově: s kolejemi, Silicon Hillem, jídlem, dopravou, akcemi a místními službami. Zkus otázku z této oblasti."
      : "I help with information and practical life at Strahov: dorms, Silicon Hill, food, transport, events and local services. Try a question about one of those.";
  return locale === "cs"
    ? "Co konkrétně potřebuješ zjistit o Strahově nebo životě na kolejích? Zkus prosím jednu samostatnou místní otázku."
    : "What specifically do you need to know about Strahov or dorm life? Please ask one separate local question.";
}

export function mixedRefusal(locale: "cs" | "en"): string {
  return locale === "cs"
    ? "Zbývající část zprávy tady nezodpovím. Pomáhám s praktickým životem na Strahově; místní dotaz můžeš položit samostatně."
    : "I won't answer the remaining part of this message here. I help with practical life at Strahov; you can ask your local question separately.";
}
