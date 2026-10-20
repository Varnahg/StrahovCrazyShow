# KEY-50: věrohodná CLI diagnostika síťových výkonových incidentů

Jediný explicitně přidělený podúkol existujícího KEY-2. Oprav offline report tak, aby přesná událost network-left s data.reason === "identity-change" nezrušila poslední skutečně connected stav pro detekci connection-state-inconsistent. Sama nesmí vytvořit připojení. Všechny ostatní network-left (jiný/chybějící/neplatný reason), network-disconnected a network-connecting zachovají dosavadní význam.

Před implementací projdi celý řetězec Game.setLocalId → sessionDiagnostics → JSONL → summarizeDiagnosticFiles → JSON/text CLI, aktuální testy a přiloženou reprodukci. Porovnej rozumné varianty a zaznamenej volbu, dopady na chování, cache, alokace a lifecycle. Jde o offline interpretaci již existujícího záznamu, nikoli změnu emitovaného schématu nebo herní optimalizaci.

Zachovej:
- původní lifecycle záznam identity-change i přesný reason;
- network-left jako server-clock segmentovou hranici, aby se nepropojovaly čítače odlišných identit;
- chronologické řazení, contextAtMs/age a vyloučení guest vzorků;
- raw intervaly, foreground/hidden výběr, percentily a ostatní síťové incidenty;
- původní vstupní soubory bajtově beze změn.

WRITE pouze scripts/diagnostics-report.mjs a tests/diagnostics-report.test.ts. Implementaci, malý cílený refaktoring a přenositelné native CLI regrese předej společně. Testy mají pokrýt pozitivní identity-change po connected, identitu bez předchozího connected, skutečné leave/disconnected/connecting, jiné/chybějící reasons, guest/stale/out-of-order scénáře a zachování server-clock hranice. Žádné přejmenování historických raw záznamů, renderer/game/UI/recorder změny, nové dependencies ani změny testovacích limitů.

Koordinátor vlastní neměnnou syntetickou fixture a accept-cli.mjs v docs/performance/evidence/diagnostic-identity-20261020/. Čti je, neměň. Skutečné příkazy:
- node --test tests/diagnostics-report.test.ts
- node docs/performance/evidence/diagnostic-identity-20261020/accept-cli.mjs

Druhý příkaz ověřuje plain-Node JSON i text přes samostatné procesy, očekávané2inconsistent windows,9raw frames a server-clock přírůstky20callbacků/12ms ve2srovnatelných intervalech; kontroluje nezměněné bytes fixture. Čísla jsou syntetická acceptance data, nikoli měření FPS/GPU.

Průchod vede nový autodev run přes projektové BMAD, nezávislé blind/edge/verification review, skutečné kontroly, PR CI, exact-head přijetí, merge a main CI. KEY-50 Done až po zelené main CI. Parent KEY-2 zůstává otevřený. Žádný starý run, attempt ani runtime checkpoint se nepřebírá nebo ručně neupravuje.
