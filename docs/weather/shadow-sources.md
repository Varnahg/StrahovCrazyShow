# Celestial shadows and cinematic response

Implementation researched and checked on **2026-10-12** against the installed
**Babylon.js 9.30.0** package. This is renderer provenance and authored art
direction, not a survey or measured Strahov illuminance.

## Primary sources checked before implementation

- [Babylon.js: shadows](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows):
  directional-light view/projection, caster coverage, depth bias, PCF, PCSS,
  frustum fade, and deforming-material depth wrappers.
- [Babylon.js: image processing](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/image_processing/):
  linear/display-space compatibility and avoiding repeated image processing.
- Installed `node_modules/@babylonjs/core/Lights/Shadows/shadowGenerator.js`:
  `setDarkness`, `filter`, `filteringQuality`, `contactHardeningLightSizeUVRatio`,
  `getTransformMatrix`, map recreation and capability fallback.
- Installed `node_modules/@babylonjs/core/Shaders/ShadersInclude/shadowsFragmentFunctions.js`:
  actual PCF shadow visibility and projection rejection. The PCF softness is
  a fixed filter footprint; PCSS adds a blocker search and variable penumbrae.
- Installed `node_modules/@babylonjs/core/Materials/shadowDepthWrapper.js`:
  wrapper ownership and removal of effect/mesh observers.
- Installed `node_modules/@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.pure.js`:
  bloom threshold/weight setters update the existing effect without rebuilding
  the pipeline.

## Resulting behavior and authored choices

`CinematicAtmosphere` uses the same directional light and the same map for the
selected astronomical sun or moon. It receives `keySource` from the lighting
sample, so moon phase, distance and altitude are not estimated a second time.
Solar and lunar intensity remain the lighting system's responsibility.

The shadow projection follows the selected light immediately. Near-horizon,
weak-light, cloudy and rainy conditions reduce direct shadow contrast smoothly;
a below-horizon or absent key and complete overcast schedule no celestial shadow
pass. This is an artistic approximation to atmospheric shadow visibility, not
cloud ray tracing. A bright moon can cast a real building/tree shadow; a new moon
cannot inherit the midday silhouette.

The shadow contrast caps (0.88 solar, 0.82 lunar), elevation fade
(direction Y from -0.006 to -0.065), and rain response normalized at 8 mm/h are
explicit game choices. They preserve a useful diffuse sky fill and local lamps.
Babylon's counterintuitively named `darkness` is light leakage: 0 gives strongest
occlusion, 1 gives no occlusion.

PCF remains selected with the existing capability fallback and quality budgets:
512 / 1024 / 2048 pixels, 72 m projection span, 180 m depth range. Weather softens
**contrast**, while the PCF edge footprint stays fixed. Physical variable
penumbrae, cascading shadows and shadowed ambient IBL are not implemented.
No new map, celestial light slot, PCSS sampling cost or fullscreen effect is
introduced. Bright-moon scenes now incur the existing single shadow pass where
the previous implementation disabled it; production GPU measurement must include
that case.

The existing ACES material response and bounded 1.08–1.18 exposure are retained.
Custom display-space sky/foliage still avoid a second fullscreen gamma/tone-map
pass. On medium/high, existing bloom gently changes from day threshold/weight
0.96/0.10 to clear-night 0.88/0.12, with a rainy-night weight cap of 0.13. These
values are cinematic art direction, not a model of human vision or lens optics.
Bloom does not illuminate scene surfaces; low quality keeps it disabled.

The frame loop reuses the shadow-focus vectors. Removed wind materials release
their owned depth wrappers immediately, rather than remaining retained until the
whole scene closes. Existing broad-phase cadence, alpha testing, static-submesh
culling and resized-map callback binding remain in place.

## Verification evidence and limits

Targeted command:

```text
pnpm exec tsx --test tests/cinematic-atmosphere.test.ts tests/cinematic.test.ts tests/render-maintenance.test.ts tests/cinematic-pipeline.test.ts
```

Result: **18 tests passed**, 0 failed, 2026-10-12. The new tests verify actual
Babylon light-space projection of a caster and its ground shadow after the
sun-to-moon transition, same-light/map ownership, horizon/overcast shutdown,
unchanged budgets/fallback, bounded exposure/bloom, wrapper cleanup and snapping.

Additional targeted regression command:

```text
pnpm exec tsx --test tests/car-shadow-proxy.test.ts tests/static-submesh-chunks.test.ts
```

Result: **11 tests passed**, 0 failed. Actual Babylon dispatch preserves vehicle
proxy transforms, near/far ownership, unchanged terrain vertex/triangle hashes,
and static-submesh filtering in the celestial and headlight maps.

These are CPU scene/state checks using NullEngine with a raw cube allocation
stub. They are **not GPU performance evidence or a visual approval**. The full
production scene, HUD, mixed avatars and relevant clear/overcast/full-moon
scenarios require the coordinated audit recorded in `docs/verification.md`.

## Reproducible lighting previews

The settings select retains real time as its initial state and the existing
day/night UTC anchors. New golden-hour and blue-hour modes solve the evening
Sun altitude at +3 and -6 degrees on today's Prague date. Full-moon mode finds
the next lunar phase crossing and selects a nearby dark night with the actual
Moon above 10 degrees, Sun below -12 degrees, and illuminated fraction at least
0.985. The exact phase crossing may happen during daytime. A 15-degree lunar
cut would incorrectly reject some summer full moons at Strahov.

These calculations use the existing SunCalc 2.1.1 dependency and shared Strahov
coordinates; the primary [SunCalc documentation](https://github.com/mourner/suncalc)
and installed README/types were checked on 2026-10-12. Preset altitude targets
and the night selection score are UI choices, not measured weather data.

The selected UTC instant is computed only when a user selects a preset and is
then retained in React state/ref. Game startup, sky and the HUD use that same
instant. The preview displays its Prague date/time and a demo label. Weather
data and its source timestamps are not overridden. Returning to real time clears
the override.

```text
pnpm exec tsx --test tests/lighting-preview.test.ts tests/i18n.test.ts
```

Result: **13 tests passed**, 0 failed. Coverage includes actual descending solar
altitudes across seasons and DST changes, real lunar visibility/illumination,
Prague date anchoring under Honolulu/Tokyo device timezones, and translated demo
labels. This does not replace a production-browser layout check.
