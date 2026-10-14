# Předání společného výzkumu a první volby

Koordinátor `repairs-01a13624-research-root` převzal tři samostatné výzkumy: B6/render, síť/kamera a vizuál/světlo. Předané dokumenty mají skutečné logy, primární sources, reproduktory, alternativy a vyznačené nejistoty. Společný decision-register a AGENTS nový uživatelský postup byly commitnuté do lokální main v10fa69b057b90696f1eaadc0b520caceb0dfbf44. Žádná obecná celková oprava nebo GPU přejímka se tím netvrdí.

První přijatá volba B6-01 je úzký bezpečný pivot read + scratch-toRef. Po cílených testech, nezávislém review a plné878test/build/integraci vznikl samostatný commit f63039b4067d57c8bdbe560ead5719cfc05cbb0d v managed worktree. Její snapshotcbc158… je oprotiwave3 přesně B6+novýtest. Uživatel odložil grafický krok; runtime do main zatím nezačleněn. Výzkum dalších oblastí je připraven k navazujícím samostatným rozhodnutím, ne k neformálnímu rozšíření tohoto fixu.

Praktický test má připravené neměnné baseline/candidate prostředí, počasí, trasu a bezpečný lifecycle služeb. Žádné vlastní helpery tohoto research tasku neběží. Root uchovává všechny logy, cizíWIP a známé limity; Linear obsahuje aktuální milníky a lokální commit identity. Následuje release výzkumné rezervace; celkovýgoal zůstává nevyřešený.

## Navázání a předání na později — 14. 10. 2026

Stejný root znovu převzal svůj rozhodovací dokument a handoff podle předchozí evidence. Doplnil výzkumnou volbu IMAGE-01 a její skutečný nepřijatý výsledek: 1/7 před změnou, 5/7 po změně, prokázaný ThinIP observer leak; původní testy 8/8 a úzké typy PASS nejsou náhradou dvou červených disposal regresí. Nové rozhodnutí preferuje samostatný pinovaný ownership patch před další klientskou změnou. Přesné cesty/hashes a porovnání variant jsou v decision-register; zdrojový agent předal kandidáta a uvolnil rezervaci.

Linear KEY-17 je nové Todo a blokuje KEY-4/14/11. Projekt i tyto issues mají aktuální stav a výslovně odloženou GUI přejímku. B6 f63039b zůstává kandidát mimo main, beze změny dřívějších 878 PASS důkazů. Žádné runtime/dependency změny v této navazující dokumentaci. Na další implementaci je připravený přesný task s oddělenou instalací; není to aktivní claim ani hotová oprava.
