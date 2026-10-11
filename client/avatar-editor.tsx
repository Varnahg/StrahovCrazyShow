import { useEffect, useId, useRef, useState } from "react";
import type { AvatarConfig, Profile } from "../shared/types";
import type { AvatarPreviewController } from "./avatar-renderer";
import {
  AVATAR_PRESETS,
  SKIN_TONES,
  HAIR_TONES,
  CLOTHING_TONES,
  TROUSER_TONES,
  applyAvatarPreset,
  avatarPreset,
} from "./avatar-presets";
import "./avatar-editor.css";

type AvatarEditorProps = {
  profile: Profile;
  onChange: (profile: Profile) => void;
  compact?: boolean;
};

function Silhouette({
  skin,
  hair,
  shirt,
  trousers,
  hairStyle = "crop",
}: Pick<AvatarConfig, "skin" | "hair" | "shirt" | "trousers"> & {
  hairStyle?: string;
}) {
  return (
    <svg viewBox="0 0 52 72" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M17 49 15 67M35 49 37 67"
        stroke={trousers}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M15 29 9 46M37 29 43 46"
        stroke={shirt}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path d="M17 28Q26 24 35 28L37 49Q26 53 15 49Z" fill={shirt} />
      {["long", "bob"].includes(hairStyle) && (
        <path
          d={
            hairStyle === "long"
              ? "M14 14Q12 0 26 1Q40 0 38 14L38 36 32 35 20 35 14 36Z"
              : "M14 14Q12 0 26 1Q40 0 38 14L38 27 14 27Z"
          }
          fill={hair}
        />
      )}
      <ellipse cx="26" cy="17" rx="10" ry="12" fill={skin} />
      <path d="M16 16Q13 3 25 3Q38 2 36 16L32 10 22 11Z" fill={hair} />
      {hairStyle === "curls" && (
        <g fill={hair}>
          <circle cx="18" cy="8" r="6" />
          <circle cx="25" cy="5" r="6" />
          <circle cx="32" cy="8" r="6" />
        </g>
      )}
      <path
        d="M23 18h.1M29 18h.1"
        stroke="#303632"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Palette({
  title,
  value,
  colors,
  onChange,
}: {
  title: string;
  value: string;
  colors: readonly string[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <fieldset className="ae-palette">
      <legend>{title}</legend>
      <div className="ae-swatches">
        {colors.map((color, index) => (
          <button
            key={color}
            type="button"
            className="ae-swatch"
            style={{ backgroundColor: color }}
            aria-label={`${title}, odstín ${index + 1}: ${color}`}
            aria-pressed={value.toLowerCase() === color}
            onClick={() => onChange(color)}
            title={`${title} ${color}`}
          >
            {value.toLowerCase() === color && <span aria-hidden="true">✓</span>}
          </button>
        ))}
        <label
          htmlFor={id}
          className="ae-custom-color"
          title="Zvolit vlastní barvu"
        >
          <span aria-hidden="true">+</span>
          <span className="ae-sr-only">{title}: vlastní barva</span>
          <input
            id={id}
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}

export function AvatarEditor({
  profile,
  onChange,
  compact = false,
}: AvatarEditorProps) {
  const [section, setSection] = useState<"appearance" | "clothes">(
    "appearance",
  );
  const [detail, setDetail] = useState<"body" | "face">("body");
  const [previewStatus, setPreviewStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<AvatarPreviewController | null>(null);
  const currentAvatar = useRef(profile.avatar);
  const pointer = useRef<{ id: number; x: number } | null>(null);
  const faceId = useId();
  const nicknameId = useId();
  const config = profile.avatar;
  const preset = avatarPreset(config.preset);
  currentAvatar.current = config;

  useEffect(() => {
    let cancelled = false;
    setPreviewStatus("loading");
    // The initial form itself does not eagerly import Babylon or initialize physics.
    import("./avatar-renderer")
      .then(({ createAvatarPreview }) => {
        if (cancelled || !canvas.current) return;
        preview.current = createAvatarPreview(
          canvas.current,
          currentAvatar.current,
        );
        setPreviewStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setPreviewStatus("unavailable");
      });
    return () => {
      cancelled = true;
      preview.current?.dispose();
      preview.current = null;
    };
  }, []);

  useEffect(() => {
    preview.current?.update(config);
  }, [config]);

  const update = <K extends keyof AvatarConfig>(
    key: K,
    value: AvatarConfig[K],
  ) => onChange({ ...profile, avatar: { ...config, [key]: value } });

  return (
    <section
      className={`avatar-editor${compact ? " ae-compact" : ""}`}
      aria-label="Vytvoření vlastní postavy"
    >
      <label htmlFor={nicknameId} className="ae-nickname">
        Jak ti budeme říkat?
        <input
          id={nicknameId}
          value={profile.nickname}
          maxLength={24}
          autoComplete="off"
          placeholder="Tvoje přezdívka"
          onChange={(event) =>
            onChange({ ...profile, nickname: event.target.value })
          }
        />
      </label>
      <div className="ae-preview">
        <span className="ae-preview-label">TVOJE POSTAVA</span>
        <div className="ae-preview-floor" aria-hidden="true" />
        <canvas
          ref={canvas}
          aria-label="3D náhled postavy. Pro otočení táhni myší nebo použij šipky pod náhledem."
          className={previewStatus === "ready" ? "ae-ready" : ""}
          onPointerDown={(event) => {
            if (previewStatus !== "ready") return;
            pointer.current = { id: event.pointerId, x: event.clientX };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            if (pointer.current?.id !== event.pointerId) return;
            preview.current?.rotate(
              (pointer.current.x - event.clientX) * 0.012,
            );
            pointer.current.x = event.clientX;
          }}
          onPointerUp={(event) => {
            if (pointer.current?.id !== event.pointerId) return;
            pointer.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            pointer.current = null;
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
        />
        {previewStatus !== "ready" && (
          <div className="ae-preview-fallback" role="status">
            <Silhouette {...config} hairStyle={preset.hairStyle} />
            <span>
              {previewStatus === "loading"
                ? "Připravuji 3D náhled…"
                : "3D náhled není dostupný. Vzhled můžeš dál upravit."}
            </span>
          </div>
        )}
        <div className="ae-view-controls" aria-label="Otočení náhledu">
          <button
            type="button"
            onClick={() => preview.current?.rotate(0.4)}
            aria-label="Otočit postavu doleva"
            disabled={previewStatus !== "ready"}
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => preview.current?.resetView()}
            disabled={previewStatus !== "ready"}
          >
            Zepředu
          </button>
          <button
            type="button"
            onClick={() => preview.current?.rotate(-0.4)}
            aria-label="Otočit postavu doprava"
            disabled={previewStatus !== "ready"}
          >
            ↷
          </button>
          <button
            type="button"
            aria-pressed={detail === "face"}
            disabled={previewStatus !== "ready"}
            onClick={() => {
              const next = detail === "face" ? "body" : "face";
              setDetail(next);
              preview.current?.focus(next);
            }}
          >
            {detail === "face" ? "Celá postava" : "Detail tváře"}
          </button>
        </div>
      </div>
      <div className="ae-group-heading">
        <span>Začni s předlohou</span>
        <span>6 podob · tvoje úpravy</span>
      </div>
      <div
        className="ae-presets"
        role="group"
        aria-label="Výchozí předloha postavy"
      >
        {AVATAR_PRESETS.map((item, index) => (
          <button
            type="button"
            key={item.name}
            className="ae-preset"
            aria-pressed={config.preset === index}
            title={`${item.name}: ${item.detail}. Nastaví také výchozí barvy a doplňky.`}
            onClick={() =>
              onChange({ ...profile, avatar: applyAvatarPreset(index, config) })
            }
          >
            <Silhouette {...item} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
      <p className="ae-preset-caption">
        <strong>{preset.name}</strong> · {preset.detail}. Výběr předlohy obnoví
        její vzhled.
      </p>
      <div className="ae-sections" role="group" aria-label="Části editoru">
        <button
          type="button"
          aria-pressed={section === "appearance"}
          onClick={() => setSection("appearance")}
        >
          Obličej a vlasy
        </button>
        <button
          type="button"
          aria-pressed={section === "clothes"}
          onClick={() => setSection("clothes")}
        >
          Oblečení
        </button>
      </div>
      {section === "appearance" ? (
        <div className="ae-details">
          <Palette
            title="Odstín pokožky"
            value={config.skin}
            colors={SKIN_TONES}
            onChange={(color) => update("skin", color)}
          />
          <Palette
            title="Barva vlasů a vousů"
            value={config.hair}
            colors={HAIR_TONES}
            onChange={(color) => update("hair", color)}
          />
          <label className="ae-face" htmlFor={faceId}>
            Tvar obličeje
            <input
              id={faceId}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.face}
              aria-valuetext={`${Math.round(config.face * 100)} % šířky obličeje`}
              onChange={(event) => update("face", Number(event.target.value))}
            />
            <span className="ae-range-ends">
              <span>Užší</span>
              <span>Širší</span>
            </span>
          </label>
          <div className="ae-accessories">
            <label>
              <input
                type="checkbox"
                checked={config.glasses}
                onChange={(event) => update("glasses", event.target.checked)}
              />
              Brýle
            </label>
            <label>
              <input
                type="checkbox"
                checked={config.beard}
                onChange={(event) => update("beard", event.target.checked)}
              />
              Vousy
            </label>
          </div>
        </div>
      ) : (
        <div className="ae-details">
          <Palette
            title="Horní díl"
            value={config.shirt}
            colors={CLOTHING_TONES}
            onChange={(color) => update("shirt", color)}
          />
          <Palette
            title="Kalhoty"
            value={config.trousers}
            colors={TROUSER_TONES}
            onChange={(color) => update("trousers", color)}
          />
          <p className="ae-help">
            Střih oblečení se mění s předlohou. Barvy si nastav podle sebe;
            můžeš je změnit i později ve hře.
          </p>
          {config.badge && <p className="ae-earned">✧ {config.badge}</p>}
        </div>
      )}
      <p className="ae-storage-note">
        Vzhled a přezdívka zůstávají v tomto prohlížeči.
      </p>
    </section>
  );
}
