# Review doplnění SPEC kontraktu

20.10.2026; base353b4c31acd367d6310ddc913d018d850dbb8f0b. Sedmisouborový unified diff SHA256019cd9eb42f1b5e8293ec40b531a4cb5e4b622ee497202d7dc56f03840372ff9. Tři čerství context-free read-only revieweři byli spuštěni před sběrem výsledků. Blind a verification nečetli záměr; edge otevřel claims až po vlastním trace. První claims soubor neměl požadované názvy sekcí; druhý předal stejný obsah pod Intent a Tasks & Acceptance a reviewer potvrdil dokončení claims passu. Žádná vrstva nebyla vynechána.

## Jednotlivé nálezy před seskupením

| ID | Nález | Verdikt / důkaz | Směr |
| --- | --- | --- | --- |
| B1 | Nový formát plánu používá stejný delivery protocol2 jako neveřejný mezicommit353b4c31. | false pro podporovaný consumer: statická nekompatibilita hypotetického mezistavu je pravdivá, ale353b4c31 nikdy nebyl publikován a inventář všech skutečných runů obsahuje pouze KEY-47 legacy bez protocol2 plánu. Nový plán už eviduje oddělené specFormatVersion=1. Podporovaná migrace je výslovně omezená; neznámý mezistav se bezpečně zastaví a neslibuje se jeho automatický převod. | Nepřidávat neobjednanou obecnou migraci. |
| E1 | Dynamický String.replace interpretuje dolarové substituce v I/O matrix. | medium: completeSpecification předává interpolovaný obsah jako replacement string; $$/$&/$'/dolar-backtick mají význam String.replace. Matice tedy nemusí zachovat platný vstup a může poškodit dokument. | patch |
| E2 | Pád před rename zanechá neidentifikovaný vlastní temporary spec. | high: atomicText zapisuje UUID temp, zatímco amendment checkpoint tuto cestu neobsahuje. reconcileSpecAmendment povoluje ve stage diffu pouze spec.md, takže vlastní orphan blokuje každé resume přes STAGE_SCOPE. | patch |
| V1 | Chybí regrese původní runtime-prerequisite/unresolved blokace při novém ready=true. | medium: doložená testovací mezera; existující negativní případy pokrývají intentGaps nebo ready=false. Odstranění runtime klasifikačního guardu by těmito testy prošlo. | patch testů |
| V2 | Aserce tabulky ověřují hlavičku, ne skutečné řádky a escaping. | medium: doložená testovací mezera; prázdná matrix s pouhou hlavičkou by splnila současné aserce a strukturální predikát. | patch testů |

E1 a V2 mají související místo, ale odlišný prokázaný problém: doslovnost textu a chybějící test obsahu. E2 a V1 jsou samostatné. Nic se neslučuje před individuálním rozhodnutím. Autor dostal přesný followup v původním scope; změny čekají na konec právě běžící plné sady, aby její snapshot zůstal neměnný. Pilotní stav ani implementace se nemění.

## Cílený recheck

Nový sedmisouborový diff SHA2560f283dd4c6bbcbaaf05314627f18632705264f5ee99ff1ddeb6c944f20e36a45. Původní autor předal11/11 cílených testů PASS, TypeScript/syntax/format exit0 a ukončené vlastní procesy. Všechny tři review vrstvy byly znovu spuštěny před sběrem výsledků: blind vrátil []; edge samostatně potvrdil E1 a E2; verification potvrdil V1 a V2 i zachování původních asercí. Native kill je skutečný child-process kill a obnova diskového checkpointu, nikoli pouhé volání render helperu.

| ID | Verdikt | Důkaz a směr |
| --- | --- | --- |
| V3 recheck: hotový target plus zbývající recorded temp | medium | Současný produkční guard správně odmítá current=toText a existující temp. Chybí regrese právě této kombinace; odstranění guardu by umožnilo completed=true přes nejednoznačný stav. Přidat pouze cílený test zachování obou souborů, checkpointu a absence dalšího workeru při opakovaném resume. |

V3 je posouzen samostatně, neslučuje se s již uzavřeným E2. Po ukončení první celé sady autor přidal pouze test:1/1 PASS27.900s, TypeScript/format/diff exit0. Nezávislý verification recheck ověřil oba negativní průchody včetně diskového reloadu, přesné bajty, completed=false a0novýchworkerů i zachování původních pozitivních/tamper asercí. V3 je uzavřené; žádný produkční zásah nebyl potřebný. Test SHA256d079eaf786875218cd88c9b8bc618f6a26ac9b3adbe552b70263a9d26a2ac849. Produkční adapters cf539bd0179f39df6646a2e40a29b1185a0340aa96d3f0dfa64776de336ad11e a codex86017354a3e4e154bc26fda920087a724c76acf0b8a79c43f80b58ed22460be9 zůstaly stejné.

## Stav

Všechny podložené nálezy uzavřené, nic odloženého. První celá sada měla1613PASS/1nezměněnýshaderreadinessFAIL/1existujícískip; [původní chyba a cílený7/7recheck](full-validation-readiness-failure.json) zůstaly zachované. Konečná sériová plná přejímka právě běží nad28souborovým manifestem a87def5a95dcfa78349901308114e520b00c2e5d49df0800a19b4480457aa130. Původní diff, claims a logy se nepřepisují.
