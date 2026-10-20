# Review řadiče — průchod1

20.10.2026. Všechny tři nezávislé vrstvy spuštěny společně; žádná přeskočena. Code/config/user-guide diff30 souborů, SHA256 `9a254b3e68e0b2fa1d356cfc647c9e3016eb240874bcbc1e1da699a1b70a438f`. Kompletní vlastní změna38 souborů má diff SHA256 `881f1959dbd663b2134364a9441f799fde07ca57a229a9aa34e56d4cefaa25c4`. Spec/contract/handoff/research tvrzení byla oddělena od společného source diffu; edge dostal claims_file až podle svého postupu. Integrátor četl změněné zdroje/testy i unified diff a doplnil vlastní kontrolu lifecycle.

Hodnocení provedeno až po všech třech výsledcích; převzatá reviewer priority se nepoužila. Každý nález má vlastní řádek před seskupením.

| ID / původ | Verdikt | Ověření a dopad | Směr |
| --- | --- | --- | --- |
| B1 blind: spec status/write checkpoint | high | adapters116–119 zapíše status před ctx.save; review945 a verify998 nejdříve assertSource porovnají starý celý hash. Pád v okně blokuje platný run před dostupnou reconciliací. | patch |
| B2 blind: falsy JSON checkpoint | high | engine70–105 používá if(state). Načtené null/false/0/empty-string přeskočí validateState a opakované run přepíše původní evidence. | patch |
| E1 edge: spec status/write checkpoint | high | Stejný konkrétní mechanismus jako B1, nezávisle potvrzený trace; ani frozen/body se nezměnily, takže je bezpečně rozlišitelný od cizí editace. | patch, skupina B1 |
| E2 edge: falsy JSON checkpoint | high | Stejný mechanismus jako B2; existující neplatný obsah musí zůstat zachovaný a nedostat druhý lifecycle. | patch, skupina B2 |
| E3 edge: UTF-8 chunks | medium | github.execute volá bytes.toString na každém Bufferu. Rozdělený vícebajtový znak se dekóduje jako replacement characters; zasáhne Git cesty/diff i gh text. Stream decoder zachová rozdělené sekvence. | patch |
| E4 edge: startedAt | medium | validateState nekontroluje čas pokusu; Date.parse může být NaN, takže deadline porovnání nikdy nevyprší a resume drží singleton neomezeně. | patch |
| V1 verification: failed/pending CI | medium | Aktuální produkční guard je správný, ale test používá jen completed/success a jiný base. Odstranění conclusion guardu by zůstalo zelené a dovolilo vydat nesprávný acceptance status; GitHub merge ochrana se tím automaticky neobchází. | patch testů |
| V2 verification: fresh merge | medium | Jediný merge test má pr.merged=true a obchází readiness/SHA-bound request. Inverze open guardu by nerozbila test, ale zastavila každý nový merge. | patch testů |
| V3 verification: main CI → Linear Done | medium | Finalize test má merge=false. Přesunutí Done před waitChecks zůstane netestované a může označit neověřený merge za hotový. | patch testů |
| P1 integrátor: spec crash window | high | Integrátor před výsledky reviewerů nezávisle našel stejný write/save→assertSource rozpor; přidat diskový crash checkpoint případ, ne jen opakování helperu v paměti. | patch, skupina B1 |
| P2 integrátor: validation lease při IO chybě | high | verify safeToRelease zůstává true pro raw EACCES/EIO z čtení receipt během živého procesu; finally by uvolnil heavy claim. Ukončení musí být doložené vráceným receipt, nikoli odhadnuté whitelistem error codes. | patch |

Skupiny: spec reconciliation; zachování neplatného existujícího state + validace času; stream UTF-8; ověření hranic CI/merge/Done; validation lease při nejasném procesu. Veřejné CLI ani schválený záměr se nemění. Engine opravuje původní vlastník, pak adapters původní vlastník, sekvenčně. Cílené regrese se přidávají k příslušnému původnímu testu; následně stabilní úplné ověření a recheck opravených bodů. Žádný nález se neodkládá.

## První plná lokální sada
`pnpm test`, 23:33:13–23:37:34 UTC, exit1:1557 pass,3 fail,1 skip. Selhání tree-appearance/vegetation-realistic-pack/vegetation-runtime čtou nehydratované LFS modely (Unexpected token l, lfs.github). Následný skutečný preflight našel všech12 HEAD LFS objektů jako pointery. Build/integrace se kvůli exit1 nespustily. Původní logy zachovány v .cache/bmad-controller-development/test-first.*.log, local-first-validation.json a lfs-before.*.log; vstupy budou materializovány z Git LFS OID pod explicitní rezervací, bez regenerace či změny modelů.



Materializace: git lfs checkout nad12 přesnými HEAD cestami,1.2GB, exit0. Následný preflight12/12 ready, exit0; git status assets/public/models prázdný. Žádná regenerace ani změna source/model obsahu. Původní neúspěšná evidence zůstává zachovaná.


## Cílený recheck jádra po opravách
Původní blind reviewer potvrdil odstranění B2 a nenašel novou regresi v dotčených místech. Původní edge reviewer potvrdil odstranění E2/E4. Oba pouze četli kód/testy;17/17 skutečně spuštěných cílených testů je doložený výsledek autora a integrátor ověřil7/7 aktuálních hashů. První verdikty výše zůstávají historickou evidencí, tyto tři nálezy jsou nyní vyřešené. Ostatní skupiny opravuje původní autor adapters; nejsou předčasně označeny za přijaté.
