import {
  memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type ReactNode, type RefObject,
} from "react";
import type { ChatMessage, ChatSendResult } from "../shared/types";
import { HudIcon } from "./hud-icons";
import { formatDate, localizeNotice, t, useLocale } from "./i18n";
import "./player-chat.css";

const previewMs = 8_000;
const sendTimeoutMs = 10_000;
const emptyDraft: Draft = { text: "" };
type Draft = { text: string; reply?: ChatMessage };
type Entry = { message: ChatMessage; receivedAt: number };
type Pending = { id: string; channel: string; draft: Draft; timer: ReturnType<typeof setTimeout> };
export type ChatPreviewMode = "recent" | "badge" | "hidden";
export type ChatDestination = { key: string; label: string; available?: boolean };
type ChatPayload = { channel: string; text: string; requestId: string; replyTo?: string };

export function readChatPreferences(): { preview: ChatPreviewMode; shortcut: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem("strahov.chat") ?? "{}");
    return {
      preview: value?.preview === "badge" || value?.preview === "hidden" ? value.preview : "recent",
      shortcut: value?.shortcut !== false,
    };
  } catch {
    return { preview: "recent", shortcut: true };
  }
}

function conversation(message: ChatMessage, self: string) {
  return message.sender !== self && message.channel === "dm:" + self ? "dm:" + message.sender : message.channel;
}

export function usePlayerChat(self: string, muted: readonly string[], blocked: readonly string[]) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [failure, setFailure] = useState<{ channel: string; reason: string } | null>(null);
  const [sending, setSending] = useState(false);
  const pending = useRef<Pending | null>(null);
  const hidden = useMemo(() => new Set([...muted, ...blocked]), [muted, blocked]);
  const visible = useMemo(() => entries.filter(({ message }) => !hidden.has(message.sender)), [entries, hidden]);
  const unread = useMemo(() => visible.filter(({ message }) => message.sender !== self && !read.has(message.id)),
    [visible, read, self]);
  const privateCount = useMemo(() => unread.filter(({ message }) =>
    message.channel.startsWith("dm:") || message.channel.startsWith("event:")).length, [unread]);

  const markRead = useCallback((seen: readonly Entry[]) => {
    if (!seen.length) return;
    setRead(previous => {
      if (seen.every(({ message }) => previous.has(message.id))) return previous;
      return new Set([...previous, ...seen.map(({ message }) => message.id)].slice(-400));
    });
  }, []);
  const receive = useCallback((message: ChatMessage) => {
    const receivedAt = performance.now();
    setEntries(previous => [...previous, { message, receivedAt }].slice(-200));
  }, []);
  const forget = useCallback((channels: ReadonlySet<string>) => {
    setEntries(previous => previous.filter(({ message }) => !channels.has(message.channel)));
    setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !channels.has(key))));
    setFailure(previous => previous && channels.has(previous.channel) ? null : previous);
  }, []);
  const takePending = useCallback(() => {
    const job = pending.current;
    if (!job) return null;
    clearTimeout(job.timer);
    pending.current = null;
    return job;
  }, []);
  const fail = useCallback((reason: string) => {
    const job = takePending();
    if (!job) return;
    setSending(false);
    setFailure({ channel: job.channel, reason });
  }, [takePending]);
  const reset = useCallback(() => {
    takePending();
    setEntries([]);
    setRead(new Set());
    setDrafts({});
    setFailure(null);
    setSending(false);
  }, [takePending]);
  useEffect(() => () => { takePending(); }, [takePending]);

  const result = useCallback((response: ChatSendResult) => {
    if (pending.current?.id !== response.requestId) return;
    if (!response.ok) {
      fail(response.reason);
      return;
    }
    const job = takePending()!;
    setSending(false);
    setDrafts(previous => {
      if (previous[job.channel] !== job.draft) return previous;
      const next = { ...previous };
      delete next[job.channel];
      return next;
    });
  }, [fail, takePending]);

  const edit = useCallback((channel: string, draft: Draft) => {
    setDrafts(previous => {
      const next = { ...previous };
      delete next[channel];
      if (draft.text || draft.reply) next[channel] = draft;
      return Object.fromEntries(Object.entries(next).slice(-32));
    });
    setFailure(previous => previous?.channel === channel ? null : previous);
  }, []);

  const submit = (channel: string, send: (payload: ChatPayload) => boolean) => {
    const draft = drafts[channel] ?? emptyDraft;
    if (!draft.text.trim() || pending.current || (draft.reply && hidden.has(draft.reply.sender))) return;
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
      byte.toString(16).padStart(2, "0")).join("");
    pending.current = {
      id, channel, draft,
      timer: setTimeout(() => fail("Potvrzení nepřišlo. Text zůstal v poli."), sendTimeoutMs),
    };
    setFailure(null);
    setSending(true);
    try {
      if (send({ channel, text: draft.text, requestId: id, ...(draft.reply && { replyTo: draft.reply.id }) }))
        return;
    } catch { /* The draft is retained if the socket closes during send. */ }
    fail("Zprávu se nepodařilo odeslat.");
  };

  return { visible, unread, privateCount, hidden, drafts, failure, sending, markRead, receive, forget, reset, fail, result, edit, submit };
}

