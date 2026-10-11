/** Original lightweight line icons. One SVG path per control, no image fetches. */
const paths: Record<string, string> = {
  events: "M5 5h14v15H5z M8 3v4 M16 3v4 M5 10h14 M9 14h2 M14 14h2 M9 17h2",
  map: "M12 2 21 12 12 22 3 12Z M15 8l-2 6-5 2 2-6Z",
  journal:
    "M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z M12 6v15 M6 9h3 M15 9h3 M6 12h3 M15 12h3",
  people:
    "M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M3 20v-3c0-5 12-5 12 0v3 M16 5a3 3 0 0 1 0 6 M18 14c3 0 3 3 3 6",
  chat: "M4 4h16v12H10l-5 4v-4H4Z M8 8h8 M8 12h5",
  activities: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z M12 8v8 M8 12h8",
  settings:
    "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  flashlight: "M3 8h8v8H3Z M11 8l5-3v14l-5-3 M19 8l3-1 M19 12h3 M19 16l3 1",
  help: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M9 8c0-4 7-4 7 0 0 3-4 3-4 6 M12 17v1",
};
export function HudIcon({ name }: { name: string }) {
  return (
    <svg
      className="hud-icon"
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] ?? paths.activities} />
    </svg>
  );
}
