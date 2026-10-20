# Nezávislé review opravy runtime vstupů

Všechny tři context-free vrstvy byly spuštěny před zpracováním výsledků. Předmět: šest souborů, base c1c56327240d5634fa3f4670fc7264e6a4287238, diff SHA256789b634311211e8351238dfe7a67c166399798f396863a698523948864d4d053. Reviewerům nebyly předány výsledky jiných vrstev; edge načetl claims až podle svého postupu. Zdrojový checkpoint45/45 je lokální ověření, nikoli konečné přijetí po review.

## Jednotlivé verdikty před seskupením

| Nález | Verdikt | Ověřený mechanismus a dopad | Postup |
| --- | --- | --- | --- |
| B1: platné původní findings se při upgrade ignorují | high | settleLegacyReviews uloží původní findings, ensureReviewsV2 blokuje pouze nové findings. Pokud jedno staré review nalezlo chybu a jiné nedoběhlo, nový čistý výstup by mohl přijmout stejný nezměněný kandidát bez opravy/triage. | patch |
| B2: vlastní legacy review.json vyvolá STAGE_SCOPE | medium | Původní reviewBefore předchází zápisu controller artefaktu. Pád po uložení data.reviews/review.json a před stage checkpointem vede při resume k porovnání s prázdným povoleným rozsahem. Platný běh tak nelze dokončit. Je nutné prokázat konkrétní vlastní artefakt, nikoli povolit libovolné controller soubory. | patch |
| E1: specFile může být uložen před prvním zápisem souboru | medium | writeSpecification ukládá specFile a initialText s created=false před zápisem. ensurePlanningReady pak bez rozlišení created čte chybějící soubor a skončí ENOENT; uložená neměnná initialText by obnovu dovolila. | patch |
| E2: již provedený legacy merge se zablokuje novým accept | medium | Chybějící acceptanceDeliverySha256 spustí accept před idempotentním gh.merge. Main už byl původním mergem posunutý, takže starý base nelze znovu přijmout. Nutno nejdřív ověřit skutečnou identitu již sloučeného PR a převzít jeho merge; nová přijetí zůstávají povinná pro dosud nesloučené PR. | patch |
| V1: živý původní implement worker nemá test pořadí readiness | medium | Verifikační vrstva doložila, že současné fixtures implementaci vždy dokončí před upgradem. Mutace odstraňující odklad readiness by spustila čtecí audit souběžně s legitimními zápisy implementace. Produkční odklad nyní existuje, ale tato regrese by zůstala nezachycená. | patch testu |
| V2: tentýž již provedený merge blokuje accept | medium | Nezávislé ověření vrstvy V reprodukovalo v paměťovém scénáři BASE_CHANGED před dosažením idempotentního merge. Stejný mechanismus jako E2; dosavadní přímý GitHubClient merge test neprochází novým adapter guardem. | patch |

## Seskupení

E2 a V2 mají společnou příčinu a jednu opravu. Ostatní body se řeší odděleně. Nic se neodkládá. Původní plán/pilotní receipts/source digest zůstávají zachované; žádný nález neopravňuje k resetu nebo nové implementaci pilotu.

## Uzavření cílených oprav

Původní blind reviewer potvrdil B1 a B2: staré validní findings znovu blokují i při resume; výjimka scope platí jen pro přesný review.json shodný s durable daty a terminal výsledky. Tamper a další soubor se neignorují.

Původní edge reviewer potvrdil E1 a E2: created=false používá prověřené initialText, created=true missing/tamper zastaví; již merged PR se převezme po kontrole identity a SHA, fresh merge dál vyžaduje aktuální přijetí.

Původní verification reviewer potvrdil V1 a V2: skutečný supervisor/gate test kontroluje jediný readiness pokus, stejný request/receipt a dokončený kandidát; ordering mutant vytvoří null sourceDigest a assertion jej odhalí. Adapter-level test používá skutečné GitHubClient identity guardy pro merged i fresh/stale scénáře.

Všichni tři recheckeři ověřili hashe a nenašli novou podloženou regresi; testy sami nespouštěli. Delta oprav má SHA256 `270b10e12bfa34bb8e70ca4912b1a324d436af0cc270fb2683b94bb7d87ae05c`. Aktuální adapters SHA256 `eb757442893c0f3683636da81f8ff2ac3aece7ada8b7a03804defb680fc825f3`, tests SHA256 `d611302d7d0549a14cc55d7a8fcc3f3a8eae0243a0f4897740ac0163dd4003a4`.

Autor doložil nové regrese5/5 (66.972s), tsc/format/diff check0. Původní4/5 fixture failure způsobilo Windows autocrlf při checkoutu dočasného Git; opraveno pouze lokální nastavení této fixture, globální Git konfigurace beze změny. Integrátor spustil jedinou celou sadu nad tímto stabilním patchem souběžně s rechecky; její výsledek a živý pilot se doplní samostatně.

## Závěrečné lokální ověření a diagnostika

První celá sada skončila49/50 jednorázovým WORKER_FAILED exit1 v postcommit fixture. Konkrétní worker log tehdejší cleanup odstranil; skutečná příčina není doložená. Tři omezená opakování přesného scénáře prošla. Přidány jen diagnostické výpisy před cleanup a native exit7 test; žádná změna produkčního kódu, retry ani oslabení assertions.

Původní verification reviewer ověřil, že odstranění čtyř diagnostických doplňků jen v paměti obnoví přesný předchozí test SHA256 d611302d…4003a4. Diagnostika zachovává request/receipt/stdout/stderr a native test to prokazuje. Finální test SHA256 `9e9774dcc124400df845f494fa43b2f050ba4af553e7d1f5467bf88b44e0015b`.

Integrátorův nový celý běh: **51/51 PASS**,0 fail,0 skip. [Zdrojově vázaný výsledek](repair-final-validation.json) zachovává i původní neúspěch. Žádný review nález nezůstává otevřený.
