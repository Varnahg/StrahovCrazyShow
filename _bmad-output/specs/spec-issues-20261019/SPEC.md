---
id: SPEC-issues-20261019
companions:
  - ../../../docs/analysis/issues-20261019/consolidation.md
  - ../../../docs/analysis/issues-20261019/rendering.md
  - ../../../docs/analysis/issues-20261019/movement.md
  - ../../../docs/analysis/issues-20261019/performance.md
sources: []
---

# BMAD podklady a konsolidace stávajících issues

## Why

Backlog míchá uživatelské symptomy, konkrétní implementační mechanismy a opakovanou přejímku již hotových portů. Uživatel potřebuje podklady pro rozhodnutí o řešení a přehledný společný optimalizační celek, aniž by se ztratily požadavky nebo převzala cizí rozpracovaná práce.

## Capabilities

- **CAP-1**
  - **intent:** Uživatel u každého původního issue rozliší doložený stav, neověřenou příčinu a konkrétní další krok.
  - **success:** Všechny43 původní identifikátory mají právě jednu samostatnou analytickou sekci; otevřené položky obsahují varianty, důvod volby, soubory/refaktoring a testy i praktické přijetí.
- **CAP-2**
  - **intent:** Backlog zachová požadavky a historii při sloučení přejímek a vyřazení již nepožadované položky.
  - **success:** KEY-25/26/27/28 jsou Duplicate vůči33 s plně zachovaným původním rozsahem/prací/přijetím v33; KEY-13 je Canceled na přímý pokyn uživatele; původních10 Done se nemění.
- **CAP-3**
  - **intent:** Uživatel řídí související optimalizace přes jeden hlavní celek a vidí pořadí i odlišné podmínky dokončení.
  - **success:** KEY-5 zastřešuje3,4,8,9,10,16,20,22,40; podstrom22 zůstává zachován. Žádný parent ani blocker cyklus, žádná opačná blokace33→31.

## Constraints

- Zdrojová baseline je main `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`; cizí WIP, experimenty a historické výsledky se od ní odlišují.
- Společný cíl plynulosti nepředpokládá GPU bottleneck: CPU submission, shadery, uploady, GPU draw, vstupy a lifecycle vyžadují vlastní atribuci.
- Zápis jen do vyhrazených dokumentů a vlastních metadat, společný koordinační registr platí i v oddělené worktree.
- Linear je autoritativní backlog. Podklady nezakládají druhý seznam vlastníků ani automatickou frontu implementace. Původní požadavky issues zůstávají závazné; tento SPEC popisuje analýzu a uspořádání, ne novou architekturu hry.
- Žádný vizuální/performance celek se neoznačí Done na základě dílčího testu nebo publikace kódu.

## Non-goals

- Implementovat herní opravy, aktualizovat engine, přebírat worker/editor/deník WIP nebo měnit hrané buildy.
- Prohlašovat historické testy za nové ověření, spouštět GPU benchmark nebo obnovovat pozastavený široký vývojový cíl.

## Success signal

Po novém načtení Linear zůstává28 otevřených issues,4 Duplicate,1 Canceled a10 Done; všech43 má dohledatelný analytický podklad. Lokální dokumenty mají ověřené odkazy/pokrytí a uživatel dostane přímý odkaz na úplný přehled v Linear.

## Assumptions

- „Všechny stávající issues“ znamená celý projekt Strahov Crazy Show včetně dokončených pro kontrolu duplicit; úplný výpis týmu i projektu obsahoval stejných43 položek, GitHub neměl otevřená issues.
- Doporučené pořadí navazujících oprav je plán; samo nepřiděluje práci ani zdroje.
