import journal from "../shared/data/journal.json";
import translation from "./data/journal-en.json";

/** Translations of curated reference/demo content; source data and provenance stay immutable. */
const labels: Record<string, string> = {
  Hudba: "Music",
  Hry: "Games",
  Sport: "Sport",
  Technika: "Technology",
  Čaj: "Tea",
  Seznamování: "Meeting people",
  "Čaj & první seznámení": "Tea & first introductions",
  "Fiktivní ukázka: pohodové setkání pro ty, kdo jsou na kopci poprvé. Přidej se klidně sám.":
    "Fictional demo: a relaxed meetup for newcomers to the hill. Feel free to come on your own.",
  "Kvíz: Jak dobře znáš Strahov?": "Quiz: how well do you know Strahov?",
  "Fiktivní ukázka týmového kvízu v klubovně B6. Herní kvíz můžeš spustit také z panelu aktivit.":
    "Fictional team quiz in the B6 common room. You can also start the in-game quiz from Activities.",
  "Večer na Sedmičce": "An evening at Sedmička",
  "Fiktivní koncert pro demonstraci přehledu akcí. Nejde o skutečný program Klubu 007.":
    "A fictional concert demonstrating the event list. This is not Club 007's actual programme.",
  "Společná výprava po kopci": "Explore the hill together",
  "Fiktivní ukázka. Najděte společně pět barevných značek rozmístěných v areálu.":
    "Fictional demo. Work together to find five coloured markers around the campus.",
  "Technika mezi bloky": "Technology between the halls",
  "Fiktivní setkání nad studentskými projekty.":
    "A fictional meetup about student projects.",
  "Jak se jmenuje studentský klub na strahovských kolejích?":
    "What is the student club at the Strahov halls called?",
  "Kde na B6 najdeš Čajovnu a STOH?":
    "Where in B6 can you find the tea room and STOH?",
  "Na střeše": "On the roof",
  "V suterénu se vstupem zvenku": "In the basement, with an outdoor entrance",
  "Na pátém patře": "On the fifth floor",
  "Co znamená účast v tomto demu?": "What does attendance in this demo mean?",
  "Rezervované místo ve skutečném klubu": "A reserved place in a real club",
  "Ověřený pobyt na koleji": "Verified residency in the halls",
  "Pouze virtuální účast": "Virtual attendance only",
  "Blok 6": "Block 6",
  "Vstup do B6. Rozvržení vychází z OSM a orientačního plánu SH; rozměry interiéru jsou přibližné.":
    "B6 entrance. Layout based on OSM and the SH orientation plan; interior dimensions are approximate.",
  "Klubovna B6": "B6 common room",
  "Klubovna mezi 4. a 5. patrem. Virtuální interiér je demonstrační.":
    "Common room between the fourth and fifth floors. The virtual interior is a demonstration.",
  "Sedmička / Klub 007": "Sedmička / Club 007",
  "Hudební klub na B7. Akce v tomto demu jsou fiktivní.":
    "Music club in B7. Events in this demo are fictional.",
  "Recharging Bar ve společné budově Potravin, Olympijská 1913/1. Bod označuje provozovnu; přesné dveře a interiér čekají na zaměření.":
    "Recharging Bar in the shared grocery-store building, Olympijská 1913/1. The point marks the venue; exact doors and interior have yet to be surveyed.",
  "Otevřený prostor pro společné herní aktivity.":
    "Open space for shared in-game activities.",
  "Nástupiště A · 191 směrem Vypich a Letiště. Poloha z PID a OSM; odjezdy linky 191 se v demu nesimulují.":
    "Platform A · route 191 towards Vypich and the airport. Location from PID and OSM; route 191 departures are not simulated in the demo.",
  "Nástupiště B · 191 směr Na Knížecí. Poloha z PID a OSM; odjezdy linky 191 se v demu nesimulují.":
    "Platform B · route 191 towards Na Knížecí. Location from PID and OSM; route 191 departures are not simulated in the demo.",
  "Jízdní řády PID vypršely – obnovte místní data":
    "PID timetables have expired – refresh local data",
  "Jízdní řády zatím neplatí": "The timetables are not yet valid",
  "PID 143 / 149 · plánované spoje, bez živého zpoždění":
    "PID 143 / 149 · scheduled services, no live delays",
  "Koleje Strahov": "Strahov halls",
  "Najít zástupce svého bloku": "Find your block representative",
  "Veřejné zápisy a usnesení": "Public minutes and resolutions",
  "Vedení a kontakty SH": "SH leadership and contacts",
  "Kancelář a úřední hodiny": "Office and opening hours",
  "Plánované příjmy": "Planned income",
  "Projekty · kapitola": "Projects · budget chapter",
  "Fondy zástupců bloků": "Block representative funds",
  "6 970 700 Kč": "CZK 6,970,700",
  "2 681 350 Kč": "CZK 2,681,350",
  "250 000 Kč": "CZK 250,000",
  "Rozpočet 2026 v1.2 · PDF": "2026 budget v1.2 · PDF",
  "Manuál pro čerpání a doklady": "Spending and receipts guide",
  "SU · struktura a role": "SU · structure and roles",
  "SU · současné kontakty": "SU · current contacts",
  "SÚZ · oficiální informace": "SÚZ · official information",
  "Ředitel · aktuální profesní kontakt":
    "Director · current professional contact",
  "Oficiální adresář IT služeb": "Official IT services directory",
  "Správci a kontakty SH": "SH administrators and contacts",
  "Hospodářky všech bloků a vedení areálu":
    "Accommodation managers and campus administration",
  "Otevřít oficiální účet SÚZ": "Open the official SÚZ account",
  "SÚZ · prádelna a návod": "SÚZ · laundry and instructions",
  "B6 · místnosti, správci a rezervace":
    "B6 · rooms, managers and reservations",
  "Jak se aktivně zapojit": "How to get involved",
  "Projektový manažer a adresář": "Project manager and directory",
  "Projekt · aktuální informace": "Project · current information",
  "Školicí centrum · rezervace a kalendář":
    "Training centre · reservations and calendar",
  "Sport SH · aktuální nabídka": "SH sport · current activities",
  "Boulder · pravidla a přístup": "Bouldering · rules and access",
  "Grilcentrum · rezervace": "Barbecue centre · reservations",
  "Grilcentrum · pravidla": "Barbecue centre · rules",
  "Klubovna SH · přístup a rezervace":
    "SH common room · access and reservations",
  "Kancelář SH / SÚZ": "SH / SÚZ office",
  "B1 · kancelář SH: 1. patro, dveře 40":
    "B1 · SH office: first floor, door 40",
  "Silicon Gym / boulder": "Silicon Gym / bouldering",
  "B2 · suterén": "B2 · basement",
  "Studentská prádelna": "Student Laundry",
  "B4 · Studentská prádelna": "B4 · Student Laundry",
  "Hudebna B4": "B4 music room",
  "B4 · severní suterén": "B4 · northern basement",
  "SHerna B4": "SHerna B4",
  "B4 · mezipatro 3/4 nad vrátnicí":
    "B4 · landing between floors 3 and 4 above reception",
  "Společné místnosti B6": "B6 shared rooms",
  "B6 · klubovna, SHerna a místnost bývalého Fotoateliéru":
    "B6 · common room, SHerna and former Photo Studio room",
  "Klubovna SH": "SH common room",
  "B7 · jižní suterén": "B7 · southern basement",
  "B8 · nad vrátnicí, patro ověř u správce":
    "B8 · above reception; confirm the floor with the manager",
  "MacGyver / 3D tisk": "MacGyver / 3D printing",
  "B9 · jižní suterén, Mučírna s127": "B9 · southern basement, Mučírna s127",
  "Hudebna B9": "B9 music room",
  "B9 · severní suterén": "B9 · northern basement",
  "Hudebna B10": "B10 music room",
  "B10 · severní suterén": "B10 · northern basement",
  "B10 · 3. patro, jižní strana": "B10 · third floor, southern side",
  "Včely · okolí B11": "Bees · near B11",
  "U hradeb vedle B11 · přesné místo domluv s týmem":
    "By the walls beside B11 · arrange the exact meeting place with the team",
  "Školicí centrum SH": "SH training centre",
  "Olympijská 1912/2 · AVC, GameDev a taneční":
    "Olympijská 1912/2 · AVC, GameDev and dancing",
  "Zahrádky SH": "SH gardens",
  "Za školicím centrem · přibližná oblast zahrady":
    "Behind the training centre · approximate garden area",
  "Za školicím centrem": "Behind the training centre",
  "Buzerák / SHOW": "Central courtyard / SHOW",
  "Centrální prostor mezi bloky · dějiště festivalu SHOW":
    "Central space between the halls · SHOW festival venue",
  "Centrální prostor mezi bloky": "Central space between the halls",
  "Vedle B11 za trafostanicí · bod z wiki SH":
    "Beside B11, behind the transformer station · point from the SH wiki",
  "Vedle B11 za trafostanicí": "Beside B11, behind the transformer station",
  "Silicon Hill · Kdo jsme a historie": "Silicon Hill · About us and history",
  "Silicon Hill Wiki · Struktura klubu": "Silicon Hill Wiki · Club structure",
  "Stanovy Silicon Hill": "Silicon Hill statutes",
  "Silicon Hill · Kontakty": "Silicon Hill · Contacts",
  "Hledáme příštího předsedu · 20. 9. 2026":
    "Looking for the next chair · 20 September 2026",
  "Silicon Hill Wiki · Úplný přehled projektů":
    "Silicon Hill Wiki · Complete project directory",
  "Silicon Hill Wiki · Čerpání financí": "Silicon Hill Wiki · Spending funds",
  "Rozpočet SH 2026 v1.2 · schválený základ":
    "SH budget 2026 v1.2 · approved baseline",
  "Zápis představenstva · usnesení 2025-0074":
    "Board minutes · resolution 2025-0074",
  "Studentská unie ČVUT · Historie": "CTU Student Union · History",
  "Studentská unie ČVUT · Organizační struktura":
    "CTU Student Union · Organisational structure",
  "Studentská unie ČVUT · Kontakty": "CTU Student Union · Contacts",
  "SÚZ ČVUT · O nás": "SÚZ ČVUT · About us",
  "ČVUT · Správa účelových zařízení": "CTU · Service Facilities Administration",
  "ČVUT Usermap · Michal Vodička": "CTU Usermap · Michal Vodička",
  "SÚZ ČVUT · Koleje Strahov a hospodářky":
    "SÚZ ČVUT · Strahov halls and accommodation managers",
  "ČVUT · Revitalizace areálu Strahov": "CTU · Strahov campus redevelopment",
  "SH Wiki · SÚZ a hlášení závad": "SH Wiki · SÚZ and reporting faults",
  "SÚZ · Studentská prádelna B4 od 1. 4. 2025":
    "SÚZ · B4 Student Laundry from 1 April 2025",
  "SÚZ · Uzavření starých prádelen od 1. 5. 2025":
    "SÚZ · Closure of old laundries from 1 May 2025",
  "SH Wiki · Blok 6": "SH Wiki · Block 6",
  "SH Wiki · Školicí centrum": "SH Wiki · Training centre",
  "SH Wiki · Silicon Gym": "SH Wiki · Silicon Gym",
  "SH Wiki · Boulder": "SH Wiki · Bouldering",
  "SH Wiki · Grilovací centrum": "SH Wiki · Barbecue centre",
  "SH Wiki · Klubovna SH": "SH Wiki · SH common room",
  "SH Wiki · Zapoj se": "SH Wiki · Get involved",
  "SH Wiki · IT služby": "SH Wiki · IT services",
  "SÚZ · Historie Masarykovy koleje": "SÚZ · History of Masaryk Hall",
  "ČVUT · Otevření rekonstruovaného B4, 20. 6. 2024":
    "CTU · Opening of refurbished B4, 20 June 2024",
  "Registr smluv · SÚZ / SU, nájem školicího centra 2024":
    "Contract Register · SÚZ / SU, training centre lease 2024",
  "3D tisk SH · primární projektová stránka":
    "SH 3D printing · primary project page",
  "AVC.SH · primární projektová stránka": "AVC.SH · primary project page",
  "Fotbálek SH · primární projektová stránka":
    "SH foosball · primary project page",
  "Fotbálek · starší detail": "Foosball · older detail page",
  "Fotokomora · primární projektová stránka": "Darkroom · primary project page",
  "GameDev · primární projektová stránka": "GameDev · primary project page",
  "Hudebny SH · primární projektová stránka":
    "SH music rooms · primary project page",
  "MacGyver – bastlíři SH · primární projektová stránka":
    "MacGyver – SH makers · primary project page",
  "SH liga ve stolním tenise · primární projektová stránka":
    "SH table tennis league · primary project page",
  "SHerna · primární projektová stránka": "SHerna · primary project page",
  "SHOW · Silicon Hill Open Wednesday · primární projektová stránka":
    "SHOW · Silicon Hill Open Wednesday · primary project page",
  "Taneční na Strahově · primární projektová stránka":
    "Dancing in Strahov · primary project page",
  "Včely na Strahově · primární projektová stránka":
    "Bees in Strahov · primary project page",
  "Zahrádky · primární projektová stránka": "Gardens · primary project page",
  "Historický pohled na kolejní areál · 17. 10. 2012":
    "Historical view of the campus · 17 October 2012",
  "Původní soubor bez úprav; v rozhraní se přizpůsobí šířce.":
    "Original file without edits; scaled to fit the interface width.",
  "Historický pohled na Velký strahovský stadion · 27. 8. 2005":
    "Historical view of Great Strahov Stadium · 27 August 2005",
  "che; soubor obrazově upravil Miraceti, Wikimedia Commons":
    "che; image edited by Miraceti, Wikimedia Commons",
  "Publikovaná verze Miraceti z 15. 11. 2005; v projektu beze změn.":
    "Published Miraceti version of 15 November 2005; unchanged in this project.",
  "Orientační plán B6 z wiki · datum vyhotovení neuvedeno":
    "B6 orientation plan from the wiki · creation date not stated",
  "Přispěvatelé Silicon Hill Wiki": "Silicon Hill Wiki contributors",
  "Kopie již ověřeného referenčního souboru bez úprav.":
    "Unmodified copy of the previously verified reference file.",
};
type TranslatedEntry = {
  title: string;
  summary: string;
  paragraphs: string[];
  tags: string[];
  steps?: string[];
};
const entries: Record<string, TranslatedEntry> = translation.entries;
for (const entry of journal.entries) {
  const translated = entries[entry.id];
  if (!translated) continue;
  labels[entry.title] = translated.title;
  labels[entry.summary] = translated.summary;
  for (const field of ["paragraphs", "tags", "steps"] as const)
    entry[field]?.forEach((text, index) => {
      const value = translated[field]?.[index];
      if (value) labels[text] = value;
    });
}
export const contentMessages: Readonly<Record<string, string>> =
  Object.freeze(labels);
