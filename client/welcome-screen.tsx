import { useEffect, useId, useState, type ReactNode } from "react";
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
  onChange: (profile: Profile) => void;
  enter: (mode: "guest" | "multi") => void;
  busy: boolean;
  error?: string;
  locale: "cs" | "en";
  editor: ReactNode;
  map: ReactNode;
  language: ReactNode;
  feedback: ReactNode;
  assistant?: ReactNode;
  /** Optional externally supplied snapshot, also useful for static rendering. */
  presence?: PublicPresenceState;
};

export function WelcomeScreen({
  profile,
  onChange,
  enter,
  busy,
  error,
  locale,
  editor,
  map,
  language,
  feedback,
  assistant,
  presence,
}: WelcomeScreenProps) {
  const [editing, setEditing] = useState(false);
  const [livePresence, setLivePresence] = useState<PublicPresenceState>({
    status: "loading",
  });
  const id = useId();
  const cs = locale === "cs";
  useEffect(
    () => (presence ? undefined : observePublicPresence(setLivePresence)),
    [presence],
  );
  const count = presence ?? livePresence;
  return (
    <main className="welcome-screen">
      <header className="home-nav">
        <a className="brand" href="#" aria-label="Strahov Crazy Show">
          s<span>•</span>trahov
        </a>
        <span className="demo-badge">
          {cs ? "HRATELNÉ DEMO" : "PLAYABLE DEMO"}
        </span>
        <div className="home-nav-actions">
          {language}
          {feedback}
        </div>
      </header>
      <section className="home-hero" aria-labelledby={`${id}-title`}>
        <div className="home-copy">
          <p className="home-eyebrow">
            {cs ? "TVŮJ KOPEC. TVOJE PARTA." : "YOUR HILL. YOUR PEOPLE."}
          </p>
          <h1 id={`${id}-title`}>
            {cs ? (
              <>
                Na kopci.
                <br />
                Ve svém živlu.
              </>
            ) : (
              <>
                On the hill.
                <br />
                In your element.
              </>
            )}
          </h1>
          <p className="home-intro">
            {cs
              ? "Potkej se mezi bloky, projdi známá místa a objev Strahov po svém. Rovnou v prohlížeči."
              : "Meet between the blocks, explore familiar places and make Strahov your own. Right in your browser."}
          </p>
          <div
            className={`home-presence ${count.status}`}
            role="status"
            aria-live="polite"
          >
            <span className="home-presence-dot" aria-hidden="true" />
            {count.status === "ready" ? (
              <>
                <strong>
                  {count.online.toLocaleString(cs ? "cs-CZ" : "en-GB")}
                </strong>{" "}
                {cs
                  ? "právě ve společném světě"
                  : "in the shared world right now"}
              </>
            ) : count.status === "loading" ? (
              cs ? (
                "Zjišťuji počet připojených…"
              ) : (
                "Checking the online count…"
              )
            ) : cs ? (
              "Počet připojených teď není dostupný"
            ) : (
              "The online count is unavailable right now"
            )}
          </div>
          <p className="home-count-note">
            {cs
              ? "Počet herních relací, ne ověřených obyvatel kolejí."
              : "Game sessions, not verified dorm residents."}
          </p>
        </div>
        <aside className="home-join" aria-labelledby={`${id}-join`}>
          <span className="home-eyebrow">
            {cs ? "PŘIDEJ SE" : "COME ON IN"}
          </span>
          <h2 id={`${id}-join`}>
            {cs ? "Kopec čeká." : "The hill is waiting."}
          </h2>
          <label htmlFor={`${id}-nickname`}>
            {cs ? "Jak ti budeme říkat?" : "What should we call you?"}
            <input
              id={`${id}-nickname`}
              value={profile.nickname}
              maxLength={24}
              autoComplete="off"
              onChange={(event) =>
                onChange({ ...profile, nickname: event.target.value })
              }
              placeholder={cs ? "Tvoje přezdívka" : "Your nickname"}
            />
          </label>
          <button
            type="button"
            className="primary full"
            disabled={busy}
            onClick={() => enter("multi")}
          >
            {busy
              ? cs
                ? "Připojuji…"
                : "Connecting…"
              : cs
                ? "Vstoupit do společného světa"
                : "Enter the shared world"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
          <button
            type="button"
            className="secondary full"
            disabled={busy}
            onClick={() => enter("guest")}
          >
            {cs ? "Prohlédnout si Strahov sám" : "Explore Strahov on your own"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="home-edit-toggle"
            aria-expanded={editing}
            aria-controls={`${id}-editor`}
            onClick={() => setEditing((value) => !value)}
          >
            <span>{cs ? "Tvoje postava" : "Your character"}</span>
            <strong>
              {editing
                ? cs
                  ? "Zavřít úpravy −"
                  : "Close editor −"
                : cs
                  ? "Upravit vzhled +"
                  : "Edit appearance +"}
            </strong>
          </button>
          <div id={`${id}-editor`} className="home-editor" hidden={!editing}>
            {editing ? editor : null}
          </div>
          <p className="home-privacy">
            {cs
              ? "Bez účtu a hesla. Přezdívka ani bydliště se neověřují. Vzhled zůstává uložený v tomto prohlížeči."
              : "No account or password. Nicknames and residency are not verified. Your appearance is saved in this browser."}
          </p>
        </aside>
      </section>
      <section
        className={`home-discover${assistant ? " with-assistant" : ""}`}
        aria-label={cs ? "Objev Strahov" : "Discover Strahov"}
      >
        <div className="home-map-card">
          <div className="home-section-heading">
            <div>
              <span className="home-eyebrow">STRAHOV / PRAHA</span>
              <h2>{cs ? "Znáš to tu?" : "Know your way around?"}</h2>
            </div>
            <a
              href="https://wiki.sh.cvut.cz/kolej/bloky/blok_6"
              target="_blank"
              rel="noreferrer"
            >
              {cs ? "Poznej kopec ↗" : "Meet the hill ↗"}
            </a>
          </div>
          <div className="home-map">{map}</div>
          <p className="home-map-credit">© OpenStreetMap contributors</p>
        </div>
        {assistant && <div className="home-assistant">{assistant}</div>}
      </section>
      <footer className="home-footer">
        <span>STRAHOV CRAZY SHOW</span>
        <p>
          {cs
            ? "Samostatně modelovaný Strahov podle map a fotografií. Referenční 3D podklad © IPR Praha, 2023, CC BY. Interiér B6 je rekonstrukce podle plánů a fotografií. Všechny ukázkové akce jsou fiktivní."
            : "Strahov modelled from maps and photographs. Reference 3D data © IPR Prague, 2023, CC BY. The B6 interior is reconstructed from plans and photographs. All demo events are fictional."}
        </p>
      </footer>
    </main>
  );
}
