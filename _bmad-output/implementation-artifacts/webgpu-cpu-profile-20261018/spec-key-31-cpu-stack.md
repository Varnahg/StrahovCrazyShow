---
title: 'KEY-31: funkční CPU profil zbývajících změn světel'
type: 'chore'
created: '2026-10-18'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Pokračování již autorizovaného cíle; žádná nová produktová volba">

## Intent

Zbývající herní záseky při přepnutí světel mají doložených123,7/64,8ms přípravy materiálů, ale neznáme konkrétní drahou funkci. V izolované měřicí kopii použít standardní JS Self-Profiling API během explicitního benchmarku a spojit CPU stacky s existujícími light-switch vzorky. Výstup je důkaz pro výběr následující opravy; nemění produkční renderer ani hráčovu verzi.

</frozen-after-approval>

## Implementation Notes

- Jediný cíl, žádná nezvratná operace ani chybějící uživatelská volba. Malý copied helper, jeho lifecycle testy, přesné Game hooky, QA preview/assembler a offline souhrn. Proto BMAD oneshot; globální migrace zůstává in-progress. Spec je v explicitně rezervovaném podadresáři, nikoli v cizím společném sprintu.
- Průzkum: [specifikace API](https://wicg.github.io/js-self-profiling/), [Chromium profiler_group.cc](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/timing/profiler_group.cc). Legacy `Document-Policy: js-profiling` jen pro vlastní QA HTML; bezflags/origintrial/workerů. Constructor v aktuálním Edge155 uspěl, skutečný interval16ms a11vzorků/220ms. Stejná stránka bezpolicy vrací NotAllowedError. Uložené probe-enabled/disabled.json jsou přímé DOM důkazy. Metadata/callstacks mají sampling režii už od navigace, nejsou čistým FPSA/B.
- Varianty: další per-material wrappery zvyšují režii a rozšiřují diagnostiku; standardní browser sampler zachytí funkční stacky bez změny materiálů; Node inspector/NullEngine je vhodný sekundární JS reproduktor, ale nenahrazuje produkční scénu. Vybrán dostupný browser sampler. Široká cache nebo trvalé light sloty nemají dostatečný profil a mění binding/shadow/GPU náklady, nyní je neimplementovat.
- Zdroj: immutable native909ebf8a s existujícím exact light-switch overlayem26878bbf v původní pracovní kopii. Assembler ověří všechny manifestované bajty a zkopíruje pouze zdroje/testy do nové cache; public/assets/dependencies jsou readonly junctions. Sdílené dist ani dependencies se nepřestavují.
- `Game.startBenchmark`: lokální/WebGPU brána, jeden profiler16ms/max2000 a původní start/frames. `stopLightSwitchProfile` pokryje restart, fault, recording-end a dispose; při benchmark-end se CPU stop odloží až za vytvoření celého původního výsledku. Výjimky diagnostiky nesmí změnit vykreslení/původní renderer error.
- Helper vlastní idempotentní stop, buffer-full listener, pending Promise a singleton busy gate; reentrant benchmark během stop nepřidá druhý profiler. DOM raw trace až v Promise continuation po uzavřených metrikách, samostatný cpu-profile-result, žádný32KiB session event. Uložit timeOrigin/start/stop/skutečný interval a důvod. Sampling gaps nejsou GPU/idle čas.
- QA build zachová minifikaci, přidá pouze hidden source maps. Archivovat přesné JS/map hashy a offline mapovat frame resource/line/column. Počet/interval vzorků je statistická evidence, nikoli přesná délka každého volání.
- Ověření: actual helper lifecycle/limit/rejection/export a source-extracted Game completion/regresní testy, exact inverse a fullTS/build. Produkční Edge průjezd musí mít foreground,1actualavatar/0ambient, stejnou Low/noční fixture a zachované čítače health/omissions. Poté ukončit pouze vlastní4200/2595. Nový native runtime fix se rozhodne až z výsledku.
- Předání koordinace: original chat01a14497 autoritativněidle/posledníturncompleted; main d19ce2fb a migračníWT278b0bfe. Admin přebírá7 známých necommitnutých task JSONů beze změny. Root/BMAD claims zastavené práce uvolněny po ověření portů a ukončených pomocných běhů; claims živých hraných4193,4195–4199 zůstaly. Převzetí doloženo Linear komentářemf9dadfdf-e6fe-4546-b5e9-d32333a9d6c2. Současný29fa dirty WIP zůstává cizí, do runtime se nezapisuje.
- Implementace helperu:11/11+scopedTS, manifest305c4979. Copied V1 má28/28/fullTS/buildPASS, ale blindreview nalezl únik CPU owner při výjimce v dokončování výsledku po vymazání this.benchmark. Genuine nový RED11PASS/1FAIL tento únik potvrdil. V2 zachytí stop původního owner a ve finally pokryje celé dokončování metrik, zachová původníerror; callback běží ažpoté. V2source52abcad6 má29/29targetedPASS. Re-review potvrdil uzavření nálezu a nenašel další doloženou vadu. V1artefakty zachované.
- Přijatý omezený capture: V2fullTS/buildPASS, skutečný Edge637samples/3complete světelnévzorky,0errors/pending. Přítomné PBRprepareEffect/defines/toString a WebGPUbindgroups/UBO; nepravidelné16msbest-effort samples nedokládají časovépodíly. Další krok omezenýnestedCPUtiming těchto konkrétníchrutin, předvolbouopravy. Nezávislý audit clock/source/seq/6JSmapSHA beználezů. Protected4199:17code+servedHTML exact před/po; vlastní4200/2595ukončené. Done se týká pouze tohoto capture, ne KEY-31 ani migračního cíle.

## Review Triage Log

- medium/patch: completion metadata throw nechal sampler mimo dosažitelný benchmark state. DůkazactualcompletionRED, opraven finally v copiedGameV2+nový test identické původní výjimky a exactly-once stop; nezávislé opakované review potvrzuje opravu. Žádné odložené nálezy.
