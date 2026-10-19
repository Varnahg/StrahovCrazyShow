---
title: 'KEY-31/32: actual Medium firstdrive JS stack capture'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Přiřadit zbývající dlouhé renderCPU snímky skutečné první Medium jízdy k JS stackům. Použít existující opravený bounded JSselfprofilerV2 na současném nativním F3+SDWf8 v samostatné kopii. Zachovat běžnou scénu, hrané snapshoty a cizíWIP. Tento diagnostický průjezd není výkonová přejímka ani nový runtimeoptimizer; skutečný výsledek určí následující opravu.

</frozen-after-approval>

## Implementation Notes

- Doložené: shadow sharing je vmain1757002, evidence4ebf650. Aktuální nativeMedium6preparations7sync stále5>=100ms. PředchozíplainS raw má131/119msCPU, render101/113ms; další dlouhéintervaly mají krátkýpředchozíCPU. Synccompiletotals ani asynccompletionlatency nejsou úplnýrozkladCPU/GPU/idle.
- Varianty: dalšíprewarm/cache/contextreuse bezstacků nedoložené;8routinewrappers mají omezenýscope/nejvýš8snímků; standardníexistujícíJSProfiler16ms/max2000 jižvEdge155 skutečněfungoval(637samples). ZvolenexistujícíCPUv2bezdalšíchroutine/programattributionhooků. Reusevyžadujeužreviewed boundedmeshdiagnostic/lifecyclevětev, nikoli novýframework.
- Rootownclaim medium-cpu owns cache/evidence/BMAD/heavy/GPU/build/4200/2595. Žádnéintentgaps/nevratnézměny/novéprodukčníAPI. DonorcurrentNativeclean8fb source581+depsf8. Native Game32f přes9lightSwitch edity→3321,9CPUv2→e0a, přesnýinverseobouvrstevzpět32f;rendercost2diagnosticchanges;newmeshdraw/cpumodule a3testy zCPUv2. Nežádoucíold629snapshot/deps/pin/config nepřebírat.
- Stávající29targetedtestů včetněgenuinecompletion-error/start/restart/dispose/recordingcleanup;fullTS a minifiedhiddenmap build. Zdrojovétesty vmanifestu, původnípin/depsSDWf8 aMD3cc bezezměny. DocumentPolicyjs-profiling pouzeownpreview,plainwebgpuquery+explicitnílocalbenchmark.
- JedenactualEdge Medium2040×986/Alex/night/car S1900/E/benchmark/E/W8000/space2500,30ssettle. Uložit veřejnérawtraceexport,benchmark,session,timingorigin,JS/mapSHA. ExistingSourceMapanalyzer upravitjenpaths/actualhitch correlation. Nonuniform/sparse samples bezstacku nejsouCPUprocenta/GC/GPU/idle důkaz. Limity/truncation/profilererrors přiznat, žádnézjednodušenívýkonovébrány.
- BlindHunter čtejenexactown7sourcedelta+assembler/protocol;žádnýminimumnález. Ownservices/kartuzastavit, průběžnýLinear, samostatnýevidencecommit. Hitches/KEY31/32/default/fullgoalneuzavřít podleprofilingtasku.

- Actualprofile784samples,29/types/buildpassed;4UVdirtychain observations,5hitchesremain. Source/mapSHA+irregularsampling/hitchlimitsvREADME,notCPUpercent. First-vs-laterhypothesis unresolved;nextcandidate scopedstockpath only. BlindHunter[],ownservices/karta stopped.
