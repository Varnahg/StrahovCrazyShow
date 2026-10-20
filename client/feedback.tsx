import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale, type Locale } from "./i18n";
import { useDialogFocus } from "./use-dialog-focus";
import {
  FeedbackOutbox,
  FeedbackOutboxError,
  type FeedbackPending,
} from "./feedback-outbox";
import {
  FEEDBACK_LIMITS,
  FEEDBACK_VERSION,
  validateFeedbackReport,
  type FeedbackCapture,
  type FeedbackContext,
  type FeedbackKind,
  type FeedbackReport,
} from "../shared/feedback";
import "./feedback.css";

const copy = {
  cs: {
    title: "Zpětná vazba",
    close: "Zavřít",
    privacy:
      "Odešle se tvůj popis, přiložený snímek hry bez rozhraní a technické údaje. Nové hlášení odešleš až tlačítkem Odeslat. Dříve odeslaná čekající hlášení zkoušíme doručit automaticky.",
    kind: "Co nám chceš sdělit?",
    bug: "Chyba",
    idea: "Nápad",
    other: "Ostatní",
    message: "Popis",
    placeholder: "Co se stalo nebo co bys chtěl/a změnit?",
    required: "Povinné",
    details: "Doplnit podrobnosti (nepovinné)",
    expected: "Co jsi očekával/a?",
    steps: "Jak se to dá zopakovat?",
    contact: "E-mail pro případné doplnění (nepovinný)",
    contactHint:
      "Kontakt slouží jen pro doplňující otázky. Odpověď ani opravu nemůžeme slíbit.",
    photo: "Snímek hry",
    preparing: "Připravuji snímek… můžeš už psát.",
    remove: "Odebrat snímek",
    omit: "Pokračovat bez snímku",
    preview: "Automaticky přiložený snímek hry bez rozhraní",
    removed: "Snímek byl odebrán.",
    unavailable: "Snímek se nepodařilo pořídit. Popis můžeš odeslat i bez něj.",
    noGame: "Hra ještě není připravená pro pořízení snímku.",
    timeout: "Pořízení snímku trvalo příliš dlouho.",
    engine: "Herní obraz se právě změnil. Snímek není k dispozici.",
    image: "Připravený snímek není možné přiložit.",
    technical: "Jaké technické údaje přiložíme?",
    technicalText:
      "Verzi hry, režim, jazyk a údaje o vykreslení. U chyby také krátký technický záznam. Pokud je snímek dostupný, obsahuje polohu a pohled kamery stejného okamžiku. Chat, hesla ani profily ostatních hráčů nepřikládáme.",
    send: "Odeslat",
    sending: "Odesílám…",
    cancel: "Zrušit",
    done: "Hotovo",
    accepted: "Přijato. Děkujeme za zpětnou vazbu.",
    earlierAccepted: "Dříve odeslané hlášení bylo přijato.",
    queued:
      "Čeká na odeslání. Hlášení je uložené v tomto prohlížeči; jeho stav a další možnosti najdeš níže.",
    waiting: "Čekající hlášení",
    queueHint:
      "Automaticky zkoušíme odeslání nejvýše 7 dní. Se zavřeným prohlížečem se neodesílá. Místní úložiště může prohlížeč vymazat.",
    retry: "Zkusit znovu",
    delete: "Odstranit",
    export: "Uložit popis",
    exportImage: "Uložit snímek",
    expired:
      "Hlášení je starší než 7 dní a už se automaticky neodesílá. Ulož si je nebo je odstraň.",
    rejected:
      "Server hlášení odmítl. Zkus to ručně později nebo si hlášení ulož a odstraň.",
    tooLarge:
      "Příloha je příliš velká. Ulož si hlášení a odešli nový popis bez snímku.",
    retryLimit:
      "Automatické pokusy se nezdařily. Hlášení zůstává uložené; můžeš odeslání zkusit znovu.",
    storage:
      "Místní úložiště hlášení není dostupné. Text ve formuláři si zkopíruj a zkus to znovu. Doručení máš potvrzené, až když se zobrazí Přijato.",
    full: "Úložiště čekajících hlášení je plné. Nejdřív vyřeš nebo odstraň některé z nich. Text ve formuláři zůstává.",
    invalid:
      "Zkontroluj popis, e-mail a přílohu. Hlášení zatím nebylo odesláno.",
    sendFailed: "Odeslání se nepodařilo dokončit. Text zůstává ve formuláři.",
  },
  en: {
    title: "Feedback",
    close: "Close",
    privacy:
      "We will send your description, the attached game image without the interface, and technical details. A new report is sent only when you choose Send. Previously submitted pending reports are retried automatically.",
    kind: "What would you like to share?",
    bug: "Bug",
    idea: "Idea",
    other: "Other",
    message: "Description",
    placeholder: "What happened, or what would you like to change?",
    required: "Required",
    details: "Add details (optional)",
    expected: "What did you expect?",
    steps: "How can we reproduce it?",
    contact: "Email for follow-up questions (optional)",
    contactHint:
      "Your email is only for follow-up questions. We cannot promise a reply or a fix.",
    photo: "Game image",
    preparing: "Preparing the image… you can start writing.",
    remove: "Remove image",
    omit: "Continue without an image",
    preview: "Automatically attached game image without the interface",
    removed: "The image was removed.",
    unavailable:
      "We could not capture the image. You can still send your description.",
    noGame: "The game is not ready to capture an image yet.",
    timeout: "Capturing the image took too long.",
    engine: "The game view changed. An image is not available.",
    image: "The captured image cannot be attached.",
    technical: "Which technical details are included?",
    technicalText:
      "The game version, mode, language and rendering details. Bug reports also include a short technical record. When an image is available, it includes the position and camera view from that frame. We do not attach chat, passwords or other players’ profiles.",
    send: "Send",
    sending: "Sending…",
    cancel: "Cancel",
    done: "Done",
    accepted: "Received. Thank you for your feedback.",
    earlierAccepted: "Your earlier report was received.",
    queued:
      "Waiting to send. Your report is saved in this browser; see its status and available actions below.",
    waiting: "Pending reports",
    queueHint:
      "Automatic attempts stop after 7 days. Reports cannot be sent with the browser closed. Your browser may clear its local storage.",
    retry: "Try again",
    delete: "Remove",
    export: "Save description",
    exportImage: "Save image",
    expired:
      "This report is over 7 days old and will no longer send automatically. Save it or remove it.",
    rejected:
      "The server rejected this report. Try again manually later, or save and remove it.",
    tooLarge:
      "The attachment is too large. Save this report and send a new description without the image.",
    retryLimit:
      "Automatic attempts failed. The report is still saved; you can try sending it again.",
    storage:
      "Local report storage is unavailable. Copy any text in the form and try again. Delivery is confirmed only when you see Received.",
    full: "The pending report storage is full. Send or remove an earlier report first. Your text is still in the form.",
    invalid:
      "Check the description, email and attachment. The report has not been sent.",
    sendFailed: "We could not finish sending. Your text is still in the form.",
  },
} as const;

