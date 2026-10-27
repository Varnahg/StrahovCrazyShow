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
  isCrazyTypkaResponse,
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
  };
  let session: { token: string; expiresAt: number } | undefined;
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
      const code =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
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
  const reset = async () => {
    const ownGeneration = ++generation;
    inflight?.abort();
    inflight = undefined;
    const previous = session;
    session = undefined;
    update({ messages: [], draft: "", busy: false, error: null, notice: null });
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
      const ownGeneration = ++generation;
      const controller = new AbortController();
      inflight = controller;
      const timer = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? 60000,
      );
      const isCurrent = () =>
        generation === ownGeneration && inflight === controller;
      const userMessage: CrazyTypkaMessage = {
        id: ++nextMessage,
        role: "user",
        text: message,
        sources: [],
      };
      const restarting =
        (!!session && session.expiresAt <= now()) ||
        snapshot.error === "session-expired";
      update({
        busy: true,
        draft: "",
        error: null,
        notice: restarting ? "session-restarted" : snapshot.notice,
        messages: [...(restarting ? [] : snapshot.messages), userMessage].slice(
          -40,
        ),
      });
      try {
        if (!session || session.expiresAt <= now()) {
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
        }
        const body = await decode(
          await request("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: session.token, message, locale }),
            signal: controller.signal,
          }),
        );
        if (!isCurrent()) return;
        if (controller.signal.aborted)
          throw new ChatRequestError("request-timeout");
        if (!isCrazyTypkaResponse(body))
          throw new ChatRequestError("invalid-response");
        const reply: CrazyTypkaMessage = {
          id: ++nextMessage,
          role: "ai",
          text: body.text,
          sources: body.sources,
        };
        update({ messages: [...snapshot.messages, reply].slice(-40) });
      } catch (error) {
        if (!isCurrent()) return;
        const code = controller.signal.aborted
          ? "request-timeout"
          : error instanceof ChatRequestError
            ? error.message
            : "provider-unavailable";
        if (code === "session-expired") session = undefined;
        if (code === "unavailable") update({ availability: "disabled" });
        update({ error: code });
      } finally {
        clearTimeout(timer);
        if (isCurrent()) {
          inflight = undefined;
          update({ busy: false });
        }
      }
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
      session = undefined;
      update({
        busy: false,
        messages: [],
        draft: "",
        error: null,
        notice: null,
      });
    },
  };
}

export type CrazyTypkaClient = ReturnType<typeof createCrazyTypkaClient>;
export type CrazyTypkaState = CrazyTypkaSnapshot &
  Pick<
    CrazyTypkaClient,
    "setDraft" | "send" | "reset" | "cancel" | "refreshStatus"
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
      "Odpověď trvala příliš dlouho. Zkus to později.",
      "The answer took too long. Please try again later.",
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
}: {
  state: CrazyTypkaState;
  locale: Locale;
}) {
  const id = useId();
  const log = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  useEffect(() => {
    if (log.current && followLatest.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [state.messages]);
  const cs = locale === "cs";
  const enabled = state.availability === "enabled";
  return (
    <section className="crazy-chat" aria-labelledby={`${id}-title`}>
      <header className="crazy-heading">
        <div className="crazy-avatar" aria-hidden="true">
          ✦
        </div>
        <div>
          <h2 id={`${id}-title`}>
            {CRAZY_TYPKA_SPEAKER.name}{" "}
            <span className="crazy-ai-badge">AI</span>
          </h2>
          <p>{cs ? "Tvoje průvodkyně po kopci" : "Your guide to the hill"}</p>
        </div>
      </header>
      <p className="crazy-definition">
        {cs
          ? "Fiktivní AI spolužačka, žádná skutečná studentka ani oficiální podpora Silicon Hill."
          : "A fictional AI classmate, not a real student or official Silicon Hill support."}
      </p>
      <p className="crazy-disclosure">
        {cs
          ? "Odesláním předáš tuto zprávu a kontext této AI konverzace OpenAI. Ostatní hráči ji nevidí. Neposílej hesla ani osobní údaje. AI si pamatuje jen několik posledních výměn v krátké relaci."
          : "Sending shares your message and this AI conversation’s context with OpenAI. Other players cannot see it. Do not send passwords or personal data. AI remembers only a few recent exchanges in a short session."}
      </p>
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
                onClick={() => state.setDraft(prompt)}
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
      <form
        className="crazy-form"
        onSubmit={(event) => {
          event.preventDefault();
          void state.send(locale);
        }}
      >
        <label htmlFor={`${id}-message`}>
          {cs ? "Napiš Crazy Typce" : "Message Crazy Typka"}
        </label>
        <textarea
          id={`${id}-message`}
          rows={2}
          maxLength={CRAZY_TYPKA_LIMITS.messageChars}
          value={state.draft}
          disabled={!enabled || state.busy}
          onChange={(event) => state.setDraft(event.target.value)}
          placeholder={
            cs
              ? "Třeba jak začít na Strahově…"
              : "For example, how to get started at Strahov…"
          }
          aria-describedby={`${id}-privacy`}
        />
        <div className="crazy-form-actions">
          <small id={`${id}-privacy`}>
            {cs
              ? "Odpověď může chybovat. Ověř si citované podklady."
              : "Answers can be wrong. Check the cited sources."}
          </small>
          <button
            type="submit"
            className="primary"
            disabled={!enabled || state.busy || !state.draft.trim()}
          >
            {cs ? "Odeslat" : "Send"} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </form>
      {(state.messages.length > 0 || state.busy) && (
        <button
          type="button"
          className="crazy-reset"
          onClick={() => void (state.busy ? state.cancel() : state.reset())}
        >
          {state.busy
            ? cs
              ? "Zastavit a smazat konverzaci"
              : "Stop and clear conversation"
            : cs
              ? "Smazat konverzaci"
              : "Clear conversation"}
        </button>
      )}
    </section>
  );
}
