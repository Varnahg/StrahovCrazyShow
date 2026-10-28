import { useSyncExternalStore } from "react";
import { messages } from "./i18n-messages";
import { contentMessages } from "./i18n-content";

export type Locale = "cs" | "en";
export type MessageKey = keyof typeof messages;
type ParameterNames<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | ParameterNames<Rest>
    : never;
type ParametersFor<K extends MessageKey> = Record<
  ParameterNames<K>,
  string | number
>;
export const LOCALE_STORAGE_KEY = "strahov.locale";
const listeners = new Set<() => void>();
export const isLocale = (value: unknown): value is Locale =>
  value === "cs" || value === "en";

/** Prefer the first supported browser language, then English. No locale in URLs or sessions. */
export function detectLocale(
  saved: unknown,
  languages: readonly string[] = [],
): Locale {
  if (isLocale(saved)) return saved;
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
function initialLocale(): Locale {
  let saved: string | null = null;
  try {
    saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    /* Storage is optional. */
  }
  return detectLocale(saved, globalThis.navigator?.languages ?? []);
}
let locale = initialLocale();
export const getLocale = (): Locale => locale;
function publishLocale(next: Locale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
    document.title = "Strahov Crazy Show";
  }
  if (next === locale) return;
  locale = next;
  for (const listener of listeners) listener();
}
export function setLocale(next: Locale) {
  if (!isLocale(next)) return;
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* Keep the in-memory preference. */
  }
  publishLocale(next);
}
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const useLocale = (): Locale =>
  useSyncExternalStore(subscribeLocale, getLocale, getLocale);
if (typeof window !== "undefined") {
  publishLocale(locale);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null)
      publishLocale(detectLocale(event.newValue, navigator.languages));
  };
  window.addEventListener("storage", onStorage);
  import.meta.hot?.dispose(() =>
    window.removeEventListener("storage", onStorage),
  );
}
const english: Readonly<Record<string, string>> = {
  ...contentMessages,
  ...messages,
};
const sourceForEnglish = new Map(
  Object.entries(english).map(([source, translated]) => [translated, source]),
);
const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const noticePatterns = Object.entries(messages)
  .filter(([source]) => source.includes("{"))
  .flatMap(([source, translated]) =>
    [source, translated].map((pattern) => {
      const names: string[] = [];
      const parts = pattern.split(/(\{[^{}]+\})/g).map((part) => {
        if (part.startsWith("{") && part.endsWith("}")) {
          names.push(part.slice(1, -1));
          return "([\\s\\S]*?)";
        }
        return escapePattern(part);
      });
      return { source, names, pattern: new RegExp("^" + parts.join("") + "$") };
    }),
  );
/** Known static source text only. Do not pass nicknames, user event text or chat messages. */
export function localizeText(source: string | null | undefined): string {
  if (!source) return "";
  return locale === "en" ? (english[source] ?? source) : source;
}
/** Legacy server notices and already displayed notices stay localisable when the user switches. */
export function localizeNotice(value: string): string {
  const source = sourceForEnglish.get(value) ?? value;
  if (Object.hasOwn(english, source)) return localizeText(source);
  if (value.startsWith("Error: ")) return localizeNotice(value.slice(7));
  for (const candidate of noticePatterns) {
    const match = candidate.pattern.exec(value);
    if (!match) continue;
    const params = Object.fromEntries(
      candidate.names.map((name, index) => [
        name,
        localizeNotice(match[index + 1]),
      ]),
    );
    return localizeText(candidate.source).replace(
      /\{([^{}]+)\}/g,
      (token, name: string) => params[name] ?? token,
    );
  }
  return value;
}
export function t<K extends MessageKey>(
  key: K,
  ...args: [ParameterNames<K>] extends [never] ? [] : [ParametersFor<K>]
): string {
  const text = localizeText(key),
    params = args[0] as Record<string, string | number> | undefined;
  return params
    ? text.replace(/\{([^{}]+)\}/g, (token, name: string) =>
        Object.hasOwn(params, name) ? String(params[name]) : token,
      )
    : text;
}
const intlLocale = () => (locale === "cs" ? "cs-CZ" : "en-GB");
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const pluralRules = {
  cs: new Intl.PluralRules("cs"),
  en: new Intl.PluralRules("en"),
};
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  const key = locale + JSON.stringify(options);
  let formatter = numberFormats.get(key);
  if (!formatter)
    numberFormats.set(
      key,
      (formatter = new Intl.NumberFormat(intlLocale(), options)),
    );
  return formatter.format(value);
}
export function formatDate(
  value: number | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const key = locale + JSON.stringify(options);
  let formatter = dateFormats.get(key);
  if (!formatter)
    dateFormats.set(
      key,
      (formatter = new Intl.DateTimeFormat(intlLocale(), {
        timeZone: "Europe/Prague",
        ...options,
      })),
    );
  return formatter.format(value);
}
export function plural<
  const T extends { one: string; few?: string; many?: string; other: string },
>(count: number, forms: T): Exclude<T[keyof T], undefined> {
  const category = pluralRules[locale].select(count) as keyof typeof forms;
  return (forms[category] ?? forms.other) as Exclude<T[keyof T], undefined>;
}
