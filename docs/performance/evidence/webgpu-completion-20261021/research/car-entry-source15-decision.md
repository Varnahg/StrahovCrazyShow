# First car entry: latest evidence and source15 decision

24October2026, read-only /root/webgpu_renderer_audit followed the current source12 chain. Avatar-shadow source8e111af9 does not itself prove a car-entry improvement.

| Existing evidence under validation/ | Actual scope/result |
| --- | --- |
| car-source12/verification.json | Plain CM131.2ms, previousCPU127.1/render114.6; four compiler deltas0. Controlled GL149.1ms, CPU139.4/render113.7. GL compiler hooks unavailable, so GL zero fields do not prove zero shader work. |
| entry-source12-v12/verification.json | First accepted CM chain127.1ms = glTF0.3 + Stable4.4 + Scene122.4; GL136.2 =0.4+5.1+130.7. First nested entries in each raw browser profile are0. |
| entry-source12-v14/entry-routines-browser.json | Trigger/first Scene4194, eight frames4194–4201, compiler delta0. First main PBR readiness364calls/53.9ms, Standard137/16.9ms; bind17.8/5.2ms. Later readiness is much cheaper. |

The latest instrumented original is entry-source12-v14/ba208d3d-e7d9-44ba-b23f-7fcb4f5f2b7c.jsonl.gz: action/interact seq556 precedes seq558 hitch179.5ms (151418.7→151598.2), previousFrame.cpuMs171.1/phases.render156.9/environment7.4. LoAF173.3/script171.4/blocking122.1. These are not a worsening comparison against the other plain/v12 runs. Do not add inclusive/nested timings across different runs. Zero compilation is not zero GPU work.

Scene and first main material readiness/bind are supported cost locations. Serializer, cache lookup, context/bindgroups, JIT/GC and driver waits remain unassigned. Both controlled GL observations exceed100ms too; neither a specific WebGPU regression nor a shared internal cause has been proved. Keep the absolute first-entry performance point open separately from migration-specific acceptance.

Choose the existing bounded diagnostic before any fix. A cache/prewarm/timeout change lacks causal evidence; an all-scene profiler adds unnecessary observation. In a separate fresh source15 Game/Mia without prior entry/edit, set explicit Medium/scaling1/CSS and internal2040x986, the same night/weather/transit, healthy ready/pending0. Use existing --routine-cost action “Diagnostic · první vstup do auta /8 framů /8 CPU rutin”, arm while walking and trigger natural authoritative E false→true. Preserve entryTrigger/routineProfile/before-after compiler metrics/original hitch, exact first-frame correlation and remaining hooks0. Do not stack the three-phase capture on the same first entry; another fresh Game is required. If compiler deltas reappear, use existing30s input capture in another fresh attempt.

Decision point: compiler0 plus a repeated>100ms entry continues targeted CPU attribution, not another shader cache or timeout change. Source15 actual data remains pending. This diagnostic is separate from the steady SPAWN FPS matrix and does not inherit source12 timings as a new result. No new code, test or GPU run was performed for this decision.
