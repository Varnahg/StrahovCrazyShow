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
  isCrazyTypkaChatResponse,
  isCrazyTypkaErrorResponse,
  isCrazyTypkaSession,
  isCrazyTypkaStatus,
  type CrazyTypkaSource,
} from "../shared/crazy-typka";

type Locale = "cs" | "en";
export type CrazyTypkaMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
  sources: CrazyTypkaSource[];
};
export type CrazyTypkaSnapshot = {
  availability: "checking" | "enabled" | "disabled" | "error";
  busy: boolean;
  draft: string;
  messages: readonly CrazyTypkaMessage[];
  error: string | null;
  notice: "session-restarted" | null;
  recovery: "none" | "retry" | "reset";
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
  };
  let session: { token: string; expiresAt: number } | undefined;
  type PendingChat = {
    requestSeq: number;
    message: string;
    locale: Locale;
    token?: string;
  };
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
        };
        confirm(operation);
        update({ messages: [...snapshot.messages, reply].slice(-40) });
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
      if (restarting) forgetSession();
      if (pending || (!restarting && snapshot.recovery === "reset")) return;
      const userMessage: CrazyTypkaMessage = {
        id: ++nextMessage,
        role: "user",
        text: message,
        sources: [],
      };
      const operation: PendingChat = {
        requestSeq: nextRequestSeq,
        message,
        locale,
      };
      if (session) operation.token = session.token;
      pending = operation;
      update({
        busy: true,
        draft: "",
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
      });
    },
  };
}

export type CrazyTypkaClient = ReturnType<typeof createCrazyTypkaClient>;
export type CrazyTypkaState = CrazyTypkaSnapshot &
  Pick<
    CrazyTypkaClient,
    "setDraft" | "send" | "retry" | "reset" | "cancel" | "refreshStatus"
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
      "Na tuhle zprávu nemůžu odpovědět. Zkus dotaz na hru nebo Silicon Hill.",
      "I cannot answer that message. Try a question about the game or Silicon Hill.",
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
  const cs = locale === "cs";
  const enabled = state.availability === "enabled";
  const compact = variant === "compact";
  const privacy = (
    <>
      <p className="crazy-definition">
        {cs
          ? "Fiktivní AI spolužačka, žádná skutečná studentka ani oficiální podpora Silicon Hill."
          : "A fictional AI classmate, not a real student or official Silicon Hill support."}
      </p>
      <p className="crazy-disclosure">
        {cs
          ? "Zprávy a kontext této konverzace může zpracovat OpenAI. Ostatní hráči ji nevidí. Neposílej hesla ani osobní údaje. AI si pamatuje jen několik posledních výměn v krátké relaci."
          : "OpenAI may process messages and the context of this conversation. Other players cannot see it. Do not send passwords or personal data. AI remembers only a few recent exchanges in a short session."}
      </p>
    </>
  );
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
      {!compact && privacy}
      <div className={`crazy-availability ${state.availability}`} role="status">
        {state.availability === "checking"
          ? cs
            ? "Ověřuji připojení AI…"
            : "Checking AI availability…"
          : enabled
            ? cs
              ? "Soukromá AI konverzace"
              : "Private AI conversation"
            : state.availability === "disabled"
              ? cs
                ? "AI zatím není připojená. Provozovatel ji musí zapnout."
                : "AI is not connected yet. The operator needs to enable it."
              : cs
                ? "Připojení AI se nepodařilo ověřit."
                : "Could not check AI availability."}
        {!enabled && state.availability !== "checking" && (
          <button type="button" onClick={() => void state.refreshStatus()}>
            {cs ? "Ověřit znovu" : "Check again"}
          </button>
        )}
      </div>
      {compact && (
        <details className="crazy-privacy">
          <summary>{cs ? "O AI a soukromí" : "AI and privacy"}</summary>
          {privacy}
        </details>
      )}
      {state.notice === "session-restarted" && (
        <p className="crazy-disclosure" role="status">
          {cs
            ? "Předchozí relace vypršela. Tohle je nová konverzace bez jejího kontextu."
            : "The previous session expired. This is a new conversation without its earlier context."}
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
              <p>{message.text}</p>
              {message.sources.length > 0 && (
                <details className="crazy-sources">
                  <summary>
                    {cs ? "Použité podklady" : "Sources used"} (
                    {message.sources.length})
                  </summary>
                  <ul>
                    {message.sources.map((source) => (
                      <li key={source.id}>
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
                          · {cs ? "stručná parafráze" : "short paraphrase"}
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
        <p className="crazy-working" role="status">
          {cs
            ? "Hledám v podkladech a připravuji odpověď…"
            : "Looking through the sources and preparing an answer…"}
        </p>
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
        <textarea
          ref={composer}
          id={`${id}-message`}
          rows={compact ? 1 : 2}
          maxLength={CRAZY_TYPKA_LIMITS.messageChars}
          value={state.draft}
          disabled={!enabled}
          onChange={(event) => state.setDraft(event.target.value)}
          placeholder={
            compact
              ? cs
                ? "Napiš zprávu…"
                : "Write a message…"
              : cs
                ? "Třeba jak začít na Strahově…"
                : "For example, how to get started at Strahov…"
          }
          aria-describedby={`${id}-privacy`}
        />
        <div className="crazy-form-actions">
          <small id={`${id}-privacy`}>
            {compact &&
              (cs
                ? "Zprávy může zpracovat OpenAI. "
                : "OpenAI may process messages. ")}
            {cs
              ? "Odpověď může chybovat. Ověř si citované podklady."
              : "Answers can be wrong. Check the cited sources."}
          </small>
          <button
            type="submit"
            className="primary"
            aria-label={
              compact ? (cs ? "Odeslat zprávu" : "Send message") : undefined
            }
            disabled={
              !enabled ||
              state.busy ||
              state.recovery !== "none" ||
              !state.draft.trim()
            }
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
      {(state.messages.length > 0 || state.busy) && (
        <button
          type="button"
          className="crazy-reset"
          onClick={() => {
            void (state.busy ? state.cancel() : state.reset());
            composer.current?.focus();
          }}
        >
          {state.busy
            ? cs
              ? "Zastavit a smazat konverzaci"
              : "Stop and clear conversation"
            : state.recovery === "reset"
              ? cs
                ? "Začít novou konverzaci"
                : "Start a new conversation"
              : cs
                ? "Smazat konverzaci"
                : "Clear conversation"}
        </button>
      )}
    </section>
  );
}
