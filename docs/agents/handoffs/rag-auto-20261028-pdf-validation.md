# KEY-67 · omezený živý OpenAI PDF pilot

Vlastník `rag-auto-pdf-validation-01a17e9d`, pracovní kopie `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`. Přesný stabilní adapter checkpoint: commit `a5ac67d1`, source SHA `57372e7a9e951ae10a625527fc2dfbe243c40eb8865602cc28cd2d507bb3c024`, test SHA `a07285407678c0952a51c7a01e7a50aea11ab40ba581cd5da2a54a0a8a0af3ee`. Před voláním 67/67 testů, strict TS a uzavřené nezávislé review. Během pilotu se adapter neměnil.

## Plán, zdroje a rozpočet

Před jakýmkoli API uložen `plan.json`, hash `8530808fe075db5b4575cd59d57f0b9f58a857d7499bfe2894bd75921d810505`. Profil `4a39d75cb77d0b07333432025e25e023cb780481fab87dffaf955be6671950c8`, gpt-6.1-sol/low, detail high, input cap20000/output cap8192 na převod. Počet stran/bajty/hash znovu ověřil lokální pypdf; oba zdroje mají jednu stranu. Čtecí kontrola obou původních renderů a `preflight-oracle.json` předcházely modelovým voláním. PDF textová vrstva prvního zdroje má7820 znaků, druhý zdroj žádnou.

- Smlouva:198187 B, SHA `8ef4883e3ee2bdc4788425db2cb428a53574cf6aa7e4ebad664d26756ad82a62`.
- Obrazový návod:96519 B, SHA `c8fa5f785f4fad80cba311a560665b4dfef1f2bcfd45ade7ce8b2c4618b4023b`.

Všechny rezervace vznikly před HTTP v append-only hashovaném ledgeru s fsync; jeden proces chránil vlastní lock. Skutečné čerpání: **2 count + 2 extraction =4 HTTP**, všechny potvrzené,0fail/0uncertain/0retry. Rozpočet je vyčerpaný; žádné další volání do něj nepatří. Opětovné spuštění již provedeného případu v novém procesu bylo odmítnuto před HTTP a nezměnilo ledger. Klíč četl jen root ze známého soukromého souboru; žádný klíč, raw PDF nebo celý kandidát není v Git.

## Výsledky a hranice kvality

Smlouva: count2710, generation input2710/output2627/total5337, z output21 reasoning. Převod přibližně17,54 s,1strana/56bloků, unresolved0. Oba jazyky a sloupce zůstaly celé; všechny nadpisy i číselné výskyty zachované. Z1166 nativních word výskytů je1160 přímo stejných; zbytek odpovídá třem znovu spojeným slovům rozděleným původní textovou vrstvou. Čtecí kontrola potvrdila číslované klauzule, negace a prázdné formulářové/signaturní popisky. Změna pořadí úvodních bloků odpovídá správnému čtení po jazykových sloupcích; nejde o výběrové shrnutí.

Screenshot: count1788, generation input1788/output330/total2118, reasoning0. Převod přibližně5,32 s,1strana/16bloků, unresolved0. Všechny předem označené textové popisky a data byly přítomné; zachované dvojice kolej04/08, plán od/do a zaškrtnuté políčko. AI zachytila také21.10.2026, které předchozí lokální OCR vynechalo. Jde o **ukázkový stav formuláře**, ne aktuální deadline nebo stav uživatele. Vybraná položka seznamu a červené zvýraznění nejsou ve výstupu plně označené, ačkoli model nevyplnil unresolved; nulová modelová nejistota tedy neprokazuje úplné zachování vizuálního významu.

Potvrzené generation usage souhrnně: input4498/output2957/total7455, reasoning21 jako podmnožina output, cached input0, cache writes4492 jako podmnožina input. Count endpoint vrací skutečný počet input tokenů, ale jeho účtování jsme nedoložili; **billing zůstává unknown, nikoli nula**. Přístup k oběma endpointům a modelu byl tímto pilotem skutečně ověřen. Ceny/rychlost jiných modelů, dlouhé PDF a složité tabulky tento pilot neporovnává.

## Artefakty, předání a úklid

Raw receipts, původní reference, kandidáti, `assessment.json`, plán a ledger jsou jen `.cache/rag-auto-pdf-validation-20261028/`. Veřejná očištěná [evidence](../../rag-ingestion/20261028/pdf/live-evidence.json) obsahuje identity, počty, usage a hranice výsledků, nikoli celé cizí dokumenty; request IDs jsou pouze hashované. Přesný private-value scanner kontroloval214 relevantních souborů s0shodami.

Nebyly spuštěny DB, embeddingy, crawl, herní/serving procesy, GPU, build ani instalace. Node/Python helpery skončily; vlastní lock odstraněn po ověření vlastnictví. Následuje skutečný release paid validační rezervace.

Tento výsledek podporuje měřený OpenAI převod problematických PDF. Není to automatické přijetí celé extrakce do RAG, normalizer ani důkaz kvality všech formátů/zdrojů. Pro screenshot je nutné uchovat kontext ilustračního návodu a přiznané vizuální omezení; pro celý corpus následuje samostatná normalizace, kvalita a publikace.