export const ChatPreview = memo(function ChatPreview({
  entries, count, shortcut, open,
}: {
  entries: readonly Entry[];
  count: number;
  shortcut: boolean;
  open: (opener: HTMLButtonElement) => void;
}) {
  useLocale();
  const [cutoffAt, setCutoffAt] = useState(() => performance.now());
  const recent = entries.filter(({ message, receivedAt }) =>
    receivedAt + previewMs > cutoffAt && (message.channel === "global" || message.channel === "local")).slice(-3);
  const expiresAt = recent[0] ? recent[0].receivedAt + previewMs : 0;
  useEffect(() => {
    if (!expiresAt) return;
    const timeout = setTimeout(
      () => setCutoffAt(Math.max(expiresAt, performance.now())),
      Math.max(0, expiresAt - performance.now()),
    );
    return () => clearTimeout(timeout);
  }, [expiresAt]);
  return (
    <section className="player-chat-preview">
      <button type="button" onClick={event => open(event.currentTarget)}
        aria-haspopup="dialog" aria-keyshortcuts={shortcut ? "T" : undefined}
        aria-label={count ? t("Otevřít chat · neveřejné nepřečtené: {count}", { count }) : t("Otevřít chat")}>
        <HudIcon name="chat" />{t("Chat")}{shortcut && <kbd aria-hidden="true">T</kbd>}
        {count > 0 && <span className="player-chat-count" aria-hidden="true">{count}</span>}
      </button>
      {!!recent.length && <ul aria-label={t("Poslední zprávy")}>
        {recent.map(({ message }) => <li key={message.id}>
          <span>{message.channel === "local" ? t("V okolí") : t("Celý Strahov")}</span>
          {" "}<strong>{message.nickname}:</strong> {message.text}
        </li>)}
      </ul>}
    </section>
  );
});

type ChatState = ReturnType<typeof usePlayerChat>;

