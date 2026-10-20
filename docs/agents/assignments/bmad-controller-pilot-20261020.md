# KEY-47: pilot nápovědy LFS CLI

Explicitní přidělení: [KEY-47](https://linear.app/gigeconomy/issue/KEY-47/pilot-bmad-radice-napoveda-cli-kontroly-lfs), jeden pilot schválený uživatelem 20.10.2026 v rámci KEY-46. Žádný jiný backlog task nezačínej.

Doplň `--help` a `-h` do `scripts/check-lfs-assets.mjs`. Samostatná nápověda vrací exit0, stručně vysvětluje výchozí checkout a `--root CESTA`, kontroly velikosti/pointerů bez checksumu a bez stahování. Funguje mimo Git checkout i s prázdným PATH. Stávající ověřovací režim i odmítání neznámých/míchaných argumentů zachovej; help se přijímá pouze jako jediný argument. `--help --root ...` je chyba, ne tiché přeskočení kontroly.

Nejdřív reprodukuj dosavadní chování, projdi argument parser, pořadí filesystem/Git operací a stávající dva testové soubory. Porovnej časné zpracování help proti přimíchání do root parseru; zvol nejmenší jasnou variantu a zaznamenej důvod. Refaktoruj dotčené parsování jen podle skutečné potřeby. Přidej `tests/lfs-assets-help.test.ts` s black-box CLI testy obou voleb, prázdného PATH, nerepozitářového cwd, mixu argumentů a nezměněného odmítnutí neznámé volby. Používej absolutní process.execPath; nepotřebuješ dependencies instalovat. Test při neexistujícím cwd nemůže proces vůbec spustit, proto jako relevantní scénář použij existující temp nerepozitářový adresář. Ukonči vlastní procesy a bezpečně ukliď pouze vlastní temp fixture.

Primární podklady: současný skript a jeho testy; [Node process.argv](https://nodejs.org/docs/latest-v24.x/api/process.html#processargv), [Node child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html), [Git LFS pointer](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pointer.adoc). Jde o CLI změnu bez vlivu na hru, GPU, síť, materiály či asset cache; neprováděj herní měření.

Koordinační task vlastní pouze BMAD plan/evidence/handoff/renderer; implementační worker má vlastní disjunktní task a owner. Žádný rekurzivní BMAD ani další agenti, žádné commity, push, PR, Linear mutace nebo globální nastavení z modelového workeru. Tyto integrační kroky provádí deterministický řadič. Před prvním zápisem ověř aktuální claim a svůj přesný scope.

Přejímka: uvedené CLI testy, nezávislé blind/edge/verification review, povinné GitHub checky na přesném head, SHA-vázané přijetí a chráněný merge. Řadič bude úmyslně ukončen po vytvoření PR před lokálním checkpointem a následně obnoven. Jeden run smí mít pouze jeden worktree, worker attempt pro daný krok, commit, PR a provozní Linear komentář.
