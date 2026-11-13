import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { WelcomeMap } from "./welcome-map";
import { useViewportHeight } from "./use-viewport-height";
import type { Profile } from "../shared/types";

export type PublicPresenceState =
  { status: "loading" | "unavailable" } | { status: "ready"; online: number };

/** One bounded request at a time; only the mounted welcome screen owns this poll. */
export function observePublicPresence(
  publish: (state: PublicPresenceState) => void,
  options: {
    request?: typeof fetch;
    intervalMs?: number;
    timeoutMs?: number;
  } = {},
) {
  const request = options.request ?? fetch;
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: AbortController | undefined;
  const visibility = typeof document === "undefined" ? undefined : document;
  const poll = async () => {
    if (!active || current || visibility?.hidden) return;
    const controller = new AbortController();
    current = controller;
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 5000,
    );
    try {
      const response = await request("/api/presence", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Presence unavailable");
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("online" in data) ||
        !Number.isSafeInteger(data.online) ||
        Number(data.online) < 0
      )
        throw new Error("Invalid presence");
      if (active && !controller.signal.aborted)
        publish({ status: "ready", online: Number(data.online) });
      else if (active) publish({ status: "unavailable" });
    } catch {
      if (active) publish({ status: "unavailable" });
    } finally {
      clearTimeout(timeout);
      if (current === controller) current = undefined;
      if (active && !visibility?.hidden)
        timer = setTimeout(poll, options.intervalMs ?? 30000);
    }
  };
  const onVisibility = () => {
    clearTimeout(timer);
    if (!visibility?.hidden) void poll();
  };
  visibility?.addEventListener("visibilitychange", onVisibility);
  publish({ status: "loading" });
  void poll();
  return () => {
    active = false;
    clearTimeout(timer);
    current?.abort();
    visibility?.removeEventListener("visibilitychange", onVisibility);
  };
}

export type WelcomeScreenProps = {
  profile: Profile;
  enter: (mode: "guest" | "multi") => void;
  busy: boolean;
  error?: string;
  locale: "cs" | "en";
  editor: ReactNode;
  language: ReactNode;
  feedback: ReactNode;
  graphics?: ReactNode;
  assistant?: ReactNode;
  assistantActions?: ReactNode;
  authMode?: "loading" | "local" | "closed" | "google";
  signedIn?: boolean;
  openProfile?: boolean;
  onProfileChange?: (open: boolean) => void;
  logout?: () => void;
  /** Optional externally supplied snapshot, also useful for static rendering. */
  presence?: PublicPresenceState;
};

function HomeIcon({
  kind,
}: {
  kind: "chat" | "controls" | "info" | "back" | "close";
}) {
  const paths = {
    chat: (
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0Z" />
    ),
    controls: (
      <>
        <path d="M7 7h10a4 4 0 0 1 4 3l1 7a2 2 0 0 1-3 2l-4-3H9l-4 3a2 2 0 0 1-3-2l1-7a4 4 0 0 1 4-3Z" />
        <path d="M7 10v5m-2.5-2.5h5M16 11h.01M19 14h.01" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10h.01" />
      </>
    ),
    back: <path d="m10 5-7 7 7 7M3 12h18" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
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
      {paths[kind]}
    </svg>
  );
}

