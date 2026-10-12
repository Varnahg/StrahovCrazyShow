import { memo } from "react";
import type { Weather } from "../shared/weather";
import { localizeText, t, useLocale } from "./i18n";

export const HudWeather = memo(function HudWeather({
  weather,
  label,
}: {
  weather: Weather | null;
  label: string;
}) {
  useLocale();
  const provenance = !weather
    ? t("načítám")
    : weather.status === "unavailable"
      ? t("data nedostupná")
      : weather.status === "fallback"
        ? weather.stale
          ? t("model · starší data")
          : t("model počasí")
        : weather.stale
          ? t("stanice · starší data")
          : t("stanice · čerstvá data");
  return (
    <span
      className="weather"
      title={
        weather
          ? `${localizeText(weather.source)} · ${localizeText(weather.cloudSource)}`
          : undefined
      }
    >
      <span>
        <span aria-hidden="true">☁ </span>
        {label}
      </span>
      <small>{provenance}</small>
    </span>
  );
});
