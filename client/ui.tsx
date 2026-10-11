import { AvatarEditor } from "./avatar-editor";
import { MapView } from "./minimap";
import { Journal } from "./journal";
import { entryForPlace } from "../shared/journal";
import { EmoteMenu } from "./emote-menu";
import { EMOTES, type WorldSelection } from "./interaction";
import { useState, useEffect, useRef, useMemo } from "react";
import { Client, type Room } from "@colyseus/sdk";
import {
  DEFAULT_PROFILE,
  INTERESTS,
  type Profile,
  type Player,
  type EventItem,
  type ChatMessage,
  type SocialState,
  type ActivityState,
} from "../shared/types";
import {
  makeDemoEvents,
  eventStatus,
  inPeriod,
  QUIZ,
  dateKey,
} from "../shared/events";
import { sanitizeProfile } from "../shared/profile";
import { projectLocalBenchmark } from "../shared/local-benchmark";
import { PLACES, HUNT_POINTS, SPAWN } from "../shared/world";
import type { Game, GameStats, Benchmark } from "./game";
import {
  isRenderQualityMode,
  isRenderTargetFps,
  type RenderQualityMode,
  type RenderTargetFps,
} from "../shared/render-quality";
import {
  GPU_SETTINGS_HELP_URL,
  DISPLAY_REFRESH_HELP_URL,
} from "./gpu-diagnostics";
import type { Weather } from "../shared/weather";
import {
  nextArrivals,
  transitStatus,
  type TransitArrival,
} from "../shared/transit";
import {
  PROTOCOL_VERSION,
  type Input,
  type MotionPacket,
  type Authority,
} from "../shared/netcode";

const readProfile = () => {
  try {
    return sanitizeProfile(
      JSON.parse(localStorage.getItem("strahov.profile") || "null") ||
        DEFAULT_PROFILE,
    );
  } catch {
    return DEFAULT_PROFILE;
  }
};
const readRenderPreferences = (): {
  mode: RenderQualityMode;
  targetFps: RenderTargetFps;
} => {
  try {
    const saved = JSON.parse(
      localStorage.getItem("strahov.rendering") || "null",
    );
    return {
      mode: isRenderQualityMode(saved?.mode) ? saved.mode : "auto",
      targetFps: isRenderTargetFps(saved?.targetFps) ? saved.targetFps : 60,
    };
  } catch {
    return { mode: "auto", targetFps: 60 };
  }
};
const qualityLabel = { low: "Úsporná", medium: "Střední", high: "Vysoká" };
const time = (t: number) =>
  new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);