type CaptureState =
  | { capture: FeedbackCapture; image: Blob | null }
  | { capture: { state: "pending" }; image: null };
export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
  getContext: () => FeedbackContext;
  capture: (
    signal: AbortSignal,
  ) => Promise<{ capture: FeedbackCapture; image: Blob | null }>;
}

function captureReason(reason: string | undefined, locale: Locale) {
  const c = copy[locale];
  if (reason?.includes("timeout")) return c.timeout;
  if (reason && /not-ready|no-game|no-frame|no-view|startup/.test(reason))
    return c.noGame;
  if (reason && /engine|generation|disposed|cancelled|device/.test(reason))
    return c.engine;
  if (reason && /mime|image|size|encod|taint/.test(reason)) return c.image;
  return c.unavailable;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Download navigation consumes the object URL after the click task.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function FeedbackDialog({
  open,
  onClose,
  getContext,
  capture,
}: FeedbackDialogProps) {
  const locale = useLocale(),
    c = copy[locale];
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    description = useRef<HTMLTextAreaElement>(null);
  const callbacks = useRef({ getContext, capture });
  callbacks.current = { getContext, capture };
  const outbox = useRef<FeedbackOutbox | null>(null);
  const captureAbort = useRef<AbortController | null>(null),
    generation = useRef(0);
  const envelope = useRef<{
    id: string;
    createdAtUTC: string;
    context: FeedbackContext;
  } | null>(null);
  const submitting = useRef(false);
  const [kind, setKind] = useState<FeedbackKind>("bug"),
    [message, setMessage] = useState("");
  const [expected, setExpected] = useState(""),
    [steps, setSteps] = useState(""),
    [contact, setContact] = useState("");
  const [photo, setPhoto] = useState<CaptureState>({
    capture: { state: "pending" },
    image: null,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [earlierAccepted, setEarlierAccepted] = useState(false);
  const [pending, setPending] = useState<FeedbackPending[]>([]);
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<"accepted" | "queued" | null>(null);
  const [error, setError] = useState<
    "storage" | "full" | "invalid" | "sendFailed" | null
  >(null);
  const [queueBusy, setQueueBusy] = useState<string | null>(null);

  useEffect(() => {
    const box = new FeedbackOutbox();
    outbox.current = box;
    let alive = true;
    const refresh = (accepted?: { id: string }) => {
      if (accepted && accepted.id !== envelope.current?.id && alive)
        setEarlierAccepted(true);
      if (accepted?.id === envelope.current?.id && alive) {
        setResult("accepted");
        setMessage("");
        setExpected("");
        setSteps("");
        setContact("");
      }
      void box.list().then(
        (entries) => {
          if (alive) setPending(entries);
        },
        () => {
          if (alive) setError("storage");
        },
      );
    };
    const unsubscribe = box.subscribe(refresh);
    refresh();
    void box.start().catch(() => {
      if (alive) setError("storage");
    });
    return () => {
      alive = false;
      unsubscribe();
      box.dispose();
      outbox.current = null;
    };
  }, []);

  const nativeDialog =
    typeof HTMLDialogElement !== "undefined" &&
    typeof HTMLDialogElement.prototype.showModal === "function";
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    if (!nativeDialog) {
      element.setAttribute("open", "");
      return () => element.removeAttribute("open");
    }
    // Capture the trigger before showModal moves focus. Native dialog owns
    // inertness/Tab/Escape; a second document-level trap would fight its focus.
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    description.current?.focus();
    return () => {
      element.close();
      // React can remove the node before passive cleanup, so restore explicitly.
      if (previous?.isConnected) previous.focus();
    };
  }, [open, nativeDialog]);
  useDialogFocus(open && !nativeDialog, dialog, onClose, description);

  useEffect(() => {
    if (!open) {
      setPhoto({ capture: { state: "removed" }, image: null });
      return;
    }
    const current = ++generation.current;
    const controller = new AbortController();
    captureAbort.current = controller;
    setResult(null);
    setError(null);
    setPhoto({ capture: { state: "pending" }, image: null });
    envelope.current = {
      id: crypto.randomUUID(),
      createdAtUTC: new Date().toISOString(),
      context: callbacks.current.getContext(),
    };
    void outbox.current?.flush().catch(() => {
      if (!controller.signal.aborted) setError("storage");
    });
    const timeout = setTimeout(() => {
      if (controller.signal.aborted || current !== generation.current) return;
      controller.abort();
      setPhoto({
        capture: { state: "unavailable", reason: "capture-timeout" },
        image: null,
      });
    }, 6_000);
    // Capture invocation is deferred so a synchronous adapter failure follows the same safe path.
    void Promise.resolve()
      .then(() => callbacks.current.capture(controller.signal))
      .then(
        (value) => {
          clearTimeout(timeout);
          if (controller.signal.aborted || current !== generation.current)
            return;
          const cap = value.capture;
          if (
            cap.state === "ready" &&
            (!value.image ||
              value.image.size === 0 ||
              value.image.size > FEEDBACK_LIMITS.imageBytes ||
              value.image.type !== cap.mimeType)
          ) {
            setPhoto({
              capture: { state: "unavailable", reason: "invalid-image" },
              image: null,
            });
          } else
            setPhoto({
              capture: cap,
              image: cap.state === "ready" ? value.image : null,
            });
        },
        () => {
          clearTimeout(timeout);
          if (!controller.signal.aborted && current === generation.current)
            setPhoto({
              capture: { state: "unavailable", reason: "capture-failed" },
              image: null,
            });
        },
      );
    return () => {
      clearTimeout(timeout);
      controller.abort();
      ++generation.current;
      captureAbort.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !photo.image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo.image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.image, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitting.current ||
      result ||
      photo.capture.state === "pending" ||
      !envelope.current ||
      !outbox.current
    )
      return;
    const draft = envelope.current;
    const context = {
      ...draft.context,
      locale,
      events: kind === "bug" ? draft.context.events : undefined,
    };
    const report: FeedbackReport = {
      version: FEEDBACK_VERSION,
      ...draft,
      context,
      kind,
      message,
      ...(kind === "bug" ? { expected, steps } : {}),
      contact,
      capture: photo.capture,
    };
    const checked = validateFeedbackReport(report);
    if (!checked.ok) {
      setError("invalid");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    const current = generation.current;
    try {
      const submitted = await outbox.current.enqueue(
        checked.report,
        photo.image,
      );
      if (current === generation.current) {
        setResult(submitted.state);
        if (submitted.state === "accepted") {
          setMessage("");
          setExpected("");
          setSteps("");
          setContact("");
        }
        // Release draft bytes once the persistent queue or server owns the report.
        setPhoto({ capture: { state: "removed" }, image: null });
      }
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof FeedbackOutboxError && failure.code !== "disposed"
            ? failure.code
            : "sendFailed",
        );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function queueAction(
    entry: FeedbackPending,
    action: "retry" | "remove",
  ) {
    const box = outbox.current;
    if (!box || queueBusy) return;
    setQueueBusy(entry.report.id);
    try {
      await box[action](entry.report.id);
    } catch {
      setError("storage");
    } finally {
      setQueueBusy(null);
    }
  }

  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      className="feedback-dialog"
      aria-labelledby={id + "-title"}
      aria-describedby={id + "-privacy"}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <header className="feedback-heading">
        <h2 id={id + "-title"}>{c.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={c.close}
          className="feedback-close"
        >
          ×
        </button>
      </header>
      <p id={id + "-privacy"} className="feedback-muted">
        {c.privacy}
      </p>
      {earlierAccepted && <p role="status">{c.earlierAccepted}</p>}
      {result ? (
        <div className="feedback-result" role="status">
          <p>{c[result]}</p>
          <button type="button" onClick={onClose}>
            {c.done}
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="feedback-fields">
            <legend>{c.kind}</legend>
            <div className="feedback-kinds">
              {(["bug", "idea", "other"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={id + "-kind"}
                    checked={kind === value}
                    onChange={() => setKind(value)}
                  />
                  {c[value]}
                </label>
              ))}
            </div>
            <label htmlFor={id + "-message"}>
              {c.message} <span className="feedback-muted">· {c.required}</span>
            </label>
            <textarea
              ref={description}
              autoFocus
              id={id + "-message"}
              required
              maxLength={FEEDBACK_LIMITS.message}
              rows={4}
              placeholder={c.placeholder}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            {kind === "bug" && (
              <details>
                <summary>{c.details}</summary>
                <div className="feedback-details">
                  <label htmlFor={id + "-expected"}>{c.expected}</label>
                  <textarea
                    id={id + "-expected"}
                    maxLength={FEEDBACK_LIMITS.expected}
                    rows={2}
                    value={expected}
                    onChange={(event) => setExpected(event.target.value)}
                  />
                  <label htmlFor={id + "-steps"}>{c.steps}</label>
                  <textarea
                    id={id + "-steps"}
                    maxLength={FEEDBACK_LIMITS.steps}
                    rows={2}
                    value={steps}
                    onChange={(event) => setSteps(event.target.value)}
                  />
                </div>
              </details>
            )}
            <section className="feedback-photo" aria-label={c.photo}>
              <strong>{c.photo}</strong>
              <div role="status">
                {photo.capture.state === "pending"
                  ? c.preparing
                  : photo.capture.state === "unavailable"
                    ? captureReason(photo.capture.reason, locale)
                    : photo.capture.state === "removed"
                      ? c.removed
                      : null}
              </div>
              {preview && <img src={preview} alt={c.preview} />}
              {(photo.capture.state === "ready" ||
                photo.capture.state === "pending") && (
                <button
                  type="button"
                  onClick={() => {
                    captureAbort.current?.abort();
                    ++generation.current;
                    setPhoto({ capture: { state: "removed" }, image: null });
                  }}
                >
                  {photo.capture.state === "pending" ? c.omit : c.remove}
                </button>
              )}
            </section>
            <label htmlFor={id + "-contact"}>{c.contact}</label>
            <input
              id={id + "-contact"}
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={FEEDBACK_LIMITS.contact}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              aria-describedby={id + "-contact-hint"}
            />
            <p id={id + "-contact-hint"} className="feedback-muted">
              {c.contactHint}
            </p>
            <details>
              <summary>{c.technical}</summary>
              <p className="feedback-muted">{c.technicalText}</p>
            </details>
          </fieldset>
          <footer className="feedback-actions">
            <button type="button" onClick={onClose}>
              {c.cancel}
            </button>
            <button
              type="submit"
              className="feedback-send"
              disabled={
                busy || photo.capture.state === "pending" || !message.trim()
              }
            >
              {busy ? c.sending : c.send}
            </button>
          </footer>
        </form>
      )}
      {error && (
        <p className="feedback-error" role="alert">
          {c[error]}
        </p>
      )}
      {pending.length > 0 && (
        <section className="feedback-pending" aria-labelledby={id + "-pending"}>
          <h3 id={id + "-pending"}>
            {c.waiting} ({pending.length})
          </h3>
          <p className="feedback-muted">{c.queueHint}</p>
          <ul>
            {pending.map((entry) => {
              const expired =
                Date.now() - entry.queuedAtMs >= FEEDBACK_LIMITS.pendingAgeMs;
              return (
                <li key={entry.report.id}>
                  <p className="feedback-pending-text">
                    {entry.report.message}
                  </p>
                  {(expired || entry.blocked || entry.attempts > 4) && (
                    <p className="feedback-error">
                      {expired
                        ? c.expired
                        : entry.error === "http-413"
                          ? c.tooLarge
                          : entry.blocked
                            ? c.rejected
                            : c.retryLimit}
                    </p>
                  )}
                  <div className="feedback-pending-actions">
                    {!expired && (
                      <button
                        type="button"
                        disabled={queueBusy !== null}
                        onClick={() => void queueAction(entry, "retry")}
                      >
                        {c.retry}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        saveBlob(
                          new Blob([JSON.stringify(entry.report, null, 2)], {
                            type: "application/json",
                          }),
                          "feedback-" + entry.report.id + ".json",
                        )
                      }
                    >
                      {c.export}
                    </button>
                    {entry.image && (
                      <button
                        type="button"
                        onClick={() =>
                          saveBlob(
                            entry.image!,
                            "feedback-" +
                              entry.report.id +
                              "." +
                              ({
                                "image/png": "png",
                                "image/jpeg": "jpg",
                                "image/webp": "webp",
                              }[entry.image!.type] ?? "bin"),
                          )
                        }
                      >
                        {c.exportImage}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={queueBusy !== null}
                      onClick={() => void queueAction(entry, "remove")}
                    >
                      {c.delete}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </dialog>
  );
}
