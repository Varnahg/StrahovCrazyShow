# Shader inventory diagnostic v13

Source 779c1218de601d8ec6b4b921d8ca4ceff76afed6; snapshot 0a7ee48a4ec6dc7c260c1e204d322dfd4cea04c1fc9849efeafcd11659e25ed0. The tagged production diagnostic build passed44 targeted tests and full TypeScript/build. Full suite and integration were not run for this diagnostic-only checkpoint.

Edge session a3930f53-1a85-4add-92a6-77a4e0b2b2dc reached game-ready in47.1475s after mode entry, with24.475s lighting and12.1069s after the lighting event. This profileEnvironment=1 run is not an FPS acceptance sample.

At preparation end, all662 module calls had recognized raw and body text; both duplicate counts were zero. No descriptor/body unknowns, capacity limits, collisions, ambiguity or truncation were recorded. Retained text occupied19,972,253 UTF-16 code units. Capture/stage CPU overhead was264.9ms total,2ms maximum per capture; snapshot/serialization cost is excluded. These are preparation-stage counts, not a claim about all modules created after the final gate.

An exact-source cache and removal of the known outer diagnostic prefix have no measured benefit here. Pinned Babylon also emits generated const declarations into both WGSL stages, including potentially unused flags. The next experiment only observes a conservatively derived comparison, retaining used/ambiguous/unsafe declarations and preserving runtime source byte-for-byte. No shader transform, cache replacement or weaker validation is justified yet.

The session is an immutable byte prefix copied after game disposal; native-v13 services and protected4192 remain separate. Artifact hashes identify copied evidence; operational process IDs are intentionally excluded.
