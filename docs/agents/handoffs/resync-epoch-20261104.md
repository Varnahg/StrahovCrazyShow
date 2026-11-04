# Resync epoch recovery — implementation checkpoint

- Task/owner: `resync-epoch-20261104` / `epoch-recovery-impl-20261104`.
- Checkout: main at `77b44742`, original runtime files clean; no branch/copy/server/build/GPU.
- Problem: delayed recovery requests reset the same session repeatedly and erase newly queued commands/prediction.
- Mechanism: both actual server handlers unconditionally reset after their existing rate check; Game retries every 1s. Archived user evidence/spec identify 20 close reply pairs. This does not explain all render stalls.
- Single change: require the client's accepted `inputEpoch` for both recovery channels, validate ownership/token/current epoch/rate before mutation, use protocol V15. Door bootstrap defers until a valid received authority exists.
- Main metric: two same-epoch requests (including mixed channels) produce exactly one forced authority/reset and retain new-epoch queued commands.
- Correctness: preserve 1s retries, stale/replay/physics limits, held controls/jump edge, current-room lifecycle, rate-limit retry and terminal door identity rejection.
- Acceptance: actual handler regressions plus actual Game/UI tests pass; root owns full suite/build/SDK/Edge validation and integration.

Design choice is recorded in `RESYNC.md`: epoch guard needs no timer/request-id cache and handles both producers; client-only pending state and extended timeouts cannot invalidate delayed server work. A single closure-local door bootstrap flag is needed only before the first accepted authority.

## Final implementation checkpoint — 2026-11-04

Runtime and tests are frozen for root review/integration. Both recovery channels share one validation/reset closure. Invalid/current-client/epoch/rate checks all precede mutation; stale requests send neither door snapshot nor forced authority. Game's stale and visibility producers include applied epoch; UI overflow and door recovery use the validated room frontier. UI onAction already forwards data unchanged and has an actual-binding regression. Door bootstrap defers a request only until a valid authority; callback `false` consumes no cooldown, sent/throw retain the 1s throttle. Terminal identity failure remains terminal, including failure before the first authority.

No new timer, request cache, resettable frontier state, or per-frame allocation was added. Getter reuses AuthorityBuffer's existing reset/dispose lifecycle. The shared server closure removes duplicate recovery logic. Physics, stale250ms/replay32 limits, retry intervals and existing benchmark/UI changes are preserved. Three SDK CLI producers now send their last authority epoch and accept a newer recovery epoch if an intervening server clock drop legitimately makes the original token stale.

### Files

- Runtime: `shared/netcode.ts`, `server/index.ts`, `client/authority-buffer.ts`, `client/door-connection.ts`, `client/game.ts`, `client/ui.tsx`.
- SDK CLI: `scripts/integration-input-backlog.ts`, `scripts/integration-respawn.ts`, `scripts/integration-cad-doors.ts`.
- Tests: new `tests/resync-epoch.test.ts`; modified `tests/authority-buffer.test.ts`, `tests/door-connection.test.ts`, `tests/client-recovery.test.ts`, `tests/network-diagnostics.test.ts`, `tests/room-callbacks.test.ts`. Existing `tests/cad-game-doors.test.ts` ran unchanged.
- This handoff and `.cache/resync-epoch-20261104/` evidence. Other dirty/untracked files belong to root/previous work and were not modified.

### Verification and evidence

All test commands use direct Node, no dependency installation.

| Command/scenario | Result | Evidence |
| --- | --- | --- |
| `RESYNC_SERVER_SOURCE=.cache/resync-epoch-20261104/server-baseline.ts node --import tsx --test --test-name-pattern='actual handlers reset once' tests/resync-epoch.test.ts` with source from `git show 77b44742:server/index.ts` | Expected red: 4/4 fail, exit1. All same/mixed channel pairs: epoch7→9, **2 forced authorities**, new queue depth0. | `.cache/resync-epoch-20261104/server-baseline-red.log` |
| `node --import tsx --test tests/resync-epoch.test.ts` | 11/11 PASS, exit0. Same trigger: epoch7→8, **1 forced authority**, new queue depth1. Includes current-owner/malformed/old/future tokens, rate rejection then retry, server-clock-drop and pure validation. | `.cache/resync-epoch-20261104/server-green.log` |
| `node --import tsx --test tests/room-callbacks.test.ts tests/authority-buffer.test.ts tests/door-connection.test.ts tests/network-diagnostics.test.ts` | 70/70 PASS, exit0. Actual UI bindings and actual Game rejection path; bootstrap/deferred/current-room/disposed/terminal identity/overflow/forwarding. | `.cache/resync-epoch-20261104/ui-tests.log` |
| `node --import tsx --test tests/client-recovery.test.ts tests/cad-game-doors.test.ts` | 26/26 PASS, exit0. Actual Rapier Game recovery and visibility; two stale waits1002ms apart carry the same epoch, fresh authority resumes future movement without a second jump edge. Existing CAD physics/replay regressions remain green. | `.cache/resync-epoch-20261104/game-tests.log` |
| `git diff --check` | PASS | Root may repeat over accepted diff. |

Total authoritative logged tests: **107 PASS**. First exploratory client batch did not retain its final terminal output and is excluded from counts; subsequent split commands above are the retained evidence. Read-only review identified that an80-input overflow fixture cannot exhaust the60-packet/s pressure budget; the fixture now enqueues560 inputs, asserts actual overflow, then checks the epoch request. Assertions were not weakened. A separate read-only runtime audit found no actionable issue and suggested the terminal-before-authority regression, which is included.

Runtime/test hashes (including unchanged CAD test) are in `.cache/resync-epoch-20261104/manifest.json`; manifest is the frozen source identity, not a claim that the shared dirty tree is a commit. No commit or staging performed.

### Handoff / limits

- Recipient: root coordinator. Full suite/typecheck/build/SDK integrations and Edge remain root-owned under `heavy-validation`; none was run by this agent. Syntax-only transpilation is recorded separately and is not typechecking.
- No server, browser, port, GPU or persistent helper process was started. Test processes completed; the exploratory process PID13628 was observed absent after completion. User server8080 untouched.
- This proves removal of redundant epoch rebases in the targeted trigger. It does **not** establish a fix for all low FPS,6s render stalls, or final gameplay acceptance.
- Claim is released after final manifest/syntax/diff checks and notice to root. Task completion/commit belong to root after review and required validation.

## Přijetí integrátorem · 4. 11. 2026

Root převzal přesně předané soubory a ověřil shodu všech16SHA s manifestem. Finální nezávislé review[]; celý TypeScript/produkční `pnpm build`, úplná SDK integrace a neměnný C14 build PASS. Cílený skutečný Edge/WebGPU průchod s3relacemi, chůzí a novým HUD verdiktem proběhl; vlastní procesy/okno uklizeny, vstupy revalidovány. [Úplná evidence](../../performance/evidence/gameplay-frame-cost-20261103/resync-epoch-20261104/README.md) zachovává první startup timeout i nevyhovující FPS a přesný full-suite výsledek. Přijatý je epoch guard, ne obecná plynulost hry. Klient/server nyní společně používajíV15. Integrace probíhá přímo na main bez přibalení cizího WIP.
