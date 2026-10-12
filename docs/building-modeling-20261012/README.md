# Strahov building modelling, 12 October 2026

This pass improves source-identified buildings while retaining their mapped footprints and shared collision layout. The visual target is richer, softer architectural detail within the Strahov setting. It does not invent Gothic buildings or claim a photogrammetric reconstruction.

- **Windows:** actual Blender profiles for frames, sashes, gaskets, mullions, recessed reveals and folded/sloped sills. Fixed millimetre profiles survive resizing; near/highest variants retain the same architectural construction. [Authoring and source references](../reality-pack/building-window-kit-20261012/README.md).
- **Block 4:** three identified north/west faces, 12 small front windows, five west-aligned stair bands on the recessed north face, and 18 small west-return windows. Blank areas remain blank. Grey panel composition is unverified; joints, bevels and dimensions are declared modelling estimates. [Photo identification and placement](references/b4-facade-plan.md), [actual Blender panel kit](../reality-pack/b4-facade-panels-20261012/README.md).
- **Potraviny / R-ko:** source-backed cylindrical flue details, collars, rain cap and protective cage. The building is OSM way 7645350; the exact R-ko door remains unverified and was not invented. [Reference observations](references/observations.json).

The game uses these authored data through material batches and distance-based detail. Every building also has its own editable highest-detail Blender master and portable GLB: [files, coordinate convention and verified transfer limits](../reality-pack/separate-assets/README.md). B6's existing schematic interior remains; the stadium remains a closed exterior. No extra interiors were added.

[Production checkpoint and pending visual work](../verification-evidence/building-models-20261012/README.md): 675 tests, production build and isolated integration passed. The first real game measurement was 31.8 FPS on Intel UHD 630 at medium 1280×720, one avatar; GeForce, 60 FPS and a new crowd benchmark are not yet verified. Further close-up gameplay photographs continue after the user-requested main integration.
