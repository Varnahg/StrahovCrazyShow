# Source15: startup latency, první auto a neúspěšná obnova

Stejný source `d38b63a6` a helper36 `37646a00`, nový immutable build `b9bef6aa`,21 skutečných HTTP SHA shod. Clock vypnutý, explicitní startup-latency/routine-cost/lifecycle-controls jsou diagnostické. Původní počasí číselně zachováno s testovacím označením. Během MP, Guest a recovery přípravy neběžely root testy/build/CLI. Nejde o plain FPS ani kontrolované A/B se source12.

MP receipt60b78f3c prošel75.7451s/76etap; Low26.1408, Medium27.0316, High17.5825, finalMedium4.9901. Všech802 původních scope/fence Promise settled, pending0/issues0. Jejich sjednocený interval28.0690s a společný překryv24.4126s vylučují prostý součet52.4816s jako GPU čas. Synchronní spany etap46.0888s, z toho options.render37.5674s. Bez absolutních hranic etap nelze intervalovou union přiřadit konkrétnímu residuu; settlement zahrnuje browser/microtask scheduling.

## Platný první vstup

`car-entry-routines.json`/ea9fb659 je skutečný accepted foot→vehicle, jeden původní30s deadline, osm Scene framů6016–6023, after6024; renderer2/gen1, errors/phaseErrors/restoreConflicts0, waiter/routine remaining hooks0. Nula-duration E nejdřív nepřineslo autoritativní změnu, následné E200ms ji doručilo uvnitř okna. Čerstvá Mia4 bez předchozího car vstupu/editace, Medium/scaling1/2040×986, osvětlení23Oct22Z, skutečný dopravní čas. Obraz a normální jízda s W/A/D jsou uložené; denní High změna skončila zdravě.

Originálb7c86834: interactseq620, modeChanged621, hitch622 **210.9ms**, previousCPU209.8/render191.3/environment9.3; LoAF629/script210.2ms. PBR readiness364calls/62.4ms, Standard137/19.1 v prvním main framu; další sedm výrazně levnější. `car-before`→`car-after` zachovává828shader preparations/1656modules a validations/25sync/1267async, tedy compiler delta0. Health/pending0. Tyto inkluzivní časy obsahují instrumentaci/JIT/čekání a nesmějí se prostě sečíst. Compiler0 neprokazuje cache hit identity ani příčinu serializeru.

## Guest a negativní recovery

Guest e4aa2a38 prošel77.3411s/76etap, renderer4/gen1, networkfalse a pouze lokální guest/Mia, health0/pending0. Explicitní own-device.destroy v3c875f51 vrátil originál a původní UI zobrazilo „Vykreslování se zastavilo. Opusť demo a spusť scénu znovu.“ Samotný state receipt vznikl před native lost reakcí, takže jeho ready0error není důkaz zotavení; následný nativní obraz dokládá stopped UI.

Normální leave→nový Guest vytvořil renderer6, ale **startup92757738 selhal po90.1113s/73etapách**. Low24.4304/Medium26.7290/High27.2329 prošly, finalMedium11.719 skončil timeoutem. High day-1-on row55 trval11.4725s:4options.render/8.8379s, nejdelší jeden8.5947s, restarty0. Scope/fence má na konci jeden pending scope, queue0, issues0; nelze jej označit za konkrétní čekající GPU job. Příčina synchronního render spiku zatím změřená není. Obnova tedy není přijatá.

Vlastní UIleave/tabclose/viewportreset a normální API40952/preview3853 Ctrl+C exit1 jsou dokončené; source15 zůstal beze změny. Finální výkon a main/default přijetí zůstávají otevřené. Staré raw ani selhání se nepřepisují.
