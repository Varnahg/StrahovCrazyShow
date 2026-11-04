# Dokončení měřicího postupu — 3. 11. 2026

Problém: opakované starty před rozborem logů a nepozorovaný výpadek sběru prodlužují výkonové změny.
Hypotéza: povinná otázka před během, kontrola skutečné telemetrie a automatický souhrn odstraní tyto konkrétní slepé pokusy.
Změna: stručná pravidla AGENTS, aktuální výkonový návod a monitor zapojený do stávajícího render-next harnessu.
Metrika: správná klasifikace dokončení, chyb a chybějících dat; vykázaný čas startu, měření a zbývající režie.
Správnost: pouze main, žádné kopie projektu; nezměněné herní readiness/timeouty; pouze vlastní procesy/STOP; raw evidence zůstává.
Přijetí: cílené testy úspěchu, nesprávné identity, JSONL chunků/rotace, výpadku telemetrie a cleanupu; platné odkazy/katalog a nezávislé review; samostatný commit.

Volba: malý Node monitor kolem existujícího serve a systémového sampleru. Pouhá další pravidla by nezachytila výpadek sběru; univerzální nový řadič by rozsah zbytečně zvětšil. Monitor neovládá browser a neprohlašuje kandidát za rychlejší. Dřívější buildy a harness evidence zůstávají historickou identitou; nový běh vyžaduje nový build.

Po tomto commitu se uzavře jediný rozpracovaný kandidát syntax cache. CPU výsledky a C7 zůstávají oddělené od přijetí celé hry. Další optimalizační kandidát se před tím neotevře.

Ověření: monitor 19/19 testů, harness identita a časné zrušení 3/3, syntaktická kontrola, katalog a místní odkazy PASS. Nezávislé review našlo nevyčtený backlog před success a ztracený STOP před mkdir; obojí opraveno s regresí, čtecí ověření oprav bez zbylého nálezu. Dodatečná regrese odmítá output-limit sampleru i v cleanup race. Root převzal oba dokumentované autorovy scopes; žádná hra ani GPU neběžely. Build elapsed je uložen v novém manifestu/runtime odděleně od pozorování startupu.
