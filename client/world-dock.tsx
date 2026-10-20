import { memo } from "react";
import { HudIcon } from "./hud-icons";
import { formatNumber, t, useLocale } from "./i18n";

const items = [
  { id: "events", label: "Akce" },
  { id: "map", label: "Mapa", shortcut: "M" },
  { id: "journal", label: "Deník", shortcut: "J" },
  { id: "people", label: "Lidé" },
  { id: "chat", label: "Chat" },
  { id: "activities", label: "Aktivity" },
  { id: "settings", label: "Nastavení" },
  { id: "feedback", label: "Zpětná vazba", shortcut: "F8" },
] as const;

/** Static navigation does not need to rerender with the game's stats/clock. */
export const WorldDock = memo(function WorldDock({
  panel,
  journalOpen,
  requestCount,
  onToggle,
}: {
  panel: string;
  journalOpen: boolean;
  requestCount: number;
  onToggle: (panel: string) => void;
}) {
  const locale = useLocale();
  return (
    <nav
      className="dock world-dock"
      aria-label={t("Herní nabídka")}
      aria-describedby="world-dock-help"
    >
      {items.map((item) => {
        const label = item.id === "feedback" ? locale === "cs" ? "Zpětná vazba" : "Feedback" : t(item.label);
        const active =
          panel === item.id || (item.id === "journal" && journalOpen);
        const shortcut = "shortcut" in item ? item.shortcut : undefined;
        const requests = item.id === "people" && requestCount > 0;
        return (
          <button
            key={item.id}
            type="button"
            className={active ? "active" : ""}
            onClick={() => onToggle(item.id)}
            aria-label={
              requests
                ? t("Lidé · žádosti o kontakt: {count}", {
                    count: formatNumber(requestCount),
                  })
                : label
            }
            aria-pressed={active}
            aria-keyshortcuts={shortcut}
          >
            <HudIcon name={item.id} />
            <span className="dock-label" aria-hidden="true">
              {label}
              {shortcut && <kbd>{shortcut}</kbd>}
            </span>
            {requests && <b aria-hidden="true">{requestCount}</b>}
          </button>
        );
      })}
      <p id="world-dock-help" className="dock-keyboard-help">
        {t(
          "Tab: nabídka · Enter: otevřít · Esc: zavřít. Kliknutím do hry pokračuješ.",
        )}
      </p>
    </nav>
  );
});
