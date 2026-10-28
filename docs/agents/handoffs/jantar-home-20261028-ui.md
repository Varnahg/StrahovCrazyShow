# Předání: jantar-home-20261028-ui

- Vlastník/integrátor: jantar-ui-01a17fd8 / jantar-root-01a17fd8, KEY-66.
- Kopie C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow; codex/jantar-home; baseline e09d60fa24419a93b26f15e21c862e95e44aff2f.
- Změněné soubory: client/welcome-screen.tsx, client/welcome-screen.css, client/ui.tsx (pouze welcome props), index.html, tests/welcome-screen.test.ts a toto předání. Ignorované vlastní logy v .cache/jantar-home-20261028-ui/.
- Výsledek: zdrojová implementace připravena k praktické produkční validaci. Zatím se netvrdí hotová integrace ani spuštění hry.
- Cizí WIP nepřevzatý. Chat a mapu dodaly vlastní disjunktní tasky s handoffem; původní primary ani chráněná4182 se nemění.

## Chování a refaktoring

WelcomeScreen vlastní jen lokální home/profile, otevření popupu a dialogu. Profil a jediný AI store zůstávají v App; původní enter("multi") i failed-join tok se nemění. Na úvodu nevzniká AvatarEditor ani canvas. Druhá obrazovka používá původní editor včetně jediné přezdívky a cleanup; Back jej odmountuje a vrací fokus. Busy blokuje potvrzení, Back i editaci. Prázdné jméno fokusuje původní input, Enter v něm potvrzuje formulář; ostatní editorová tlačítka jsou type=button.

Presence poller zůstal beze změny: jedna bounded žádost, visibility pause, timeout a cleanup. Nula je skutečná nula, nedostupný stav pomlčka s dostupným vysvětlením. Počet má vlastní malou bublinku pod jediným CTA. Native info dialog používá showModal a vrací předchozí fokus; skutečný feedback a jazyk zůstávají původní sloty.

Interaktivní MapView slot se již nevytváří. Dekorativní WelcomeMap má společnou rigidní transformaci z původních mapových dat. CSS blur2.5px a jemná translace pozadí respektují reduced-motion. Nad mapou je Jantar/Manrope/glass bez sloganu, demo badge a rohového loga. Startup CSS je zachované. Vzhled editoru se mění pouze welcome scoped CSS, jeho vlastní modul se nepřepisuje.

Popup odmountuje jen view, žádný reset/cancel/dispose AI store. Fokus se přesouvá pouze při explicitním otevření/zavření. Pro composer se nejdřív hledá input/textarea, teprve pak fallback button. Průhledný popup wrapper neskládá dvě téměř neprůhledné vrstvy.

## Dosavadní ověření

- `node --import tsx --test tests/welcome-screen.test.ts tests/avatar-editor-fallback.test.ts tests/avatar-preview-webgpu.test.ts`: exit0,34/34; `.cache/jantar-home-20261028-ui/targeted-tests.log`.
- Po opravách focus/grid `node --import tsx --test tests/welcome-screen.test.ts tests/welcome-map.test.ts`: exit0,14/14; `welcome-map-final-tests.log`.
- Prettier vlastních welcome souborů a `git diff --check` prošly. Celý ui.tsx se plošně neformátoval.
- Nezávislý čtecí reviewer /root/review_home_flow nalezl dvě konkrétní chyby: focus union query vracelo close, preview span tlačil palety níž. Obě opraveny a reviewer opravy potvrdil. Další doloženou funkční chybu nenašel; krátký mobilní viewport a praktické chování patří browser validaci.

Žádné vlastní servery/GPU/heavy procesy tasku. Claim zůstává u implementátora do browser přejímky pro případné opravy. Finální snapshot/commity a skutečná runtime evidence budou doplněny po validation okně; samotné SSR není důkaz profile/back/joinfail toku.
