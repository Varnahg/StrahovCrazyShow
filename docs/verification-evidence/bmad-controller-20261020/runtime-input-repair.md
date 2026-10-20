# Oprava předávání BMAD vstupů po živém pilotu

## Reprodukce a mechanismus

Původní řadič z PR#10 prošel místní sadou i skutečnou GitHub CI (na Linuxu1578/1578). Živý Windows pilot však prokázal chybějící integrační scénář: sandboxovaný planner nedokázal číst step2/template a dva reviewers své lens instrukce. [Původní výstupy](pilot-input-delivery-failure.json) zůstaly uložené; exit0 samotného Codex procesu není důkaz provedeného review.

[Měření ACL](pilot-snapshot-acl.json) ukazuje chráněný snapshot adresář s OWNER RIGHTS, SYSTEM a Administrators. Přístupná specifikace v _bmad-output dědí také CodexSandboxUsers. Renderer používá tempfile.mkdtemp a přejmenování staging adresáře; žádný symlink nebyl nalezen. Přesná tvorba ACL Pythonem nebyla trasována. Příčinu nelze obecně ztotožnit s gitignored souborem: doložený rozdíl tvoří konkrétní ACL a skutečné EACCES.

Samostatná logická mezera: plan gate kontroloval intentGaps, ale provozní blokace byla pouze v prose risks. Prázdné otázky na uživatele neznamenají připravené runtime vstupy.

## Varianty a volba

- Změnit ACL snapshotu nebo sandbox: širší oprávnění a zásah do rendereru/runtime nejsou pro předání již autorizovaných instrukcí potřeba.
- Upravit instalovaný BMAD renderer: jde o samostatnou verzovanou údržbu s dopadem na všechny jeho uživatele. Neřeší samo o sobě chybějící readiness gate ani délku procesních argumentů.
- Kopírovat snapshot do dalších přístupných souborů: možné, ale přidává výstupy, rezervace a druhou kopii, jejíž konzistenci by bylo nutné stále ověřovat.
- Předat řadičem načtené a hashově ověřené instrukce přes stdin: zvolená varianta. Odstraňuje závislost na čitelnosti renderer adresáře ze sandboxu a limit dlouhého argv. Oprávnění se nemění. Blind/verification nezískají claims; edge je dál čte až v předepsané pozdní fázi z dostupné specifikace.

Nový protokol musí mít explicitní ready/runtimeBlockers oddělené od intentGaps. Existující dokončený plan dostane samostatné stabilní čtecí ověření. Staré review pokusy se nejdřív dočekají nebo převezmou podle původních immutable requests/terminal receipts; nejasný stav zastaví další dispatch. Původní výsledky se nepřepisují.

Původní step04 výslovně ponechává diff v souboru. Legacy blind reviewer jej ve skutečném sandboxu dvakrát načetl přes Get-Content (exit0, úplný unified diff), proto tento dostupný vstup nemění transport. Přes stdin se předávají nedostupné instrukce; edge claims zůstávají pozdní čtení. Skutečné místní `codex exec --help` potvrdilo, že jediný prompt argument `-` načítá instrukce ze stdin. Žádný přepínač pro obejití sandboxu se nepoužívá.

## Zachování rozpracované práce

Controller byl zastaven na review před commitem/PR. Původní implementace dokončena pod jediným attemptem; [baseline](pilot-upgrade-baseline.json) váže její soubory, sourceDigest, frozen spec, vlastníky a identitu běhu. Checkpoint ani receipt nebyly ručně upraveny. Po ověření opravy se použije běžné resume.

## Stav ověření

Autor ověřil cílené subsety8/8 a7/7, potom celý adaptér45/45 PASS (244.489s), strict TypeScript, Prettier a git diff check exit0. Regrese zahrnují skutečný subprocess přenos více než64KiB UTF-8, tamper/start/fail-exit, povinné podklady každé role, explicitní blockers, živý/poškozený/chybějící/EACCES receipt, tři přerušené hranice přechodu, opakované resume bez nového dispatch a přechod po commitu s nezměněným stromem.

Zdrojový bundle autora: `a5b0c51e34c6db357fdf1f171f720536a7009f81ba2371f6aa68b44acf6ae2d7`. Parent připravil šestisouborový review diff včetně návodu, SHA256 `789b634311211e8351238dfe7a67c166399798f396863a698523948864d4d053`. Nezávislý recheck a skutečné obnovení modelového pilotu ještě nejsou v tomto checkpointu potvrzené.

[Následné nezávislé review](review-delivery-v2.md) přineslo pět skupin oprav. Všechny jsou patch: zachování platných původních nálezů, úzké rozpoznání vlastní legacy review evidence, první nezapsaný spec, převzetí už provedeného merge a regrese pořadí živé implementace/readiness. Výše uvedených45/45 je historický lokální checkpoint před těmito opravami; není vydáván za finální přijetí.

Všechny cílené rechecky poté nálezy uzavřely. Integrátorův první plný běh měl49/50: jediný fixture worker exit1 bez zachovaného podrobného stderr/receipt. Příčina zůstává neprokázaná; přesný scénář ve třech omezených opakováních prošel. Doplněna pouze diagnostika před cleanup a její native exit7 test, bez produkčního workaroundu či retry. Nezávislý verification recheck ověřil nezměněné původní assertions.

Finální celý adaptér: **51/51 PASS**,0 fail,0 skip. [Přesné zdroje, časy a log hashe](repair-final-validation.json) uchovávají také původní49/50. Aktuální devítisouborový bundle je `57d41d4b032aa5172f4944ca07eab92fa36fcf46d628b473e61c44330d435963`; všech8 produkčních souborů po cíleném rechecku zůstalo stejných. Skutečné obnovení modelového pilotu a GitHub přijetí opravy následují.
