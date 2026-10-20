# BMAD řadič jednoho přiděleného úkolu

Řadič zpracovává jediný explicitní Linear issue a jeho předem připravené projektové tasky. Nemá plánovač backlogu. Vstupem je verzovaný JSON manifest; příklad je [pilot KEY-47](assignments/bmad-controller-pilot-20261020.json) s [konkrétním zadáním](assignments/bmad-controller-pilot-20261020.md).

```powershell
node scripts/autodev.mjs run --assignment docs/agents/assignments/bmad-controller-pilot-20261020.json
node scripts/autodev.mjs status --run ID_Z_VYSTUPU
node scripts/autodev.mjs resume --run ID_Z_VYSTUPU
```

Volitelný `--repo CESTA` určuje výchozí Git checkout. Standardní výstup je JSON. `status` nic neopravuje ani nespouští; ukazuje uložený krok a aktuální dostupnost procesu. Opakované `run` se stejným issue a nezměněným manifestem používá tutéž identitu. Změněné zadání nesmí potichu přepsat běžící run. Exit kódy: 0 úspěšný výsledek, 1 zastavený krok/chyba, 2 nejasný stav, 3 obsazený řadič. U status platí kódy podle zobrazeného uloženého stavu.

## Příprava
Potřebné jsou Node24, Git/Git LFS, autentizované `gh`, `uv` pro připnutý projektový BMAD a autentizované Codex CLI. Linear používá připojení Codex Apps přes lokální `codex app-server`; žádný token se nekopíruje do manifestu. Toto rozhraní bylo prozkoumáno na CLI0.163.0-alpha.10.2 a je experimentální. Nepodporovaná verze či nedostupné připojení musí skončit čitelnou chybou.

Koordinátor před spuštěním připraví v administrativní rezervaci dva disjunktní tasky: `task` pro BMAD výstupy/renderer/předání a `workerTask` pro změny zdrojů a testů. Manifest obsahuje přesné issue, repository/baseBranch, intentFile, artifactDir, handoffFile, příkazy kontrol a popis praktické přejímky. V1 automaticky přijímá pouze explicitní CLI úkoly; GPU/vizuální přejímku nelze nahradit zeleným testem.

Řadič ověří původ checkoutu, založí jednu stabilní větev `codex/autodev-…` a worktree, získá rezervace a jejich rozsah zmrazí. Nevstupuje do cizích dirty změn a nepřebírá zastaralé claims. Neplatná rezervace zastaví práci před prvním zápisem workeru.

## Průchod a integrace
Plánovací krok používá připnutý BMAD snapshot a jeho šablonu; řadič vytváří spec.md s výchozím commitem a neměnným zadáním. Nevyjasněný podstatný požadavek zastaví implementaci. Následuje samostatný implementační worker, původní blind/edge/verification review postupy ze snapshotu a skutečné kontroly. Pomocný status specifikace done znamená dokončené lokální ověření; Linear Done nadále vyžaduje merge a main CI. Modelové tvrzení o úspěchu není exit code testu. Zdrojový kandidát včetně testů má vlastní obsahovou identitu; změna po review ruší platnost příslušných důkazů.

Řadič předává hashově ověřený obsah instrukcí přes standardní vstup. Worker tak nemusí otevírat chráněný adresář rendereru a dlouhý prompt nenaráží na limit argumentů procesu. Plán výslovně rozlišuje otázky na uživatele, provozní blokace a připravenost; prázdný seznam otázek sám nestačí. Nezávislé review zachovává své vstupy: blind a verification nedostávají claims, edge načítá specifikaci až v předepsané pozdní fázi.

Commit používá konkrétní vlastní soubory. Publish dohledá existující PR ve všech stavech. Přijetí vyžaduje aktuální head/base, úspěšné povinné GitHub checky a doloženou praktickou přejímku podle [CI pravidel](ci.md). Merge používá očekávané head SHA a neobchází ruleset. Linear `Done` přichází až po merge a CI pro tento merge commit na main. Katalogový task administrativně přebírá koordinátor.

## Pád a obnovení
Stav, provozní logy a výsledky pokusů jsou v Git common directory pod `autodev/runs/`. Necommitují se. Jeden controller drží OS IPC singleton; souběžné `resume` nesmí vytvořit druhého zapisujícího vlastníka.

Worker běží pod odděleným supervisorem s vlastní identitou a trvalým výsledkem. Po pádu controlleru může dokončit a udržovat heartbeat. `resume` převezme právě tento výsledek nebo naváže sledování; neopakuje spawn podle stáří či PID. Pokud zmizí supervisor bez terminálního výsledku, stav je `unknown`. Vyžaduje doložení skutečného stavu procesů; automatický retry by mohl vytvořit dvojí práci.

Známé selhání testu/review zachová log a zabrání integraci. V1 neobsahuje neomezený automatický repair loop. Provozní JSON nesmaž ani neupravuj jako prostředek „opravy“; mohl by tím zaniknout důkaz již provedené mutace.

Přechod starého běhu na protokol předávání vstupů2 je omezený opravný krok: zachová původní plán a dokončenou implementaci, dočká/převezme původní review procesy podle jejich uložených requestů a receipts a přidá samostatné čtecí ověření připravenosti a review s novými stabilními klíči. Při nejasném výsledku původního procesu další worker nevznikne. Historické neprovedené review se nepočítá jako úspěch; opakované resume neopakuje již zahájený opravný krok.

Pro kontrolovaný test pádu lze nastavit `AUTODEV_TEST_CRASH_AT=after-pr-create`. Řadič se úmyslně ukončí po vytvoření PR před uložením jeho lokálního checkpointu. Jednorázový marker zamezí opakovanému pádu při resume. Tento režim používej pouze pro přidělený testovací run; změna kódu ani ochrany main není potřeba.

## Lokální procesní kontroly
`node scripts/test-autodev.mjs` spouští cílené testy včetně skutečného ukončení controlleru/supervisoru, souběžného resume a poškozeného receipt. Používá vlastní dočasné repozitáře a lokální fixture; tento příkaz nevytváří živé PR ani Linear issue. Skutečná přejímka používá přidělený manifest a autentizované služby.

## Důkazy a omezení
[Výzkum a volba variant](../verification-evidence/bmad-controller-20261020/research.md) oddělují ověřené mechanismy od návrhu. Živé výsledky a konkrétní PR doplní přejímací evidence. V1 cílí na Windows a Linux; síťový backend závisí na dostupnosti GitHub/Linear a podporované verzi Codexu. Procesní crash test není důkaz odolnosti proti výpadku napájení ani proti pádu všech supervisorů.
