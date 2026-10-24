# Průběžné převzetí CAD modelů — KEY-59

Koordinátor `cad-buildings-01a16b37-publication`, příjemce stejného uživatelského zadání. Pracovní kopie `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/cad-building-models`, výchozí commit `c713c2aedcafdb02358f05e4c9c51b607edeebc4`.

## B1, příprava publikace 24. 10. 2026

Převzaty pouze vlastní vrchní výzkumné README a handoff po dokončeném výzkumném tasku. Modelový, přípravný, accessibility a koordinační scope mají samostatné rezervace; jejich předání zůstávají dokladem původu. Původní široký výzkumný claim není obnovován přes živé rezervace.

Připraveným výsledkem je editovatelný B1 R10 s odvozeným GLB a konstrukční kolizí. Modelová a vizuální přejímka je doložená v `docs/reality-pack/cad-buildings/b01/`. Tři nezávislé review skončily. Opravy testovacího reportu, chybové cesty alokace světa a vazby receptury na aktuální generátor prošly cílenými kontrolami i následným čtecím posouzením původních reviewerů. Čerstvá úplná příprava se strict přejímkou ještě čeká na skutečné vrácení heavy.

Předpokládaný commit přidává pouze nové CAD assety, vlastní nástroje, tasky, předání, podklady interpretace a B1 specifikaci. Originální DXF/DWG/TXT/LOG, jejich obrazové/textové kopie, lokální receptury a původní IPR dlaždice se nestagují. Review pracovní diff je pomocný soubor, nikoli produktový zdroj.

Původní main má cizí necommitnutý WIP; přečtený index byl prázdný. Do cizích cest se nezapisuje. Druhý chat „Navrhni hlášení chyb a feedbacku“ výslovně potvrdil, že nové dosud neimportované B1 cesty nekolidují s jeho scopes a neovlivní immutable source15. Před main integrací dostane přesný commit/diff. `docs/verification.md` vlastní on; zdejší evidence jej nepřepisuje.

Žádný commit ani main integrace dosud nejsou provedené. Žádná změna runtime, terénu, klient/server controlleru nebo hraného buildu. Ostatních 15 budov zůstává součástí původního zadání a dosud nebylo modelováno. Publikace B1 sama neuzavírá KEY-59.

## Převzetí modelového checkpointu09:26UTC

B1 R10 přijat. Čerstvý převod a strict162Python+28Node fixture testů PASS, celá receptura kromě nového generatorSha256 přesně shodná s původním vstupem R10. Původní modelový, exportní a vizuální důkaz proto zůstává platný bez regenerace meshů. Checkpoint19 zdrojových souborů včetně všech testů, tří assetů a dvou auditů: .cache/cad-buildings-20261024/publication/b01-source-checkpoint.json, SHA c13b05ac350e9f8d31790e827b755cab69516c7e3d892cb6ff3a361ca38eb215. Přesné hashe assetů a hraniční případy obsahuje modelový handoff/README. B1 modelový, přípravný a accessibility task převzaty jako done; koordinace a publikace všech16 budov pokračují.

Po modelovém přijetí uživatel změnil pořadí: dokončit tento commit, pozastavit další budovy a připravit oddělenou hru k vyzkoušení. Samostatná B1 runtime integrace nyní předchází B2; není součástí tohoto modelového commitu. Její task/snapshot vznikne až po koordinaci skutečných vlastníků vstupů.


Poslední zadání zúžilo scope na B1+B6. Přijaty samostatné modelové commity30c13354/dea1b67f a runtimea31f743a; ostatní budovy nezačínají. Aktuální přejímku obsahuje docs/reality-pack/cad-buildings/b01/runtime.md. Dřívější pending/16budov poznámky výše jsou historické. Primary-main134foreignWIPfiles nebyly převzaté ani stagované.
