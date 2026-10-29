# KEY-17: integration into current main, 14 October 2026

Base: `2c7aec924c7f24f2f129c1c4343305c2d9fbffcc`. Accepted implementation candidate: `6df08fb6b4003bc958a72fd58592ee24fa74dc41`; only its ten changed files are transferred, not its branch ancestry. This completes an existing candidate rather than introducing another graphics change.

## Cause, alternatives and decision before integration

Babylon 9.30.0 ImageProcessingPostProcess constructs a Thin wrapper and passes it to PostProcess as an external wrapper. Base disposal therefore skips its disposal, leaving its configuration observer and effect alive. Conversely, base disposal clears an observable aliased to a borrowed wrapper, removing subscribers belonging to its caller. An explicit undefined wrapper option can also overwrite the constructed wrapper through object spread.

Retain the reviewed version-specific patch: record actual ownership in the derived constructor, resolve the wrapper after option spread, null the owned reference before disposal and always call base disposal in finally. Clear the effect-created observable only for wrappers owned by the base. This consolidates lifecycle ownership without a new cache or per-frame work. Client casts into protected internals would couple the game to undocumented state; replacing the whole postprocess chain would expand graphics scope; upgrading Babylon would change unrelated engine behavior. None is justified for this issue.

Primary sources: [exact Babylon 9.30.0 implementation](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/PostProcesses/imageProcessingPostProcess.ts), its installed PostProcess/ThinImageProcessingPostProcess/Effect sources, [pnpm frozen install](https://pnpm.io/cli/install#--frozen-lockfile), and the [original research](../../research-20261014/image-processing-ownership.md). Reproduction uses the repository's pnpm 11.25.0, not an inferred latest tool version.

## Interaction and security review

Independent read-only review by key17_security_review found no blocker. It checked actual wrapper references, reentrant/double disposal, base camera detach, borrowed observable subscriptions and normal Effect reference counting. The patch changes two published JS modules; no shader, public API, client/server code, network protocol, guest isolation, diagnostics payload, permission, filesystem access or dynamic evaluation is added. Lockfile changes are only patch identities: versions, integrities, schema 5.0.36 and existing build permissions stay unchanged.

KEY-4 and KEY-14 depend on this ownership correction, but their postprocess cost/night grading acceptance remains open. KEY-13 texture flashes, KEY-16/B6 transitions and KEY-7/12 movement are unchanged. ThinBloom/FXAA ownership remains outside this patch. Shared-config disposal behavior of separately owned Thin instances is pre-existing and not generalized by this fix. The finally block guarantees an attempt at base cleanup, not recovery from arbitrary throwing callbacks.

## Validation plan and limits

A fresh worktree with its own offline frozen installation will run the ten real Babylon lifecycle regressions, existing related regressions, then one full test/build/integration pipeline over a hashed source set including all tests and tracked assets. The original unpatched 1/10 versus patched 10/10 proof remains in the candidate evidence. Full results below are recorded only after completion.

All old previews, their dependency junctions and main's shared installed packages remain unchanged. Main receives source/lock/patch only; a fresh frozen install applies the patch. No GPU benchmark, visual acceptance, FPS improvement or user playthrough is claimed by this lifecycle fix.

## Preserved preparation failure

The first full run reported843/846 passing and three failures: runtime vegetation tests parsed Git LFS pointers as GLB. Worktree creation had not materialized the two runtime LFS objects. This was a preparation mistake, not evidence of a Babylon regression. The exact two locally stored Git LFS objects were verified against their tracked SHA256 and size, then materialized without regeneration, downloads or test/code changes. The next run exposed that the vegetation provenance test also needs its editable Blender master:850/851 passed, one source-hash assertion failed. The initial assumption that authoring sources were unnecessary was wrong. All12 tracked LFS objects were then verified and materialized from local storage, including authoring inputs. [Original attempt](attempt-1/pipeline.jsonl), [full failure log](attempt-1/test-output.txt), and [exact environment correction](lfs-materialization.json) are retained. [Second attempt](attempt-2/pipeline.jsonl) and its full output are also retained. The successful fresh installation is reused unchanged; focused and full validation repeat on the complete LFS checkpoint. No implementation or assertion changed between attempts.

## Completed results

Snapshot: `fe5fc15ff3c4e745f30cab4cdc21a2725b8f19732e2c9431a576d853b3b76993`;8393 hashed inputs,156 test files. Fresh offline frozen install: PASS. Targeted:26/26 PASS. Full suite:851/851 PASS. TypeScript and production build: PASS. Complete integration on2568: PASS. The accepted install and four final validation commands exited0. Both incomplete-LFS attempts and the final complete-LFS run are retained separately; no assertion was relaxed. [Pipeline](pipeline.jsonl), [exact inputs](checkpoint.json), [post-check](post-check.json), and the five *-output.txt files retain complete results. Original main dependency hashes and resolved paths are unchanged.

Integration preserves the existing dirty main work byte-for-byte; docs/verification.md receives only this new appendix, while its pre-existing unstaged content is excluded from the commit. Only the reviewed candidate, this acceptance evidence and one task/handoff are staged.
