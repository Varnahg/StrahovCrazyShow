---
title: Úplné časové párování herního snímku a zachování měřicích dat
type: bugfix
created: 2026-11-03
status: done
route: oneshot
---

<frozen-after-approval reason="Uživatel výslovně zadal implementaci navazující na research; jde o nutný úzký předpoklad výběru skutečné optimalizace.">

## Intent

Zachovat již dostupná měření v celém řetězci Game→diagnostika→UI→lokální úložiště. Při C9 interval1329,6ms nelze porovnat jen s66ms scope do labels a vyloučit zbytek callbacku. Původní cpuMs/phases se nemění; navíc se přesným frameStartedAtMs spáruje skutečná dokončená doba předchozího Game callbacku včetně recorder/HUD. Práce enginu/browseru mimo tento callback zůstává samostatnou neznámou, ne falešně přiřazenýmCPUčasem.

Projektor benchmarku zachová již klientem produkované frameIntervalsMs a nullable main-pass GPU ms se scope. Pouze omezené numerické pole odpovídající frames, žádná tichá truncation ani odstranění privacy/health/identity/size ochran. Staré payloady bez polí zůstanou přijímané. Main-pass není GPU celé karty ani nutně tentýž CPU frame.

Přijetí: validní předchozí timestamp dovolí přesné párování; jiný timestamp, chybějící minulý snímek, visibility/lifecycle reset a neplatné hodnoty nevyrobí falešný důkaz. Recorder neudrží mutable Game referenci. Skutečný Game wiring a dvojí projektor/HTTPstorage roundtrip mají cílené regrese. Běh hry, kvalita, shader readiness ani30/90s limity se nemění. Žádný nový obecný profiler.

</frozen-after-approval>

## Implementation Notes

- Primární podklady: researchcdb3b8f7, rawC9 seq1132/1653/1666, Game3335–3358/lastCpuFrameMs, session-diagnostics.recordFrame a shared/local-benchmark.projectLocalBenchmark. Stávajícírecorder self-cost zachovat a využít.
- Varianta přesunoutrecordFrame až na konec by změnila kontext/pořadí událostí a stále nezměřila sama sebe. Volena předchozí dokončená hodnota sidentitou snímku; datově omezená, bez dalších rendererhooks. Úplná série měření není dopočítávaná z průměrů.
- Export: jednoúčelové rozšíření stávajícího projektoru místo vedlejšího nevalidovaného uploadu. Agent navrhl8192prvků a actualpayloadboundarytest; finální cap musí respektovat256KiB limit a hotový10sHUD benchmark.
- Přesné scopes: gameplay-callback-timing-20261103 (Game,recorder,3tests); gameplay-benchmark-export-20261103 (sharedprojektor+tests); root pouzekoordinace/spec/evidence a navazující integrování. Podagenti získávají vlastní claim; žádné větve/kopie.
- Žádná nezvratná operace ani chybějící uživatelská preference. Diagnostický celek je samostatně ověřitelný, ale není splněním navazujícího výkonového cíle. Po něm následuje jeden cílenýprofil a jeden konkrétní výkonový patch podle důkazů.
- Lehkécílenétesty+scopedTypeScript průběžně, nezávisléreview. Build/GPU/SDK přes samostatný validačníclaim. Plná sada až nadfinálnímfunkčnímcheckpointem, nikoli po každém měřicím políčku. Zachovat C9 a předchozí neúspěchy.

- Výsledek: export21/21, callback50/50, společně s odděleným lifecycle QA73/73 PASS; celý projektovýTypeScript PASS. Nezávisléčtecíreviewdiffu beználezů. Samostatnýloopback `profileFrameLifecycle=1` využívá jižexistujícíhelper bez aktivace shaderinventory, má8sloweventů/s a benchmarkstart/end snapshoty. Jejich counters zůstávají úplné, eventlist je omezený a tak označený. Tato oprava dat není výkonovou přejímkou.
