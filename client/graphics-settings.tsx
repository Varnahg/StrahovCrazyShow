import { useEffect, useId, useRef, useState } from "react";
import { t } from "./i18n";
import { useDialogFocus } from "./use-dialog-focus";
import {
  createRenderPreferences, isRenderQuality, isRenderQualityMode, isRenderTargetFps, parseRenderPreferences,
  resolveVisualSettings, sameRenderPreferences, toCustomRenderPreferences,
  type EffectiveVisualSettings, type GraphicsApplicationState, type RenderPreferences, type RenderQualityMode, type VisualFeatures,
} from "../shared/render-quality";

const MODE_LABELS = {
  auto: "Automaticky · podle výkonu", ultra: "Ultra úsporná", low: "Úsporná · běžný notebook",
  medium: "Střední detail", high: "Vyšší detail a rozlišení", custom: "Vlastní",
} as const;
export const graphicsModeLabel = (mode: RenderQualityMode) => t(MODE_LABELS[mode]);

type GraphicsEdit = { renderScale?: number; quality?: "low" | "medium" | "high"; features?: Partial<VisualFeatures> };
/** First manual edit freezes the actual auto state; later edits preserve the draft. */
export function editGraphicsDraft(draft: RenderPreferences, effective: EffectiveVisualSettings, edit: GraphicsEdit): RenderPreferences {
  const base = toCustomRenderPreferences(resolveVisualSettings(draft, effective));
  const next = { ...base, ...edit, features: { ...base.features, ...edit.features } };
  const parsed = parseRenderPreferences(next);
  return parsed.mode === "custom" ? parsed : draft;
}

export type GraphicsSettingsProps = {
  preferences: RenderPreferences;
  effective?: EffectiveVisualSettings;
  state?: GraphicsApplicationState;
  onApply: (preferences: RenderPreferences) => boolean | Promise<boolean>;
  onCancel?: () => void;
};

