# Cílený recheck opravných změn

Patch proti prvnímu review: `f8806336749470c8a47e6ea12955ee3c359b14876ae74f855044678ed5a7e2cc`,10 souborů. Všechny tři původní vrstvy provedly pouze čtecí recheck opravených míst; neprohlašují vlastní spuštění testů.

- Blind potvrdil B1 i dříve B2; nový status intent ukládá přesné from/to SHA před zápisem a obnova zachovává neměnný obsah.
- Edge potvrdil E1/E3 i dříve E2/E4; UTF-8 streaming má skutečnou bajtovou subprocess regresi.
- Verification potvrdil zachycení původních V1/V2 a původního pořadí V3. Doplňující body níže vznikly z konkrétních vstupních kombinací.

| ID | Verdikt | Důkaz a dopad | Rozhodnutí |
| --- | --- | --- | --- |
| E-P2-resume | high | Po dřívějším selhání B může resume převzít terminal receipt A a pak selhat při source auditu. awaitingReceipt=false pro A neprokazuje ukončení už spuštěného B; finally by uvolnil heavy claim. | Zachovat claim, dokud nejsou terminal všechny relevantní check attempts; multi-check resume regrese. |
| V3-SHA | medium | Finalize fixture měla baseSha==commitSha==mergeSha. Záměna waitChecks(mergeSha) za baseSha by nezměnila assertion. Produkční kód zde správný je, ale test neověřuje potřebné rozlišení. | Skutečné odlišné base/head/no-ff merge commity a assertion exact merge SHA. |

Opravy navazují v původním adapter tasku, bez nového rozhraní nebo změny zamýšleného chování. Nejsou odložené.

## Druhá plná lokální sada
Preflight12/12, `git lfs fsck`, katalog239 a README link checks všechny exit0. `pnpm test` 23:56:01–00:00:07 UTC:1575 pass,1 fail,1 skip, exit1. Jediná chyba je původní `lfs-assets.test.ts` fixture: `spawnSync git ETIMEDOUT` pro `git lfs ls-files --json HEAD` pod plným souběhem. Build/integrace se nespustily.

Cílený `node --test tests/lfs-assets.test.ts tests/lfs-assets-edge-cases.test.ts`:24 pass,0 fail,1 skip, exit0,31.935s. Testový limit ani assertion se nezměnily. Finální plná sada použije standardní argument `pnpm test --test-concurrency=2`, který omezuje souběh, nikoli výběr testů. Native Node argument placement byl skutečně ověřen. `--test-concurrency` není povolený v NODE_OPTIONS; neúspěšný probe je zaznamenán a environment byl okamžitě obnoven.

Původní logy zůstávají jako `.cache/bmad-controller-development/test-second.*.log`, `local-second-validation.json` a `lfs-targeted-after-timeout.*.log`. Žádné přepsání failure evidence, vypnutí testu, zvýšení timeoutu ani úprava package.json.


## Uzavření cíleného rechecku
Původní edge reviewer potvrdil E-P2-resume: release nyní vyžaduje terminal stav všech zaznamenaných check attempts a skutečná source změna po převzetí A nezruší claim živého B. Původní verification reviewer potvrdil V3-SHA: fixture vytvořila tři odlišné skutečné Git commity a ověřila parents merge; záměna merge za base/head poruší assertion. Žádný další nález v cílených opravách. Autoři provedli33/33 adapter testů a17/17 engine/store testů; samostatné procesní QA zůstává7 scénářů. Revieweři tyto testy znovu nespouštěli.
