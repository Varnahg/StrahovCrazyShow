import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ChatMessage, ChatSendResult } from "../shared/types";
import { formatDate, localizeNotice, t, useLocale } from "./i18n";
import {
  chatConversation,
  chatEntries,
  parseChatPreferences,
  revealChatText,
  type ChatEntry,
  type ChatMode,
  type ChatPreferences,
} from "./player-chat-model";
export type { ChatMode, ChatPreviewMode } from "./player-chat-model";

const sendTimeoutMs = 10_000;
const emptyDraft: Draft = { text: "" };
type Draft = { text: string; reply?: ChatMessage };
type Entry = ChatEntry;
type Pending = {
  id: string;
  channel: string;
  draft: Draft;
  timer: ReturnType<typeof setTimeout>;
};
export type ChatDestination = {
  key: string;
  label: string;
  available?: boolean;
};
type ChatPayload = {
  channel: string;
  text: string;
  requestId: string;
  replyTo?: string;
};

export function readChatPreferences(): ChatPreferences {
  try {
    return parseChatPreferences(
      JSON.parse(localStorage.getItem("strahov.chat") ?? "{}"),
    );
  } catch {
    return parseChatPreferences(undefined);
  }
}

export function usePlayerChat(
  self: string,
  muted: readonly string[],
  blocked: readonly string[],
) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [failure, setFailure] = useState<{
    channel: string;
    reason: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const pending = useRef<Pending | null>(null);
  const hidden = useMemo(
    () => new Set([...muted, ...blocked]),
    [muted, blocked],
  );
  const visible = useMemo(
    () => entries.filter(({ message }) => !hidden.has(message.sender)),
    [entries, hidden],
  );
  const unread = useMemo(
    () =>
      visible.filter(
        ({ message }) => message.sender !== self && !read.has(message.id),
      ),
    [visible, read, self],
  );
  const privateCount = useMemo(
    () =>
      unread.filter(
        ({ message }) =>
          message.channel.startsWith("dm:") ||
          message.channel.startsWith("event:"),
      ).length,
    [unread],
  );

  const markRead = useCallback((seen: readonly Entry[]) => {
    if (!seen.length) return;
    setRead((previous) => {
      if (seen.every(({ message }) => previous.has(message.id)))
        return previous;
      return new Set(
        [...previous, ...seen.map(({ message }) => message.id)].slice(-400),
      );
    });
  }, []);
  const receive = useCallback((message: ChatMessage) => {
    const receivedAt = performance.now();
    setEntries((previous) =>
      [...previous, { message, receivedAt }].slice(-200),
    );
  }, []);
  const forget = useCallback((channels: ReadonlySet<string>) => {
    setEntries((previous) =>
      previous.filter(({ message }) => !channels.has(message.channel)),
    );
    setDrafts((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => !channels.has(key)),
      ),
    );
    setFailure((previous) =>
      previous && channels.has(previous.channel) ? null : previous,
    );
  }, []);
  const takePending = useCallback(() => {
    const job = pending.current;
    if (!job) return null;
    clearTimeout(job.timer);
    pending.current = null;
    return job;
  }, []);
  const fail = useCallback(
    (reason: string) => {
      const job = takePending();
      if (!job) return;
      setSending(false);
      setFailure({ channel: job.channel, reason });
    },
    [takePending],
  );
  const reset = useCallback(() => {
    takePending();
    setEntries([]);
    setRead(new Set());
    setDrafts({});
    setFailure(null);
    setSending(false);
  }, [takePending]);
  useEffect(
    () => () => {
      takePending();
    },
    [takePending],
  );

  const result = useCallback(
    (response: ChatSendResult) => {
      if (pending.current?.id !== response.requestId) return;
      if (!response.ok) {
        fail(response.reason);
        return;
      }
      const job = takePending()!;
      setSending(false);
      setDrafts((previous) => {
        if (previous[job.channel] !== job.draft) return previous;
        const next = { ...previous };
        delete next[job.channel];
        return next;
      });
    },
    [fail, takePending],
  );

  const edit = useCallback((channel: string, draft: Draft) => {
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[channel];
      if (draft.text || draft.reply) next[channel] = draft;
      return Object.fromEntries(Object.entries(next).slice(-32));
    });
    setFailure((previous) => (previous?.channel === channel ? null : previous));
  }, []);

  const submit = (channel: string, send: (payload: ChatPayload) => boolean) => {
    const draft = drafts[channel] ?? emptyDraft;
    if (
      !draft.text.trim() ||
      pending.current ||
      (draft.reply && hidden.has(draft.reply.sender))
    )
      return;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    pending.current = {
      id,
      channel,
      draft,
      timer: setTimeout(
        () => fail("Potvrzení nepřišlo. Text zůstal v poli."),
        sendTimeoutMs,
      ),
    };
    setFailure(null);
    setSending(true);
    try {
      if (
        send({
          channel,
          text: draft.text,
          requestId: id,
          ...(draft.reply && { replyTo: draft.reply.id }),
        })
      )
        return;
    } catch {
      /* The draft is retained if the socket closes during send. */
    }
    fail("Zprávu se nepodařilo odeslat.");
  };

  return {
    visible,
    unread,
    privateCount,
    hidden,
    drafts,
    failure,
    sending,
    markRead,
    receive,
    forget,
    reset,
    fail,
    result,
    edit,
    submit,
  };
}

