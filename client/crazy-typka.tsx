import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CRAZY_TYPKA_LIMITS,
  CRAZY_TYPKA_SPEAKER,
  CRAZY_TYPKA_STARTERS,
  CURRENT_KNOWLEDGE_SCOPE,
  crazyTypkaScopeKey,
  isCrazyTypkaKnowledgeScope,
  type CrazyTypkaKnowledgeScope,
  isCrazyTypkaChatResponse,
  isCrazyTypkaErrorResponse,
  isCrazyTypkaSession,
  isCrazyTypkaStatus,
  type CrazyTypkaSource,
  type CrazyTypkaAnswerBlock,
  type CrazyTypkaReplyTo,
} from "../shared/crazy-typka";
import type { CuratedKnowledgeSource } from "../shared/knowledge-curation";

type Locale = "cs" | "en";
export type CrazyTypkaMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
  sources: CrazyTypkaSource[];
  knowledgeScope?: CrazyTypkaKnowledgeScope;
  requestSeq?: number;
  blocks?: readonly CrazyTypkaAnswerBlock[];
  quote?: CrazyTypkaDraftReply;
};
export type CrazyTypkaDraftReply = CrazyTypkaReplyTo & { text: string };
export type CrazyTypkaSnapshot = {
  availability: "checking" | "enabled" | "disabled" | "error";
  busy: boolean;
  draft: string;
  messages: readonly CrazyTypkaMessage[];
  error: string | null;
  notice: "session-restarted" | "scope-changed" | null;
  recovery: "none" | "retry" | "reset";
  knowledgeScope: CrazyTypkaKnowledgeScope;
  draftReply: CrazyTypkaDraftReply | null;
  replyableRequestSeqs: readonly number[];
};

