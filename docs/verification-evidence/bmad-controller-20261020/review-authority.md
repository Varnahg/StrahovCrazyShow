# Review úplných projektových vstupů

20.10.2026. Tři nezávislí context-free revieweři dostali stejný čtyřsouborový diff SHA256 `1c47cc28578d23db2b110ae3b0acd4b934af71d74b5976a67654e782576b4e79`, základ `938254e3fe874de24b89ade193f8f8e5b7a95d6d`. Všichni byli spuštěni před zpracováním výsledků. Blind dostal pouze diff; edge četl claims až podle nativních instrukcí; verification bez claims. Žádný reviewer neměnil soubory ani spouštěl modelový pilot.

## Individuální verdikty před seskupením

1. **RA-E1 — medium, patch.** `codex.mjs:926–935`: matcher filtruje stdout na completed agent_message a přehlédne top-level error/turn.failed. Kombinace přesných dvou zpráv s takovou failure událostí může při exit0 povolit opravu. Root přečetl matcher i všechny předcházející receipt/input kontroly; ty ověřují exit/identity, nikoli tyto události. Úzká oprava musí explicitní failure historii odmítnout před výběrem zpráv, zachovat důkazy a nespustit náhradu. Běžný neúspěšný čtecí shell příkaz se tím nesmí zaměnit za selhání modelového turnu.
2. **RA-V1 — medium, patch testů.** Verification gap: původní fixture vytváří historický prompt produkčním `legacyBlindAuthorityPrompt()`, který zároveň definuje rozpoznání. Změna pevného slova tak změní vstup i očekávání bez regresního signálu. Doplnit nezávisle uchovaný původní text a skutečný native adapter průchod; nahradit lze jen proměnné cesty/identity. Read-only smoke nad skutečným pilotem tuto přenositelnou regresi nenahrazuje.
3. **RA-V2 — medium, patch testů.** Verification gap: `assertAuthoritySelection()` má pouze pozitivní resume pokrytí. Test musí po úspěšné opravě zaměnit attemptId vybraného review, obnovit checkpoint a ověřit REVIEW_INPUT, nulové nové workery a nezměněné originály. Produkční guard se nemění, pokud test potvrdí současné chování.

Blind vrátil `[]`. Tři nálezy mají různé kořeny, neslučují se. Všechny dostal původní autor k nejmenší opravě pod vlastním claimem; žádná produktová otázka, změna zadání nebo další oprávnění nevznikly. Původní snapshot a [validation](review-authority-validation.json) zůstávají zachované. Uzavření vyžaduje cílené testy a následný recheck; živý pilot zatím nepokračuje.

## Uzavření

Finální diff SHA256 `42b953e339dca257c8775267f50e8edb4c1ee0f2aacb001994f29cb941364acf`. Autor změnil pouze codex guard, testy a vlastní handoff; adapters zůstaly na SHA `5f9788841c039e6f34222a8675809f80a112a0014d233a3736df52ad9d7e2ca2`.

- RA-E1: explicitní error/turn.failed se odmítají před filtrováním zpráv. Dvě native regrese ověřují exit0 s touto událostí, opakovaný stop a nezměněné původní bytes bez nového dispatch. Happy fixture zachovává legitimní command_execution exit1. Původní edge reviewer potvrdil uzavření a přesné hashe.
- RA-V1: historický prompt/provenance tvoří nezávislá pevná předloha v testu; produkční fingerprint ji nevyrábí. Původní verification reviewer potvrdil skutečný native-worker/adapter průchod i citlivost na změnu pevného textu.
- RA-V2: po úspěchu se samostatně zamění edge a blind attemptId v kopii cache. Resume vrací REVIEW_INPUT a zachovává attempt keys, ledger, původní bytes i planning. Verification recheck potvrdil, že odstranění guardu nyní test odhalí, a původní pozitivní/crash aserce zůstaly zachované.

Cílený followup **3/3 PASS, 86.153s**, TypeScript, syntax, format a diff check exit0 podle [předání](../../agents/handoffs/bmad-controller-adapters-20261020.md). Revieweři pouze četli, nevydávají tyto běhy za vlastní měření. Celkem14 nových a4 dotčené původní scénáře mají zelený důkaz; [finální zdrojový manifest a přesné rozlišení běhů](review-authority-final-validation.json). Žádný otevřený nález ani odklad. Následuje skutečné resume a konečná GitHub CI.
