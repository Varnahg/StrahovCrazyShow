import {
  JOURNAL_ENTRIES,
  journalPlace,
  type JournalCategory,
} from "../shared/journal";
import { makeDemoEvents } from "../shared/events";
import type { EventItem } from "../shared/types";
import { getLocale, localizeText, type Locale } from "./i18n";
import { contentMessages } from "./i18n-content";

const demoEvents = new Map(makeDemoEvents(0).map((event) => [event.id, event]));
/** Never translate a player-authored meetup, even if its words match a demo. */
export function demoEventText(
  event: EventItem,
  field: "title" | "description",
) {
  const original = demoEvents.get(event.id);
  return !event.owner && original?.[field] === event[field]
    ? localizeText(event[field])
    : event[field];
}
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const searchIndexes = new Map<Locale, Map<string, string>>();
/** Two immutable indexes at most. Keep original IDs, selection, favorites and source objects. */
export function searchLocalizedJournal(
  query: string,
  category: JournalCategory | "all" = "all",
  favorites?: ReadonlySet<string>,
  locale = getLocale(),
) {
  let index = searchIndexes.get(locale);
  if (!index) {
    index = new Map(
      JOURNAL_ENTRIES.map((entry) => {
        const texts = [
          entry.title,
          entry.summary,
          ...entry.paragraphs,
          ...entry.tags,
          ...(entry.steps ?? []),
          ...(entry.facts?.flatMap((fact) => [fact.label, fact.value]) ?? []),
          ...entry.placeIds.map((id) => journalPlace(id)?.venueLabel ?? ""),
        ];
        return [
          entry.id,
          normalize(
            texts
              .flatMap((text) =>
                locale === "en"
                  ? [text, contentMessages[text] ?? text]
                  : [text],
              )
              .join(" "),
          ),
        ];
      }),
    );
    searchIndexes.set(locale, index);
  }
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return JOURNAL_ENTRIES.filter(
    (entry) =>
      (category === "all" || entry.category === category) &&
      (!favorites || favorites.has(entry.id)) &&
      terms.every((term) => index!.get(entry.id)!.includes(term)),
  );
}
