import { t, localizeText, useLocale } from "./i18n";
import { useEffect, useRef } from "react";
import { EMOTES, textEntryTarget } from "./interaction";
import "./interaction.css";

export function EmoteMenu({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (emoji: string) => void;
}) {
  useLocale();
  const menu = useRef<HTMLDivElement>(null),
    close = useRef(onClose),
    choose = useRef(onChoose);
  close.current = onClose;
  choose.current = onChoose;
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (textEntryTarget(event.target)) return;
      const emote = EMOTES.find(
        (item) =>
          event.code === "Digit" + item.key ||
          event.code === "Numpad" + item.key,
      );
      if (event.code === "Escape" || event.code === "KeyG" || emote) {
        event.preventDefault();
        event.stopPropagation();
        if (emote && !event.repeat) choose.current(emote.emoji);
        else if (!event.repeat) close.current();
      }
      if (event.code === "Tab") {
        const buttons = [
          ...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ??
            []),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        event.preventDefault();
        buttons[
          (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="emote-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="emote-menu"
        role="dialog"
        aria-modal="true"
        aria-label={t("Rychlá gesta")}
        ref={menu}
      >
        <header>
          <div>
            <small>{t("Dej o sobě vědět")}</small>
            <strong>{t("Rychlá gesta")}</strong>
          </div>
          <button
            type="button"
            aria-label={t("Zavřít rychlá gesta")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="emote-options">
          {EMOTES.map((item) => (
            <button
              type="button"
              key={item.emoji}
              onClick={() => onChoose(item.emoji)}
            >
              <kbd>{item.key}</kbd>
              <span aria-hidden="true">{item.emoji}</span>
              <strong>{localizeText(item.label)}</strong>
            </button>
          ))}
        </div>
        <p>
          {t("Vyber myší nebo klávesou 1–4.")} <kbd>G</kbd> / <kbd>Esc</kbd>{" "}
          {t("zavře nabídku.")}
        </p>
      </div>
    </div>
  );
}
