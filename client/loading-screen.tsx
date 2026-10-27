import { useEffect, useState, type ReactNode } from "react";
import {
  STARTUP_STAGES,
  startupStageLabel,
  type StartupStage,
} from "./startup-progress";

export type LoadingScreenProps = {
  stage: string;
  locale: "cs" | "en";
  error?: string;
  onLeave: () => void;
  onFeedback: () => void;
  rendererNotice?: ReactNode;
  recoveryAction?: ReactNode;
};

export function LoadingScreen({
  stage,
  locale,
  error,
  onLeave,
  onFeedback,
  rendererNotice,
  recoveryAction,
}: LoadingScreenProps) {
  const [startedAt] = useState(() => performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (error || stage === "ready") return;
    const timer = setInterval(
      () => setElapsed(Math.floor((performance.now() - startedAt) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [startedAt, !!error, stage === "ready"]);
  const cs = locale === "cs";
  const active = STARTUP_STAGES.indexOf(
    stage === "renderer-fallback" ? "renderer" : (stage as StartupStage),
  );
  return (
    <section
      className={`loading startup-screen${error ? " startup-failed" : ""}`}
      aria-label={cs ? "Načítání hry" : "Loading the game"}
    >
      <div className="startup-card">
        <div className="brand">
          s<span>•</span>trahov
        </div>
        <span className="startup-eyebrow">
          {cs ? "ZA CHVÍLI NA KOPCI" : "SEE YOU ON THE HILL"}
        </span>
        <h1>
          {error
            ? cs
              ? "Příprava se zastavila"
              : "Setup has stopped"
            : cs
              ? "Chystám ti Strahov."
              : "Getting Strahov ready."}
        </h1>
        <div className="startup-current" role="status" aria-live="polite">
          {!error && stage !== "ready" && (
            <span className="startup-spinner" aria-hidden="true" />
          )}
          <strong>
            {error ? (cs ? "Poslední krok: " : "Last stage: ") : ""}
            {startupStageLabel(stage, locale)}
          </strong>
        </div>
        <p className="startup-time">
          {cs ? "Uplynulo" : "Elapsed"}: {elapsed} s ·{" "}
          {cs
            ? "První návštěva může chvíli trvat."
            : "Your first visit may take a moment."}
        </p>
        {rendererNotice}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {error && recoveryAction}
        <details className="startup-details">
          <summary>
            {cs ? "Co se právě připravuje" : "What is being prepared"}
          </summary>
          <ol>
            {STARTUP_STAGES.filter((item) => item !== "ready").map(
              (item, index) => (
                <li
                  key={item}
                  className={
                    index < active
                      ? "complete"
                      : index === active
                        ? "current"
                        : "pending"
                  }
                  aria-current={index === active ? "step" : undefined}
                >
                  <span aria-hidden="true">
                    {index < active ? "✓" : index === active ? "•" : "○"}
                  </span>
                  {startupStageLabel(item, locale)}
                  <span className="startup-step-state">
                    {index < active
                      ? cs
                        ? "hotovo"
                        : "done"
                      : index === active
                        ? error
                          ? cs
                            ? "zastaveno"
                            : "stopped"
                          : cs
                            ? "probíhá"
                            : "in progress"
                        : cs
                          ? "čeká"
                          : "waiting"}
                  </span>
                </li>
              ),
            )}
          </ol>
        </details>
        <div className="startup-actions">
          <button type="button" className="secondary" onClick={onLeave}>
            {cs ? "Zpět na úvod" : "Back to home"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={onFeedback}
            aria-keyshortcuts="F8"
          >
            {cs ? "Nahlásit problém" : "Report a problem"}
          </button>
        </div>
      </div>
    </section>
  );
}