type ChatState = ReturnType<typeof usePlayerChat>;
type ScrollPosition = { top: number; atEnd: boolean; anchor?: string; offset?: number };

export function PlayerChat({
  chat,
  self,
  channel,
  changeChannel,
  destinations,
  connected,
  supported,
  guest,
  aiActive,
  showAi,
  aiActions,
  aiContent,
  send,
  mode,
  onModeChange,
  focusRequest,
  showPrivateText,
  shortcut,
  visible,
}: {
  chat: ChatState;
  self: string;
  channel: string;
  changeChannel: (value: string) => void;
  destinations: readonly ChatDestination[];
  connected: boolean;
  supported: boolean;
  guest: boolean;
  aiActive: boolean;
  showAi: (value: boolean) => void;
  aiActions: ReactNode;
  aiContent: ReactNode;
  send: (payload: ChatPayload) => boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  focusRequest: number;
  showPrivateText: boolean;
  shortcut: boolean;
  visible: boolean;
}) {
  useLocale();
  const name = useId();
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const expandedFrom = useRef<ChatMode>("idle");
  const positions = useRef(new Map<string, ScrollPosition>());
  const currentView = useRef("");
  const focusSeen = useRef(-1);
  const [showBottom, setShowBottom] = useState(false);
  const destination = destinations.find(({ key }) => key === channel);
  const canCompose =
    !guest && (channel === "global" || channel === "local" || !!destination);
  const canSend =
    canCompose && connected && supported && destination?.available !== false;
  const draft = chat.drafts[channel] ?? emptyDraft;
  const entries = useMemo(
    () =>
      guest || aiActive ? [] : chatEntries(chat.visible, mode),
    [guest, aiActive, chat.visible, mode],
  );
  const viewKey = aiActive
    ? "ai"
    : mode === "idle"
        ? "idle"
        : "feed";
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const markRead = chat.markRead;
  const interacting = useRef(mode !== "idle");
  interacting.current = mode !== "idle" && visible;
  const revealedIds = useMemo(
    () =>
      new Set(
        entries
          .filter(({ message }) =>
            revealChatText(message, self, channel, mode, showPrivateText),
          )
          .map(({ message }) => message.id),
      ),
    [entries, self, channel, mode, showPrivateText],
  );

  const activate = () => {
    if (mode === "idle") onModeChange("composing");
  };
  const focusEditor = () => {
    const editor = aiActive
      ? root.current?.querySelector<HTMLTextAreaElement>(
          ".player-chat-ai textarea:not(:disabled)",
        )
      : input.current;
    if (editor && !editor.disabled) editor.focus({ preventScroll: true });
    else
      root.current
        ?.querySelector<HTMLSelectElement>(".player-chat-destination")
        ?.focus();
  };
  const labelFor = (message: ChatMessage) => {
    const target = chatConversation(message, self);
    if (target === "global") return t("Celý Strahov");
    if (target === "local") return t("V okolí");
    const dest = destinations.find(({ key }) => key === target);
    if (target.startsWith("dm:")) {
      const person =
        message.sender === self
          ? (dest?.label ?? t("Odpojený kontakt"))
          : message.nickname;
      return message.sender === self
        ? t("Ty → {name}", { name: person })
        : t("{name} → ty", { name: person });
    }
    return t("Akce:") + " " + (dest?.label ?? t("Akce"));
  };
  const isAllowedTarget = (target: string) =>
    target === "global" ||
    target === "local" ||
    destinations.some(
      (item) => item.key === target && item.available !== false,
    );

  const markVisible = useCallback(() => {
    if (!interacting.current || !log.current) return;
    const bounds = log.current.getBoundingClientRect();
    const shown = new Set(
      [
        ...log.current.querySelectorAll<HTMLElement>(
          "[data-message-id][data-revealed]",
        ),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.height > 0 &&
            rect.bottom > bounds.top &&
            rect.top < bounds.bottom
          );
        })
        .map((element) => element.dataset.messageId),
    );
    markRead(entriesRef.current.filter(({ message }) => shown.has(message.id)));
  }, [markRead]);

  const rememberScroll = () => {
    if (!log.current || !currentView.current) return;
    const bounds = log.current.getBoundingClientRect();
    const anchor = [...log.current.querySelectorAll<HTMLElement>("[data-message-id]")]
      .find(element => element.getBoundingClientRect().bottom > bounds.top);
    positions.current.set(currentView.current, {
      top: log.current.scrollTop,
      atEnd:
        log.current.scrollHeight -
          log.current.scrollTop -
          log.current.clientHeight <
        12,
      anchor: anchor?.dataset.messageId,
      offset: anchor ? anchor.getBoundingClientRect().top - bounds.top : undefined,
    });
  };
  const onScroll = () => {
    rememberScroll();
    const atEnd = positions.current.get(currentView.current)?.atEnd ?? true;
    setShowBottom(!atEnd);
    markVisible();
  };
  const goToEnd = () => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    positions.current.set(viewKey, {
      top: log.current?.scrollTop ?? 0,
      atEnd: true,
    });
    setShowBottom(false);
    markVisible();
  };

  useLayoutEffect(() => {
    if (!visible || aiActive || !log.current) return;
    const element = log.current;
    const saved = positions.current.get(viewKey);
    if (saved?.atEnd === false) {
      const anchor = [...element.querySelectorAll<HTMLElement>("[data-message-id]")]
        .find(row => row.dataset.messageId === saved.anchor);
      element.scrollTop = anchor
        ? element.scrollTop + anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - (saved.offset ?? 0)
        : saved.top;
    } else element.scrollTop = element.scrollHeight;
    currentView.current = viewKey;
    const atEnd =
      element.scrollHeight - element.scrollTop - element.clientHeight < 12;
    rememberScroll();
    setShowBottom(!atEnd);
    markVisible();
  }, [entries, viewKey, mode, aiActive, visible, markVisible]);
  useLayoutEffect(() => {
    markVisible();
  }, [channel, showPrivateText, markVisible]);

  useLayoutEffect(() => {
    if (!visible || mode === "idle" || focusSeen.current === focusRequest)
      return;
    focusSeen.current = focusRequest;
    focusEditor();
  }, [focusRequest, visible, mode, aiActive, channel]);

  useEffect(() => {
    if (!visible) return;
    const viewport = window.visualViewport;
    const fit = () => {
      const element = root.current;
      if (!element || !viewport) return;
      element.style.setProperty("--player-chat-height", viewport.height + "px");
      element.style.setProperty("--player-chat-y", viewport.offsetTop + "px");
      element.style.setProperty(
        "--player-chat-bottom",
        Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) +
          "px",
      );
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
    };
  }, [visible]);

  const toggleExpanded = () => {
    rememberScroll();
    focusSeen.current = -1;
    if (mode === "expanded")
      onModeChange(
        expandedFrom.current === "expanded"
          ? "composing"
          : expandedFrom.current,
      );
    else {
      expandedFrom.current = mode;
      onModeChange("expanded");
    }
  };
  const wrapTab = (event: KeyboardEvent<HTMLElement>) => {
    if (mode !== "expanded" || event.key !== "Tab") return;
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
      ),
    ].filter((element) => element.getClientRects().length > 0);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at === -1 || (event.shiftKey ? at === 0 : at === items.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? items.at(-1) : items[0])?.focus();
    }
  };
  const choose = (value: string) => {
    rememberScroll();
    composing.current = false;
    if (value === "ai") showAi(true);
    else {
      showAi(false);
      changeChannel(value);
    }
    activate();
    focusSeen.current = -1;
  };
  const replyTo = (message: ChatMessage) => {
    const target = chatConversation(message, self);
    if (!isAllowedTarget(target)) return;
    const targetDraft = chat.drafts[target] ?? emptyDraft;
    focusSeen.current = -1;
    showAi(false);
    changeChannel(target);
    chat.edit(target, { ...targetDraft, reply: message });
    activate();
    input.current?.focus({ preventScroll: true });
  };
  const jump = (id: string) => {
    const target = [
      ...root.current!.querySelectorAll<HTMLElement>("[data-message-id]"),
    ].find((element) => element.dataset.messageId === id);
    if (!target) return;
    activate();
    target.scrollIntoView({ block: "nearest" });
    target.focus({ preventScroll: true });
    onScroll();
  };
  const availableReply = draft.reply && !chat.hidden.has(draft.reply.sender);
  const maskDraft = !showPrivateText && mode === "idle" && channel.startsWith("dm:");
  const selectedValue = aiActive ? "ai" : channel;
  const missingTarget =
    !aiActive && !["global", "local"].includes(channel) && !destination;
  const collapsed = mode === "idle";

  return (
    <>
      {visible && mode === "expanded" && (
        <div
          className="player-chat-backdrop"
          aria-hidden="true"
          onPointerDown={toggleExpanded}
        />
      )}
      <section
        ref={root}
        className={"player-chat player-chat-" + mode}
        data-player-chat=""
        data-chat-mode={mode}
        hidden={!visible}
        role={mode === "expanded" ? "dialog" : "region"}
        aria-modal={mode === "expanded" ? true : undefined}
        aria-label={t("Chat")}
        onKeyDown={wrapTab}
        onFocusCapture={(event) => {
          if (event.target !== root.current) activate();
        }}
      >
        <header className="player-chat-header">
          <label className="player-chat-recipient">
            <span>{t("Píšeš do:")}</span>
            <select
              className="player-chat-destination"
              value={selectedValue}
              aria-label={t("Vybrat příjemce")}
              onChange={(event) => choose(event.target.value)}
            >
              {!guest && (
                <>
                  <option value="global">{t("Celý Strahov")}</option>
                  <option value="local">{t("V okolí")}</option>
                  {destinations.map(({ key, label: text, available }) => (
                    <option
                      key={key}
                      value={key}
                      disabled={available === false}
                    >
                      {key.startsWith("dm:") ? t("Soukromě:") : t("Akce:")}{" "}
                      {text}
                    </option>
                  ))}
                  {missingTarget && (
                    <option value={channel} disabled>
                      {t("Vyber dostupnou konverzaci.")}
                    </option>
                  )}
                </>
              )}
              <option value="ai">Crazy Typka · AI</option>
            </select>
          </label>
          {aiActive && visible && (
            <div className="crazy-panel-actions">{aiActions}</div>
          )}
          <button
            type="button"
            className="player-chat-expand"
            onClick={toggleExpanded}
            onPointerDown={(event) => event.preventDefault()}
            aria-label={
              mode === "expanded" ? t("Zmenšit chat") : t("Zvětšit chat")
            }
            title={mode === "expanded" ? t("Zmenšit chat") : t("Zvětšit chat")}
            aria-expanded={mode === "expanded"}
          >
            <span aria-hidden="true">{mode === "expanded" ? "↙" : "↗"}</span>
          </button>
        </header>
        <div className="player-chat-ai" hidden={!aiActive}>
          {aiContent}
        </div>
        <div className="player-chat-human" hidden={aiActive}>
          {guest ? (
            <p className="player-chat-empty">
              {t(
                "Samostatná prohlídka není připojená k žádnému multiplayerovému chatu.",
              )}
            </p>
          ) : (
            <>
              <div className="player-chat-history">
                <div
                  ref={log}
                  className="player-chat-log"
                  role="log"
                  aria-label={t("Zprávy")}
                  aria-live={collapsed ? "off" : "polite"}
                  tabIndex={collapsed ? -1 : 0}
                  onScroll={onScroll}
                >
                  {!entries.length && (
                    <p className="player-chat-empty">
                      {t("V této konverzaci zatím nejsou žádné zprávy.")}
                    </p>
                  )}
                  {entries.map(({ message }) => {
                    const target = chatConversation(message, self);
                    const revealed = revealChatText(
                      message,
                      self,
                      channel,
                      mode,
                      showPrivateText,
                    );
                    const reference =
                      message.reply &&
                      "id" in message.reply &&
                      !chat.hidden.has(message.reply.sender)
                        ? message.reply
                        : undefined;
                    const referencedHere =
                      reference && revealedIds.has(reference.id);
                    const textId = name + "-text-" + message.id;
                    return (
                      <article
                        key={message.id}
                        id={name + "-" + message.id}
                        data-message-id={message.id}
                        data-revealed={revealed ? "" : undefined}
                        tabIndex={-1}
                      >
                        <div className="player-chat-byline">
                          <strong>{message.nickname}</strong>
                          <span
                            className="player-chat-channel"
                            title={labelFor(message)}
                          >
                            {labelFor(message)}
                          </span>
                          <time>
                            {formatDate(message.at, {
                              timeZone: "Europe/Prague",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                          {revealed &&
                            connected &&
                            supported &&
                            isAllowedTarget(target) && (
                              <button
                                type="button"
                                className="player-chat-reply"
                                aria-label={t("Odpovědět")}
                                aria-describedby={textId}
                                title={t("Odpovědět")}
                                onPointerDown={(event) =>
                                  event.preventDefault()
                                }
                                onClick={() => replyTo(message)}
                              >
                                <span aria-hidden="true">↪</span>
                              </button>
                            )}
                        </div>
                        {!revealed ? (
                          <p>{t("Soukromá zpráva")}</p>
                        ) : (
                          <>
                            {message.reply &&
                              (referencedHere ? (
                                <button
                                  type="button"
                                  className="player-chat-quote"
                                  onClick={() => jump(reference.id)}
                                >
                                  ↪ {reference.nickname}: {reference.text}
                                </button>
                              ) : (
                                <div className="player-chat-quote">
                                  {reference
                                    ? "↪ " +
                                      reference.nickname +
                                      ": " +
                                      reference.text
                                    : t("Původní zpráva není dostupná.")}
                                </div>
                              ))}
                            <p id={textId}>{message.text}</p>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
                {showBottom && (
                  <button
                    className="player-chat-bottom"
                    type="button"
                    onClick={goToEnd}
                  >
                    {t("Nové zprávy")} ↓
                  </button>
                )}
              </div>
              <form
                className="player-chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canSend && !maskDraft && !composing.current) chat.submit(channel, send);
                }}
              >
                {draft.reply && !maskDraft && (
                  <div className="player-chat-reference">
                    <span>
                      {availableReply
                        ? t("Odpovídáš: {name} · {text}", {
                            name: draft.reply.nickname,
                            text: draft.reply.text,
                          })
                        : t("Původní zpráva není dostupná.")}
                    </span>
                    <button
                      type="button"
                      aria-label={t("Zrušit odpověď")}
                      onClick={() => {
                        chat.edit(channel, { text: draft.text });
                        input.current?.focus();
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                {chat.failure?.channel === channel && (
                  <div role="alert">{localizeNotice(chat.failure.reason)}</div>
                )}
                {!connected && (
                  <div role="status">
                    {t("Chat je odpojený. Rozepsaný text zůstává v poli.")}
                  </div>
                )}
                {connected && !supported && (
                  <div role="status">
                    {t("Tato verze serveru zatím nepodporuje nový chat.")}
                  </div>
                )}
                {canCompose && destination?.available === false && (
                  <div role="status">{t("Odpojený kontakt")}</div>
                )}
                <div className="player-chat-send">
                  <input
                    ref={input}
                    aria-label={t("Zpráva")}
                    aria-keyshortcuts={shortcut ? "T" : undefined}
                    title={shortcut ? t("Chat (T)") : t("Chat")}
                    placeholder={t("Napsat zprávu…")}
                    maxLength={500}
                    disabled={!canCompose}
                    value={maskDraft ? "" : draft.text}
                    onChange={(event) =>
                      chat.edit(channel, { ...draft, text: event.target.value })
                    }
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={() => {
                      composing.current = false;
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.nativeEvent.isComposing ||
                          event.nativeEvent.keyCode === 229 ||
                          event.repeat)
                      )
                        event.preventDefault();
                    }}
                  />
                  <button
                    type="submit"
                    aria-label={t("Odeslat")}
                    title={t("Odeslat")}
                    disabled={maskDraft ||
                      !canSend ||
                      chat.sending ||
                      !draft.text.trim() ||
                      (!!draft.reply && !availableReply)
                    }
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );
}
