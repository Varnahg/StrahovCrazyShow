# Předání: <task-id>

- Vlastník: <ID relace/agenta>; příjemce: <koordinátor/agent>.
- Pracovní kopie a větev: <absolutní cesta, větev>; výchozí commit: <SHA>.
- Výsledek: <co nyní funguje, částečné/hotové/blokované>.
- Změněné soubory: <přesný seznam, včetně testů a exportů>.
- Cizí rozpracované změny: <výchozí stav a co bylo výslovně převzato>.
- Podklady: <zdroj, datum, provenience; co je odhad>.
- Refaktoring: <co se sjednotilo; cache/alokace/lifecycle, nebo proč není relevantní>.
- Ověření: <příkaz/scénář, čas, exit code, výsledek, cesta k logu>.
- Snapshot/diff: <commit nebo manifest SHA-256 zahrnující také testy; dirty strom není identita checkpointu>.
- Procesy a zdroje: <vlastní příkaz/cwd/PID/port/výstup, ukončeno; živý proces zůstává pod původní rezervací, CLI nepodporuje atomický převod>.
- Omezení a další krok: <co neprošlo/nebylo spuštěno a konkrétní důvod>.
- Rezervace: <uvolněno kdy; nevyřešené změny nesmějí vypadat jako volné>.
- Integrátor: <co převzal, jeho kontrola, odkazy do docs/verification.md; stav tasku mění až on>.

U výkonu navíc zaznamenej GPU/ovladač, CSS a interní rozlišení, celou produkční hru, relace/avatary/HUD, kameru, světlo/počasí, délku a počet intervalů, FPS i p95/p99 a srovnatelnou výchozí variantu. U neúspěchu uchovej původní log; opakování jej nenahrazuje.
