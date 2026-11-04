# Ultra 50 % a vlastní grafika — aktuální checkpoint

Koordinátor `ultra-20261104-root`; existující větev `codex/graphics-smoothness-20261104` v `D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104`. Základ `bf0a6550e0aa46eddcfa33cb8c76fd207d6592bc`. Uživatel nově výslovně požaduje PR a merge do main po dokončení. C checkout má souběžnou cizí větev a rozpracované změny; nepřepínat ani nepřepisovat.

## Stav 4. 11. 2026, 21:58 UTC

Implementované preference V2, resolver, společný panel před hrou i během hraní, Ultra a vlastní volby. Leaf implementace vegetace/mraků a světel/postprocess jsou předané s cílenými testy. Game používá transakci Apply se samostatným stavem, zachovaným ready a sítí, neutrálními vstupy, jediným vlastníkem vizuální přípravy, potvrzením po dokončeném snímku a rollbackem. Diagnostika/export rozlišují skutečně aplikovaná nastavení, revizi a fázi změny.

Uživatelský test `bc908fab-bd90-4044-8001-9cbed95fd5c5` je archivovaný v [evidenci](../../performance/evidence/ultra-graphics-20261104/user-playtest/receipt.json). Záznam má 7689 položek; původní server, sampler a rezervace jsou uklizené. Zachované omezení: pohybové Low/High úseky nebyly srovnatelné A/B a pětisekundové pauzy tím nejsou vysvětlené ani opravené.

Cílená původní Game sada: 138/138 PASS; následné skutečné Apply regrese po review 13/13, light readiness 25/25. Render-startup helper 29/29, lighting/cinematic celek 45/45, flower/grass hranice 31/31. Export včetně transitionPhase 22/22, transakční helper 6/6, storage 10/10 a skutečný replay wrapper 1/1. Nejde o součet unikátních testů: sady se překrývají a průběžné checkpointy jsou rozepsané v předáních. Rootův závěrečný scoped strict TypeScript nad Game, transakcí, rendering gate, cinematic a jejich testy prošel; katalog 628 úkolů a diff-check také PASS. Tyto kontroly nejsou náhradou celé sady ani Edge/GPU.

Review opravy jsou předané: JSON hranice trávy i květin, autoClear vlastnictví, modální focus, skutečné storage/replay, policy-aware FAR readiness, obnovitelný deadline s fatálními skutečnými GPU chybami a opakovaný potvrzovací snímek nad ready rendererem. Nezávislý post toggle zachová WebGL materiálové barvy; interní snapshot barev umožní pravdivý rollback změny kvality. Poslední review adaptéru uzavřeno; následný okraj návratu do High má 2/2 parametrizované rollback regrese s kontrolou skutečného obnoveného snímku. Úplná triage je ve SPEC. Archiv je commitnutý jako f32e274c, runtime celek jako 4ad9725d a publikovaný v [draft PR41](https://github.com/Varnahg/StrahovCrazyShow/pull/41).

První plné CI na 4ad9725d: 3189 testů, 3179 PASS, 8 FAIL, 2 SKIP; build a SDK byly správně přeskočené po selhání. Feedback browser a source hygiene prošly. [Úplný log a identita](../../performance/evidence/ultra-graphics-20261104/ci/4ad9725d.json) zůstávají zachované. Všech osm selhání bylo místně reprodukovaných: pět avatarových fixtures obcházelo Game konstruktor bez adaptive pole; druhý authored-light VM fixture postrádal nový grafický stav/resolver. Oprava v c3854084 doplnila pouze inicializaci testů; původní aserce, limity i produkční kód zůstaly. Dotčené sady pak 13/13 a 11/11 PASS.

Druhé [plné CI na c3854084](../../performance/evidence/ultra-graphics-20261104/ci/c3854084.json): **3187 PASS, 0 FAIL, 2 SKIP**. Build následně zjistil pět TS7006 ve fetch mock parametrech testu vegetace; SDK přeskočeno. Doplněny pouze typové anotace, přísná kontrola se skutečnými tsconfig přepínači prošla. Předchozí omezená kontrola leafu bez strict byla nedostatečná a handoff to výslovně opravuje. Žádná herní změna ani oslabení přejímky.

## Další krok

Dokončit celkové testy/build/SDK v CI na opraveném checkpointu. Místní heavy-validation/GPU/workspace-build/2568 stále vlastní KEY-73; claim Ultra validation byl správně odmítnut. Po uvolnění připravit neměnný produkční Edge build a místní runtime ověření. [Předem určené měření](../../performance/evidence/ultra-graphics-20261104/MEASUREMENT.md) má 48 desetisekundových intervalů, tři prokládaná opakování osmi variant ve dvou pohledech. Poté evidence a přejímka, ready PR a autorizovaný merge. Výkonový přínos zatím není prokázaný a žádná vlastní testovací scéna neběží.

Uživatel ve 21:53 UTC výslovně povolil koordinaci s chatem „Uprav chat a odpovědi AI“ (01a1a80f-d5fa-74c1-b137-7d030ba06b9d). Chat potvrdil krátké dokončení kontroly úvodního AI panelu a následné uklizení procesů/uvolnění claimu; čekáme na skutečné potvrzení. Navrženo sloučení PR41 před PR42, potom krátký chat HUD smoke na novém main. Jeho WebGL Medium startup skončil timeoutem, nikoli platným prvním snímkem; tento cizí neúspěch se nepřebírá jako přejímka. Samostatný task Ultra record později zapíše docs/verification.md, které zatím vlastní KEY-73 verification-record. Browser dokumentace a viewport API jsou načtené, Edge binding id3 zůstává vybraný; nebyla otevřena nová scéna ani změněn viewport.

## Rozsah a předání

Autoritativní scope je v task JSON a živém registru. Převzaté výsledky: [UI](ultra-graphics-20261104-ui.md), [vegetace](ultra-graphics-20261104-vegetation.md), [světla](ultra-graphics-20261104-lighting.md), [Game testy](ultra-graphics-20261104-game-tests.md). Nesouvisející C změny a server 8080 zůstávají zachované. Linear KEY-5 aktualizován komentářem `1cc36abf-4f59-44fc-b306-7128809fcfae`.
