import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FeedbackDialog } from "../../../client/feedback";
import { IndexedDBFeedbackStorage } from "../../../client/feedback-outbox";
import { getLocale, setLocale, useLocale } from "../../../client/i18n";
import { capture, fixtureContext } from "./capture";

async function localEvidence() {
  const storage = new IndexedDBFeedbackStorage();
  try {
    const entries = await storage.list();
    return await Promise.all(
      entries.map(async (entry) => ({
        report: entry.report,
        attempts: entry.attempts,
        error: entry.error,
        imageType: entry.image?.type,
        imageBytes: entry.image?.size ?? 0,
        imageBase64: entry.image
          ? btoa(
              String.fromCharCode(
                ...new Uint8Array(await entry.image.arrayBuffer()),
              ),
            )
          : null,
      })),
    );
  } finally {
    storage.close();
  }
}

function Fixture() {
  const [open, setOpen] = useState(false),
    [evidence, setEvidence] = useState("Loading native IndexedDB…");
  const [server, setServer] = useState("No server evidence yet"),
    [network, setNetwork] = useState(navigator.onLine);
  const locale = useLocale();
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const local = await localEvidence().catch((error: unknown) => ({
        error: String(error),
      }));
      if (alive) {
        setEvidence(JSON.stringify(local, null, 2));
        setNetwork(navigator.onLine);
      }
      const remote = await fetch("/fixture/results", { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ offline: true }));
      if (alive) setServer(JSON.stringify(remote, null, 2));
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 500);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F8") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const control = async (mode: "accept" | "hold") => {
    await fetch("/fixture/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
  };
  return (
    <main>
      <h1>Feedback browser regression fixture</h1>
      <p>
        This isolated page renders the production FeedbackDialog and uses native
        IndexedDB. Its 1×1 PNG is a test asset. The loopback receiver is a
        receipt fixture, not Linear or the production feedback server.
      </p>
      <div className="fixture-controls">
        <button type="button" onClick={() => setOpen(true)}>
          Open feedback
        </button>
        <button type="button" onClick={() => setLocale("cs")}>
          Čeština
        </button>
        <button type="button" onClick={() => setLocale("en")}>
          English
        </button>
        <button type="button" onClick={() => void control("hold")}>
          Hold receipts (503)
        </button>
        <button type="button" onClick={() => void control("accept")}>
          Accept receipts
        </button>
        <button type="button" onClick={() => location.reload()}>
          Reload fixture
        </button>
      </div>
      <p>
        Locale: <strong>{locale}</strong> · Browser network:{" "}
        <strong>{network ? "online" : "offline"}</strong>. Open by mouse, Enter
        or F8. Escape must return focus. To inspect a manual retry: hold
        receipts, submit through the form, close and reload this page, then
        accept receipts. Real offline mode is exercised by the automated
        Chromium run.
      </p>
      <h2>Native IndexedDB pending reports</h2>
      <pre id="local-evidence">{evidence}</pre>
      <h2>Receiver evidence (exact metadata and image bytes)</h2>
      <pre id="server-evidence">{server}</pre>
      <FeedbackDialog
        open={open}
        onClose={() => setOpen(false)}
        getContext={() => fixtureContext(getLocale())}
        capture={capture}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
