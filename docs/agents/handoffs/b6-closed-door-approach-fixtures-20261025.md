# B6 closed-door approach regression update

Root owns this scope. The existing two whole-world arrival tests expected an open entrance, and the paving test still appended the old schematic entrance. The published native entrance now has a closed-default interactive leaf. Disabling door collision or opening it directly would bypass the new requirement; the tests therefore use the production `ServerDoorInteractions` adapter and ordinary Actor input ticks.

`tests/helpers/cad-entrance-tour.ts` shares only test driving, immutable native entry waypoints and the real queued authority adapter. Both routes settle outside, climb the native stairs, demonstrate closed-leaf blocking, step back to a reachable safe stance, submit a validated open request, enter the native N01 zone, walk back out, close, verify blocking again and return to the original outdoor terrain. No teleport, capsule reduction, jump or extra world step is used. The original paving continuity/source hash assertions remain.

Changed own files: `tests/b6-reality.test.ts`, `tests/terrain-patch.test.ts`, the helper above and this handoff. Root separately owns the V14 literal update in `tests/network-diagnostics.test.ts` and regeneration of `shared/data/transit-navigation.json`; the latter preserves 9 destinations and 18 journeys while updating current source provenance.

Verification: four focused regressions PASS, then all four affected test files **31/31 PASS**, exit 0, 36.91 s. Logs: `.cache/b6-closed-door-approach-fixtures-20261025/targeted.log` and `affected-files.log`. The whole-world source uses the current B6 native model. This proof covers the front approach, not unresolved rear-height discrepancies or every room.

All own test processes ended. No commit/staging by a subagent; root retains the claim until integration.
