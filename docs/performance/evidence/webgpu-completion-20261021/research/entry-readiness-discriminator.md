# Source12 first-entry readiness cost: current evidence and alternatives

23 October 2026. Runtime f3e50f94, source12 053501f0; fresh native MaterialDefines SHA3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768. Read-only renderer audit; no proposed product patch is accepted here.

[Actual v14](../validation/entry-source12-v14/verification.json) captures first accepted entry4194–4201, zero new shader/pipeline jobs. Main first PBR readiness364calls/53.9ms, Standard137/16.9ms, bindings17.8/5.2ms; next seven readiness totals much lower. These are synchronous wall times including observer, VM/GC and scheduling. Equal call counts do not isolate any inner branch or JIT cause.

## Primary mechanism

Pinned source12 Babylon9.30.0: Light.setEnabled382 → _resyncMeshes659 → AbstractMesh._resyncLightSource975–1029 changes membership and marks defines for every existing pass wrapper. MaterialDefines.markAsLightDirty137 sets general dirty even when the resulting shader combination is cached.

PBRBaseMaterial._prepareEffect963 evaluates _prepareDefines before the dirty gate. Dirty work builds fallbacks, ABI attributes/uniforms/samplers and serializes at1182 before engine.createEffect. StandardMaterial performs analogous inline work from1067. F3 shares schema/order; it still reads values and builds fragments/output. Actual schema hit/miss and serializer time were not measured in v14.

WebGPUEngine.createEffect1534 builds the key, probes the cache, possibly calls the callback and increments refCount when returning a cached Effect. PBR/Standard still notify, reset cached material and call SubMesh.setEffect941/1303. DrawWrapper.setEffect50 normally resets even for the same Effect. WebGPUDrawContext.reset79 releases owned UBO slots and clears buffers/bindGroups; it does not destroy GPU buffers. The subsequent engine draw2913/2961 resolves leftover UBO and bindgroups outside the material-bind timing scope. Light binding must preserve actual light/shadow sources; shader identity alone cannot justify skipping it or changing f197 pass ownership.

## Reasonable variants and decision

- Reuse existing eight-routine data: no runtime cost, but only identifies outer readiness/bind boundaries. Cannot choose a fix.
- Serializer-only microbenchmark or revive old memo/fragments: cheap, but does not measure this first-entry path; prior rejected candidates remain rejected.
- Skip same-effect setEffect/reset by identity: small apparent patch, but potentially changes ABI/buffer/bindgroup ownership and light updates. Not justified by zero compilation.
- One bounded eight-frame inner diagnostic: PBR readiness, Standard readiness, PBR _prepareEffect, PBR _prepareDefines, MaterialDefines.toString, engine.createEffect, SubMesh.setEffect and bindgroup-cache getBindGroups. This distinguishes preparation, serializer, cache API and reset/bindgroup work without adding render/readiness calls. It remains diagnostic overhead; UBO uploads stay residual. If needed after the current first-F input gap, this is the smallest next discriminator, not authorization to edit existing helper modules.

Only bounded dirty/pass/effect/reset/owned-slot/bindgroup scalars should accompany such a future trace. Cache hit requires known prior Effect identity from a bounded arm-time map, otherwise unknown. Do not rebuild a key or repeat toString to classify it. JIT, GC and scheduler attribution require independent browser VM evidence if the remaining residual warrants it.

The separate current v15 task observes only new compiler inputs for the actual B6 first-F five-program gap. It must not absorb this unrelated inner-readiness instrumentation. No product fix, cache, FPS gain, GPU-time claim or main/default acceptance follows from this read-only audit.