export function PlayerChatDialog({
  chat, self, channel, changeChannel, destinations, connected, supported, guest, aiActive, showAi,
  aiActions, aiContent, opener, fallback, keyboardOpen, close, send,
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
  opener: HTMLElement | null;
  fallback: RefObject<HTMLCanvasElement | null>;
  keyboardOpen: boolean;
  close: () => void;
  send: (payload: ChatPayload) => boolean;
}) {
  useLocale();
  const name = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showBottom, setShowBottom] = useState(false);
  const composing = useRef(false);
  const group = channel.split(":")[0];
  const options = destinations.filter(({ key }) => key.startsWith(group + ":"));
  const destination = options.find(({ key }) => key === channel);
  const canCompose = channel === "global" || channel === "local" || (!!destination && destination.available !== false);
  const canReply = connected && supported && canCompose;
  const human = !aiActive && !guest;
  const draft = chat.drafts[channel] ?? emptyDraft;
  const visible = useMemo(() => human ? chat.visible.filter(({ message }) => conversation(message, self) === channel) : [],
    [chat.visible, channel, self, human]);
  const visibleIds = useMemo(() => new Set(visible.map(({ message }) => message.id)), [visible]);
  const currentView = useRef("");
  const { markRead } = chat;

  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    (keyboardOpen && input.current && !input.current.disabled ? input.current : title.current)?.focus();
    const viewport = window.visualViewport;
    const fit = () => {
      if (!viewport) return;
      element.style.setProperty("--player-chat-height", `${viewport.height}px`);
      element.style.setProperty("--player-chat-y", `${viewport.offsetTop}px`);
      element.style.setProperty("--player-chat-bottom", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      element.close();
      const dock = opener && fallback.current?.parentElement?.querySelector<HTMLElement>("[data-world-chat]");
      (opener?.isConnected && opener.getClientRects().length ? opener : dock || fallback.current)?.focus({ preventScroll: true });
    };
  }, [fallback, keyboardOpen, opener]);

  function wrapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
    )].filter(element => element.getClientRects().length > 0);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? items.at(-1) : items[0])?.focus();
    }
  }

  function goToEnd() {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    atBottom.current = true;
    setShowBottom(false);
    markRead(visible);
  }

  useLayoutEffect(() => {
    const nextView = human ? channel : "";
    if (nextView !== currentView.current || atBottom.current) goToEnd();
    currentView.current = nextView;
  }, [channel, human, visible, markRead]);

  const onScroll = () => {
    const element = log.current;
    if (!element) return;
    const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 12;
    atBottom.current = bottom;
    setShowBottom(!bottom);
    if (bottom) markRead(visible);
  };
  const jump = (id: string) => {
    const original = document.getElementById(name + "-" + id);
    if (!original || !log.current?.contains(original)) return;
    original.scrollIntoView({ block: "nearest" });
    original.focus({ preventScroll: true });
    onScroll();
  };
  const selectGroup = (kind: string) => {
    composing.current = false;
    showAi(false);
    if (group !== kind || !destination) changeChannel(destinations.find(({ key }) => key.startsWith(kind + ":"))?.key ?? kind);
  };
  const selectChannel = (value: string) => {
    composing.current = false;
    showAi(false);
    changeChannel(value);
  };
  const availableReply = draft.reply && !chat.hidden.has(draft.reply.sender);
  return (
    <dialog ref={dialog} id="world-player-chat" className="player-chat-dialog"
      aria-labelledby={name} onCancel={event => { event.preventDefault(); if (!composing.current) close(); }} onKeyDown={wrapTab}>
      <header className="player-chat-header">
        <h2 ref={title} id={name} tabIndex={-1}>{t("Chat na Strahově")}</h2>
        {aiActive && <div className="crazy-panel-actions">{aiActions}</div>}
        <button className="player-chat-close" type="button" onClick={close} aria-label={t("Zavřít chat")}>×</button>
      </header>
      <div className="player-chat-channels" role="group" aria-label={t("Chatový kanál")}>
        {guest ? <button type="button" aria-pressed={!aiActive} onClick={() => showAi(false)}>{t("Hráči")}</button> : <>
          <button type="button" aria-pressed={human && group === "global"} onClick={() => selectChannel("global")}>{t("Celý Strahov")}</button>
          <button type="button" aria-pressed={human && group === "local"} onClick={() => selectChannel("local")}>{t("V okolí")}</button>
          <button type="button" aria-pressed={human && group === "dm"} onClick={() => selectGroup("dm")}>{t("Soukromé")}</button>
          <button type="button" aria-pressed={human && group === "event"} onClick={() => selectGroup("event")}>{t("Akce")}</button>
        </>}
        <button type="button" className="player-chat-ai-tab" aria-pressed={aiActive}
          onClick={() => { composing.current = false; showAi(true); }}>Crazy Typka · AI</button>
      </div>
      {aiActive ? <div className="player-chat-content game-ai-chat">{aiContent}</div> : guest ? (
        <p className="player-chat-content">{t("Samostatná prohlídka není připojená k žádnému multiplayerovému chatu.")}</p>
      ) : <>
        <div className="player-chat-audience">
          <strong>{t("Píšeš do:")}</strong>{" "}
          {group === "global" ? t("Celý Strahov · všichni připojení hráči")
            : group === "local" ? t("V okolí · stejná zóna, méně než 40 m")
              : group === "dm" ? t("Soukromě · ty a vybraný kontakt") : t("Akce · přihlášení účastníci")}
          {options.length > 0 && <select aria-label={t("Konverzace")} value={destination?.key ?? ""} onChange={event => changeChannel(event.target.value)}>
            {!destination && <option value="" disabled>{t("Vyber konverzaci")}</option>}
            {options.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>}
        </div>
        <div className="player-chat-history">
          <div className="player-chat-log" ref={log} onScroll={onScroll} role="log" aria-label={t("Zprávy")} tabIndex={0}>
            {!visible.length && <p>{canCompose ? t("V této konverzaci zatím nejsou žádné zprávy.") : t("Vyber dostupnou konverzaci.")}</p>}
            {visible.map(({ message }) => {
              const reply = message.reply;
              const revealed = reply && "id" in reply && !chat.hidden.has(reply.sender) ? reply : undefined;
              const originalVisible = revealed && visibleIds.has(revealed.id);
              const textId = name + "-text-" + message.id;
              return (
                <article key={message.id} id={name + "-" + message.id} tabIndex={-1}>
                  <div className="player-chat-byline">
                    <strong>{message.nickname}</strong>
                    <time>{formatDate(message.at, { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" })}</time>
                    {message.sender === self && <span>{t("Ty")}</span>}
                    {canReply && <button type="button" aria-describedby={textId}
                      onClick={() => { chat.edit(channel, { ...draft, reply: message }); input.current?.focus(); }}>
                      <span aria-hidden="true">↪ </span>{t("Odpovědět")}
                    </button>}
                  </div>
                  {reply && (originalVisible ? (
                    <button type="button" className="player-chat-quote" onClick={() => jump(revealed.id)}>
                      ↪ {revealed.nickname}: {revealed.text}
                    </button>
                  ) : <div className="player-chat-quote">{revealed
                    ? `↪ ${revealed.nickname}: ${revealed.text}`
                    : t("Původní zpráva není dostupná.")}</div>)}
                  <p id={textId}>{message.text}</p>
                </article>
              );
            })}
          </div>
          {showBottom && <button className="player-chat-bottom" type="button" onClick={() => { goToEnd(); log.current?.focus(); }}>
            {t("Na konec konverzace")} ↓
          </button>}
        </div>
        <form className="player-chat-composer" onSubmit={event => {
          event.preventDefault();
          if (canReply && !composing.current) chat.submit(channel, send);
        }}>
          {draft.reply && <div className="player-chat-reference">
            <span>{availableReply ? t("Odpovídáš: {name} · {text}", { name: draft.reply.nickname, text: draft.reply.text })
              : t("Původní zpráva není dostupná.")}</span>
            <button type="button" aria-label={t("Zrušit odpověď")} onClick={() => {
              chat.edit(channel, { text: draft.text }); input.current?.focus();
            }}>{t("Zrušit")}</button>
          </div>}
          {chat.failure?.channel === channel && <div role="alert">{localizeNotice(chat.failure.reason)}</div>}
          {!connected && <div role="status">{t("Chat je odpojený. Rozepsaný text zůstává v poli.")}</div>}
          {connected && !supported && <div role="status">{t("Tato verze serveru zatím nepodporuje nový chat.")}</div>}
          <div className="player-chat-send">
            <input ref={input} aria-label={t("Zpráva")} placeholder={t("Napiš něco…")} maxLength={500}
              disabled={!canCompose} value={draft.text} onChange={event => chat.edit(channel, { ...draft, text: event.target.value })}
              onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
              onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} />
            <button type="submit" disabled={!canReply || chat.sending || !draft.text.trim() || !!draft.reply && !availableReply}>{t("Odeslat")}</button>
          </div>
        </form>
      </>}
    </dialog>
  );
}
