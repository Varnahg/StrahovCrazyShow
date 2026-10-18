# Standard IBL historic order compatibility

Historical gzip bytes/hash remain unchanged. Only the Standard expected no-reflection value bag adds the explicit false LOD declaration, with guards proving previous absence and REFLECTION=false. Actual values remain unfiltered; exact shader body/prefix/layout/Effect/lifecycle assertions remain. Targeted12/12 PASS; complete native1439 and combined1499 PASS.

## Root integration and remaining GPU work

18.10.2026 root integrated vendor WT418a3824→main8b949b7a and receiver WT b033b386→main246002fc. Fresh native1439/combined1499, both full TS/build/isolatedintegration PASS. Evidence docs/performance/evidence/webgpu-migration-20261016/authored-native/README.md. Combined diagnostic0programs/max471.5ms; subsequent normalnative5programs/max573ms, so full native GPU acceptance remains OPEN. Protected builds unchanged; ownQA stopped.
