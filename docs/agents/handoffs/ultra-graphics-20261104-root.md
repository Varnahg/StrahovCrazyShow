# Ultra 50 % a vlastní grafika — aktuální checkpoint

Koordinátor `ultra-20261104-root`; existující větev `codex/graphics-smoothness-20261104` v `D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104`. Základ `bf0a6550e0aa46eddcfa33cb8c76fd207d6592bc`. Uživatel nově výslovně požaduje PR a merge do main po dokončení. C checkout má souběžnou cizí větev a rozpracované změny; nepřepínat ani nepřepisovat.

## Stav 4. 11. 2026, 21:19 UTC

Implementované preference V2, resolver, společný panel před hrou i během hraní, Ultra a vlastní volby. Leaf implementace vegetace/mraků a světel/postprocess jsou předané s cílenými testy. Game používá transakci Apply se samostatným stavem, zachovaným ready a sítí, neutrálními vstupy, jediným vlastníkem vizuální přípravy, potvrzením po dokončeném snímku a rollbackem. Diagnostika/export rozlišují skutečně aplikovaná nastavení, revizi a fázi změny.

Uživatelský test `bc908fab-bd90-4044-8001-9cbed95fd5c5` je archivovaný v [evidenci](../../performance/evidence/ultra-graphics-20261104/user-playtest/receipt.json). Záznam má 7689 položek; původní server, sampler a rezervace jsou uklizené. Zachované omezení: pohybové Low/High úseky nebyly srovnatelné A/B a pětisekundové pauzy tím nejsou vysvětlené ani opravené.

Cílená původní Game sada: 138/138 PASS; následné skutečné Apply regrese po review 13/13, light readiness 25/25. Render-startup helper 29/29, lighting/cinematic celek 45/45, flower/grass hranice 31/31. Export včetně transitionPhase 22/22, transakční helper 6/6, storage 10/10 a skutečný replay wrapper 1/1. Nejde o součet unikátních testů: sady se překrývají a průběžné checkpointy jsou rozepsané v předáních. Rootův závěrečný scoped strict TypeScript nad Game, transakcí, rendering gate, cinematic a jejich testy prošel; katalog 628 úkolů a diff-check také PASS. Tyto kontroly nejsou náhradou celé sady ani Edge/GPU.

Review opravy jsou předané: JSON hranice trávy i květin, autoClear vlastnictví, modální focus, skutečné storage/replay, policy-aware FAR readiness, obnovitelný deadline s fatálními skutečnými GPU chybami a opakovaný potvrzovací snímek nad ready rendererem. Nezávislý post toggle zachová WebGL materiálové barvy; interní snapshot barev umožní pravdivý rollback změny kvality. Poslední review adaptéru uzavřeno; následný okraj návratu do High má 2/2 parametrizované rollback regrese s kontrolou skutečného obnoveného snímku. Úplná triage je ve SPEC. Archiv je commitnutý jako f32e274c; následuje integrační commit kódu, jeho finální celková/GPU přejímka je nadále otevřená.

## Další krok

Po posledním review commitovat stabilní kód a připravit draft PR pro souběžné vzdálené CI. Místní heavy-validation/GPU/workspace-build/2568 stále vlastní KEY-73; claim Ultra validation byl správně odmítnut. Po uvolnění provést stabilní plné testy/build/SDK a neměnný Edge build. [Předem určené měření](../../performance/evidence/ultra-graphics-20261104/MEASUREMENT.md) má 48 desetisekundových intervalů, tři prokládaná opakování osmi variant ve dvou pohledech. Poté evidence a přejímka, ready PR a autorizovaný merge. Výkonový přínos zatím není prokázaný a žádná vlastní testovací scéna neběží.

Pro zprávu konkrétnímu souběžnému chatu „Uprav chat a odpovědi AI“ nástroj vyžaduje přímou autorizaci uživatele; textová otázka k předání validačního okna je pending. Bez odpovědi se žádná zpráva neposílá a cizí rezervace se nepřebírá. Samostatný task Ultra record později zapíše docs/verification.md, které zatím vlastní KEY-73 verification-record. Browser dokumentace a viewport API jsou načtené, Edge binding id3 zůstává vybraný; nebyla otevřena nová scéna ani změněn viewport.

## Rozsah a předání

Autoritativní scope je v task JSON a živém registru. Převzaté výsledky: [UI](ultra-graphics-20261104-ui.md), [vegetace](ultra-graphics-20261104-vegetation.md), [světla](ultra-graphics-20261104-lighting.md), [Game testy](ultra-graphics-20261104-game-tests.md). Nesouvisející C změny a server 8080 zůstávají zachované. Linear KEY-5 aktualizován komentářem `1cc36abf-4f59-44fc-b306-7128809fcfae`.
