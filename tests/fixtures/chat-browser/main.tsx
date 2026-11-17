import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PlayerChat, readChatPreferences, usePlayerChat, type ChatMode } from "../../../client/player-chat";
import { CrazyTypkaChat, CrazyTypkaChatActions, type CrazyTypkaState } from "../../../client/crazy-typka";
import { WorldDock } from "../../../client/world-dock";
import { setLocale } from "../../../client/i18n";
import type { ChatMessage } from "../../../shared/types";
import "../../../client/style.css";
import "../../../client/welcome-screen.css";
import "../../../client/hud.css";
import "../../../client/crazy-typka.css";
import "../../../client/player-chat.css";

setLocale("cs");
const blocked: string[] = [];
const sample: ChatMessage = {
  id: "initial", sender: "nela", nickname: "Nela", text: "Kudy se jde do čajovny?",
  channel: "local", at: Date.now(),
};
const destinations = [
  { key: "dm:nela", label: "Nela", available: true },
  { key: "dm:kuba", label: "Kuba", available: true },
  { key: "event:tea", label: "Čajovna", available: true },
];

function Fixture() {
  const chat = usePlayerChat("self", blocked, blocked);
  const [mode, setMode] = useState<ChatMode>("idle");
  const [focusRequest, setFocusRequest] = useState(0);
  const [channel, setChannel] = useState("global");
  const [aiActive, setAiActive] = useState(false);
  const [privateText, setPrivateText] = useState(true);
  const [connected, setConnected] = useState(true);
  const [aiDraft, setAiDraft] = useState("");
  const [aiMessages, setAiMessages] = useState<CrazyTypkaState["messages"]>([]);
  const [dark, setDark] = useState(true);
  const [sent, setSent] = useState<unknown[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const priorMode = useRef<ChatMode>("idle");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const changeMode = useCallback((next: ChatMode) => {
    if (next === "expanded" && modeRef.current !== "expanded") priorMode.current = modeRef.current;
    setMode(next);
    if (next === "idle") canvas.current?.focus();
  }, []);
  useEffect(() => { chat.receive(sample); }, [chat.receive]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape" && modeRef.current !== "idle") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const next = modeRef.current === "expanded" ? priorMode.current : "idle";
        changeMode(next);
        if (next === "composing") setFocusRequest(value => value + 1);
      } else if (event.code === "KeyT" && !(event.target as Element)?.closest("input,textarea,select")) {
        event.preventDefault();
        changeMode("composing");
        setFocusRequest(value => value + 1);
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, [changeMode]);
  const ai: CrazyTypkaState = {
    availability: "enabled", busy: false, error: null, notice: null, recovery: "none",
    draft: aiDraft, messages: aiMessages, draftReply: null, replyableRequestSeqs: [],
    knowledgeScope: { kind: "current" },
    setDraft: setAiDraft, selectReply() {}, clearReply() {}, setKnowledgeScope() {},
    async send() {
      setAiMessages(previous => [...previous,
        { id: previous.length + 1, role: "user", text: aiDraft, sources: [] },
        { id: previous.length + 2, role: "ai", text: "Ukázková odpověď pro kontrolu vzhledu.", sources: [] },
      ]);
      setAiDraft("");
    },
    async retry() {}, async reset() { setAiMessages([]); }, async cancel() {}, async refreshStatus() {},
  };
  return <main className="game-shell" data-chat-mode={mode}
    style={{ background: dark ? "#111" : "#fff", height: "100dvh" }}>
    <canvas ref={canvas} tabIndex={0} aria-label="Hra"
      onPointerDownCapture={event => {
        if (mode === "idle") return;
        event.preventDefault(); event.stopPropagation(); changeMode("idle");
      }} />
    <div className="fixture-controls">
      <strong>Interaktivní kontrola · fiktivní zprávy</strong>
      <button onClick={() => chat.receive({ ...sample, id: crypto.randomUUID(), channel: "dm:self", text: "Soukromá zkouška citace" })}>Příchozí DM</button>
      <button onClick={() => chat.receive({ ...sample, id: crypto.randomUUID(), channel: "event:tea", text: "Událost Čajovna" })}>Příchozí akce</button>
      <button onClick={() => {
        for (let index = 0; index < 12; index++) chat.receive({ ...sample, id: crypto.randomUUID(), text: "Historie " + index });
      }}>Historie</button>
      <button onClick={() => setPrivateText(value => !value)}>Soukromý text</button>
      <button onClick={() => { setConnected(value => !value); chat.fail("Chat je odpojený. Rozepsaný text zůstává v poli."); }}>Spojení</button>
      <button onClick={() => setDark(value => !value)}>Pozadí</button>
      <output data-fixture-mode>{mode}</output>
      <output hidden data-fixture-sent>{JSON.stringify(sent)}</output>
      <output hidden data-fixture-preferences>{JSON.stringify(readChatPreferences())}</output>
    </div>
    <div className="minimap">
      <PlayerChat chat={chat} self="self" channel={channel} changeChannel={setChannel} destinations={destinations}
        connected={connected} supported guest={false} aiActive={aiActive} showAi={setAiActive}
        aiActions={<CrazyTypkaChatActions state={ai} locale="cs" />}
        aiContent={<CrazyTypkaChat state={ai} locale="cs" variant="embedded"
          interactionActive={mode !== "idle" && aiActive} visible={aiActive} expanded={mode === "expanded"} />}
        mode={mode} onModeChange={changeMode} focusRequest={focusRequest} showPrivateText={privateText}
        shortcut visible send={payload => {
          setSent(previous => [...previous, payload]);
          const original = payload.replyTo && chat.visible.find(entry => entry.message.id === payload.replyTo)?.message;
          chat.receive({ id: crypto.randomUUID(), sender: "self", nickname: "Mia", at: Date.now(), text: payload.text,
            channel: payload.channel, ...(original ? { reply: { id: original.id, sender: original.sender, nickname: original.nickname, text: original.text } } : {}) });
          setTimeout(() => chat.result({ requestId: payload.requestId, ok: true }), 60);
          return true;
        }} />
      <button type="button" className="chat-map-toggle">Mapa</button>
      <div className="minimap-frame" style={{ height: 130, padding: 10 }}>Minimapa</div>
    </div>
    <WorldDock panel={mode !== "idle" ? "chat" : ""} journalOpen={false} requestCount={0}
      onToggle={() => { changeMode("composing"); setFocusRequest(value => value + 1); }} />
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