export function WelcomeScreen({
  profile,
  enter,
  busy,
  error,
  locale,
  editor,
  language,
  feedback,
  graphics,
  assistant,
  assistantActions,
  authMode = "local",
  signedIn = false,
  openProfile,
  onProfileChange,
  logout,
  presence,
}: WelcomeScreenProps) {
  const viewport = useViewportHeight<HTMLElement>();
  const [internalScreen, setInternalScreen] = useState<"home" | "profile">("home");
  const screen = openProfile === undefined ? internalScreen : openProfile ? "profile" : "home";
  const setScreen = (next: "home" | "profile") => {
    setInternalScreen(next);
    onProfileChange?.(next === "profile");
  };
  const [chatOpen, setChatOpen] = useState(false);
  const [info, setInfo] = useState<"controls" | "about" | null>(null);
  const [invalidName, setInvalidName] = useState(false);
  const [livePresence, setLivePresence] = useState<PublicPresenceState>({
    status: "loading",
  });
  const entry = useRef<HTMLButtonElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const profileHeading = useRef<HTMLHeadingElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const chat = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousScreen = useRef(screen);
  const previousChatOpen = useRef(chatOpen);
  const id = useId();
  const cs = locale === "cs";
  useEffect(
    () => (presence ? undefined : observePublicPresence(setLivePresence)),
    [presence],
  );
  // The native editor is mounted only on this screen; its cleanup owns the GPU preview.
  useEffect(() => {
    // Announce the screen without opening a phone keyboard before a field is chosen.
    if (screen === "profile") profileHeading.current?.focus({ preventScroll: true });
    else if (previousScreen.current === "profile") entry.current?.focus({ preventScroll: true });
    previousScreen.current = screen;
  }, [screen]);
  useEffect(() => {
    if (chatOpen) {
      const field =
        chat.current?.querySelector<HTMLElement>(
          "textarea:not(:disabled), input:not(:disabled)",
        ) ?? chat.current?.querySelector<HTMLElement>("button:not(:disabled)");
      field?.focus({ preventScroll: true });
    } else if (previousChatOpen.current)
      launcher.current?.focus({ preventScroll: true });
    previousChatOpen.current = chatOpen;
  }, [chatOpen]);
  useEffect(() => {
    if (!info || !dialog.current) return;
    const element = dialog.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [info]);
  const closeChat = () => {
    setChatOpen(false);
  };
  const count = presence ?? livePresence;
  const countDescription =
    count.status === "loading"
      ? cs
        ? "Zjišťuji počet připojených…"
        : "Checking the online count…"
      : cs
        ? "Počet připojených teď není dostupný"
        : "The online count is unavailable right now";
  const countLabel = cs
    ? count.status === "ready" && count.online === 1
      ? "Strahovák online"
      : count.status === "ready" && count.online >= 2 && count.online <= 4
        ? "Strahováci online"
        : "Strahováků online"
    : "Strahov players online";

  return (
    <main
      ref={viewport}
      className="welcome-screen"
      data-screen={screen}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || info) return;
        if (chatOpen) {
          event.preventDefault();
          closeChat();
        } else if (screen === "profile" && !busy) {
          event.preventDefault();
          setScreen("home");
          setInvalidName(false);
        }
      }}
    >
      <div className="home-map-viewport" aria-hidden="true">
        <div className="home-map-drift">
          <div className="home-map-plane">
            <WelcomeMap />
          </div>
        </div>
      </div>
      <div className="home-vignette" aria-hidden="true" />
      <header className="home-nav">
        {screen === "profile" && (
          <button
            type="button"
            className="home-quiet home-back"
            disabled={busy}
            onClick={() => {
              setScreen("home");
              setInvalidName(false);
            }}
          >
            <HomeIcon kind="back" />
            {cs ? "Zpět" : "Back"}
          </button>
        )}
        <div className="home-nav-actions">
          {signedIn && <button type="button" className="home-quiet" disabled={busy} onClick={logout}>
            {cs ? "Odhlásit se" : "Sign out"}
          </button>}
          {language}
          {graphics}
          {feedback}
        </div>
      </header>
      <div className="home-content">
        {screen === "home" ? (
          <section className="home-hero" aria-labelledby={id + "-title"}>
            <h1 id={id + "-title"}>
              Strahov<span>Crazy Show</span>
            </h1>
            <div className="home-entry">
              <div className="home-play-actions">
                {authMode === "google" && !signedIn ? (
                  <form action="/api/auth/google/start" method="post">
                    <button ref={entry} className="home-google" type="submit" disabled={busy}>
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.8-3.5 6.1-8.7 6.1-14.9z"/>
                        <path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.5-4.6l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.4 0-9.9-3.7-11.5-8.6H5.7v5.2A20 20 0 0 0 24 44z"/>
                        <path fill="#FBBC05" d="M12.5 27.8a12 12 0 0 1 0-7.6V15H5.7a20 20 0 0 0 0 18z"/>
                        <path fill="#EA4335" d="M24 11.6c3 0 5.7 1 7.8 3.1l5.8-5.8A19.2 19.2 0 0 0 24 4 20 20 0 0 0 5.7 15l6.8 5.2A12.1 12.1 0 0 1 24 11.6z"/>
                      </svg>
                      {cs ? "Přihlásit se přes Google" : "Sign in with Google"}
                    </button>
                  </form>
                ) : (signedIn || authMode === "local") && (
                  <button ref={entry} type="button" className="home-primary home-enter" disabled={busy}
                    onClick={() => setScreen("profile")}>
                    {signedIn ? (cs ? "Hrát multiplayer" : "Play multiplayer") : (cs ? "Pusť mě dovnitř" : "Let me in")}
                  </button>
                )}
                <button type="button" className="home-quiet home-solo" disabled={busy}
                  ref={authMode === "closed" || authMode === "loading" ? entry : undefined}
                  onClick={() => enter("guest")}>
                  {cs ? "Hrát sólo" : "Play solo"}
                </button>
              </div>
              <p
                className={"home-presence home-glass " + count.status}
                role="status"
                aria-live="polite"
                aria-label={
                  count.status === "ready" ? undefined : countDescription
                }
                title={count.status === "ready" ? undefined : countDescription}
              >
                <span className="home-presence-dot" aria-hidden="true" />
                <strong>
                  {count.status === "ready"
                    ? count.online.toLocaleString(cs ? "cs-CZ" : "en-GB")
                    : "—"}
                </strong>{" "}
                {countLabel}
              </p>
            </div>
            {authMode === "closed" && <p className="home-error" role="status">
              {cs ? "Přihlášení je dočasně nedostupné." : "Sign-in is temporarily unavailable."}
            </p>}
            {error && (
              <p className="home-error" role="alert">
                {error}
              </p>
            )}
            <nav
              className="home-shortcuts"
              aria-label={cs ? "Další možnosti" : "More options"}
            >
              <button
                type="button"
                className="home-quiet"
                onClick={() => setInfo("controls")}
              >
                <HomeIcon kind="controls" />
                {cs ? "Ovládání" : "Controls"}
              </button>
              <button
                type="button"
                className="home-quiet"
                onClick={() => setInfo("about")}
              >
                <HomeIcon kind="info" />
                {cs ? "O projektu" : "About"}
              </button>
              <a className="home-quiet" href="/privacy.html">{cs ? "Ochrana soukromí" : "Privacy"}</a>
            </nav>
          </section>
        ) : (
          <section
            className="home-setup home-glass"
            aria-labelledby={id + "-profile"}
          >
            <header className="home-setup-heading">
              <h1 ref={profileHeading} tabIndex={-1} id={id + "-profile"}>
                {cs ? "Tvoje postava" : "Your character"}
              </h1>
              <span>{cs ? "Před vstupem do hry" : "Before you enter"}</span>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                if (!profile.nickname.trim()) {
                  setInvalidName(true);
                  editorHost.current
                    ?.querySelector<HTMLInputElement>(".ae-nickname input")
                    ?.focus();
                  return;
                }
                setInvalidName(false);
                enter("multi");
              }}
            >
              <div className="home-profile-scroll">
                <fieldset className="home-profile-fields" disabled={busy}>
                  <div ref={editorHost} className="home-editor">
                    {editor}
                  </div>
                </fieldset>
                {(error || (invalidName && !profile.nickname.trim())) && (
                  <p className="home-error" role="alert">
                    {error || (cs ? "Doplň přezdívku." : "Enter a nickname.")}
                  </p>
                )}
              </div>
              <div className="home-setup-actions">
                <button type="submit" className="home-primary" disabled={busy}>
                  {busy
                    ? cs
                      ? "Připojuji…"
                      : "Connecting…"
                    : cs
                      ? "Vstoupit do hry"
                      : "Enter the game"}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
      {assistant && (
        <>
          <button
            ref={launcher}
            type="button"
            className={
              "home-chat-launcher home-glass" + (chatOpen ? " is-open" : "")
            }
            aria-label={cs ? "Chat s Crazy Typkou" : "Chat with Crazy Typka"}
            aria-expanded={chatOpen}
            aria-controls={id + "-chat"}
            onClick={() => setChatOpen((value) => !value)}
          >
            <img src="/ui/crazy-typka.svg" alt="" width="42" height="42" />
            <span>
              Crazy Typka <span className="home-ai-tag">AI</span>
            </span>
            <HomeIcon kind="chat" />
          </button>
          {chatOpen && (
            <section
              ref={chat}
              id={id + "-chat"}
              className="home-chat-popup home-glass"
              aria-label={cs ? "Soukromý AI chat" : "Private AI chat"}
            >
              <div className="home-chat-toolbar">
                {assistantActions}
                <button
                  type="button"
                  className="home-chat-close home-quiet"
                  aria-label={cs ? "Zavřít chat" : "Close chat"}
                  onClick={closeChat}
                >
                  <HomeIcon kind="close" />
                </button>
              </div>
              {assistant}
            </section>
          )}
        </>
      )}
      {info && (
        <dialog
          ref={dialog}
          className="home-dialog home-glass"
          aria-labelledby={id + "-info"}
          onCancel={(event) => {
            event.preventDefault();
            setInfo(null);
          }}
          onClose={() => setInfo(null)}
        >
          <button
            type="button"
            className="home-dialog-close home-quiet"
            aria-label={cs ? "Zavřít okno" : "Close dialog"}
            onClick={() => setInfo(null)}
            autoFocus
          >
            <HomeIcon kind="close" />
          </button>
          <h2 id={id + "-info"}>
            {info === "controls"
              ? cs
                ? "Ovládání"
                : "Controls"
              : cs
                ? "O projektu"
                : "About"}
          </h2>
          {info === "controls" ? (
            <dl className="home-controls">
              <div>
                <dt>
                  <kbd>W A S D</kbd>
                </dt>
                <dd>{cs ? "Pohyb" : "Move"}</dd>
              </div>
              <div>
                <dt>
                  <kbd>Shift</kbd>
                </dt>
                <dd>{cs ? "Běh" : "Run"}</dd>
              </div>
              <div>
                <dt>
                  <kbd>{cs ? "Mezerník" : "Space"}</kbd>
                </dt>
                <dd>{cs ? "Skok" : "Jump"}</dd>
              </div>
              <div>
                <dt>
                  <kbd>E</kbd>
                </dt>
                <dd>{cs ? "Interakce" : "Interact"}</dd>
              </div>
              <div>
                <dt>
                  <kbd>V</kbd>
                </dt>
                <dd>{cs ? "Změna pohledu" : "Change view"}</dd>
              </div>
              <div>
                <dt>
                  <kbd>M</kbd>
                </dt>
                <dd>{cs ? "Mapa" : "Map"}</dd>
              </div>
            </dl>
          ) : (
            <div className="home-about">
              <p>
                {cs
                  ? "Strahov Crazy Show je virtuální Strahov v prohlížeči. Sólo je otevřené všem. Multiplayer používá herní účet přihlášený přes Google."
                  : "Strahov Crazy Show is a virtual Strahov in your browser. Solo play is open to everyone. Multiplayer uses a game account signed in through Google."}
              </p>
              <p>
                {cs
                  ? "Počet online zahrnuje připojené hráčské relace. Ukázkové akce jsou fiktivní. Sólová postava je uložená v prohlížeči, multiplayerová postava v herním účtu."
                  : "The online count shows connected player sessions. Demo events are fictional. Your solo character is saved in this browser and your multiplayer character in your game account."}
              </p>
              <p>
                {cs ? "Mapa podle " : "Map based on "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenStreetMap contributors
                </a>
                {cs
                  ? ". Referenční 3D podklad © IPR Praha, 2023, CC BY. Interiér B6 je rekonstrukce podle plánů a fotografií."
                  : ". Reference 3D data © IPR Prague, 2023, CC BY. The B6 interior is reconstructed from plans and photographs."}
              </p>
              <a
                href="https://wiki.sh.cvut.cz/"
                target="_blank"
                rel="noreferrer"
              >
                Silicon Hill Wiki
              </a>
            </div>
          )}
        </dialog>
      )}
    </main>
  );
}
