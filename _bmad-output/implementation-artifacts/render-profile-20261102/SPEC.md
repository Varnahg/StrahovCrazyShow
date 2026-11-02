---
title: 'Profil celé produkční hry a jeden doložený optimalizační návrh'
type: 'chore'
created: '2026-11-02'
status: 'blocked'
route: 'oneshot'
context:
  - 'AGENTS.md'
  - 'docs/agents/bmad-policy.md'
  - 'docs/agents/tasks/render-profile-20261102-root.json'
---

<frozen-after-approval reason="Uživatel výslovně schválil celý profilovací plán.">

## Intent

Odměřit aktuální main `fdc7b91911e1ef0ca655bddce7b6a8e077c907e2` v celé produkční hře, rozlišit CPU/GPU/startup/paměť/čekání a doporučit jedinou další konkrétní optimalizaci podle důkazů. Neměnit herní API, grafické chování ani původní server8080. Výstupem je profil s raw důkazy a návrhem rozsahu/alternativ/přejímky; pokud příčinu nelze doložit, přesně uvést chybějící měření.

Jediný kanonický checkout/main; neměnný produkční build a vlastní provozní data pouze `.cache/render-profile-20261102/`, bez větví/worktrees/kopií zdrojů. Source/test/asset/dependency identity před i po sestavení. Edge se skutečným GPU, explicitní WebGPU, Medium60FPS, CSS1280×720 a zaznamenané skutečné interní rozlišení. Plná hra/HUD, hlavní browser hráč +2 skuteční SDK spoluhráči s odlišnými avatary. GPU/build/zátěž se nesmějí překrývat.

Tři nezávislé starty: studený startup, první použití a ustálená hra odděleně. Spawn, vegetace a okolí/vstup B6 po3×10s po ustálení; skutečný průchod, první nástup do auta, noc/svítilna; Low/High doplňkově na stejných místech. Pouze skutečné ovládání, žádný teleport lokálního hráče. Omezení ovládání či neplatné pokusy se zaznamenají, nic se nezamlčuje. Stejné označené QA počasí, světlo/sezóna/kamera pro srovnatelné intervaly.

Úplné frame intervals, FPS/p95/p99/max, hitches, CPU fáze, dostupné GPU časy, draws/geometrie/LOD, compilation a health. Systémová telemetrie samostatně; během timed oken žádný screenshot/DOM čtení. Vnořené CPU wall intervaly nesčítat; WebGPUmainpass není celá karta. Známé nezelené testy PDF/řadiče zůstávají oddělené, profil je neuzavírá. Podklady a závěry samostatně commitnout na main a průběžně aktualizovat Linear.

</frozen-after-approval>

## Implementation Notes

- Konsolidovaný checkpoint 2. 11. 2026 na výslovné zadání uživatele: harness/build/cleanup ověřeny, jeden WebGPU startup skončil timeoutem; Computer Use pak zastavilo ovládání při kontrole URL fyzického okna. Žádné platné FPS intervaly, 3-player GPU měření ani kauzální optimalizační doporučení. [Skutečný report](../../../docs/performance/evidence/render-profile-20261102/report.md) a [WIP](../../../docs/work-in-progress.md) mají přednost před plánovaným pokrytím níže. Dočasný viewport byl při konsolidaci resetován; všechny vlastní procesy skončily.

- Herní soubory jsou pouze pro čtení. Nový harness má disjunktní task; původní low-tree harness se nemění, protože chrání své staré buildy hashem. Reuse `readReplaySourceManifest`, `createIsolatedIntegrationEnvironment`, současné SDK/timeline kontrakty a systémový sampler. Žádné globální či produkční credentials.
- Varianta HMR je nevhodná pro identitu; whole-project snapshot odporuje zadání; vybrán normální Vite produkční build `publicDir:false` + ověřené public soubory servírované read-only z main, jako předchozí přijatý build postup. Žádný DEV hook nebo testová injekce pózy. Běhy mají vlastní run/session/PID metadata a STOP pro spolehlivý cleanup.
- Edge connector3 byl znovu ověřen dostupný. Původní localhost8080 WebGL2 tab je na úvodu, nevstupovat do něj ani neměnit jeho obsah. Vlastní karta bude mít explicitní viewport; override na konci resetovat.
- Běžné10s tlačítko vždy připojuje BenchmarkRenderProfile; takový výsledek neoznačovat jako úplně bez instrumentace. Local collector4179 ukládá pouze whitelist, nikoli raw/fullbenchmark. Povinně stáhnout úplný JSON přes UI; DOM benchmark-result vynechává modelReview. Screenshot až mimo timed okno. Collector má limit3/min; začátky samplů oddělit alespoň22s.
- Automatické `.cache/game-diagnostics` frame-window obsahuje rawframe/cpu/gpu pole i scope; UTC je session-start.timeOrigin+atMs. PreviousCPU patří předchozímu intervalu, currentCPU následujícímu callbacku. Ztrátyseq/fokus/visibility/health vyznačit. `profileEnvironment=1` je až samostatný příčinný běh; není JS sampling profiler.
- Po dokončení boot/renderHealth/lightPreparation a stabilizaci populace30s warmup. UI day+summer znamená konzistentní DEMO okamžik daný existujícími season anchors; používat skutečné UI hodnoty a exportovaný čas, ne vymyšlené URL day/season. Základní QA počasí20°C, cloud0.15, rain0, wind1m/s from230°, označené jako řízený model/fallback a bez falešných station readings.
- Studený znamená čerstvou page/Game/renderer generaci. Globální cache prohlížeče/ovladače se nemaže; tento limit definice cold uvést. Pokud explicitní WebGPU selže předready, zachovat chybu a provést další nezávislý pokus; nevydávat přepnutí WebGL2 za stejný experiment.
- UI akce a backend čtení se řídí skutečně pozorovaným stavem. Neznámé či nedostupné GPU časy jsou null, nikoli0. Sampler čte os/procesní countery po2s s30s warmup a měří svou režii; nejde o per-frame trace.
- Výběr dalšího zásahu: pořadí podle opakovaného nákladu vms a výpadků rozpočtu16.67ms, s konkrétním mechanismem zodpovědné vrstvy. Klíčovou hypotézu ověřit kontrolovaným srovnáním nebo samostatným CPUprofilem; při nerozlišenémCPU/GPU/driverwait uvést omezení a přesný dalšíexperiment. Nevymýšlet příčinu jen z vytížení či průměruFPS.
- Ověření nástrojů: syntax/lehké unit, nezávislé read-onlyreview, skutečný start/build/server/SDK/STOP/parity. Žádná nová runtime změna nevyžaduje opakování drahé celé sady; její známé FAIL výsledky z předchozího tasku se zachovají.
