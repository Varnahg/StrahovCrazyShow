# Actual vehicle-entry CPU attribution

23 October 2026. Source12 `053501f0`, runtime `f3e50f94`. [Original first-entry evidence](../validation/car-source12/verification.json) records CM131.2ms/render114.6ms and GL149.1ms/render113.7ms. New observed WebGPU shader preparation/module/pipeline counts are zero across entry. No CPU-thread stack or GPU execution timing is available. Similar wall times suggest a shared remaining cost, but one pair cannot establish its mechanism.

## Whole-chain research

The actual multiplayer E action requests an authoritative vehicle switch. The Actor changes later while Game drains authority/input; key dispatch time is not transition time. The original [manual eight-frame attempt](../validation/car-source12-routine-miss/verification.json) completed173052.6–173286.4ms while both vehicle flags remained false. Its clean completion does not attribute the cold-entry hitch.

The Game render phase includes `gltfLightBudget.prepareFrame()`, `stableLights.update()`, then `scene.render()`. Existing routine profiling starts inside Scene.render and excludes the two prelude calls. glTF's onBeforeRender calls refresh(false) directly, not prepareFrame; that work remains inside Scene time. Light topology changes can sweep materials and stable-light signature changes can dirty mesh state. These are source-supported mechanisms, not measured shares of the131ms frame.

Engine frame ID advances in endFrame after Scene.render returns. An observer in Scene.render finally must see unchanged engine ID and Scene ID +1. It cannot claim submission/completion or GPU duration.

## Alternatives and decision before implementation

| Option | Cost and lifecycle | Evidence limit | Decision |
| --- | --- | --- | --- |
| Repeat UI-arm then E | Existing helper, no new hooks | Same authority race; cold entry consumed if missed | Reject |
| Trigger on key/network request | More input/network coupling | Still precedes actual Actor transition | Reject |
| Wrap entire Game.frame | Wider method surface and unrelated work | Harder phase attribution; additional ownership | Defer |
| Poll transition on timer/RAF | Additional scheduling and clock work | May observe after first render | Reject |
| Wait in actual outer light prelude, capture three instance methods | Three bounded own wrappers, original single30s deadline, eight actual chains | Selected CPU wall scopes only; coldness needs fresh-session proof | Select |

Implement a separate default-off v11 QA observer and button under existing routine-cost flag. Preserve original eight-frame module bytes and source12. Validate all descriptors before writes; preserve original receiver/arguments/return/falsy throw through exactly one Reflect.apply. Keep nested scopes distinct. Guard identity/generation/lifecycle and restore only owned hooks on complete/timeout/abort/rejoin/disposal/foreign replacement. Retain partial failures and verify cleanup. No added readiness/render/GPU/input/network calls or product-state changes.

This observer is diagnostic and excluded from final FPS acceptance. Research, implementation, refactoring, CPU regressions and handoff belong to disjoint `webgpu-completion-entry-render-helper-20261023`; root owns fresh build, practical capture and any subsequent product decision. No product fix is selected from hypotheses alone.
