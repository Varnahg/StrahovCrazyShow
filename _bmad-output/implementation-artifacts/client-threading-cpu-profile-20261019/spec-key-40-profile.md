---
title: 'KEY-40: zvolit skutečně přínosnou worker úlohu podle produkčních CPU stacků'
type: chore
created: 2026-10-19
status: done
route: oneshot
review_loop_iteration: 0
---

<frozen-after-approval reason="uživatel autorizoval výzkum, implementaci a praktické ověření; projektová policy používá existující oprávnění">

## Intent

Po přijaté opravě KEY-41 navázat na celý cíl vícevláknového klienta. Rozlišit čisté CPU úlohy, které lze skutečně paralelizovat, od Babylon scene/device operací. Předchozí profil identifikoval transit envelope, ale ne jeho vnitřní funkce. Historické zdrojově ověřené stacky ukazují i opakovanou grass placement/selection; přesný přínos workeru stále chybí. Další samostatná serial optimalizace není náhradou této volby.

Znovu použít již ověřený samostatný SelfProfilerV2 (16 ms, max 2000 vzorků, jeden DOM export) v nové izolované produkční kopii current combined1fbc05af. Explicitní loopback `profileCpu=1`, owned benchmark lifecycle a původní environment/hitch časové kotvy, žádný mesh overlay ani nové obecné monitorování. Build s přesnými hidden source maps a vlastní dokumentovou policy. Zdrojový kód hraných verzí, SDK a rootGame/UI se nemění.

Zachytit profil během skutečného pohybu v celé scéně před hledanou špičkou. Výstup musí vybrat konkrétní další worker experiment nebo doložit, která rozhodující atribuce ještě chybí. Vzorky nejsou CPU duration/share; diagnostická FPS nejsou plain A/B. Budoucí worker musí prokázat přínos pro FPS/p95/p99/hitches či skutečnou odezvu bez regrese obrazu, pravidel světa a lifecycle.

</frozen-after-approval>

## Implementation Notes

- Fresh renderer9b78 2e5169e7e102/7dd88a77841d79f60052, konfigurace/policy znovu ověřena. Předchozígoalturn je progress: research9f1127f4 a KEY41 runtimecb2bed42 + ověřenéEdge důkazy. KEY40 zůstává aktivní.
- Research: WICG JS Self-Profiling specifikace znovu načtena19.10.2026; intervalbest-effort, realm/timeOrigin a1-basedfunctiondefinition pozice. Jde o klasifikaci stacků, nikoli sampled instruction pointers či změřenouCPUdélku.
- Donor medium-cpu-profile/source/client/qa-cpu-profile.ts.txt.gz SHA(decoded)5ae79df9782be3d53fafc625dda2531e4b7a908a138431f75b3060ff609c6c68, testSHA9c53612d2bde1849001522b93bfec7fe7e7f406f080de2b2d0b02729f860fc97. HistorickéGame overlay měly18editů, prvních9mesh-related se nepřebírá. Workerhelper podagent má samostatnýtask/cache/handoff.
- Varianty: nový per-frame profiler/observer vrstva zvyšuje zásah a režii; existující SelfProfilerV2 má hotové edge-case testy a skutečnýEdge precedent, proto je zvolen. Plošný rendererworker stále nemá dokázaný FPS přínos. Grass data worker a konzervativní static candidate worker jsou kandidáti, ne předem přijatý výsledek.
- CPUowner musí být zachycen před odebráním benchmarkstate, idempotentně zastaven po dokončení metrik i při výjimce; callbacksmí založit dalšíbenchmark bez zastavení novéhoowneru. Restart,rendererfailure,recordingended,dispose a partialstart pokryty fixture.
- Root: přesný source/test copy, readonly donor assets/deps, samostatný minifiedhiddenmapbuild, porty4206/2601, activeEdgewindow, oneactualrelation/HUD, žádnéhot reloads. Testy cílenéhelpers/lifecycle + fullTS/build; celánezměněnáhra užmá1524/build/integrationPASS, tentooverlaynení mainfeature.
- Pokud se zapne profileEnvironment=1, zahrnuje také detailní shader/frame hooks; tuto režii explicitně uvést. DalšíFPSA/B musí běžet bez profileru a mápuvodní tvrdé podmínky.

## Výsledek tohoto omezeného checkpointu

Šest skutečných Edge capture dokončeno, source586 a27 served hashes ověřeny, helper25/25 a TypeScript/build PASS. Nezávislé review helperu a finálního analyzeru bez nálezů. Failure startup i chybná trasa zachovány. Dva relevantní běhy po trávníku dokládají prostředí3,57/4,77ms a placement přítomnost, nikoli izolovanou cenu ani worker přínos. Zvolen pouze experimentální tile-only worker v samostatném KEY-42; jeho implementace/testování probíhá odděleně. KEY-40 i celý cíl zůstávají aktivní. Podrobný výsledek a omezení: docs/performance/evidence/client-threading-cpu-profile-20261019/README.md.
