import type { EventItem } from "./types";
export const PRAGUE_TZ = "Europe/Prague";
export function dateKey(time: number) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: PRAGUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function eventStatus(event: EventItem, now = Date.now()) {
  return event.cancelled
    ? "cancelled"
    : now < event.startsAt
      ? "planned"
      : now < event.endsAt
        ? "live"
        : "ended";
}
export function inPeriod(event: EventItem, period: string, now = Date.now()) {
  if (period === "now") return eventStatus(event, now) === "live";
  if (period === "today")
    return (
      dateKey(event.startsAt) <= dateKey(now) &&
      dateKey(event.endsAt - 1) >= dateKey(now)
    );
  const [year, month, day] = dateKey(now).split("-").map(Number),
    calendar = Date.UTC(year, month - 1, day);
  const weekday = (new Date(calendar).getUTCDay() + 6) % 7;
  const first = new Date(calendar - weekday * 86400000)
      .toISOString()
      .slice(0, 10),
    last = new Date(calendar + (6 - weekday) * 86400000)
      .toISOString()
      .slice(0, 10);
  return dateKey(event.startsAt) <= last && dateKey(event.endsAt - 1) >= first;
}
export function makeDemoEvents(now = Date.now()): EventItem[] {
  return [
    {
      id: "tea",
      title: "Čaj & první seznámení",
      description:
        "Fiktivní ukázka: pohodové setkání pro ty, kdo jsou na kopci poprvé. Přidej se klidně sám.",
      placeId: "b6",
      startsAt: now - 20 * 60000,
      endsAt: now + 70 * 60000,
      tags: ["Čaj", "Seznamování"],
    },
    {
      id: "quiz",
      title: "Kvíz: Jak dobře znáš Strahov?",
      description:
        "Fiktivní ukázka týmového kvízu v klubovně B6. Herní kvíz můžeš spustit také z panelu aktivit.",
      placeId: "club6",
      startsAt: now + 45 * 60000,
      endsAt: now + 105 * 60000,
      tags: ["Hry", "Seznamování"],
    },
    {
      id: "music",
      title: "Večer na Sedmičce",
      description:
        "Fiktivní koncert pro demonstraci přehledu akcí. Nejde o skutečný program Klubu 007.",
      placeId: "seven",
      startsAt: now + 120 * 60000,
      endsAt: now + 240 * 60000,
      tags: ["Hudba"],
    },
    {
      id: "hunt",
      title: "Společná výprava po kopci",
      description:
        "Fiktivní ukázka. Najděte společně pět barevných značek rozmístěných v areálu.",
      placeId: "rko",
      startsAt: now + 86400000,
      endsAt: now + 90000000,
      tags: ["Hry", "Sport"],
    },
    {
      id: "tech",
      title: "Technika mezi bloky",
      description: "Fiktivní setkání nad studentskými projekty.",
      placeId: "b6",
      startsAt: now + 2 * 86400000,
      endsAt: now + 2 * 86400000 + 3600000,
      tags: ["Technika"],
    },
  ].map((e) => ({ ...e, cancelled: false, demo: true }));
}
export const QUIZ = [
  {
    question: "Jak se jmenuje studentský klub na strahovských kolejích?",
    answers: ["Silicon Hill", "Silicon Valley", "Strahov United"],
    correct: 0,
  },
  {
    question: "Kde na B6 najdeš Čajovnu a STOH?",
    answers: ["Na střeše", "V suterénu se vstupem zvenku", "Na pátém patře"],
    correct: 1,
  },
  {
    question: "Co znamená účast v tomto demu?",
    answers: [
      "Rezervované místo ve skutečném klubu",
      "Ověřený pobyt na koleji",
      "Pouze virtuální účast",
    ],
    correct: 2,
  },
];