export function GraphicsSettingsPanel({ preferences, effective, state, onApply, onCancel }: GraphicsSettingsProps) {
  const [draft, setDraft] = useState<RenderPreferences>(() => preferences);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true), operation = useRef(false), cancelled = useRef(false), cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => { setDraft(preferences); setFailed(false); }, [preferences]);
  useEffect(() => { active.current = true; return () => { active.current = false; if (operation.current) cancel.current?.(); }; }, []);
  const current = resolveVisualSettings(draft, effective);
  const busy = pending || !!state?.applying;
  const restoring = state?.phase === "restoring";
  const dirty = !sameRenderPreferences(draft, preferences);
  const edit = (change: GraphicsEdit) => {
    if (busy) return;
    setFailed(false);
    setDraft(previous => editGraphicsDraft(previous, effective ?? resolveVisualSettings(preferences), change));
  };
  const id = useId();
  const switches = [
    ["shadows", "Dynamické stíny"], ["clouds", "Mraky"], ["groundVegetation", "Tráva a drobná vegetace"],
    ["trees", "Detailní stromy"], ["postProcesses", "Efekty obrazu"],
  ] as const;
  return <section className="graphics-settings" aria-label={t("Grafika")}>
    <fieldset disabled={busy}>
      <legend>{t("Grafika")}</legend>
      <label>{t("Grafický režim")}
        <select value={draft.mode} onChange={event => {
          const mode = event.target.value;
          if (!isRenderQualityMode(mode) || busy) return;
          setFailed(false);
          setDraft(mode === "custom" ? toCustomRenderPreferences(current) : createRenderPreferences(mode, draft.targetFps));
        }}>
          {(Object.keys(MODE_LABELS) as RenderQualityMode[]).map(mode => <option key={mode} value={mode}>{graphicsModeLabel(mode)}</option>)}
        </select>
      </label>
      <label>{t("Rozlišení 3D scény")}: <output htmlFor={id + "-scale"}>{Math.round(current.renderScale * 100)} %</output>
        <input id={id + "-scale"} type="range" aria-label={t("Rozlišení 3D scény")} min="50" max="100" step="1" value={Math.round(current.renderScale * 100)}
          onChange={event => edit({ renderScale: Number(event.target.value) / 100 })} />
      </label>
      <p className="small muted">{t("HUD a texty zůstávají ostré. 50 % rozměrů znamená čtvrtinu pixelů 3D scény.")}</p>
      <label>{t("Úroveň ostatních detailů")}
        <select value={current.quality} onChange={event => { if (isRenderQuality(event.target.value)) edit({ quality: event.target.value }); }}>
          <option value="low">{t("Úsporná")}</option><option value="medium">{t("Střední detail")}</option><option value="high">{t("Vysoká")}</option>
        </select>
      </label>
      <div className="graphics-switches">{switches.map(([key, label]) => <label key={key} className="graphics-switch">
        <input type="checkbox" checked={key === "trees" ? current.features.trees === "normal" : current.features[key] as boolean}
          onChange={event => edit({ features: { [key]: key === "trees" ? event.target.checked ? "normal" : "far-only" : event.target.checked } })} />
        <span>{t(label)}</span>
      </label>)}</div>
      <p className="small muted">{t("Vypnuté detailní stromy používají jednodušší modely; kmeny a kolize zůstávají. Efekty obrazu zahrnují záři a vyhlazování.")}</p>
      <label>{t("Cíl snímkové frekvence")}
        <select value={draft.targetFps} disabled={draft.mode !== "auto"} onChange={event => {
          const targetFps = Number(event.target.value);
          if (isRenderTargetFps(targetFps) && draft.mode === "auto") setDraft(createRenderPreferences("auto", targetFps));
        }}><option value="60">60 FPS</option><option value="120">120 FPS</option><option value="144">144 FPS</option></select>
      </label>
      <p className="small muted">{t("Ruční úprava přepne režim na Vlastní. Volba přednastavení obnoví jeho doporučené hodnoty.")}</p>
    </fieldset>
    {(failed || state?.error) && <p role="alert">{state?.error || t("Nastavení grafiky nebylo použito.")}</p>}
    {busy && <p role="status">{t(state?.phase === "restoring" ? "Obnovuji původní grafiku…" : "Připravuji grafiku…")}</p>}
    <div className="graphics-actions">
      <button type="button" disabled={!dirty || busy || !!state?.restartRequired} onClick={async () => {
        if (operation.current || busy || !dirty) return;
        operation.current = true; cancelled.current = false; setPending(true); setFailed(false);
        try {
          const accepted = await onApply(draft);
          if (active.current) {
            setFailed(!accepted && !cancelled.current);
            if (accepted) setDraft(draft); else if (cancelled.current) setDraft(preferences);
          }
        } catch { if (active.current) setFailed(true); }
        finally { operation.current = false; if (active.current) setPending(false); }
      }}>{t("Použít")}</button>
      <button type="button" className="secondary" disabled={restoring || (!busy && !dirty)} onClick={() => {
        if (restoring) return;
        if (busy) { cancelled.current = true; onCancel?.(); } else { setDraft(preferences); setFailed(false); }
      }}>{t(restoring ? "Obnovuji původní grafiku…" : busy ? "Zrušit přípravu" : "Zrušit změny")}</button>
    </div>
  </section>;
}

export function GraphicsSettingsDialog(props: GraphicsSettingsProps & { onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(true, dialog, props.onClose);
  return <div className="graphics-dialog-overlay" onPointerDown={event => { if (event.target === event.currentTarget) props.onClose(); }}>
    <section className="graphics-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={t("Grafika")} tabIndex={-1}>
      <button type="button" className="close graphics-dialog-close" aria-label={t("Zavřít grafiku")} onClick={props.onClose}>×</button>
      <GraphicsSettingsPanel {...props} />
    </section>
  </div>;
}

export function GraphicsApplyingOverlay({ state, onCancel }: { state: GraphicsApplicationState; onCancel: () => void }) {
  const dialog = useRef<HTMLElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const restoring = state.phase === "restoring";
  const requestCancel = () => { if (!restoring) onCancel(); };
  useDialogFocus(true, dialog, requestCancel, cancel);
  return <div className="graphics-applying-overlay">
    <section ref={dialog} role="dialog" aria-modal="true" aria-label={t("Připravuji grafiku…")} tabIndex={-1}>
      <h2 role="status">{t(state.phase === "restoring" ? "Obnovuji původní grafiku…" : "Připravuji grafiku…")}</h2>
      <p>{t("Po dobu přípravy je pohyb pozastavený; připojení zůstává aktivní.")}</p>
      <button type="button" ref={cancel} className="secondary" disabled={restoring} onClick={requestCancel}>{t(restoring ? "Obnovuji původní grafiku…" : "Zrušit přípravu")}</button>
    </section>
  </div>;
}