const STATUS = {
  planned: "Plánováno",
  live: "Právě probíhá",
  ended: "Skončilo",
  cancelled: "Zrušeno",
};
const initialActivity: ActivityState = {
  hunt: [],
  quiz: {
    question: -1,
    deadline: 0,
    scores: {},
    running: false,
    teamScores: {},
  },
};
export function App() {
  const [journalOpen, setJournalOpen] = useState(false),
    [journalEntryId, setJournalEntryId] = useState<string | undefined>();
  const [emotesOpen, setEmotesOpen] = useState(false),
    [worldSelection, setWorldSelection] = useState<WorldSelection | null>(null);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [localCollector, setLocalCollector] = useState(false),
    [benchmarkSaveNotice, setBenchmarkSaveNotice] = useState("");
  const userBenchmark = useRef(false);
  const benchmarkBuildIdentity = /^[a-f0-9]{64}$/.test(
    import.meta.env.VITE_SOURCE_SNAPSHOT_ID ?? "",
  );
  const collectorStatus = async () => {
    try {
      const response = await fetch("/api/diagnostics/status", {
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) return null;
      const status = await response.json();
      if (
        status.enabled === true &&
        /^[a-f0-9]{64}$/.test(status.sourceSnapshotId)
      )
        return status as { enabled: true; sourceSnapshotId: string };
    } catch {}
    return null;
  };
  useEffect(() => {
    if (benchmarkBuildIdentity)
      void collectorStatus().then((status) => setLocalCollector(!!status));
  }, []);
  const saveLocalBenchmark = async (value: Benchmark) => {
    // Capture mutable renderer counters now, before the status request yields
    // to another game frame. Also strip personal/model data before any HTTP.
    let payload: ReturnType<typeof projectLocalBenchmark> | null = null;
    try {
      payload = projectLocalBenchmark(value);
    } catch {}
    const status = await collectorStatus();
    setLocalCollector(!!status);
    if (!status) return;
    try {
      if (!payload || payload.sourceSnapshotId !== status.sourceSnapshotId)
        throw new Error("source");
      const response = await fetch("/api/diagnostics/benchmark", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("save");
      setBenchmarkSaveNotice("Výsledek uložen pouze na tomto počítači.");
    } catch {
      setBenchmarkSaveNotice(
        "Místní uložení se nezdařilo; výsledek zůstává zde v prohlížeči.",
      );
    }
  };
  const [lighting, setLighting] = useState("real");
  const [trafficPreview, setTrafficPreview] = useState<TransitArrival | null>(
    null,
  );
  const inputBuffer = useRef<Input[]>([]),
    authorityRef = useRef<Authority | null>(null),
    playersById = useRef(new Map<string, Player>()),
    connectedRef = useRef(false);
  const previewInstant = (mode: string) =>
    mode === "real"
      ? null
      : Date.parse(
          dateKey(Date.now()) + (mode === "day" ? "T10:00:00Z" : "T22:00:00Z"),
        );
  const [profile, setProfile] = useState<Profile>(readProfile),
    [mode, setMode] = useState<"menu" | "guest" | "multi">("menu"),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [panel, setPanel] = useState("events"),
    [events, setEvents] = useState<EventItem[]>(() => makeDemoEvents()),
    [period, setPeriod] = useState("today"),
    [interest, setInterest] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [mapDestination, setMapDestination] = useState<string | null>(null),
    [players, setPlayers] = useState<Player[]>([]),
    [selfId, setSelfId] = useState("guest");
  const [social, setSocial] = useState<SocialState>({
      attendance: [],
      contacts: [],
      requests: [],
      blocked: [],
    }),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [channel, setChannel] = useState("global"),
    [message, setMessage] = useState(""),
    [muted, setMuted] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityState>(initialActivity),
    [team, setTeam] = useState("lime"),
    [answerSent, setAnswerSent] = useState(-1),
    [now, setNow] = useState(Date.now()),
    [stats, setStats] = useState<GameStats | null>(null),
    [weather, setWeather] = useState<Weather | null>(null),
    [toast, setToast] = useState(""),
    [quality, setQuality] = useState<RenderQualityMode>(
      () => readRenderPreferences().mode,
    ),
    [targetFps, setTargetFps] = useState<RenderTargetFps>(
      () => readRenderPreferences().targetFps,
    ),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(
        "strahov.rendering",
        JSON.stringify({ mode: quality, targetFps }),
      );
    } catch {
      /* Private mode can reject local preferences. */
    }
  }, [quality, targetFps]);
  const [showForm, setShowForm] = useState(false),
    [editing, setEditing] = useState<EventItem | null>(null),
    [rewards, setRewards] = useState<string[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("strahov.rewards") || "[]");
      } catch {
        return [];
      }
    });
  const canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<Game | null>(null),
    room = useRef<Room | null>(null),
    playersRef = useRef<Player[]>([]),
    profileRef = useRef(profile),
    idRef = useRef("guest"),
    modeRef = useRef(mode),
    weatherRef = useRef(weather),
    chatEnd = useRef<HTMLDivElement>(null),
    carState = useRef<any>(null);
  const notice = (message: string) => setToast(message);
  const reward = (name: string) => {
    setRewards((previous) => {
      const next = [...new Set([...previous, name])];
      localStorage.setItem("strahov.rewards", JSON.stringify(next));
      return next;
    });
    notice("Odměna: " + name);
  };
  useEffect(() => {
    profileRef.current = profile;
    localStorage.setItem("strahov.profile", JSON.stringify(profile));
    game.current?.setProfile(profile);
    const timeout = setTimeout(() => {
      if (connectedRef.current) room.current?.send("profile", profile);
    }, 300);
    return () => clearTimeout(timeout);
  }, [profile]);
  useEffect(() => {
    connectedRef.current = connected;
    if (!connected) {
      inputBuffer.current = [];
      return;
    }
    const timer = setInterval(() => {
      if (inputBuffer.current.length && room.current)
        room.current.send("inputs", inputBuffer.current.splice(0, 8));
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [connected]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const listener = () => {
      setJournalOpen(false);
      setEmotesOpen(false);
      setPanel((p) => (p === "map" ? "" : "map"));
    };
    const journal = () => {
      setEmotesOpen(false);
      setJournalOpen((open) => !open);
    };
    const emotes = () => {
      setJournalOpen(false);
      setEmotesOpen((open) => !open);
    };
    const close = () => {
      setJournalOpen(false);
      setEmotesOpen(false);
      setShowForm(false);
      setPanel("");
    };
    window.addEventListener("toggle-map", listener);
    window.addEventListener("toggle-journal", journal);
    window.addEventListener("toggle-emotes", emotes);
    window.addEventListener("close-world-ui", close);
    return () => {
      window.removeEventListener("toggle-map", listener);
      window.removeEventListener("toggle-journal", journal);
      window.removeEventListener("toggle-emotes", emotes);
      window.removeEventListener("close-world-ui", close);
    };
  }, []);
  useEffect(() => {
    game.current?.setUiModal(
      journalOpen || emotesOpen || showForm || panel === "map",
    );
  }, [journalOpen, emotesOpen, showForm, panel, ready]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages, channel]);
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/weather");
        if (response.ok) {
          const w = await response.json();
          setWeather(w);
          weatherRef.current = w;
          game.current?.setWeather(w);
        }
      } catch {
        /* solo remains playable */
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (mode === "menu" || !canvas.current) return;
    let cancelled = false;
    modeRef.current = mode;
    (async () => {
      try {
        const { Game } = await import("./game");
        if (cancelled || !canvas.current) return;
        const g = new Game(canvas.current, profileRef.current);
        game.current = g;
        g.network = mode === "multi";
        g.timeOverride = previewInstant(lighting);
        g.setLocalId(idRef.current);
        g.onStats = setStats;
        g.onBenchmark = (value) => {
          setBenchmark(value);
          if (userBenchmark.current) {
            userBenchmark.current = false;
            if (benchmarkBuildIdentity) void saveLocalBenchmark(value);
          }
        };
        g.onSelection = setWorldSelection;
        g.onNotice = notice;
        g.onInput = (input) => {
          if (
            room.current &&
            modeRef.current === "multi" &&
            connectedRef.current
          ) {
            inputBuffer.current.push(input);
            if (inputBuffer.current.length > 64) {
              inputBuffer.current = [];
              room.current.send("resync");
            }
          }
        };
        g.onPredictionReset = () => (inputBuffer.current = []);
        g.onAction = (action, data) => {
          if (action === "reward") reward(String(data));
          else room.current?.send(action, data);
        };
        if (weatherRef.current) g.setWeather(weatherRef.current);
        g.setQuality(quality);
        g.setTargetFps(targetFps);
        await g.start();
        if (cancelled) return;
        if (mode === "multi") {
          g.updatePlayers(playersRef.current);
          if (carState.current) g.setCar(carState.current);
          g.setFound(activity.hunt);
          if (authorityRef.current) g.reconcile(authorityRef.current);
        }
        setReady(true);
        // Read-only debug/benchmark entry points, local development only.
        if (import.meta.env.DEV)
          (window as any).__strahov = {
            game: g,
            getStats: () => ({
              fps: g.engine.getFps(),
              frameTimes: [...g.frames],
              renderer: g.engine.getGlInfo(),
              players: g.avatars.size,
            }),
            setTime: (t: number | null) => (g.timeOverride = t),
            setWeather: (w: Weather) => g.setWeather(w),
          };
      } catch (e) {
        setError("3D scénu se nepodařilo spustit: " + String(e));
      }
    })();
    return () => {
      cancelled = true;
      userBenchmark.current = false;
      game.current?.dispose();
      game.current = null;
    };
  }, [mode]);
  const bind = (r: Room) => {
    room.current = r;
    setConnected(true);
    r.onMessage("welcome", (data: any) => {
      if (room.current !== r) return;
      idRef.current = data.id;
      setSelfId(data.id);
      game.current?.setLocalId(data.id);
      playersRef.current = data.players;
      playersById.current = new Map(data.players.map((p: Player) => [p.id, p]));
      setPlayers(data.players);
      setEvents(data.events);
      setActivity(data.activity);
      game.current?.updatePlayers(data.players);
      if (game.current) game.current.canvas.dataset.networkStage = "connected";
    });
    r.onMessage("presence", (data: Player[]) => {
      playersRef.current = data;
      playersById.current = new Map(data.map((p) => [p.id, p]));
      setPlayers(data);
      game.current?.updatePlayers(data);
    });
    r.onMessage("motion", (packet: MotionPacket) => {
      for (const row of packet.rows) {
        const p = playersById.current.get(row[0]);
        if (p)
          Object.assign(p, {
            x: row[1],
            y: row[2],
            z: row[3],
            yaw: row[4],
            speed: row[5],
            vehicle: !!row[7],
            zone: row[8],
          });
      }
      game.current?.syncMotion(packet);
    });
    r.onMessage("authoritative", (data: Authority) => {
      authorityRef.current = data;
      game.current?.reconcile(data);
    });
    r.onMessage("events", setEvents);
    r.onMessage("social", setSocial);
    r.onMessage("activity", (a: ActivityState) => {
      setActivity(a);
      game.current?.setFound(a.hunt);
    });
    r.onMessage("notice", notice);
    r.onMessage("reward", reward);
    r.onMessage("car", (data: any) => {
      carState.current = data;
      game.current?.setCar(data);
    });
    r.onMessage("chat", (m: ChatMessage) =>
      setMessages((previous) => [...previous, m].slice(-200)),
    );
    r.onMessage("emote", ({ id, emote }: { id: string; emote: string }) => {
      const player = playersById.current.get(id);
      if (player) player.emote = emote;
      game.current?.setEmote(id, emote);
    });
    r.onLeave((code) => {
      // A late close from a replaced socket must not clear a new connection.
      if (room.current !== r) return;
      room.current = null;
      connectedRef.current = false;
      inputBuffer.current = [];
      authorityRef.current = null;
      playersRef.current = [];
      playersById.current.clear();
      setPlayers([]);
      setWorldSelection(null);
      const currentGame = game.current;
      if (currentGame) {
        currentGame.canvas.dataset.networkStage = `disconnected:${code}`;
        currentGame.selectTarget(null);
        currentGame.updatePlayers([currentGame.localPlayer]);
      }
      setConnected(false);
      notice("Spojení přerušeno. Použij Obnovit spojení.");
    });
    r.onError((_code: number, text?: string) =>
      notice(text || "Chyba spojení."),
    );
  };
  const connect = async () => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "multiplayer",
        profile: profileRef.current,
        resumeToken: sessionStorage.getItem("strahov.session"),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Server není dostupný.");
    sessionStorage.setItem("strahov.session", data.token);
    idRef.current = data.id;
    setSelfId(data.id);
    const client = new Client(
      import.meta.env.VITE_MULTIPLAYER_URL || `${location.origin}/realtime`,
    );
    const r = await client.joinById(data.worldId, {
      token: data.token,
      protocol: PROTOCOL_VERSION,
    });
    bind(r);
  };
  const enter = async (next: "guest" | "multi") => {
    setBusy(true);
    setError("");
    try {
      if (next === "multi") await connect();
      else {
        idRef.current = "guest";
        setSelfId("guest");
        setEvents(makeDemoEvents());
        setPlayers([]);
        setActivity(initialActivity);
      }
      setMode(next);
      modeRef.current = next;
    } catch (e) {
      setError(
        "Multiplayer se nepřipojil. Zkontroluj spuštění serveru. " +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setBusy(false);
    }
  };
  const leave = () => {
    room.current?.leave();
    room.current = null;
    modeRef.current = "menu";
    setMode("menu");
    setReady(false);
    setConnected(false);
    setMessages([]);
    setSocial({ attendance: [], contacts: [], requests: [], blocked: [] });
    setJournalOpen(false);
    setEmotesOpen(false);
    setWorldSelection(null);
  };
  const send = (action: string, data?: unknown) => {
    if (mode !== "multi" || !connected) {
      notice("Tato funkce je dostupná v připojeném multiplayeru.");
      return;
    }
    room.current?.send(action, data);
  };
  const togglePanel = (value: string) => {
    game.current?.blur();
    if (document.pointerLockElement) document.exitPointerLock();
    setEmotesOpen(false);
    if (value === "journal") {
      setJournalOpen((open) => !open);
      return;
    }
    setJournalOpen(false);
    setPanel((p) => (p === value ? "" : value));
  };
  const openJournal = (id?: string) => {
    game.current?.blur();
    if (document.pointerLockElement) document.exitPointerLock();
    setJournalEntryId(id);
    setEmotesOpen(false);
    setJournalOpen(true);
  };
  const playEmote = (emoji: string) => {
    if (mode === "multi") send("emote", emoji);
    else game.current?.setEmote("guest", emoji);
    setEmotesOpen(false);
  };
  const event = events.find((e) => e.id === selected),
    filtered = events
      .filter(
        (e) =>
          inPeriod(e, period, now) && (!interest || e.tags.includes(interest)),
      )
      .sort((a, b) => a.startsAt - b.startsAt);
  const attendance = (id: string) =>
    social.attendance.find((a) => a.eventId === id && a.playerId === selfId);
  const selectedPlace = mapDestination || event?.placeId;
  const destination = PLACES.find((p) => p.id === selectedPlace);
  const targetPlayer =
    worldSelection?.kind === "player"
      ? players.find((p) => p.id === worldSelection.id)
      : undefined;
  const targetPlace =
    worldSelection?.kind === "place"
      ? PLACES.find((p) => p.id === worldSelection.id)
      : undefined;
  const chooseMapPlace = (id: string, openMap = false) => {
    game.current?.blur();
    if (document.pointerLockElement) document.exitPointerLock();
    setMapDestination(id);
    if (openMap) setPanel("map");
  };
  const weatherLabel =
    weather?.temperature != null
      ? `${weather.temperature.toFixed(1)} °C`
      : "Počasí…";
  const updateAvatar = (key: string, value: any) =>
    setProfile((p) => ({ ...p, avatar: { ...p.avatar, [key]: value } }));
  const avatarEditor = (
    <AvatarEditor
      profile={profile}
      onChange={setProfile}
      compact={mode !== "menu"}
    />
  );
  if (mode === "menu")
    return (
      <main className="welcome">
        <div className="welcome-nav">
          <a className="brand" href="#">
            s<span>•</span>trahov
          </a>
          <span className="demo-badge">HRATELNÉ DEMO · 0.1</span>
          <a
            href="https://wiki.sh.cvut.cz/kolej/bloky/blok_6"
            target="_blank"
            rel="noreferrer"
          >
            Poznej kopec ↗
          </a>
        </div>
        <section className="welcome-grid">
          <div className="welcome-copy">
            <div className="eyebrow">PRAHA · 50.08065° N, 14.39175° E</div>
            <h1>
              Na kopci.
              <br />
              Ve svém živlu.
            </h1>
            <p>
              Tvůj Strahov v prohlížeči. Potkej ostatní, najdi svou partu a
              objev, co se děje mezi bloky.
            </p>
            <div className="welcome-facts">
              <span>↗ Celý areál</span>
              <span>◉ Společný svět</span>
              <span>☁ Skutečné počasí</span>
            </div>
            <div className="welcome-map">
              <MapView big />
              <div className="map-caption">
                <span>STRAHOV / KOLEJNÍ AREÁL</span>
                <span>© OpenStreetMap contributors</span>
              </div>
            </div>
            <p className="small muted">
              Samostatně modelovaný Strahov podle map a fotografických předloh.
              Referenční 3D podklad © IPR Praha, 2023, CC BY. Hratelný interiér
              B6 je rekonstrukce podle plánů a fotografií. Všechny uvedené akce
              jsou fiktivní.
            </p>
          </div>
          <aside className="join-card">
            <div className="eyebrow">ZAČNI U SEBE</div>
            <h2>Kdo dnes přijde?</h2>
            {avatarEditor}
            <button
              className="primary full"
              disabled={busy}
              onClick={() => enter("multi")}
            >
              {busy ? "Připojuji…" : "Vstoupit do společného světa"}{" "}
              <span>↗</span>
            </button>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() => enter("guest")}
            >
              Prohlédnout si Strahov sám
            </button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <p className="small muted">
              Přezdívka není účet ani ověřená identita. Demo neověřuje bydliště.
              Vzhled se uloží jen v tomto prohlížeči.
            </p>
          </aside>
        </section>
        <footer>
          <span>STRAHOV CRAZY SHOW</span>
          <span>Pro lidi, kteří žijí na kopci.</span>
        </footer>
      </main>
    );
  return (
    <main className="game-shell">
      <canvas
        ref={canvas}
        tabIndex={0}
        aria-label="3D hra Strahov"
        style={{ touchAction: "none" }}
      />
      {!ready && (
        <div className="loading">
          <div className="brand">
            s<span>•</span>trahov
          </div>
          <p>Připravuji celý kopec…</p>
          {error && <p className="error">{error}</p>}
        </div>
      )}
      <header className="game-top">
        <button className="brand" onClick={leave}>
          s<span>•</span>trahov
        </button>
        <div className="world-status">
          <i
            className={
              mode === "guest" ? "amber" : connected ? "green" : "amber"
            }
          />
          {mode === "guest"
            ? "Samostatná prohlídka"
            : connected
              ? `${players.length} na kopci · společný svět`
              : "Odpojeno"}
          <span className="demo-badge">DEMO</span>
          {lighting !== "real" && (
            <button
              className="demo-badge"
              onClick={() => {
                setLighting("real");
                if (game.current) game.current.timeOverride = null;
              }}
            >
              {lighting === "day" ? "Denní" : "Noční"} náhled · vypnout
            </button>
          )}
          {trafficPreview && (
            <button
              className="demo-badge"
              onClick={() => {
                if (game.current) game.current.trafficPreview = undefined;
                setTrafficPreview(null);
              }}
            >
              Ukázka busu {trafficPreview.route} · {time(trafficPreview.at)} ·
              ukončit
            </button>
          )}
        </div>
        <div className="top-right">
          <span
            className="weather"
            title={`${weather?.source || ""} · ${weather?.cloudSource || ""}`}
          >
            ☁ {weatherLabel}{" "}
            <small>
              {!weather
                ? "načítám"
                : weather.stale
                  ? "starší / nedostupná data"
                  : weather.status === "fallback"
                    ? "záložní model"
                    : "živá data"}
            </small>
          </span>
          <span className="clock">
            {time(previewInstant(lighting) ?? now)}{" "}
            <small>
              {lighting === "real" ? "Praha" : "náhled světla · Praha"}
            </small>
          </span>
          <button
            className="profile-button"
            onClick={() => togglePanel("avatar")}
          >
            {profile.nickname.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>
      <div className="demo-strip">
        Ukázkové akce jsou fiktivní. Přítomnost ve hře neznamená skutečnou
        návštěvu místa.
      </div>
      <div className="scene-labels" data-label-layer aria-hidden="true" />
      <div className="location-pill">
        <span>↗</span>
        <div>
          <strong>
            {stats?.zone.startsWith("b6")
              ? "Blok 6 · " + stats.zone.split(":")[1] + ". úroveň"
              : "Mezi bloky"}
          </strong>
          <small>
            {stats?.vehicle
              ? (stats.speed < -0.2 ? "Zpátečka · " : "Za volantem · ") +
                Math.round(Math.abs(stats.speed) * 3.6) +
                " km/h"
              : "Všechno je kousek pěšky"}
          </small>
        </div>
      </div>
      {mode === "multi" && !connected && (
        <button
          className="reconnect primary"
          onClick={async () => {
            try {
              await connect();
            } catch (e) {
              notice(String(e));
            }
          }}
        >
          Obnovit spojení
        </button>
      )}
      <nav className="dock">
        {[
          ["events", "◷", "Akce"],
          ["map", "⌖", "Mapa"],
          ["journal", "▤", "Deník"],
          ["people", "◎", "Lidé"],
          ["chat", "☏", "Chat"],
          ["activities", "✧", "Aktivity"],
          ["settings", "⚙", "Nastavení"],
        ].map(([id, icon, label]) => (
          <button
            key={id}
            className={
              panel === id || (id === "journal" && journalOpen) ? "active" : ""
            }
            onClick={() => togglePanel(id)}
          >
            <span>{icon}</span>
            {label}
            {id === "people" && social.requests.length > 0 && (
              <b>{social.requests.length}</b>
            )}
          </button>
        ))}
      </nav>
      <div className="minimap">
        <MapView
          self={stats || undefined}
          players={
            mode === "multi" ? players.filter((p) => p.id !== selfId) : []
          }
          selected={selectedPlace}
          onPlace={(id) => chooseMapPlace(id, true)}
          onPlayer={(id) => game.current?.selectTarget({ kind: "player", id })}
        />
        <span>
          Mapa © OpenStreetMap · ODbL. Prostorová předloha © IPR Praha · CC BY ·
          2023
        </span>
      </div>
      <div
        className="controls world-keybar"
        title="Levé kliknutí vybere cíl. Tažení levým nebo pravým tlačítkem otáčí kameru, kolečko přibližuje. Esc zavře nabídku nebo uvolní myš."
      >
        <kbd>W A S D</kbd> pohyb <kbd>E</kbd> interakce <kbd>V</kbd> pohled{" "}
        <kbd>M</kbd> mapa <kbd>J</kbd> deník{" "}
        <button
          className="world-controls-button"
          onClick={() => {
            game.current?.blur();
            setJournalOpen(false);
            setEmotesOpen((open) => !open);
          }}
          aria-label="Rychlá gesta (G)"
        >
          <kbd>G</kbd> gesta
        </button>{" "}
        <span className="fps">{stats?.fps || "—"} FPS</span>
      </div>
      {stats?.hint && <div className="interaction">{stats.hint}</div>}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {(targetPlayer || targetPlace || worldSelection?.kind === "hunt") && (
        <section className="target-card" aria-label="Vybraný cíl">
          <header>
            <span
              className="target-portrait"
              style={{ background: targetPlayer?.avatar.shirt || "#5d6850" }}
              aria-hidden="true"
            >
              {targetPlayer?.nickname.slice(0, 1) || (targetPlace ? "⌖" : "✦")}
            </span>
            <div>
              <h3>
                {targetPlayer?.nickname ||
                  targetPlace?.name ||
                  "Hledací značka"}
              </h3>
              <small>
                {targetPlayer
                  ? "Virtuálně online"
                  : targetPlace
                    ? "Místo na Strahově"
                    : "Společná výzva"}
              </small>
            </div>
            <button
              aria-label="Zrušit výběr cíle"
              onClick={() => game.current?.selectTarget(null)}
            >
              ×
            </button>
          </header>
          {targetPlayer && (
            <>
              <p>
                {targetPlayer.social ? "Rád se seznámím" : "Na kopci"}
                {targetPlayer.firstTime ? " · Jdu poprvé" : ""}
                <br />
                {targetPlayer.interests.join(" · ") || "Zájmy nesdíleny"}
              </p>
              <div className="target-actions">
                {social.contacts.includes(targetPlayer.id) ? (
                  <button
                    onClick={() => {
                      setChannel("dm:" + targetPlayer.id);
                      setPanel("chat");
                    }}
                  >
                    Soukromá zpráva
                  </button>
                ) : (
                  <button
                    disabled={
                      !connected || social.blocked.includes(targetPlayer.id)
                    }
                    onClick={() => send("contact", { to: targetPlayer.id })}
                  >
                    Požádat o kontakt
                  </button>
                )}
                {social.requests.includes(targetPlayer.id) && (
                  <button
                    onClick={() =>
                      send("contact", { to: targetPlayer.id, accept: true })
                    }
                  >
                    Přijmout kontakt
                  </button>
                )}
                <button
                  onClick={() =>
                    setMuted((current) =>
                      current.includes(targetPlayer.id)
                        ? current.filter((id) => id !== targetPlayer.id)
                        : [...current, targetPlayer.id],
                    )
                  }
                >
                  {muted.includes(targetPlayer.id)
                    ? "Zrušit ztlumení"
                    : "Ztlumit"}
                </button>
                <button
                  onClick={() =>
                    send("block", {
                      to: targetPlayer.id,
                      enabled: !social.blocked.includes(targetPlayer.id),
                    })
                  }
                >
                  {social.blocked.includes(targetPlayer.id)
                    ? "Odblokovat"
                    : "Blokovat"}
                </button>
              </div>
            </>
          )}
          {targetPlace && (
            <>
              <p>{targetPlace.description}</p>
              <div className="target-actions">
                <button onClick={() => chooseMapPlace(targetPlace.id, true)}>
                  Ukázat na mapě
                </button>
                {entryForPlace(targetPlace.id) && (
                  <button
                    onClick={() =>
                      openJournal(entryForPlace(targetPlace.id)?.id)
                    }
                  >
                    Přečíst v deníku
                  </button>
                )}
              </div>
            </>
          )}
          {worldSelection?.kind === "hunt" && (
            <p>
              Přibliž se ke značce a stiskni <kbd>E</kbd>. Výběr sám úkol
              nesplní.
            </p>
          )}
        </section>
      )}
      {panel && (
        <aside
          className={"side-panel " + (panel === "map" ? "wide-panel" : "")}
        >
          <div className="panel-heading">
            <div>
              <div className="eyebrow">TVŮJ KOPEC</div>
              <h2>
                {
                  {
                    events: "Co se děje",
                    map: "Najdi svoje místo",
                    people: "Lidé na kopci",
                    chat: "Dej se do řeči",
                    activities: "Zkus něco společně",
                    avatar: "Tvoje postava",
                    settings: "Po tvém",
                  }[panel]
                }
              </h2>
            </div>
            <button
              className="close"
              aria-label="Zavřít panel"
              onClick={() => setPanel("")}
            >
              ×
            </button>
          </div>
          {panel === "events" && (
            <>
              <div className="segmented">
                {[
                  ["now", "Teď"],
                  ["today", "Dnes"],
                  ["week", "Tento týden"],
                ].map(([key, label]) => (
                  <button
                    className={period === key ? "selected" : ""}
                    onClick={() => {
                      setPeriod(key);
                      setSelected(null);
                    }}
                    key={key}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="chips">
                <button
                  className={!interest ? "chosen" : ""}
                  onClick={() => setInterest("")}
                >
                  Všechno
                </button>
                {INTERESTS.map((tag) => (
                  <button
                    key={tag}
                    className={interest === tag ? "chosen" : ""}
                    onClick={() => setInterest(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {event ? (
                <div className="event-detail">
                  <button
                    className="text-button"
                    onClick={() => setSelected(null)}
                  >
                    ← Všechny akce
                  </button>
                  <span className={"status " + eventStatus(event, now)}>
                    {STATUS[eventStatus(event, now)]}
                  </span>
                  <h2>{event.title}</h2>
                  <p>{event.description}</p>
                  <div className="event-meta">
                    ⌖ {PLACES.find((p) => p.id === event.placeId)?.name}
                    <br />◷ {time(event.startsAt)}–{time(event.endsAt)} · Praha
                  </div>
                  <p className="fiction">FIKTIVNÍ DEMONSTRAČNÍ UDÁLOST</p>
                  {mode === "multi" ? (
                    <>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={attendance(event.id)?.company || false}
                          onChange={(e) =>
                            send("attend", {
                              eventId: event.id,
                              enabled: true,
                              company: e.target.checked,
                            })
                          }
                        />{" "}
                        Hledám společnost
                      </label>
                      <button
                        className="primary full"
                        disabled={
                          !attendance(event.id) &&
                          ["ended", "cancelled"].includes(
                            eventStatus(event, now),
                          )
                        }
                        onClick={() =>
                          send("attend", {
                            eventId: event.id,
                            enabled: !attendance(event.id),
                            company: attendance(event.id)?.company || false,
                          })
                        }
                      >
                        {attendance(event.id)
                          ? "Zrušit virtuální účast"
                          : "Přidat se virtuálně"}
                      </button>
                      {attendance(event.id) && (
                        <button
                          className="secondary full"
                          onClick={() => {
                            setChannel("event:" + event.id);
                            setPanel("chat");
                          }}
                        >
                          Otevřít chat události
                        </button>
                      )}
                      <p className="small muted">
                        Virtuálně přidáno:{" "}
                        {
                          social.attendance.filter(
                            (a) => a.eventId === event.id,
                          ).length
                        }
                      </p>
                      {event.owner === selfId && (
                        <div className="inline">
                          <button
                            onClick={() => {
                              setEditing(event);
                              setShowForm(true);
                            }}
                          >
                            Upravit
                          </button>
                          <button
                            onClick={() =>
                              send("cancelEvent", { id: event.id })
                            }
                          >
                            Zrušit setkání
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="muted">
                      V samostatné prohlídce vidíš pouze ukázkové akce.
                      Společnost najdeš po vstupu do multiplayeru.
                    </p>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setPanel("map")}
                  >
                    Ukázat místo na mapě ↗
                  </button>
                </div>
              ) : (
                <div className="event-list">
                  {filtered.length === 0 && (
                    <p className="empty">
                      V tomto výběru teď nic není. Zkus jiný čas nebo zájem.
                    </p>
                  )}
                  {filtered.map((e, i) => (
                    <button
                      className="event-card"
                      key={e.id}
                      onClick={() => setSelected(e.id)}
                    >
                      <div className={"event-art art-" + (i % 3)}>
                        <span>
                          {e.tags.includes("Hudba")
                            ? "♫"
                            : e.tags.includes("Čaj")
                              ? "♧"
                              : "✧"}
                        </span>
                        <small>FIKTIVNÍ AKCE</small>
                      </div>
                      <div className="event-content">
                        <span className={"status " + eventStatus(e, now)}>
                          {STATUS[eventStatus(e, now)]}
                        </span>
                        <h3>{e.title}</h3>
                        <p>
                          {PLACES.find((p) => p.id === e.placeId)?.name}{" "}
                          <span>·</span> {time(e.startsAt)}
                        </p>
                        <div className="event-tags">
                          {e.tags.map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                          {attendance(e.id) && <span>✓ Jdu virtuálně</span>}
                        </div>
                      </div>
                      <span className="card-arrow">↗</span>
                    </button>
                  ))}
                </div>
              )}
              {mode === "multi" && (
                <button
                  className="secondary full"
                  onClick={() => {
                    setEditing(null);
                    setShowForm(true);
                  }}
                >
                  ＋ Založit vlastní demo setkání
                </button>
              )}
            </>
          )}
          {panel === "map" && (
            <>
              <p className="muted">
                Vyber místo a uvidíš jeho akce. Fialové body označují virtuálně
                připojené hráče; nejsou údajem o skutečné návštěvě.
              </p>
              <MapView
                big
                self={stats || undefined}
                players={
                  mode === "multi" ? players.filter((p) => p.id !== selfId) : []
                }
                selected={selectedPlace}
                onPlace={(id) => chooseMapPlace(id)}
                onPlayer={(id) =>
                  game.current?.selectTarget({ kind: "player", id })
                }
              />
              {destination && (
                <section
                  className="place-map-detail"
                  aria-label="Vybrané místo"
                >
                  <h3>{destination.name}</h3>
                  <p>{destination.description}</p>
                  {entryForPlace(destination.id) && (
                    <button
                      onClick={() =>
                        openJournal(entryForPlace(destination.id)?.id)
                      }
                    >
                      ▤ Přečíst v deníku
                    </button>
                  )}
                  {stats && (
                    <p>
                      ◆{" "}
                      {Math.round(
                        Math.hypot(
                          stats.x - destination.x,
                          stats.z - destination.z,
                        ),
                      )}{" "}
                      m vzdušnou čarou
                      {destination.floor != null
                        ? destination.floor < 0
                          ? " · suterén"
                          : ` · ${destination.floor}. patro / mezipatro`
                        : ""}
                    </p>
                  )}
                  {destination.source && (
                    <a
                      href={destination.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Podklad místa ↗
                    </a>
                  )}
                  <div className="place-events">
                    {events
                      .filter(
                        (e) =>
                          e.placeId === destination.id &&
                          !e.cancelled &&
                          e.endsAt > now,
                      )
                      .sort((a, b) => a.startsAt - b.startsAt)
                      .slice(0, 4)
                      .map((e) => (
                        <button
                          key={e.id}
                          onClick={() => {
                            setSelected(e.id);
                            setMapDestination(e.placeId);
                            setPanel("events");
                          }}
                        >
                          <span>{e.title}</span>
                          <span>
                            {dateKey(e.startsAt) === dateKey(now)
                              ? "Dnes"
                              : dateKey(e.startsAt)}{" "}
                            · {time(e.startsAt)} ↗
                          </span>
                        </button>
                      ))}
                    {!events.some(
                      (e) =>
                        e.placeId === destination.id &&
                        !e.cancelled &&
                        e.endsAt > now,
                    ) && (
                      <p className="muted">
                        V tomto místě není naplánovaná další ukázková akce.
                      </p>
                    )}
                  </div>
                  <button
                    className="clear-destination"
                    onClick={() => {
                      setMapDestination(null);
                      setSelected(null);
                    }}
                  >
                    Zrušit navigační cíl
                  </button>
                </section>
              )}
              <div className="places-list">
                {PLACES.map((place) => (
                  <div key={place.id}>
                    <button
                      className="place-select"
                      onClick={() => chooseMapPlace(place.id)}
                    >
                      {place.name} ↗
                    </button>
                    <p>{place.description}</p>
                    {place.source && (
                      <a href={place.source} target="_blank" rel="noreferrer">
                        Podklad / wiki ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <p className="small muted">
                © OpenStreetMap contributors · ODbL. Parkoviště: datový podklad
                © IPR Praha, CC BY 4.0. Interiéry jsou orientační model.
              </p>
            </>
          )}
          {panel === "avatar" && (
            <>
              {avatarEditor}
              <h3>Co tě baví?</h3>
              <div className="chips">
                {INTERESTS.map((tag) => (
                  <button
                    key={tag}
                    className={profile.interests.includes(tag) ? "chosen" : ""}
                    onClick={() =>
                      setProfile((p) => ({
                        ...p,
                        interests: p.interests.includes(tag)
                          ? p.interests.filter((t) => t !== tag)
                          : [...p.interests, tag],
                      }))
                    }
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={profile.social}
                  onChange={(e) =>
                    setProfile({ ...profile, social: e.target.checked })
                  }
                />{" "}
                Rád se seznámím
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={profile.firstTime}
                  onChange={(e) =>
                    setProfile({ ...profile, firstTime: e.target.checked })
                  }
                />{" "}
                Jdu poprvé
              </label>
              <h3>Tvoje odměny</h3>
              {rewards.length ? (
                rewards.map((r) => (
                  <button
                    className="reward"
                    key={r}
                    onClick={() =>
                      updateAvatar("badge", profile.avatar.badge === r ? "" : r)
                    }
                  >
                    ✧ {r} ·{" "}
                    {profile.avatar.badge === r
                      ? "Odznak nasazený"
                      : "Nasadit odznak"}
                  </button>
                ))
              ) : (
                <p className="muted">Odměny získáš za průzkum a kvíz.</p>
              )}
            </>
          )}
          {panel === "people" && (
            <>
              {mode === "guest" ? (
                <p className="empty">
                  Jsi v samostatném světě. Žádní hráči ani jejich data se sem
                  neposílají.
                </p>
              ) : (
                <>
                  <p className="muted">
                    Všichni jsou v jednom společném světě. Přezdívky nejsou
                    ověřené identity.
                  </p>
                  {social.requests.map((id) => (
                    <div className="request" key={id}>
                      <strong>
                        {players.find((p) => p.id === id)?.nickname ||
                          "Účastník"}
                      </strong>{" "}
                      žádá o soukromý kontakt.
                      <div className="inline">
                        <button
                          onClick={() =>
                            send("contact", { to: id, accept: true })
                          }
                        >
                          Přijmout
                        </button>
                        <button onClick={() => send("decline", { to: id })}>
                          Odmítnout
                        </button>
                      </div>
                    </div>
                  ))}
                  {players
                    .filter((p) => p.id !== selfId)
                    .map((p) => (
                      <div className="person" key={p.id}>
                        <div
                          className="person-icon"
                          style={{ background: p.avatar.shirt }}
                        >
                          {p.nickname.slice(0, 1)}
                        </div>
                        <div>
                          <strong>{p.nickname}</strong>
                          <p>
                            {p.social ? "Rád se seznámím" : "Na kopci"}
                            {p.firstTime ? " · Jdu poprvé" : ""}
                          </p>
                          <small>{p.interests.join(" · ")}</small>
                          <div className="person-actions">
                            {social.contacts.includes(p.id) ? (
                              <button
                                onClick={() => {
                                  setChannel("dm:" + p.id);
                                  setPanel("chat");
                                }}
                              >
                                Zpráva
                              </button>
                            ) : (
                              <button
                                disabled={social.blocked.includes(p.id)}
                                onClick={() => send("contact", { to: p.id })}
                              >
                                Požádat o kontakt
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setMuted((m) =>
                                  m.includes(p.id)
                                    ? m.filter((id) => id !== p.id)
                                    : [...m, p.id],
                                )
                              }
                            >
                              {muted.includes(p.id)
                                ? "Zrušit ztlumení"
                                : "Ztlumit"}
                            </button>
                            <button
                              onClick={() =>
                                send("block", {
                                  to: p.id,
                                  enabled: !social.blocked.includes(p.id),
                                })
                              }
                            >
                              {social.blocked.includes(p.id)
                                ? "Odblokovat"
                                : "Blokovat"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  {players.length < 2 && (
                    <p className="empty">
                      Zatím jsi tu sám. Otevři demo ve druhém prohlížeči a
                      potkáte se.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {panel === "chat" && (
            <>
              {mode === "guest" ? (
                <p className="empty">
                  Samostatná prohlídka není připojená k žádnému multiplayerovému
                  chatu.
                </p>
              ) : (
                <>
                  <select
                    aria-label="Chatový kanál"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  >
                    <option value="global">Celý Strahov</option>
                    <option value="local">V okolí · do 40 m</option>
                    {events
                      .filter((e) => attendance(e.id))
                      .map((e) => (
                        <option key={e.id} value={"event:" + e.id}>
                          Akce: {e.title}
                        </option>
                      ))}
                    {social.contacts.map((id) => (
                      <option key={id} value={"dm:" + id}>
                        Soukromě:{" "}
                        {players.find((p) => p.id === id)?.nickname ||
                          "Odpojený kontakt"}
                      </option>
                    ))}
                  </select>
                  <p className="small muted">
                    Místní chat sdílí pouze stejné patro / venkovní prostor.
                    Soukromé zprávy vyžadují přijatý kontakt.
                  </p>
                  <div className="chat-log">
                    {messages
                      .filter((m) => {
                        if (
                          muted.includes(m.sender) ||
                          social.blocked.includes(m.sender)
                        )
                          return false;
                        if (channel.startsWith("dm:"))
                          return (
                            (m.sender === channel.slice(3) &&
                              m.channel === "dm:" + selfId) ||
                            (m.sender === selfId && m.channel === channel)
                          );
                        return m.channel === channel;
                      })
                      .map((m) => (
                        <div
                          key={m.id}
                          className={
                            m.sender === selfId
                              ? "chat-message own"
                              : "chat-message"
                          }
                        >
                          <strong>{m.nickname}</strong>
                          <small>{time(m.at)}</small>
                          <p>{m.text}</p>
                        </div>
                      ))}
                    <div ref={chatEnd} />
                  </div>
                  <form
                    className="chat-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (message.trim()) {
                        send("chat", { channel, text: message });
                        setMessage("");
                      }
                    }}
                  >
                    <input
                      aria-label="Zpráva"
                      placeholder="Napiš něco…"
                      maxLength={500}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <button className="primary" disabled={!connected}>
                      ↗
                    </button>
                  </form>
                </>
              )}
            </>
          )}
          {panel === "activities" && (
            <>
              <div className="activity-card">
                <div className="activity-symbol">⌖</div>
                <h3>Pět zastávek na kopci</h3>
                <p>
                  Prozkoumej areál a najdi pět limetkových značek. U každé
                  stiskni E. V multiplayeru postup sdílíte.
                </p>
                <div className="progress">
                  <i
                    style={{
                      width:
                        ((mode === "multi"
                          ? activity.hunt.length
                          : game.current?.found.size || 0) /
                          HUNT_POINTS.length) *
                          100 +
                        "%",
                    }}
                  />
                </div>
                <strong>
                  {mode === "multi"
                    ? activity.hunt.length
                    : game.current?.found.size || 0}{" "}
                  / {HUNT_POINTS.length} nalezeno
                </strong>
              </div>
              <div className="activity-card">
                <div className="activity-symbol">?</div>
                <h3>Strahovský týmový kvíz</h3>
                {mode === "multi" ? (
                  <>
                    {activity.quiz.running ? (
                      <>
                        <button
                          className="secondary full"
                          onClick={() => {
                            setAnswerSent(-1);
                            send("quizStart", team);
                          }}
                        >
                          Přidat se do týmu{" "}
                          {team === "lime" ? "Limeta" : "Fialová"}
                        </button>
                        <p>{QUIZ[activity.quiz.question]?.question}</p>
                        <span className="status live">
                          Zbývá{" "}
                          {Math.max(
                            0,
                            Math.ceil((activity.quiz.deadline - now) / 1000),
                          )}{" "}
                          s
                        </span>
                        <div className="answers">
                          {QUIZ[activity.quiz.question]?.answers.map((a, i) => (
                            <button
                              disabled={answerSent === activity.quiz.question}
                              onClick={() => {
                                send("quizAnswer", i);
                                setAnswerSent(activity.quiz.question);
                              }}
                              key={a}
                            >
                              {a}
                            </button>
                          ))}
                        </div>
                        <p>
                          Limeta {activity.quiz.teamScores.lime || 0} :{" "}
                          {activity.quiz.teamScores.purple || 0} Fialová
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          Tři otázky, dvě party a společný kopec. Vyber tým a
                          zahaj kvíz.
                        </p>
                        <select
                          value={team}
                          onChange={(e) => setTeam(e.target.value)}
                        >
                          <option value="lime">Tým Limeta</option>
                          <option value="purple">Tým Fialová</option>
                        </select>
                        <button
                          className="primary full"
                          onClick={() => {
                            setAnswerSent(-1);
                            send("quizStart", team);
                          }}
                        >
                          Spustit / připojit se ke kvízu
                        </button>
                        {Object.keys(activity.quiz.scores).length > 0 && (
                          <p>
                            Poslední skóre: {activity.quiz.teamScores.lime || 0}{" "}
                            : {activity.quiz.teamScores.purple || 0}
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p>
                    Týmový kvíz patří do multiplayeru. Sólo můžeš objevovat
                    značky a doručit balíček ke vstupu B6.
                  </p>
                )}
              </div>
              <h3>Dej o sobě vědět</h3>
              <div className="emotes">
                {EMOTES.map(({ emoji: emote, label }) => (
                  <button
                    key={emote}
                    aria-label={label}
                    onClick={() => playEmote(emote)}
                  >
                    {emote}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "settings" && (
            <>
              <label>
                Kvalita vykreslování
                <select
                  value={quality}
                  onChange={(e) => {
                    if (!isRenderQualityMode(e.target.value)) return;
                    setQuality(e.target.value);
                    game.current?.setQuality(e.target.value);
                  }}
                >
                  <option value="auto">Automaticky · podle výkonu</option>
                  <option value="low">Úsporná · běžný notebook</option>
                  <option value="medium">Střední detail</option>
                  <option value="high">Vyšší detail a rozlišení</option>
                </select>
              </label>
              <label>
                Cíl snímkové frekvence
                <select
                  value={targetFps}
                  disabled={quality !== "auto"}
                  onChange={(e) => {
                    const fps = Number(e.target.value);
                    if (!isRenderTargetFps(fps)) return;
                    setTargetFps(fps);
                    game.current?.setTargetFps(fps);
                  }}
                >
                  <option value={60}>60 FPS</option>
                  <option value={120}>120 FPS</option>
                  <option value={144}>144 FPS</option>
                </select>
              </label>
              <p className="small muted">
                Cíl řídí automatickou kvalitu. Snímkování není omezené na 60
                FPS; vyšší frekvence potřebuje odpovídající monitor a prohlížeč.
              </p>
              {stats?.rendering && (
                <p className="small muted" data-rendering-status>
                  Aktuálně {qualityLabel[stats.rendering.quality]} · render{" "}
                  {Math.round(stats.rendering.renderScale * 100)} %.
                  {stats.rendering.presentationHz
                    ? ` Zjištěný rytmus prohlížeče přibližně ${Math.round(stats.rendering.presentationHz)} Hz.`
                    : ""}
                </p>
              )}
              {stats?.gpu && (
                <details>
                  <summary>Použitá grafická karta a detail okolí</summary>
                  <p>{stats.gpu.classificationLabel}</p>
                  <p
                    className="small"
                    data-gpu-renderer
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {stats.gpu.renderer}
                  </p>
                  {stats.gpu.warnings.map((w) => (
                    <p className="small muted" key={w}>
                      {w}
                    </p>
                  ))}
                  <p className="small muted">
                    Blízké okolí má vyšší detail, vzdálené budovy a postavy
                    úspornější model. Všichni připojení zůstávají ve společném
                    světě.
                  </p>
                  <p className="small">
                    <a
                      href={GPU_SETTINGS_HELP_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Výkonnější GPU ve Windows ↗
                    </a>{" "}
                    ·{" "}
                    <a
                      href={DISPLAY_REFRESH_HELP_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Frekvence monitoru ↗
                    </a>
                  </p>
                </details>
              )}
              <BenchmarkControls
                game={game.current}
                result={benchmark}
                localCollector={localCollector}
                saveNotice={benchmarkSaveNotice}
                onUserStart={() => {
                  userBenchmark.current = true;
                  setBenchmarkSaveNotice("");
                }}
              />
              <label>
                Náhled osvětlení
                <select
                  value={lighting}
                  onChange={(e) => {
                    setLighting(e.target.value);
                    if (game.current)
                      game.current.timeOverride = previewInstant(
                        e.target.value,
                      );
                  }}
                >
                  <option value="real">Skutečný čas na Strahově</option>
                  <option value="day">Denní náhled · demo</option>
                  <option value="night">Noční náhled · demo</option>
                </select>
              </label>
              {lighting !== "real" && (
                <p className="fiction">
                  NÁHLED OSVĚTLENÍ · skutečný čas je dočasně nahrazený.
                </p>
              )}
              <div className="stat-grid">
                <div>
                  <strong>{stats?.fps || "—"}</strong>
                  <span>FPS</span>
                </div>
                <div>
                  <strong>
                    {stats?.triangles.toLocaleString("cs-CZ") || "—"}
                  </strong>
                  <span>trojúhelníků včetně stínů</span>
                </div>
              </div>
              <h3>Počasí na Strahově</h3>
              <p>{weather?.source || "Zdroj se načítá"}</p>
              <p>
                {weatherLabel} · vítr {weather?.wind.toFixed(1) || "—"} m/s ·
                déšť {weather?.rain || 0} mm/h
              </p>
              <p className="small muted">
                {weather?.observedAt
                  ? "Čas dat: " +
                    new Intl.DateTimeFormat("cs-CZ", {
                      timeZone: "Europe/Prague",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(weather.observedAt)
                  : "Žádné platné měření."}
                <br />
                {weather?.cloudSource}
                <br />
                Denní a noční světlo odpovídá skutečné poloze Slunce nad
                Strahovem.
              </p>
              <p className="small muted">
                Vítr přichází z {Math.round(weather?.windDirection ?? 0)}°;
                mraky používají modelové proudění ve výšce.{" "}
                {weather?.cloudWindSource}
              </p>
              <a
                href="https://weather.sh.cvut.cz/weather/"
                target="_blank"
                rel="noreferrer"
              >
                Meteostanice Silicon Hill ↗
              </a>
              <p className="small muted">
                Doplňková oblačnost / záložní počasí:{" "}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open-Meteo
                </a>
                , CC BY 4.0.
              </p>
              <h3>Autobusy u kolejí</h3>
              <p className="small muted">
                {transitStatus(now).label}. Počet cestujících a okolní provoz
                jsou simulované.
              </p>
              {nextArrivals(now, 4).map((arrival) => (
                <p
                  className="small"
                  key={arrival.at + arrival.sourceTripId + arrival.stopId}
                >
                  <strong>{arrival.route}</strong> · {time(arrival.at)} ·{" "}
                  {arrival.headsign}
                </p>
              ))}
              <a
                href="https://pid.cz/o-systemu/opendata/"
                target="_blank"
                rel="noreferrer"
              >
                Jízdní řád PID · zdroj dat ↗
              </a>
              {mode === "guest" && (
                <button
                  className="primary"
                  onClick={() => {
                    const arrival = game.current?.previewTransit();
                    if (arrival) {
                      setTrafficPreview(arrival);
                      setPanel("");
                    }
                  }}
                >
                  Ukázka příjezdu a cestujících
                </button>
              )}
              {trafficPreview && (
                <>
                  <p className="fiction">
                    UKÁZKA DOPRAVY · {time(trafficPreview.at)}, linka{" "}
                    {trafficPreview.route}. Herní NPC představují fiktivní
                    cestující.
                  </p>
                  <button
                    onClick={() => {
                      if (game.current) game.current.trafficPreview = undefined;
                      setTrafficPreview(null);
                    }}
                  >
                    Vrátit dopravu na skutečný čas
                  </button>
                </>
              )}
              <h3>Ovládání</h3>
              <p className="small muted">
                W / S vpřed a vzad · A / D chůze doleva a doprava podle kamery,
                v autě zatáčení · tažení levým nebo pravým tlačítkem otáčí
                kameru · krátké levé kliknutí vybere postavu nebo značku ·
                kolečko přiblíží pohled · Shift běh · mezerník skok / ruční
                brzda · E interakce · V pohled · R návrat · M mapa · J deník · G
                gesta (1–4) · Esc zavře nabídku nebo zruší výběr. V první osobě
                klikni do hry pro rozhlížení, Esc uvolní kurzor.
              </p>
              <p className="small muted">
                V autě W přidává plyn, S nejdřív brzdí a po zastavení couvá. A/D
                zatáčí volantem nezávisle na pohledu myši. Mezerník brzdí zadní
                kola. E vystoupí až po zastavení na bezpečném místě. Tažením
                myši se rozhlédneš; při stání zůstane pohled natočený, za jízdy
                se po chvíli vrátí. V přepíná tři vzdálenosti vnější kamery
                auta.
              </p>
              <p className="small muted">
                Mapový podklad © OpenStreetMap contributors, ODbL. Polohy korun
                podle ortofota: datový podklad © IPR Praha, 2024, CC BY 4.0.
                Měsíc: NASA SVS / LROC / Arizona State University. Model
                autobusu: Innerscene, CC0.
              </p>
              <button
                className="secondary full"
                onClick={() => {
                  if (mode === "multi") send("respawn");
                  else {
                    game.current?.actor.setVehicle(false);
                    game.current?.actor.setPosition(SPAWN);
                  }
                }}
              >
                Vrátit se na start
              </button>
              <button className="text-button" onClick={leave}>
                Opustit demo
              </button>
            </>
          )}
        </aside>
      )}
      {showForm && (
        <EventForm
          event={editing}
          onClose={() => setShowForm(false)}
          onSave={(data) => {
            send("saveEvent", data);
            setShowForm(false);
          }}
        />
      )}
      <Journal
        open={journalOpen}
        initialEntryId={journalEntryId}
        onClose={() => setJournalOpen(false)}
        onPlace={(id) => {
          setJournalOpen(false);
          chooseMapPlace(id, true);
        }}
      />
      <EmoteMenu
        open={emotesOpen}
        onClose={() => setEmotesOpen(false)}
        onChoose={playEmote}
      />
    </main>
  );
}
function BenchmarkControls({
  game,
  result,
  localCollector,
  saveNotice,
  onUserStart,
}: {
  game: Game | null;
  result: Benchmark | null;
  localCollector: boolean;
  saveNotice: string;
  onUserStart: () => void;
}) {
  const [running, setRunning] = useState(false);
  const resultJSON = useMemo(
    () => (result ? JSON.stringify(result, null, 2) : ""),
    [result],
  );
  const active = running || !!game?.benchmark;
  useEffect(() => setRunning(false), [result]);
  return (
    <div className="benchmark">
      <button
        className="secondary full"
        disabled={!game?.ready || active}
        onClick={() => {
          onUserStart();
          game?.startBenchmark();
          setRunning(true);
        }}
      >
        {active ? "Měřím 10 sekund…" : "Změřit FPS po dobu 10 sekund"}
      </button>
      <p className="small muted">Během měření se automatická kvalita nemění.</p>
      {localCollector && (
        <p className="small muted">
          Výsledek se uloží pouze na tomto počítači.
        </p>
      )}
      {saveNotice && (
        <p className="small muted" role="status">
          {saveNotice}
        </p>
      )}
      {result && (
        <>
          {(result.renderErrorCount > 0 || result.assetLoadErrorCount > 0) && (
            <p role="alert">
              Měření je neplatné: prostředí obsahuje chybu vykreslování nebo
              načtení modelů. Obnov stránku před dalším měřením.
            </p>
          )}
          <p>
            <strong>{result.averageFps} FPS</strong> · {result.avatars} avatarů
            · p95 {result.p95FrameMs.toFixed(1)} ms
          </p>
          <p className="small muted">
            Rozlišení {result.viewport.width} × {result.viewport.height}; render{" "}
            {result.renderResolution.width} × {result.renderResolution.height}.
            Tento výsledek platí jen pro uvedený adaptér a scénu.
          </p>
          <details>
            <summary>Podrobnosti měření</summary>
            <pre id="benchmark-result">{resultJSON}</pre>
          </details>
        </>
      )}
    </div>
  );
}
function EventForm({
  event,
  onClose,
  onSave,
}: {
  event: EventItem | null;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [title, setTitle] = useState(event?.title || ""),
    [description, setDescription] = useState(event?.description || ""),
    [placeId, setPlaceId] = useState(event?.placeId || "club6"),
    [minutes, setMinutes] = useState(
      event
        ? Math.max(0, Math.round((event.startsAt - Date.now()) / 60000))
        : 30,
    ),
    [duration, setDuration] = useState(
      event ? Math.round((event.endsAt - event.startsAt) / 60000) : 60,
    );
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            id: event?.id,
            title,
            description,
            placeId,
            startsAt: Date.now() + minutes * 60000,
            endsAt: Date.now() + (minutes + duration) * 60000,
          });
        }}
      >
        <div className="panel-heading">
          <h2>{event ? "Upravit setkání" : "Potkáme se na kopci?"}</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="fiction">FIKTIVNÍ DEMONSTRAČNÍ SETKÁNÍ</p>
        <label>
          Název
          <input
            required
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Popis
          <textarea
            maxLength={600}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Místo
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            {PLACES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="inline">
          <label>
            Za kolik minut
            <input
              type="number"
              min="0"
              max="10080"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <label>
            Délka (minuty)
            <input
              type="number"
              min="5"
              max="1440"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
        </div>
        <button className="primary full">
          {event ? "Uložit změny" : "Založit setkání"}
        </button>
        <p className="small muted">
          Setkání vlastní tvoje dočasná relace. Po restartu serveru demonstrační
          setkání zaniknou.
        </p>
      </form>
    </div>
  );
}
