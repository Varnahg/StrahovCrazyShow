---
title: 'KEY-31: cena interního serializer memo'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Autorizované pokračování cíle, úzký vratný QA sběr">

## Intent

Rozlišit, zda přesný existující serializer memo skutečně zlevňuje dominantní CPU rutinu při změně světel, a určit zbývající readiness/binding náklady. Použít současný bounded8routine timer a jeden produkční Edge průjezd nad izolovaným current memo; žádný zásah do hraných buildů nebo nativního runtime. Výsledek je diagnostická odpověď, ne přijetí memo nebo celé migrace.

</frozen-after-approval>

## Implementation Notes

- Dokončeno33/33targeted/fullTS/build, nezávislý code/capture review[]. Source118ba771...,session82393618...,460seq/3samples/cleanup0/healthvalid. Staticserializer499calls29,7ms vsA61,2ms,429calls24,4vsA431calls50,8. Zbývá příprava92,2/50,8ms a binddraw46,1/36,4ms; různéinstrumentovanéběhy nejsou čistéFPSA/B. FirstinactiveUItimeout zachovanývallsessions, rawtimeoutcausealoneunproven; úspěšnýactivewindowreloadready. Evidence memo-routine-profile/README.md, hraný4199protectedexact, vlastníprocesy4200/2595 ukončené. Dokončen diagnostickýtask, KEY31/migraceopen, žádnýmemo nativepřijetí.

- Malý reversibleQA rozsah bez nejasného uživatelského chování/irreversibility, protooneshot. Claimwebgpu-01a15102-memo-routines vlastnícache/evidenci/BMAD/4200/2595/heavy/gpu. Týmový rendererfe8292081bd751763aeb zachován;133foreignWIP bezezměny.
- Předchozícurrent čistýpilotmain07b26c6d memo nepřijal. A serializer wall61,2/50,8ms na499/431volání, createEffect2/1,3ms, bindgroups16,4/10ms; všechnyčistéběhy mají0programů/0modulů a2syncpipelines s přímýmCPU0–0,2ms. DeferredGPUpráce tímnevyloučená. DalšíFPSopakování by nezodpovědělo cenu serializeru.
- Primárnízdroj je přesný současný MaterialDefines/Standard/PBR z currentproof8567f6f a stávajícíQA helper s descriptorrestore/Reflect.apply. Read-only průzkum potvrdilstatic hook místo prototypehook: guard porovnávádefines.toString se zachyceným stockmethod; static wrapperje nemění. Target5 budeMaterialDefines._SerializeForEngine, ostatních7/max8frames/max32depth/lifecycle bezezměny. Static inclusive zahrnuje rawreads+owner/lease+lookup+canonicalfallback, ne samostatnouhitrate.
- Alternativy: dalšísampler má nepravidelnévzorkování; novýcachecounter rozšiřujeruntime; většímemo nemá doloženýpřínos; zrušenírawreads měnígetters/throws. Stávajícístatictimer je nejmenšízpůsob získáníchybějícíodpovědi bezvypnutímemo. Wrapperrežie/GPUtakty/menšítrajektoriálnírozdílyzůstávajílimity.
- Sourcecandidate pochází výhradněroutine0ac5b4db se stejnouGame/testintegration; privátní core/loaders jsoupřesnýtestovanýcurrentmemo. Helper/testověřitstockidentity/staticcalls/restorecompletion/exception, fullTS/build. JedenEdgeLow/night/0ambientfirstdrive, publicUIbenchmark+rawseq/session/health+protected4199before/after. Porovnatstejnétriggery, počty, wholeScenerender, nezaměňovatnestedinclusive+childrenneboinstrumentovanéFPSzaA/B. Independentblindreviewpoté; samostatnáevidenceintegrace, KEY31open.
