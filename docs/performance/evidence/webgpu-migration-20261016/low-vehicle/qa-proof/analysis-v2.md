# V2: fail closed after a leased root is disposed

Reviewer P2 is reproduced: disposing only car or parked during vehicle-0 leaves Game/scene live and object identity unchanged. Babylon Node.dispose marks isDisposed without necessarily changing isEnabled or scene mesh count. V1 checked validity only when acquiring a lease, so both new actual tests received complete instead of failed.

V2 validates live current roots on every lease reuse and includes each root's disposal bit in the current-stage revision. This forces reapplication before another acceptance draw, where invalid ownership fails closed. Restore still releases the captured live partner, skips disposed nodes, and turns off the owned vehicle beam through inactive VehicleLighting.update (which never reads the root world transform). It does not run normal environment presentation on dead roots. Stages,30/90s budgets and normal ready/restore behavior are unchanged.

The two regressions dispose the actual TransformNode while Scene/Game stay live. Counters observe, rather than throw from, disposed setEnabled/world reads. V1 RED: both actualcomplete/expectedfailed. V2 GREEN: failed, zero disposed writes/world reads, zero further render, live partner restored, beam off, callback detached. Existing replacement/retirement/latest-state tests remain green. Targeted31/31 and scopedTS3363/0; unrelated26 tests and helper tests are not repeated.

Original source remains immutable at candidate/. Original manifest and all17artifacts including the old handoff are preserved under v1/. New source is candidate-v2/, final manifest is manifest-v2.json. No native/runtime/dependency/build changes. The v1 root assemblycf0a7ad7 was not accepted and must not be used as V2.