export function safeCitationHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Only the published anonymous source contract reaches this view. */
export function CuratedKnowledgeDetails({
  source,
  locale,
}: {
  source: CuratedKnowledgeSource;
  locale: Locale;
}) {
  const cs = locale === "cs";
  const community = source.verification === "community-experience";
  return (
    <>
      <span>{source.title}</span>
      <small>
        <strong>
          {community
            ? cs
              ? "Komunitní zkušenost — nezávisle neověřeno"
              : "Community experience — not independently verified"
            : cs
              ? "Kurátorovaná odpověď doložená oficiálními zdroji"
              : "Curated answer supported by official sources"}
        </strong>
        {source.status === "archived" && (
          <strong className="crazy-archive-label">
            {" "}
            · {cs ? "Archiv" : "Archive"}
          </strong>
        )}
        <span> · {source.applicability}</span>
        {source.observedFrom && (
          <span>
            {" "}
            · {cs ? "Období zkušeností" : "Observation period"}:{" "}
            {source.observedFrom} – {source.observedUntil}
          </span>
        )}
        <span>
          {" "}
          · {cs ? "Kontrola kurace" : "Curation reviewed"}:{" "}
          <time dateTime={source.reviewedAt}>{source.reviewedAt}</time>
        </span>
        {source.factCheckedAt && (
          <span>
            {" "}
            · {cs ? "Ověření tvrzení" : "Claims checked"}:{" "}
            <time dateTime={source.factCheckedAt}>{source.factCheckedAt}</time>
          </span>
        )}
        {source.limitations.map((limitation, index) => (
          <span key={index}> · {limitation}</span>
        ))}
      </small>
      {source.supportingRefs.length > 0 && (
        <ul>
          {source.supportingRefs.map((ref) => (
            <li key={`${ref.url}:${ref.locator}`}>
              {safeCitationHref(ref.url) ? (
                <a
                  href={safeCitationHref(ref.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ref.title} ↗
                </a>
              ) : (
                <span>{ref.title}</span>
              )}
              <small>
                {ref.locator} · {cs ? "Ověřeno" : "Checked"}:{" "}
                {ref.factCheckedAt}
              </small>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

class ChatRequestError extends Error {}

/** Own one private conversation in App memory, independently of either widget mount. */
export function createCrazyTypkaClient(
  options: {
    request?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  } = {},
) {
  const request = options.request ?? fetch;
  const now = options.now ?? Date.now;
  let snapshot: CrazyTypkaSnapshot = {
    availability: "checking",
    busy: false,
    draft: "",
    messages: [],
    error: null,
    notice: null,
    recovery: "none",
    knowledgeScope: CURRENT_KNOWLEDGE_SCOPE,
    draftReply: null,
    replyableRequestSeqs: [],
  };
  let session: { token: string; expiresAt: number } | undefined;
  type PendingChat = {
    requestSeq: number;
    message: string;
    locale: Locale;
    knowledgeScope?: CrazyTypkaKnowledgeScope;
    token?: string;
    replyTo?: CrazyTypkaReplyTo;
  };
  const replyableAnswers = new Map<number, readonly CrazyTypkaAnswerBlock[]>();
  let pending: PendingChat | undefined;
  let nextRequestSeq = 1;
  let generation = 0;
  let nextMessage = 0;
  let inflight: AbortController | undefined;
  let statusRequest: AbortController | undefined;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<CrazyTypkaSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const decode = async (response: Response) => {
    const body: unknown = await response.json();
    if (!response.ok) {
      const code = isCrazyTypkaErrorResponse(body)
        ? body.error
        : "provider-unavailable";
      throw new ChatRequestError(code);
    }
    return body;
  };
  const revoke = async (token: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await request("/api/ai/session", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        keepalive: true,
      });
      return response.ok || response.status === 401 || response.status === 410;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  const forgetSession = () => {
    session = undefined;
    pending = undefined;
    nextRequestSeq = 1;
    replyableAnswers.clear();
    update({ draftReply: null, replyableRequestSeqs: [] });
  };
  const expireSession = () => {
    forgetSession();
    update({ error: "session-expired", recovery: "none" });
  };
  /** Only this acknowledgement advances the session's operation order. */
  const confirm = (operation: PendingChat) => {
    pending = undefined;
    nextRequestSeq = operation.requestSeq + 1;
    update(
      Number.isSafeInteger(nextRequestSeq)
        ? { recovery: "none" }
        : { recovery: "reset", error: "request-out-of-order" },
    );
  };
  const perform = async (operation: PendingChat) => {
    if (pending !== operation) return;
    const ownGeneration = ++generation;
    const controller = new AbortController();
    inflight = controller;
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 60000,
    );
    const isAttemptCurrent = () =>
      generation === ownGeneration && inflight === controller;
    const isCurrent = () => isAttemptCurrent() && pending === operation;
    update({ busy: true, error: null, recovery: "none" });
    try {
      if (!operation.token) {
        const body = await decode(
          await request("/api/ai/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: controller.signal,
          }),
        );
        if (!isCrazyTypkaSession(body))
          throw new ChatRequestError("invalid-response");
        if (!isCurrent()) {
          void revoke(body.token);
          return;
        }
        if (controller.signal.aborted) {
          void revoke(body.token);
          throw new ChatRequestError("request-timeout");
        }
        session = body;
        operation.token = body.token;
      }
      if (session && session.expiresAt <= now()) {
        expireSession();
        return;
      }
      const response = await request("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!isCurrent()) return;
      if (controller.signal.aborted)
        throw new ChatRequestError("request-timeout");
      if (session && session.expiresAt <= now()) {
        expireSession();
        return;
      }
      if (response.ok) {
        if (
          !isCrazyTypkaChatResponse(body) ||
          body.requestSeq !== operation.requestSeq
        )
          throw new ChatRequestError("invalid-response");
        const reply: CrazyTypkaMessage = {
          id: ++nextMessage,
          role: "ai",
          text: body.text,
          sources: body.sources,
          knowledgeScope: operation.knowledgeScope ?? CURRENT_KNOWLEDGE_SCOPE,
          requestSeq: body.requestSeq,
          ...(body.blocks ? { blocks: body.blocks } : {}),
        };
        if (body.blocks?.some((block) => block.sourceIds.length > 0)) {
          replyableAnswers.set(body.requestSeq, body.blocks);
          if (replyableAnswers.size > CRAZY_TYPKA_LIMITS.historyTurns)
            replyableAnswers.delete(replyableAnswers.keys().next().value!);
        }
        confirm(operation);
        update({
          messages: [...snapshot.messages, reply].slice(-40),
          replyableRequestSeqs: [...replyableAnswers.keys()],
        });
        return;
      }
      if (
        !isCrazyTypkaErrorResponse(body) ||
        (body.requestSeq !== undefined &&
          body.requestSeq !== operation.requestSeq)
      )
        throw new ChatRequestError("invalid-response");
      if (body.error === "session-expired") {
        expireSession();
        return;
      }
      if (
        body.error === "request-conflict" ||
        body.error === "request-out-of-order"
      ) {
        update({ error: body.error, recovery: "reset" });
        return;
      }
      if (body.requestSeq === operation.requestSeq) confirm(operation);
      else update({ recovery: "retry" });
      if (
        body.error === "reply-unavailable" &&
        body.requestSeq === operation.requestSeq
      ) {
        const { requestSeq } = operation.replyTo ?? {};
        if (requestSeq !== undefined) replyableAnswers.delete(requestSeq);
        update({
          draftReply: null,
          replyableRequestSeqs: [...replyableAnswers.keys()],
          ...(!snapshot.draft ? { draft: operation.message } : {}),
        });
      }
      if (body.error === "unavailable") update({ availability: "disabled" });
      update({ error: body.error });
    } catch (error) {
      if (!isCurrent()) return;
      const code = controller.signal.aborted
        ? "request-timeout"
        : error instanceof ChatRequestError
          ? error.message
          : "provider-unavailable";
      if (code === "session-expired") {
        expireSession();
        return;
      }
      if (code === "unavailable") update({ availability: "disabled" });
      update({ error: code, recovery: "retry" });
    } finally {
      clearTimeout(timer);
      if (isAttemptCurrent()) {
        inflight = undefined;
        update({ busy: false });
      }
    }
  };
  const reset = async () => {
    const ownGeneration = ++generation;
    inflight?.abort();
    inflight = undefined;
    const previous = session;
    forgetSession();
    update({
      messages: [],
      draft: "",
      busy: false,
      error: null,
      notice: null,
      recovery: "none",
      knowledgeScope: CURRENT_KNOWLEDGE_SCOPE,
    });
    if (
      previous &&
      !(await revoke(previous.token)) &&
      generation === ownGeneration
    )
      update({ error: "reset-unconfirmed" });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setDraft(draft: string) {
      update({ draft: draft.slice(0, CRAZY_TYPKA_LIMITS.messageChars) });
    },
    selectReply(requestSeq: number, blockId: string) {
      if (snapshot.busy || pending || snapshot.recovery !== "none") return;
      if (!session || session.expiresAt <= now()) {
        if (session) expireSession();
        return;
      }
      const block = replyableAnswers
        .get(requestSeq)
        ?.find(
          (candidate) =>
            candidate.id === blockId && candidate.sourceIds.length > 0,
        );
      if (block)
        update({ draftReply: { requestSeq, blockId, text: block.text } });
    },
    clearReply() {
      update({ draftReply: null });
    },
    setKnowledgeScope(scope: CrazyTypkaKnowledgeScope) {
      if (
        snapshot.busy ||
        pending ||
        snapshot.recovery !== "none" ||
        !isCrazyTypkaKnowledgeScope(scope)
      )
        return;
      if (
        crazyTypkaScopeKey(scope) !==
        crazyTypkaScopeKey(snapshot.knowledgeScope)
      ) {
        replyableAnswers.clear();
        update({
          knowledgeScope: Object.freeze({ ...scope }),
          notice: snapshot.messages.length ? "scope-changed" : snapshot.notice,
          draftReply: null,
          replyableRequestSeqs: [],
        });
      }
    },
    async refreshStatus() {
      statusRequest?.abort();
      const controller = new AbortController();
      statusRequest = controller;
      const timer = setTimeout(() => controller.abort(), 8000);
      update({ availability: "checking" });
      try {
        const body = await decode(
          await request("/api/ai/status", {
            signal: controller.signal,
            cache: "no-store",
          }),
        );
        if (statusRequest !== controller) return;
        if (controller.signal.aborted)
          throw new ChatRequestError("request-timeout");
        if (!isCrazyTypkaStatus(body))
          throw new ChatRequestError("invalid-response");
        update({ availability: body.enabled ? "enabled" : "disabled" });
      } catch {
        if (statusRequest === controller) update({ availability: "error" });
      } finally {
        clearTimeout(timer);
        if (statusRequest === controller) statusRequest = undefined;
      }
    },
    async send(locale: Locale) {
      const message = snapshot.draft.trim();
      if (!message || snapshot.busy || snapshot.availability !== "enabled")
        return;
      const restarting =
        (!!session && session.expiresAt <= now()) ||
        snapshot.error === "session-expired";
      // A selected old quote must never silently become an unquoted new-session request.
      if (restarting && snapshot.draftReply) {
        expireSession();
        return;
      }
      if (restarting) forgetSession();
      if (pending || (!restarting && snapshot.recovery === "reset")) return;
      const userMessage: CrazyTypkaMessage = {
        id: ++nextMessage,
        role: "user",
        text: message,
        sources: [],
        knowledgeScope: snapshot.knowledgeScope,
        ...(snapshot.draftReply ? { quote: { ...snapshot.draftReply } } : {}),
      };
      const operation: PendingChat = {
        requestSeq: nextRequestSeq,
        message,
        locale,
        ...(snapshot.draftReply
          ? {
              replyTo: {
                requestSeq: snapshot.draftReply.requestSeq,
                blockId: snapshot.draftReply.blockId,
              },
            }
          : {}),
        ...(snapshot.knowledgeScope.kind === "archive"
          ? { knowledgeScope: snapshot.knowledgeScope }
          : {}),
      };
      if (session) operation.token = session.token;
      pending = operation;
      update({
        busy: true,
        draft: "",
        draftReply: null,
        error: null,
        notice: restarting ? "session-restarted" : snapshot.notice,
        recovery: "none",
        messages: [...(restarting ? [] : snapshot.messages), userMessage].slice(
          -40,
        ),
      });
      await perform(operation);
    },
    async retry() {
      if (
        !pending ||
        snapshot.busy ||
        snapshot.recovery !== "retry" ||
        snapshot.availability !== "enabled"
      )
        return;
      if (session && session.expiresAt <= now()) {
        expireSession();
        return;
      }
      await perform(pending);
    },
    reset,
    /** Cancellation also erases this private conversation on the server. */
    cancel: reset,
    dispose() {
      generation++;
      inflight?.abort();
      inflight = undefined;
      statusRequest?.abort();
      statusRequest = undefined;
      if (session) void revoke(session.token);
      forgetSession();
      update({
        busy: false,
        messages: [],
        draft: "",
        error: null,
        notice: null,
        recovery: "none",
        knowledgeScope: CURRENT_KNOWLEDGE_SCOPE,
      });
    },
  };
}

export type CrazyTypkaClient = ReturnType<typeof createCrazyTypkaClient>;
export type CrazyTypkaState = CrazyTypkaSnapshot &
  Pick<
    CrazyTypkaClient,
    | "setDraft"
    | "setKnowledgeScope"
    | "selectReply"
    | "clearReply"
    | "send"
    | "retry"
    | "reset"
    | "cancel"
    | "refreshStatus"
  >;

export function useCrazyTypka(): CrazyTypkaState {
  const [client] = useState(() => createCrazyTypkaClient());
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  useEffect(() => {
    void client.refreshStatus();
    return () => client.dispose();
  }, [client]);
  return {
    ...snapshot,
    setDraft: client.setDraft,
    setKnowledgeScope: client.setKnowledgeScope,
    selectReply: client.selectReply,
    clearReply: client.clearReply,
    send: client.send,
    retry: client.retry,
    reset: client.reset,
    cancel: client.cancel,
    refreshStatus: client.refreshStatus,
  };
}

export function crazyTypkaErrorLabel(code: string, locale: Locale) {
  const labels: Record<string, readonly [string, string]> = {
    "rate-limited": [
      "Chvilku počkej před další zprávou.",
      "Please wait a little before sending another message.",
    ],
    busy: [
      "Ještě dokončuji předchozí odpověď. Zkus to za chvíli.",
      "The previous answer is still being prepared. Please try again shortly.",
    ],
    "session-expired": [
      "Konverzace vypršela. Další zpráva začne novou.",
      "This conversation has expired. Your next message starts a new one.",
    ],
    blocked: [
      "Na tuhle zprávu nemůžu odpovědět. Zkus dotaz na hru nebo služby na Strahově.",
      "I cannot answer that message. Try a question about the game or services at Strahov.",
    ],
    "request-timeout": [
      "Odpověď se nepodařilo včas doručit.",
      "The answer could not be delivered in time.",
    ],
    unavailable: ["AI teď není připojená.", "AI is not connected right now."],
    "budget-exhausted": [
      "AI má teď vyčerpaný provozní limit. Zkus to později.",
      "AI has reached its current usage limit. Please try again later.",
    ],
    "reset-unconfirmed": [
      "Zprávy z tohoto okna jsou smazané. Smazání na serveru se nepodařilo potvrdit; historie tam automaticky vyprší.",
      "Messages are cleared from this window. Server deletion could not be confirmed; its history will expire automatically.",
    ],
    "request-conflict": [
      "Předchozí zprávu se nepodařilo bezpečně obnovit. Začni novou konverzaci.",
      "The previous message could not be recovered safely. Start a new conversation.",
    ],
    "request-out-of-order": [
      "Na tuto konverzaci se nepodařilo bezpečně navázat. Začni novou.",
      "This conversation could not be continued safely. Start a new one.",
    ],
    "response-expired": [
      "Podklady předchozí odpovědi už nejsou aktuální. Můžeš položit novou otázku.",
      "The sources for the previous answer are no longer current. You can ask a new question.",
    ],
    "reply-unavailable": [
      "Na tuto část už nelze přímo odpovědět. Citaci jsem odebrala; otázku můžeš upravit a odeslat znovu.",
      "That part is no longer available for a direct reply. The quote was removed; you can edit and send your question again.",
    ],
  };
  return (
    Object.hasOwn(labels, code)
      ? labels[code]
      : [
          "Odpověď se nepodařilo bezpečně dokončit. Zkus to později.",
          "The answer could not be completed safely. Please try again later.",
        ]
  )[locale === "cs" ? 0 : 1];
}

/** Fits content without a resize handle; CSS still owns the min/max sizes. */
export function fitCrazyTypkaComposer(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  const style = field.ownerDocument.defaultView?.getComputedStyle(field);
  const min = Number.parseFloat(style?.minHeight ?? "") || 0;
  const max = Number.parseFloat(style?.maxHeight ?? "") || Infinity;
  const border =
    (Number.parseFloat(style?.borderTopWidth ?? "") || 0) +
    (Number.parseFloat(style?.borderBottomWidth ?? "") || 0);
  const height = field.scrollHeight + border;
  field.style.height = `${Math.max(min, Math.min(max, height))}px`;
  field.style.overflowY = height > max ? "auto" : "hidden";
}

function ChatActionIcon({ kind }: { kind: "info" | "trash" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "info" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6m0-10h.01" />
        </>
      ) : (
        <>
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
        </>
      )}
    </svg>
  );
}

/** Shells place these beside their close action; clearing and closing stay separate. */
export function CrazyTypkaChatActions({
  state,
  locale,
}: {
  state: CrazyTypkaState;
  locale: Locale;
}) {
  const cs = locale === "cs";
  const info = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !info.current?.contains(event.target) &&
        info.current
      )
        info.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const clearLabel = state.busy
    ? cs
      ? "Zastavit a smazat konverzaci"
      : "Stop and clear conversation"
    : state.recovery === "reset"
      ? cs
        ? "Začít novou konverzaci"
        : "Start a new conversation"
      : cs
        ? "Smazat konverzaci"
        : "Clear conversation";
  return (
    <div className="crazy-chat-actions">
      <details
        ref={info}
        className="crazy-chat-info"
        onToggle={(event) => setOpen(event.currentTarget.open)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && event.currentTarget.open) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          aria-label={cs ? "Informace o chatu" : "Chat information"}
          title={cs ? "Informace o chatu" : "Chat information"}
        >
          <ChatActionIcon kind="info" />
        </summary>
        <div className="crazy-chat-info-content">
          <strong>
            {cs ? "Soukromá AI konverzace" : "Private AI conversation"}
          </strong>
          <p>
            {cs
              ? "Fiktivní AI spolužačka, žádná skutečná studentka ani oficiální podpora Silicon Hill."
              : "A fictional AI classmate, not a real student or official Silicon Hill support."}
          </p>
          <p>
            {cs
              ? "Zprávy a kontext této konverzace může zpracovat OpenAI. Ostatní hráči ji nevidí. Neposílej hesla ani osobní údaje. AI si pamatuje jen několik posledních výměn v krátké relaci."
              : "OpenAI may process messages and the context of this conversation. Other players cannot see it. Do not send passwords or personal data. AI remembers only a few recent exchanges in a short session."}
          </p>
          <p>
            {cs
              ? "Odpověď může chybovat. Ověř si citované podklady."
              : "Answers can be wrong. Check the cited sources."}
          </p>
        </div>
      </details>
      <button
        type="button"
        className="crazy-chat-clear"
        aria-label={clearLabel}
        title={clearLabel}
        disabled={
          !state.messages.length &&
          !state.busy &&
          !state.draft &&
          state.recovery === "none"
        }
        onClick={() => void (state.busy ? state.cancel() : state.reset())}
      >
        <ChatActionIcon kind="trash" />
      </button>
    </div>
  );
}

export function CrazyTypkaChat({
  state,
  locale,
  variant = "default",
}: {
  state: CrazyTypkaState;
  locale: Locale;
  variant?: "default" | "compact";
}) {
  const id = useId();
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    if (log.current && followLatest.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [state.messages]);
  useEffect(() => {
    if (composer.current) fitCrazyTypkaComposer(composer.current);
  }, [state.draft, variant]);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    let width = field.getBoundingClientRect().width;
    const fit = () => fitCrazyTypkaComposer(field);
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        if (entry && Math.abs(entry.contentRect.width - width) > 0.5) {
          width = entry.contentRect.width;
          fit();
        }
      });
      observer.observe(field);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const cs = locale === "cs";
  const enabled = state.availability === "enabled";
  const compact = variant === "compact";
  const canSend =
    enabled && !state.busy && state.recovery === "none" && !!state.draft.trim();
  return (
    <section
      className={compact ? "crazy-chat crazy-compact" : "crazy-chat"}
      aria-labelledby={`${id}-title`}
    >
      <header className="crazy-heading">
        <div className="crazy-avatar" aria-hidden="true">
          {compact ? (
            <img
              src="/ui/crazy-typka.svg"
              alt=""
              width="36"
              height="36"
              decoding="async"
            />
          ) : (
            "✦"
          )}
        </div>
        <div>
          <h2 id={`${id}-title`}>
            {CRAZY_TYPKA_SPEAKER.name}{" "}
            <span className="crazy-ai-badge">AI</span>
          </h2>
          {!compact && (
            <p>{cs ? "Tvoje průvodkyně po kopci" : "Your guide to the hill"}</p>
          )}
        </div>
      </header>
      {!enabled && (
        <div
          className={`crazy-availability ${state.availability}`}
          role="status"
        >
          {state.availability === "checking"
            ? cs
              ? "Ověřuji připojení AI…"
              : "Checking AI availability…"
            : state.availability === "disabled"
              ? cs
                ? "AI zatím není připojená. Provozovatel ji musí zapnout."
                : "AI is not connected yet. The operator needs to enable it."
              : cs
                ? "Připojení AI se nepodařilo ověřit."
                : "Could not check AI availability."}
          {state.availability !== "checking" && (
            <button type="button" onClick={() => void state.refreshStatus()}>
              {cs ? "Ověřit znovu" : "Check again"}
            </button>
          )}
        </div>
      )}
      {state.notice === "session-restarted" && (
        <p className="crazy-disclosure" role="status">
          {cs
            ? "Předchozí relace vypršela. Tohle je nová konverzace bez jejího kontextu."
            : "The previous session expired. This is a new conversation without its earlier context."}
        </p>
      )}
      {state.notice === "scope-changed" && (
        <p className="crazy-disclosure" role="status">
          {cs
            ? "Změna podkladů začíná nové téma. Předchozí zprávy zůstávají v přehledu."
            : "Changing sources starts a new topic. Earlier messages remain visible."}
        </p>
      )}
      {state.messages.length > 0 ? (
        <div
          ref={log}
          className="crazy-log"
          role="log"
          aria-live="polite"
          aria-label={cs ? "Konverzace s AI" : "AI conversation"}
          onScroll={(event) => {
            const target = event.currentTarget;
            followLatest.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 32;
          }}
        >
          {state.messages.map((message) => (
            <article
              key={message.id}
              className={`crazy-message ${message.role}`}
            >
              <strong>
                {message.role === "ai" ? (
                  <>
                    {CRAZY_TYPKA_SPEAKER.name}{" "}
                    <span className="crazy-ai-badge">AI</span>
                  </>
                ) : cs ? (
                  "Ty"
                ) : (
                  "You"
                )}
              </strong>
              {message.quote && (
                <blockquote className="crazy-message-quote">
                  {message.quote.text}
                </blockquote>
              )}
              {message.blocks?.length ? (
                message.blocks.map((block) => (
                  <div className="crazy-answer-block" key={block.id}>
                    <p>{block.text}</p>
                    {block.sourceIds.length > 0 &&
                      message.requestSeq !== undefined &&
                      state.replyableRequestSeqs.includes(
                        message.requestSeq,
                      ) && (
                        <button
                          type="button"
                          className="crazy-reply"
                          disabled={state.busy || state.recovery !== "none"}
                          onClick={() => {
                            state.selectReply(message.requestSeq!, block.id);
                            composer.current?.focus();
                          }}
                        >
                          <span aria-hidden="true">↩</span>{" "}
                          {cs ? "Odpovědět" : "Reply"}
                        </button>
                      )}
                  </div>
                ))
              ) : (
                <p>{message.text}</p>
              )}
              {message.knowledgeScope?.kind === "archive" && (
                <small className="crazy-archive-label">
                  {cs ? "Archivní podklady" : "Archive sources"}
                  {message.knowledgeScope.asOf
                    ? ` · ${message.knowledgeScope.asOf}`
                    : ""}
                </small>
              )}
              {message.sources.length > 0 && (
                <details className="crazy-sources">
                  <summary>
                    {cs ? "Použité podklady" : "Sources used"} (
                    {message.sources.length})
                  </summary>
                  <ul>
                    {message.sources.map((source) => (
                      <li key={source.id}>
                        {source.adaptation === "knowledge-curation" ? (
                          <CuratedKnowledgeDetails
                            source={source}
                            locale={locale}
                          />
                        ) : (
                          <>
                            {safeCitationHref(source.url) ? (
                              <a
                                href={safeCitationHref(source.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {source.title} ↗
                              </a>
                            ) : (
                              <span>{source.title}</span>
                            )}
                            <small>
                              {cs ? "Kontrola zdroje" : "Source checked"}:{" "}
                              <time dateTime={source.checkedAt}>
                                {source.checkedAt}
                              </time>{" "}
                              ·{" "}
                              {source.adaptation === "curated-paraphrase"
                                ? cs
                                  ? "stručná parafráze"
                                  : "short paraphrase"
                                : cs
                                  ? `extrakce dokumentu (${source.extractionMethod})`
                                  : `document extraction (${source.extractionMethod})`}
                              {source.adaptation === "document-extraction" && (
                                <>
                                  {source.status === "archived" && (
                                    <strong className="crazy-archive-label">
                                      {" "}
                                      · {cs ? "Archiv" : "Archive"}
                                    </strong>
                                  )}
                                  {source.locators.map((locator, index) => (
                                    <span
                                      key={`${locator.text}:${locator.page ?? index}`}
                                    >
                                      {" "}
                                      · {locator.text}
                                    </span>
                                  ))}
                                  {(source.effectiveFrom ||
                                    source.effectiveUntil) && (
                                    <span>
                                      {" "}
                                      · {cs ? "Účinnost" : "Effective"}:{" "}
                                      {source.effectiveFrom ?? "?"} –{" "}
                                      {source.effectiveUntil ??
                                        (cs ? "neuvedeno" : "unspecified")}
                                    </span>
                                  )}
                                </>
                              )}
                              {source.author ? ` · ${source.author}` : ""}
                              {source.license && (
                                <>
                                  {" "}
                                  ·{" "}
                                  {source.licenseUrl &&
                                  safeCitationHref(source.licenseUrl) ? (
                                    <a
                                      href={safeCitationHref(source.licenseUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {source.license}
                                    </a>
                                  ) : (
                                    source.license
                                  )}
                                </>
                              )}
                            </small>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="crazy-starters">
          <p>{cs ? "S čím ti pomůžu?" : "What can I help with?"}</p>
          <div>
            {CRAZY_TYPKA_STARTERS[locale].map((prompt) => (
              <button
                type="button"
                key={prompt}
                disabled={!enabled}
                onClick={() => {
                  state.setDraft(prompt);
                  composer.current?.focus();
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
      {state.busy && (
        <div
          className="crazy-working"
          role="status"
          aria-label={cs ? "Crazy Typka píše…" : "Crazy Typka is typing…"}
        >
          <span aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {state.error && (
        <p className="error" role="alert">
          {crazyTypkaErrorLabel(state.error, locale)}
        </p>
      )}
      {state.recovery === "retry" && (
        <div className="crazy-recovery" role="status">
          <p>
            {cs
              ? "Výsledek poslední zprávy není potvrzený. Než odešleš další, můžeš obnovit odpověď na stejnou zprávu. Rozepsaný text zůstane zachovaný."
              : "The last message’s result is not confirmed. Recover its answer before sending another message. Your draft will be kept."}
          </p>
          <button
            type="button"
            className="secondary"
            disabled={!enabled || state.busy}
            onClick={() => {
              void state.retry();
              composer.current?.focus();
            }}
          >
            {cs ? "Obnovit odpověď" : "Recover answer"}
          </button>
        </div>
      )}
      <form
        className="crazy-form"
        onSubmit={(event) => {
          event.preventDefault();
          void state.send(locale);
          composer.current?.focus();
        }}
      >
        <label htmlFor={`${id}-message`}>
          {compact
            ? cs
              ? "Zpráva"
              : "Message"
            : cs
              ? "Napiš Crazy Typce"
              : "Message Crazy Typka"}
        </label>
        {state.draftReply && (
          <div className="crazy-draft-reply">
            <blockquote>{state.draftReply.text}</blockquote>
            <button
              type="button"
              aria-label={cs ? "Zrušit citaci" : "Remove quote"}
              onClick={() => {
                state.clearReply();
                composer.current?.focus();
              }}
            >
              ×
            </button>
          </div>
        )}
        <textarea
          ref={composer}
          id={`${id}-message`}
          rows={compact ? 1 : 2}
          maxLength={CRAZY_TYPKA_LIMITS.messageChars}
          value={state.draft}
          disabled={!enabled}
          onChange={(event) => state.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && state.draftReply) {
              event.preventDefault();
              event.stopPropagation();
              state.clearReply();
            }
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            if (canSend && !event.repeat)
              event.currentTarget.form?.requestSubmit();
          }}
          placeholder={
            compact
              ? cs
                ? "Napiš zprávu…"
                : "Write a message…"
              : cs
                ? "Třeba jak začít na Strahově…"
                : "For example, how to get started at Strahov…"
          }
          aria-describedby={`${id}-composer-help`}
        />
        <span id={`${id}-composer-help`} className="crazy-sr-only">
          {cs
            ? "Enter odešle zprávu, Shift+Enter vloží nový řádek."
            : "Enter sends the message; Shift+Enter adds a new line."}
        </span>
        <div className="crazy-form-actions">
          <button
            type="submit"
            className="primary"
            aria-label={
              compact ? (cs ? "Odeslat zprávu" : "Send message") : undefined
            }
            disabled={!canSend}
          >
            {compact ? (
              <span aria-hidden="true">↑</span>
            ) : (
              <>
                {cs ? "Odeslat" : "Send"} <span aria-hidden="true">↗</span>
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
