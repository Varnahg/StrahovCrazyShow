# Handoff: fps-transit-cost

- Owner: `fps-cpu-20261013`; recipient: root FPS coordinator.
- Checkout: `/workspace/StrahovCrazyShow`, `main`; base `a381cf637b607b364e85b1e44a8e57566b3c9a0d`.
- Result: implementation and targeted regression validation complete. `Simulation.tick` uses the same scheduled buses, ambient vehicles and obstacle geometry without creating passenger routes, avatar configuration or transit UI status. Full visual `sampleTransit` still returns all passengers and status. Ambient source-route lengths are computed once from the bundled feed.
- Contact shadows: an invisible request returns before pose access, terrain sampling or instance creation. Existing hidden instances retain their last visible pose; showing them restores the current pose, dimensions and terrain/airborne orientation. Removal and recreation remain supported.
- Changed files: `shared/transit.ts`, `shared/simulation.ts`, `client/contact-shadows.ts`, `tests/transit.test.ts`, `tests/contact-shadows.test.ts`, `scripts/profile-transit-cost.ts`, this handoff. `client/transit-renderer.ts` deliberately has no changes by agreement with the coordinator; unnecessary per-frame pool pruning remains an audit follow-up.
- Existing unrelated WIP: root coordination/evidence, grass, cinematic and B6 work belongs to the other agents and was not modified here.
- Sources: actual shared transit schedule/terrain/collision contract, pinned Babylon 9.30.0 instanced-mesh lifecycle, existing `tests/transform-updates.test.ts`; inspected 2026-10-13. No new map geometry or timing assumptions.
- Refactoring: both sampling callers share one scheduled-bus traversal; the optional passenger output controls crowd work without an empty discarded array. Visual frame construction retains its public fields. Cached route lengths use exactly the previous left-to-right metric sum and do not quantize motion. No mutable per-player cache or cross-scene state was introduced.
- Validation at approximately 14:45 UTC: `pnpm exec tsx --test tests/contact-shadows.test.ts tests/transform-updates.test.ts tests/transit.test.ts` exited 0, **15/15 PASS**, 2.886 s. New tests exercise 300 never-visible crowd updates with zero new meshes/pose reads, hidden-motion reveal on terrain and in air, removal/recreation, exact vehicle/obstacle parity at arrival/midnight/expiry/time rewind, and exact ambient speed. Existing real Babylon matrix/bounds and transit route tests passed.
- After the final sampler allocation refactor: `pnpm exec tsx --test tests/transit.test.ts` exited 0, **10/10 PASS**, 1.980 s. `git diff --check` for the changed existing files exited 0.
- Profile driver: `pnpm exec tsx scripts/profile-transit-cost.ts /absolute/checkpoint`. The same driver dynamically imports the target checkout and falls back to baseline full sampling when the vehicle-only API is absent. Five repetitions of 240 calls for arrival, walking-passenger and expired-feed windows report component CPU mean/p95/p99 plus obstacle SHA-256. Source and driver hashes are recorded. Run serially with `heavy-validation`; no benchmark was run by this agent. This is not browser FPS, full physics-step timing or hardware GPU evidence.
- Processes: no own server/browser or persistent process remains. Only finished targeted CPU tests ran. Shared build/full tests/integration and practical game verification belong to root.
- Reservation: released after this handoff. Root owns integration and final task state.

Source SHA-256, including regression tests:

```text
69f6e13442f8cf7aa5a513959c543cd618d097d2a61d786f0f9bb7add57b028f  shared/transit.ts
11f6016a254b33b7b042ee1c225027b78c1b17b5913753c42d065ee8162d9ea5  shared/simulation.ts
921029fcc718812a7248244b38f021363763135197dedba884fe424424480837  client/contact-shadows.ts
7b4ddd077d597d4563d12fb0de5ddb6cad1a682e6f1c6f75820c9c6696acab65  tests/transit.test.ts
1701fe968ebb2eba80b0d3100310fac1bd6f20c4083c43ff65c2535acfc30724  tests/contact-shadows.test.ts
5f4af639ba8666cca46f7b38d875003a42904b8141ed9b5ac6614bcbb5396c0f  scripts/profile-transit-cost.ts
```
