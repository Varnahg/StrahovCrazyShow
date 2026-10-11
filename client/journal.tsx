import { useDialogFocus } from "./use-dialog-focus";
import { searchLocalizedJournal } from "./i18n-content-helpers";
import { t, localizeText, useLocale, formatDate } from "./i18n";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  JOURNAL_CATEGORIES,
  JOURNAL_CHECKED_AT,
  JOURNAL_ENTRIES,
  JOURNAL_IMAGES,
  JOURNAL_SOURCES,
  journalEntry,
  journalPlace,
  parseJournalProgress,
  type JournalCategory,
  type JournalProgress,
} from "../shared/journal";
import "./journal.css";

export type JournalProps = {
  open: boolean;
  onClose: () => void;
  onPlace?: (id: string) => void;
  initialEntryId?: string;
};
const STORAGE = "strahov-journal-v1";
function loadProgress() {
  try {
    return parseJournalProgress(localStorage.getItem(STORAGE));
  } catch {
    return parseJournalProgress(null);
  }
}
const journalDate = (date: string) =>
  formatDate(new Date(date + "T12:00:00Z"), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** An offline reference book. Opens external services only after an explicit click. */
export function Journal({
  open,
  onClose,
  onPlace,
  initialEntryId,
}: JournalProps) {
  const locale = useLocale();
  const [progress, setProgress] = useState<JournalProgress>(loadProgress);
  const [selected, setSelected] = useState(
    initialEntryId || progress.lastEntryId,
  );
  const [category, setCategory] = useState<JournalCategory | "all">("all");
  const [query, setQuery] = useState(""),
    [favoritesOnly, setFavoritesOnly] = useState(false);
  const dialog = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    article = useRef<HTMLElement>(null);
  const headingId = useId(),
    articleId = useId();
  useDialogFocus(open, dialog, onClose, closeButton);
  const entry = journalEntry(selected) || JOURNAL_ENTRIES[0];
  const favorites = useMemo(
    () => new Set(progress.favorites),
    [progress.favorites],
  );
  const results = useMemo(
    () =>
      searchLocalizedJournal(
        query,
        category,
        favoritesOnly ? favorites : undefined,
        locale,
      ),
    [query, category, favoritesOnly, favorites, locale],
  );
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(progress));
    } catch {
      /* Browsing still works with storage disabled. */
    }
  }, [progress]);
  useEffect(() => {
    if (open && initialEntryId && journalEntry(initialEntryId)) {
      setSelected(initialEntryId);
      setQuery("");
      setCategory("all");
      setFavoritesOnly(false);
    }
  }, [open, initialEntryId]);
  useEffect(() => {
    if (!open) return;
    setProgress((current) => ({
      ...current,
      lastEntryId: entry.id,
      read: current.read.includes(entry.id)
        ? current.read
        : [...current.read, entry.id],
    }));
    article.current?.scrollTo({ top: 0 });
  }, [open, entry.id]);
  if (!open) return null;
  const index = results.findIndex((result) => result.id === entry.id);
  const select = (id: string) => setSelected(id);
  const toggleFavorite = () =>
    setProgress((current) => ({
      ...current,
      favorites: current.favorites.includes(entry.id)
        ? current.favorites.filter((id) => id !== entry.id)
        : [...current.favorites, entry.id],
    }));
  return (
    <div
      className="journal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="strahov-journal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={dialog}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="journal-heading">
          <div>
            <span className="journal-eyebrow">{t("Kronika místa a lidí")}</span>
            <h2 id={headingId}>{t("Strahovský deník")}</h2>
          </div>
          <span className="journal-read-count">
            {progress.read.length} / {JOURNAL_ENTRIES.length} {t("přečteno")}
          </span>
          <button
            ref={closeButton}
            type="button"
            className="journal-close"
            aria-label={t("Zavřít deník")}
            onClick={onClose}
          >
            ✕ <kbd>Esc</kbd>
          </button>
        </header>
        <div className="journal-body">
          <aside className="journal-index" aria-label={t("Obsah deníku")}>
            <label className="journal-search">
              {t("Hledat v deníku")}
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("pračky, hudebna, rozpočet…")}
                type="search"
              />
            </label>
            <nav className="journal-chapters" aria-label={t("Kapitoly deníku")}>
              <button
                type="button"
                aria-pressed={category === "all"}
                onClick={() => setCategory("all")}
              >
                {t("☷ Všechny kapitoly")}
              </button>
              {JOURNAL_CATEGORIES.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  aria-pressed={category === chapter.id}
                  onClick={() => setCategory(chapter.id)}
                >
                  {chapter.icon} {localizeText(chapter.label)}
                </button>
              ))}
            </nav>
            <label className="journal-favorites-filter">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(event) => setFavoritesOnly(event.target.checked)}
              />{" "}
              {t("Jen moje záložky")}
            </label>
            <div
              className="journal-results"
              aria-label={t("Hesla")}
              aria-live="polite"
            >
              {results.map((result) => (
                <button
                  type="button"
                  key={result.id}
                  className={
                    "journal-index-entry" +
                    (result.id === entry.id ? " is-selected" : "")
                  }
                  aria-current={result.id === entry.id ? "page" : undefined}
                  onClick={() => select(result.id)}
                  aria-controls={articleId}
                >
                  <span className="journal-entry-marker" aria-hidden="true">
                    {favorites.has(result.id)
                      ? "★"
                      : progress.read.includes(result.id)
                        ? "✓"
                        : "◦"}
                  </span>
                  <span>
                    <strong>{localizeText(result.title)}</strong>
                    <small>
                      {localizeText(
                        JOURNAL_CATEGORIES.find((c) => c.id === result.category)
                          ?.label,
                      )}
                    </small>
                  </span>
                </button>
              ))}
              {!results.length && (
                <p className="journal-empty">
                  {t("Nic nenalezeno. Zkus kratší výraz nebo jinou kapitolu.")}
                </p>
              )}
            </div>
          </aside>
          <article
            className="journal-page"
            id={articleId}
            ref={article}
            tabIndex={0}
            aria-label={localizeText(entry.title)}
          >
            <div className="journal-page-top">
              <span className="journal-eyebrow">
                {localizeText(
                  JOURNAL_CATEGORIES.find((c) => c.id === entry.category)
                    ?.label,
                )}{" "}
                · {String(JOURNAL_ENTRIES.indexOf(entry) + 1).padStart(2, "0")}
              </span>
              <button
                type="button"
                className="journal-bookmark"
                aria-pressed={favorites.has(entry.id)}
                onClick={toggleFavorite}
              >
                {favorites.has(entry.id)
                  ? t("★ Uloženo")
                  : t("☆ Uložit záložku")}
              </button>
            </div>
            <h3>{localizeText(entry.title)}</h3>
            <p className="journal-lead">{localizeText(entry.summary)}</p>
            {entry.projectStatus === "retired" && (
              <div className="journal-status">
                {t("Archiv · ukončené projekty")}
              </div>
            )}
            {entry.projectStatus === "seasonal" && (
              <div className="journal-status">
                {t("Festivalový projekt · termíny na oficiálním webu")}
              </div>
            )}
            {entry.paragraphs.map((paragraph, i) => (
              <p key={i}>{localizeText(paragraph)}</p>
            ))}
            {entry.facts && (
              <dl className="journal-facts">
                {entry.facts.map((fact) => (
                  <div key={localizeText(fact.label)}>
                    <dt>{localizeText(fact.label)}</dt>
                    <dd>{localizeText(fact.value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {entry.steps && (
              <section className="journal-procedure">
                <h4>{t("Jak postupovat")}</h4>
                <ol>
                  {entry.steps.map((step) => (
                    <li key={localizeText(step)}>{localizeText(step)}</li>
                  ))}
                </ol>
              </section>
            )}
            {!!entry.placeIds.length && (
              <section className="journal-venues">
                <h4>{t("Najít na mapě")}</h4>
                {entry.placeIds.map((id) => {
                  const place = journalPlace(id);
                  return (
                    place && (
                      <button
                        type="button"
                        key={id}
                        disabled={!onPlace}
                        onClick={() => onPlace?.(id)}
                      >
                        <span aria-hidden="true">⌖</span>
                        <span>
                          <strong>{localizeText(place.name)}</strong>
                          <small>
                            {localizeText(place.venueLabel)}
                            {place.positionConfidence === "approximate-area"
                              ? t(" · přibližná oblast")
                              : t(" · značka budovy / místa")}
                          </small>
                        </span>
                        <span aria-hidden="true">↗</span>
                      </button>
                    )
                  );
                })}
              </section>
            )}
            {!!entry.links?.length && (
              <section className="journal-links">
                <h4>{t("Vyřídit a zjistit více")}</h4>
                {entry.links.map((link) => (
                  <a
                    key={link.url + link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {localizeText(link.label)}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </section>
            )}
            {entry.imageIds?.map((id) => {
              const photo = JOURNAL_IMAGES.find((image) => image.id === id);
              return (
                photo && (
                  <figure key={id} className="journal-photo">
                    <a
                      href={photo.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("Otevřít původ fotografie: {caption}", {
                        caption: localizeText(photo.caption),
                      })}
                    >
                      <img
                        loading="lazy"
                        src={photo.src}
                        alt={localizeText(photo.caption)}
                      />
                    </a>
                    <figcaption>
                      <strong>{localizeText(photo.caption)}</strong>
                      <span>
                        {localizeText(photo.author)} ·{" "}
                        <a
                          href={photo.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {photo.license}
                        </a>
                      </span>
                      <small>{localizeText(photo.changes)}</small>
                    </figcaption>
                  </figure>
                )
              );
            })}
            <footer className="journal-sources">
              <h4>{t("Prameny a aktualizace")}</h4>
              <p>
                {t("Kontrola zdrojů:")} {journalDate(JOURNAL_CHECKED_AT)}
                {t(
                  ". Pro aktuální provoz a kontakty použij oficiální stránky.",
                )}
              </p>
              <ul>
                {entry.sourceIds.map((id) => {
                  const source = JOURNAL_SOURCES.find(
                    (source) => source.id === id,
                  );
                  return (
                    source && (
                      <li key={id}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {localizeText(source.label)} ↗
                        </a>
                      </li>
                    )
                  );
                })}
              </ul>
            </footer>
          </article>
        </div>
        <footer className="journal-bottom">
          <span>{t("Záložky a čtení se ukládají v tomto prohlížeči.")}</span>
          <div>
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => select(results[index - 1].id)}
            >
              {t("← Předchozí")}
            </button>
            <button
              type="button"
              disabled={index < 0 || index >= results.length - 1}
              onClick={() => select(results[index + 1].id)}
            >
              {t("Další →")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
