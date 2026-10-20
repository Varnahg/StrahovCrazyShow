# Skutečné ověření plánovacího kontraktu

## Důkaz

Modelový `plan-readiness:v2` běžel přes opravený stdin transport z executor commitu353b4c31acd367d6310ddc913d018d850dbb8f0b. Attempt5bdd6b0efb96a2032bf60c34 skončil exit0 a výslovně potvrdil načtení úplných instrukcí. [Původní výsledek](pilot-spec-readiness-stop.json) je ready=false. Nebyl ručně měněn, nahrazen ani označen za úspěch.

Věcný záměr a kandidát jsou podle výsledku v souladu. Skutečné nedostatky: chybějící I/O matrix, úkoly bez formátu cesta–akce–důvod a AC bez Given/When/Then. Přímé čtení skutečného step02/template potvrdilo požadavky. renderSpecification nahradil celý frozen block a tím odstranil template matrix; slabé steps:string[]/převzaté AC nedokázaly formát zajistit. Dosavadní testy ověřovaly doručení a identitu vstupů, nikoli úplnost tohoto dokumentového kontraktu.

## Autorita a rozsah

User výslovně delegoval jeden přidělený Linear úkol autonomně. [Projektová policy](../../agents/bmad-policy.md) stanoví: „Respektuj již udělené oprávnění. BMAD checkpoint není důvod opakovat otázku ‚mám pokračovat?‘ u běžné vratné práce schváleného rozsahu.“ Koordinátor proto zachovává plný již přidělený scope; nevytváří nový backlog ani nevydává toto rozhodnutí za novou odpověď uživatele. Velikost/formát dokumentu nemění požadované chování CLI. Skutečné user-visible intent gaps se tím neignorují.

Původní frozen block musí zůstat byte-identický. Odvozená I/O tabulka doplněná pro opravu jeho prezentace nemůže přidat nové požadavky; bude mimo tento historicky zamčený blok, s doloženou vazbou na jeho existující zadání. Přesný tokenový počet není změřený; chars/words jsou měření, nikoli tokeny. TokenCount=null se nesmí vydávat za spočítanou hodnotu.

## Varianty před implementací

- Ignorovat ready=false nebo přepsat starý výstup: odmítnuto, odstranilo by skutečnou kontrolu i původní důkaz.
- Přepnout na oneshot pouze pro vyhnutí se náležitostem: odmítnuto. Route má vycházet ze skutečných facts a v tomto orchestrátoru zůstává doložený dispatch s externími integračními efekty.
- Ručně měnit frozen block/checkpoint nebo opakovat implementaci: odmítnuto, porušilo by její přijatou identitu a vytvářelo dvojí práci.
- Typed plánovací prezentace pro nové plány a jeden omezený read-only spec-completion krok pro doložený legacy stav: zvoleno. Controller provede legitimní amendment přes durable from/to SHA intent, uchová frozen hash, původní plán/readiness/receipts a sourceDigest a provede právě jednu novou pevnou readiness generaci.

Migrace je úzce omezená na strukturálně neúplný legacy spec před commitem/stagingem a před v2 review. Jiné nebo neprokázané stavy se nemají automaticky přepisovat. Nejde o smyčku opakování až do zeleného výsledku. Nové plánování musí správné struktury vytvořit před první implementací.

Původní negativní readiness se nesmí pouze odložit stranou: obě nové čtecí fáze dostanou celý result a canonical SHA. Typed reconciliation musí pokrýt přesně všechny původní otázky a blokace v původním pořadí/textu. Povolené interní rozhodnutí se váže na konkrétní authorization binding; produktová otázka, runtime prerequisite, unresolved či chybějící klasifikace blokují i při ready=true. Druhá fáze znovu posuzuje původní text i odůvodnění první. Jde o modelové sémantické posouzení se strukturálními/integritními kontrolami řadiče, nikoli formální důkaz významu textu.

Autor provedl read-only/in-memory smoke nad skutečným607a snapshotem a původním pilot specem, bez nového modelu nebo zápisu do pilotu. Frozen SHA před/po je539febe5eb262cc3382640d45116ff009ff3d49cdc753c500dd65768a8de0eb4, sourceDigest eab6516de7c14a86d0b53bddae3eec1832ea7734f2b4073b38a23015290bd108; state/spec bytes se nezměnily. Odvozená tabulka má escaping pipe, tasks a Given/When/Then jsou přítomné. Jde o smluvní smoke s testovacími daty, nikoli přijetí skutečného modelového doplnění. Portable test nově používá také úplný committed step02; skutečnou committed spec-template už používal dříve, chyběly však assertions jejího úplného kontraktu.

## Stav

Implementace, cílený refaktoring a nezávislé review jsou uzavřené; [triage a recheck](review-spec-format.md). Před review opravami62/62 adapter PASS; následné native kill/matrix/blocker regrese11/11 a poslední testová regrese1/1 PASS. [První plná sada](full-validation-readiness-failure.json) zachovává jediný nezměněný shader readiness timeout a izolovaný7/7 recheck; sériová plná přejímka pokračuje. Pilot má stále jedinou dokončenou implementaci a pokračuje přes normální resume, bez ručního přepisování stavu.
