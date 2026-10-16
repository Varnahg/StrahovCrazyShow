# Production import cycle repair

Owner `webgpu-migration-01a14497-bundle`, KEY-23, branch codex/webgpu-migration. User now prioritizes an immediately playable built checkpoint and pauses further migration work.

Both Edge native-v1 and native-v2 fail before renderer-ready: `Class extends value undefined` at pushMaterial chunk line6:11307. The ordered CPU index→Game import probe reproduces the native failure while the identically transformed old GLSL reference imports successfully. PushMaterial imports Material from avatar-renderer; avatar-renderer statically imports PBRMaterial→PushMaterial, so the split cycle evaluates the subclass before its base. This is a bundle initialization failure, not a measured GPU bottleneck.

Decision: group Babylon modules and their dependencies in one vendor chunk. Pinned Rolldown1.2.13 types document entriesAware=false and recursive dependencies for circular chunk avoidance. No arbitrary client import reorder, runtime shader changes, or quality reduction. Tradeoff: larger initial vendor download; content-hashed cache is retained. Existing preview/editor commit d3c0fa7 is included in the next committed snapshot; unverified reporter WIP is excluded.

Scope: vite.config.ts and this handoff. Root's separate reservation owns build/GPU/staging ports. Next verification is production build, ordered import probe and actual Edge Game start; none is claimed passed in advance. Primary foreign WIP and played frozen4188 are untouched.

Verification completed on native-v3/f969bd1: production build with TypeScript PASS; ordered index→Game CPU probe PASS; all13JS chunks have no static import cycle, Babylon vendor imports only rolldown-runtime. Real Edge renderer-ready and game-ready observed with a drawn production scene on WebGPU nvidia/pascal. Light preparation timeout and1FPS automation window remain separate known limits, not a successful performance claim. Build is left immutable for the requested user playtest. This bundle task has no own live processes; root owns the live preview.
